import { defineTool } from "eve/tools";
import { z } from "zod";

import {
  createTimelineEdition,
  timelineSelectionPlanSchema,
  validateTimelinePlanAgainstDigest,
} from "../../src/lib/timeline-core";
import { loadTimelineActivityDigest } from "../../src/lib/timeline-editorial";
import { publishTimelineEdition } from "../../src/lib/timeline-store";

const agentModel = "openai/gpt-5.4-mini";

export default defineTool({
  approval: ({ session }) => {
    const actor = session.auth.current;
    return actor?.authenticator === "app" &&
      actor.principalId === "eve:app" &&
      actor.principalType === "runtime"
      ? "not-applicable"
      : "denied";
  },
  description:
    "Validate and atomically publish a complete timeline edition supported by the current sanitized digest.",
  execute: async (candidate) => {
    const digest = await loadTimelineActivityDigest();
    const plan = validateTimelinePlanAgainstDigest(candidate, digest);
    const edition = createTimelineEdition(plan, digest);
    const editionKey = await publishTimelineEdition(edition, agentModel);
    return { editionKey, status: "published" as const };
  },
  inputSchema: timelineSelectionPlanSchema,
  outputSchema: z
    .object({
      editionKey: z.string().regex(/^[a-f\d]{64}$/),
      status: z.literal("published"),
    })
    .strict(),
});
