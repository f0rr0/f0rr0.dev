"use client";

import { Popover } from "@base-ui/react/popover";
import { Menu } from "lucide-react";
import type { ReactNode } from "react";

export function SiteMobileMenu({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <Popover.Root>
      <Popover.Trigger
        aria-label="Navigation menu"
        className="inline-flex size-11 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-brand-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring md:hidden"
      >
        <Menu aria-hidden="true" className="size-5" />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner
          align="end"
          sideOffset={8}
          className="z-50 md:hidden"
        >
          <Popover.Popup
            aria-label="Navigation menu"
            className="overflow-hidden rounded-lg bg-popover p-0 text-popover-foreground shadow-site-floating ring-1 ring-border outline-none site-popup w-48"
          >
            <ul className="[&_.site-nav-link]:flex [&_.site-nav-link]:rounded-none [&_.site-nav-link]:focus-visible:-outline-offset-2 [&_.site-nav-link]:hover:bg-accent">
              {children}
            </ul>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
