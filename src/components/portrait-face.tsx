"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";

import {
  CompassFaceMachine,
  FACE_MOTION_ATLAS_SRC,
  FACE_MOTION_CONFIG,
  FACE_MOTION_POSTER_SRC,
  faceMotionAtlasPosition,
  poseFromClientPointer,
} from "@/lib/face-motion";
import type { FaceMotionPose } from "@/lib/face-motion";
import { cn } from "@/lib/utils";

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

export function PortraitFace({ className }: Readonly<{ className?: string }>) {
  const portrait = useRef<HTMLSpanElement>(null);
  const reducedMotion = useSyncExternalStore(
    subscribe,
    getReducedMotion,
    getServerReducedMotion
  );

  useEffect(() => {
    const mobile = matchMedia("(hover: none), (pointer: coarse)").matches;
    let ambientTimer = 0;
    let idleTimer = 0;
    let frameTimer = 0;
    let disposed = false;
    let ready = false;
    let loading = false;
    const machine = new CompassFaceMachine();
    const renderFrame = () => {
      if (!portrait.current) {
        return;
      }
      const frame = machine.getFrame();
      const position = faceMotionAtlasPosition(frame);
      portrait.current.style.backgroundPosition = `${position.xPercent}% ${position.yPercent}%`;
      portrait.current.dataset.frame = frame;
    };
    const advance = () => {
      frameTimer = 0;
      if (!ready || machine.isSettled()) {
        return;
      }
      machine.advance();
      renderFrame();
      if (!machine.isSettled()) {
        frameTimer = window.setTimeout(
          advance,
          mobile ? 100 : FACE_MOTION_CONFIG.frameIntervalMs
        );
      }
    };
    const look = (pose: FaceMotionPose) => {
      machine.setTarget(pose);
      if (!frameTimer) {
        advance();
      }
    };
    const rest = () => {
      clearTimeout(idleTimer);
      look("center");
    };
    const loadAtlas = async () => {
      if (loading) {
        return;
      }
      loading = true;
      try {
        const atlas = new window.Image();
        atlas.src = FACE_MOTION_ATLAS_SRC;
        await atlas.decode();
        if (!disposed && portrait.current) {
          portrait.current.style.backgroundImage = `url("${FACE_MOTION_ATLAS_SRC}")`;
          portrait.current.style.backgroundSize = "800% 800%";
          ready = true;
          renderFrame();
          advance();
        }
      } catch {
        // Keep the neutral portrait if the motion atlas cannot load.
      }
    };
    const follow = (event: PointerEvent) => {
      if (mobile || event.pointerType !== "mouse" || !portrait.current) {
        return;
      }
      void loadAtlas();
      const rect = portrait.current.getBoundingClientRect();
      look(poseFromClientPointer(event.clientX, event.clientY, rect));
      clearTimeout(idleTimer);
      idleTimer = window.setTimeout(rest, 2500);
    };
    const scheduleGlance = () => {
      const glance = async () => {
        if (!document.hidden) {
          await loadAtlas();
          if (disposed) {
            return;
          }
          if (ready && !document.hidden) {
            look(Math.random() < 0.5 ? "left" : "right");
            idleTimer = window.setTimeout(rest, 1100 + Math.random() * 500);
          }
        }
        scheduleGlance();
      };
      ambientTimer = window.setTimeout(
        () => {
          void glance();
        },
        4500 + Math.random() * 3000
      );
    };
    if (reducedMotion) {
      rest();
      if (portrait.current) {
        portrait.current.style.backgroundImage = `url("${FACE_MOTION_POSTER_SRC}")`;
        portrait.current.style.backgroundSize = "contain";
        portrait.current.style.backgroundPosition = "center";
        portrait.current.dataset.frame = "center";
      }
    } else {
      if (mobile) {
        scheduleGlance();
      } else {
        window.addEventListener("pointermove", follow, { passive: true });
      }
      window.addEventListener("blur", rest);
      document.addEventListener("pointerleave", rest);
      document.addEventListener("visibilitychange", rest);
    }
    return () => {
      disposed = true;
      clearTimeout(ambientTimer);
      clearTimeout(frameTimer);
      clearTimeout(idleTimer);
      window.removeEventListener("pointermove", follow);
      window.removeEventListener("blur", rest);
      document.removeEventListener("pointerleave", rest);
      document.removeEventListener("visibilitychange", rest);
    };
  }, [reducedMotion]);

  return (
    <span
      ref={portrait}
      aria-hidden="true"
      className={cn(
        "block size-7 shrink-0 rounded-full bg-primary bg-contain bg-center bg-no-repeat",
        className
      )}
      data-frame="center"
      style={{ backgroundImage: `url("${FACE_MOTION_POSTER_SRC}")` }}
    />
  );
}
