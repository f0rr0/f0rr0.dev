"use client";

import { Popover } from "@base-ui/react/popover";
import { Menu } from "lucide-react";
import type { ReactNode } from "react";

export const SiteMobileMenu = ({
  children,
}: Readonly<{ children: ReactNode }>) => (
  <Popover.Root>
    <Popover.Trigger
      aria-label="Navigation menu"
      className="text-muted-foreground hover:bg-muted hover:text-brand-hover focus-visible:outline-ring inline-flex size-11 items-center justify-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 md:hidden"
    >
      <Menu aria-hidden="true" className="size-5" />
    </Popover.Trigger>
    <Popover.Portal>
      <Popover.Positioner align="end" sideOffset={8} className="z-50 md:hidden">
        <Popover.Popup
          aria-label="Navigation menu"
          className="bg-popover text-popover-foreground ring-border site-popup w-48 overflow-hidden rounded-lg p-0 shadow-md ring-1 outline-none"
        >
          <ul className="[&_.site-nav-link]:hover:bg-accent [&_.site-nav-link]:flex [&_.site-nav-link]:rounded-none [&_.site-nav-link]:focus-visible:-outline-offset-2">
            {children}
          </ul>
        </Popover.Popup>
      </Popover.Positioner>
    </Popover.Portal>
  </Popover.Root>
);
