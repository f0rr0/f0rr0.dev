import { resolveMetadataImageResponse } from "@/lib/blog-metadata-images";

export const runtime = "nodejs";

export default async function Image({
  params,
}: {
  params: Promise<{ slug: string }> | { slug: string };
}) {
  const resolvedParams = await params;
  return resolveMetadataImageResponse(resolvedParams.slug, "twitter");
}
