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
