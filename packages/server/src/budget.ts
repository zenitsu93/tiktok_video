import { getDb, spentSince, videoCosts } from "@regie/db";
import { env } from "./env";

export class BudgetError extends Error {}

/** Prices used to log what each call costs (USD). Claude Opus 5.5 list prices per million tokens. */
export const PRICES = {
  claude: { input: 4 / 1e6, output: 20 / 1e6, cacheRead: 0.2 / 1e6, cacheWrite: 5 / 1e6 },
  /** ElevenLabs bills characters against the plan; this is a conservative estimate per character. */
  elevenlabsPerChar: 0.0003,
  /** automation-lab/pinterest-scraper, per result. */
  apifyPerResult: 0.00345,
};

export function claudeCost(u: { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null }) {
  const p = PRICES.claude;
  return (
    u.input_tokens * p.input +
    u.output_tokens * p.output +
    (u.cache_read_input_tokens ?? 0) * p.cacheRead +
    (u.cache_creation_input_tokens ?? 0) * p.cacheWrite
  );
}

/** Refuses a paid call once the daily or per-video cap is reached. */
export async function assertBudget(videoId: string | null) {
  const db = getDb();
  const e = env();
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const day = await spentSince(db, today);
  if (day >= e.BUDGET_DAY_USD) {
    throw new BudgetError(`Budget du jour atteint (${day.toFixed(2)} $ sur ${e.BUDGET_DAY_USD} $). Relève BUDGET_DAY_USD pour continuer.`);
  }
  if (videoId) {
    const rows = await videoCosts(db, videoId);
    const total = rows.reduce((s, r) => s + Number(r.cost), 0);
    if (total >= e.BUDGET_VIDEO_USD) {
      throw new BudgetError(`Budget de cette vidéo atteint (${total.toFixed(2)} $ sur ${e.BUDGET_VIDEO_USD} $).`);
    }
  }
}
