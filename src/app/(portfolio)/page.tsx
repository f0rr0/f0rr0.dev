import { ArrowDown, ArrowUpRight, Star } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { GitHubTimeline } from "@/components/github-timeline";
import { SiteShell } from "@/components/site-shell";
import { featuredProjectNames, projectEditorial } from "@/content/home";
import { getBlogPosts } from "@/lib/blog-utils";
import { formatDate } from "@/lib/date";
import { getInitialGitHubActivity } from "@/lib/github-activity-feed";
import { getGitHubProfile } from "@/lib/github-profile";
import { publicUrl, siteConfig } from "@/lib/site";

const description =
  "Sid Jain is an applied AI engineer building useful, durable products and production systems. Explore his open-source work, GitHub activity, and writing.";

export const metadata: Metadata = {
  alternates: {
    canonical: "/",
  },
  description,
  openGraph: {
    description,
    images: [
      {
        alt: "Sid Jain — Applied AI engineer",
        height: 630,
        url: "/opengraph-image",
        width: 1200,
      },
    ],
    locale: siteConfig.locale,
    siteName: siteConfig.name,
    title: "Sid Jain — Applied AI engineer",
    type: "website",
    url: publicUrl("/"),
  },
  title: {
    absolute: "Sid Jain — Applied AI engineer",
  },
  twitter: {
    card: "summary_large_image",
    description,
    images: [
      {
        alt: "Sid Jain — Applied AI engineer",
        height: 630,
        url: "/opengraph-image",
        width: 1200,
      },
    ],
    title: "Sid Jain — Applied AI engineer",
  },
};

export const revalidate = 900;

export default async function Home() {
  const [github, posts, activity] = await Promise.all([
    getGitHubProfile(),
    getBlogPosts(),
    getInitialGitHubActivity(),
  ]);
  const projectByName = new Map(
    github.projects.map((project) => [project.name, project])
  );
  const featuredProjects = featuredProjectNames.flatMap((name) => {
    const project = projectByName.get(name);
    return project === undefined ? [] : [project];
  });
  const projects = featuredProjects.slice(0, 4);
  const recentPosts = posts.slice(0, 3);

  return (
    <SiteShell currentPath="/" includeFooter>
      <main className="site-container pb-20 pt-10 sm:pb-24 sm:pt-16">
        <section
          aria-labelledby="home-title"
          className="relative grid min-h-[26rem] content-center sm:min-h-[30rem]"
        >
          <div>
            <h1
              className="max-w-[16ch] font-serif text-[2.5rem] font-bold leading-[1.08] tracking-[-0.035em] text-foreground sm:text-6xl sm:leading-[1.04]"
              id="home-title"
            >
              Building AI products that hold up in the real world.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground sm:text-xl">
              I’m Sid Jain, an applied AI engineer. I take ambiguous problems
              from discovery to production—shaping the product, designing the
              system, and staying for the operational details.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-x-6 gap-y-3 font-ui text-sm font-medium">
              <a
                className="group inline-flex items-center gap-2 rounded-sm text-primary transition-colors hover:text-brand-hover focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
                href="#timeline"
              >
                Follow the work
                <ArrowDown
                  aria-hidden="true"
                  className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-y-0.5"
                />
              </a>
              <Link
                className="group inline-flex items-center gap-1.5 rounded-sm text-foreground transition-colors hover:text-brand-hover focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
                href="/resume"
                prefetch={false}
              >
                Résumé
                <ArrowUpRight
                  aria-hidden="true"
                  className="h-3.5 w-3.5 transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
                />
              </Link>
            </div>
          </div>
        </section>

        <GitHubTimeline initialPage={activity} />

        <section
          aria-label="Selected work and recent writing"
          className="home-section grid gap-16 lg:grid-cols-2 lg:gap-16"
        >
          <div>
            <div className="flex items-baseline justify-between gap-4">
              <h2 className="font-serif text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                Selected work
              </h2>
              <a
                className="shrink-0 rounded-sm font-ui text-sm text-muted-foreground transition-colors hover:text-brand-hover focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
                href={github.profileUrl}
                rel="noopener noreferrer"
                target="_blank"
              >
                All on GitHub
              </a>
            </div>
            <ol className="mt-6 divide-y divide-border border-y border-border">
              {projects.map((project) => {
                const editorial =
                  projectEditorial[
                    project.name as keyof typeof projectEditorial
                  ];

                return (
                  <li key={project.name}>
                    <a
                      className="group block py-5 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
                      href={project.url}
                      rel="noopener noreferrer"
                      target="_blank"
                    >
                      <div className="flex items-baseline justify-between gap-4">
                        <h3 className="font-serif text-lg font-bold tracking-tight text-foreground transition-colors group-hover:text-brand-hover">
                          {project.name}
                        </h3>
                        {project.stars === null ? null : (
                          <span className="inline-flex shrink-0 items-center gap-1 font-mono text-xs text-muted-foreground">
                            <Star aria-hidden="true" className="h-3 w-3" />
                            {project.stars}
                          </span>
                        )}
                      </div>
                      <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                        {editorial?.description ?? project.description}
                      </p>
                      <div className="mt-3 flex items-center gap-3 font-ui text-[0.6875rem] uppercase tracking-[0.1em] text-muted-foreground">
                        {editorial === undefined ? null : (
                          <span className="text-primary">
                            {editorial.bucket}
                          </span>
                        )}
                        {project.language === null ? null : (
                          <span>{project.language}</span>
                        )}
                      </div>
                    </a>
                  </li>
                );
              })}
            </ol>
          </div>

          <div>
            <div className="flex items-baseline justify-between gap-4">
              <h2 className="font-serif text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                Recent writing
              </h2>
              <Link
                className="shrink-0 rounded-sm font-ui text-sm text-muted-foreground transition-colors hover:text-brand-hover focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
                href="/blog"
                prefetch={false}
              >
                All notes
              </Link>
            </div>
            <ol className="mt-6 divide-y divide-border border-y border-border">
              {recentPosts.map((post) => (
                <li key={post.slug}>
                  <Link
                    className="group block py-5 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
                    href={`/blog/${post.slug}`}
                    prefetch={false}
                  >
                    <h3 className="font-serif text-lg font-bold leading-snug tracking-tight text-foreground transition-colors group-hover:text-brand-hover">
                      {post.metadata.title}
                    </h3>
                    <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-muted-foreground">
                      {post.metadata.summary}
                    </p>
                    <p className="mt-3 font-mono text-[0.6875rem] uppercase tracking-[0.1em] text-muted-foreground">
                      <time dateTime={post.date.toISOString()}>
                        {formatDate(post.date, siteConfig.language)}
                      </time>
                      <span aria-hidden="true"> · </span>
                      {post.readingTime}
                    </p>
                  </Link>
                </li>
              ))}
            </ol>
          </div>
        </section>
      </main>
    </SiteShell>
  );
}
