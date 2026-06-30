import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { resumeData } from "../src/content/resume";
import type {
  LogoAsset,
  ResumeExperience,
  ResumeRole,
} from "../src/content/resume";

const quote = (value: string) => JSON.stringify(value);

const clean = (value: string) =>
  value
    .replaceAll("’", "'")
    .replaceAll("“", '"')
    .replaceAll("”", '"')
    .replaceAll("–", "-")
    .replaceAll("—", "-");

const text = (
  value: string,
  {
    fill = "muted",
    font = "Source Sans 3",
    size = "10.5pt",
    style = "normal",
    weight = "regular",
  }: {
    fill?: string;
    font?: string;
    size?: string;
    style?: string;
    weight?: string;
  } = {}
) =>
  `#t(${quote(clean(value))}, fill: ${fill}, font: ${quote(
    font
  )}, size: ${size}, weight: ${quote(weight)}, style: ${quote(style)})`;

const paragraph = (
  value: string,
  options: Parameters<typeof text>[1] = {},
  { leading = "0.9em" }: { leading?: string } = {}
) => `#block[
  #set par(leading: ${leading})
  ${text(value, options)}
]`;

const link = (label: string, href: string) =>
  `#link(${quote(href)})[${text(label, { fill: "accent" })}]`;

const twToPt = (value: number) => `${value * 3}pt`;

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
    return "-1.5pt";
  }
  if (value.includes("translate-y-px")) {
    return "0.75pt";
  }
  return "0pt";
};

const tileFill = (logo: LogoAsset) => {
  if (logo.tileClassName.includes("bg-white")) {
    return "#ffffff";
  }

  return /bg-\[(#[\da-fA-F]+)\]/.exec(logo.tileClassName)?.[1] ?? "#1a1918";
};

const logoPath = (logo: LogoAsset) => `/public/${logo.src.replace(/^\//, "")}`;

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
  logoTile(logo, {
    className: logo.imageClassName,
    defaultHeight: "15pt",
    defaultWidth: "21pt",
    tileSize: "30pt",
  });

const bulletLogo = (logo: LogoAsset) =>
  logoTile(logo, {
    className: logo.bulletImageClassName ?? logo.imageClassName,
    defaultHeight: "12pt",
    defaultWidth: "15pt",
    tileSize: "21pt",
  });

const bulletContent = (bullet: NonNullable<ResumeRole["bullets"]>[number]) => {
  if (typeof bullet === "string") {
    return `
#grid(
  columns: (6pt, 1fr),
  gutter: 6pt,
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
  columns: (6pt, 1fr),
  gutter: 6pt,
  align: top,
  [${text("·", { fill: "accent", weight: "bold" })}],
  [${body}],
)`;
  }

  return `
#grid(
  columns: (21pt, 1fr),
  gutter: 7.5pt,
  align: top,
  [#move(dy: 1.5pt)[${bulletLogo(bullet.logo)}]],
  [${body}],
)`;
};

const stack = (items: string[], gap = "1.5pt") => items.join(`\n#v(${gap})\n`);

const sectionTitle = (
  title: string,
  { after = "10.5pt", before = "21pt" } = {}
) => `
#v(${before})
${text(title, {
  fill: "strong",
  font: "Literata",
  size: "15pt",
  weight: "bold",
})}
#v(${after})
`;

const roleBlock = (role: ResumeRole) => {
  const bullets = role.bullets?.map(bulletContent) ?? [];

  return `
#v(3pt)
#grid(
  columns: (1fr, auto),
  gutter: 12pt,
  [${text(role.title, { fill: "strong", weight: "medium" })}],
  [${text(`${role.location} · ${role.dates}`, { size: "9pt" })}],
)
${role.summary === undefined ? "" : `#v(6pt)\n${text(role.summary)}`}
${bullets.length === 0 ? "" : `#v(6pt)\n${stack(bullets)}`}
`;
};

const experienceItem = (item: ResumeExperience) => `
#block(breakable: false)[
#grid(
  columns: (30pt, 1fr),
  gutter: 12pt,
  align: top,
  [${companyLogo(item.logo)}],
  [
    ${text(item.company, {
      fill: "strong",
      font: "Literata",
      size: "12pt",
      weight: "bold",
    })}
    #v(3pt)
    ${text(item.tagline, { size: "9pt", style: "italic" })}
    ${item.roles.map(roleBlock).join("\n")}
  ],
)
]
`;

const sectionWithItems = (
  title: string,
  items: string[],
  titleOptions?: Parameters<typeof sectionTitle>[1]
) => {
  const [firstItem, ...remainingItems] = items;

  return `
#block(breakable: false)[
  ${sectionTitle(title, titleOptions)}
  ${firstItem ?? ""}
]
${remainingItems.map((item) => `#v(18pt)\n${item}`).join("\n")}
`;
};

const buildTypst = () => {
  const contactLinks = resumeData.links
    .map((item) => link(item.label, item.href))
    .join(" #h(12pt)\n");

  const experience = resumeData.experience.map(experienceItem);

  const education = resumeData.education.map(experienceItem);

  return `#set document(
  title: ${quote(resumeData.pdf.title)},
  author: ${quote(resumeData.person.name)},
  keywords: ("AI product engineer", "AI lead", "staff full-stack engineer", "founding engineer", "TypeScript", "React Native", "Chromium", "DNS"),
)
#set page(
  paper: "us-letter",
  margin: (x: 0.58in, top: 0.42in, bottom: 0.42in),
  fill: rgb("#1a1918"),
)
#set text(font: "Source Sans 3", size: 10.5pt, fill: rgb("#a8a29e"), lang: "en")
#set par(leading: 0.625em, justify: false)

#let background = rgb("#1a1918")
#let strong = rgb("#e7e5e4")
#let muted = rgb("#a8a29e")
#let accent = rgb("#d97706")
#let rule-color = rgb("#3a3836")
#let t(s, fill: muted, font: "Source Sans 3", size: 10.5pt, weight: "regular", style: "normal") = text(font: font, fill: fill, size: size, weight: weight, style: style, s)
#let logo-tile(path, fill: background, size: 30pt, image-width: 21pt, image-height: 15pt, dy: 0pt) = rect(
  width: size,
  height: size,
  radius: size / 2,
  fill: fill,
  stroke: 0.5pt + rule-color,
)[#align(center + horizon)[#move(dy: dy)[#image(path, width: image-width, height: image-height, fit: "contain")]]]

#align(left)[
  ${text(resumeData.person.name, {
    fill: "strong",
    font: "Literata",
    size: "36pt",
    weight: "bold",
  })}
  #v(-18pt)
  ${paragraph(resumeData.summary)}
  #v(12pt)
  ${contactLinks}

  ${sectionWithItems("Experience", experience, { before: "12pt" })}

  ${sectionWithItems("Education", education)}
]
`;
};

await mkdir(path.dirname(resumeData.pdf.generatedTypstPath), {
  recursive: true,
});
await mkdir(path.dirname(resumeData.pdf.outputPath), { recursive: true });
await writeFile(resumeData.pdf.generatedTypstPath, buildTypst());

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
