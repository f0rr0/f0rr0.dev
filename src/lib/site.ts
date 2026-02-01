export const siteConfig = {
  name: "F0RR0",
  description: "Creative developer building digital experiences.",
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  language: "en-US",
  locale: "en_US",
  author: {
    name: "F0RR0",
  },
};

export const absoluteUrl = (path: string) =>
  new URL(path, siteConfig.url).toString();
