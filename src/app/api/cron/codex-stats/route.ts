import { revalidatePath } from "next/cache";
import { after } from "next/server";

import { env } from "@/env";
import { getPublicCodexStats } from "@/lib/codex/public-stats";
import { syncCodexAccounts } from "@/lib/codex/sync";
import { reportOperationalError } from "@/lib/operational-error";
import { hasBearerSecret } from "@/lib/request-auth";
import { warmPublicPages } from "@/lib/warm-public-pages";

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
        if ((await getPublicCodexStats()) !== null) {
          await warmPublicPages(["/", "/tokens"]);
        }
      });
    }
    return Response.json({ ok: true, result });
  } catch (error) {
    const errorName = reportOperationalError("codex_stats", error);
    return Response.json({ error: errorName, ok: false }, { status: 503 });
  }
}
