import { resumeData } from "@/content/resume";
import { env } from "@/env";

const CANONICAL_SITE_URL = "https://f0rr0.dev";
const [currentExperience] = resumeData.experience;
const [currentRole] = currentExperience?.roles ?? [];
const foundedExperience = resumeData.experience.find((experience) =>
  experience.roles.some((role) => /\bFounder\b/.test(role.title))
);
const currentRoleTitle = currentRole?.title ?? resumeData.person.role;
const currentCompany = currentExperience?.company;
const founderClause =
  foundedExperience === undefined
    ? ""
    : ` who founded ${foundedExperience.company}`;
const currentRoleClause =
  currentCompany === undefined
    ? ""
    : ` and now serves as ${currentRoleTitle} at ${currentCompany}`;
const profileDescription = `${resumeData.person.name} is an ${resumeData.person.role}${founderClause}${currentRoleClause}.`;

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
    bio: `${resumeData.person.role} building AI products and complex production systems from customer discovery through launch.`,
    handle: "f0rr0",
    image: "/resume/sid-jain-profile.png",
    name: resumeData.person.name,
    role: resumeData.person.role,
  },
  description: profileDescription,
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
