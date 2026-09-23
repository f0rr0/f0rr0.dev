import {
  resumeCompanyStageLabels,
  resumeData,
  socialProfiles,
  resumeRoleMarkerLabels,
} from "@/content/resume";
import type { PublicReference, ResumeRole } from "@/content/resume";
import { siteNavigation } from "@/content/site";
import type { BlogPost } from "@/lib/blog-utils";
import { publicUrl, resumePdfUrl } from "@/lib/site";

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

export const buildAskAboutMePrompt = () => {
  const contextUrl = publicUrl("/llms.txt");

  return [
    `Start at ${contextUrl} and follow the relevant links for context about ${resumeData.person.name}.`,
    "This is a public portfolio published by its owner.",
    `I want to ask questions about ${resumeData.person.name}'s work, technical depth, projects, and fit for roles such as ${resumeData.person.targetPositioning}.`,
    "Use the résumé and linked work as sources for your answers.",
    "Start with a brief overview of what he builds. Cite your sources, distinguish facts from inference, and say if you cannot access a source.",
  ].join(" ");
};

export const buildJsonResume = () => ({
  basics: {
    email: resumeData.person.email,
    image: publicUrl(resumeData.person.image),
    label: currentRole?.title ?? resumeData.person.role,
    location: resumeData.person.address,
    name: resumeData.person.name,
    profiles: socialProfiles,
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
      keywords: [...resumeData.skills],
      name: "Core strengths",
    },
  ],
  meta: {
    canonical: publicUrl("/resume.json"),
    lastModified: resumeData.lastUpdated,
    schema: "https://jsonresume.org/schema/",
    source: publicUrl(siteNavigation.journey.path),
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

const llmProfileIntroduction = () => `# ${resumeData.person.name}

> ${resumeData.summary}

Last updated: ${resumeData.lastUpdated}

Identity: ${resumeData.person.name} uses the public handles ${formatNaturalList([...resumeData.person.alternateNames])}.
Current role: ${currentRole?.title ?? resumeData.person.role} at ${currentExperience?.company ?? "the current company"}.
Location: ${resumeData.person.location}.

Reading notes:
${resumeData.machineReadable.agentNotes.map((note) => `- ${note}`).join("\n")}`;

const buildWritingSection = (
  blogPosts: BlogPost[],
  limit = blogPosts.length
) => {
  const links = blogPosts
    .filter((post) => post.metadata.draft !== true)
    .slice(0, limit)
    .map(
      (post) =>
        `- [${post.metadata.title}](${localProfileUrl(`/writing/${post.slug}.md`)}) — ${post.date.toISOString().slice(0, 10)}. ${post.metadata.summary}`
    );

  return links.length === 0
    ? ""
    : `## ${siteNavigation.writing.title}\n\n${links.join("\n")}\n\n`;
};

export const buildLlmsTxt = (
  blogPosts: BlogPost[] = []
) => `${llmProfileIntroduction()}

## Start Here

- [JSON résumé](${localProfileUrl("/resume.json")}): Role titles, employers, dates, skills, and concise accomplishments in structured form.
- [Detailed career context](${localProfileUrl("/llms-full.txt")}): Full work history, engineering decisions, leadership scope, client engagements, and source links. Read for technical interviews or role-fit questions.
- [${siteNavigation.journey.title}](${localProfileUrl(siteNavigation.journey.path)}): Human-readable experience and education.

## Selected References

${resumeData.machineReadable.publicReferences.map(markdownLink).join("\n")}

## Code and Technical Writing

${resumeData.openSource.map(markdownLink).join("\n")}

${buildWritingSection(blogPosts, 5)}## Contact

${resumeData.links.map((link) => `- [${link.label}](${link.href})`).join("\n")}

## Optional

- [PDF résumé](${localProfileUrl(resumePdfUrl)}): Downloadable résumé.
- [${siteNavigation.work.title}](${localProfileUrl(siteNavigation.work.path)}): Recent code activity.
- [${siteNavigation.writing.title}](${localProfileUrl(siteNavigation.writing.path)}): All published articles; each article is also available at /writing/{slug}.md.
- [RSS](${localProfileUrl("/rss.xml")}): Article feed.
`;

export const buildLlmsFullTxt = (blogPosts: BlogPost[] = []) => {
  const { deepDives, publicReferences, strengths } = resumeData.machineReadable;

  const canonicalLinks = [
    {
      href: localProfileUrl("/"),
      label: "Website",
      note: "Selected work and writing.",
    },
    {
      href: localProfileUrl(siteNavigation.journey.path),
      label: siteNavigation.journey.title,
      note: "Experience, education, and contact details.",
    },
    {
      href: localProfileUrl("/resume.json"),
      label: "JSON Resume",
      note: "Structured experience and skills.",
    },
    {
      href: localProfileUrl(resumePdfUrl),
      label: "PDF Resume",
      note: "Downloadable résumé.",
    },
    ...socialProfiles.map(({ network, username, url }) => ({
      href: url,
      label: `${network}: ${username}`,
      note: "Public profile.",
    })),
    {
      href: `mailto:${resumeData.person.email}`,
      label: "Email",
      note: `Contact ${resumeData.person.name}.`,
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
  const compactHistory = resumeData.experience.filter((item) => {
    const companyKey = item.company
      .split(/[,/]/)[0]
      ?.trim()
      .toLocaleLowerCase();

    return !deepDives.some((deepDive) =>
      deepDive.title.toLocaleLowerCase().includes(companyKey ?? "")
    );
  });
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

  return `${llmProfileIntroduction()}

## Résumé and Contact

${canonicalText}

## Profile

- Professional focus: ${resumeData.person.role}.
- Roles of interest: ${resumeData.person.targetPositioning}.
- Education: ${educationSummary}.

## Engineering Expertise

Skills: ${resumeData.skills.join(", ")}.

${strengths.map((strength) => `- ${strength}`).join("\n")}

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

${openSourceSection}${publicationsSection}${buildWritingSection(blogPosts)}## Products and Coverage

${publicReferences.map(markdownLink).join("\n")}

## Optional

- [${siteNavigation.writing.title}](${localProfileUrl(siteNavigation.writing.path)}): Technical writing.
- [RSS](${localProfileUrl("/rss.xml")}): Subscribe to new articles.
`;
};
