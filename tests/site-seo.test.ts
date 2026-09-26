import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";

test("deployment aliases never replace public identity, and only previews receive noindex headers", () => {
  for (const deployment of ["preview", "production"] as const) {
    const result = Bun.spawnSync(
      [
        process.execPath,
        "--eval",
        `const { default: config } = await import("./next.config.ts");
         const { siteConfig, publicUrl } = await import("./src/lib/site.ts");
         console.log(JSON.stringify({ origin: siteConfig.url, article: publicUrl("/writing/example"), headers: await config.headers(), redirects: await config.redirects(), rewrites: await config.rewrites?.() ?? [] }));`,
      ],
      {
        env: {
          ...process.env,
          NODE_ENV: "production",
          VERCEL_ENV: deployment,
          VERCEL_URL: "deployment-alias.vercel.app",
          VERCEL_PROJECT_PRODUCTION_URL: "project-alias.vercel.app",
        },
      }
    );
    expect(result.exitCode).toBe(0);
    const output = JSON.parse(result.stdout.toString());
    expect(output.origin).toBe("https://project-alias.vercel.app");
    expect(output.article).toBe(
      "https://project-alias.vercel.app/writing/example"
    );
    expect(output.redirects).toEqual([
      {
        source: "/blog/:path*",
        destination: "/writing/:path*",
        permanent: true,
      },
      {
        source: "/work-log/:path*",
        destination: "/work/:path*",
        permanent: true,
      },
      { source: "/resume", destination: "/journey", permanent: true },
    ]);
    expect(output.rewrites).toEqual([]);
    expect(output.headers).toEqual(
      deployment === "preview"
        ? [
            {
              source: "/:path*",
              headers: [{ key: "X-Robots-Tag", value: "noindex" }],
            },
          ]
        : []
    );
  }
});

test("an alternate profile drives site identity, structured exports, education and PDF URLs", () => {
  const result = Bun.spawnSync(
    [
      process.execPath,
      "--eval",
      `
    const { githubAccounts } = await import("./src/content/site.ts");
    githubAccounts.splice(0, githubAccounts.length, {login: "alice", id: "12345678"});
    const { resumeData, socialProfiles } = await import("./src/content/resume.ts");
    Object.assign(resumeData.person, {
      name: "Alice Example", role: "Engineer", email: "alice@example.com",
      image: "/alice.png", alternateNames: ["alice"],
      address: {city: "London", region: "England", countryCode: "GB"}
    });
    const linkedin = socialProfiles.find(profile => profile.network === "LinkedIn");
    Object.assign(linkedin, {username: "alice", url: "https://linkedin.com/in/alice"});
    resumeData.summary = "Builds useful software.";
    resumeData.experience.splice(0);
    resumeData.education.splice(0, resumeData.education.length, {
      company: "Example University", url: "https://university.example", tagline: "Education",
      roles: [{title: "Computer Science", dates: "2020 - 2024", location: "London"}]
    });
    const { siteConfig, resumePdfUrl } = await import("./src/lib/site.ts");
    const { buildJsonResume, buildLlmsTxt } = await import("./src/lib/resume.ts");
    const { buildProfilePageJsonLd } = await import("./src/lib/structured-data.ts");
    console.log(JSON.stringify({siteConfig, resumePdfUrl, resume: buildJsonResume(), profile: buildProfilePageJsonLd(), guide: buildLlmsTxt()}));
  `,
    ],
    { env: { ...process.env, VERCEL_PROJECT_PRODUCTION_URL: "alice.example" } }
  );
  expect(result.exitCode).toBe(0);
  const output = JSON.parse(result.stdout.toString());
  expect(output.siteConfig).toMatchObject({
    name: "Alice Example",
    url: "https://alice.example",
    author: { handle: "alice", image: "/alice.png" },
  });
  expect(output.resume.basics).toMatchObject({
    name: "Alice Example",
    email: "alice@example.com",
    location: { city: "London", countryCode: "GB" },
  });
  expect(output.resume.basics.profiles).toContainEqual({
    network: "GitHub",
    username: "alice",
    url: "https://github.com/alice",
  });
  expect(output.profile.mainEntity).toMatchObject({
    name: "Alice Example",
    alternateName: ["alice"],
    alumniOf: [
      {
        "@type": "EducationalOrganization",
        name: "Example University",
        sameAs: "https://university.example",
      },
    ],
  });
  expect(output.resume.education[0].institution).toBe("Example University");
  expect(output.resumePdfUrl).toBe("/resume/sid-jain-resume.pdf");
  expect(output.guide).toContain(
    "https://alice.example/resume/sid-jain-resume.pdf"
  );
});

test("main page content produces consistent search and social metadata", async () => {
  const { pages } = await import("../src/content/pages");
  const { buildPageMetadata } = await import("../src/lib/page-metadata");
  const { siteConfig, publicUrl } = await import("../src/lib/site");

  for (const page of Object.values(pages)) {
    const metadata = buildPageMetadata(page);
    expect(metadata.title.absolute).toBe(
      page.path === "/" ? siteConfig.name : `${page.title} | ${siteConfig.name}`
    );
    expect(metadata.description).toBe("Software and Writing");
    expect(metadata.openGraph.title).toBe(metadata.title.absolute);
    expect(metadata.twitter.title).toBe(metadata.title.absolute);
    expect(metadata.openGraph.description).toBe(metadata.description);
    expect(metadata.twitter.description).toBe(metadata.description);
    expect(metadata.alternates.canonical).toBe(publicUrl(page.path));
    expect(metadata.openGraph.url).toBe(metadata.alternates.canonical);
    expect(metadata.openGraph.locale).toBe(siteConfig.locale);
    expect(metadata.openGraph.siteName).toBe(siteConfig.name);
    expect(metadata.openGraph.type).toBe(
      page.path === "/journey" ? "profile" : "website"
    );
    expect(metadata.twitter.card).toBe("summary_large_image");
    expect(metadata.openGraph.images).toEqual([siteConfig.shareImage]);
    expect(metadata.twitter.images).toEqual([siteConfig.shareImage]);
    expect(JSON.stringify(metadata)).not.toMatch(/[—·]/);
  }

  const minimal = buildPageMetadata({ title: "Example", path: "/example" });
  expect(minimal.description).toBe("Software and Writing");
  expect(minimal.openGraph.description).toBe("Software and Writing");
  expect(minimal.twitter.description).toBe("Software and Writing");
  expect(minimal.openGraph.type).toBe("website");
  expect(Object.hasOwn(minimal, "robots")).toBe(false);
  const { buildProfilePageJsonLd } = await import("../src/lib/structured-data");
  const profile = buildProfilePageJsonLd();
  const journey = buildPageMetadata(pages.journey);
  expect(profile.description).toBe(journey.description);
  expect(profile.name).toBe(journey.title.absolute);
  expect(profile.url).toBe(journey.alternates.canonical);
  const { buildBlogCollectionJsonLd } =
    await import("../src/lib/structured-data");
  const collection = buildBlogCollectionJsonLd([]);
  expect(collection.name).toBe(buildPageMetadata(pages.writing).title.absolute);
  expect(collection.description).toBe("Software and Writing");
  expect(collection.url).toBe(publicUrl(pages.writing.path));
  const { resumeData } = await import("../src/content/resume");
  const { siteNavigation } = await import("../src/content/site");
  for (const [key, link] of Object.entries(siteNavigation)) {
    expect(resumeData.navItems).toContainEqual({
      href: link.path,
      label: link.title,
    });
    const page = pages[key as keyof typeof siteNavigation];
    expect(page.path).toBe(link.path);
    expect(page.title).not.toBe(link.title);
  }
  expect(pages.home.title).toBe(siteConfig.name);
  expect(pages.home.title).not.toBe(siteConfig.author.role);
  expect(siteConfig.shareImage.alt).toContain(siteConfig.name);
  const { default: sharp } = await import("sharp");
  const image = await sharp(`public${siteConfig.shareImage.url}`).metadata();
  expect(image.width).toBe(siteConfig.shareImage.width);
  expect(image.height).toBe(siteConfig.shareImage.height);
  expect(image.format).toBe("png");

  const writing = buildPageMetadata(pages.writing);
  expect(writing.alternates.types).toEqual({
    "application/rss+xml": "/rss.xml",
  });
  const published = buildPageMetadata({ ...pages.tokens, robots: undefined });
  expect(Object.hasOwn(published, "robots")).toBe(false);
  const hidden = buildPageMetadata({
    ...pages.tokens,
    robots: { index: false, follow: false },
  });
  expect(hidden.robots).toEqual({ index: false, follow: false });
});

test("blog metadata and JSON-LD share authored fields, URLs, images and dates", async () => {
  const { buildBlogMetadata } = await import("../src/lib/page-metadata");
  const { buildBlogPostingJsonLd } = await import("../src/lib/structured-data");
  const { siteConfig } = await import("../src/lib/site");
  const post = {
    slug: "example",
    importPath: "example/page.mdx",
    metadata: {
      title: "A new idea",
      summary: "What I learned.",
      author: siteConfig.name,
      date: "2026-09-01",
      tags: ["engineering"],
    },
    date: new Date("2026-09-01"),
    readingTime: "1 min read",
    wordCount: 100,
  };
  for (const updatedAt of [undefined, new Date("2026-09-02")]) {
    const article = { ...post, updatedAt };
    const metadata = buildBlogMetadata(article);
    const schema = buildBlogPostingJsonLd(article);
    expect(metadata.title.absolute).toBe(
      `${post.metadata.title} | ${siteConfig.name}`
    );
    expect(metadata.openGraph.title).toBe(metadata.title.absolute);
    expect(metadata.twitter.title).toBe(metadata.title.absolute);
    expect(metadata.openGraph.type).toBe("article");
    expect(metadata.description).toBe(post.metadata.summary);
    expect(schema.headline).toBe(post.metadata.title);
    expect(schema.description).toBe(metadata.description);
    expect(schema.url).toBe(metadata.alternates.canonical);
    expect(schema.url).toBe(metadata.openGraph.url);
    expect(schema.image).toBe(metadata.openGraph.images[0].url);
    expect(metadata.twitter.images).toEqual(metadata.openGraph.images);
    expect(metadata.twitter.images[0].alt).toBe(post.metadata.title);
    expect(schema.datePublished).toBe(metadata.openGraph.publishedTime);
    expect(schema.dateModified).toBe(
      metadata.openGraph.modifiedTime ?? metadata.openGraph.publishedTime
    );
    expect(schema.author).toMatchObject(metadata.authors[0]);
    expect(schema.keywords).toEqual(metadata.keywords);
    expect(metadata.alternates.types).toEqual({
      "application/rss+xml": new URL("/rss.xml", siteConfig.url).href,
    });
    expect(JSON.stringify({ metadata, schema })).not.toMatch(/[—·]/);
  }
  for (const path of new Bun.Glob("src/content/blog/**/*.mdx").scanSync(".")) {
    const source = readFileSync(path, "utf-8");
    const authoredMetadata = /export const metadata = \{[\s\S]*?^\};/m.exec(
      source
    )?.[0];
    expect(authoredMetadata, path).toBeDefined();
    expect(authoredMetadata, path).not.toMatch(/[—·]/);
  }
});
