import { resumeData } from "@/content/resume";
import { env } from "@/env";

const CANONICAL_SITE_URL = "https://f0rr0.dev";

const withProtocol = (value: string) => {
  const normalized = value.trim().replace(/\/+$/, "");

  if (normalized.startsWith("http://") || normalized.startsWith("https://")) {
    return normalized;
  }
  return normalized.includes("localhost")
    ? `http://${normalized}`
    : `https://${normalized}`;
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

  return CANONICAL_SITE_URL;
};

export const siteConfig = {
  author: {
    bio: `${resumeData.person.role} building AI-native products and hard production systems from zero to launch.`,
    handle: "f0rr0",
    image: "/resume/sid-jain-profile.png",
    name: "Sid Jain",
    role: resumeData.person.role,
  },
  description: `${resumeData.person.name} is a ${resumeData.person.role} building AI-native products, mobile/browser platforms, and production infrastructure.`,
  language: "en-US",
  locale: "en_US",
  name: "Sid Jain",
  shortName: "F0RR0",
  url: resolveSiteUrl(),
};

export const absoluteUrl = (path: string, baseUrl = siteConfig.url) =>
  new URL(path, baseUrl).toString();

export const publicUrl = (path: string) =>
  absoluteUrl(
    path,
    siteConfig.url.includes("localhost") ? CANONICAL_SITE_URL : siteConfig.url
  );
