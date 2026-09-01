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
  destination: PublicGitHubActivityDestination;
  facts: PublicGitHubWorkUnitFacts;
  kind: PublicGitHubWorkUnitKind;
  outcome: string | null;
}

export interface PublicGitHubIssueRow extends PublicRepositoryActivityRow {
  day: string;
  destination: PublicGitHubActivityDestination;
  title: string;
}

export interface BuildPublicGitHubActivityDaysInput {
  days: readonly string[];
  issues: readonly PublicGitHubIssueRow[];
  privateDays: ReadonlySet<string>;
  workUnits: readonly PublicGitHubWorkUnitRow[];
}

interface MutableRepositoryGroup {
  activityAt: string;
  items: { activityAt: string; item: PublicGitHubActivityItem }[];
  repository: PublicGitHubActivityRepository;
}

const compareText = (left: string, right: string) =>
  left < right ? -1 : left > right ? 1 : 0;

const utcDayPattern = /^\d{4}-\d{2}-\d{2}$/u;

const isUtcDay = (value: string) =>
  utcDayPattern.test(value) &&
  new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value;

const assertValidRow = (row: PublicRepositoryActivityRow & { day: string }) => {
  const timestamp = Date.parse(row.activityAt);
  if (
    !Number.isFinite(timestamp) ||
    !isUtcDay(row.day) ||
    new Date(timestamp).toISOString().slice(0, 10) !== row.day
  ) {
    throw new Error("A public activity row has an invalid UTC placement.");
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
      items: [{ activityAt: row.activityAt, item }],
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
  current.items.push({ activityAt: row.activityAt, item });
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
    throw new Error("Public activity days must be unique valid UTC dates.");
  }
  if ([...input.privateDays].some((day) => !requestedDays.has(day))) {
    throw new Error("Private activity must belong to a requested UTC day.");
  }
  const rowsByDay = new Map<
    string,
    { issues: PublicGitHubIssueRow[]; workUnits: PublicGitHubWorkUnitRow[] }
  >(input.days.map((day) => [day, { issues: [], workUnits: [] }]));
  for (const row of input.workUnits) {
    assertValidRow(row);
    const target = rowsByDay.get(row.day);
    if (target === undefined) {
      throw new Error("A work unit belongs to an unrequested UTC day.");
    }
    target.workUnits.push(row);
  }
  for (const row of input.issues) {
    assertValidRow(row);
    const target = rowsByDay.get(row.day);
    if (target === undefined) {
      throw new Error("An issue belongs to an unrequested UTC day.");
    }
    target.issues.push(row);
  }

  return input.days.flatMap((day) => {
    const rows = rowsByDay.get(day);
    if (rows === undefined) {
      throw new Error("A requested activity day was not initialized.");
    }
    const groups = new Map<string, MutableRepositoryGroup>();
    for (const row of rows.workUnits) {
      addRepositoryItem(groups, row, {
        destination: row.destination,
        facts: row.facts,
        id: row.id,
        kind: row.kind,
        outcome: row.outcome,
      });
    }
    for (const row of rows.issues) {
      addRepositoryItem(groups, row, {
        destination: row.destination,
        id: row.id,
        kind: "issue-opened",
        title: row.title,
      });
    }
    const repositories = [...groups.values()]
      .map((group) => ({
        ...group,
        items: group.items
          .toSorted((left, right) =>
            compareActivityRows(
              { activityAt: left.activityAt, id: left.item.id },
              { activityAt: right.activityAt, id: right.item.id }
            )
          )
          .map(({ item }) => item),
      }))
      .toSorted(
        (left, right) =>
          Date.parse(right.activityAt) - Date.parse(left.activityAt) ||
          compareText(left.repository.key, right.repository.key)
      )
      .map(({ items, repository }) => ({ items, repository }));
    const privateWork = input.privateDays.has(day);
    return repositories.length === 0 && !privateWork
      ? []
      : [{ day, privateWork, repositories }];
  });
};
