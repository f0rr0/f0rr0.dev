const parseDatabaseUrl = (value: string | undefined, name: string) => {
  if (value === undefined || value.trim().length === 0) {
    throw new Error(`${name} is not configured.`);
  }
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error(`${name} must be a valid PostgreSQL URL.`);
  }
  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    throw new Error(`${name} must use PostgreSQL.`);
  }
  return url;
};

export const runtimeDatabaseUrl = (value: string) => {
  const url = parseDatabaseUrl(value, "DATABASE_URL");
  if (
    (url.hostname.endsWith(".pooler.supabase.com") ||
      url.hostname.endsWith(".supabase.co")) &&
    url.port !== "6543"
  ) {
    throw new Error(
      "DATABASE_URL must use the Supabase transaction pooler (port 6543). Copy its URL from the Connect panel."
    );
  }
  return value.trim();
};

export const administrationDatabaseUrl = (environment: {
  DATABASE_URL_UNPOOLED?: string;
}) => {
  const value = environment.DATABASE_URL_UNPOOLED?.trim() ?? "";
  const url = parseDatabaseUrl(value, "DATABASE_URL_UNPOOLED");
  if (url.port === "6543") {
    throw new Error(
      "DATABASE_URL_UNPOOLED must use a direct connection or session pooler (port 5432), not a transaction pooler."
    );
  }
  return value;
};
