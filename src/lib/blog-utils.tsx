import fs from "node:fs/promises";
import path from "node:path";
import { cache } from "react";
import readingTime from "reading-time";
import { z } from "zod";

const BLOG_DIR = path.join(process.cwd(), "src", "content", "blog");
const MDX_EXT = "mdx";
const FOLDER_ENTRY = `page.${MDX_EXT}`;
const IMPORT_PREFIX = "@/content/blog/";

const metadataSchema = z.object({
  title: z.string(),
  date: z.string(),
  author: z.string(),
  summary: z.string(),
  image: z
    .union([z.string(), z.object({ src: z.string() }).passthrough()])
    .optional(),
  twitterImage: z
    .union([z.string(), z.object({ src: z.string() }).passthrough()])
    .optional(),
  tags: z.array(z.string()).optional(),
  updated: z.string().optional(),
  draft: z.boolean().optional(),
});

type BlogPostEntry = {
  slug: string;
  importPath: string;
};

export type BlogPostMetadata = z.infer<typeof metadataSchema>;

export type BlogPost = BlogPostEntry & {
  metadata: BlogPostMetadata;
  date: Date;
  updatedAt?: Date;
  readingTime: string;
  wordCount: number;
};

type StaticImageData = {
  src: string;
  width?: number;
  height?: number;
  blurDataURL?: string;
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
    if (importPath) {
      entries.push({ slug, importPath });
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
    throw new Error(
      `Invalid date "${value}" in blog post "${slug}". Use YYYY-MM-DD or ISO format.`,
    );
  }
  return parsed;
};

const getPostStats = async (importPath: string) => {
  const source = await fs.readFile(path.join(BLOG_DIR, importPath), "utf8");
  const text = stripMetadataExport(source);
  const stats = readingTime(text);
  return { readingTime: stats.text, wordCount: stats.words };
};

export const importBlogPostModule = async <Module = unknown>(
  importPath: string,
) => import(`${IMPORT_PREFIX}${importPath}`) as Promise<Module>;

export const parseBlogPostMetadata = (metadata: unknown) =>
  metadataSchema.parse(metadata);

const isStaticImageData = (value: unknown): value is StaticImageData =>
  typeof value === "object" &&
  value !== null &&
  "src" in value &&
  typeof (value as { src?: unknown }).src === "string";

const isAbsoluteUrl = (value: string) => /^https?:\/\//i.test(value);

export const resolveMetadataImage = (
  image: BlogPostMetadata["image"] | BlogPostMetadata["twitterImage"],
  slug: string,
  fieldName: "image" | "twitterImage",
) => {
  if (!image) return undefined;
  if (typeof image === "string") {
    if (isAbsoluteUrl(image) || image.startsWith("/")) return image;
    throw new Error(
      `Blog post "${slug}" uses a relative metadata.${fieldName} ("${image}"). Import the image or rely on the auto-detected file name.`,
    );
  }
  if (isStaticImageData(image)) return image.src;
  return undefined;
};

export const getBlogPosts = cache(async (): Promise<BlogPost[]> => {
  const entries = await collectEntries();

  const posts = await Promise.all(
    entries.map(async ({ slug, importPath }) => {
      const mod = await importBlogPostModule<{ metadata: unknown }>(importPath);
      const metadata = parseBlogPostMetadata(mod.metadata);
      const stats = await getPostStats(importPath);
      const date = toDate(metadata.date, slug);
      const updatedAt = metadata.updated
        ? toDate(metadata.updated, slug)
        : undefined;

      return {
        slug,
        importPath,
        metadata,
        date,
        updatedAt,
        readingTime: stats.readingTime,
        wordCount: stats.wordCount,
      };
    }),
  );

  return posts
    .filter((post) => !post.metadata.draft)
    .sort((a, b) => b.date.getTime() - a.date.getTime());
});

export const getBlogPost = cache(async (slug: string) => {
  const posts = await getBlogPosts();
  return posts.find((post) => post.slug === slug) ?? null;
});
