import "server-only";
import { cache } from "react";

export const getRequestTime = cache(() => new Date().toISOString());
