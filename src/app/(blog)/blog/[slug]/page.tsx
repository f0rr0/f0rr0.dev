import type { MDXComponents } from "mdx/types";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ComponentType } from "react";

import AuthorCard from "@/components/blog/AuthorCard";
import PostCard from "@/components/blog/PostCard";
import MDXImage from "@/components/mdx/MDXImage";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  findMetadataImageAsset,
  getBlogPost,
  getBlogPosts,
  importBlogPostModule,
} from "@/lib/blog-utils";
import { formatDate } from "@/lib/date";
import { absoluteUrl, siteConfig } from "@/lib/site";

type PageParams = Promise<{ slug: string }>;

interface BlogPostModule {
  default: ComponentType<{ components?: MDXComponents }>;
  metadata: unknown;
}

const getSuggestedPosts = (
  posts: Awaited<ReturnType<typeof getBlogPosts>>,
  currentSlug: string
) => {
  const current = posts.find((post) => post.slug === currentSlug);
  if (current === undefined) {
    return [];
  }
  const currentTags = new Set(current.metadata.tags ?? []);

  return posts
    .filter((post) => post.slug !== currentSlug)
    .map((post) => {
      const tagMatches =
        post.metadata.tags?.filter((tag) => currentTags.has(tag)) ?? [];
      return { post, score: tagMatches.length };
    })
    .toSorted(
      (a, b) =>
        b.score - a.score || b.post.date.getTime() - a.post.date.getTime()
    )
    .slice(0, 3)
    .map(({ post }) => post);
};

export async function generateStaticParams() {
  const posts = await getBlogPosts();
  return posts.map(({ slug }) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: PageParams;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = await getBlogPost(slug);

  if (!post) {
    return {};
  }

  const { metadata, date, updatedAt } = post;
  const url = absoluteUrl(`/blog/${slug}`);
  const ogAsset = await findMetadataImageAsset(post.importPath, "opengraph");
  const twitterAsset = await findMetadataImageAsset(post.importPath, "twitter");
  const ogImageUrl = ogAsset
    ? absoluteUrl(`/blog/${slug}/opengraph-image`)
    : undefined;
  const twitterImageUrl = twitterAsset
    ? absoluteUrl(`/blog/${slug}/twitter-image`)
    : ogImageUrl;

  return {
    alternates: {
      canonical: url,
    },
    description: metadata.summary,
    keywords: metadata.tags,
    openGraph: {
      authors: [metadata.author],
      description: metadata.summary,
      images: ogImageUrl === undefined ? undefined : [{ url: ogImageUrl }],
      locale: siteConfig.locale,
      modifiedTime: updatedAt?.toISOString(),
      publishedTime: date.toISOString(),
      siteName: siteConfig.name,
      title: metadata.title,
      type: "article",
      url,
    },
    title: metadata.title,
    twitter: {
      card: twitterImageUrl === undefined ? "summary" : "summary_large_image",
      description: metadata.summary,
      images: twitterImageUrl === undefined ? undefined : [twitterImageUrl],
      title: metadata.title,
    },
  };
}

export default async function BlogPostPage({ params }: { params: PageParams }) {
  const { slug } = await params;
  const post = await getBlogPost(slug);

  if (!post) {
    notFound();
  }

  const { importPath, metadata, date, updatedAt, readingTime } = post;

  const module = await importBlogPostModule<BlogPostModule>(importPath).catch(
    () => null
  );

  if (module?.default === undefined) {
    notFound();
  }

  const Content = module.default;
  const url = absoluteUrl(`/blog/${slug}`);
  const suggestedPosts = getSuggestedPosts(await getBlogPosts(), slug);

  const ogAsset = await findMetadataImageAsset(importPath, "opengraph");
  const resolvedImageUrl = ogAsset
    ? absoluteUrl(`/blog/${slug}/opengraph-image`)
    : undefined;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    author: {
      "@type": "Person",
      name: metadata.author,
    },
    dateModified: (updatedAt ?? date).toISOString(),
    datePublished: date.toISOString(),
    description: metadata.summary,
    headline: metadata.title,
    image: resolvedImageUrl === undefined ? undefined : [resolvedImageUrl],
    keywords: metadata.tags?.join(", "),
    mainEntityOfPage: url,
    url,
  };

  const mdxComponents = {
    Image: (props) => <MDXImage {...props} />,
    img: (props) => <MDXImage {...props} />,
  } satisfies MDXComponents;

  return (
    <article className="relative">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-12 px-6 py-16">
        <header className="flex flex-col gap-6">
          {metadata.tags !== undefined && metadata.tags.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {metadata.tags.map((tag) => (
                <Badge key={tag} variant="secondary">
                  {tag}
                </Badge>
              ))}
            </div>
          ) : null}
          <div className="space-y-4">
            <h1 className="text-balance text-4xl font-semibold tracking-tight md:text-5xl">
              {metadata.title}
            </h1>
            <p className="max-w-3xl text-base text-muted-foreground md:text-lg">
              {metadata.summary}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span>
              <time dateTime={date.toISOString()}>{formatDate(date)}</time>
            </span>
            <Separator orientation="vertical" className="h-4" />
            <span>{metadata.author}</span>
            <Separator orientation="vertical" className="h-4" />
            <span>{readingTime}</span>
            <Separator orientation="vertical" className="h-4" />
            <span>{post.wordCount.toLocaleString()} words</span>
            {updatedAt === undefined ? null : (
              <>
                <Separator orientation="vertical" className="h-4" />
                <span>Updated {formatDate(updatedAt)}</span>
              </>
            )}
          </div>
        </header>
        <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div className="prose prose-neutral max-w-[70ch] dark:prose-invert prose-headings:scroll-mt-24 prose-h2:text-2xl prose-h3:text-xl prose-lead:text-muted-foreground prose-a:text-foreground/90 prose-strong:text-foreground prose-p:leading-relaxed prose-li:marker:text-muted-foreground/70">
            <Content components={mdxComponents} />
          </div>
          <aside className="space-y-6 lg:sticky lg:top-24">
            <AuthorCard />
            <div className="rounded-xl border border-border/70 bg-muted/40 p-5 text-sm text-muted-foreground">
              Want more like this? New posts land weekly with experiments and
              craft notes.
            </div>
          </aside>
        </div>
        {suggestedPosts.length > 0 ? (
          <section className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold tracking-tight">
                Suggested next posts
              </h2>
            </div>
            <div className="grid gap-6 md:grid-cols-3">
              {suggestedPosts.map((suggested) => (
                <PostCard key={suggested.slug} post={suggested} />
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </article>
  );
}
