// Public presentation preferences. Profile and project content live beside this file.
export const sitePreferences = {
  title: "Software and Writing",
  description:
    "I build software, from the interfaces people use to the systems that power them. These days, that includes AI. I write about what I learn along the way.",
  language: "en-US",
  workLogTimeZone: "Asia/Kolkata",
};

// Public authors to include in the work log. Credentials never select authors.
export const githubAccounts: readonly { login: string; id: string }[] = [
  { login: "f0rr0", id: "8574219" },
  { login: "yuppiestechdev", id: "99666891" },
];

// Shared page labels and routes, also used by navigation and visible headings.
export const siteNavigation = {
  writing: { title: "Writing", path: "/writing" },
  work: { title: "Work", path: "/work" },
  tokens: { title: "Tokens", path: "/tokens" },
  journey: { title: "Journey", path: "/journey" },
} as const;
