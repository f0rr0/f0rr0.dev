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

function HoverCardGroup({ children }: { children: ReactNode }) {
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
}

function HoverCardTrigger(props: HoverCardPrimitive.Trigger.Props) {
  const warm = use(WarmPreview);
  return (
    <UpstreamHoverCardTrigger
      delay={warm ? 0 : 250}
      closeDelay={100}
      {...props}
    />
  );
}

function HoverCardContent({
  className,
  children,
  side = "left",
  ...props
}: HoverCardPrimitive.Popup.Props &
  Pick<HoverCardPrimitive.Positioner.Props, "side">) {
  return (
    <HoverCardPrimitive.Portal>
      <HoverCardPrimitive.Positioner
        align="start"
        className="site-preview-positioner [transition-property:top,_left,_right,_bottom,_transform] [transition-duration:240ms] [transition-timing-function:var(--ease-settle)] motion-reduce:transition-none z-50"
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
            "site-preview w-80 max-w-[calc(100vw-2rem)] rounded-xl border bg-popover text-sm text-popover-foreground shadow-site-floating [height:var(--popup-height,_auto)] [--popup-enter-x:0px] [--popup-enter-y:-4px] [transform-origin:var(--transform-origin)] [transition:opacity_160ms_ease-out,_transform_220ms_var(--ease-settle),_height_240ms_var(--ease-settle)] [&[data-side='top']]:[--popup-enter-y:4px] [&[data-side='left']]:[--popup-enter-x:4px] [&[data-side='left']]:[--popup-enter-y:0px] [&[data-side='right']]:[--popup-enter-x:-4px] [&[data-side='right']]:[--popup-enter-y:0px] [&:is(_[data-starting-style],_[data-ending-style]_)]:opacity-0 [&:is(_[data-starting-style],_[data-ending-style]_)]:[transform:translate(var(--popup-enter-x),_var(--popup-enter-y))_scale(0.985)] [&[data-ending-style]]:[transition-duration:100ms] motion-reduce:transition-none overflow-hidden outline-none",
            className
          )}
          data-slot="hover-card-content"
          {...props}
        >
          <HoverCardPrimitive.Viewport className="preview-viewport relative size-full overflow-clip [--preview-enter-y:4px] [&[data-activation-direction='up']]:[--preview-enter-y:-4px] [&_>_:is([data-current],_[data-previous])]:w-full [&_>_:is([data-current],_[data-previous])]:[transition:opacity_140ms_ease-out,_translate_200ms_var(--ease-settle)] [&[data-transitioning]_>_[data-current]]:[transition-delay:45ms,_0ms] [&_>_[data-starting-style]]:opacity-0 [&_>_[data-starting-style]]:[translate:0_var(--preview-enter-y)] [&_>_[data-ending-style]]:opacity-0 [&_>_[data-ending-style]]:[translate:0_calc(-1_*_var(--preview-enter-y))] [&_>_[data-ending-style]]:[transition-duration:80ms] motion-reduce:[&_>_:is([data-current],_[data-previous])]:transition-none">
            {children}
          </HoverCardPrimitive.Viewport>
        </HoverCardPrimitive.Popup>
      </HoverCardPrimitive.Positioner>
    </HoverCardPrimitive.Portal>
  );
}

export { HoverCardGroup, HoverCardContent, HoverCardTrigger };
