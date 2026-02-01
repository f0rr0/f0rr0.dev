"use client";

import { UseCanvas } from "@14islands/r3f-scroll-rig";
import dynamic from "next/dynamic";
import type { ComponentProps, MutableRefObject } from "react";

type ScrollSceneComponent =
  typeof import("@14islands/r3f-scroll-rig").ScrollScene;
type ScrollSceneWrapperProps = Omit<
  ComponentProps<ScrollSceneComponent>,
  "track"
> & {
  track: MutableRefObject<HTMLElement | null>;
};

const ScrollScene = dynamic(
  () => import("@14islands/r3f-scroll-rig").then((mod) => mod.ScrollScene),
  { ssr: false },
);

export default function ScrollSceneWrapper({
  track,
  ...props
}: ScrollSceneWrapperProps) {
  return (
    <UseCanvas>
      <ScrollScene {...props} track={track as MutableRefObject<HTMLElement>} />
    </UseCanvas>
  );
}
