import type { Metadata } from "next";
import Link from "next/link";

import { getBlogPosts } from "@/lib/blog-utils";
import { formatDate } from "@/lib/date";
import { siteConfig } from "@/lib/site";

export const metadata: Metadata = {
  title: "Blog",
  description: `Notes on what ${siteConfig.author.name} is building and learning.`,
};

export default async function BlogIndexPage() {
  const posts = await getBlogPosts();

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-16">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Blog
        </h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Notes on what I am building and learning.
        </p>
      </div>
      <ul className="flex flex-col gap-6">
        {posts.length > 0 ? (
          posts.map(({ slug, metadata, date, readingTime }) => (
            <li key={slug} className="flex flex-col gap-1">
              <Link
                href={`/blog/${slug}`}
                className="text-lg font-medium text-blue-600 hover:underline dark:text-blue-400"
              >
                {metadata.title}
              </Link>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                {metadata.summary}
              </p>
              <span className="text-xs text-zinc-500 dark:text-zinc-500">
                <time dateTime={date.toISOString()}>{formatDate(date)}</time> ·{" "}
                {metadata.author} · {readingTime}
              </span>
            </li>
          ))
        ) : (
          <li className="text-sm text-zinc-500 dark:text-zinc-400">
            No posts yet. Check back soon.
          </li>
        )}
      </ul>
    </main>
  );
}
