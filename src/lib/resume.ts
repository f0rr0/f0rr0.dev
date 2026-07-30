import {
  formatResumeLocation,
  resumeCompanyStageLabels,
  resumeData,
  resumeRoleMarkerLabels,
} from "@/content/resume";
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

const monthNumbers = {
  Apr: "04",
  Aug: "08",
  Dec: "12",
  Feb: "02",
  Jan: "01",
  Jul: "07",
  Jun: "06",
  Mar: "03",
  May: "05",
  Nov: "11",
  Oct: "10",
  Sep: "09",
} as const;

const normalizeDate = (value: string) => {
  const [monthOrYear, year] = value.trim().split(/\s+/);

  if (monthOrYear === undefined || year === undefined) {
    return value.trim();
  }

  const month = monthNumbers[monthOrYear as keyof typeof monthNumbers];

  return month === undefined ? value.trim() : `${year}-${month}`;
};

const bulletText = (bullet: NonNullable<ResumeRole["bullets"]>[number]) =>
  typeof bullet === "string"
    ? bullet
    : `${bullet.label === undefined ? "" : `${bullet.label}: `}${bullet.text}`;

const roleBullets = (role: ResumeRole) =>
  role.bullets?.map((bullet) => bulletText(bullet)) ?? [];

const roleMarkers = (role: ResumeRole) =>
  role.markers?.map((marker) => resumeRoleMarkerLabels[marker]) ?? [];

const roleLeadershipScope = (role: ResumeRole) => role.leadershipScope;

const localProfileUrl = (path: string) => publicUrl(path);

const [currentExperience] = resumeData.experience;
const [currentRole] = currentExperience?.roles ?? [];

const isGitHubProject = (reference: PublicReference) =>
  reference.href.startsWith("https://github.com/");

const openSourceProjects = resumeData.openSource.filter(isGitHubProject);
const publications = resumeData.openSource.filter(
  (reference) => !isGitHubProject(reference)
);

const formatNaturalList = (items: string[]) => {
  if (items.length < 2) {
    return items[0] ?? "";
  }

  if (items.length === 2) {
    return `${items[0]} and ${items[1]}`;
  }

  return `${items.slice(0, -1).join(", ")}, and ${items.at(-1)}`;
};

const isClaimGuidance = (note: string) =>
  /^(avoid|do not|only|treat|use|when|work summaries)\b/i.test(note);

const educationStudyType = (tagline: string) => {
  const degree = tagline.replace(/\.$/, "").split(",")[0]?.trim();

  return degree === "BS" ? "Bachelor of Science" : degree;
};

const educationSummary = resumeData.education
  .flatMap((item) =>
    item.roles.map((role) => {
      const studyType = educationStudyType(item.tagline);

      return studyType === "High School"
        ? `${role.title} at ${item.company} (${role.dates})`
        : `${studyType} in ${role.title} from ${item.company} (${role.dates})`;
    })
  )
  .join("; ");

const foundedOrganizations = resumeData.experience
  .filter((item) => item.roles.some((role) => /\bFounder\b/.test(role.title)))
  .map((item) => item.company);

const buildAskAboutMePrompt = () => {
  const contextUrl = publicUrl("/llms.txt");

  return [
    `Read ${contextUrl} for full context about ${resumeData.person.name}.`,
    "This is an informational research chat, not a code-editing task.",
    `I want to ask questions about ${resumeData.person.name}'s work, technical depth, projects, and fit for roles such as ${resumeData.person.targetPositioning}.`,
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
    label: currentRole?.title ?? resumeData.person.role,
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
        studyType: educationStudyType(item.tagline),
      };
    })
  ),
  projects: openSourceProjects.map((project) => ({
    description: project.note,
    name: project.label,
    url: project.href,
  })),
  publications: publications.map((publication) => ({
    name: publication.label,
    summary: publication.note,
    url: publication.href,
  })),
  skills: [
    {
      keywords: [
        "Applied AI solutions architecture",
        "AI product engineering",
        "technical advisory",
        "AI evaluation",
        "AI-assisted workflows",
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
    mobility: [...resumeData.person.mobility],
    schema: "https://jsonresume.org/schema/",
    source: publicUrl("/resume"),
  },
  work: resumeData.experience.flatMap((item) =>
    item.roles.map((role) => {
      const [startDate, endDate] = role.dates.split(" - ");
      const roleSummary = "summary" in role ? role.summary : undefined;

      return {
        ...(endDate === undefined || endDate === "Present"
          ? {}
          : { endDate: normalizeDate(endDate) }),
        highlights: roleBullets(role),
        ...(roleLeadershipScope(role) === undefined
          ? {}
          : { leadershipScope: roleLeadershipScope(role) }),
        location: role.location,
        name: item.company,
        position: role.title,
        ...(item.companyStage === undefined
          ? {}
          : {
              companyStage: resumeCompanyStageLabels[item.companyStage],
            }),
        ...(role.markers === undefined
          ? {}
          : { roleMarkers: roleMarkers(role) }),
        startDate: normalizeDate(startDate),
        summary: roleSummary ?? item.tagline,
      };
    })
  ),
});

export const buildLlmsTxt = (blogPosts: BlogPost[] = []) => {
  const {
    accuracyNotes,
    deepDives,
    positioning,
    publicReferences,
    publicSignalGuidance,
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
  const factualContext = accuracyNotes.filter((note) => !isClaimGuidance(note));
  const claimGuidance = [
    ...accuracyNotes.filter(isClaimGuidance),
    ...publicSignalGuidance,
  ];
  const roleMarkerAssignments = resumeData.experience
    .flatMap((item) =>
      item.roles.flatMap((role) => {
        const markerList = formatNaturalList(roleMarkers(role));
        if (markerList.length === 0) {
          return [];
        }

        return [`- ${role.title} at ${item.company} — ${markerList}.`];
      })
    )
    .join("\n");
  const companyStageAssignments = resumeData.experience
    .flatMap((item) =>
      item.companyStage === undefined
        ? []
        : [
            `- ${item.company} — ${resumeCompanyStageLabels[item.companyStage]}.`,
          ]
    )
    .join("\n");
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
  const compactHistory = resumeData.experience.filter((item) => {
    const companyKey = item.company
      .split(/[,/]/)[0]
      ?.trim()
      .toLocaleLowerCase();

    return !deepDives.some((deepDive) =>
      deepDive.title.toLocaleLowerCase().includes(companyKey ?? "")
    );
  });
  const writingText =
    blogPosts.length === 0
      ? "- No published blog posts were found in the current build."
      : blogPosts
          .map(
            (post) =>
              `- [${post.metadata.title}](${localProfileUrl(`/blog/${post.slug}`)}) — ${post.date.toISOString().slice(0, 10)}. ${post.metadata.summary}`
          )
          .join("\n");
  const claimGuidanceSection =
    claimGuidance.length === 0
      ? ""
      : `## Claim and Citation Guidance

${claimGuidance.map((guidance) => `- ${guidance}`).join("\n")}

`;
  const openSourceSection =
    openSourceProjects.length === 0
      ? ""
      : `## Open Source

${openSourceProjects.map(markdownLink).join("\n")}

`;
  const publicationsSection =
    publications.length === 0
      ? ""
      : `## Publications

${publications.map(markdownLink).join("\n")}

`;

  return `# ${resumeData.person.name}

> ${resumeData.summary}

Last updated: ${resumeData.lastUpdated}

This is the canonical machine-readable profile for ${resumeData.person.name} on this website. It provides public career context for recruiters, search systems, and AI tools.

## Verified Context

${factualContext.map((note) => `- ${note}`).join("\n")}

## Canonical Links

${canonicalText}

## Identity

- Name: ${resumeData.person.name}.
- Public aliases: ${formatNaturalList([...resumeData.person.alternateNames])}.
- Location and mobility: ${formatResumeLocation(resumeData.person, "; ")}.
- Professional focus: ${resumeData.person.role}.
- Current role: ${currentRole?.title ?? resumeData.person.role} at ${currentExperience?.company ?? "the current company"}.
- Roles of interest: ${resumeData.person.targetPositioning}.
${foundedOrganizations.length === 0 ? "" : `- Founded: ${formatNaturalList(foundedOrganizations)}.\n`}- Education: ${educationSummary}.

## High-Level Positioning

${positioning}

Representative strengths:
${strengths.map((strength) => `- ${strength}`).join("\n")}

Role indicators used on the human-readable resume:
- Hands-on: material, direct contribution to architecture or implementation.
- Leadership: responsibility for other engineers, team direction, and delivery outcomes.

Role indicators by position:
${roleMarkerAssignments}

Company stage during each role:
${companyStageAssignments}

${claimGuidanceSection}
${deepDiveText}

## Earlier Experience

${compactHistory
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

${openSourceSection}${publicationsSection}## Writing

${writingText}

## Role Alignment

Best-aligned roles:
${roleFit.strongFit.map((item) => `- ${item}`).join("\n")}

## Public References

${publicReferences.map(markdownLink).join("\n")}

## Optional

- [Blog](${localProfileUrl("/blog")}): Sid Jain's blog index.
- [Sitemap](${localProfileUrl("/sitemap.xml")}): XML sitemap for crawl discovery.
- [Robots](${localProfileUrl("/robots.txt")}): Robots file with sitemap reference.
- [RSS](${localProfileUrl("/rss.xml")}): RSS feed for blog posts.
`;
};
