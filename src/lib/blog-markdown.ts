import type { BlogPost } from "@/lib/blog-utils";

const isoDate = (date: Date) => date.toISOString().slice(0, 10);

export const buildBlogPostMarkdown = ({
  body,
  canonicalUrl,
  post,
}: {
  body: string;
  canonicalUrl: string;
  post: BlogPost;
}) => {
  const { metadata } = post;
  const dates = [`Published ${isoDate(post.date)}`];

  if (post.updatedAt !== undefined) {
    dates.push(`updated ${isoDate(post.updatedAt)}`);
  }

  return `# ${metadata.title}

> ${metadata.summary}

${metadata.author} · ${dates.join(" · ")}

Canonical post: ${canonicalUrl}

---

${body.trim()}
`;
};
