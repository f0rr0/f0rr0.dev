import { revalidatePath } from "next/cache";
import { after } from "next/server";

import { env } from "@/env";
import { getPublicCodexStats } from "@/lib/codex/public-stats";
import { syncCodexAccounts } from "@/lib/codex/sync";
import { reportOperationalError } from "@/lib/operational-error";
import { hasBearerSecret } from "@/lib/request-auth";

export const maxDuration = 60;

export async function POST(request: Request) {
  if (!hasBearerSecret(request.headers.get("authorization"), env.CRON_SECRET)) {
    return Response.json({ ok: false }, { status: 401 });
  }

  try {
    const result = await syncCodexAccounts();
    if (result.updated > 0) {
      revalidatePath("/");
      revalidatePath("/tokens");

      after(async () => {
        await getPublicCodexStats();
      });
    }
    return Response.json({ ok: true, result });
  } catch (error) {
    const errorName = reportOperationalError("codex_stats", error);
    return Response.json({ error: errorName, ok: false }, { status: 503 });
  }
}
