import type { MDXComponents } from "mdx/types";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ComponentType } from "react";

import { ArticleAnalytics } from "@/components/blog/article-analytics";
import { ArticleProse } from "@/components/blog/article-prose";
import { BlogPostActions } from "@/components/blog/blog-post-actions";
import { JsonLd } from "@/components/json-ld";
import MDXImage from "@/components/mdx/MDXImage";
import { SiteMain } from "@/components/site-page";
import { SiteShell } from "@/components/site-shell";
import { Separator } from "@/components/ui/separator";
import { siteNavigation } from "@/content/site";
import { buildAskAiPrompt } from "@/lib/ask-ai";
import {
  getBlogPost,
  getBlogPosts,
  importBlogPostModule,
} from "@/lib/blog-utils";
import { formatDate } from "@/lib/date";
import { buildBlogMetadata } from "@/lib/page-metadata";
import { publicUrl } from "@/lib/site";
import { buildBlogPostingJsonLd } from "@/lib/structured-data";

type PageParams = Promise<{ slug: string }>;

interface BlogPostModule {
  default: ComponentType<{ components?: MDXComponents }>;
  metadata: unknown;
}

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

  return buildBlogMetadata(post);
}

export default async function BlogPostPage({ params }: { params: PageParams }) {
  const { slug } = await params;
  const post = await getBlogPost(slug);

  if (!post) {
    notFound();
  }

  const { importPath, metadata, date, readingTime } = post;

  const module = await importBlogPostModule<BlogPostModule>(importPath).catch(
    () => null
  );

  if (module?.default === undefined) {
    notFound();
  }

  const Content = module.default;
  const jsonLd = buildBlogPostingJsonLd(post);

  const mdxComponents = {
    Image: (props) => <MDXImage {...props} />,
    img: (props) => <MDXImage {...props} />,
  } satisfies MDXComponents;

  return (
    <SiteShell
      activeHref={siteNavigation.writing.path}
      askAiContext={{
        label: "This article",
        title: metadata.title,
        prompt: buildAskAiPrompt({
          title: metadata.title,
          sourceUrl: publicUrl(`/writing/${slug}.md`),
        }),
      }}
    >
      <SiteMain className="relative">
        <JsonLd data={jsonLd} />
        <article className="flex flex-col gap-8">
          <header className="flex flex-col">
            <h1 className="section-title mb-4 font-serif text-2xl font-normal text-foreground text-balance">
              {metadata.title}
            </h1>
            <div
              className="flex items-center justify-between gap-3 border-y border-border whitespace-nowrap"
              data-slot="blog-post-rail"
            >
              <div className="flex min-h-11 shrink-0 items-center gap-2 text-xs text-muted-foreground sm:gap-3">
                <time dateTime={date.toISOString()}>{formatDate(date)}</time>
                <Separator orientation="vertical" />
                <span>{readingTime}</span>
              </div>
              <BlogPostActions markdownHref={`/writing/${slug}.md`} />
            </div>
          </header>
          <ArticleAnalytics slug={slug} />
          <ArticleProse>
            <Content components={mdxComponents} />
          </ArticleProse>
        </article>
      </SiteMain>
    </SiteShell>
  );
}
