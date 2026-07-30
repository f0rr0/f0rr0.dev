import { Download } from "lucide-react";
import Image from "next/image";

import { SiteActionLink } from "@/components/site-action-link";
import type { AskAgentAction } from "@/lib/resume";

export function ResumeDownloadButton() {
  return (
    <SiteActionLink
      href="/resume/sid-jain-resume.pdf"
      download
      className="print:hidden"
      icon={<Download aria-hidden="true" className="h-4 w-4" />}
    >
      Download PDF
    </SiteActionLink>
  );
}

const agentButtonClass =
  "group inline-flex items-center gap-1.5 rounded-md px-1 py-0.5 font-medium text-foreground underline-offset-4 transition-colors hover:text-brand-hover hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

export function ResumeAskAgents({
  actions,
}: Readonly<{
  actions: readonly AskAgentAction[];
}>) {
  return (
    <footer className="mt-12 border-t border-border pt-6 print:hidden">
      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-2 text-sm text-muted-foreground">
        <span>Ask</span>
        {actions.map((action, index) => (
          <span
            key={action.label}
            className="inline-flex items-center gap-x-1.5"
          >
            <a
              href={action.href}
              className={agentButtonClass}
              target={action.external === true ? "_blank" : undefined}
              rel={action.external === true ? "noopener noreferrer" : undefined}
              aria-label={action.description}
            >
              <Image
                alt=""
                aria-hidden="true"
                className="h-3.5 w-3.5 shrink-0 object-contain"
                height={14}
                src={action.iconSrc}
                width={14}
              />
              {action.label}
            </a>
            {index === 0 ? <span>or</span> : null}
          </span>
        ))}
        <span>about me.</span>
      </div>
    </footer>
  );
}
