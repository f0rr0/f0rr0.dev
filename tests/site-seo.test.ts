import { expect, test } from "bun:test";

import nextConfig from "../next.config";
import { buildBlogMetadata, buildPageMetadata } from "../src/lib/page-metadata";
import { publicUrl, siteConfig } from "../src/lib/site";
import { buildBlogPostingJsonLd } from "../src/lib/structured-data";
import { env } from "./helpers";

test("preview deployments are excluded from indexing without hiding production", async () => {
  const original = env.VERCEL_ENV;
  try {
    env.VERCEL_ENV = "preview";
    expect(await nextConfig.headers?.()).toEqual([
      {
        source: "/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex" }],
      },
    ]);
    for (const deployment of [
      "production",
      "development",
      undefined,
    ] as const) {
      env.VERCEL_ENV = deployment;
      expect(await nextConfig.headers?.()).toEqual([]);
    }
  } finally {
    env.VERCEL_ENV = original;
  }
});

test("page metadata preserves overrides but always uses the canonical page URL", () => {
  const image = { url: "/example.png", alt: "Example" };
  const metadata = buildPageMetadata({
    title: "Example",
    description: "An example page.",
    path: "/example",
    type: "profile",
    image,
    robots: { index: false, follow: false },
    alternates: {
      canonical: "https://wrong.example",
      types: { "application/rss+xml": "/rss.xml" },
    },
  });
  expect(metadata.title).toEqual({ absolute: `Example | ${siteConfig.name}` });
  expect(metadata.alternates).toEqual({
    canonical: publicUrl("/example"),
    types: { "application/rss+xml": "/rss.xml" },
  });
  expect(metadata.robots).toEqual({ index: false, follow: false });
  for (const social of [metadata.openGraph, metadata.twitter]) {
    expect(social).toMatchObject({
      title: `Example | ${siteConfig.name}`,
      description: "An example page.",
      images: [image],
    });
  }
  expect(metadata.openGraph.type).toBe("profile");
  const home = buildPageMetadata({ title: "Home", path: "/" });
  expect(home.title).toEqual({ absolute: "Home" });
  expect(home.description).toBe(siteConfig.title);
  expect(home.openGraph.images).toEqual([siteConfig.shareImage]);
  expect(home.openGraph.type).toBe("website");
  expect(Object.hasOwn(home, "robots")).toBe(false);
});

test("blog metadata and JSON-LD share authored fields, URLs, images and dates", () => {
  const post = {
    slug: "example",
    importPath: "example/page.mdx",
    metadata: {
      title: "A new idea",
      summary: "What I learned.",
      author: siteConfig.name,
      date: "2026-09-01",
      tags: ["engineering"],
    },
    date: new Date("2026-09-01"),
    readingTime: "1 min read",
    wordCount: 100,
  };
  for (const updatedAt of [undefined, new Date("2026-09-02")]) {
    const article = { ...post, updatedAt };
    const metadata = buildBlogMetadata(article);
    const schema = buildBlogPostingJsonLd(article);
    expect(metadata.title.absolute).toBe(
      `${post.metadata.title} | ${siteConfig.name}`
    );
    expect(metadata.openGraph.title).toBe(metadata.title.absolute);
    expect(metadata.twitter.title).toBe(metadata.title.absolute);
    expect(metadata.openGraph.type).toBe("article");
    expect(metadata.description).toBe(post.metadata.summary);
    expect(schema.headline).toBe(post.metadata.title);
    expect(schema.description).toBe(metadata.description);
    expect(metadata.alternates.canonical).toBe(publicUrl("/writing/example"));
    expect(schema.url).toBe(publicUrl("/writing/example"));
    expect(schema.url).toBe(metadata.openGraph.url);
    expect(metadata.openGraph.images[0].url).toBe(
      publicUrl("/writing/example/share-image")
    );
    expect(schema.image).toBe(publicUrl("/writing/example/share-image"));
    expect(metadata.twitter.images).toEqual(metadata.openGraph.images);
    expect(metadata.twitter.images[0].alt).toBe(post.metadata.title);
    expect(metadata.openGraph.publishedTime).toBe("2026-09-01T00:00:00.000Z");
    expect(schema.datePublished).toBe("2026-09-01T00:00:00.000Z");
    expect(metadata.openGraph.modifiedTime).toBe(updatedAt?.toISOString());
    expect(schema.dateModified).toBe(
      updatedAt ? "2026-09-02T00:00:00.000Z" : "2026-09-01T00:00:00.000Z"
    );
    expect(schema.author).toMatchObject(metadata.authors[0]);
    expect(schema.keywords).toEqual(metadata.keywords);
    expect(metadata.alternates.types).toEqual({
      "application/rss+xml": new URL("/rss.xml", siteConfig.url).href,
    });
  }
});
