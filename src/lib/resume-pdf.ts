import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";

import {
  resumeCompanyStageLabels,
  resumeData,
  resumeRoleMarkerLabels,
} from "../content/resume";

export function buildResumePdf() {
  const { typstPath } = createRequire(import.meta.url)("@flukxr/typst-cli") as {
    typstPath: string;
  };
  return execFileSync(
    typstPath,
    [
      "compile",
      "--root",
      process.cwd(),
      "--font-path",
      "career/typst/fonts",
      "--pdf-standard",
      "a-2u",
      "--input",
      `resume=${JSON.stringify({
        person: resumeData.person,
        links: resumeData.links,
        summary: resumeData.summary,
        experience: resumeData.experience,
        education: resumeData.education,
        pdf: resumeData.pdf,
        skills: resumeData.skills,
        roleMarkerLabels: resumeRoleMarkerLabels,
        companyStageLabels: resumeCompanyStageLabels,
      })}`,
      "career/typst/resume.typ",
      "-",
    ],
    { maxBuffer: 10 * 1024 * 1024 }
  );
}
