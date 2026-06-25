import { Feed } from "feed";

import { getBlogPosts } from "@/lib/blog-utils";
import { absoluteUrl, siteConfig } from "@/lib/site";

export const dynamic = "force-static";

export async function GET() {
  const posts = await getBlogPosts();

  const feed = new Feed({
    author: {
      name: siteConfig.author.name,
    },
    copyright: `© ${new Date().getFullYear()} ${siteConfig.name}`,
    description: siteConfig.description,
    favicon: absoluteUrl("/favicon.ico"),
    feedLinks: {
      rss2: absoluteUrl("/rss.xml"),
    },
    generator: "Next.js",
    id: siteConfig.url,
    language: siteConfig.language,
    link: siteConfig.url,
    title: siteConfig.name,
    updated: posts[0]?.date ?? new Date(),
  });

  for (const post of posts) {
    const url = absoluteUrl(`/blog/${post.slug}`);
    feed.addItem({
      author: [{ name: post.metadata.author }],
      date: post.date,
      description: post.metadata.summary,
      id: url,
      link: url,
      title: post.metadata.title,
    });
  }

  return new Response(feed.rss2(), {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
    },
  });
}
