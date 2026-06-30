import type { Metadata } from "next";

import { resumeData } from "@/content/resume";
import { publicUrl, siteConfig } from "@/lib/site";

import { ResumePageContent } from "./resume/page";

export const metadata: Metadata = {
  alternates: {
    canonical: "/",
  },
  description:
    "Sid Jain resume: Senior Full-Stack Engineer / AI Lead, founder of Yuppies Tech, and AI product engineer at Namefi.",
  openGraph: {
    description:
      "Sid Jain resume: Senior Full-Stack Engineer / AI Lead, founder of Yuppies Tech, and AI product engineer at Namefi.",
    images: [resumeData.person.image],
    locale: siteConfig.locale,
    siteName: siteConfig.name,
    title: "Sid Jain Resume",
    type: "profile",
    url: publicUrl("/"),
  },
  title: "Resume",
  twitter: {
    card: "summary",
    description:
      "Sid Jain resume: Senior Full-Stack Engineer / AI Lead, founder of Yuppies Tech, and AI product engineer at Namefi.",
    images: [resumeData.person.image],
    title: "Sid Jain Resume",
  },
};

export default function Home() {
  return <ResumePageContent includeProfileJsonLd={false} showSiteNav={false} />;
}
