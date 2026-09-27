import type { KnipConfig } from "knip";

const config: KnipConfig = ({ production }) => ({
  // Production checks exclude tests as callers while retaining real script roots.
  entry: ["src/content/blog/**/page.mdx!", "scripts/*.ts!"],
  project: ["**/*.{js,mjs,cjs,jsx,ts,tsx,mts,cts,mdx,css}!", "!tests/**!"],
  // Include the config's build-time imports, not only Next's route entries.
  next: { entry: ["next.config.ts"] },
  // Knip 6 classifies workflow scripts as development-only even if explicitly
  // listed above. Check workflows in the default pass; retain script roots here.
  "github-actions": production !== true,
  ignoreIssues: {
    // Preserve the upstream API of registry components, but detect unused files.
    "src/components/ui/**": ["exports", "types"],
  },
  // Loaded via createRequire(import.meta.url); ships a native Typst executable.
  ignoreDependencies: ["@flukxr/typst-cli"],
  // Installed and pinned by mise, not npm.
  ignoreBinaries: ["typstyle"],
  ignoreExportsUsedInFile: true,
});

export default config;
