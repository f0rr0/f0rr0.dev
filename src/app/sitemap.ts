import type { MetadataRoute } from "next";

import { resumeData } from "@/content/resume";
import { tokenPreferences } from "@/content/tokens";
import { getBlogPosts } from "@/lib/blog-utils";
import { publicUrl, resumePdfUrl } from "@/lib/site";

const newestDate = (dates: Date[]) =>
  dates.toSorted((a, b) => b.getTime() - a.getTime()).at(0);

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const posts = await getBlogPosts();
  const resumeUpdatedAt = new Date(resumeData.lastUpdated);
  const latestPostDate =
    newestDate(posts.map((post) => post.updatedAt ?? post.date)) ??
    resumeUpdatedAt;
  const siteUpdatedAt =
    newestDate([resumeUpdatedAt, latestPostDate]) ?? resumeUpdatedAt;

  return [
    ...(tokenPreferences.enabled ? [{ url: publicUrl("/tokens") }] : []),
    {
      lastModified: siteUpdatedAt,
      url: publicUrl("/"),
    },
    {
      lastModified: resumeUpdatedAt,
      url: publicUrl("/journey"),
    },
    {
      url: publicUrl("/work"),
    },
    {
      lastModified: resumeUpdatedAt,
      url: publicUrl(resumePdfUrl),
    },
    {
      lastModified: latestPostDate,
      url: publicUrl("/writing"),
    },
    ...posts.map((post) => ({
      lastModified: post.updatedAt ?? post.date,
      url: publicUrl(`/writing/${post.slug}`),
    })),
  ];
}
