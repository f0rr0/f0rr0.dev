import type { MetadataRoute } from "next";

import { getBlogPosts } from "@/lib/blog-utils";
import { absoluteUrl, siteConfig } from "@/lib/site";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const posts = await getBlogPosts();
  const now = new Date();

  return [
    {
      url: siteConfig.url,
      lastModified: now,
    },
    {
      url: absoluteUrl("/blog"),
      lastModified: posts[0]?.updatedAt ?? posts[0]?.date ?? now,
    },
    ...posts.map((post) => ({
      url: absoluteUrl(`/blog/${post.slug}`),
      lastModified: post.updatedAt ?? post.date,
    })),
  ];
}
