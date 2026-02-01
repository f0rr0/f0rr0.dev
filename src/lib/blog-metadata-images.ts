import fs from "node:fs/promises";

import {
  findMetadataImageAsset,
  getBlogPost,
  importMetadataImageModule,
  type MetadataImageKind,
} from "@/lib/blog-utils";

type ImageHandler = (context: {
  params: { slug: string };
}) => Response | Promise<Response>;

export const resolveMetadataImageResponse = async (
  slug: string,
  kind: MetadataImageKind,
) => {
  const post = await getBlogPost(slug);
  if (!post) {
    return new Response("Not found", { status: 404 });
  }

  const asset = await findMetadataImageAsset(post.importPath, kind);
  if (!asset) {
    return new Response("Not found", { status: 404 });
  }

  if (asset.type === "module") {
    const mod = await importMetadataImageModule<{ default?: ImageHandler }>(
      asset.importPath,
    );
    if (typeof mod?.default !== "function") {
      return new Response("Not found", { status: 404 });
    }
    return mod.default({ params: { slug } });
  }

  const buffer = await fs.readFile(asset.filePath);
  return new Response(buffer, {
    headers: {
      "Content-Type": asset.contentType ?? "application/octet-stream",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
};
