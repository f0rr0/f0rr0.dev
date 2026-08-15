import type { TimelineImportance, WorkBucket } from "@/lib/timeline-core";

export interface TimelineEntry {
  bucket: WorkBucket;
  date: string;
  description: string;
  href: string;
  importance?: TimelineImportance;
  label: string;
  private?: boolean;
  title: string;
}

export const timelineEntries = [
  {
    bucket: "Open source",
    date: "2026-08-12",
    description:
      "Making embedded Postgres feel as ordinary as opening a SQLite database—without Docker, Node.js, or a server.",
    href: "https://github.com/f0rr0/oliphaunt",
    importance: "lead",
    label: "Explore oliphaunt",
    title: "Shipping oliphaunt",
  },
  {
    bucket: "Open source",
    date: "2026-07-19",
    description:
      "A public Rust client built while mapping an opaque mobile protocol into a small, inspectable interface.",
    href: "https://github.com/f0rr0/hinge-rs",
    importance: "lead",
    label: "View hinge-rs",
    title: "Reverse-engineering in Rust",
  },
  {
    bucket: "Applied AI",
    date: "2026-04-21",
    description:
      "An MCP server and scheduler that lets an agent watch a scarce appointment queue and return only when action is possible.",
    href: "https://github.com/f0rr0/tranquilo",
    importance: "story",
    label: "View Tranquilo",
    title: "Teaching an agent when to act",
  },
  {
    bucket: "Applied AI",
    date: "2026-03-16",
    description:
      "A household meal-planning system that turns pantry photos, order history, preferences, and group decisions into useful state.",
    href: "https://github.com/f0rr0/zeroclaw/pull/8",
    importance: "story",
    label: "View the ZeroClaw work",
    title: "Teaching an agent what is for lunch",
  },
  {
    bucket: "Open source",
    date: "2026-07-28",
    description:
      "Returning to a long-lived React Native component to keep a small public primitive useful and dependable.",
    href: "https://github.com/f0rr0/react-native-rating",
    importance: "brief",
    label: "View react-native-rating",
    title: "Maintaining the work that lasts",
  },
  {
    bucket: "Product systems",
    date: "2026-02-01",
    description:
      "Reworking this site as a deliberate product surface: faster navigation, clearer writing, and better structured context.",
    href: "https://github.com/f0rr0/f0rr0.dev",
    importance: "brief",
    label: "View the site source",
    title: "Turning the portfolio into a product",
  },
  {
    bucket: "Product systems",
    date: "2025-12-22",
    description:
      "Exploring payment-gated routes as a compact protocol experiment, with the public implementation kept small enough to inspect.",
    href: "https://github.com/f0rr0/route-402",
    importance: "brief",
    label: "View route-402",
    title: "Experimenting at the edge of HTTP",
  },
  {
    bucket: "Applied AI",
    date: "2025-01-01",
    description:
      "Taking customer workflows from discovery and evaluation through implementation and support. The activity is counted; private repository details are not requested.",
    href: "/resume",
    importance: "story",
    label: "See my experience",
    private: true,
    title: "Leading applied AI at Namefi",
  },
  {
    bucket: "Writing",
    date: "2018-12-23",
    description:
      "A personal archive for explaining the decisions, trade-offs, and strange systems behind the code—not just announcing the result.",
    href: "/blog",
    importance: "story",
    label: "Read the notes",
    title: "Writing the work down",
  },
] as const satisfies readonly TimelineEntry[];

export const projectEditorial = {
  "f0rr0.dev": {
    bucket: "Product systems" as const,
    description:
      "This site: a fast, accessible home for the work, writing, and context behind both.",
  },
  oliphaunt: {
    bucket: "Open source" as const,
    description:
      "Embedded PostgreSQL for apps and tests, packaged to feel as simple as SQLite.",
  },
  "pg-browser-proxy": {
    bucket: "Product systems" as const,
    description:
      "A small bridge that lets desktop database clients inspect Postgres running inside a browser.",
  },
  "react-native-rating": {
    bucket: "Open source" as const,
    description:
      "An accessible, native-driver rating component that has quietly served React Native apps for years.",
  },
} as const;

export const featuredProjectNames = [
  "oliphaunt",
  "react-native-rating",
  "f0rr0.dev",
  "pg-browser-proxy",
] as const;
