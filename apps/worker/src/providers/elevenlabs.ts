import { getDb, recordUsage } from "@regie/db";
import { assertBudget, env, PRICES } from "@regie/server";

/**
 * One request per beat, so changing a sentence re-voices that sentence only.
 * previous_text / next_text keep the intonation continuous across beats.
 */
export async function speak(videoId: string, text: string, around: { previous?: string; next?: string }): Promise<Buffer> {
  await assertBudget(videoId);
  const e = env();
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(e.ELEVENLABS_VOICE_ID)}?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "xi-api-key": e.ELEVENLABS_API_KEY!, "content-type": "application/json", accept: "audio/mpeg" },
    body: JSON.stringify({
      text,
      model_id: e.ELEVENLABS_MODEL,
      previous_text: around.previous,
      next_text: around.next,
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) {
    const detail = (await res.text()).slice(0, 300);
    throw new Error(`ElevenLabs a répondu ${res.status} : ${detail}`);
  }
  const audio = Buffer.from(await res.arrayBuffer());
  await recordUsage(getDb(), {
    videoId,
    provider: "elevenlabs",
    operation: "voix",
    units: { characters: text.length },
    costUsd: (text.length * PRICES.elevenlabsPerChar).toFixed(5),
  });
  return audio;
}
