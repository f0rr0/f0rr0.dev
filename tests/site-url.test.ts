import { expect, test } from "bun:test";

import { productionSiteOrigin, siteOriginFrom } from "../src/lib/site-url";

test("derives local and production URLs without an author-specific fallback", () => {
  expect(siteOriginFrom({})).toBe("http://localhost:3000");
  expect(
    siteOriginFrom({
      PORT: "",
      VERCEL_PROJECT_PRODUCTION_URL: "",
    })
  ).toBe("http://localhost:3000");
  expect(siteOriginFrom({ PORT: "4200" })).toBe("http://localhost:4200");
  expect(
    siteOriginFrom({
      VERCEL: "1",
      VERCEL_PROJECT_PRODUCTION_URL: "example.vercel.app",
    })
  ).toBe("https://example.vercel.app");
  for (const hostname of [
    undefined,
    "",
    "localhost",
    "https://example.com",
    "example.com/path",
    "user:password@example.com",
    "example.com?target=other",
  ]) {
    expect(() => productionSiteOrigin(hostname)).toThrow();
  }
  expect(() => siteOriginFrom({ VERCEL: "1" })).toThrow();
});
