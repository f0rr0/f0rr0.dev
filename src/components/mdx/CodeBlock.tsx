import type { ComponentPropsWithoutRef } from "react";

import CopyCodeButton from "@/components/mdx/CopyCodeButton";

const languageNames: Record<string, string> = {
  bash: "Bash",
  c: "C",
  cpp: "C++",
  cs: "C#",
  css: "CSS",
  diff: "Diff",
  dockerfile: "Dockerfile",
  go: "Go",
  graphql: "GraphQL",
  html: "HTML",
  java: "Java",
  javascript: "JavaScript",
  js: "JavaScript",
  json: "JSON",
  jsonc: "JSON with comments",
  jsx: "JSX",
  kotlin: "Kotlin",
  lua: "Lua",
  markdown: "Markdown",
  md: "Markdown",
  mdx: "MDX",
  plaintext: "Plain text",
  prisma: "Prisma",
  py: "Python",
  python: "Python",
  regex: "Regular expression",
  rs: "Rust",
  ruby: "Ruby",
  rust: "Rust",
  sh: "Shell",
  shell: "Shell",
  sql: "SQL",
  swift: "Swift",
  text: "Plain text",
  toml: "TOML",
  ts: "TypeScript",
  tsx: "TSX",
  txt: "Plain text",
  vue: "Vue",
  xml: "XML",
  yaml: "YAML",
  yml: "YAML",
  zsh: "Zsh",
};

type CodeBlockProps = ComponentPropsWithoutRef<"pre"> & {
  "data-language"?: string;
};

function getLanguageName(language: string): string {
  const normalizedLanguage = language.toLowerCase();
  const knownName = languageNames[normalizedLanguage];

  if (knownName !== undefined) {
    return knownName;
  }

  if (normalizedLanguage.length <= 4) {
    return normalizedLanguage.toUpperCase();
  }

  return normalizedLanguage
    .split(/[-_]/u)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

export default function CodeBlock({
  children,
  ...props
}: Readonly<CodeBlockProps>) {
  const language = props["data-language"] ?? "plaintext";
  const languageName = getLanguageName(language);

  return (
    <div className="code-block" data-language={language}>
      <div className="code-block-toolbar">
        <span className="code-block-language">{languageName}</span>
        <CopyCodeButton language={languageName} />
      </div>
      <pre {...props}>{children}</pre>
    </div>
  );
}
