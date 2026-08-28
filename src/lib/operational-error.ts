const SAFE_IDENTIFIER = /^[A-Za-z][A-Za-z0-9_]{0,79}$/u;

const errorName = (error: unknown) => {
  const name = error instanceof Error ? error.name : "UnknownError";
  return SAFE_IDENTIFIER.test(name) ? name : "UnknownError";
};

const errorStatus = (error: unknown) => {
  if (typeof error !== "object" || error === null || !("status" in error)) {
    return null;
  }
  const { status } = error;
  return typeof status === "number" &&
    Number.isSafeInteger(status) &&
    status >= 400 &&
    status <= 599
    ? status
    : null;
};

/** Logs only bounded classifications—never exception messages or payloads. */
export const reportOperationalError = (scope: string, error: unknown) => {
  const name = errorName(error);
  const status = errorStatus(error);
  process.stderr.write(
    `${JSON.stringify({
      event: "operational_error",
      name,
      scope,
      ...(status === null ? {} : { status }),
    })}\n`
  );
  return name;
};
