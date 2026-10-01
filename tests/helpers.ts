import { mock } from "bun:test";

import { env as appEnv } from "../src/env.ts";

export const env = appEnv as {
  -readonly [K in keyof typeof appEnv]: (typeof appEnv)[K];
};

export const mockFetch = (
  implementation: (
    ...args: Parameters<typeof fetch>
  ) => ReturnType<typeof fetch>
): typeof fetch =>
  Object.assign(implementation, { preconnect: fetch.preconnect });

export const installRuntimeCache = () => {
  const values = new Map<string, unknown>();
  const get = mock(async (key: string) => values.get(key) ?? null);
  const set = mock(async (key: string, value: unknown, _options?: unknown) => {
    values.set(key, value);
  });
  const symbol = Symbol.for("@vercel/request-context");
  const previous = Reflect.get(globalThis, symbol);
  Reflect.set(globalThis, symbol, { get: () => ({ cache: { get, set } }) });
  return {
    get,
    set,
    values,
    restore: () => {
      if (previous === undefined) {
        Reflect.deleteProperty(globalThis, symbol);
      } else {
        Reflect.set(globalThis, symbol, previous);
      }
    },
  };
};
