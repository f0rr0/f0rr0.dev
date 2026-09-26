import { getDefaultSelectors } from "eslint-plugin-better-tailwindcss/api/defaults";
import { defineConfig } from "oxlint";
import type { OxlintConfig } from "oxlint";
import core from "ultracite/oxlint/core";
import next from "ultracite/oxlint/next";
import react from "ultracite/oxlint/react";

const compatibilityRules = {
  // Preserve the existing lint policy when upgrading Oxlint for JS plugins.
  "max-classes-per-file": "off",
  "react/set-state-in-effect": "off",
  "unicorn/consistent-function-scoping": "off",
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
  jsPlugins: ["eslint-plugin-better-tailwindcss", "@shadcn/lint"],
  settings: {
    "better-tailwindcss": {
      entryPoint: "src/app/globals.css",
      selectors: [
        ...getDefaultSelectors(),
        { kind: "variable", name: "ClassNames?$", match: [{ type: "string" }] },
      ],
    },
  },
  ignorePatterns: [
    // Keep registry-generated shadcn sources unchanged.
    "src/components/ui/**",
    ...(core.ignorePatterns ?? []),
    "**/.rulesync",
    "**/.rulesync/**",
    "**/.next",
    "**/.next/**",
    "**/tsconfig.tsbuildinfo",
  ],
  overrides: [
    {
      files: ["src/**/*.{ts,tsx,js,jsx}"],
      rules: {
        "better-tailwindcss/no-duplicate-classes": "error",
        "better-tailwindcss/no-unnecessary-whitespace": "error",
        "better-tailwindcss/no-deprecated-classes": "error",
        "better-tailwindcss/no-conflicting-classes": "error",
        "better-tailwindcss/no-concatenated-classes": "error",
        "better-tailwindcss/enforce-shorthand-classes": "error",
        "better-tailwindcss/enforce-canonical-classes": "error",
        "better-tailwindcss/no-restricted-classes": [
          "error",
          {
            restrict: [
              {
                pattern: "(?:^|:)transition-all$",
                message:
                  "Name the properties that animate; avoid animating layout accidentally.",
              },
              {
                pattern:
                  "(?:^|:)duration-(?!0$|\\(--motion-(?:fast|layout|exit)\\)$).+",
                message:
                  "Use duration-(--motion-fast), duration-(--motion-layout), or duration-(--motion-exit).",
              },
              {
                pattern: "(?:^|:)\\[transition(?:-duration)?:",
                message:
                  "Use transition utilities with motion tokens, or the shared motion selectors in globals.css.",
              },
            ],
          },
        ],
        // shadcn also recognizes plain CSS selectors in the theme imports.
        "shadcn/no-unknown-classes": [
          "error",
          {
            // Structural hooks referenced by arbitrary selectors and the MDX transform.
            allow: [
              "github-code-embed",
              "journey",
              "site-nav-link",
              "site-row",
              "site-row-meta",
              "site-text-link",
            ],
          },
        ],
        "shadcn/no-raw-colors": "error",
      },
    },
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
