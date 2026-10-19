"use client";

import { PreviewCard as HoverCardPrimitive } from "@base-ui/react/preview-card";
import { createContext, use, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

import {
  HoverCard,
  HoverCardTrigger as UpstreamHoverCardTrigger,
} from "@/components/ui/hover-card";
import { cn } from "@/lib/utils";

const WarmPreview = createContext(false);

const HoverCardGroup = ({ children }: { children: ReactNode }) => {
  const [warm, setWarm] = useState(false);
  const reset = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (reset.current !== null) {
        clearTimeout(reset.current);
      }
    },
    []
  );
  return (
    <WarmPreview value={warm}>
      <HoverCard
        onOpenChange={(open) => {
          if (reset.current !== null) {
            clearTimeout(reset.current);
          }
          if (open) {
            setWarm(true);
          } else {
            reset.current = setTimeout(() => {
              setWarm(false);
            }, 400);
          }
        }}
      >
        {({ payload }) => (
          <>
            {children}
            {payload as ReactNode}
          </>
        )}
      </HoverCard>
    </WarmPreview>
  );
};

const HoverCardTrigger = (props: HoverCardPrimitive.Trigger.Props) => {
  const warm = use(WarmPreview);
  return (
    <UpstreamHoverCardTrigger
      delay={warm ? 0 : 250}
      closeDelay={100}
      {...props}
    />
  );
};

const HoverCardContent = ({
  className,
  children,
  side = "left",
  ...props
}: HoverCardPrimitive.Popup.Props &
  Pick<HoverCardPrimitive.Positioner.Props, "side">) => (
  <HoverCardPrimitive.Portal>
    <HoverCardPrimitive.Positioner
      align="start"
      className="z-50 h-(--positioner-height) w-(--positioner-width) transition-[top,left,right,bottom,transform] duration-(--motion-layout) ease-(--ease-settle) motion-reduce:transition-none"
      side={side}
      sideOffset={24}
      collisionPadding={16}
      collisionAvoidance={{
        side: "flip",
        align: "shift",
        fallbackAxisSide: "end",
      }}
    >
      <HoverCardPrimitive.Popup
        className={cn(
          "bg-popover text-popover-foreground site-popup h-(--popup-height,auto) w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border text-sm shadow-md outline-none",
          className
        )}
        data-slot="hover-card-content"
        {...props}
      >
        <HoverCardPrimitive.Viewport className="site-preview-viewport">
          {children}
        </HoverCardPrimitive.Viewport>
      </HoverCardPrimitive.Popup>
    </HoverCardPrimitive.Positioner>
  </HoverCardPrimitive.Portal>
);

export { HoverCardGroup, HoverCardContent, HoverCardTrigger };
