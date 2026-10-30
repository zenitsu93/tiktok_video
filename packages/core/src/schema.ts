import { z } from "zod";

/**
 * A video is a list of beats (one spoken group of 2 to 6 words, one idea on screen).
 * Every edit in the app touches one beat, and every derived artefact (voice clip,
 * rendered scene) is keyed by a hash of what it depends on, so only what changed
 * is regenerated.
 */

/** Image entrances from the montage skill, in the order the skill rotates them. */
export const ENTRANCES = ["pop", "right", "rise", "zoomin", "left", "drop", "grow", "glide", "arc", "corner"] as const;
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
  arc: "Arc incliné",
  corner: "Coin haut droit",
};

/**
 * A gesture that tells the sentence, picked from its meaning when the script is split
 * (montage skill, « Variations »). Rare: one every four or five lines at most.
 * - fall: the picture lifts a little then falls out of frame on the hero word (« tombe »)
 * - shatter: the card breaks into four pieces on the hero word (« se briser », « exploser »)
 * - mystery: the picture blurs under the text (a secret, something hidden or forgotten)
 * - fullscreen: the picture fills the screen, the title typed over it (the key moment, once per video)
 * - evaporate: the card fades into the white at the end of the idea (end of a chapter)
 * - ghost: a cut-out is born from a blur (a memory, a ghost, something unreal)
 */
export const MOVES = ["none", "fall", "shatter", "mystery", "fullscreen", "evaporate", "ghost"] as const;
export type Move = (typeof MOVES)[number];

export const MOVE_LABELS: Record<Move, string> = {
  none: "Aucun",
  fall: "Tombe",
  shatter: "Se brise",
  mystery: "Flou du mystère",
  fullscreen: "Plein écran",
  evaporate: "S'évapore",
  ghost: "Apparition floue",
};

/**
 * Where the text sits and how it stresses its key word (montage skill, « Placement libre » and text variations).
 * - hero: the hero word huge in Black (default)
 * - size: small + big in the same Regular weight (« et pourtant chaque soir »)
 * - inline: one Regular line, the key word in Black at the same size (long lines)
 * - side: next to a portrait card instead of under it
 * - topright / bottomleft / topleft / bottomright: a text-only screen leaves the centre for a corner
 */
export const PLACES = ["hero", "size", "inline", "side", "topright", "bottomleft", "topleft", "bottomright"] as const;
export type Place = (typeof PLACES)[number];

/** Where the text sits around a card: under or above it, aligned on its left or right edge. */
export const ZONES = ["under", "underright", "above", "aboveright"] as const;
export type Zone = (typeof ZONES)[number];

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
  /** The same image without its background (an asset id), once it has been cut out. */
  clean: z.string().max(80).optional(),
  /** The original came with a flattened checkerboard instead of a background: it is shown cut out. */
  checker: z.boolean().optional(),
  /** A clip (GIF or short video Thomas brought): its first frame, an image asset, for thumbnails and the accent. */
  poster: z.string().max(80).optional(),
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
  /** Italic accent: a work title or a word of confession (hero in Black Italic, else the line in Light Italic). */
  italic: z.boolean().optional(),
  /** Gesture that tells the sentence (absent on videos made before the gestures: none). */
  move: z.enum(MOVES).optional(),
  /** Text placement and stress (absent: hero). */
  place: z.enum(PLACES).optional(),
  /** Text around the card (absent: under). */
  zone: z.enum(ZONES).optional(),
});
export type Beat = z.infer<typeof beatSchema>;

export const lookSchema = z.object({
  seed: z.number().int().min(0).max(1_000_000),
  mono: z.boolean(),
  /** The soft zoom of the video: alternating in and out, always in, always out, or a stronger push in. */
  zoom: z.enum(["alt", "in", "out", "push"]).optional(),
  /** How ideas end: collapse to a point every other scene, every scene, or hard cuts to white. */
  exit: z.enum(["mix", "point", "cut"]).optional(),
});
export type Look = z.infer<typeof lookSchema>;

export const readingSchema = z.object({
  moves: z.record(z.string(), z.enum(MOVES)),
  mood: z.enum(["lumineux", "sombre"]),
});
export type Reading = z.infer<typeof readingSchema>;

/** The montage choices of one beat: what a new style changes, never the words, voice or picture. */
export const beatStyleSchema = z.object({
  entrance: z.enum(ENTRANCES),
  accent: z.boolean(),
  reveal: z.enum(["type", "fade"]),
  move: z.enum(MOVES).optional(),
  place: z.enum(PLACES).optional(),
  zone: z.enum(ZONES).optional(),
});
export type BeatStyle = z.infer<typeof beatStyleSchema>;

export const styleSchema = z.object({ look: lookSchema.nullable(), beats: z.record(z.string(), beatStyleSchema) });
export type Style = z.infer<typeof styleSchema>;

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
  /** Thomas read and approved the script: until then nothing paid (voice, images) is spent. */
  scriptOk: z.boolean().optional(),
  /** Thomas listened to the voice and approved it: only then are images searched (they cost). */
  voiceOk: z.boolean().optional(),
  /** « Je cherche moi-même » : no paid image search, Thomas brings each idea's picture from Pinterest (La Planche). */
  manualImages: z.boolean().optional(),
  /**
   * The video's own look, drawn once when the script is split so no two videos open the same way:
   * mono puts every picture in black and white (a dark song); the cover, record and sleeve keep their colours.
   */
  look: lookSchema.optional(),
  /** Claude's reading of the lines (gesture per beat id, mood), kept so a new style costs nothing more. */
  reading: readingSchema.optional(),
  /** Every montage tried on this video (« Remonter autrement »), the first one being the montage it had before. */
  styles: z.array(styleSchema).max(12).optional(),
  /** Which of `styles` is on screen. */
  styleIndex: z.number().int().min(0).optional(),
  /** The TikTok caption with its hashtags. The send to TikTok carries no text: Thomas pastes it there. */
  caption: z.string().max(2200).optional(),
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
    italic: z.boolean(),
    move: z.enum(MOVES),
    place: z.enum(PLACES),
    zone: z.enum(ZONES),
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
