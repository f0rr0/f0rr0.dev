const CURSOR_MAX_LENGTH = 512;
const PUBLIC_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export interface GitHubActivityCursor {
  committedAt: string;
  publicId: string;
}

const validCursor = (value: unknown): value is GitHubActivityCursor => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.committedAt !== "string" ||
    typeof candidate.publicId !== "string" ||
    !PUBLIC_ID.test(candidate.publicId)
  ) {
    return false;
  }
  const date = new Date(candidate.committedAt);
  return (
    !Number.isNaN(date.getTime()) &&
    date.toISOString() === candidate.committedAt
  );
};

export const encodeGitHubActivityCursor = (cursor: GitHubActivityCursor) =>
  Buffer.from(JSON.stringify(cursor), "utf-8").toString("base64url");

export const decodeGitHubActivityCursor = (
  value: string | null
): GitHubActivityCursor | null => {
  if (value === null || value.length === 0) {
    return null;
  }
  if (value.length > CURSOR_MAX_LENGTH) {
    throw new TypeError("The GitHub activity cursor is invalid.");
  }
  try {
    const decoded = JSON.parse(
      Buffer.from(value, "base64url").toString("utf-8")
    ) as unknown;
    if (!validCursor(decoded)) {
      throw new TypeError("The GitHub activity cursor is invalid.");
    }
    return decoded;
  } catch (error) {
    if (error instanceof TypeError) {
      throw error;
    }
    throw new TypeError("The GitHub activity cursor is invalid.", {
      cause: error,
    });
  }
};
