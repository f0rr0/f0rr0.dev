import {
  privateTimelineRepoKey,
  publicTimelineRepoKey,
} from "@/lib/timeline-privacy";

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const safeNodeId = (value: unknown) =>
  typeof value === "string" && /^[A-Za-z\d_=:-]{4,200}$/.test(value)
    ? value
    : null;

export interface TimelineWebhookRevocation {
  repoKeys: string[];
  withdrawAllPrivateActivity: boolean;
}

export const timelineRevocationFromWebhook = (
  body: string,
  eventType: string,
  privacyKey: string | null
): TimelineWebhookRevocation => {
  let payload: unknown;
  try {
    payload = JSON.parse(body) as unknown;
  } catch {
    return { repoKeys: [], withdrawAllPrivateActivity: false };
  }
  if (!isObject(payload)) {
    return { repoKeys: [], withdrawAllPrivateActivity: false };
  }

  const nodeIds = new Set<string>();
  const action = typeof payload.action === "string" ? payload.action : "";
  const withdrawAllPrivateActivity =
    eventType === "installation" &&
    (action === "deleted" || action === "suspend");
  if (eventType === "installation_repositories") {
    const removed = payload.repositories_removed;
    if (Array.isArray(removed)) {
      for (const repository of removed) {
        if (isObject(repository)) {
          const nodeId = safeNodeId(repository.node_id);
          if (nodeId !== null) {
            nodeIds.add(nodeId);
          }
        }
      }
    }
  }

  const { repository } = payload;
  if (
    isObject(repository) &&
    (repository.private === true ||
      repository.visibility === "private" ||
      action === "deleted")
  ) {
    const nodeId = safeNodeId(repository.node_id);
    if (nodeId !== null) {
      nodeIds.add(nodeId);
    }
  }

  const repoKeys = new Set<string>();
  for (const nodeId of nodeIds) {
    repoKeys.add(publicTimelineRepoKey(nodeId));
    if (privacyKey !== null) {
      repoKeys.add(privateTimelineRepoKey(nodeId, privacyKey));
    }
  }

  return {
    repoKeys: [...repoKeys],
    withdrawAllPrivateActivity:
      withdrawAllPrivateActivity || (nodeIds.size > 0 && privacyKey === null),
  };
};
