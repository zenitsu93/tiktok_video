import { getDb, recordUsage } from "@regie/db";
import { assertBudget, env, PRICES } from "@regie/server";

/**
 * The whole script in one take, so the voice reads it in one go instead of restarting
 * every few words. The letter timings that come with it say where each beat sits.
 */
export async function speakTake(videoId: string, text: string): Promise<{ audio: Buffer; starts: number[]; ends: number[] }> {
  await assertBudget(videoId);
  const e = env();
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(e.ELEVENLABS_VOICE_ID)}/with-timestamps?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "xi-api-key": e.ELEVENLABS_API_KEY!, "content-type": "application/json" },
    body: JSON.stringify({ text, model_id: e.ELEVENLABS_MODEL }),
    signal: AbortSignal.timeout(180_000),
  });
  if (!res.ok) {
    const detail = (await res.text()).slice(0, 300);
    throw new Error(`ElevenLabs a répondu ${res.status} : ${detail}`);
  }
  const body = (await res.json()) as {
    audio_base64: string;
    alignment: { characters: string[]; character_start_times_seconds: number[]; character_end_times_seconds: number[] } | null;
  };
  await recordUsage(getDb(), {
    videoId,
    provider: "elevenlabs",
    operation: "voix",
    units: { characters: text.length },
    costUsd: (text.length * PRICES.elevenlabsPerChar).toFixed(5),
  });
  const a = body.alignment;
  if (!a || a.characters.length !== text.length || a.characters.join("") !== text) {
    throw new Error("ElevenLabs n'a pas renvoyé le minutage de chaque lettre.");
  }
  return { audio: Buffer.from(body.audio_base64, "base64"), starts: a.character_start_times_seconds, ends: a.character_end_times_seconds };
}

/**
 * One beat alone, when its sentence changed after the take.
 * previous_text / next_text keep the intonation continuous with its neighbours.
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
