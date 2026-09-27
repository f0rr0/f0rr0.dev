"use client";

import { motion, useSpring } from "motion/react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

const spring = { stiffness: 1000, damping: 45, mass: 0.5 };
const motionQuery = "(prefers-reduced-motion: reduce)";
const subscribe = (onChange: () => void) => {
  const query = matchMedia(motionQuery);
  query.addEventListener("change", onChange);
  return () => {
    query.removeEventListener("change", onChange);
  };
};
const getReducedMotion = () => matchMedia(motionQuery).matches;
const getServerReducedMotion = () => true;

export function AskAiFace() {
  const face = useRef<HTMLSpanElement>(null);
  const reducedMotion = useSyncExternalStore(
    subscribe,
    getReducedMotion,
    getServerReducedMotion
  );
  const [tracking, setTracking] = useState(false);
  const x = useSpring(0, spring);
  const y = useSpring(0, spring);

  useEffect(() => {
    const mobile = matchMedia("(hover: none), (pointer: coarse)").matches;
    let idleTimer = 0;
    const rest = () => {
      clearTimeout(idleTimer);
      x.set(0);
      y.set(0);
      setTracking(false);
    };
    const follow = (event: PointerEvent) => {
      if (mobile || event.pointerType !== "mouse" || !face.current) {
        return;
      }
      const rect = face.current.getBoundingClientRect();
      x.set(Math.tanh((event.clientX - rect.x - rect.width / 2) / 400) * 6);
      y.set(Math.tanh((event.clientY - rect.y - rect.height / 2) / 300) * 5);
      setTracking(true);
      clearTimeout(idleTimer);
      idleTimer = window.setTimeout(rest, 2500);
    };
    if (reducedMotion) {
      rest();
    } else if (!mobile) {
      window.addEventListener("pointermove", follow, { passive: true });
      window.addEventListener("blur", rest);
      document.addEventListener("pointerleave", rest);
      document.addEventListener("visibilitychange", rest);
    }
    return () => {
      clearTimeout(idleTimer);
      x.set(0);
      y.set(0);
      window.removeEventListener("pointermove", follow);
      window.removeEventListener("blur", rest);
      document.removeEventListener("pointerleave", rest);
      document.removeEventListener("visibilitychange", rest);
    };
  }, [reducedMotion, x, y]);

  return (
    <span
      ref={face}
      aria-hidden="true"
      className="relative flex size-7 items-center justify-center rounded-full bg-primary text-primary-foreground"
    >
      <motion.span
        style={{ x: reducedMotion ? 0 : x, y: reducedMotion ? 0 : y }}
      >
        <motion.span
          className="block"
          initial={false}
          animate={{
            x: reducedMotion || tracking ? 0 : [null, 0, -3, -3, 2, 2, 0],
            y: reducedMotion || tracking ? 0 : [null, 0, -1, -1, 1, 1, 0],
          }}
          transition={
            reducedMotion
              ? { duration: 0 }
              : tracking
                ? { type: "spring", ...spring }
                : {
                    duration: 6,
                    times: [0, 0.22, 0.24, 0.56, 0.58, 0.94, 1],
                    repeat: Infinity,
                    ease: "easeInOut",
                  }
          }
        >
          <motion.span
            className="flex items-center gap-1.25 [&>span]:h-2 [&>span]:w-0.75 [&>span]:rounded-full [&>span]:bg-current [&>span]:transition-[height] [&>span]:duration-(--motion-fast) [&>span]:ease-(--ease-settle) group-hover:[&>span]:h-1.5 [@media(hover:hover)_and_(pointer:fine)]:group-focus-visible:[&>span]:h-1.5 [@media(hover:hover)_and_(pointer:fine)]:group-data-popup-open:[&>span]:h-1.5 motion-reduce:[&>span]:transition-none"
            animate={{
              scaleY: reducedMotion
                ? 1
                : [1, 1, 0.12, 1, 1, 0.12, 1, 1, 0.12, 1, 1],
            }}
            transition={{
              duration: reducedMotion ? 0 : 6,
              times: [
                0, 0.4, 0.41, 0.43, 0.78, 0.79, 0.81, 0.85, 0.86, 0.88, 1,
              ],
              repeat: reducedMotion ? 0 : Infinity,
            }}
          >
            <span />
            <span />
          </motion.span>
        </motion.span>
      </motion.span>
    </span>
  );
}
