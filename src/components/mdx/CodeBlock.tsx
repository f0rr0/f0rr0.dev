/* oxlint-disable jsx-a11y/no-noninteractive-tabindex -- Scrollable code regions need keyboard access. */
import type { ComponentPropsWithoutRef, CSSProperties } from "react";

import CopyCodeButton from "@/components/mdx/CopyCodeButton";
import {
  TooltipContent,
  TooltipGroup,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  getCodeLanguageIconUrl,
  getCodeLanguageName,
} from "@/lib/code-languages";
import { githubIconPaths } from "@/lib/github-icons";

const codeBlockClassName =
  "code-block min-w-0 overflow-hidden [&_pre[data-theme]]:[max-width:100%] [&_pre[data-theme]]:[margin:0] [&_pre[data-theme]]:overflow-x-auto [&_pre[data-theme]]:[overscroll-behavior-inline:contain] [&_pre[data-theme]]:border-0 [&_pre[data-theme]]:rounded-none [&_pre[data-theme]]:bg-transparent [&_pre[data-theme]]:[padding:0] [&_pre[data-theme]]:[scrollbar-color:color-mix(in_oklab,_var(--muted-foreground)_48%,_transparent)_transparent] [&_pre[data-theme]]:[scrollbar-width:thin] [&_pre[data-theme]:focus-visible]:[outline:2px_solid_var(--ring)] [&_pre[data-theme]:focus-visible]:[outline-offset:-2px] [&_pre[data-theme]::-webkit-scrollbar]:h-3 [&_pre[data-theme]::-webkit-scrollbar-track]:[border-top:1px_solid_color-mix(in_oklab,_var(--border)_72%,_transparent)] [&_pre[data-theme]::-webkit-scrollbar-track]:[background:color-mix(in_oklab,_var(--muted)_58%,_transparent)] [&_pre[data-theme]::-webkit-scrollbar-thumb]:[border:0.2rem_solid_transparent] [&_pre[data-theme]::-webkit-scrollbar-thumb]:rounded-full [&_pre[data-theme]::-webkit-scrollbar-thumb]:[background:color-mix(in_oklab,_var(--muted-foreground)_52%,_transparent)] [&_pre[data-theme]::-webkit-scrollbar-thumb]:[background-clip:padding-box] [&_pre[data-theme]_>_code]:grid [&_pre[data-theme]_>_code]:w-max [&_pre[data-theme]_>_code]:min-w-full [&_pre[data-theme]_>_code]:pt-0 [&_pre[data-theme]_>_code]:pb-4 [&_pre[data-theme]_>_code]:bg-transparent [&_pre[data-theme]_>_code]:text-foreground [&_pre[data-theme]_>_code]:[font-size:0.875rem] [&_pre[data-theme]_>_code]:font-normal [&_[data-line]]:min-w-full [&_[data-line]]:px-4 [&_[data-highlighted-line]]:[background:color-mix(in_oklab,_var(--primary)_5%,_transparent)] [&_[data-highlighted-line]]:[box-shadow:inset_2px_0_0_color-mix(in_oklab,_var(--primary)_82%,_transparent)] [&_[data-highlighted-chars]]:[border-radius:0.25rem] [&_[data-highlighted-chars]]:[background:color-mix(in_oklab,_var(--primary)_15%,_transparent)] [&_[data-highlighted-chars]]:[box-shadow:0_0_0_0.125rem_color-mix(in_oklab,_var(--primary)_15%,_transparent)] max-sm:[&_[data-line]]:px-4 print:shadow-none print:[&_pre[data-theme]]:overflow-visible print:[&_pre[data-theme]]:whitespace-pre-wrap print:[&_pre[data-theme]_>_code]:[width:auto] print:[&_pre[data-theme]_>_code]:wrap-anywhere";

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
      <path d={githubIconPaths.mark} />
    </svg>
  );
}

function LanguageIcon({ language }: Readonly<{ language: string }>) {
  const languageName = getCodeLanguageName(language);
  const iconUrl = getCodeLanguageIconUrl(language);
  const iconStyle = {
    "--code-language-icon": `url("${iconUrl}")`,
  } as CSSProperties;

  return (
    <TooltipGroup>
      <TooltipTrigger
        aria-label={languageName}
        className="code-block-language size-8 shrink-0 cursor-default"
        payload={<TooltipContent>{languageName}</TooltipContent>}
      >
        <span
          aria-hidden="true"
          className="code-block-language-icon relative w-4 h-4 flex-none [&::before]:absolute [&::before]:[inset:0] [&::before]:[background:currentColor] [&::before]:content-[''] [&::before]:[mask:var(--code-language-icon)_center_/_contain_no-repeat]"
          style={iconStyle}
        />
      </TooltipTrigger>
    </TooltipGroup>
  );
}

export default function CodeBlock({
  children,
  ...props
}: Readonly<CodeBlockProps>) {
  const language = props["data-language"] ?? "plaintext";
  const languageName = getCodeLanguageName(language);
  const code = (
    <pre
      aria-label={`${languageName} code`}
      role="region"
      tabIndex={0}
      {...props}
    >
      {children}
    </pre>
  );

  if (props["data-github-code-embed"] === "true") {
    const owner = props["data-github-owner"] ?? "GitHub";
    const repo = props["data-github-repo"] ?? "repository";
    const filePath = props["data-github-path"] ?? "Source";
    const lineLabel = props["data-github-lines"] ?? "Referenced lines";
    const sourceHref = props["data-github-href"] ?? "https://github.com";

    return (
      <figure
        className={`${codeBlockClassName} github-code-embed [&_pre[data-theme]]:max-h-128 [&_pre[data-theme]]:overflow-y-auto [&_pre[data-theme]]:[overscroll-behavior:contain] [&_[data-line-number]]:block [&_[data-line-number]]:min-w-full [&_[data-line-number]]:pr-5 [&_[data-line-number]::before]:inline-block [&_[data-line-number]::before]:w-15 [&_[data-line-number]::before]:[margin-right:0.875rem] [&_[data-line-number]::before]:[border-right:1px_solid_color-mix(in_oklab,_var(--border)_78%,_transparent)] [&_[data-line-number]::before]:pr-3 [&_[data-line-number]::before]:text-secondary-foreground [&_[data-line-number]::before]:[content:attr(data-line-number)] [&_[data-line-number]::before]:tabular-nums [&_[data-line-number]::before]:text-right [&_[data-line-number]::before]:select-none  max-sm:[&_[data-line-number]]:pr-4 max-sm:[&_[data-line-number]::before]:w-14 max-sm:[&_[data-line-number]::before]:[margin-right:0.75rem] max-sm:[&_[data-line-number]::before]:[padding-right:0.65rem] print:shadow-none print:[&_pre[data-theme]]:[max-height:none] print:[&_pre[data-theme]]:overflow-visible print:[&_pre[data-theme]]:whitespace-pre-wrap print:[&_pre[data-theme]_>_code]:[width:auto] print:[&_pre[data-theme]_>_code]:wrap-anywhere`}
        data-language={language}
      >
        <figcaption className="github-code-embed-toolbar">
          <a
            aria-label={`View ${owner}/${repo}/${filePath}, ${lineLabel}, on GitHub`}
            className="github-code-embed-source inline-flex h-8 min-w-0 items-center gap-2 rounded px-2 text-secondary-foreground no-underline hover:underline hover:underline-offset-4 focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-1 [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:fill-current"
            href={sourceHref}
            rel="noreferrer noopener"
            target="_blank"
          >
            <GitHubMark />
            <span className="github-code-embed-source-label overflow-hidden text-ellipsis text-xs font-normal leading-4 whitespace-nowrap">
              {owner}/{repo}/{filePath}
            </span>
          </a>
          <div className="github-code-embed-meta ms-auto flex shrink-0 items-center gap-1">
            <LanguageIcon language={language} />
            <CopyCodeButton language={languageName} />
          </div>
        </figcaption>
        {code}
      </figure>
    );
  }

  return (
    <div className={codeBlockClassName} data-language={language}>
      <div className="code-block-toolbar">
        <LanguageIcon language={language} />
        <CopyCodeButton language={languageName} />
      </div>
      {code}
    </div>
  );
}
