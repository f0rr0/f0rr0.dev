"use client";

import { useEffect, useId, useRef } from "react";

import {
  CompassFaceMachine,
  FACE_MOTION_ALL_SOURCES,
  FACE_MOTION_CONFIG,
  FACE_MOTION_NEUTRAL_SRC,
  faceMotionEdgeSources,
  faceMotionFrameSource,
  poseFromClientPointer,
} from "@/lib/face-motion";
import type { FaceMotionFrame, FaceMotionPose } from "@/lib/face-motion";
import { cn } from "@/lib/utils";

interface FaceMotionPortraitProps {
  className?: string;
  eager?: boolean;
}

interface LatestPointer {
  active: boolean;
  clientX: number;
  clientY: number;
  id: number | null;
}

type FaceMotionStatus = "degraded" | "loading" | "ready" | "reduced-motion";

const NOOP_CLEANUP = () => {
  // No runtime listeners were installed.
};

const decodeImageSource = async (source: string): Promise<HTMLImageElement> => {
  const image = new window.Image();
  image.decoding = "async";
  image.src = source;
  await image.decode();

  if (image.naturalWidth <= 0) {
    throw new Error(`Decoded face-motion asset has no pixels: ${source}`);
  }

  return image;
};

export function FaceMotionPortrait({
  className,
  eager = false,
}: Readonly<FaceMotionPortraitProps>) {
  const instructionId = useId();
  const portraitRef = useRef<HTMLImageElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const portrait = portraitRef.current;
    const stage = stageRef.current;

    if (portrait === null || stage === null) {
      return NOOP_CLEANUP;
    }

    const motionPreference = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    );
    const latestPointer: LatestPointer = {
      active: false,
      clientX: 0,
      clientY: 0,
      id: null,
    };
    const decodedImages: HTMLImageElement[] = [];
    let machine = new CompassFaceMachine({
      intermediates: (from, to) => faceMotionEdgeSources(from, to).length,
    });
    let destroyed = false;
    let isReady = false;
    let isReducedMotion = motionPreference.matches;
    let preloadPromise: Promise<void> | null = null;
    let stepTimer = 0;

    const setStatus = (status: FaceMotionStatus) => {
      stage.dataset.faceMotionStatus = status;
      portrait.dataset.faceMotionStatus = status;
    };

    const setTargetDataset = (target: FaceMotionPose) => {
      stage.dataset.faceMotionTarget = target;
      portrait.dataset.faceMotionTarget = target;
    };

    const setSourceDataset = (source: string) => {
      stage.dataset.faceMotionSource = source;
      portrait.dataset.faceMotionSource = source;
    };

    const setPoseDataset = (pose: FaceMotionPose) => {
      stage.dataset.faceMotionPose = pose;
      portrait.dataset.faceMotionPose = pose;
    };

    const clearStepTimer = () => {
      if (stepTimer !== 0) {
        window.clearTimeout(stepTimer);
        stepTimer = 0;
      }
    };

    const commitSource = (source: string, pose: FaceMotionPose) => {
      if (portrait.getAttribute("src") !== source) {
        portrait.setAttribute("src", source);
      }

      setSourceDataset(source);
      setPoseDataset(pose);
    };

    const commitFrame = (frame: FaceMotionFrame) => {
      const source = faceMotionFrameSource(frame);

      if (source === null) {
        setStatus("degraded");
        return;
      }

      commitSource(source, machine.getPose());
    };

    const scheduleNextStep = () => {
      if (
        stepTimer !== 0 ||
        destroyed ||
        !isReady ||
        isReducedMotion ||
        machine.isSettled()
      ) {
        return;
      }

      stepTimer = window.setTimeout(() => {
        stepTimer = 0;
        commitFrame(machine.advance());
        scheduleNextStep();
      }, FACE_MOTION_CONFIG.frameIntervalMs);
    };

    const stepTowardTarget = (immediate = false) => {
      if (destroyed || !isReady || isReducedMotion || machine.isSettled()) {
        return;
      }

      if (immediate && stepTimer === 0) {
        commitFrame(machine.advance());
      }

      scheduleNextStep();
    };

    const setTarget = (target: FaceMotionPose, immediate = false) => {
      machine.setTarget(target);
      setTargetDataset(target);
      stepTowardTarget(immediate);
    };

    const resetToCenter = (immediate = false) => {
      latestPointer.active = false;
      latestPointer.id = null;

      if (immediate) {
        clearStepTimer();
        machine = new CompassFaceMachine({
          intermediates: (from, to) => faceMotionEdgeSources(from, to).length,
        });
        setTargetDataset(FACE_MOTION_CONFIG.centerPose);
        commitSource(FACE_MOTION_NEUTRAL_SRC, FACE_MOTION_CONFIG.centerPose);
        return;
      }

      setTarget(FACE_MOTION_CONFIG.centerPose, true);
    };

    const retargetFromLatestPointer = () => {
      if (!latestPointer.active || isReducedMotion) {
        return;
      }

      const target = poseFromClientPointer(
        latestPointer.clientX,
        latestPointer.clientY,
        stage.getBoundingClientRect()
      );
      setTarget(target, target === FACE_MOTION_CONFIG.centerPose);
    };

    const handleWindowPointerMove = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") {
        return;
      }

      latestPointer.active = true;
      latestPointer.clientX = event.clientX;
      latestPointer.clientY = event.clientY;
      latestPointer.id = null;
      retargetFromLatestPointer();
    };

    const handleWindowPointerOut = (event: PointerEvent) => {
      if (event.pointerType === "mouse" && event.relatedTarget === null) {
        resetToCenter();
      }
    };

    const handleTouchPointerDown = (event: PointerEvent) => {
      if (event.pointerType === "mouse") {
        return;
      }

      latestPointer.active = true;
      latestPointer.clientX = event.clientX;
      latestPointer.clientY = event.clientY;
      latestPointer.id = event.pointerId;
      stage.setPointerCapture(event.pointerId);
      retargetFromLatestPointer();
    };

    const handleTouchPointerMove = (event: PointerEvent) => {
      if (latestPointer.id !== event.pointerId) {
        return;
      }

      latestPointer.clientX = event.clientX;
      latestPointer.clientY = event.clientY;
      retargetFromLatestPointer();
    };

    const handleTouchPointerEnd = (event: PointerEvent) => {
      if (latestPointer.id !== event.pointerId) {
        return;
      }

      if (stage.hasPointerCapture(event.pointerId)) {
        stage.releasePointerCapture(event.pointerId);
      }

      resetToCenter();
    };

    const handleLayoutChange = () => {
      retargetFromLatestPointer();
    };

    const handleWindowBlur = () => {
      resetToCenter();
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        resetToCenter();
      } else {
        retargetFromLatestPointer();
      }
    };

    const preloadAllSources = async () => {
      const results = await Promise.allSettled(
        FACE_MOTION_ALL_SOURCES.map(decodeImageSource)
      );

      if (destroyed) {
        return;
      }

      let failedAssetCount = 0;

      for (const result of results) {
        if (result.status === "fulfilled") {
          decodedImages.push(result.value);
        } else {
          failedAssetCount += 1;
        }
      }

      isReady = true;
      setStatus(
        isReducedMotion
          ? "reduced-motion"
          : failedAssetCount > 0
            ? "degraded"
            : "ready"
      );

      if (!isReducedMotion) {
        retargetFromLatestPointer();
      }
    };

    const loadAllSources = async () => {
      if (preloadPromise === null) {
        setStatus("loading");
        preloadPromise = preloadAllSources();
      }

      await preloadPromise;
    };

    const handleMotionPreference = (event: MediaQueryListEvent) => {
      isReducedMotion = event.matches;

      if (isReducedMotion) {
        setStatus("reduced-motion");
        resetToCenter(true);
        return;
      }

      if (isReady) {
        setStatus("ready");
        retargetFromLatestPointer();
      } else {
        void loadAllSources();
      }
    };

    const handlePortraitError = () => {
      setStatus("degraded");

      if (portrait.getAttribute("src") !== FACE_MOTION_NEUTRAL_SRC) {
        resetToCenter(true);
      }
    };

    const scrollListenerOptions = {
      capture: true,
      passive: true,
    } as const;

    stage.addEventListener("pointerdown", handleTouchPointerDown, {
      passive: true,
    });
    stage.addEventListener("pointermove", handleTouchPointerMove, {
      passive: true,
    });
    stage.addEventListener("pointerup", handleTouchPointerEnd, {
      passive: true,
    });
    stage.addEventListener("pointercancel", handleTouchPointerEnd, {
      passive: true,
    });
    window.addEventListener("pointermove", handleWindowPointerMove, {
      capture: true,
      passive: true,
    });
    window.addEventListener("pointerout", handleWindowPointerOut, {
      passive: true,
    });
    window.addEventListener("resize", handleLayoutChange, { passive: true });
    window.addEventListener(
      "scroll",
      handleLayoutChange,
      scrollListenerOptions
    );
    window.addEventListener("blur", handleWindowBlur);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    portrait.addEventListener("error", handlePortraitError);
    motionPreference.addEventListener("change", handleMotionPreference);

    setSourceDataset(FACE_MOTION_NEUTRAL_SRC);
    setPoseDataset(FACE_MOTION_CONFIG.centerPose);
    setTargetDataset(FACE_MOTION_CONFIG.centerPose);

    if (isReducedMotion) {
      setStatus("reduced-motion");
    } else if (eager) {
      void loadAllSources();
    } else {
      const loadAfterNeutral = async () => {
        try {
          await portrait.decode();
        } catch {
          // The preloader below reports individual asset failures.
        }

        if (!destroyed) {
          await loadAllSources();
        }
      };

      void loadAfterNeutral();
    }

    return () => {
      destroyed = true;
      clearStepTimer();
      decodedImages.length = 0;
      stage.removeEventListener("pointerdown", handleTouchPointerDown);
      stage.removeEventListener("pointermove", handleTouchPointerMove);
      stage.removeEventListener("pointerup", handleTouchPointerEnd);
      stage.removeEventListener("pointercancel", handleTouchPointerEnd);
      window.removeEventListener("pointermove", handleWindowPointerMove, {
        capture: true,
      });
      window.removeEventListener("pointerout", handleWindowPointerOut);
      window.removeEventListener("resize", handleLayoutChange);
      window.removeEventListener(
        "scroll",
        handleLayoutChange,
        scrollListenerOptions
      );
      window.removeEventListener("blur", handleWindowBlur);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      portrait.removeEventListener("error", handlePortraitError);
      motionPreference.removeEventListener("change", handleMotionPreference);
    };
  }, [eager]);

  return (
    <figure
      className={cn(
        "flex w-full flex-col items-center justify-self-center print:hidden lg:items-end lg:justify-self-end",
        className
      )}
    >
      <div
        aria-describedby={instructionId}
        aria-label="Portrait of Sid Jain wearing his signature round sunglasses"
        className="relative isolate aspect-square w-[min(20rem,calc(100vw-4rem))] max-w-full touch-none select-none overflow-hidden rounded-[2rem] bg-muted/40 shadow-site-soft ring-1 ring-border/80"
        data-face-motion-pose="center"
        data-face-motion-source={FACE_MOTION_NEUTRAL_SRC}
        data-face-motion-status="loading"
        data-face-motion-target="center"
        ref={stageRef}
        role="img"
      >
        <img
          alt=""
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 h-full w-full object-contain"
          data-face-motion-pose="center"
          data-face-motion-source={FACE_MOTION_NEUTRAL_SRC}
          data-face-motion-status="loading"
          data-face-motion-target="center"
          decoding="async"
          draggable={false}
          fetchPriority={eager ? "high" : "auto"}
          loading={eager ? "eager" : "lazy"}
          ref={portraitRef}
          src={FACE_MOTION_NEUTRAL_SRC}
        />
      </div>
      <figcaption
        className="mt-2 max-w-80 text-center text-xs leading-5 text-muted-foreground lg:text-right"
        id={instructionId}
      >
        <span className="motion-reduce:hidden">
          Move anywhere on the page, or drag the portrait on touch, to look
          around.
        </span>
        <span className="hidden motion-reduce:inline">
          Portrait motion is paused by your reduced-motion preference.
        </span>
      </figcaption>
    </figure>
  );
}
