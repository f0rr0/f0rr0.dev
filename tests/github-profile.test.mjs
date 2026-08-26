import { describe, expect, test } from "bun:test";

import {
  createUnavailableGitHubProfile,
  parseGitHubRepositoriesResponse,
} from "../src/lib/github-profile-core.ts";

const repository = (overrides = {}) => ({
  description: "A useful project",
  fork: false,
  forks_count: 2,
  html_url: "https://github.com/f0rr0/example",
  language: "TypeScript",
  name: "example",
  owner: { login: "f0rr0" },
  private: false,
  stargazers_count: 5,
  topics: ["nextjs"],
  updated_at: "2026-08-26T12:00:00Z",
  ...overrides,
});

describe("GitHub public profile", () => {
  test("parses and sorts public owned non-fork repositories", () => {
    const projects = parseGitHubRepositoriesResponse(
      [
        repository(),
        repository({
          html_url: "https://github.com/f0rr0/popular",
          name: "popular",
          stargazers_count: 10,
        }),
        repository({
          html_url: "https://github.com/f0rr0/private",
          name: "private",
          private: true,
        }),
      ],
      "f0rr0"
    );

    expect(projects?.map((project) => project.name)).toEqual([
      "popular",
      "example",
    ]);
  });

  test("provides curated projects when GitHub is unavailable", () => {
    const profile = createUnavailableGitHubProfile("f0rr0");
    expect(profile.status).toBe("unavailable");
    expect(profile.projects.length).toBeGreaterThan(0);
  });
});
