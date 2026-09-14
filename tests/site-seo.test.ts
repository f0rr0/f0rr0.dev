import { expect, test } from "bun:test";

test("deployment aliases never replace public identity, and only previews receive noindex headers", () => {
  for (const deployment of ["preview", "production"] as const) {
    const result = Bun.spawnSync(
      [
        process.execPath,
        "--eval",
        `const { default: config } = await import("./next.config.ts");
         const { siteConfig, publicUrl } = await import("./src/lib/site.ts");
         console.log(JSON.stringify({ origin: siteConfig.url, article: publicUrl("/writing/example"), headers: await config.headers(), redirects: await config.redirects(), rewrites: await config.rewrites() }));`,
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
    expect(output.rewrites).toEqual([
      { source: "/writing/:slug.md", destination: "/writing/:slug/markdown" },
    ]);
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
