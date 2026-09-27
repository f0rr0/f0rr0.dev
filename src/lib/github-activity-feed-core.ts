import type {
  PublicGitHubActivityDay,
  PublicGitHubActivityDestination,
  PublicGitHubActivityItem,
  PublicGitHubActivityRepository,
  PublicGitHubWorkUnitFacts,
  PublicGitHubWorkUnitKind,
} from "@/lib/github-activity-types";

interface PublicRepositoryActivityRow {
  activityAt: string;
  id: string;
  repository: PublicGitHubActivityRepository;
}

export interface PublicGitHubWorkUnitRow extends PublicRepositoryActivityRow {
  day: string;
  destination: PublicGitHubActivityDestination | null;
  facts: PublicGitHubWorkUnitFacts;
  headline: string | null;
  kind: PublicGitHubWorkUnitKind;
  summarizing: boolean;
  summary: string | null;
}

export interface PublicGitHubIssueRow extends PublicRepositoryActivityRow {
  day: string;
  destination: PublicGitHubActivityDestination | null;
  title: string;
}

export interface BuildPublicGitHubActivityDaysInput {
  days: readonly string[];
  issues: readonly PublicGitHubIssueRow[];
  workUnits: readonly PublicGitHubWorkUnitRow[];
}

interface MutableRepositoryGroup {
  activityAt: string;
  items: PublicGitHubActivityItem[];
  repository: PublicGitHubActivityRepository;
}

export const getVisibleGitHubActivityDays = (
  days: readonly PublicGitHubActivityDay[],
  today: string
) =>
  days
    .filter(
      (day) =>
        day.day <= today &&
        day.repositories.some((group) => group.items.length > 0)
    )
    .toSorted((left, right) => right.day.localeCompare(left.day));

const compareText = (left: string, right: string) =>
  left < right ? -1 : left > right ? 1 : 0;

const utcDayPattern = /^\d{4}-\d{2}-\d{2}$/u;

const isUtcDay = (value: string) =>
  utcDayPattern.test(value) &&
  new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value;

const assertValidRow = (row: PublicRepositoryActivityRow & { day: string }) => {
  const timestamp = Date.parse(row.activityAt);
  if (!Number.isFinite(timestamp) || !isUtcDay(row.day)) {
    throw new Error("A public activity row has an invalid date or timestamp.");
  }
};

const compareActivityRows = (
  left: Pick<PublicRepositoryActivityRow, "activityAt" | "id">,
  right: Pick<PublicRepositoryActivityRow, "activityAt" | "id">
) =>
  Date.parse(right.activityAt) - Date.parse(left.activityAt) ||
  compareText(left.id, right.id);

const addRepositoryItem = (
  groups: Map<string, MutableRepositoryGroup>,
  row: PublicRepositoryActivityRow,
  item: PublicGitHubActivityItem
) => {
  const current = groups.get(row.repository.key);
  if (current === undefined) {
    groups.set(row.repository.key, {
      activityAt: row.activityAt,
      items: [item],
      repository: row.repository,
    });
    return;
  }
  if (
    current.repository.label !== row.repository.label ||
    current.repository.url !== row.repository.url ||
    current.repository.avatarUrl !== row.repository.avatarUrl
  ) {
    throw new Error("A repository has conflicting public display evidence.");
  }
  current.items.push(item);
  if (Date.parse(row.activityAt) > Date.parse(current.activityAt)) {
    current.activityAt = row.activityAt;
  }
};

export const buildPublicGitHubActivityDays = (
  input: BuildPublicGitHubActivityDaysInput
): readonly PublicGitHubActivityDay[] => {
  const requestedDays = new Set(input.days);
  if (
    requestedDays.size !== input.days.length ||
    input.days.some((day) => !isUtcDay(day))
  ) {
    throw new Error("Public activity days must be unique valid dates.");
  }
  const rowsByDay = new Map<
    string,
    { issues: PublicGitHubIssueRow[]; workUnits: PublicGitHubWorkUnitRow[] }
  >();
  for (const row of [...input.workUnits, ...input.issues]) {
    assertValidRow(row);
    if (!requestedDays.has(row.day)) {
      throw new Error("An activity item belongs to an unrequested day.");
    }
    const { day } = row;
    const target = rowsByDay.get(day) ?? { issues: [], workUnits: [] };
    if ("facts" in row) {
      target.workUnits.push(row);
    } else {
      target.issues.push(row);
    }
    rowsByDay.set(day, target);
  }

  return [...rowsByDay]
    .toSorted(([left], [right]) => right.localeCompare(left))
    .flatMap(([day, rows]) => {
      const groups = new Map<string, MutableRepositoryGroup>();
      for (const row of rows.workUnits) {
        addRepositoryItem(groups, row, {
          activityAt: row.activityAt,
          destination: row.destination,
          facts: row.facts,
          headline: row.headline,
          id: row.id,
          kind: row.kind,
          summarizing: row.summarizing,
          summary: row.summary,
        });
      }
      for (const row of rows.issues) {
        addRepositoryItem(groups, row, {
          activityAt: row.activityAt,
          destination: row.destination,
          id: row.id,
          kind: "issue-opened",
          title: row.title,
        });
      }
      const repositories = [...groups.values()]
        .map((group) => ({
          ...group,
          items: group.items.toSorted(compareActivityRows),
        }))
        .toSorted(
          (left, right) =>
            Date.parse(right.activityAt) - Date.parse(left.activityAt) ||
            compareText(left.repository.key, right.repository.key)
        )
        .map(({ items, repository }) => ({ items, repository }));
      return repositories.length === 0 ? [] : [{ day, repositories }];
    });
};
