import { siteNavigation } from "@/content/site";
import { tokenPreferences } from "@/content/tokens";
import type { PageMetadataInput } from "@/lib/page-metadata";
import { siteConfig } from "@/lib/site";

// Edit each page once; search and social metadata use the same fields.
export const pages = {
  home: {
    title: siteConfig.name,
    path: "/",
  },
  journey: {
    ...siteNavigation.journey,
    title: "Career and Experience",
    type: "profile",
  },
  work: {
    ...siteNavigation.work,
    title: "What I’m Building",
  },
  writing: {
    ...siteNavigation.writing,
    title: "Notes on Software",
    alternates: { types: { "application/rss+xml": "/rss.xml" } },
  },
  tokens: {
    ...siteNavigation.tokens,
    title: "How I Use AI",
    robots: tokenPreferences.enabled
      ? undefined
      : { index: false, follow: false },
  },
} as const satisfies Record<string, PageMetadataInput>;
