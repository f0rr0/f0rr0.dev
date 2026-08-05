import type { ComponentPropsWithoutRef, CSSProperties } from "react";

import CopyCodeButton from "@/components/mdx/CopyCodeButton";
import {
  getCodeLanguageIconUrl,
  getCodeLanguageName,
} from "@/lib/code-languages";

type CodeBlockProps = ComponentPropsWithoutRef<"pre"> & {
  "data-github-code-embed"?: string;
  "data-github-href"?: string;
  "data-github-lines"?: string;
  "data-github-owner"?: string;
  "data-github-path"?: string;
  "data-github-repo"?: string;
  "data-language"?: string;
};

function GitHubMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16">
      <path d="M6.766 11.328c-2.063-.25-3.516-1.734-3.516-3.656 0-.781.281-1.625.75-2.188-.203-.515-.172-1.609.063-2.062.625-.078 1.468.25 1.968.703.594-.187 1.219-.281 1.985-.281.765 0 1.39.094 1.953.265.484-.437 1.344-.765 1.969-.687.218.422.25 1.515.046 2.047.5.593.766 1.39.766 2.203 0 1.922-1.453 3.375-3.547 3.64.531.344.89 1.094.89 1.954v1.625c0 .468.391.734.86.547C13.781 14.359 16 11.53 16 8.03 16 3.61 12.406 0 7.984 0 3.563 0 0 3.61 0 8.031a7.88 7.88 0 0 0 5.172 7.422c.422.156.828-.125.828-.547v-1.25c-.219.094-.5.156-.75.156-1.031 0-1.64-.562-2.078-1.609-.172-.422-.36-.672-.719-.719-.187-.015-.25-.093-.25-.187 0-.188.313-.328.625-.328.453 0 .844.281 1.25.86.313.452.64.655 1.031.655s.641-.14 1-.5c.266-.265.47-.5.657-.656" />
    </svg>
  );
}

interface LanguageLabelProps {
  className: string;
  language: string;
}

function LanguageLabel({ className, language }: LanguageLabelProps) {
  const iconUrl = getCodeLanguageIconUrl(language);
  const iconStyle = {
    "--code-language-icon": `url("${iconUrl}")`,
  } as CSSProperties;

  return (
    <span className={className}>
      <span
        aria-hidden="true"
        className="code-block-language-icon"
        style={iconStyle}
      >
        <img
          alt=""
          className="code-block-language-icon-color"
          decoding="async"
          height="16"
          loading="lazy"
          src={iconUrl}
          width="16"
        />
      </span>
      <span>{getCodeLanguageName(language)}</span>
    </span>
  );
}

export default function CodeBlock({
  children,
  ...props
}: Readonly<CodeBlockProps>) {
  const language = props["data-language"] ?? "plaintext";
  const languageName = getCodeLanguageName(language);

  if (props["data-github-code-embed"] === "true") {
    const owner = props["data-github-owner"] ?? "GitHub";
    const repo = props["data-github-repo"] ?? "repository";
    const filePath = props["data-github-path"] ?? "Source";
    const lineLabel = props["data-github-lines"] ?? "Referenced lines";
    const sourceHref = props["data-github-href"] ?? "https://github.com";

    return (
      <figure className="code-block github-code-embed" data-language={language}>
        <figcaption className="github-code-embed-toolbar">
          <a
            aria-label={`View ${owner}/${repo}/${filePath}, ${lineLabel}, on GitHub`}
            className="github-code-embed-source"
            href={sourceHref}
            rel="noreferrer noopener"
            target="_blank"
          >
            <GitHubMark />
            <span className="github-code-embed-source-label">
              {owner}/{repo}/{filePath}
            </span>
          </a>
          <div className="github-code-embed-meta">
            <LanguageLabel
              className="github-code-embed-language"
              language={language}
            />
            <CopyCodeButton language={languageName} />
          </div>
        </figcaption>
        <pre {...props}>{children}</pre>
      </figure>
    );
  }

  return (
    <div className="code-block" data-language={language}>
      <div className="code-block-toolbar">
        <LanguageLabel className="code-block-language" language={language} />
        <CopyCodeButton language={languageName} />
      </div>
      <pre {...props}>{children}</pre>
    </div>
  );
}
