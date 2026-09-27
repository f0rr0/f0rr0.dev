"use client";

import { motion, useReducedMotion, useSpring } from "motion/react";
import { useEffect, useRef } from "react";

const spring = { stiffness: 1000, damping: 45, mass: 0.5 };

export function AskAiFace() {
  const face = useRef<HTMLSpanElement>(null);
  const reducedMotion = useReducedMotion() === true;
  const x = useSpring(0, spring);
  const y = useSpring(0, spring);

  useEffect(() => {
    const trigger = face.current?.parentElement;
    const rest = () => {
      x.set(0);
      y.set(0);
    };
    const follow = (event: PointerEvent) => {
      if (event.pointerType !== "mouse" || !face.current) {
        return;
      }
      const rect = face.current.getBoundingClientRect();
      x.set(Math.tanh((event.clientX - rect.x - rect.width / 2) / 400) * 6);
      y.set(Math.tanh((event.clientY - rect.y - rect.height / 2) / 300) * 5);
    };
    if (
      reducedMotion ||
      !trigger ||
      matchMedia("(hover: none), (pointer: coarse)").matches
    ) {
      rest();
      return rest;
    }
    trigger.addEventListener("pointermove", follow, { passive: true });
    trigger.addEventListener("pointerleave", rest);
    return () => {
      trigger.removeEventListener("pointermove", follow);
      trigger.removeEventListener("pointerleave", rest);
      rest();
    };
  }, [reducedMotion, x, y]);

  return (
    <span
      ref={face}
      aria-hidden="true"
      className="relative flex size-7 items-center justify-center rounded-full bg-primary text-primary-foreground"
    >
      <motion.span
        className="flex items-center gap-1.25 [&>span]:h-2 [&>span]:w-0.75 [&>span]:rounded-full [&>span]:bg-current [&>span]:transition-[height] [&>span]:duration-(--motion-fast) [&>span]:ease-(--ease-settle) group-hover:[&>span]:h-1.5 [@media(hover:hover)_and_(pointer:fine)]:group-focus-visible:[&>span]:h-1.5 [@media(hover:hover)_and_(pointer:fine)]:group-data-popup-open:[&>span]:h-1.5 motion-reduce:[&>span]:transition-none"
        style={{ x: reducedMotion ? 0 : x, y: reducedMotion ? 0 : y }}
      >
        <span />
        <span />
      </motion.span>
    </span>
  );
}
