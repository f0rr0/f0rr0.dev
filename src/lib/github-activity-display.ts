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

const repositoryLabel = (input: {
  ownerLogin: string;
  private: boolean;
  repository: string;
}) => {
  if (input.private) {
    return "Private";
  }
  const repositoryName = input.repository.split("/").at(-1);
  return `${input.ownerLogin}/${repositoryName ?? input.repository}`;
};

const safeGitHubUrl = (value: string) => {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "github.com"
      ? url.toString()
      : null;
  } catch {
    return null;
  }
};

export const publicRepositoryDisplay = (input: RepositoryDisplayInput) => ({
  repositoryLabel: repositoryLabel(input),
  url: input.private
    ? null
    : `https://github.com/${input.repository}/commit/${input.sha}`,
});

export const publicRepositoryEntityDisplay = (input: {
  ownerLogin: string;
  private: boolean;
  repository: string;
  url: string;
}) => ({
  repositoryLabel: repositoryLabel(input),
  url: input.private ? null : safeGitHubUrl(input.url),
});
