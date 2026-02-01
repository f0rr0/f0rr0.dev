"use client";

import {
  type ScrollSceneChildProps,
  useScrollRig,
} from "@14islands/r3f-scroll-rig";
import { MeshDistortMaterial, Sphere } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import type * as THREE from "three";

type Hero3DProps = {
  scrollState?: ScrollSceneChildProps["scrollState"];
};

export default function Hero3D({ scrollState: _scrollState }: Hero3DProps) {
  const mesh = useRef<THREE.Mesh | null>(null);
  const { requestRender } = useScrollRig();

  useFrame((_state, delta) => {
    if (mesh.current) {
      // Basic rotation
      mesh.current.rotation.x += delta * 0.2;
      mesh.current.rotation.y += delta * 0.3;

      // If we had scrollState passed down or available via context, we could use it here
      // For now, just a continuous animation to prove 3D works
      requestRender();
    }
  });

  return (
    <Sphere args={[1, 32, 32]} ref={mesh} scale={1.5}>
      <MeshDistortMaterial
        color="#4a90e2"
        attach="material"
        distort={0.5}
        speed={2}
        roughness={0.2}
        metalness={0.8}
      />
    </Sphere>
  );
}
