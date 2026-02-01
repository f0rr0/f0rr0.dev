import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ComponentType } from "react";

import {
  getBlogPost,
  getBlogPosts,
  importBlogPostModule,
  getContentAssetBasePath,
  resolveContentAssetPath,
} from "@/lib/blog-utils";
import { formatDate } from "@/lib/date";
import { absoluteUrl, siteConfig } from "@/lib/site";
import MDXContent from "@/components/mdx/MDXContent";

type PageParams = { slug: string };

type BlogPostModule = {
  default: ComponentType;
  metadata: unknown;
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
  const { slug } = params;
  const post = await getBlogPost(slug);

  if (!post) return {};

  const { metadata, date, updatedAt } = post;
  const url = absoluteUrl(`/blog/${slug}`);
  const ogImage = metadata.image
    ? absoluteUrl(resolveContentAssetPath(post.importPath, metadata.image))
    : undefined;

  return {
    title: metadata.title,
    description: metadata.summary,
    keywords: metadata.tags,
    alternates: {
      canonical: url,
    },
    openGraph: {
      type: "article",
      title: metadata.title,
      description: metadata.summary,
      url,
      siteName: siteConfig.name,
      locale: siteConfig.locale,
      publishedTime: date.toISOString(),
      modifiedTime: updatedAt?.toISOString(),
      authors: [metadata.author],
      images: ogImage ? [{ url: ogImage }] : undefined,
    },
    twitter: {
      card: ogImage ? "summary_large_image" : "summary",
      title: metadata.title,
      description: metadata.summary,
      images: ogImage ? [ogImage] : undefined,
    },
  };
}

export default async function BlogPostPage({ params }: { params: PageParams }) {
  const { slug } = params;
  const post = await getBlogPost(slug);

  if (!post) notFound();

  const { importPath, metadata, date, updatedAt, readingTime } = post;

  const module = (await importBlogPostModule<BlogPostModule>(importPath).catch(
    () => null,
  )) as BlogPostModule | null;

  if (!module?.default) notFound();

  const Content = module.default;
  const url = absoluteUrl(`/blog/${slug}`);
  const assetBasePath = getContentAssetBasePath(importPath);

  const resolvedImage = metadata.image
    ? absoluteUrl(resolveContentAssetPath(importPath, metadata.image))
    : undefined;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: metadata.title,
    description: metadata.summary,
    keywords: metadata.tags?.join(", "),
    datePublished: date.toISOString(),
    dateModified: (updatedAt ?? date).toISOString(),
    author: {
      "@type": "Person",
      name: metadata.author,
    },
    url,
    mainEntityOfPage: url,
    image: resolvedImage ? [resolvedImage] : undefined,
  };

  return (
    <article className="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-16">
      <script
        type="application/ld+json"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: JSON-LD is required for SEO.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <header className="flex flex-col gap-3">
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          {metadata.title}
        </h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {metadata.summary}
        </p>
        <p className="text-xs text-zinc-500 dark:text-zinc-500">
          <time dateTime={date.toISOString()}>{formatDate(date)}</time> ·{" "}
          {metadata.author} · {readingTime}
        </p>
      </header>
      <div className="prose prose-zinc dark:prose-invert">
        <MDXContent assetBasePath={assetBasePath}>
          <Content />
        </MDXContent>
      </div>
    </article>
  );
}
