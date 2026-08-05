import { buildBlogPostMarkdown } from "@/lib/blog-markdown";
import { getBlogPost, getBlogPosts, getBlogPostSource } from "@/lib/blog-utils";
import { publicUrl, siteConfig } from "@/lib/site";

type RouteParams = Promise<{ slug: string }>;

export const dynamic = "force-static";
export const revalidate = 86_400;

export async function generateStaticParams() {
  const posts = await getBlogPosts();
  return posts.map(({ slug }) => ({ slug }));
}

export async function GET(
  _request: Request,
  { params }: { params: RouteParams }
) {
  const { slug } = await params;
  const post = await getBlogPost(slug);

  if (post === null) {
    return new Response("Not found", { status: 404 });
  }

  const body = await getBlogPostSource(post.importPath);
  const canonicalUrl = publicUrl(`/blog/${slug}`);
  const markdown = buildBlogPostMarkdown({ body, canonicalUrl, post });

  return new Response(markdown, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Cache-Control":
        "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
      "Content-Disposition": `inline; filename="${slug}.md"`,
      "Content-Language": siteConfig.language,
      "Content-Type": "text/markdown; charset=utf-8",
      Link: `<${canonicalUrl}>; rel="canonical"`,
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "noindex",
    },
  });
}
