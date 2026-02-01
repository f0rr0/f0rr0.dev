import { Feed } from "feed";

import { getBlogPosts } from "@/lib/blog-utils";
import { absoluteUrl, siteConfig } from "@/lib/site";

export const dynamic = "force-static";

export async function GET() {
  const posts = await getBlogPosts();

  const feed = new Feed({
    title: siteConfig.name,
    description: siteConfig.description,
    id: siteConfig.url,
    link: siteConfig.url,
    language: siteConfig.language,
    favicon: absoluteUrl("/favicon.ico"),
    updated: posts[0]?.date ?? new Date(),
    generator: "Next.js",
    copyright: `© ${new Date().getFullYear()} ${siteConfig.name}`,
    feedLinks: {
      rss2: absoluteUrl("/rss.xml"),
    },
    author: {
      name: siteConfig.author.name,
    },
  });

  for (const post of posts) {
    const url = absoluteUrl(`/blog/${post.slug}`);
    feed.addItem({
      title: post.metadata.title,
      id: url,
      link: url,
      description: post.metadata.summary,
      date: post.date,
      author: [{ name: post.metadata.author }],
    });
  }

  return new Response(feed.rss2(), {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
    },
  });
}
