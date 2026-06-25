export default function Home() {
  return (
    <main className="w-full">
      <section className="relative flex min-h-[100svh] w-full items-center justify-center overflow-hidden bg-background px-6 py-24">
        <div className="absolute inset-0 -z-10 bg-[linear-gradient(to_bottom,var(--muted),transparent_42%),radial-gradient(circle_at_50%_20%,color-mix(in_oklab,var(--foreground)_14%,transparent),transparent_32%)]" />
        <div className="relative z-10 mx-auto max-w-5xl text-center">
          <h1 className="mb-4 text-6xl font-bold tracking-tight md:text-9xl">
            CREATIVE
            <br />
            DEVELOPER
          </h1>
          <p className="text-xl font-light text-muted-foreground md:text-2xl">
            Building digital experiences
          </p>
        </div>
      </section>

      <section className="flex min-h-screen w-full items-center justify-center bg-zinc-50 p-10 dark:bg-zinc-900">
        <div className="w-full max-w-4xl">
          <h2 className="mb-8 text-4xl font-bold md:text-6xl">About Me</h2>
          <p className="text-lg leading-relaxed text-zinc-600 dark:text-zinc-300 md:text-xl">
            I am a passionate developer with a keen eye for design. I specialize
            in building interactive web experiences using modern technologies
            like React, CSS, and Next.js.
          </p>
        </div>
      </section>

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
