import { ImageResponse } from "next/og";

import type { BlogPostMetadata } from "@/lib/blog-utils";
import { siteConfig } from "@/lib/site";

export const renderBlogShareImage = (metadata: BlogPostMetadata) =>
  new ImageResponse(
    <div
      style={{
        background: "#faf9f6",
        color: "#292524",
        display: "flex",
        flexDirection: "column",
        height: "100%",
        justifyContent: "space-between",
        padding: "72px 82px",
        width: "100%",
      }}
    >
      <div
        style={{
          display: "flex",
          fontSize: 25,
          justifyContent: "space-between",
        }}
      >
        <span>{metadata.author}</span>
        <span style={{ color: "#78716c" }}>
          {new URL(siteConfig.url).hostname}
        </span>
      </div>
      <div
        style={{
          borderLeft: "5px solid #b45309",
          display: "flex",
          fontSize: 64,
          fontWeight: 700,
          letterSpacing: "-0.035em",
          lineHeight: 1.12,
          paddingLeft: 32,
          textWrap: "balance",
        }}
      >
        {metadata.title}
      </div>
      <div style={{ color: "#78716c", display: "flex", fontSize: 22 }}>
        {metadata.date.slice(0, 4)} | Personal notes
      </div>
    </div>,
    { height: 630, width: 1200 }
  );
