import { Buffer } from "node:buffer";

import remarkEmbedderModule from "@remark-embedder/core";
import { codeToHtml } from "shiki";

import { env } from "../env.ts";

function resolveDefaultExport(value) {
  if (typeof value === "function") {
    return value;
  }

  if (value !== null && typeof value === "object" && "default" in value) {
    return resolveDefaultExport(value.default);
  }

  throw new TypeError(
    "Could not resolve @remark-embedder/core's default export"
  );
}

const remarkEmbedder = resolveDefaultExport(remarkEmbedderModule);

const GITHUB_API_VERSION = "2026-03-10";
const GITHUB_COMMIT_PATTERN = /^(?:[\da-f]{40}|[\da-f]{64})$/iu;
const GITHUB_LINE_HASH_PATTERN = /^#L(\d+)(?:-L(\d+))?$/u;
const REQUEST_TIMEOUT_MS = 5000;
const embedCache = new Map();

const languageByExtension = {
  c: "c",
  cc: "cpp",
  cpp: "cpp",
  cs: "csharp",
  css: "css",
  go: "go",
  graphql: "graphql",
  h: "c",
  hpp: "cpp",
  html: "html",
  java: "java",
  js: "javascript",
  json: "json",
  jsonc: "jsonc",
  jsx: "jsx",
  kt: "kotlin",
  kts: "kotlin",
  lua: "lua",
  md: "markdown",
  mdx: "mdx",
  mjs: "javascript",
  php: "php",
  proto: "proto",
  py: "python",
  rb: "ruby",
  rs: "rust",
  scss: "scss",
  sh: "bash",
  sql: "sql",
  swift: "swift",
  toml: "toml",
  ts: "typescript",
  tsx: "tsx",
  vue: "vue",
  xml: "xml",
  yaml: "yaml",
  yml: "yaml",
  zsh: "bash",
};

const dateFormatter = new Intl.DateTimeFormat("en", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
  year: "numeric",
});

const compactNumberFormatter = new Intl.NumberFormat("en", {
  maximumFractionDigits: 1,
  notation: "compact",
});

const fullNumberFormatter = new Intl.NumberFormat("en");

const icons = {
  branch: `<svg aria-hidden="true" fill="none" viewBox="0 0 24 24"><line x1="6" x2="6" y1="3" y2="15"></line><circle cx="18" cy="6" r="3"></circle><circle cx="6" cy="18" r="3"></circle><path d="M18 9a9 9 0 0 1-9 9"></path></svg>`,
  fork: `<svg aria-hidden="true" fill="none" viewBox="0 0 24 24"><circle cx="12" cy="18" r="3"></circle><circle cx="6" cy="6" r="3"></circle><circle cx="18" cy="6" r="3"></circle><path d="M18 9v1a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V9"></path><path d="M12 12v3"></path></svg>`,
  issue: `<svg aria-hidden="true" fill="none" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"></circle><line x1="12" x2="12" y1="8" y2="12"></line><line x1="12.01" x2="12.01" y1="16" y2="16"></line></svg>`,
  pullRequest: `<svg aria-hidden="true" fill="none" viewBox="0 0 24 24"><circle cx="18" cy="18" r="3"></circle><circle cx="6" cy="6" r="3"></circle><path d="M13 6h3a2 2 0 0 1 2 2v7"></path><line x1="6" x2="6" y1="9" y2="21"></line></svg>`,
  star: `<svg aria-hidden="true" fill="none" viewBox="0 0 24 24"><path d="m12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2Z"></path></svg>`,
};

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function decodePathSegment(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

function getCodeLanguage(filePath) {
  const fileName = filePath.split("/").at(-1)?.toLowerCase() ?? "";

  if (fileName === "dockerfile") {
    return "dockerfile";
  }

  if (fileName === "makefile") {
    return "make";
  }

  const extension = fileName.includes(".") ? fileName.split(".").at(-1) : "";
  return languageByExtension[extension] ?? "text";
}

function getLineLabel({ endLine, startLine }) {
  return startLine === endLine
    ? `Line ${startLine}`
    : `Lines ${startLine}–${endLine}`;
}

function dedentCode(value) {
  const lines = value.split("\n");
  let indentation = Number.POSITIVE_INFINITY;

  for (const line of lines) {
    const firstContentIndex = line.search(/\S/u);

    if (firstContentIndex !== -1) {
      indentation = Math.min(indentation, firstContentIndex);
    }
  }

  if (!Number.isFinite(indentation) || indentation === 0) {
    return value;
  }

  return lines
    .map((line) => (line.trim() === "" ? "" : line.slice(indentation)))
    .join("\n");
}

function parseGitHubLineSelection(hash) {
  const lineMatch = GITHUB_LINE_HASH_PATTERN.exec(hash);

  if (lineMatch === null) {
    return null;
  }

  const startLine = Number(lineMatch[1]);
  const endLine = Number(lineMatch[2] ?? lineMatch[1]);

  if (
    !Number.isSafeInteger(startLine) ||
    !Number.isSafeInteger(endLine) ||
    startLine <= 0 ||
    endLine < startLine
  ) {
    return null;
  }

  return { endLine, startLine };
}

function parseGitHubCodeReference(url, segments) {
  if (segments.length < 5 || segments[2] !== "blob") {
    return null;
  }

  if (url.search !== "" && url.search !== "?plain=1") {
    return null;
  }

  const [ownerValue, repoValue, , commitValue, ...filePathValues] = segments;
  const decodedSegments = [
    ownerValue ?? "",
    repoValue ?? "",
    commitValue ?? "",
    ...filePathValues,
  ].map(decodePathSegment);

  if (decodedSegments.some((segment) => segment === null || segment === "")) {
    return null;
  }

  const [owner, repo, commit, ...decodedFilePath] = decodedSegments;

  if (commit === null || !GITHUB_COMMIT_PATTERN.test(commit)) {
    return null;
  }

  const lineSelection = parseGitHubLineSelection(url.hash);

  if (lineSelection === null) {
    return null;
  }

  const filePath = decodedFilePath.join("/");
  const encodedFilePath = filePath
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  const lineHash =
    lineSelection.startLine === lineSelection.endLine
      ? `#L${lineSelection.startLine}`
      : `#L${lineSelection.startLine}-L${lineSelection.endLine}`;

  return {
    commit: commit.toLowerCase(),
    endLine: lineSelection.endLine,
    filePath,
    href: `https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/blob/${commit.toLowerCase()}/${encodedFilePath}${url.search}${lineHash}`,
    kind: "code",
    owner,
    repo,
    startLine: lineSelection.startLine,
  };
}

function parseGitHubUrl(value) {
  let url;

  try {
    url = new URL(value);
  } catch {
    return null;
  }

  if (url.protocol !== "https:" || url.hostname !== "github.com") {
    return null;
  }

  const segments = url.pathname.split("/").filter(Boolean);

  const codeReference = parseGitHubCodeReference(url, segments);

  if (codeReference !== null) {
    return codeReference;
  }

  if (segments.length === 2) {
    const [owner, repoWithSuffix] = segments;
    const repo = repoWithSuffix?.replace(/\.git$/u, "");

    if (owner === undefined || repo === undefined || repo === "") {
      return null;
    }

    return {
      href: `https://github.com/${owner}/${repo}`,
      kind: "repository",
      owner,
      repo,
    };
  }

  if (segments.length === 4 && segments[2] === "pull") {
    const [owner, repo, , numberValue] = segments;
    const number = Number(numberValue);

    if (
      owner === undefined ||
      repo === undefined ||
      !Number.isSafeInteger(number) ||
      number <= 0
    ) {
      return null;
    }

    return {
      href: `https://github.com/${owner}/${repo}/pull/${number}`,
      kind: "pull",
      number,
      owner,
      repo,
    };
  }

  return null;
}

function decodeGitHubFile(data) {
  if (
    data === null ||
    typeof data !== "object" ||
    data.type !== "file" ||
    data.encoding !== "base64" ||
    typeof data.content !== "string"
  ) {
    throw new TypeError("GitHub did not return embeddable file content");
  }

  return Buffer.from(data.content.replaceAll("\n", ""), "base64").toString(
    "utf-8"
  );
}

async function renderCodeReference(parsed, data) {
  const source = decodeGitHubFile(data).replaceAll("\r\n", "\n");
  const lines = source.split("\n");

  if (parsed.startLine > lines.length) {
    throw new RangeError("The referenced line is outside the GitHub file");
  }

  const endLine = Math.min(parsed.endLine, lines.length);
  const excerpt = dedentCode(
    lines.slice(parsed.startLine - 1, endLine).join("\n")
  );
  const lineLabel = getLineLabel({
    endLine,
    startLine: parsed.startLine,
  });
  const language = getCodeLanguage(parsed.filePath);
  const highlightedCode = await codeToHtml(excerpt, {
    defaultColor: false,
    lang: language,
    themes: {
      dark: "github-dark",
      light: "github-light",
    },
    transformers: [
      {
        code(node) {
          node.properties["data-language"] = language;
          node.properties["data-theme"] = "github-light github-dark";
        },
        line(node, line) {
          node.properties["data-line-number"] = String(
            parsed.startLine + line - 1
          );
        },
        name: "github-line-reference",
        pre(node) {
          node.properties["aria-label"] = `${parsed.filePath}, ${lineLabel}`;
          node.properties["data-github-code-embed"] = "true";
          node.properties["data-github-href"] = parsed.href;
          node.properties["data-github-lines"] = lineLabel;
          node.properties["data-github-owner"] = parsed.owner;
          node.properties["data-github-path"] = parsed.filePath;
          node.properties["data-github-repo"] = parsed.repo;
          node.properties["data-language"] = language;
          node.properties["data-theme"] = "github-light github-dark";
        },
      },
    ],
  });

  return highlightedCode;
}

function renderShell({ content, href, label }) {
  return `<a aria-label="${escapeHtml(label)}" class="github-embed" href="${escapeHtml(href)}" rel="noreferrer noopener" target="_blank">${content}</a>`;
}

function renderPullRequest(parsed, data) {
  const status =
    data.merged_at === null ? (data.draft ? "draft" : data.state) : "merged";
  const statusDate = data.merged_at ?? data.updated_at ?? data.created_at;
  const fileLabel = data.changed_files === 1 ? "file" : "files";

  return renderShell({
    content: `
      <span class="github-embed-header">
        <span class="github-embed-repository">${icons.branch}<span>${escapeHtml(parsed.owner)} / ${escapeHtml(parsed.repo)}</span></span>
        <span class="github-embed-status github-embed-status-${status}">${icons.pullRequest}${escapeHtml(status)}</span>
      </span>
      <span class="github-embed-title">${escapeHtml(data.title)}</span>
      <span class="github-embed-meta">
        <span>#${fullNumberFormatter.format(data.number)} by ${escapeHtml(data.user.login)}</span>
        <span aria-hidden="true">·</span>
        <time datetime="${escapeHtml(statusDate)}">${dateFormatter.format(new Date(statusDate))}</time>
      </span>
      <span aria-label="Pull request changes" class="github-embed-stats">
        <span class="github-embed-additions">+${fullNumberFormatter.format(data.additions)}</span>
        <span class="github-embed-deletions">−${fullNumberFormatter.format(data.deletions)}</span>
        <span>${fullNumberFormatter.format(data.changed_files)} ${fileLabel}</span>
      </span>`,
    href: data.html_url,
    label: `Open pull request ${parsed.owner}/${parsed.repo} #${data.number} on GitHub`,
  });
}

function renderRepository(data) {
  const archivedStatus = data.archived
    ? '<span class="github-embed-status github-embed-status-archived">Archived</span>'
    : "";
  const description =
    data.description === null
      ? ""
      : `<span class="github-embed-description">${escapeHtml(data.description)}</span>`;
  const language =
    data.language === null
      ? ""
      : `<span class="github-embed-language"><span aria-hidden="true"></span>${escapeHtml(data.language)}</span>`;

  return renderShell({
    content: `
      <span class="github-embed-header">
        <span class="github-embed-repository">${icons.branch}GitHub repository</span>
        ${archivedStatus}
      </span>
      <span class="github-embed-title">${escapeHtml(data.full_name)}</span>
      ${description}
      <span aria-label="Repository statistics" class="github-embed-stats">
        ${language}
        <span>${icons.star}${compactNumberFormatter.format(data.stargazers_count)}</span>
        <span>${icons.fork}${compactNumberFormatter.format(data.forks_count)}</span>
        <span>${icons.issue}${compactNumberFormatter.format(data.open_issues_count)}</span>
      </span>`,
    href: data.html_url,
    label: `Open ${data.full_name} on GitHub`,
  });
}

function renderFallback(parsed) {
  const label =
    parsed.kind === "pull"
      ? `${parsed.owner}/${parsed.repo} pull request #${parsed.number}`
      : parsed.kind === "code"
        ? `${parsed.owner}/${parsed.repo}/${parsed.filePath}`
        : `${parsed.owner}/${parsed.repo}`;
  const description =
    parsed.kind === "code"
      ? `View ${getLineLabel(parsed).toLowerCase()} at commit ${parsed.commit.slice(0, 7)} on GitHub.`
      : `View this ${parsed.kind === "pull" ? "pull request" : "repository"} on GitHub.`;

  return renderShell({
    content: `
      <span class="github-embed-header">
        <span class="github-embed-repository">${icons.branch}GitHub</span>
      </span>
      <span class="github-embed-title">${escapeHtml(label)}</span>
      <span class="github-embed-description">${escapeHtml(description)}</span>`,
    href: parsed.href,
    label: `Open ${label} on GitHub`,
  });
}

async function fetchGitHubResource(parsed) {
  const resourcePath =
    parsed.kind === "pull"
      ? `repos/${encodeURIComponent(parsed.owner)}/${encodeURIComponent(parsed.repo)}/pulls/${parsed.number}`
      : parsed.kind === "code"
        ? `repos/${encodeURIComponent(parsed.owner)}/${encodeURIComponent(parsed.repo)}/contents/${parsed.filePath
            .split("/")
            .map((segment) => encodeURIComponent(segment))
            .join("/")}?ref=${encodeURIComponent(parsed.commit)}`
        : `repos/${encodeURIComponent(parsed.owner)}/${encodeURIComponent(parsed.repo)}`;
  const token = env.GITHUB_TOKEN ?? env.GH_TOKEN;
  const headers = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": GITHUB_API_VERSION,
  };

  if (typeof token === "string" && token !== "") {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`https://api.github.com/${resourcePath}`, {
    headers,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`GitHub returned ${response.status}`);
  }

  return await response.json();
}

const githubTransformer = {
  async getHTML(url) {
    const parsed = parseGitHubUrl(url);

    if (parsed === null) {
      return null;
    }

    const data = await fetchGitHubResource(parsed);
    if (parsed.kind === "pull") {
      return renderPullRequest(parsed, data);
    }

    if (parsed.kind === "code") {
      return await renderCodeReference(parsed, data);
    }

    return renderRepository(data);
  },
  name: "github-repository-pull-request-and-code-reference",
  shouldTransform(url) {
    return parseGitHubUrl(url) !== null;
  },
};

export { dedentCode, githubTransformer, parseGitHubUrl };

export default function remarkEmbedGitHub() {
  return remarkEmbedder({
    cache: embedCache,
    handleError({ url }) {
      const parsed = parseGitHubUrl(url);
      return parsed === null ? null : renderFallback(parsed);
    },
    transformers: [githubTransformer],
  });
}
