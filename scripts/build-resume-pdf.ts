import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  formatResumeLocation,
  resumeCompanyStageLabels,
  resumeData,
  resumeRoleMarkerLabels,
} from "../src/content/resume";
import type {
  LogoAsset,
  ResumeCompanyStage,
  ResumeExperience,
  ResumeRole,
  ResumeRoleMarker,
} from "../src/content/resume";

const quote = (value: string) => JSON.stringify(value);

const clean = (value: string) =>
  value
    .replaceAll("’", "'")
    .replaceAll("“", '"')
    .replaceAll("”", '"')
    .replaceAll("–", "-")
    .replaceAll("—", "-");

const CSS_PX_TO_PT = 72 / 96;
const ROOT_FONT_SIZE_PX = 16;

const formatUnit = (value: number) => Number(value.toFixed(3)).toString();
const pt = (value: number) => `${formatUnit(value)}pt`;
const cssPxToPt = (value: number) => pt(value * CSS_PX_TO_PT);
const remToPt = (value: number) => cssPxToPt(value * ROOT_FONT_SIZE_PX);
const twToPt = (value: number) => cssPxToPt(value * 4);
const typstLeadingFromCssLineHeight = (value: number) =>
  `${formatUnit(value - 1)}em`;

const fontSize = {
  xs: remToPt(0.75),
  sm: pt(10),
  base: remToPt(1),
  xl: remToPt(1.25),
  "5xl": remToPt(3),
  marker: pt(7.5),
};

const spacing = {
  px: cssPxToPt(1),
  0.5: twToPt(0.5),
  1: twToPt(1),
  2: twToPt(2),
  2.5: twToPt(2.5),
  3: twToPt(3),
  4: twToPt(4),
  5: twToPt(5),
  6: twToPt(6),
  7: twToPt(7),
  8: twToPt(8),
  10: twToPt(10),
} as const;

const lineLeading = {
  relaxed: typstLeadingFromCssLineHeight(1.625),
};

const pdfOnly = {
  bulletLogoTopNudge: pt(-0.5),
  contactLinkLeading: typstLeadingFromCssLineHeight(
    32 / 3 / (10 * CSS_PX_TO_PT)
  ),
  contactStackHeight: pt(32),
  companyTaglineGap: pt(-3.75),
  experienceItemGap: spacing[3],
  markerInsetY: cssPxToPt(4),
  pageMargin: "0.58in",
  profileAvatarSize: fontSize["5xl"],
  roleBodyGap: cssPxToPt(3),
  roleTopGap: spacing[1],
  sectionTitleAfterGap: spacing[3],
};

const text = (
  value: string,
  {
    fill = "muted",
    font = "Source Sans 3",
    kerning,
    size = fontSize.sm,
    style = "normal",
    weight = "regular",
  }: {
    fill?: string;
    font?: string;
    kerning?: boolean;
    size?: string;
    style?: string;
    weight?: string;
  } = {}
) =>
  `#t(${quote(clean(value))}, fill: ${fill}, font: ${quote(
    font
  )}, size: ${size}, weight: ${quote(weight)}, style: ${quote(style)}${
    kerning === undefined ? "" : `, kerning: ${kerning}`
  })`;

const paragraph = (
  value: string,
  options: Parameters<typeof text>[1] = {},
  { leading: paragraphLeading = lineLeading.relaxed }: { leading?: string } = {}
) => `#block[
  #set par(leading: ${paragraphLeading})
  ${text(value, options)}
]`;

const link = (
  label: string,
  href: string,
  options: Parameters<typeof text>[1] = {}
) => `#link(${quote(href)})[${text(label, { fill: "accent", ...options })}]`;

const roleMarkerDetails = {
  "hands-on": {
    fill: "#2d2418",
    stroke: "#9a6a2b",
    text: "#f0b85f",
  },
  leadership: {
    fill: "#2a2429",
    stroke: "#7a6171",
    text: "#e3bfd7",
  },
} satisfies Record<
  ResumeRoleMarker,
  { fill: string; stroke: string; text: string }
>;

const roleMarker = (marker: ResumeRoleMarker) => {
  const details = roleMarkerDetails[marker];

  return `#box(
  inset: (x: ${pt(4)}, y: ${pdfOnly.markerInsetY}),
  radius: ${pt(8)},
  fill: rgb(${quote(details.fill)}),
  stroke: ${pt(0.75)} + rgb(${quote(details.stroke)}),
)[${text(resumeRoleMarkerLabels[marker], {
    fill: `rgb(${quote(details.text)})`,
    size: fontSize.marker,
    weight: "medium",
  })}]`;
};

const companyStageMarker = (stage: ResumeCompanyStage) => `#box(
  inset: (x: ${pt(4)}, y: ${pdfOnly.markerInsetY}),
  radius: ${pt(8)},
  fill: rgb("#242220"),
  stroke: ${pt(0.75)} + rgb("#57534e"),
)[${text(resumeCompanyStageLabels[stage], {
  fill: `rgb(${quote("#c7c2bd")})`,
  size: fontSize.marker,
  weight: "medium",
})}]`;

const sizeFromClass = (
  className: string | undefined,
  dimension: "h" | "w",
  fallback: string
) => {
  const match = new RegExp(
    `(?:^|\\\\s)${dimension}-([0-9]+(?:\\\\.[0-9]+)?)`
  ).exec(className ?? "");

  if (match?.[1] === undefined || match[1] === "") {
    return fallback;
  }

  return twToPt(Number(match[1]));
};

const translateYFromClass = (value: string | undefined = "") => {
  if (value.includes("-translate-y-0.5")) {
    return `-${spacing[0.5]}`;
  }
  if (value.includes("translate-y-px")) {
    return spacing.px;
  }
  return pt(0);
};

const tileFill = (logo: LogoAsset) => {
  if (logo.tileClassName.includes("bg-white")) {
    return "#ffffff";
  }

  return /bg-\[(#[\da-fA-F]+)\]/.exec(logo.tileClassName)?.[1] ?? "#1a1918";
};

const publicAssetPath = (src: string) => `/public/${src.replace(/^\//, "")}`;

const logoPath = (logo: LogoAsset) => publicAssetPath(logo.src);

const profileAvatarPath = () =>
  publicAssetPath(resumeData.person.avatarImage ?? resumeData.person.image);

const logoTile = (
  logo: LogoAsset,
  {
    className,
    defaultHeight,
    defaultWidth,
    tileSize,
  }: {
    className?: string;
    defaultHeight: string;
    defaultWidth: string;
    tileSize: string;
  }
) =>
  `#logo-tile(${quote(logoPath(logo))}, fill: rgb(${quote(
    tileFill(logo)
  )}), size: ${tileSize}, image-width: ${sizeFromClass(
    className,
    "w",
    defaultWidth
  )}, image-height: ${sizeFromClass(
    className,
    "h",
    defaultHeight
  )}, dy: ${translateYFromClass(className)})`;

const companyLogo = (logo: LogoAsset) =>
  `#move(dy: -${spacing.px})[${logoTile(logo, {
    className: logo.imageClassName,
    defaultHeight: spacing[5],
    defaultWidth: spacing[7],
    tileSize: spacing[10],
  })}]`;

const bulletLogo = (logo: LogoAsset) =>
  logoTile(logo, {
    className: logo.bulletImageClassName ?? logo.imageClassName,
    defaultHeight: spacing[4],
    defaultWidth: spacing[5],
    tileSize: spacing[7],
  });

const bulletContent = (bullet: NonNullable<ResumeRole["bullets"]>[number]) => {
  if (typeof bullet === "string") {
    return `
#grid(
  columns: (${spacing[2]}, 1fr),
  gutter: ${spacing[2]},
  align: top,
  [${text("·", { fill: "accent", weight: "bold" })}],
  [${text(bullet)}],
)`;
  }

  const body = `${text(`${bullet.label ?? ""}: `, {
    fill: "strong",
    weight: "medium",
  })}${text(bullet.text)}`;

  if (bullet.logo === undefined) {
    return `
#grid(
  columns: (${spacing[2]}, 1fr),
  gutter: ${spacing[2]},
  align: top,
  [${text("·", { fill: "accent", weight: "bold" })}],
  [${body}],
)`;
  }

  return `
#grid(
  columns: (${spacing[7]}, 1fr),
  gutter: ${spacing[2.5]},
  align: top,
  [#move(dy: ${pdfOnly.bulletLogoTopNudge})[${bulletLogo(bullet.logo)}]],
  [${body}],
)`;
};

const stack = (items: string[], gap = spacing[0.5]) =>
  items.join(`\n#v(${gap})\n`);

interface SectionTitleOptions {
  after?: string;
  before?: string;
}

const sectionTitle = (
  title: string,
  {
    after = pdfOnly.sectionTitleAfterGap,
    before = spacing[8],
  }: SectionTitleOptions = {}
) => `
#v(${before})
${text(title, {
  fill: "strong",
  font: "Literata",
  size: fontSize.xl,
  weight: "bold",
})}
#v(${after})
`;

const roleBlock = (role: ResumeRole) => {
  const bullets = role.bullets?.map(bulletContent) ?? [];
  const roleHeadingItems = [
    text(role.title, { fill: "strong", weight: "medium" }),
    ...(role.markers?.map(roleMarker) ?? []),
  ];
  const roleHeading = `#grid(
  columns: (${roleHeadingItems.map(() => "auto").join(", ")}),
  gutter: ${pt(4)},
  align: horizon,
  ${roleHeadingItems.map((item) => `[${item}]`).join(",\n  ")}
)`;

  return `
#v(${pdfOnly.roleTopGap})
#grid(
  columns: (1fr, auto),
  gutter: ${spacing[4]},
  [${roleHeading}],
  [${text(`${role.location} · ${role.dates}`, { size: cssPxToPt(11) })}],
)
${role.summary === undefined ? "" : `#v(${pdfOnly.roleBodyGap})\n${text(role.summary)}`}
${bullets.length === 0 ? "" : `#v(${pdfOnly.roleBodyGap})\n${stack(bullets)}`}
`;
};

interface PdfSectionItem {
  content: string;
  pageBreakBefore: boolean;
}

const experienceItem = (item: ResumeExperience): PdfSectionItem => {
  const companyHeadingItems = [
    text(item.company, {
      fill: "strong",
      font: "Literata",
      kerning: false,
      size: fontSize.base,
      weight: "bold",
    }),
    ...(item.companyStage === undefined
      ? []
      : [companyStageMarker(item.companyStage)]),
  ];
  const companyHeading = `#grid(
  columns: (${companyHeadingItems.map(() => "auto").join(", ")}),
  gutter: ${pt(5)},
  align: horizon,
  ${companyHeadingItems.map((headingItem) => `[${headingItem}]`).join(",\n  ")}
)`;

  return {
    content: `
#block(breakable: false)[
#grid(
  columns: (${spacing[10]}, 1fr),
  gutter: ${spacing[4]},
  align: top,
  [${companyLogo(item.logo)}],
  [
    ${companyHeading}
    #v(${pdfOnly.companyTaglineGap})
    ${text(item.tagline, { size: fontSize.xs, style: "italic" })}
    ${item.roles.map(roleBlock).join("\n")}
  ],
)
]
`,
    pageBreakBefore: item.pdfPageBreakBefore === true,
  };
};

const sectionWithItems = (
  title: string,
  items: PdfSectionItem[],
  titleOptions?: Parameters<typeof sectionTitle>[1]
) => {
  const [firstItem, ...remainingItems] = items;
  const firstItemContent =
    firstItem === undefined
      ? ""
      : `${firstItem.pageBreakBefore ? "#pagebreak()\n" : ""}${firstItem.content}`;

  return `
#block(breakable: false)[
  ${sectionTitle(title, titleOptions)}
  ${firstItemContent}
]
${remainingItems
  .map((item) =>
    item.pageBreakBefore
      ? `#pagebreak()\n${item.content}`
      : `#v(${pdfOnly.experienceItemGap})\n${item.content}`
  )
  .join("\n")}
`;
};

const buildTypst = () => {
  // Preserve a word boundary for Preview/ATS extractors between the name and first contact link.
  const contactLines = resumeData.links
    .map((item, index) =>
      link(index === 0 ? ` ${item.label}` : item.label, item.href, {
        size: cssPxToPt(10),
        weight: "medium",
      })
    )
    .join("\n#linebreak()\n");

  const experience = resumeData.experience.map(experienceItem);

  const education = resumeData.education.map(experienceItem);
  const profileAvatar = profileAvatarPath();

  return `#set document(
  title: ${quote(resumeData.pdf.title)},
  author: ${quote(resumeData.person.name)},
  keywords: ("AI product engineer", "Applied AI lead", "staff full-stack engineer", "founding engineer", "TypeScript", "React Native", "Chromium", "DNS"),
)
#set page(
  paper: "us-legal",
  margin: ${pdfOnly.pageMargin},
  fill: rgb("#1a1918"),
)
#set text(font: "Source Sans 3", size: ${fontSize.sm}, fill: rgb("#a8a29e"), lang: "en")
#set par(leading: ${lineLeading.relaxed}, justify: false)

#let background = rgb("#1a1918")
#let strong = rgb("#e7e5e4")
#let muted = rgb("#a8a29e")
#let accent = rgb("#d97706")
#let rule-color = rgb("#3a3836")
#let t(s, fill: muted, font: "Source Sans 3", size: ${fontSize.sm}, weight: "regular", style: "normal", kerning: true) = text(font: font, fill: fill, size: size, weight: weight, style: style, kerning: kerning, s)
#let logo-tile(path, fill: background, size: ${spacing[10]}, image-width: ${spacing[7]}, image-height: ${spacing[5]}, dy: ${pt(0)}) = rect(
  width: size,
  height: size,
  radius: size / 2,
  fill: fill,
  stroke: ${spacing.px} + rule-color,
)[#align(center + horizon)[#move(dy: dy)[#image(path, width: image-width, height: image-height, fit: "contain")]]]
#let profile-photo(path, size: ${pdfOnly.profileAvatarSize}) = image(path, width: size, height: size, fit: "contain")

#align(left)[
#grid(
  columns: (${pdfOnly.profileAvatarSize}, auto, 1fr),
  gutter: ${spacing[4]},
  align: top,
  [#profile-photo(${quote(profileAvatar)})],
  [#box(height: ${pdfOnly.profileAvatarSize})[#align(left + horizon)[${text(
    `${resumeData.person.name} `,
    {
      fill: "strong",
      font: "Literata",
      size: fontSize["5xl"],
      weight: "bold",
    }
  )}]]],
  [#align(right)[#box(height: ${pdfOnly.profileAvatarSize})[#align(right + horizon)[#box(height: ${pdfOnly.contactStackHeight})[
      #set par(leading: ${pdfOnly.contactLinkLeading})
      #align(right)[
      ${contactLines}
      ]
    ]]]]],
)
  #v(${spacing[1]})
  ${paragraph(resumeData.summary)}
  #v(${spacing[1]})
  ${paragraph(formatResumeLocation(resumeData.person))}

  ${sectionWithItems("Experience", experience, {
    before: spacing[2],
  })}

  ${sectionWithItems("Education", education)}
]
`;
};

await mkdir(path.dirname(resumeData.pdf.generatedTypstPath), {
  recursive: true,
});
await mkdir(path.dirname(resumeData.pdf.outputPath), { recursive: true });
await writeFile(
  resumeData.pdf.generatedTypstPath,
  buildTypst().replaceAll(/[ \t]+$/gm, "")
);

execFileSync("typstyle", ["-i", resumeData.pdf.generatedTypstPath], {
  stdio: "inherit",
});

execFileSync(
  "typst",
  [
    "compile",
    "--root",
    process.cwd(),
    "--font-path",
    "career/typst/fonts",
    "--pdf-standard",
    "a-2u",
    resumeData.pdf.generatedTypstPath,
    resumeData.pdf.outputPath,
  ],
  { stdio: "inherit" }
);

console.log(`Generated ${resumeData.pdf.outputPath}`);
