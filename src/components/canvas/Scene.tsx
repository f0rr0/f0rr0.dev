"use client";

import { GlobalCanvas } from "@14islands/r3f-scroll-rig";
import { Preload } from "@react-three/drei";
import type { ComponentProps, ReactNode } from "react";

type SceneProps = Omit<ComponentProps<typeof GlobalCanvas>, "children"> & {
  children?: ReactNode;
};

export default function Scene({ children, ...props }: SceneProps) {
  // Everything defined in here will persist between route changes, only children are swapped
  return (
    <GlobalCanvas {...props}>
      <ambientLight intensity={0.5} />
      <directionalLight position={[10, 10, 5]} intensity={1} />
      {children}
      <Preload all />
    </GlobalCanvas>
  );
}
