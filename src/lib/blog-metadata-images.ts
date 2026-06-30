import fs from "node:fs/promises";

import {
  findMetadataImageAsset,
  getBlogPost,
  importMetadataImageModule,
} from "@/lib/blog-utils";
import type { MetadataImageKind } from "@/lib/blog-utils";

type ImageHandler = (context: {
  params: { slug: string };
}) => Response | Promise<Response>;

interface ImageRouteMetadata {
  alt: string;
  contentType?: string;
  id: string;
}

const getMetadataImageAssetForSlug = async (
  slug: string,
  kind: MetadataImageKind
) => {
  const post = await getBlogPost(slug);
  if (!post) {
    return null;
  }

  const asset = await findMetadataImageAsset(post.importPath, kind);
  if (!asset) {
    return null;
  }

  return { asset, post };
};

export const getMetadataImageRouteMetadata = async (
  slug: string,
  kind: MetadataImageKind
): Promise<ImageRouteMetadata[]> => {
  const result = await getMetadataImageAssetForSlug(slug, kind);
  if (!result) {
    return [];
  }

  return [
    {
      alt: result.post.metadata.title,
      contentType: result.asset.contentType,
      id: kind,
    },
  ];
};

export const resolveMetadataImageResponse = async (
  slug: string,
  kind: MetadataImageKind
) => {
  const result = await getMetadataImageAssetForSlug(slug, kind);
  if (!result) {
    return new Response("Not found", { status: 404 });
  }
  const { asset } = result;

  if (asset.type === "module") {
    const mod = await importMetadataImageModule<{ default?: ImageHandler }>(
      asset.importPath
    );
    if (typeof mod?.default !== "function") {
      return new Response("Not found", { status: 404 });
    }
    return await mod.default({ params: { slug } });
  }

  const buffer = await fs.readFile(asset.filePath);
  return new Response(buffer, {
    headers: {
      "Cache-Control": "public, max-age=31536000, immutable",
      "Content-Type": asset.contentType ?? "application/octet-stream",
    },
  });
};
