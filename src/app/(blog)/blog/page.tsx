import { Rss } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { JsonLd } from "@/components/json-ld";
import { SiteActionLink } from "@/components/site-action-link";
import { SitePage } from "@/components/site-page";
import { getBlogPosts } from "@/lib/blog-utils";
import { formatDate } from "@/lib/date";
import { publicUrl, siteConfig } from "@/lib/site";
import { buildBlogCollectionJsonLd } from "@/lib/structured-data";

const description = `Notes on what ${siteConfig.author.name} is building and learning.`;

export const metadata: Metadata = {
  alternates: {
    canonical: "/blog",
    types: {
      "application/rss+xml": "/rss.xml",
    },
  },
  description,
  openGraph: {
    description,
    locale: siteConfig.locale,
    siteName: siteConfig.name,
    title: "Sid Jain Blog",
    type: "website",
    url: publicUrl("/blog"),
  },
  title: "Blog",
  twitter: {
    card: "summary",
    description,
    title: "Sid Jain Blog",
  },
};

export default async function BlogIndexPage() {
  const posts = await getBlogPosts();

  return (
    <>
      <JsonLd data={buildBlogCollectionJsonLd(posts)} />
      <SitePage
        title="Blog"
        action={
          <SiteActionLink
            href="/rss.xml"
            icon={<Rss aria-hidden="true" className="h-3.5 w-3.5" />}
          >
            RSS
          </SiteActionLink>
        }
      >
        {posts.length > 0 ? (
          <ol className="divide-y divide-border border-y border-border">
            {posts.map((post) => (
              <li key={post.slug}>
                <Link
                  href={`/blog/${post.slug}`}
                  className="group flex flex-col gap-1 py-5 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring sm:flex-row sm:items-baseline sm:justify-between sm:gap-6"
                >
                  <h2 className="font-serif text-xl font-bold tracking-tight transition-colors group-hover:text-brand-hover">
                    {post.metadata.title}
                  </h2>
                  <time
                    dateTime={post.date.toISOString()}
                    className="shrink-0 text-sm text-muted-foreground"
                  >
                    {formatDate(post.date, siteConfig.language)}
                  </time>
                </Link>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-muted-foreground">No posts yet.</p>
        )}
      </SitePage>
    </>
  );
}
