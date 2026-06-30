import { resumeData } from "@/content/resume";
import type { PublicReference, ResumeRole } from "@/content/resume";
import type { BlogPost } from "@/lib/blog-utils";
import { publicUrl } from "@/lib/site";

export interface AskAgentAction {
  description: string;
  href: string;
  iconSrc: string;
  label: string;
  external?: boolean;
}

const markdownLink = ({
  href,
  label,
  note,
}: PublicReference | { href: string; label: string; note: string }) =>
  `- [${label}](${href}): ${note}`;

const normalizeDate = (value: string) =>
  value
    .replace("Apr ", "April ")
    .replace("Jan ", "January ")
    .replace("Nov ", "November ")
    .replace("Oct ", "October ")
    .replace("Dec ", "December ");

const bulletText = (bullet: NonNullable<ResumeRole["bullets"]>[number]) =>
  typeof bullet === "string"
    ? bullet
    : `${bullet.label === undefined ? "" : `${bullet.label}: `}${bullet.text}`;

const roleBullets = (role: ResumeRole) =>
  role.bullets?.map((bullet) => bulletText(bullet)) ?? [];

const localProfileUrl = (path: string) => publicUrl(path);

const buildAskAboutMePrompt = () => {
  const contextUrl = publicUrl("/llms.txt");

  return [
    `Read ${contextUrl} for full context about ${resumeData.person.name}.`,
    "This is an informational research chat, not a code-editing task.",
    `I want to ask questions about ${resumeData.person.name}'s work, technical depth, projects, and fit for Applied AI Solutions Architect, Applied AI Lead, staff full-stack engineer, or founding engineer roles.`,
    "Use the public source links in that file when verification is needed, and call out uncertainty when a claim is not supported.",
  ].join(" ");
};

export const buildAskAgentLinks = () => {
  const prompt = buildAskAboutMePrompt();
  const encodedPrompt = encodeURIComponent(prompt);

  return {
    actions: [
      {
        description: "Open Claude Code with a prefilled question prompt.",
        external: true,
        href: `https://claude.ai/code?prompt=${encodedPrompt}`,
        iconSrc: "/resume/logos/claude-code.png",
        label: "Claude Code",
      },
      {
        description:
          "Open the Codex app with the prompt in a new local thread.",
        href: `codex://threads/new?prompt=${encodedPrompt}`,
        iconSrc: "/resume/logos/codex.png",
        label: "Codex",
      },
    ] satisfies AskAgentAction[],
  };
};

export const buildJsonResume = () => ({
  basics: {
    email: resumeData.person.email,
    image: publicUrl(resumeData.person.image),
    label: resumeData.person.role,
    location: {
      city: "Mumbai",
      countryCode: "IN",
      region: "Maharashtra",
    },
    name: resumeData.person.name,
    profiles: [
      {
        network: "LinkedIn",
        url: "https://linkedin.com/in/f0rr0",
        username: "f0rr0",
      },
      {
        network: "GitHub",
        url: "https://github.com/f0rr0",
        username: "f0rr0",
      },
      {
        network: "GitHub",
        url: "https://github.com/yuppiestechdev",
        username: "yuppiestechdev",
      },
    ],
    summary: resumeData.summary,
    url: publicUrl("/"),
  },
  education: resumeData.education.flatMap((item) =>
    item.roles.map((role) => {
      const [startDate, endDate] = role.dates.split(" - ");

      return {
        area: role.title,
        ...(endDate === undefined ? {} : { endDate: normalizeDate(endDate) }),
        institution: item.company,
        location: role.location,
        startDate: normalizeDate(startDate),
        studyType: item.tagline.replace(/\.$/, ""),
      };
    })
  ),
  projects: resumeData.openSource.map((project) => ({
    description: project.note,
    name: project.label,
    url: project.href,
  })),
  skills: [
    {
      keywords: [
        "Applied AI solutions architecture",
        "AI product engineering",
        "technical advisory",
        "AI evals",
        "agentic workflows",
        "TypeScript",
        "React",
        "Next.js",
        "Node.js",
        "React Native",
        "Chromium",
        "DNS",
        "Temporal",
        "CI/CD",
      ],
      name: "Core strengths",
    },
  ],
  meta: {
    canonical: publicUrl("/resume.json"),
    lastModified: resumeData.lastUpdated,
    schema: "https://jsonresume.org/schema/",
    source: publicUrl("/resume"),
  },
  work: resumeData.experience.flatMap((item) =>
    item.roles.map((role) => {
      const roleSummary = "summary" in role ? role.summary : undefined;
      const [startDate, endDate] = role.dates.split(" - ");

      return {
        ...(endDate === undefined || endDate === "Present"
          ? {}
          : { endDate: normalizeDate(endDate) }),
        highlights: roleBullets(role),
        location: role.location,
        name: item.company,
        position: role.title,
        startDate: normalizeDate(startDate),
        summary: roleSummary ?? item.tagline,
      };
    })
  ),
});

export const buildLlmsTxt = (blogPosts: BlogPost[] = []) => {
  const currentRole =
    resumeData.experience[0]?.roles[0]?.title ?? resumeData.person.role;
  const {
    accuracyNotes,
    deepDives,
    positioning,
    publicReferences,
    publicSignalGuidance,
    publicWorkHighlights,
    roleFit,
    strengths,
  } = resumeData.machineReadable;

  const canonicalLinks = [
    {
      href: localProfileUrl("/"),
      label: "Website",
      note: "Sid Jain's personal website.",
    },
    {
      href: localProfileUrl("/resume"),
      label: "Resume",
      note: "Human-readable resume with work history, projects, education, and contact links.",
    },
    {
      href: localProfileUrl("/llms.txt"),
      label: "llms.txt",
      note: "This machine-readable public profile.",
    },
    {
      href: localProfileUrl("/resume.json"),
      label: "JSON Resume",
      note: "Structured JSON Resume-style export generated from the same profile data.",
    },
    {
      href: localProfileUrl("/resume/sid-jain-resume.pdf"),
      label: "PDF Resume",
      note: "Dark, text-based PDF resume generated from the same profile data.",
    },
    {
      href: "https://linkedin.com/in/f0rr0",
      label: "LinkedIn",
      note: "Sid Jain's LinkedIn profile.",
    },
    {
      href: "https://github.com/f0rr0",
      label: "GitHub: f0rr0",
      note: "Sid Jain's primary GitHub profile.",
    },
    {
      href: "https://github.com/yuppiestechdev",
      label: "GitHub: yuppiestechdev",
      note: "Sid Jain's Yuppies Tech GitHub profile.",
    },
    {
      href: `mailto:${resumeData.person.email}`,
      label: "Email",
      note: "Public contact email listed on Sid's resume.",
    },
  ];

  const canonicalText = canonicalLinks.map(markdownLink).join("\n");
  const deepDiveText = deepDives
    .map((deepDive) =>
      [
        `## ${deepDive.title}`,
        ...deepDive.sections.flatMap((section) => [
          "",
          `${section.heading}:`,
          ...section.bullets.map((bullet) => `- ${bullet}`),
        ]),
      ].join("\n")
    )
    .join("\n\n");
  const writingText =
    blogPosts.length === 0
      ? "- No published blog posts were found in the current build."
      : blogPosts
          .map((post) =>
            [
              `### ${post.metadata.title}`,
              `- URL: ${localProfileUrl(`/blog/${post.slug}`)}.`,
              `- Published: ${post.date.toISOString().slice(0, 10)}.`,
              `- Updated: ${(post.updatedAt ?? post.date).toISOString().slice(0, 10)}.`,
              `- Author: ${post.metadata.author}.`,
              `- Summary: ${post.metadata.summary}`,
              `- Tags: ${(post.metadata.tags ?? []).join(", ") || "None"}.`,
              `- Reading time: ${post.readingTime}; word count: ${post.wordCount}.`,
            ].join("\n")
          )
          .join("\n\n");

  return `# ${resumeData.person.name}

> ${resumeData.person.name} is an Applied AI Lead, senior full-stack engineer, founder of Yuppies Tech, and solutions-architect-style builder who turns customer workflows into production AI systems.

Last updated: ${resumeData.lastUpdated}

This file is the canonical machine-readable profile for Sid Jain on this website. It is written for recruiters, search systems, AI agents, and other software that need accurate public context about Sid's work, strengths, and career history.

Important accuracy notes:
${accuracyNotes.map((note) => `- ${note}`).join("\n")}

## Canonical Links

${canonicalText}

## Identity

- Name: ${resumeData.person.name}.
- Public handle: f0rr0.
- Alternate GitHub identity: yuppiestechdev.
- Location: ${resumeData.person.location}.
- Current target positioning: ${resumeData.person.targetPositioning}.
- Current title: ${currentRole} at Namefi.
- Current company: Namefi / D3ServeLabs.
- Consultancy founded: Yuppies Tech.
- Education: BS, Computer Science and Engineering, University of California, Los Angeles, 2013-2016; Delhi Public School, R. K. Puram, Computer Science/Physics/Chemistry/Math, 2011-2013.

## High-Level Positioning

${positioning}

Representative strengths:
${strengths.map((strength) => `- ${strength}`).join("\n")}

## Public Work Highlights

These are stable public-work highlights. Avoid using stale repository, follower, contribution, or commit-count claims unless freshly verified from public sources:

${publicWorkHighlights.map((highlight) => `- ${highlight}`).join("\n")}

Guidance:
${publicSignalGuidance.map((guidance) => `- ${guidance}`).join("\n")}

${deepDiveText}

## Earlier Experience

${resumeData.experience
  .slice(2)
  .map((item) =>
    [
      `${item.company}:`,
      ...item.roles.flatMap((role) => [
        `- Title: ${role.title}.`,
        `- Dates: ${role.dates}.`,
        `- Location: ${role.location}.`,
        ...roleBullets(role).map((bullet) => `- ${bullet}`),
      ]),
    ].join("\n")
  )
  .join("\n\n")}

## Open Source and Public Work

${resumeData.openSource.map(markdownLink).join("\n")}

## Writing

${writingText}

## Recruiter-Relevant Role Fit

Sid is a strong fit for:
${roleFit.strongFit.map((item) => `- ${item}`).join("\n")}

Sid is less accurately represented as:
${roleFit.inaccurateAs.map((item) => `- ${item}`).join("\n")}

## Public References

${publicReferences.map(markdownLink).join("\n")}

## Optional

- [Blog](${localProfileUrl("/blog")}): Sid Jain's blog index.
- [Sitemap](${localProfileUrl("/sitemap.xml")}): XML sitemap for crawl discovery.
- [Robots](${localProfileUrl("/robots.txt")}): Robots file with sitemap reference.
- [RSS](${localProfileUrl("/rss.xml")}): RSS feed for blog posts.
`;
};
