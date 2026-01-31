'use client'

import { useRef } from 'react'

import dynamic from 'next/dynamic'
import ScrollSceneWrapper from '@/components/canvas/ScrollSceneWrapper'

import ErrorBoundary from '@/components/ErrorBoundary'

const Hero3D = dynamic(() => import('@/components/canvas/Hero3D'), { ssr: false })

export default function Home() {
  const el = useRef<any>(null)
  return (
    <main className="w-full">
      {/* Hero Section */}
      <section ref={el} className="relative h-screen w-full flex items-center justify-center p-10">
        <div className="relative z-10 text-center pointer-events-none mix-blend-difference text-white">
          <h1 className="text-6xl md:text-9xl font-bold tracking-tighter mb-4">
            CREATIVE
            <br />
            DEVELOPER
          </h1>
          <p className="text-xl md:text-2xl font-light tracking-wide">
            Building digital experiences
          </p>
        </div>

        {/* 3D Background for Hero */}
        <div className="absolute inset-0 z-0 hidden md:block">
          <ScrollSceneWrapper track={el}>
            {(props: any) => (
              <ErrorBoundary>
                <Hero3D {...props} />
              </ErrorBoundary>
            )}
          </ScrollSceneWrapper>
        </div>
      </section>

      {/* About Section */}
      <section className="min-h-screen w-full flex items-center justify-center bg-zinc-50 dark:bg-zinc-900 p-10">
        <div className="max-w-4xl w-full">
          <h2 className="text-4xl md:text-6xl font-bold mb-8">About Me</h2>
          <p className="text-lg md:text-xl leading-relaxed text-zinc-600 dark:text-zinc-300">
            I am a passionate developer with a keen eye for design. I specialize in building
            interactive web experiences using modern technologies like React, Three.js, and Next.js.
          </p>
        </div>
      </section>

      {/* Projects Section Placeholder */}
      <section className="min-h-screen w-full flex flex-col items-center justify-center p-10">
        <h2 className="text-4xl md:text-6xl font-bold mb-16">Selected Works</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full max-w-6xl">
          {[1, 2, 3, 4].map((item) => (
            <div key={item} className="aspect-video bg-zinc-200 dark:bg-zinc-800 rounded-lg flex items-center justify-center">
              <span className="text-zinc-400">Project {item}</span>
            </div>
          ))}
        </div>
      </section>
    </main>
  )
}
