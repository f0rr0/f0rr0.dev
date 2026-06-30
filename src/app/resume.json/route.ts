import { buildJsonResume } from "@/lib/resume";

export const dynamic = "force-static";
export const revalidate = 86_400;

export function GET() {
  return Response.json(buildJsonResume(), {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Cache-Control":
        "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
