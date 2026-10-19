import { Code2 } from "lucide-react";
import Image from "next/image";

const languageIconSlugs: Readonly<Record<string, string>> = {
  C: "c",
  "C#": "sharp",
  "C++": "cplusplus",
  CSS: "css",
  Dart: "dart",
  Elixir: "elixir",
  "F#": "fsharp",
  Go: "go",
  GraphQL: "graphql",
  HTML: "html5",
  Java: "openjdk",
  JavaScript: "javascript",
  Kotlin: "kotlin",
  Lua: "lua",
  MDX: "mdx",
  PHP: "php",
  "Protocol Buffers": "protobuf",
  Python: "python",
  R: "r",
  Ruby: "ruby",
  Rust: "rust",
  SCSS: "sass",
  SQL: "postgresql",
  Scala: "scala",
  Shell: "gnubash",
  Svelte: "svelte",
  Swift: "swift",
  TypeScript: "typescript",
  Vue: "vuedotjs",
  Zig: "zig",
};

export const LanguageIcon = ({ language }: Readonly<{ language: string }>) => {
  const slug = languageIconSlugs[language];
  return (
    <span
      className="inline-flex shrink-0"
      role="img"
      aria-label={language}
      title={language}
    >
      {slug === undefined ? (
        <Code2 aria-hidden="true" className="size-3.5" />
      ) : (
        <Image
          alt=""
          className="size-3.5 opacity-80 dark:invert"
          height={14}
          width={14}
          src={`https://cdn.jsdelivr.net/npm/simple-icons@16.12.0/icons/${slug}.svg`}
          unoptimized
        />
      )}
    </span>
  );
};
