import type { MetadataRoute } from "next";

import { publicUrl } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  const canonicalOrigin = new URL(publicUrl("/")).origin;

  return {
    host: canonicalOrigin,
    rules: [
      {
        allow: "/",
        userAgent: "*",
      },
      {
        allow: "/",
        userAgent: ["GPTBot", "ChatGPT-User", "ClaudeBot", "Anthropic-ai"],
      },
    ],
    sitemap: publicUrl("/sitemap.xml"),
  };
}
