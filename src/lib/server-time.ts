import "server-only";
import { cache } from "react";

import { dateKey } from "@/lib/date";

export const getRequestDay = cache(() => dateKey(new Date()));
