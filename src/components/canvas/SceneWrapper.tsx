"use client";

import { SmoothScrollbar } from "@14islands/r3f-scroll-rig";
import dynamic from "next/dynamic";
import type { ComponentProps } from "react";

import ErrorBoundary from "@/components/ErrorBoundary";

type SceneComponent = typeof import("@/components/canvas/Scene").default;
type SceneProps = ComponentProps<SceneComponent>;

const Scene = dynamic<SceneProps>(() => import("@/components/canvas/Scene"), {
  ssr: false,
});

export default function SceneWrapper(props: SceneProps) {
  const eventSource =
    props.eventSource ??
    (typeof window !== "undefined" ? document.body : undefined);

  return (
    <ErrorBoundary>
      <SmoothScrollbar />
      <Scene {...props} eventSource={eventSource} />
    </ErrorBoundary>
  );
}
