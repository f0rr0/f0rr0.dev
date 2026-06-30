import type { MetadataRoute } from "next";

import { resumeData } from "@/content/resume";
import { getBlogPosts } from "@/lib/blog-utils";
import { publicUrl } from "@/lib/site";

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
    {
      changeFrequency: "weekly",
      lastModified: siteUpdatedAt,
      priority: 1,
      url: publicUrl("/"),
    },
    {
      changeFrequency: "monthly",
      lastModified: resumeUpdatedAt,
      priority: 0.9,
      url: publicUrl("/resume"),
    },
    {
      changeFrequency: "weekly",
      lastModified: resumeUpdatedAt,
      priority: 0.8,
      url: publicUrl("/llms.txt"),
    },
    {
      changeFrequency: "monthly",
      lastModified: resumeUpdatedAt,
      priority: 0.6,
      url: publicUrl("/resume.json"),
    },
    {
      changeFrequency: "monthly",
      lastModified: resumeUpdatedAt,
      priority: 0.7,
      url: publicUrl("/resume/sid-jain-resume.pdf"),
    },
    {
      changeFrequency: "weekly",
      lastModified: latestPostDate,
      priority: 0.8,
      url: publicUrl("/blog"),
    },
    ...posts.map((post) => ({
      changeFrequency: "monthly" as const,
      lastModified: post.updatedAt ?? post.date,
      priority: 0.7,
      url: publicUrl(`/blog/${post.slug}`),
    })),
  ];
}
