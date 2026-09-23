// Public presentation only. Account credentials stay in the existing server store.
export interface TokenPreferences {
  enabled: boolean;
  homepagePreview: boolean;
  title: string;
  introduction: string;
  sections: {
    activity: boolean;
    models: boolean;
    composition: boolean;
    tools: boolean;
  };
  excludedTools: readonly string[];
  workLink: { href: string; label: string } | null;
}

export const tokenPreferences: TokenPreferences = {
  enabled: true,
  homepagePreview: true,
  title: "Token log",
  introduction:
    "I use AI to explore ideas, write and review code, and delegate work to agents. Here’s what that looks like in Codex.",
  sections: {
    activity: true,
    models: true,
    composition: true,
    tools: true,
  },
  excludedTools: [],
  workLink: { href: "/work", label: "See what I’m shipping." },
};
