import { closeDatabase } from "../src/db/client";
import { env } from "../src/env";
import {
  GITHUB_EVIDENCE_RECOVERY_CONFIRMATION,
  inspectGitHubEvidenceRecovery,
  repairLegacyGitHubEvidence,
} from "../src/lib/github-activity-worker-store";
import { reportOperationalError } from "../src/lib/operational-error";

type RepairMode = "apply" | "preview";

const SAFE_USAGE_ERRORS = new Set([
  "--mode must be preview or apply.",
  "The GitHub evidence repair arguments are invalid.",
  "The GitHub evidence repair confirmation is invalid.",
]);

const argumentValues = (arguments_: readonly string[]) => {
  const values = new Map<string, string>();
  for (let index = 0; index < arguments_.length; index += 2) {
    const name = arguments_[index];
    const value = arguments_[index + 1];
    if (
      name === undefined ||
      value === undefined ||
      !name.startsWith("--") ||
      values.has(name)
    ) {
      throw new TypeError("The GitHub evidence repair arguments are invalid.");
    }
    values.set(name, value.trim());
  }
  return values;
};

const repairArgumentsFrom = (arguments_: readonly string[]) => {
  const values = argumentValues(arguments_);
  if (
    [...values.keys()].some((name) => !["--confirm", "--mode"].includes(name))
  ) {
    throw new TypeError("The GitHub evidence repair arguments are invalid.");
  }
  const rawMode = values.get("--mode");
  if (rawMode !== "apply" && rawMode !== "preview") {
    throw new TypeError("--mode must be preview or apply.");
  }
  return {
    confirmation: values.get("--confirm") ?? "",
    mode: rawMode as RepairMode,
  };
};

const main = async () => {
  if ((env.DATABASE_URL?.trim().length ?? 0) === 0) {
    throw new Error("DATABASE_URL is not configured.");
  }
  const input = repairArgumentsFrom(process.argv.slice(2));
  try {
    if (input.mode === "preview") {
      const plan = await inspectGitHubEvidenceRecovery();
      process.stdout.write(
        `${JSON.stringify({ mode: input.mode, plan, status: "preview" })}\n`
      );
      process.stdout.write(
        plan.constraintInstalled
          ? "The versioned GitHub evidence recovery was already applied.\n"
          : `Preview only; no rows changed. Database integrity is not finalized until the compatible worker runs or apply is invoked with --confirm ${GITHUB_EVIDENCE_RECOVERY_CONFIRMATION}.\n`
      );
      return;
    }

    const result = await repairLegacyGitHubEvidence(input.confirmation);
    process.stdout.write(
      `${JSON.stringify({ mode: input.mode, ...result })}\n`
    );
    process.stdout.write(
      result.status === "applied"
        ? "The repair committed atomically. Scheduled GitHub workers will rebuild discovery, reconciliation, canonicalization, and publication.\n"
        : "The versioned GitHub evidence recovery was already applied; no rows changed.\n"
    );
  } finally {
    await closeDatabase();
  }
};

if (import.meta.main) {
  try {
    await main();
  } catch (error) {
    const errorName = reportOperationalError(
      "github_evidence_recovery_action",
      error
    );
    const usageMessage =
      error instanceof TypeError && SAFE_USAGE_ERRORS.has(error.message)
        ? error.message
        : null;
    process.stderr.write(
      `${usageMessage ?? `GitHub evidence recovery failed (${errorName}).`}\n`
    );
    process.exitCode = 1;
  }
}
