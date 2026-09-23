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

import { pages } from "@/content/pages";
import { resumeData, socialProfiles } from "@/content/resume";
import type { BlogPost } from "@/lib/blog-utils";
import { buildBlogMetadata, buildPageMetadata } from "@/lib/page-metadata";
import { publicUrl, siteConfig } from "@/lib/site";

const personId = () => publicUrl("/#person");
const websiteId = () => publicUrl("/#website");
const sameAs = socialProfiles.map(({ url }) => url);
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
  alumniOf: resumeData.education.map((school) => ({
    "@type": "EducationalOrganization" as const,
    name: school.company,
    sameAs: school.url,
  })),
  description: resumeData.summary,
  email: `mailto:${resumeData.person.email}`,
  image: publicUrl(resumeData.person.image),
  jobTitle: currentRole?.title ?? resumeData.person.role,
  knowsAbout: [...resumeData.skills],
  name: resumeData.person.name,
  sameAs,
  url: publicUrl(pages.journey.path),
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
  alternateName: siteConfig.shortName,
  author: {
    "@id": personId(),
    "@type": "Person",
    name: resumeData.person.name,
  },
  description: siteConfig.description,
  inLanguage: siteConfig.language,
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
  "@id": publicUrl(`${pages.journey.path}#profile`),
  "@type": "ProfilePage",
  dateModified: resumeData.lastUpdated,
  description: buildPageMetadata(pages.journey).description,
  isPartOf: {
    "@id": websiteId(),
    "@type": "WebSite",
    name: resumeData.person.name,
    url: publicUrl("/"),
  },
  mainEntity: buildPersonNode(),
  name: buildPageMetadata(pages.journey).title.absolute,
  url: publicUrl(pages.journey.path),
});

export const buildBlogPostingJsonLd = (
  post: BlogPost
): WithContext<BlogPosting> => {
  const metadata = buildBlogMetadata(post);
  const { url } = metadata.openGraph;
  const jsonLd: WithContext<BlogPosting> = {
    "@context": "https://schema.org",
    "@id": `${url}#article`,
    "@type": "BlogPosting",
    author: {
      "@id": personId(),
      "@type": "Person",
      name: post.metadata.author,
      url: publicUrl(pages.journey.path),
    },
    dateModified: (post.updatedAt ?? post.date).toISOString(),
    datePublished: post.date.toISOString(),
    description: metadata.description,
    image: metadata.openGraph.images[0].url,
    headline: post.metadata.title,
    inLanguage: siteConfig.language,
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

  return jsonLd;
};

export const buildBlogCollectionJsonLd = (
  posts: BlogPost[]
): WithContext<CollectionPage> => ({
  "@context": "https://schema.org",
  "@id": publicUrl(`${pages.writing.path}#collection`),
  "@type": "CollectionPage",
  description: buildPageMetadata(pages.writing).description,
  inLanguage: siteConfig.language,
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
          "@id": publicUrl(`/writing/${post.slug}#article`),
          "@type": "BlogPosting",
          datePublished: post.date.toISOString(),
          headline: post.metadata.title,
          name: post.metadata.title,
          url: publicUrl(`/writing/${post.slug}`),
        },
        name: post.metadata.title,
        position: index + 1,
      })
    ),
    numberOfItems: posts.length,
  } satisfies ItemList,
  name: buildPageMetadata(pages.writing).title.absolute,
  url: publicUrl(pages.writing.path),
});
