import "./src/env";
import createMDX from "@next/mdx";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    useTypeScriptCli: true,
  },
  images: {
    localPatterns: [
      {
        pathname: "/**",
        search: "",
      },
      {
        pathname: "/resume/face-motion/v12/**",
        search: "?rev=20260813d",
      },
    ],
  },
  outputFileTracingExcludes: {
    "/*": ["./next.config.ts"],
  },
  outputFileTracingIncludes: {
    "/blog/[slug]": ["./src/content/**/*"],
    "/blog/[slug]/markdown": ["./src/content/**/*"],
    "/blog/[slug]/opengraph-image": ["./src/content/**/*"],
    "/blog/[slug]/share-image": ["./src/content/**/*"],
    "/blog/[slug]/twitter-image": ["./src/content/**/*"],
    "/llms.txt": ["./src/content/**/*"],
    "/rss.xml": ["./src/content/**/*"],
    "/sitemap.xml": ["./src/content/**/*"],
  },
  headers: async () => [
    {
      headers: [
        {
          key: "Cache-Control",
          value: "public, max-age=31536000, immutable",
        },
      ],
      source: "/resume/face-motion/:asset*",
    },
  ],
  reactCompiler: true,
  rewrites: async () => [
    {
      destination: "/blog/:slug/markdown",
      source: "/blog/:slug.md",
    },
  ],
};

const remarkStaticImageImports = new URL(
  "src/lib/remark-static-image-imports.mjs",
  import.meta.url
).pathname;
const remarkMermaid = new URL("src/lib/remark-mermaid.mjs", import.meta.url)
  .pathname;
const remarkEmbedGitHub = new URL(
  "src/lib/remark-embed-github.mjs",
  import.meta.url
).pathname;

const withMDX = createMDX({
  options: {
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
          defaultLang: {
            block: "plaintext",
          },
          theme: {
            light: "github-light",
            dark: "github-dark",
          },
          keepBackground: false,
        },
      ],
    ],
    remarkPlugins: [
      remarkStaticImageImports,
      remarkEmbedGitHub,
      remarkMermaid,
      "remark-gfm",
    ],
  },
});

export default withMDX(nextConfig);
