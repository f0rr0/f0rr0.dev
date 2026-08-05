import remarkEmbedderModule from "@remark-embedder/core";

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
const REQUEST_TIMEOUT_MS = 5000;
const embedCache = new Map();

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
      : `${parsed.owner}/${parsed.repo}`;

  return renderShell({
    content: `
      <span class="github-embed-header">
        <span class="github-embed-repository">${icons.branch}GitHub</span>
      </span>
      <span class="github-embed-title">${escapeHtml(label)}</span>
      <span class="github-embed-description">View this ${parsed.kind === "pull" ? "pull request" : "repository"} on GitHub.</span>`,
    href: parsed.href,
    label: `Open ${label} on GitHub`,
  });
}

async function fetchGitHubResource(parsed) {
  const resourcePath =
    parsed.kind === "pull"
      ? `repos/${encodeURIComponent(parsed.owner)}/${encodeURIComponent(parsed.repo)}/pulls/${parsed.number}`
      : `repos/${encodeURIComponent(parsed.owner)}/${encodeURIComponent(parsed.repo)}`;
  const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
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
    return parsed.kind === "pull"
      ? renderPullRequest(parsed, data)
      : renderRepository(data);
  },
  name: "github-repository-and-pull-request",
  shouldTransform(url) {
    return parseGitHubUrl(url) !== null;
  },
};

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
