import { z } from "zod";

import { env } from "@/env";
import { TRACKED_GITHUB_ACCOUNTS } from "@/lib/github-commits-core";

const tokensSchema = z.record(z.string(), z.string().trim().min(1));

export const githubTokensFrom = (
  value?: string,
  accounts: readonly string[] = TRACKED_GITHUB_ACCOUNTS
): Record<string, string> => {
  if (value === undefined || value.trim() === "") {
    return {};
  }
  try {
    const tokens: Record<string, string> = {};
    for (const [key, token] of Object.entries(
      tokensSchema.parse(JSON.parse(value))
    )) {
      const login = key.toLowerCase();
      if (!accounts.includes(login) || Object.hasOwn(tokens, login)) {
        throw new TypeError("Unknown or duplicate account.");
      }
      tokens[login] = token;
    }
    return tokens;
  } catch {
    // Parser errors can include credentials; never expose their original details.
    throw new TypeError(
      "GITHUB_TOKENS must be a JSON object mapping configured GitHub logins to nonempty tokens, without duplicate logins."
    );
  }
};

export const tokenForGitHubAccount = (
  login: string,
  environment: Pick<typeof env, "GITHUB_TOKENS"> = env
) => {
  const tokens = githubTokensFrom(environment.GITHUB_TOKENS);
  const token = Object.hasOwn(tokens, login) ? tokens[login] : undefined;
  if (token === undefined) {
    throw new Error(`No GitHub token is configured for ${login}.`);
  }
  return token;
};

export const tokensForGitHubAccount = (login?: string) => {
  const tokens = githubTokensFrom(env.GITHUB_TOKENS);
  return [
    ...new Set(
      [
        ...(login === undefined ? [] : [tokens[login]]),
        ...Object.values(tokens),
        env.GITHUB_TOKEN,
      ].flatMap((value) =>
        value === undefined || value.trim() === "" ? [] : [value.trim()]
      )
    ),
  ];
};
