import { expect, test } from "bun:test";

import { resumeData } from "../src/content/resume.ts";
import {
  buildJsonResume,
  buildLlmsFullTxt,
  buildLlmsTxt,
} from "../src/lib/resume.ts";
import { buildProfilePageJsonLd } from "../src/lib/structured-data.ts";

test("profile exports map the shared identity, summary, and skills", () => {
  const json = buildJsonResume();
  const person = buildProfilePageJsonLd().mainEntity;
  expect(json.basics.name).toBe(resumeData.person.name);
  expect(json.basics.summary).toBe(resumeData.summary);
  expect(person).toMatchObject({
    description: resumeData.summary,
    knowsAbout: resumeData.skills,
    jobTitle: json.basics.label,
  });
  expect(json.skills[0].keywords).toEqual([...resumeData.skills]);
  expect(json.work.map((work) => work.name)).toEqual(
    resumeData.experience.flatMap((company) =>
      company.roles.map(() => company.company)
    )
  );
});

test("agent notes are included only in the machine-readable guidance", () => {
  const guide = buildLlmsTxt();
  const context = buildLlmsFullTxt();
  const profile = JSON.stringify({
    json: buildJsonResume(),
    structuredData: buildProfilePageJsonLd(),
  });
  for (const note of resumeData.machineReadable.agentNotes) {
    expect(guide).toContain(note);
    expect(context).toContain(note);
    expect(profile).not.toContain(note);
  }
});

test("the guide curates writing while the full context retains all published links", () => {
  const posts = Array.from({ length: 8 }, (_, index) => ({
    date: new Date("2026-09-06T00:00:00Z"),
    metadata: {
      title: `Article ${index}`,
      author: "Sid Jain",
      date: "2026-09-06",
      summary: "Engineering decisions.",
      draft: index === 0,
    },
    slug: `article-${index}`,
    importPath: `article-${index}/page.mdx`,
    readingTime: "1 min read",
    wordCount: 100,
  }));
  const guide = buildLlmsTxt(posts);
  const full = buildLlmsFullTxt(posts);

  expect(guide).not.toContain("/writing/article-0");
  expect(full).not.toContain("/writing/article-0");
  expect(guide).toContain("/writing/article-5");
  expect(guide).not.toContain("/writing/article-6");
  expect(full).toContain("/writing/article-7");
  expect(buildLlmsTxt([posts[0]])).not.toContain("## Writing");
});
