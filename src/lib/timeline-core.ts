import { createHash } from "node:crypto";

import { z } from "zod";

export const TIMELINE_SCHEMA_VERSION = 2;
export const TIMELINE_PROMPT_VERSION = "newspaper-v2";
export const TIMELINE_WINDOW_DAYS = 400;

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const entryIdPattern = /^[a-z0-9][a-z0-9-]{5,95}$/;
const sourceKeyPattern = /^[a-z0-9][a-z0-9:_-]{7,127}$/;

export const workBucketSchema = z.enum([
  "Across the work",
  "Applied AI",
  "Open source",
  "Product systems",
  "Infrastructure",
  "Writing",
  "Private product work",
]);

export type WorkBucket = z.infer<typeof workBucketSchema>;

export const timelineImportanceSchema = z.enum([
  "lead",
  "story",
  "brief",
  "pulse",
]);
export type TimelineImportance = z.infer<typeof timelineImportanceSchema>;

export const timelineVisibilitySchema = z.enum([
  "public",
  "private",
  "mixed",
  "anonymous",
]);
export type TimelineVisibility = z.infer<typeof timelineVisibilitySchema>;

export const timelineEntryKindSchema = z.enum([
  "project",
  "activity",
  "issue",
  "pull-request",
]);
export type TimelineEntryKind = z.infer<typeof timelineEntryKindSchema>;

export const timelineCadenceSchema = z.enum([
  "isolated",
  "clustered",
  "streak",
]);
export type TimelineCadence = z.infer<typeof timelineCadenceSchema>;

const timelineHrefSchema = z
  .string()
  .max(500)
  .refine((value) => {
    if (value.startsWith("/")) {
      return !value.startsWith("//");
    }

    try {
      const url = new URL(value);
      return url.protocol === "https:";
    } catch {
      return false;
    }
  }, "Timeline links must be internal paths or HTTPS URLs.");

const privateTextPatterns = [
  /\d/,
  /https?:|www\./i,
  /github/i,
  /@/,
  /\b[\da-f]{7,40}\b/i,
  /\b[A-Z]{2,10}-\d+\b/,
  /\b(?:src|lib|app|packages?|services?|internal)\//i,
  /\b[\w.-]+\.(?:c|cpp|go|java|js|jsx|md|py|rb|rs|sql|ts|tsx|yml|yaml)\b/i,
  /\b[a-z\d._-]+\/[a-z\d._-]+\b/i,
] as const;

const normalizedPrivateCopy = (value: string) =>
  value.normalize("NFKC").replaceAll(/\p{Cf}/gu, "");

export const containsPrivateIdentifier = (value: string) =>
  privateTextPatterns.some((pattern) =>
    pattern.test(normalizedPrivateCopy(value))
  );

export const timelineEditionEntrySchema = z
  .object({
    bucket: workBucketSchema,
    description: z.string().trim().min(20).max(360),
    endDate: z.string().regex(datePattern),
    href: timelineHrefSchema.optional(),
    id: z.string().regex(entryIdPattern),
    importance: timelineImportanceSchema,
    cadence: timelineCadenceSchema,
    kind: timelineEntryKindSchema,
    label: z.string().trim().min(2).max(48).optional(),
    metrics: z.array(z.string().trim().min(2).max(72)).max(3).default([]),
    sourceKeys: z.array(z.string().regex(sourceKeyPattern)).min(1).max(12),
    startDate: z.string().regex(datePattern),
    title: z.string().trim().min(2).max(120),
    visibility: timelineVisibilitySchema,
  })
  .strict()
  .superRefine((entry, context) => {
    if (entry.startDate > entry.endDate) {
      context.addIssue({
        code: "custom",
        message: "startDate must not be after endDate.",
        path: ["startDate"],
      });
    }

    if (entry.href === undefined && entry.label !== undefined) {
      context.addIssue({
        code: "custom",
        message: "A link label requires an href.",
        path: ["label"],
      });
    }

    if (entry.visibility === "public") {
      return;
    }

    if (entry.href !== undefined || entry.label !== undefined) {
      context.addIssue({
        code: "custom",
        message: "Private and mixed entries cannot expose links.",
        path: ["href"],
      });
    }

    if (!entry.startDate.endsWith("-01") || !entry.endDate.endsWith("-01")) {
      context.addIssue({
        code: "custom",
        message: "Private and mixed entries must use month-level dates.",
        path: ["startDate"],
      });
    }

    for (const [field, value] of [
      ["title", entry.title],
      ["description", entry.description],
      ...entry.metrics.map((metric) => ["metrics", metric] as const),
    ] as const) {
      if (containsPrivateIdentifier(value)) {
        context.addIssue({
          code: "custom",
          message:
            "Private copy contains a number, link, code identifier, or repository-like token.",
          path: [field],
        });
      }
    }
  });

export type TimelineEditionEntry = z.infer<typeof timelineEditionEntrySchema>;

export const timelineSelectionPlanSchema = z
  .object({
    selections: z
      .array(
        z
          .object({
            importance: timelineImportanceSchema,
            sourceKey: z.string().regex(sourceKeyPattern),
          })
          .strict()
      )
      .min(1)
      .max(24),
    windowEnd: z.string().regex(datePattern),
    windowStart: z.string().regex(datePattern),
  })
  .strict();

export type TimelineSelectionPlan = z.infer<typeof timelineSelectionPlanSchema>;

export const timelinePlanSchema = z
  .object({
    entries: z.array(timelineEditionEntrySchema).min(1).max(24),
    headline: z.string().trim().min(8).max(100),
    standfirst: z.string().trim().min(20).max(280),
    windowEnd: z.string().regex(datePattern),
    windowStart: z.string().regex(datePattern),
  })
  .strict()
  .superRefine((plan, context) => {
    const windowDays = Math.round(
      (Date.parse(`${plan.windowEnd}T00:00:00Z`) -
        Date.parse(`${plan.windowStart}T00:00:00Z`)) /
        86_400_000
    );

    if (windowDays < 365 || windowDays > TIMELINE_WINDOW_DAYS + 2) {
      context.addIssue({
        code: "custom",
        message: "A timeline edition must cover between 365 and 402 days.",
        path: ["windowStart"],
      });
    }

    const ids = new Set<string>();
    const leadsByMonth = new Map<string, number>();
    let leadCount = 0;
    let storyCount = 0;
    let compactCount = 0;

    for (const [index, entry] of plan.entries.entries()) {
      if (
        entry.startDate < plan.windowStart ||
        entry.endDate > plan.windowEnd
      ) {
        context.addIssue({
          code: "custom",
          message: "Timeline entries must remain inside the edition window.",
          path: ["entries", index, "startDate"],
        });
      }

      if (ids.has(entry.id)) {
        context.addIssue({
          code: "custom",
          message: "Timeline entry ids must be unique.",
          path: ["entries", index, "id"],
        });
      }
      ids.add(entry.id);

      if (entry.importance === "lead") {
        leadCount += 1;
        const month = entry.startDate.slice(0, 7);
        const monthCount = (leadsByMonth.get(month) ?? 0) + 1;
        leadsByMonth.set(month, monthCount);
        if (monthCount > 2) {
          context.addIssue({
            code: "custom",
            message: "No month may contain more than two lead stories.",
            path: ["entries", index, "importance"],
          });
        }
      }

      if (entry.importance === "story") {
        storyCount += 1;
      }

      if (entry.importance === "brief" || entry.importance === "pulse") {
        compactCount += 1;
      }
    }

    if (leadCount > 3) {
      context.addIssue({
        code: "custom",
        message: "A rolling edition may contain at most three lead stories.",
        path: ["entries"],
      });
    }

    if (storyCount > 4) {
      context.addIssue({
        code: "custom",
        message: "A rolling edition may contain at most four stories.",
        path: ["entries"],
      });
    }

    const compactMinimum =
      plan.entries.length < 6
        ? 0
        : Math.max(3, Math.ceil(plan.entries.length * 0.4));
    if (compactCount < compactMinimum) {
      context.addIssue({
        code: "custom",
        message: `An edition of this size needs at least ${compactMinimum} briefs or pulses.`,
        path: ["entries"],
      });
    }
  });

export type TimelinePlan = z.infer<typeof timelinePlanSchema>;

export const timelineEditionSchema = timelinePlanSchema.extend({
  editionKey: z.string().regex(/^[a-f\d]{64}$/),
  generatedAt: z.iso.datetime(),
  promptVersion: z.literal(TIMELINE_PROMPT_VERSION),
  schemaVersion: z.literal(TIMELINE_SCHEMA_VERSION),
  sourceDigest: z.string().regex(/^[a-f\d]{64}$/),
});

export type TimelineEdition = z.infer<typeof timelineEditionSchema>;

export const editionMatchesTimelinePrivacyPolicy = (
  edition: TimelineEdition,
  storedPolicyVersion: string | null,
  activePolicyVersion: string | null
) => {
  const hasProtectedEntries = edition.entries.some(
    (entry) => entry.visibility === "private" || entry.visibility === "mixed"
  );
  return (
    !hasProtectedEntries ||
    (storedPolicyVersion !== null &&
      storedPolicyVersion === activePolicyVersion)
  );
};

export const activityMagnitudeSchema = z.enum([
  "light",
  "steady",
  "sustained",
  "intense",
]);

export const activityClusterKindSchema = z.enum([
  "curated",
  "commit-run",
  "recurrence",
  "issue-opened",
  "pull-request-opened",
  "pull-request-reviewed",
  "repository-created",
  "account-wide-streak",
  "anonymous-month",
  "public-streak",
  "private-month",
  "private-streak",
]);
export type ActivityClusterKind = z.infer<typeof activityClusterKindSchema>;

export const activityClusterSchema = z
  .object({
    bucket: workBucketSchema,
    cadence: timelineCadenceSchema,
    endDate: z.string().regex(datePattern),
    facts: z.array(z.string().trim().min(4).max(360)).min(1).max(8),
    key: z.string().regex(sourceKeyPattern),
    kind: activityClusterKindSchema,
    magnitude: activityMagnitudeSchema,
    maxImportance: timelineImportanceSchema,
    publicHref: timelineHrefSchema.optional(),
    publicLabel: z.string().trim().min(2).max(48).optional(),
    publicTitle: z.string().trim().min(2).max(120).optional(),
    publishable: z.boolean(),
    rollupOf: z.array(z.string().regex(sourceKeyPattern)).max(24).default([]),
    seriesKey: z.string().regex(sourceKeyPattern),
    startDate: z.string().regex(datePattern),
    visibility: timelineVisibilitySchema,
  })
  .strict()
  .superRefine((cluster, context) => {
    if (cluster.visibility !== "public") {
      for (const value of cluster.facts) {
        if (containsPrivateIdentifier(value)) {
          context.addIssue({
            code: "custom",
            message: "Private activity facts must already be generalized.",
            path: ["facts"],
          });
        }
      }

      if (
        cluster.publicHref !== undefined ||
        cluster.publicLabel !== undefined ||
        cluster.publicTitle !== undefined
      ) {
        context.addIssue({
          code: "custom",
          message: "Private activity clusters cannot carry public identity.",
        });
      }
    }
  });

export type ActivityCluster = z.infer<typeof activityClusterSchema>;

export const activityDigestSchema = z
  .object({
    clusters: z.array(activityClusterSchema).max(120),
    coverage: z.enum(["complete", "partial"]),
    generatedAt: z.iso.datetime(),
    windowEnd: z.string().regex(datePattern),
    windowStart: z.string().regex(datePattern),
  })
  .strict();

export type ActivityDigest = z.infer<typeof activityDigestSchema>;

const importanceRank: Record<TimelineImportance, number> = {
  brief: 1,
  lead: 3,
  pulse: 0,
  story: 2,
};

export const digestTimelineValue = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");

const protectedCopyFor = (source: ActivityCluster) => {
  if (source.visibility === "anonymous") {
    return source.kind === "account-wide-streak"
      ? {
          description:
            "An anonymized, account-wide contribution signal formed a sustained rhythm; repository identity and activity type remain unavailable.",
          title: "A sustained account-wide cadence",
        }
      : {
          description:
            "An anonymized contribution signal extended beyond repository-resolved work; it is used only as evidence of cadence.",
          title: "A wider rhythm in the work",
        };
  }

  const subject =
    source.bucket === "Applied AI"
      ? "applied AI"
      : source.bucket.toLocaleLowerCase("en-US");
  const title =
    source.cadence === "streak"
      ? `A sustained run in ${subject}`
      : source.magnitude === "intense"
        ? `A concentrated month in ${subject}`
        : `A steady month in ${subject}`;
  const rhythm =
    source.cadence === "streak"
      ? "sustained run"
      : source.cadence === "clustered"
        ? "clustered rhythm"
        : "quiet rhythm";
  const description =
    source.visibility === "mixed"
      ? `Public releases and protected product work moved through the same ${rhythm}; private identity and exact volume remain withheld.`
      : `Protected activity formed a ${rhythm}; repository identity and exact volume remain withheld.`;

  return { description, title };
};

const entryKindFor = (kind: ActivityClusterKind): TimelineEntryKind => {
  if (kind === "curated" || kind === "repository-created") {
    return "project";
  }
  if (kind === "issue-opened") {
    return "issue";
  }
  if (kind === "pull-request-opened") {
    return "pull-request";
  }
  return "activity";
};

const materializeSelection = (
  source: ActivityCluster,
  importance: TimelineImportance
): TimelineEditionEntry => {
  const protectedCopy =
    source.visibility === "public" ? null : protectedCopyFor(source);
  const title =
    protectedCopy?.title ?? source.publicTitle ?? "A public work signal";
  const description =
    protectedCopy?.description ??
    source.facts[0] ??
    "A verified public work signal appeared during this period.";

  return timelineEditionEntrySchema.parse({
    bucket: source.bucket,
    cadence: source.cadence,
    description,
    endDate:
      source.visibility === "public"
        ? source.endDate
        : `${source.endDate.slice(0, 7)}-01`,
    ...(source.visibility === "public" && source.publicHref !== undefined
      ? { href: source.publicHref, label: source.publicLabel }
      : {}),
    id: `source-${digestTimelineValue(source.key).slice(0, 20)}`,
    importance,
    kind: entryKindFor(source.kind),
    metrics: [],
    sourceKeys: [source.key],
    startDate:
      source.visibility === "public"
        ? source.startDate
        : `${source.startDate.slice(0, 7)}-01`,
    title,
    visibility: source.visibility,
  });
};

const quarterFor = (date: string) => {
  const month = Number(date.slice(5, 7));
  return `${date.slice(0, 4)}-Q${Math.floor((month - 1) / 3) + 1}`;
};

const isPublicEventCluster = (cluster: ActivityCluster) =>
  cluster.kind === "issue-opened" ||
  cluster.kind === "pull-request-opened" ||
  cluster.kind === "repository-created";

export const validateTimelinePlanAgainstDigest = (
  candidate: unknown,
  digest: ActivityDigest
): TimelinePlan => {
  const selectionPlan = timelineSelectionPlanSchema.parse(candidate);
  const clusterByKey = new Map(
    digest.clusters.map((cluster) => [cluster.key, cluster])
  );
  const usedSourceKeys = new Set<string>();

  if (
    selectionPlan.windowStart !== digest.windowStart ||
    selectionPlan.windowEnd !== digest.windowEnd
  ) {
    throw new Error("The edition window does not match the activity digest.");
  }

  const sources = selectionPlan.selections.map((selection) => {
    if (usedSourceKeys.has(selection.sourceKey)) {
      throw new Error(`Activity source is reused: ${selection.sourceKey}`);
    }
    usedSourceKeys.add(selection.sourceKey);
    const source = clusterByKey.get(selection.sourceKey);
    if (source === undefined) {
      throw new Error(`Unknown activity source: ${selection.sourceKey}`);
    }
    if (!source.publishable) {
      throw new Error(
        `Activity source is not publishable: ${selection.sourceKey}`
      );
    }
    if (
      importanceRank[selection.importance] >
      importanceRank[source.maxImportance]
    ) {
      throw new Error(
        `Selection ${selection.sourceKey} overstates its source importance.`
      );
    }
    return { importance: selection.importance, source };
  });

  const publishable = digest.clusters.filter((cluster) => cluster.publishable);
  const minimumEntries = Math.min(9, publishable.length);
  if (sources.length < minimumEntries) {
    throw new Error(
      `This digest needs at least ${minimumEntries} selected entries.`
    );
  }

  const compactCount = sources.filter(
    ({ importance }) => importance === "brief" || importance === "pulse"
  ).length;
  const compactMinimum =
    sources.length < 6 ? 0 : Math.max(3, Math.ceil(sources.length * 0.4));
  if (compactCount < compactMinimum) {
    throw new Error(
      `This edition needs at least ${compactMinimum} briefs or pulses.`
    );
  }

  const eventCandidates = publishable.filter(isPublicEventCluster);
  const selectedEvents = sources.filter(({ source }) =>
    isPublicEventCluster(source)
  );
  const eventMinimum = Math.min(
    3,
    eventCandidates.length,
    Math.floor(sources.length / 3)
  );
  if (selectedEvents.length < eventMinimum) {
    throw new Error(
      `This edition needs at least ${eventMinimum} public event dispatches.`
    );
  }
  if (selectedEvents.length > Math.max(1, Math.ceil(sources.length / 3))) {
    throw new Error(
      "Public event dispatches may occupy at most one third of an edition."
    );
  }

  const streakCandidates = publishable.filter(
    (cluster) => cluster.cadence === "streak"
  );
  if (
    streakCandidates.length > 0 &&
    !sources.some(({ source }) => source.cadence === "streak")
  ) {
    throw new Error("A valid consistency streak must be represented.");
  }

  const candidateQuarters = new Set(
    publishable.map((cluster) => quarterFor(cluster.endDate))
  );
  const selectedQuarters = new Set(
    sources.map(({ source }) => quarterFor(source.endDate))
  );
  if (
    sources.length >= candidateQuarters.size &&
    [...candidateQuarters].some((quarter) => !selectedQuarters.has(quarter))
  ) {
    throw new Error("Each active quarter must retain at least one entry.");
  }

  return timelinePlanSchema.parse({
    entries: sources
      .map(({ importance, source }) => materializeSelection(source, importance))
      .toSorted((left, right) => right.startDate.localeCompare(left.startDate)),
    headline: "The work, along one line.",
    standfirst:
      "A rolling edition of public milestones, sustained runs, and the smaller acts of collaboration between them.",
    windowEnd: digest.windowEnd,
    windowStart: digest.windowStart,
  });
};

export const createTimelineEdition = (
  plan: TimelinePlan,
  digest: ActivityDigest,
  generatedAt = new Date()
): TimelineEdition => {
  const sourceDigest = digestTimelineValue({
    clusters: digest.clusters,
    coverage: digest.coverage,
    windowEnd: digest.windowEnd,
    windowStart: digest.windowStart,
  });
  const editionKey = digestTimelineValue({
    plan,
    promptVersion: TIMELINE_PROMPT_VERSION,
    schemaVersion: TIMELINE_SCHEMA_VERSION,
    sourceDigest,
  });

  return timelineEditionSchema.parse({
    ...plan,
    editionKey,
    generatedAt: generatedAt.toISOString(),
    promptVersion: TIMELINE_PROMPT_VERSION,
    schemaVersion: TIMELINE_SCHEMA_VERSION,
    sourceDigest,
  });
};
