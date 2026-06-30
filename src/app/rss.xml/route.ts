import { Feed } from "feed";

import { getBlogPosts } from "@/lib/blog-utils";
import { publicUrl, siteConfig } from "@/lib/site";

export const dynamic = "force-static";
export const revalidate = 3600;

const newestDate = (dates: Date[]) =>
  dates.toSorted((a, b) => b.getTime() - a.getTime()).at(0);

export async function GET() {
  const posts = await getBlogPosts();
  const updated = newestDate(posts.map((post) => post.updatedAt ?? post.date));

  const feed = new Feed({
    author: {
      name: siteConfig.author.name,
    },
    copyright: `© ${new Date().getFullYear()} ${siteConfig.name}`,
    description: siteConfig.description,
    favicon: publicUrl("/favicon.ico"),
    feedLinks: {
      rss2: publicUrl("/rss.xml"),
    },
    generator: "Next.js",
    id: publicUrl("/"),
    language: siteConfig.language,
    link: publicUrl("/"),
    title: siteConfig.name,
    updated: updated ?? new Date(),
  });

  for (const post of posts) {
    const url = publicUrl(`/blog/${post.slug}`);
    feed.addItem({
      author: [{ name: post.metadata.author }],
      category: post.metadata.tags?.map((tag) => ({ name: tag })),
      date: post.date,
      description: post.metadata.summary,
      id: url,
      link: url,
      title: post.metadata.title,
    });
  }

  return new Response(feed.rss2(), {
    headers: {
      "Cache-Control":
        "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400",
      "Content-Type": "application/rss+xml; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
