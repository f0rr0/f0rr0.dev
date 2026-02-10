import type { Metadata } from "next";

import PostCard from "@/components/blog/PostCard";
import { Separator } from "@/components/ui/separator";
import { getBlogPosts } from "@/lib/blog-utils";
import { siteConfig } from "@/lib/site";

export const metadata: Metadata = {
  title: "Blog",
  description: `Notes on what ${siteConfig.author.name} is building and learning.`,
};

export default async function BlogIndexPage() {
  const posts = await getBlogPosts();
  const [featured, ...rest] = posts;

  return (
    <main className="relative">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top,rgba(120,120,120,0.12),transparent_55%)]" />
      <section className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-6 py-16">
        <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-end">
          <div className="space-y-6">
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-muted-foreground">
                Journal
              </p>
              <h1 className="text-balance text-4xl font-semibold tracking-tight md:text-5xl">
                Writing about craft, experiments, and what I am learning.
              </h1>
              <p className="max-w-xl text-base text-muted-foreground md:text-lg">
                Notes on what {siteConfig.author.name} is building across
                product design, engineering, and creative development.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              <span>{posts.length} posts</span>
              <Separator orientation="vertical" className="h-4" />
              <span>New notes as they land</span>
              <Separator orientation="vertical" className="h-4" />
              <span>Deep dives + quick notes</span>
            </div>
          </div>
          {featured ? (
            <PostCard post={featured} variant="featured" />
          ) : (
            <div className="rounded-xl border border-dashed border-border/70 p-10 text-sm text-muted-foreground">
              First post coming soon.
            </div>
          )}
        </div>
      </section>
      <section className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 pb-20">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold tracking-tight">
            Latest writing
          </h2>
        </div>
        {rest.length > 0 ? (
          <div className="grid gap-6 md:grid-cols-2">
            {rest.map((post) => (
              <PostCard key={post.slug} post={post} />
            ))}
          </div>
        ) : posts.length > 0 ? (
          <p className="text-sm text-muted-foreground">
            More posts are on the way. In the meantime, check back soon.
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            No posts yet. Check back soon.
          </p>
        )}
      </section>
    </main>
  );
}
