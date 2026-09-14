import { primaryGitHubProfile, resumeData } from "@/content/resume";
import { sitePreferences } from "@/content/site";
import { CANONICAL_SITE_URL } from "@/lib/site-url";

export const siteConfig = {
  author: {
    bio: resumeData.summary,
    handle: primaryGitHubProfile.username,
    image: resumeData.person.image,
    name: resumeData.person.name,
    role: resumeData.person.role,
  },
  description: `${resumeData.person.name}. ${resumeData.summary}`,
  language: sitePreferences.language,
  locale: sitePreferences.language.replace("-", "_"),
  name: resumeData.person.name,
  shortName: primaryGitHubProfile.username.toUpperCase(),
  url: CANONICAL_SITE_URL,
};

export const publicUrl = (path: string) =>
  new URL(path, CANONICAL_SITE_URL).toString();

export const resumePdfUrl = "/resume/sid-jain-resume.pdf";
