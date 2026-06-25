import { env } from "@/env";

const LOCAL_SITE_URL = "http://localhost:3000";

const withProtocol = (value: string) => {
  if (value.startsWith("http://") || value.startsWith("https://")) {
    return value;
  }
  return value.includes("localhost") ? `http://${value}` : `https://${value}`;
};

const resolveSiteUrl = () => {
  if (env.SITE_URL !== undefined && env.SITE_URL !== "") {
    return withProtocol(env.SITE_URL);
  }

  if (env.NODE_ENV === "development") {
    const devPort = env.PORT ?? env.NEXT_PUBLIC_PORT ?? "3000";
    return `http://localhost:${devPort}`;
  }

  if (env.VERCEL_ENV === "production") {
    if (
      env.VERCEL_PROJECT_PRODUCTION_URL !== undefined &&
      env.VERCEL_PROJECT_PRODUCTION_URL !== ""
    ) {
      return withProtocol(env.VERCEL_PROJECT_PRODUCTION_URL);
    }
    if (env.VERCEL_URL !== undefined && env.VERCEL_URL !== "") {
      return withProtocol(env.VERCEL_URL);
    }
  }

  if (env.VERCEL_URL !== undefined && env.VERCEL_URL !== "") {
    return withProtocol(env.VERCEL_URL);
  }

  if (
    env.VERCEL_PROJECT_PRODUCTION_URL !== undefined &&
    env.VERCEL_PROJECT_PRODUCTION_URL !== ""
  ) {
    return withProtocol(env.VERCEL_PROJECT_PRODUCTION_URL);
  }

  return LOCAL_SITE_URL;
};

export const siteConfig = {
  author: {
    bio: "Creative developer building digital experiences and thoughtful web tools.",
    image: "",
    name: "F0RR0",
    role: "Creative Developer",
  },
  description: "Creative developer building digital experiences.",
  language: "en-US",
  locale: "en_US",
  name: "F0RR0",
  url: resolveSiteUrl(),
};

export const absoluteUrl = (path: string, baseUrl = siteConfig.url) =>
  new URL(path, baseUrl).toString();
