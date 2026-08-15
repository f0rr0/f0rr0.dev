import { defineTool } from "eve/tools";
import { z } from "zod";

import { activityDigestSchema } from "../../src/lib/timeline-core";
import { loadTimelineActivityDigest } from "../../src/lib/timeline-editorial";

export default defineTool({
  description:
    "Load the rolling privacy-safe GitHub activity digest. This is the only evidence allowed for an edition.",
  execute: async () => await loadTimelineActivityDigest(),
  inputSchema: z.object({}).strict(),
  outputSchema: activityDigestSchema,
});
