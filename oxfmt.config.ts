import { defineConfig } from "oxfmt";
import ultracite from "ultracite/oxfmt";

export default defineConfig({
  ...ultracite,
  // Preserve authored and historical code samples exactly as published.
  embeddedLanguageFormatting: "off",
  ignorePatterns: [
    ...(ultracite.ignorePatterns ?? []),
    "**/.rulesync",
    "**/.rulesync/**",
    "**/.next",
    "**/.next/**",
    "**/node_modules",
    "**/node_modules/**",
    "**/tsconfig.tsbuildinfo",
  ],
});
