import type { Metadata } from "next";

import { siteNavigation } from "@/content/site";
import type { BlogPost } from "@/lib/blog-utils";
import { publicUrl, siteConfig } from "@/lib/site";

export interface PageMetadataInput {
  title: string;
  description?: string;
  path: string;
  type?: "website" | "profile" | "article";
  image?: { url: string; alt: string; width?: number; height?: number };
  alternates?: Metadata["alternates"];
  robots?: Metadata["robots"];
}

export function buildPageMetadata({
  title: label,
  description = siteConfig.title,
  path,
  type = "website",
  image = siteConfig.shareImage,
  alternates,
  robots,
}: PageMetadataInput) {
  const title = path === "/" ? label : `${label} | ${siteConfig.name}`;
  const images = [{ ...image }];

  return {
    alternates: { ...alternates, canonical: publicUrl(path) },
    description,
    openGraph: {
      description,
      images,
      locale: siteConfig.locale,
      siteName: siteConfig.name,
      title,
      type,
      url: publicUrl(path),
    },
    title: { absolute: title },
    twitter: { card: "summary_large_image", description, images, title },
    ...(robots === undefined ? {} : { robots }),
  } satisfies Metadata;
}

export function buildBlogMetadata(post: BlogPost) {
  const path = `${siteNavigation.writing.path}/${post.slug}`;
  const authorUrl = publicUrl(siteNavigation.journey.path);
  const metadata = buildPageMetadata({
    title: post.metadata.title,
    description: post.metadata.summary,
    path,
    type: "article",
    image: { alt: post.metadata.title, url: publicUrl(`${path}/share-image`) },
    alternates: {
      types: {
        "text/markdown": publicUrl(`${path}.md`),
        "application/rss+xml": publicUrl("/rss.xml"),
      },
    },
  });

  return {
    ...metadata,
    authors: [{ name: post.metadata.author, url: authorUrl }],
    keywords: post.metadata.tags,
    openGraph: {
      ...metadata.openGraph,
      authors: [authorUrl],
      publishedTime: post.date.toISOString(),
      modifiedTime: post.updatedAt?.toISOString(),
    },
  } satisfies Metadata;
}
