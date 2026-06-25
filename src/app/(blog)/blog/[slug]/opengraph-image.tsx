import { resolveMetadataImageResponse } from "@/lib/blog-metadata-images";

export const runtime = "nodejs";

export default async function Image({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const resolvedParams = await params;
  return await resolveMetadataImageResponse(resolvedParams.slug, "opengraph");
}
