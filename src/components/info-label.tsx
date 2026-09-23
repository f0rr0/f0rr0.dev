import { Info } from "lucide-react";

import {
  TooltipContent,
  TooltipGroup,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export function InfoLabel({
  label,
  description,
}: {
  label: string;
  description: string;
}) {
  return (
    <TooltipGroup>
      <span className="inline-flex max-w-full items-center gap-0.5 align-middle">
        <span className="min-w-0">{label}</span>
        <TooltipTrigger
          aria-label={`About ${label.toLowerCase()}`}
          payload={
            <TooltipContent className="max-w-[calc(100vw-2rem)] sm:max-w-xs">
              {description}
            </TooltipContent>
          }
          className="inline-flex size-6 shrink-0 items-center justify-center rounded-sm text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          type="button"
        >
          <Info aria-hidden="true" className="size-3" />
        </TooltipTrigger>
      </span>
    </TooltipGroup>
  );
}
