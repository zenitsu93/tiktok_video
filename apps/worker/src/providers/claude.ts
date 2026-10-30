import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { ENTRANCES, imageQuerySchema, type Beat } from "@regie/core";
import { getDb, recordUsage } from "@regie/db";
import { assertBudget, claudeCost, env } from "@regie/server";
import { z } from "zod";
import { CAPTION_SYSTEM, EDIT_SYSTEM, SCRIPT_SYSTEM, SPLIT_SYSTEM } from "../prompts";

/**
 * Four calls, each sized to its job:
 * - writeScript: researches with web search and writes the script (once per video);
 * - splitScript: cuts the script into beats as strict JSON (once per video);
 * - editBeat: changes one beat from a typed instruction, with only its neighbours as context;
 * - writeCaption: the TikTok caption and hashtags, from the script as it reads now.
 * System prompts are frozen and cached; fallbacks reroute a declined request automatically.
 */

let client: Anthropic | undefined;
const api = () => (client ??= new Anthropic({ apiKey: env().ANTHROPIC_API_KEY }));
const BETAS = ["server-side-fallback-2026-07-01"];

async function logUsage(videoId: string | null, operation: string, u: Anthropic.Beta.BetaUsage) {
  await recordUsage(getDb(), {
    videoId,
    provider: "claude",
    operation,
    units: {
      input: u.input_tokens,
      output: u.output_tokens,
      cacheRead: u.cache_read_input_tokens ?? 0,
      cacheWrite: u.cache_creation_input_tokens ?? 0,
      webSearches: u.server_tool_use?.web_search_requests ?? 0,
    },
    costUsd: (claudeCost(u) + (u.server_tool_use?.web_search_requests ?? 0) * 0.01).toFixed(5),
  });
}

function checkStop(stop: string | null, what: string) {
  if (stop === "refusal") throw new Error(`Claude a refusé ${what}.`);
  if (stop === "max_tokens") throw new Error(`La réponse de Claude pour ${what} a été coupée.`);
}

/** Writes the script, or with `revise`, rewrites Thomas's current version following his instruction. */
export async function writeScript(videoId: string, song: { title: string; artist: string; angle: string }, revise?: { script: string; instruction: string }) {
  await assertBudget(videoId);
  const ask = [
    `Chanson : « ${song.title} » de ${song.artist}.`,
    song.angle ? `Angle souhaité par Thomas : ${song.angle}.` : "Choisis l'anecdote la plus forte que tu peux vérifier.",
  ].join("\n");
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: ask }];
  if (revise) {
    messages.push(
      { role: "assistant", content: revise.script },
      { role: "user", content: `Consigne de Thomas : ${revise.instruction}\n\nRends le script complet corrigé (en gardant ce que la consigne ne touche pas), puis la ligne SOURCES:.` },
    );
  }
  const msg = await api()
    .beta.messages.stream({
      model: env().CLAUDE_MODEL,
      max_tokens: 32000,
      betas: BETAS,
      fallbacks: "default",
      output_config: { effort: revise ? "medium" : "high" },
      cache_control: { type: "ephemeral" },
      system: SCRIPT_SYSTEM,
      tools: [{ type: "web_search_20260209", name: "web_search", max_uses: revise ? 3 : 6 }],
      messages,
    })
    .finalMessage();
  await logUsage(videoId, revise ? "script réécrit" : "script", msg.usage);
  checkStop(msg.stop_reason, "le script");
  const text = msg.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
  const [script, sourcesPart = ""] = text.split(/\n\s*SOURCES\s*:\s*/i);
  const sources = sourcesPart
    .split(/\s+/)
    .map((s) => s.trim())
    .filter((s) => /^https?:\/\//.test(s))
    .slice(0, 20);
  if (!script || script.length < 80) throw new Error("Le script reçu est vide ou trop court.");
  return { script: script.trim(), sources };
}

const splitSchema = z.object({
  beats: z
    .array(
      z.object({
        text: z.string(),
        hero: z.string(),
        layout: z.enum(["card", "cutout", "text", "kinetic", "vinyl", "mascot"]),
        imageQuery: imageQuerySchema,
        italic: z.boolean(),
      }),
    )
    .min(4)
    .max(80),
});

export async function splitScript(videoId: string, script: string) {
  await assertBudget(videoId);
  const msg = await api().beta.messages.parse({
    model: env().CLAUDE_MODEL,
    max_tokens: 16000,
    betas: BETAS,
    fallbacks: "default",
    output_config: { effort: "medium", format: betaZodOutputFormat(splitSchema) },
    cache_control: { type: "ephemeral" },
    system: SPLIT_SYSTEM,
    messages: [{ role: "user", content: script }],
  });
  await logUsage(videoId, "découpage", msg.usage);
  checkStop(msg.stop_reason, "le découpage");
  if (!msg.parsed_output) throw new Error("Le découpage reçu n'est pas lisible.");
  return msg.parsed_output.beats;
}

const editSchema = z.object({
  text: z.string().nullable(),
  hero: z.string().nullable(),
  layout: z.enum(["card", "cutout", "text", "kinetic"]).nullable(),
  entrance: z.enum(ENTRANCES).nullable(),
  imageQueries: z.array(z.string()).nullable(),
  note: z.string(),
});
export type BeatEdit = z.infer<typeof editSchema>;

export async function editBeat(videoId: string, ctx: { before: string[]; target: Beat; after: string[] }, instruction: string) {
  await assertBudget(videoId);
  const t = ctx.target;
  const content = [
    `Avant : ${ctx.before.join(" / ") || "(début)"}`,
    `Passage ${t.id} : « ${t.text} »`,
    `  héros : « ${t.hero} », mise en page : ${t.layout}, entrée : ${t.entrance}, recherches image : ${t.imageQuery.queries.join(" | ") || "aucune"}`,
    `Après : ${ctx.after.join(" / ") || "(fin)"}`,
    "",
    `Consigne de Thomas : ${instruction}`,
  ].join("\n");
  const msg = await api().beta.messages.parse({
    model: env().CLAUDE_MODEL,
    max_tokens: 4000,
    betas: BETAS,
    fallbacks: "default",
    output_config: { effort: "low", format: betaZodOutputFormat(editSchema) },
    cache_control: { type: "ephemeral" },
    system: EDIT_SYSTEM,
    messages: [{ role: "user", content }],
  });
  await logUsage(videoId, `retouche ${t.id}`, msg.usage);
  checkStop(msg.stop_reason, "la retouche");
  if (!msg.parsed_output) throw new Error("La retouche reçue n'est pas lisible.");
  return msg.parsed_output;
}

const captionSchema = z.object({ caption: z.string() });

/** Thomas wants exactly three hashtags: the first three kept, on their own last line. */
export function threeTags(caption: string): string {
  const tags = [...new Set(caption.match(/#[\p{L}\p{N}_]+/gu) ?? [])].slice(0, 3);
  const text = caption.replace(/#[\p{L}\p{N}_]+/gu, "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  return tags.length ? `${text}\n${tags.join(" ")}` : text;
}

export async function writeCaption(videoId: string, song: { title: string; artist: string }, script: string) {
  await assertBudget(videoId);
  const msg = await api().beta.messages.parse({
    model: env().CLAUDE_MODEL,
    max_tokens: 2000,
    betas: BETAS,
    fallbacks: "default",
    output_config: { effort: "low", format: betaZodOutputFormat(captionSchema) },
    cache_control: { type: "ephemeral" },
    system: CAPTION_SYSTEM,
    messages: [{ role: "user", content: `Chanson : « ${song.title} » de ${song.artist}.\n\nScript :\n${script}` }],
  });
  await logUsage(videoId, "légende", msg.usage);
  checkStop(msg.stop_reason, "la légende");
  const caption = msg.parsed_output?.caption.trim();
  if (!caption) throw new Error("La légende reçue est vide.");
  return threeTags(caption).slice(0, 2200);
}
