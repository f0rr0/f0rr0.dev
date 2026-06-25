import { defineConfig } from "oxfmt";
import ultracite from "ultracite/oxfmt";

export default defineConfig({
  ...ultracite,
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
