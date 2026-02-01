"use client";

import type { ScrollSceneChildProps } from "@14islands/r3f-scroll-rig";
import dynamic from "next/dynamic";
import { useRef } from "react";

import ScrollSceneWrapper from "@/components/canvas/ScrollSceneWrapper";
import ErrorBoundary from "@/components/ErrorBoundary";

const Hero3D = dynamic(() => import("@/components/canvas/Hero3D"), {
  ssr: false,
});

export default function Home() {
  const el = useRef<HTMLElement | null>(null);

  return (
    <main className="w-full">
      {/* Hero Section */}
      <section
        ref={el}
        className="relative flex h-screen w-full items-center justify-center p-10"
      >
        <div className="pointer-events-none relative z-10 text-center mix-blend-difference text-white">
          <h1 className="mb-4 text-6xl font-bold tracking-tighter md:text-9xl">
            CREATIVE
            <br />
            DEVELOPER
          </h1>
          <p className="text-xl font-light tracking-wide md:text-2xl">
            Building digital experiences
          </p>
        </div>

        {/* 3D Background for Hero */}
        <div className="absolute inset-0 z-0 hidden md:block">
          <ScrollSceneWrapper track={el}>
            {(props: ScrollSceneChildProps) => (
              <ErrorBoundary>
                <Hero3D {...props} />
              </ErrorBoundary>
            )}
          </ScrollSceneWrapper>
        </div>
      </section>

      {/* About Section */}
      <section className="flex min-h-screen w-full items-center justify-center bg-zinc-50 p-10 dark:bg-zinc-900">
        <div className="w-full max-w-4xl">
          <h2 className="mb-8 text-4xl font-bold md:text-6xl">About Me</h2>
          <p className="text-lg leading-relaxed text-zinc-600 dark:text-zinc-300 md:text-xl">
            I am a passionate developer with a keen eye for design. I specialize
            in building interactive web experiences using modern technologies
            like React, Three.js, and Next.js.
          </p>
        </div>
      </section>

      {/* Projects Section Placeholder */}
      <section className="flex min-h-screen w-full flex-col items-center justify-center p-10">
        <h2 className="mb-16 text-4xl font-bold md:text-6xl">Selected Works</h2>
        <div className="grid w-full max-w-6xl grid-cols-1 gap-8 md:grid-cols-2">
          {[1, 2, 3, 4].map((item) => (
            <div
              key={item}
              className="flex aspect-video items-center justify-center rounded-lg bg-zinc-200 dark:bg-zinc-800"
            >
              <span className="text-zinc-400">Project {item}</span>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
