import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createInterface } from "node:readline";
import { setTimeout as delay } from "node:timers/promises";

import { ZodError } from "zod";

import {
  createCodexAccountSnapshot,
  validateCodexAuthJson,
} from "@/lib/codex/stats";
import {
  claimCodexAccounts,
  CodexStoreError,
  completeCodexAccountSync,
  failCodexAccountSync,
  readCodexAuthSecret,
  updateCodexAuthSecret,
} from "@/lib/codex/store";
import type { ClaimedCodexAccount } from "@/lib/codex/store";

const APP_SERVER_TIMEOUT_MS = 45_000;

type ErrorCode =
  | "app_server_failed"
  | "app_server_timeout"
  | "auth_invalid"
  | "auth_missing"
  | "database_error"
  | "invalid_response"
  | "lease_lost"
  | "protocol_error"
  | "unknown";

class CodexAppServerError extends Error {
  readonly code: ErrorCode;

  constructor(code: ErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = "CodexAppServerError";
  }
}

interface PendingRequest {
  reject: (error: Error) => void;
  resolve: (value: unknown) => void;
}

const childEnvironment = (codexHome: string): NodeJS.ProcessEnv => {
  const inherited = [
    "ALL_PROXY",
    "HTTPS_PROXY",
    "HTTP_PROXY",
    "LANG",
    "NO_PROXY",
    "PATH",
    "SSL_CERT_DIR",
    "SSL_CERT_FILE",
    "all_proxy",
    "https_proxy",
    "http_proxy",
    "no_proxy",
  ];
  return Object.fromEntries([
    ["CODEX_HOME", codexHome],
    ...inherited.flatMap((name) => {
      const value = process.env[name];
      return value === undefined ? [] : [[name, value]];
    }),
  ]);
};

const runAppServer = async (codexHome: string) => {
  const child = spawn("codex", ["app-server", "--stdio"], {
    cwd: codexHome,
    env: childEnvironment(codexHome),
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
  });
  const pending = new Map<number, PendingRequest>();
  let nextId = 1;
  let terminalError: Error | null = null;

  const rejectPending = (error: Error) => {
    for (const request of pending.values()) {
      request.reject(error);
    }
    pending.clear();
  };

  const closed = Promise.withResolvers<null>();
  child.once("error", () => {
    terminalError = new CodexAppServerError(
      "app_server_failed",
      "Codex App Server could not start."
    );
    rejectPending(terminalError);
    closed.resolve(null);
  });
  child.once("exit", (code) => {
    if (terminalError === null && pending.size > 0) {
      terminalError = new CodexAppServerError(
        "app_server_failed",
        `Codex App Server exited before completing its requests (${String(code)}).`
      );
      rejectPending(terminalError);
    }
    closed.resolve(null);
  });

  child.stderr.resume();

  const lines = createInterface({ input: child.stdout });
  lines.on("line", (line) => {
    let message: unknown;
    try {
      message = JSON.parse(line);
    } catch {
      const error = new CodexAppServerError(
        "protocol_error",
        "Codex App Server returned invalid JSON."
      );
      terminalError = error;
      rejectPending(error);
      return;
    }
    if (typeof message !== "object" || message === null || !("id" in message)) {
      return;
    }
    const { id } = message as { id?: unknown };
    if (typeof id !== "number") {
      return;
    }
    const request = pending.get(id);
    if (request === undefined) {
      return;
    }
    pending.delete(id);
    if ("error" in message) {
      request.reject(
        new CodexAppServerError(
          "protocol_error",
          "Codex App Server rejected an account request."
        )
      );
      return;
    }
    request.resolve((message as { result?: unknown }).result);
  });

  const send = (message: object) => {
    child.stdin.write(`${JSON.stringify(message)}\n`);
  };

  const request = async (method: string, params?: object) => {
    const id = nextId;
    nextId += 1;
    const response = Promise.withResolvers<unknown>();
    pending.set(id, response);
    send({ id, method, ...(params === undefined ? {} : { params }) });
    return await response.promise;
  };

  const timeout = setTimeout(() => {
    terminalError = new CodexAppServerError(
      "app_server_timeout",
      "Codex App Server timed out."
    );
    rejectPending(terminalError);
    child.kill("SIGKILL");
  }, APP_SERVER_TIMEOUT_MS);

  try {
    await request("initialize", {
      capabilities: null,
      clientInfo: {
        name: "f0rr0_dev_codex_stats",
        title: "f0rr0.dev Codex statistics",
        version: "1.0.0",
      },
    });
    send({ method: "initialized" });
    const [usage, rateLimits] = await Promise.all([
      request("account/usage/read"),
      request("account/rateLimits/read"),
    ]);
    return { rateLimits, usage };
  } finally {
    clearTimeout(timeout);
    child.stdin.end();
    await Promise.race([closed.promise, delay(1000)]);
    if (child.exitCode === null && child.signalCode === null) {
      child.kill("SIGKILL");
      await closed.promise;
    }
    lines.close();
  }
};

const syncAccount = async (account: ClaimedCodexAccount) => {
  const authJson = await readCodexAuthSecret(account.authSecretName);
  try {
    validateCodexAuthJson(authJson);
  } catch {
    throw new CodexAppServerError(
      "auth_invalid",
      "Stored Codex auth is invalid."
    );
  }

  const codexHome = await mkdtemp(path.join(tmpdir(), "f0rr0-codex-stats-"));
  const authPath = path.join(codexHome, "auth.json");
  try {
    await Promise.all([
      writeFile(authPath, authJson, { mode: 0o600 }),
      writeFile(
        path.join(codexHome, "config.toml"),
        'cli_auth_credentials_store = "file"\n',
        { mode: 0o600 }
      ),
    ]);
    let failure: unknown = null;
    let raw: Awaited<ReturnType<typeof runAppServer>> | null = null;
    try {
      raw = await runAppServer(codexHome);
    } catch (error) {
      failure = error;
    }
    const refreshedAuthJson = await readFile(authPath, "utf-8");
    try {
      validateCodexAuthJson(refreshedAuthJson);
    } catch {
      throw new CodexAppServerError(
        "auth_invalid",
        "Codex App Server wrote invalid auth."
      );
    }
    if (refreshedAuthJson !== authJson) {
      await updateCodexAuthSecret(account, refreshedAuthJson);
    }
    if (failure !== null) {
      throw failure instanceof Error
        ? failure
        : new CodexAppServerError("unknown", "Codex App Server failed.");
    }
    if (raw === null) {
      throw new CodexAppServerError(
        "app_server_failed",
        "Codex App Server returned no account data."
      );
    }
    let snapshot;
    try {
      snapshot = createCodexAccountSnapshot(raw.usage, raw.rateLimits);
    } catch (error) {
      if (error instanceof ZodError) {
        throw new CodexAppServerError(
          "invalid_response",
          "Codex App Server returned an invalid account snapshot."
        );
      }
      throw error;
    }
    await completeCodexAccountSync(account, snapshot);
  } finally {
    await rm(codexHome, { force: true, recursive: true });
  }
};

const errorCode = (error: unknown): ErrorCode => {
  if (
    error instanceof CodexAppServerError ||
    error instanceof CodexStoreError
  ) {
    return error.code;
  }
  return error instanceof Error ? "database_error" : "unknown";
};

export const syncCodexAccounts = async () => {
  const accounts = await claimCodexAccounts();
  // ponytail: configured accounts run concurrently; add a limiter if this becomes multi-user.
  const results = await Promise.all(
    accounts.map(async (account) => {
      try {
        await syncAccount(account);
        return { id: account.id, ok: true as const };
      } catch (error) {
        const code = errorCode(error);
        try {
          await failCodexAccountSync(account, code);
        } catch {
          return {
            code: "database_error" as const,
            id: account.id,
            ok: false as const,
          };
        }
        return { code, id: account.id, ok: false as const };
      }
    })
  );
  const failed = results.flatMap((result) =>
    result.ok ? [] : [{ code: result.code, id: result.id }]
  );
  return {
    claimed: accounts.length,
    failed,
    updated: results.length - failed.length,
  };
};
