import { defineConfig } from "oxlint";
import type { OxlintConfig } from "oxlint";
import core from "ultracite/oxlint/core";
import next from "ultracite/oxlint/next";
import react from "ultracite/oxlint/react";

const compatibilityRules = {
  "func-style": "off",
  "jsx-a11y/prefer-tag-over-role": "off",
  "nextjs/no-assign-module-variable": "off",
  "nextjs/no-img-element": "off",
  "no-await-in-loop": "off",
  "no-nested-ternary": "off",
  "no-plusplus": "off",
  "no-shadow": "off",
  "prefer-named-capture-group": "off",
  "react/no-unstable-nested-components": "off",
  "require-await": "off",
  "require-unicode-regexp": "off",
  "sort-keys": "off",
  "typescript/no-unsafe-argument": "off",
  "typescript/no-unsafe-assignment": "off",
  "typescript/no-unsafe-call": "off",
  "typescript/no-unsafe-member-access": "off",
  "typescript/no-unsafe-return": "off",
  "typescript/no-unsafe-type-assertion": "off",
  "unicorn/filename-case": "off",
  "unicorn/no-await-expression-member": "off",
  "unicorn/no-nested-ternary": "off",
  "unicorn/no-useless-collection-argument": "off",
  "unicorn/prefer-array-find": "off",
} satisfies OxlintConfig["rules"];

export default defineConfig({
  extends: [core, react, next],
  ignorePatterns: [
    ...(core.ignorePatterns ?? []),
    "**/.rulesync",
    "**/.rulesync/**",
    "**/.next",
    "**/.next/**",
    "**/tsconfig.tsbuildinfo",
  ],
  overrides: [
    {
      files: ["src/lib/*.mjs"],
      rules: {
        "typescript/prefer-nullish-coalescing": "off",
        "typescript/strict-boolean-expressions": "off",
      },
    },
  ],
  options: {
    denyWarnings: true,
    typeAware: true,
  },
  rules: compatibilityRules,
});
