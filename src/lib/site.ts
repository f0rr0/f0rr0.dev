import { env } from "@/env";

const withProtocol = (value: string) => {
  if (value.startsWith("http://") || value.startsWith("https://")) {
    return value;
  }
  return value.includes("localhost") ? `http://${value}` : `https://${value}`;
};

const resolveSiteUrl = () => {
  if (process.env.NODE_ENV === "development") {
    const devPort = process.env.PORT ?? process.env.NEXT_PUBLIC_PORT ?? "3000";
    return `http://localhost:${devPort}`;
  }

  if (env.VERCEL_ENV === "production") {
    if (env.VERCEL_PROJECT_PRODUCTION_URL) {
      return withProtocol(env.VERCEL_PROJECT_PRODUCTION_URL);
    }
    if (env.VERCEL_URL) {
      return withProtocol(env.VERCEL_URL);
    }
  }

  if (env.VERCEL_URL) {
    return withProtocol(env.VERCEL_URL);
  }

  if (env.VERCEL_PROJECT_PRODUCTION_URL) {
    return withProtocol(env.VERCEL_PROJECT_PRODUCTION_URL);
  }

  throw new Error(
    "Missing Vercel system env vars. Expected VERCEL_PROJECT_PRODUCTION_URL or VERCEL_URL.",
  );
};

export const siteConfig = {
  name: "F0RR0",
  description: "Creative developer building digital experiences.",
  url: resolveSiteUrl(),
  language: "en-US",
  locale: "en_US",
  author: {
    name: "F0RR0",
  },
};

export const absoluteUrl = (path: string, baseUrl = siteConfig.url) =>
  new URL(path, baseUrl).toString();
