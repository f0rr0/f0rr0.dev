import { trackedGitHubAccountFrom } from "@/lib/github-commits-core";

const languageIconSlug: Readonly<Record<string, string>> = {
  c: "c",
  cpp: "cplusplus",
  csharp: "sharp",
  css: "css",
  dart: "dart",
  elixir: "elixir",
  fsharp: "fsharp",
  go: "go",
  graphql: "graphql",
  html: "html5",
  java: "openjdk",
  javascript: "javascript",
  kotlin: "kotlin",
  lua: "lua",
  mdx: "mdx",
  php: "php",
  protobuf: "protobuf",
  python: "python",
  r: "r",
  ruby: "ruby",
  rust: "rust",
  scala: "scala",
  scss: "sass",
  shell: "gnubash",
  sql: "postgresql",
  svelte: "svelte",
  swift: "swift",
  typescript: "typescript",
  vue: "vuedotjs",
  zig: "zig",
};

export const publicLanguageIconUrl = (languageId: string) => {
  const slug = languageIconSlug[languageId];
  return slug === undefined
    ? null
    : `https://cdn.jsdelivr.net/npm/simple-icons@16.12.0/icons/${slug}.svg`;
};

export interface RepositoryDisplayInput {
  ownerLogin: string;
  private: boolean;
  repository: string;
  sha: string;
}

export const publicRepositoryDisplay = (input: RepositoryDisplayInput) => {
  const directlyOwned = trackedGitHubAccountFrom(input.ownerLogin) !== null;
  const canName = !input.private || directlyOwned;
  return {
    repositoryLabel: canName
      ? (input.repository.split("/").at(-1) ?? input.repository)
      : null,
    url: input.private
      ? null
      : `https://github.com/${input.repository}/commit/${input.sha}`,
  };
};
