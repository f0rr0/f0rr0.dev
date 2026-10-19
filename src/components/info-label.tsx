"use client";

import { Popover } from "@base-ui/react/popover";
import { Info } from "lucide-react";

export const InfoLabel = ({
  label,
  description,
}: {
  label: string;
  description: string;
}) => {
  const lastSpace = label.lastIndexOf(" ");
  return (
    <Popover.Root>
      <span>
        {lastSpace === -1 ? null : label.slice(0, lastSpace + 1)}
        <span className="whitespace-nowrap">
          {label.slice(lastSpace + 1)}
          <Popover.Trigger
            aria-label={`About ${label.toLowerCase()}`}
            openOnHover
            delay={250}
            closeDelay={100}
            className="text-muted-foreground focus-visible:outline-ring ml-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-sm align-middle focus-visible:outline-2 focus-visible:outline-offset-2"
            type="button"
          >
            <Info aria-hidden="true" className="size-3" />
          </Popover.Trigger>
        </span>
      </span>
      <Popover.Portal>
        <Popover.Positioner
          side="top"
          sideOffset={4}
          collisionPadding={16}
          className="z-50"
        >
          <Popover.Popup className="bg-popover text-popover-foreground site-popup max-w-[calc(100vw-2rem)] rounded-xl border p-3 text-sm shadow-md outline-none sm:max-w-xs">
            <Popover.Title className="sr-only">{label}</Popover.Title>
            <Popover.Description>{description}</Popover.Description>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
};
