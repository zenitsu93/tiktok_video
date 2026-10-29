import { z } from "zod";

/**
 * A video is a list of beats (one spoken group of 2 to 6 words, one idea on screen).
 * Every edit in the app touches one beat, and every derived artefact (voice clip,
 * rendered scene) is keyed by a hash of what it depends on, so only what changed
 * is regenerated.
 */

/** Image entrances from the montage skill, in the order the skill rotates them. */
export const ENTRANCES = ["pop", "right", "rise", "zoomin", "left", "drop", "grow", "glide"] as const;
export type Entrance = (typeof ENTRANCES)[number];

export const ENTRANCE_LABELS: Record<Entrance, string> = {
  pop: "Pop",
  right: "Depuis la droite",
  rise: "Montée",
  zoomin: "Zoom avant",
  left: "Depuis la gauche",
  drop: "Descente",
  grow: "Grossir-reposer",
  glide: "Glissé",
};

/**
 * How a beat is laid out:
 * - card: image in a rounded card + text under it
 * - cutout: image posed directly on white (line art, detoured person)
 * - text: text alone on white (dates, numbers)
 * - kinetic: long imageless sentence as a justified block of lines
 * - vinyl: spinning record with the album cover as label (intro / outro)
 * - mascot: the pleading emoji mascot (subscribe call)
 */
export const LAYOUTS = ["card", "cutout", "text", "kinetic", "vinyl", "mascot"] as const;
export type Layout = (typeof LAYOUTS)[number];

export const LAYOUT_LABELS: Record<Layout, string> = {
  card: "Carte image",
  cutout: "Détourage",
  text: "Texte seul",
  kinetic: "Bloc cinétique",
  vinyl: "Vinyle",
  mascot: "Mascotte",
};

export const assetSchema = z.object({
  id: z.string().min(1).max(80),
  kind: z.enum(["image", "audio", "video"]),
  mime: z.string().max(80),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  /** Seconds, for audio. */
  duration: z.number().nonnegative().optional(),
  /** Hero colour sampled from the image, darkened to stay readable on white. */
  accent: z.string().regex(/^#[0-9a-f]{6}$/i).nullable().optional(),
  source: z.string().max(2048).optional(),
});
export type Asset = z.infer<typeof assetSchema>;

export const imageQuerySchema = z.object({
  kind: z.enum(["cover", "pinterest", "none"]),
  queries: z.array(z.string().min(1).max(120)).max(3),
});
export type ImageQuery = z.infer<typeof imageQuerySchema>;

export const beatSchema = z.object({
  id: z.string().regex(/^b\d{2,3}$/),
  /** What the voice says, exactly as typed on screen. */
  text: z.string().min(1).max(400),
  /** The one hero word or group shown big; empty when none. Must appear in text. */
  hero: z.string().max(80),
  layout: z.enum(LAYOUTS),
  entrance: z.enum(ENTRANCES),
  /** Selected image (asset id), null for text-only beats. */
  image: z.string().nullable(),
  /** Images already downloaded for this beat, so switching costs nothing. */
  candidates: z.array(z.string()).max(24),
  imageQuery: imageQuerySchema,
  /** Hero takes the image accent colour. */
  accent: z.boolean(),
  /** Grey-then-black reveal instead of letter typing. */
  reveal: z.enum(["type", "fade"]),
  /** Voice clip for this beat (asset id) and the text it was made from. */
  voice: z.string().nullable(),
  voiceText: z.string().nullable(),
  /** Silence after the clip, in seconds. */
  gap: z.number().min(0).max(3),
});
export type Beat = z.infer<typeof beatSchema>;

export const videoDocSchema = z.object({
  title: z.string().min(1).max(120),
  artist: z.string().min(1).max(120),
  angle: z.string().max(300),
  /** Album cover asset, used by vinyl beats. */
  cover: z.string().nullable(),
  /** All voice clips mixed at their beat times (asset id), rebuilt after each voice change. */
  voiceTrack: z.string().nullable().default(null),
  beats: z.array(beatSchema).max(80),
  assets: z.record(z.string(), assetSchema),
  /** Fact sources returned with the script, shown under the script. */
  sources: z.array(z.string().max(400)).max(20),
  /** The script as Claude wrote it, kept until it is split, so a retry after a cut does not pay for it twice. */
  draft: z.string().max(40_000).nullable().optional(),
});
export type VideoDoc = z.infer<typeof videoDocSchema>;

/** The fields a person can change by hand on a beat (all free: no model call). */
export const beatPatchSchema = z
  .object({
    text: z.string().trim().min(1).max(400),
    hero: z.string().trim().max(80),
    layout: z.enum(LAYOUTS),
    entrance: z.enum(ENTRANCES),
    image: z.string().max(80).nullable(),
    accent: z.boolean(),
    reveal: z.enum(["type", "fade"]),
    gap: z.number().min(0).max(3),
  })
  .partial()
  .strict();
export type BeatPatch = z.infer<typeof beatPatchSchema>;

export const newVideoSchema = z
  .object({
    title: z.string().trim().min(1).max(120),
    artist: z.string().trim().min(1).max(120),
    angle: z.string().trim().max(300).default(""),
  })
  .strict();
export type NewVideo = z.infer<typeof newVideoSchema>;
