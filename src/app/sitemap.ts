import type { MetadataRoute } from "next";

import { getBlogPosts } from "@/lib/blog-utils";
import { absoluteUrl, siteConfig } from "@/lib/site";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const posts = await getBlogPosts();
  const now = new Date();

  return [
    {
      lastModified: now,
      url: siteConfig.url,
    },
    {
      lastModified: posts[0]?.updatedAt ?? posts[0]?.date ?? now,
      url: absoluteUrl("/blog"),
    },
    ...posts.map((post) => ({
      lastModified: post.updatedAt ?? post.date,
      url: absoluteUrl(`/blog/${post.slug}`),
    })),
  ];
}
