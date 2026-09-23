import { afterEach, expect, test } from "bun:test";

import {
  githubTokensFrom,
  tokenForGitHubAccount,
  tokensForGitHubAccount,
} from "../src/lib/github-accounts";
import { fetchGitHub, githubApiUrl } from "../src/lib/github-api";
import { assertGitHubTokenIdentity } from "../src/lib/github-commits";
import {
  TRACKED_GITHUB_ACCOUNTS,
  TRACKED_GITHUB_USER_IDS,
} from "../src/lib/github-commits-core";
import { env, mockFetch } from "./helpers";

const originalFetch = globalThis.fetch;
const originalEnvironment = {
  GITHUB_TOKENS: env.GITHUB_TOKENS,
  GITHUB_TOKEN: env.GITHUB_TOKEN,
};
afterEach(() => {
  globalThis.fetch = originalFetch;
  Object.assign(env, originalEnvironment);
});

test("parses arbitrary configured account keys and rejects malformed or ambiguous input without exposing tokens", () => {
  expect(githubTokensFrom()).toEqual({});
  expect(githubTokensFrom(" ")).toEqual({});
  expect(
    githubTokensFrom('{"Alice":" one ","bob":"two"}', ["alice", "bob"])
  ).toEqual({ alice: "one", bob: "two" });
  for (const value of [
    '{"unknown":"private-value"}',
    '{"alice":"private-value","ALICE":"second"}',
    '{"alice":""}',
    '["private-value"]',
    "null",
    '"private-value"',
    "private-value",
  ]) {
    expect(() => githubTokensFrom(value, ["alice"])).toThrow(TypeError);
    try {
      githubTokensFrom(value, ["alice"]);
    } catch (error) {
      expect(String(error)).not.toContain("private-value");
    }
  }
});

test("credential rotation, removal and order never change authors or require network calls", () => {
  globalThis.fetch = mockFetch(() => {
    throw new Error("Unexpected discovery request");
  });
  const authors = TRACKED_GITHUB_USER_IDS;
  const accounts = TRACKED_GITHUB_ACCOUNTS;
  delete env.GITHUB_TOKEN;
  for (const tokens of [
    { f0rr0: "first", yuppiestechdev: "second" },
    { yuppiestechdev: "second", f0rr0: "rotated" },
    { yuppiestechdev: "second" },
    {},
  ]) {
    env.GITHUB_TOKENS = JSON.stringify(tokens);
    expect(TRACKED_GITHUB_USER_IDS).toEqual(authors);
    expect(TRACKED_GITHUB_ACCOUNTS).toEqual(accounts);
    expect(tokensForGitHubAccount()).toEqual(Object.values(tokens));
  }
  expect(() => tokenForGitHubAccount("f0rr0")).toThrow("No GitHub token");
  env.GITHUB_TOKENS = JSON.stringify({
    f0rr0: "first",
    yuppiestechdev: "second",
  });
  env.GITHUB_TOKEN = "first";
  expect(tokensForGitHubAccount("yuppiestechdev")).toEqual(["second", "first"]);
  expect(tokenForGitHubAccount("f0rr0")).toBe("first");
});

test("existing verification checks both stable identity and configured login in one request", async () => {
  let calls = 0;
  let identity = { id: 8_574_219, login: "F0rr0" };
  globalThis.fetch = mockFetch(async (input) => {
    calls += 1;
    expect(new URL(input instanceof Request ? input.url : input).pathname).toBe(
      "/user"
    );
    return Response.json(identity);
  });
  await assertGitHubTokenIdentity("f0rr0", "test-token");
  expect(calls).toBe(1);
  identity = { id: 99_666_891, login: "f0rr0" };
  expect(assertGitHubTokenIdentity("f0rr0", "test-token")).rejects.toThrow(
    "not authenticated"
  );
  identity = { id: 8_574_219, login: "renamed" };
  expect(assertGitHubTokenIdentity("f0rr0", "test-token")).rejects.toThrow(
    "not authenticated"
  );
});

test("public credentials do not enable account polling and explicit API tokens take precedence", async () => {
  delete env.GITHUB_TOKENS;
  env.GITHUB_TOKEN = "public-token";
  expect(tokensForGitHubAccount()).toEqual(["public-token"]);
  expect(() => tokenForGitHubAccount("f0rr0")).toThrow("No GitHub token");
  const headers: (string | null)[] = [];
  globalThis.fetch = mockFetch(async (_input, init) => {
    headers.push(new Headers(init?.headers).get("Authorization"));
    return Response.json({});
  });
  await fetchGitHub(githubApiUrl("/user"));
  await fetchGitHub(githubApiUrl("/user"), { token: "account-token" });
  await fetchGitHub(githubApiUrl("/user"), { token: null });
  delete env.GITHUB_TOKEN;
  await fetchGitHub(githubApiUrl("/user"));
  expect(headers).toEqual([
    "Bearer public-token",
    "Bearer account-token",
    null,
    null,
  ]);
});
