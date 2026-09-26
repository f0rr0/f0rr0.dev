import createMDX from "@next/mdx";
import type { NextConfig } from "next";

import { env } from "./src/env";

const blogSourceFiles = ["./src/content/blog/**/*.mdx"];
const blogImageFiles = [
  ...blogSourceFiles,
  "./src/content/blog/**/opengraph-image.*",
  "./src/content/blog/**/twitter-image.*",
];

const nextConfig: NextConfig = {
  headers: async () =>
    env.VERCEL_ENV === "preview"
      ? [
          {
            source: "/:path*",
            headers: [{ key: "X-Robots-Tag", value: "noindex" }],
          },
        ]
      : [],
  experimental: {
    useTypeScriptCli: true,
  },
  images: {
    remotePatterns: [
      {
        hostname: "avatars.githubusercontent.com",
        pathname: "/**",
        protocol: "https",
      },
      {
        hostname: "cdn.jsdelivr.net",
        pathname: "/**",
        protocol: "https",
      },
      {
        hostname: "files.openai.com",
        pathname: "/content",
        protocol: "https",
      },
    ],
  },
  outputFileTracingExcludes: {
    "/*": ["./next.config.ts"],
  },
  outputFileTracingIncludes: {
    "/": blogSourceFiles,
    "/writing/[slug]": blogImageFiles,
    "/writing/[slug]/markdown": blogSourceFiles,
    "/writing/[slug]/opengraph-image": blogImageFiles,
    "/writing/[slug]/share-image": blogImageFiles,
    "/writing/[slug]/twitter-image": blogImageFiles,
    "/llms.txt": blogSourceFiles,
    "/llms-full.txt": blogSourceFiles,
    "/rss.xml": blogSourceFiles,
    "/sitemap.xml": blogSourceFiles,
  },
  reactCompiler: true,
  serverExternalPackages: ["@flukxr/typst-cli"],
  // The proxy preserves collector slashes and redirects ordinary page slashes.
  skipTrailingSlashRedirect: true,
  redirects: async () => [
    { source: "/blog/:path*", destination: "/writing/:path*", permanent: true },
    {
      source: "/work-log/:path*",
      destination: "/work/:path*",
      permanent: true,
    },
    { source: "/resume", destination: "/journey", permanent: true },
  ],
  rewrites: async () => [
    {
      destination: "/writing/:slug/markdown",
      source: "/writing/:slug.md",
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

const rehypeArticleGrid = new URL(
  "src/lib/rehype-article-grid.mjs",
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
      rehypeArticleGrid,
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
