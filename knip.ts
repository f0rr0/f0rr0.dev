import type { KnipConfig } from "knip";

const config: KnipConfig = ({ production }) => ({
  // `!` keeps real entry points in the production check, where tests do not
  // count as callers. Standalone test runners are development-only entries.
  entry: [
    "src/content/blog/**/page.mdx!",
    "scripts/*.ts!",
    "!scripts/test-*.ts!",
  ],
  project: [
    "**/*.{js,mjs,cjs,jsx,ts,tsx,mts,cts,mdx,css}!",
    "!tests/**!",
    "!scripts/test-*.ts!",
  ],
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
