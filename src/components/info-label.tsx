import { Info } from "lucide-react";

import {
  TooltipContent,
  TooltipGroup,
  TooltipTrigger,
} from "@/components/site-tooltip";

export function InfoLabel({
  label,
  description,
}: {
  label: string;
  description: string;
}) {
  const lastSpace = label.lastIndexOf(" ");
  return (
    <TooltipGroup>
      <span>
        {lastSpace === -1 ? null : label.slice(0, lastSpace + 1)}
        <span className="whitespace-nowrap">
          {label.slice(lastSpace + 1)}
          <TooltipTrigger
            aria-label={`About ${label.toLowerCase()}`}
            payload={
              <TooltipContent className="max-w-[calc(100vw-2rem)] sm:max-w-xs">
                {description}
              </TooltipContent>
            }
            className="ml-0.5 inline-flex align-middle size-6 shrink-0 items-center justify-center rounded-sm text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            type="button"
          >
            <Info aria-hidden="true" className="size-3" />
          </TooltipTrigger>
        </span>
      </span>
    </TooltipGroup>
  );
}
