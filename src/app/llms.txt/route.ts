import { getBlogPosts } from "@/lib/blog-utils";
import { buildLlmsTxt } from "@/lib/resume";

export const dynamic = "force-static";
export const revalidate = 86_400;

export async function GET() {
  const posts = await getBlogPosts();

  return new Response(buildLlmsTxt(posts), {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Cache-Control":
        "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
      "Content-Type": "text/plain; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
