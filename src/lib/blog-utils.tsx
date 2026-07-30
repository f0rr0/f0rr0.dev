import fs from "node:fs/promises";
import path from "node:path";

import { cache } from "react";
import readingTime from "reading-time";
import { z } from "zod";

import { env } from "@/env";

const BLOG_DIR = path.join(process.cwd(), "src", "content", "blog");
const MDX_EXT = "mdx";
const FOLDER_ENTRY = `page.${MDX_EXT}`;
const shouldShowDraftPosts =
  env.NODE_ENV === "development" ||
  env.VERCEL_ENV === "development" ||
  env.VERCEL_ENV === "preview";

const metadataSchema = z.object({
  author: z.string(),
  date: z.string(),
  draft: z.boolean().optional(),
  summary: z.string(),
  tags: z.array(z.string()).optional(),
  title: z.string(),
  updated: z.string().optional(),
});

interface BlogPostEntry {
  slug: string;
  importPath: string;
}

export type BlogPostMetadata = z.infer<typeof metadataSchema>;

export type BlogPost = BlogPostEntry & {
  metadata: BlogPostMetadata;
  date: Date;
  updatedAt?: Date;
  readingTime: string;
  wordCount: number;
};

const hasFile = async (relativePath: string) => {
  try {
    await fs.access(path.join(BLOG_DIR, relativePath));
    return true;
  } catch {
    return false;
  }
};

const slugFromFilename = (filename: string) => filename.replace(/\.mdx$/, "");

const importCandidates = (slug: string) => [
  `${slug}/${FOLDER_ENTRY}`,
  `${slug}.${MDX_EXT}`,
];

export const resolveImportPathForSlug = async (slug: string) => {
  for (const candidate of importCandidates(slug)) {
    if (await hasFile(candidate)) {
      return candidate;
    }
  }

  return null;
};

const collectEntries = async () => {
  const dirents = await fs.readdir(BLOG_DIR, { withFileTypes: true });
  const slugs = new Set<string>();

  for (const entry of dirents) {
    if (entry.isFile() && entry.name.endsWith(`.${MDX_EXT}`)) {
      slugs.add(slugFromFilename(entry.name));
    } else if (entry.isDirectory()) {
      slugs.add(entry.name);
    }
  }

  const entries: BlogPostEntry[] = [];

  for (const slug of slugs) {
    const importPath = await resolveImportPathForSlug(slug);
    if (importPath !== null) {
      entries.push({ importPath, slug });
    }
  }

  return entries;
};

const stripMetadataExport = (source: string) =>
  source
    .replace(/export const metadata = \{[\s\S]*?^[\t ]*\};?\s*/m, "")
    .trim();

const toDate = (value: string, slug: string) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new TypeError(
      `Invalid date "${value}" in blog post "${slug}". Use YYYY-MM-DD or ISO format.`
    );
  }
  return parsed;
};

const getPostStats = async (importPath: string) => {
  const source = await fs.readFile(path.join(BLOG_DIR, importPath), "utf-8");
  const text = stripMetadataExport(source);
  const stats = readingTime(text);
  return { readingTime: stats.text, wordCount: stats.words };
};

export const importBlogPostModule = async <Module = unknown,>(
  importPath: string
) => await (import(`@/content/blog/${importPath}`) as Promise<Module>);

export const importMetadataImageModule = async <Module = unknown,>(
  importPath: string
) => await (import(`@/content/blog/${importPath}`) as Promise<Module>);

export const parseBlogPostMetadata = (metadata: unknown) =>
  metadataSchema.parse(metadata);

const METADATA_IMAGE_EXTENSIONS = [
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".avif",
  ".gif",
];
const METADATA_IMAGE_MODULE_EXTENSIONS = [".tsx", ".ts", ".jsx", ".js"];

export type MetadataImageKind = "opengraph" | "twitter";

export interface MetadataImageAsset {
  kind: MetadataImageKind;
  type: "module" | "file";
  filePath: string;
  importPath: string;
  contentType?: string;
}

const toPosixPath = (value: string) => value.split(path.sep).join("/");

const contentTypeForExtension = (extension: string) => {
  switch (extension) {
    case ".png": {
      return "image/png";
    }
    case ".jpg":
    case ".jpeg": {
      return "image/jpeg";
    }
    case ".webp": {
      return "image/webp";
    }
    case ".avif": {
      return "image/avif";
    }
    case ".gif": {
      return "image/gif";
    }
    default: {
      return "application/octet-stream";
    }
  }
};

const metadataImageBaseName = (kind: MetadataImageKind) =>
  kind === "opengraph" ? "opengraph-image" : "twitter-image";

const getContentDirForImportPath = (importPath: string) =>
  path.dirname(path.join(BLOG_DIR, importPath));

const fileExists = async (filePath: string) => {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
};

export const findMetadataImageAsset = async (
  importPath: string,
  kind: MetadataImageKind
): Promise<MetadataImageAsset | null> => {
  const baseName = metadataImageBaseName(kind);
  const contentDir = getContentDirForImportPath(importPath);

  for (const extension of METADATA_IMAGE_MODULE_EXTENSIONS) {
    const filePath = path.join(contentDir, `${baseName}${extension}`);
    if (await fileExists(filePath)) {
      return {
        filePath,
        importPath: toPosixPath(path.relative(BLOG_DIR, filePath)),
        kind,
        type: "module",
      };
    }
  }

  for (const extension of METADATA_IMAGE_EXTENSIONS) {
    const filePath = path.join(contentDir, `${baseName}${extension}`);
    if (await fileExists(filePath)) {
      return {
        contentType: contentTypeForExtension(extension),
        filePath,
        importPath: toPosixPath(path.relative(BLOG_DIR, filePath)),
        kind,
        type: "file",
      };
    }
  }

  return null;
};

export const getBlogPosts = cache(async (): Promise<BlogPost[]> => {
  const entries = await collectEntries();

  const posts = await Promise.all(
    entries.map(async ({ slug, importPath }) => {
      const mod = await importBlogPostModule<{ metadata: unknown }>(importPath);
      const metadata = parseBlogPostMetadata(mod.metadata);
      const stats = await getPostStats(importPath);
      const date = toDate(metadata.date, slug);
      const updatedAt =
        metadata.updated === undefined
          ? undefined
          : toDate(metadata.updated, slug);

      return {
        date,
        importPath,
        metadata,
        readingTime: stats.readingTime,
        slug,
        updatedAt,
        wordCount: stats.wordCount,
      };
    })
  );

  return posts
    .filter((post) => shouldShowDraftPosts || post.metadata.draft !== true)
    .toSorted((a, b) => b.date.getTime() - a.date.getTime());
});

export const getBlogPost = cache(async (slug: string) => {
  const posts = await getBlogPosts();
  return posts.find((post) => post.slug === slug) ?? null;
});
