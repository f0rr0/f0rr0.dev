import path from "node:path";
import createMDX from "@next/mdx";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  typescript: {
    ignoreBuildErrors: true,
  },
  outputFileTracingIncludes: {
    "/blog/[slug]/opengraph-image": ["./src/content/**/*"],
    "/blog/[slug]/twitter-image": ["./src/content/**/*"],
  },
};

const withMDX = createMDX({
  options: {
    remarkPlugins: [
      path.join(process.cwd(), "src/lib/remark-static-image-imports.mjs"),
      path.join(process.cwd(), "src/lib/remark-mermaid.mjs"),
      "remark-gfm",
    ],
    rehypePlugins: [
      "rehype-slug",
      [
        "rehype-autolink-headings",
        {
          behavior: "wrap",
          properties: {
            className: ["heading-anchor"],
          },
        },
      ],
      [
        "rehype-pretty-code",
        {
          theme: {
            light: "github-light",
            dark: "github-dark",
          },
          keepBackground: false,
        },
      ],
    ],
  },
});

export default withMDX(nextConfig);
