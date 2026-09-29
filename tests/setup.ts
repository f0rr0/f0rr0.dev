import { mock } from "bun:test";
import { AsyncLocalStorage } from "node:async_hooks";

// This import is a Next build-time boundary, not application behavior.
await mock.module("server-only", () => ({}));

// Next installs this global in its server runtime; Bun uses the same native implementation.
Object.assign(globalThis, { AsyncLocalStorage });
