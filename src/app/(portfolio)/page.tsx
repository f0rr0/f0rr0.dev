import type { Metadata } from "next";

import { resumeData } from "@/content/resume";
import { publicUrl, siteConfig } from "@/lib/site";

import { ResumePageContent } from "./resume/page";

const resumeDescription = siteConfig.description;

export const metadata: Metadata = {
  alternates: {
    canonical: "/",
  },
  description: resumeDescription,
  openGraph: {
    description: resumeDescription,
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
    description: resumeDescription,
    images: [resumeData.person.image],
    title: "Sid Jain Resume",
  },
};

export default function Home() {
  return <ResumePageContent includeProfileJsonLd={false} showSiteNav={false} />;
}
