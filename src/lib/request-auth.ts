import { createHash, timingSafeEqual } from "node:crypto";

const digest = (value: string) =>
  createHash("sha256").update(value, "utf-8").digest();

export const constantTimeEqual = (left: string, right: string) =>
  timingSafeEqual(digest(left), digest(right));

export const hasBearerSecret = (
  authorization: string | null,
  secret: string | undefined
) => {
  const normalizedSecret = secret?.trim();
  if (normalizedSecret === undefined || normalizedSecret.length < 16) {
    return false;
  }

  return constantTimeEqual(authorization ?? "", `Bearer ${normalizedSecret}`);
};
