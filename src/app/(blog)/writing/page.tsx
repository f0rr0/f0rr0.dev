import { JsonLd } from "@/components/json-ld";
import { SiteMain } from "@/components/site-page";
import { SiteShell } from "@/components/site-shell";
import { WritingList } from "@/components/writing-list";
import { pages } from "@/content/pages";
import { siteNavigation } from "@/content/site";
import { getBlogPosts } from "@/lib/blog-utils";
import { buildPageMetadata } from "@/lib/page-metadata";
import { publicUrl, siteConfig } from "@/lib/site";
import { buildBlogCollectionJsonLd } from "@/lib/structured-data";

export const metadata = buildPageMetadata(pages.writing);

export default async function BlogIndexPage() {
  const posts = await getBlogPosts();

  return (
    <SiteShell
      activeHref={pages.writing.path}
      askAiContext={{
        label: "My writing",
        title: `${siteConfig.name}’s writing`,
        prompt: `Read ${publicUrl("/llms.txt")} and ${publicUrl(pages.writing.path)}. Help me explore ${siteConfig.name}’s published articles. Recommend an article to start with, then answer my questions using the linked articles as sources. Cite the articles you use and say if you cannot access them.`,
      }}
    >
      <JsonLd data={buildBlogCollectionJsonLd(posts)} />
      <SiteMain>
        <h1 className="sr-only">{siteNavigation.writing.title}</h1>
        <WritingList posts={posts} />
      </SiteMain>
    </SiteShell>
  );
}
