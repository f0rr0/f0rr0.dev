import type {
  BlogPosting,
  CollectionPage,
  Graph,
  ItemList,
  ListItem,
  Person,
  ProfilePage,
  WebSite,
  WithContext,
} from "schema-dts";

import { resumeData } from "@/content/resume";
import type { BlogPost } from "@/lib/blog-utils";
import { publicUrl, siteConfig } from "@/lib/site";

const linkedInUrl = "https://linkedin.com/in/f0rr0";
const githubUrl = "https://github.com/f0rr0";
const yuppiesGithubUrl = "https://github.com/yuppiestechdev";

const personId = () => publicUrl("/#sid-jain");
const websiteId = () => publicUrl("/#website");

const sameAs = [linkedInUrl, githubUrl, yuppiesGithubUrl];
const [currentExperience] = resumeData.experience;
const [currentRole] = currentExperience?.roles ?? [];
const currentCompanyReference =
  resumeData.machineReadable.publicReferences.find(
    (reference) => reference.label === currentExperience?.company
  );

const buildPersonNode = (): Person => ({
  "@id": personId(),
  "@type": "Person",
  alternateName: resumeData.person.alternateNames,
  alumniOf: [
    {
      "@type": "CollegeOrUniversity",
      name: "University of California, Los Angeles",
      sameAs: "https://www.ucla.edu/",
    },
    {
      "@type": "EducationalOrganization",
      name: "Delhi Public School, R. K. Puram",
      sameAs: "https://dpsrkp.net/",
    },
  ],
  description: resumeData.summary,
  email: `mailto:${resumeData.person.email}`,
  image: publicUrl(resumeData.person.image),
  jobTitle: currentRole?.title ?? resumeData.person.role,
  knowsAbout: [
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
    "mobile release infrastructure",
    "DNS",
    "domain registrar infrastructure",
    "Temporal workflows",
    "CI/CD",
    "technical leadership",
  ],
  name: resumeData.person.name,
  sameAs,
  url: publicUrl("/resume"),
  worksFor: {
    "@type": "Organization",
    name: currentExperience?.company ?? "Current employer",
    ...(currentCompanyReference === undefined
      ? {}
      : {
          sameAs: currentCompanyReference.href,
          url: currentCompanyReference.href,
        }),
  },
});

const buildWebsiteNode = (): WebSite => ({
  "@id": websiteId(),
  "@type": "WebSite",
  alternateName: "F0RR0",
  author: {
    "@id": personId(),
    "@type": "Person",
    name: resumeData.person.name,
  },
  description: siteConfig.description,
  inLanguage: "en-US",
  name: resumeData.person.name,
  publisher: {
    "@id": personId(),
    "@type": "Person",
    name: resumeData.person.name,
  },
  url: publicUrl("/"),
});

export const buildRootJsonLd = (): Graph => ({
  "@context": "https://schema.org",
  "@graph": [buildPersonNode(), buildWebsiteNode()],
});

export const buildProfilePageJsonLd = (): WithContext<ProfilePage> => ({
  "@context": "https://schema.org",
  "@id": publicUrl("/resume#profile"),
  "@type": "ProfilePage",
  dateModified: resumeData.lastUpdated,
  description: siteConfig.description,
  isPartOf: {
    "@id": websiteId(),
    "@type": "WebSite",
    name: resumeData.person.name,
    url: publicUrl("/"),
  },
  mainEntity: buildPersonNode(),
  name: "Sid Jain Résumé",
  url: publicUrl("/resume"),
});

export const buildBlogPostingJsonLd = ({
  image,
  post,
  url,
}: {
  image?: string;
  post: BlogPost;
  url: string;
}): WithContext<BlogPosting> => {
  const jsonLd: WithContext<BlogPosting> = {
    "@context": "https://schema.org",
    "@id": `${url}#article`,
    "@type": "BlogPosting",
    author: {
      "@id": personId(),
      "@type": "Person",
      name: post.metadata.author,
      url: publicUrl("/resume"),
    },
    dateModified: (post.updatedAt ?? post.date).toISOString(),
    datePublished: post.date.toISOString(),
    description: post.metadata.summary,
    headline: post.metadata.title,
    inLanguage: "en-US",
    isPartOf: {
      "@id": websiteId(),
      "@type": "WebSite",
      name: resumeData.person.name,
    },
    keywords: post.metadata.tags,
    mainEntityOfPage: {
      "@id": url,
      "@type": "WebPage",
    },
    publisher: {
      "@id": personId(),
      "@type": "Person",
      name: resumeData.person.name,
    },
    url,
    wordCount: post.wordCount,
  };

  if (image !== undefined) {
    jsonLd.image = image;
  }

  return jsonLd;
};

export const buildBlogCollectionJsonLd = (
  posts: BlogPost[]
): WithContext<CollectionPage> => ({
  "@context": "https://schema.org",
  "@id": publicUrl("/blog#collection"),
  "@type": "CollectionPage",
  description: `Notes on what ${resumeData.person.name} is building across product design, engineering, AI, and creative development.`,
  inLanguage: "en-US",
  isPartOf: {
    "@id": websiteId(),
    "@type": "WebSite",
    name: resumeData.person.name,
  },
  mainEntity: {
    "@type": "ItemList",
    itemListElement: posts.map(
      (post, index): ListItem => ({
        "@type": "ListItem",
        item: {
          "@id": publicUrl(`/blog/${post.slug}#article`),
          "@type": "BlogPosting",
          datePublished: post.date.toISOString(),
          headline: post.metadata.title,
          name: post.metadata.title,
          url: publicUrl(`/blog/${post.slug}`),
        },
        name: post.metadata.title,
        position: index + 1,
      })
    ),
    numberOfItems: posts.length,
  } satisfies ItemList,
  name: "Sid Jain Blog",
  url: publicUrl("/blog"),
});
