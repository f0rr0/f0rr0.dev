import { closeDatabase } from "../src/db/client";
import { env } from "../src/env";
import {
  githubActivityAuditRequestFrom,
  runGitHubActivityAudit,
} from "../src/lib/github-activity-audit";
import type { GitHubActivityAuditStatus } from "../src/lib/github-activity-audit";

interface GitHubActivityAuditArguments {
  account: string;
  endDate: string;
  startDate: string;
}

export const githubActivityAuditArgumentsFrom = (
  arguments_: readonly string[]
): GitHubActivityAuditArguments => {
  const allowed = new Set(["--account", "--end-date", "--start-date"]);
  const values = new Map<string, string>();
  for (let index = 0; index < arguments_.length; index += 2) {
    const name = arguments_[index];
    const value = arguments_[index + 1];
    if (
      name === undefined ||
      value === undefined ||
      !allowed.has(name) ||
      values.has(name)
    ) {
      throw new TypeError("The GitHub activity audit arguments are invalid.");
    }
    values.set(name, value.trim());
  }
  const account = values.get("--account");
  const endDate = values.get("--end-date");
  const startDate = values.get("--start-date");
  if (
    account === undefined ||
    account.length === 0 ||
    endDate === undefined ||
    endDate.length === 0 ||
    startDate === undefined ||
    startDate.length === 0
  ) {
    throw new TypeError(
      "--account, --start-date, and --end-date are required."
    );
  }
  return { account, endDate, startDate };
};

export const githubActivityAuditExitCodeFromStatus = (
  status: GitHubActivityAuditStatus
) => {
  if (status === "stored_projection_verified") {
    return 0;
  }
  return status === "inconclusive" ? 2 : 1;
};

const main = async () => {
  if (env.DATABASE_URL === undefined) {
    throw new Error("DATABASE_URL is not configured.");
  }
  const input = githubActivityAuditArgumentsFrom(process.argv.slice(2));
  const request = githubActivityAuditRequestFrom(input);
  if (request === null) {
    throw new TypeError(
      "The audit range must use valid inclusive UTC dates, end today or earlier, span at most 31 days, and name a tracked account."
    );
  }
  try {
    const report = await runGitHubActivityAudit(request);
    process.stdout.write(`${JSON.stringify(report)}\n`);
    const exitCode = githubActivityAuditExitCodeFromStatus(report.status);
    if (exitCode !== 0) {
      process.exitCode = exitCode;
    }
  } finally {
    await closeDatabase();
  }
};

if (import.meta.main) {
  try {
    await main();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    process.stderr.write(`${message}\n`);
    process.exitCode = 2;
  }
}
