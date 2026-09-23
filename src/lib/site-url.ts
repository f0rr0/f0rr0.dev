import { env } from "../env";

export const productionSiteOrigin = (hostname: string | undefined) => {
  const host = hostname?.trim();
  if (host === undefined || host.length === 0) {
    throw new Error(
      "VERCEL_PROJECT_PRODUCTION_URL is required for production URLs."
    );
  }
  const url = new URL(`https://${host}`);
  if (
    url.host !== host ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    url.hostname === "localhost" ||
    url.hostname.endsWith(".localhost")
  ) {
    throw new Error(
      "VERCEL_PROJECT_PRODUCTION_URL must be a production hostname."
    );
  }
  return url.origin;
};

export const siteOriginFrom = (environment: Partial<typeof env>) => {
  if (
    (environment.VERCEL_PROJECT_PRODUCTION_URL?.trim().length ?? 0) > 0 ||
    environment.VERCEL === "1"
  ) {
    return productionSiteOrigin(environment.VERCEL_PROJECT_PRODUCTION_URL);
  }
  return new URL(
    `http://localhost:${(environment.PORT?.trim() ?? "") || "3000"}`
  ).origin;
};

// Vercel provides the public hostname at build time; standalone scripts use its server variable.
export const CANONICAL_SITE_URL =
  env.NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL === undefined
    ? typeof window === "undefined"
      ? siteOriginFrom(env)
      : window.location.origin
    : productionSiteOrigin(env.NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL);
