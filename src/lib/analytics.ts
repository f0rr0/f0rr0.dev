import { posthog } from "posthog-js";

import { CANONICAL_SITE_URL } from "@/lib/site-url";

export interface DetailProperties {
  section: "work" | "journey" | "token-log";
  item_kind?: string;
}

interface AnalyticsEvents {
  details_opened: DetailProperties;
  outbound_link_clicked: {
    destination_host: string;
    destination_path: string;
    placement: string;
  };
  ask_ai_clicked: { provider: string; placement: string };
  resume_download_clicked: { destination_path: string; placement: string };
  article_depth_reached: { article_slug: string; depth_percent: number };
  email_copied: { method: "clipboard" | "fallback" };
  code_copied: { language: string };
  github_activity_loaded: { days_loaded: number };
}

export function track<Event extends keyof AnalyticsEvents>(
  event: Event,
  properties: AnalyticsEvents[Event]
) {
  // Initialization is disabled for previews and development.
  if (!posthog.__loaded) {
    return;
  }
  posthog.capture(event, { ...properties, schema_version: 1 });
}

export function sanitizeProperties(properties: Record<string, unknown>) {
  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(properties)) {
    if (key.includes("utm_")) {
      // Campaign labels are public slugs, never free text or email addresses.
      if (typeof value !== "string" || !/^[a-z0-9_-]{1,80}$/i.test(value)) {
        continue;
      }
    } else if (
      /gclid|fbclid|msclkid|dclid|gbraid|wbraid|search_keyword/i.test(key)
    ) {
      continue;
    } else if (
      typeof value === "string" &&
      /url|referrer|pathname/i.test(key)
    ) {
      if (value === "$direct") {
        clean[key] = value;
        continue;
      }
      try {
        const url = new URL(value, CANONICAL_SITE_URL);
        clean[key] = /referrer/i.test(key)
          ? url.origin
          : /pathname/i.test(key)
            ? url.pathname
            : `${url.origin}${url.pathname}`;
      } catch {
        continue;
      }
      continue;
    }
    clean[key] = value;
  }
  return clean;
}

export function classifyLink(href: string, origin: string) {
  if (!URL.canParse(href, origin)) {
    return null;
  }
  const url = new URL(href, origin);
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return null;
  }
  const provider = new Map([
    ["chatgpt.com", "chatgpt"],
    ["claude.ai", "claude"],
    ["gemini.google.com", "gemini"],
    ["www.perplexity.ai", "perplexity"],
    [
      "www.google.com",
      url.pathname === "/search" && url.searchParams.get("udm") === "50"
        ? "google_ai_mode"
        : undefined,
    ],
  ]).get(url.hostname);
  if (provider !== undefined) {
    return { event: "ask_ai_clicked" as const, properties: { provider } };
  }
  if (url.origin === origin) {
    if (url.pathname.endsWith(".pdf")) {
      return {
        event: "resume_download_clicked" as const,
        properties: { destination_path: url.pathname },
      };
    }
    return null;
  }
  return {
    event: "outbound_link_clicked" as const,
    properties: {
      destination_host: url.hostname,
      destination_path: url.pathname,
    },
  };
}

export function captureLink(event: MouseEvent) {
  if (event.button !== 0 && event.button !== 1) {
    return;
  }
  const anchor =
    event.target instanceof Element ? event.target.closest("a[href]") : null;
  if (!(anchor instanceof HTMLAnchorElement)) {
    return;
  }
  const link = classifyLink(anchor.href, location.origin);
  if (link === null) {
    return;
  }
  const placement =
    anchor.closest<HTMLElement>("[data-analytics-placement]")?.dataset
      .analyticsPlacement ??
    anchor.closest("section[id]")?.id ??
    (anchor.closest("footer") ? "footer" : "content");
  track(link.event, { ...link.properties, placement });
}

export function articleDepth(
  top: number,
  height: number,
  viewportHeight: number
) {
  return height <= 0
    ? 0
    : Math.max(0, Math.min(100, ((viewportHeight - top) / height) * 100));
}
