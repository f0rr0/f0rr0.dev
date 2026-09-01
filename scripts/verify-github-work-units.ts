import { closeDatabase } from "../src/db/client";
import { readGitHubWorkUnitCrosswalk } from "../src/lib/github-work-unit-crosswalk";

const argumentsFrom = (values: readonly string[]) => {
  const repositories: string[] = [];
  let since: string | undefined;
  let until: string | undefined;
  for (let index = 0; index < values.length; index += 2) {
    const flag = values[index];
    const value = values[index + 1];
    if (value === undefined || !value.trim()) {
      throw new TypeError(`Missing value for ${flag ?? "argument"}.`);
    }
    if (flag === "--repository") {
      repositories.push(value);
    } else if (flag === "--since" && since === undefined) {
      since = value;
    } else if (flag === "--until" && until === undefined) {
      until = value;
    } else {
      throw new TypeError(`Unknown or duplicate argument: ${flag}`);
    }
  }
  if (since === undefined || until === undefined) {
    throw new TypeError("--since and --until are required.");
  }
  return { repositories, since, until };
};

if (import.meta.main) {
  try {
    const report = await readGitHubWorkUnitCrosswalk(
      argumentsFrom(process.argv.slice(2))
    );
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    if (!report.invariants.passed) {
      process.exitCode = 1;
    }
  } catch (error) {
    const name = error instanceof Error ? error.name : "UnknownError";
    const message = error instanceof Error ? error.message : "Unknown error";
    process.stderr.write(`${JSON.stringify({ error: name, message })}\n`);
    process.exitCode = 1;
  } finally {
    await closeDatabase();
  }
}
