import fs from "node:fs/promises";
import path from "node:path";
import { lookup as lookupMime } from "mime-types";
import type { NextRequest } from "next/server";

const CONTENT_ROOT = path.join(process.cwd(), "src", "content");
const CONTENT_ROOT_PREFIX = path.normalize(`${CONTENT_ROOT}${path.sep}`);
const ALLOWED_EXTENSIONS = new Set([
  ".avif",
  ".gif",
  ".jpeg",
  ".jpg",
  ".mp4",
  ".pdf",
  ".png",
  ".svg",
  ".webm",
  ".webp",
]);

export const runtime = "nodejs";

const safeJoin = (segments: string[]) => {
  const resolvedPath = path.join(CONTENT_ROOT, ...segments);
  const normalized = path.normalize(resolvedPath);
  if (!normalized.startsWith(CONTENT_ROOT_PREFIX)) {
    return null;
  }
  return normalized;
};

export async function GET(
  _request: NextRequest,
  { params }: { params: { path: string[] } },
) {
  const filePath = safeJoin(params.path ?? []);

  if (!filePath) {
    return new Response("Not found", { status: 404 });
  }

  try {
    const extension = path.extname(filePath).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(extension)) {
      return new Response("Not found", { status: 404 });
    }

    const buffer = await fs.readFile(filePath);
    const contentType = lookupMime(filePath) || "application/octet-stream";

    return new Response(buffer, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
