const generatedOrVendored =
  /(?:^|\/)(?:dist|build|coverage|generated|vendor|node_modules)(?:\/|$)|(?:\.min\.(?:css|js)|\.snap)$/iu;
const lockfile =
  /(?:^|\/)(?:bun\.lockb?|cargo\.lock|composer\.lock|gemfile\.lock|go\.sum|package-lock\.json|pipfile\.lock|pnpm-lock\.ya?ml|poetry\.lock|uv\.lock|yarn\.lock)$/iu;
const binaryAsset =
  /\.(?:7z|avif|bmp|eot|gif|gz|ico|jpe?g|mov|mp3|mp4|ogg|otf|pdf|png|tar|tiff?|ttf|wav|webm|webp|woff2?|zip)$/iu;

const languageByExtension = {
  c: ["c", "C"],
  cc: ["cpp", "C++"],
  cjs: ["javascript", "JavaScript"],
  cpp: ["cpp", "C++"],
  cs: ["csharp", "C#"],
  css: ["css", "CSS"],
  dart: ["dart", "Dart"],
  ex: ["elixir", "Elixir"],
  exs: ["elixir", "Elixir"],
  fs: ["fsharp", "F#"],
  fsx: ["fsharp", "F#"],
  go: ["go", "Go"],
  graphql: ["graphql", "GraphQL"],
  h: ["c", "C"],
  hpp: ["cpp", "C++"],
  html: ["html", "HTML"],
  java: ["java", "Java"],
  js: ["javascript", "JavaScript"],
  jsx: ["javascript", "JavaScript"],
  kt: ["kotlin", "Kotlin"],
  kts: ["kotlin", "Kotlin"],
  lua: ["lua", "Lua"],
  mdx: ["mdx", "MDX"],
  mjs: ["javascript", "JavaScript"],
  mts: ["typescript", "TypeScript"],
  php: ["php", "PHP"],
  proto: ["protobuf", "Protocol Buffers"],
  py: ["python", "Python"],
  r: ["r", "R"],
  rb: ["ruby", "Ruby"],
  rs: ["rust", "Rust"],
  scala: ["scala", "Scala"],
  scss: ["scss", "SCSS"],
  sh: ["shell", "Shell"],
  sql: ["sql", "SQL"],
  svelte: ["svelte", "Svelte"],
  swift: ["swift", "Swift"],
  ts: ["typescript", "TypeScript"],
  tsx: ["typescript", "TypeScript"],
  vue: ["vue", "Vue"],
  zig: ["zig", "Zig"],
} as const;

export interface GitHubFileChangeEvidence {
  additions: number;
  deletions: number;
  filename: string;
  patch: string | null;
  previousFilename: string | null;
  status: string;
}

export interface GitHubWorkUnitFileFact extends GitHubFileChangeEvidence {
  binary: boolean;
  patchComplete: boolean;
}

export interface GitHubCommitChangeEvidence {
  committedAt: string;
  files: readonly GitHubFileChangeEvidence[];
  message: string;
  parents: readonly string[];
  providerFileCapReached: boolean;
  sha: string;
  stats: GitHubChangeStats;
}

interface GitHubChangeStats {
  additions: number;
  deletions: number;
  total: number;
}

export interface GitHubLanguageFact {
  changedLines: number;
  id: string;
  label: string;
}

const isSubstantiveGitHubFile = (file: GitHubFileChangeEvidence) =>
  !generatedOrVendored.test(file.filename) &&
  !lockfile.test(file.filename) &&
  !binaryAsset.test(file.filename);

const languageForFile = (file: GitHubFileChangeEvidence) => {
  const extension = /\.([A-Za-z0-9]+)$/u
    .exec(file.filename)?.[1]
    ?.toLowerCase();
  const language =
    extension === undefined
      ? undefined
      : languageByExtension[extension as keyof typeof languageByExtension];
  return language === undefined
    ? null
    : { id: language[0], label: language[1] };
};

export const githubWorkUnitFileFactsFrom = (
  files: readonly GitHubFileChangeEvidence[]
): readonly GitHubWorkUnitFileFact[] =>
  files.map((file) => ({
    ...file,
    binary: file.patch === null && binaryAsset.test(file.filename),
    patchComplete: file.patch !== null || file.additions + file.deletions === 0,
  }));

export const aggregateGitHubLanguages = (
  files: readonly GitHubFileChangeEvidence[]
): readonly GitHubLanguageFact[] => {
  const facts = new Map<string, GitHubLanguageFact>();
  for (const file of files) {
    if (!isSubstantiveGitHubFile(file)) {
      continue;
    }
    const language = languageForFile(file);
    const changedLines = file.additions + file.deletions;
    if (language === null || changedLines === 0) {
      continue;
    }
    const { id, label } = language;
    const current = facts.get(id);
    facts.set(id, {
      changedLines: (current?.changedLines ?? 0) + changedLines,
      id,
      label,
    });
  }
  return [...facts.values()].toSorted(
    (left, right) =>
      right.changedLines - left.changedLines ||
      (left.id < right.id ? -1 : left.id > right.id ? 1 : 0)
  );
};
