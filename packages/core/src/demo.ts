import type { Beat, Layout, VideoDoc } from "./schema";

/**
 * The Like a Tattoo episode, cut the way the montage skill cuts it.
 * Used by demo mode (no API keys yet) and by the tests.
 */
type Row = [text: string, hero: string, layout: Layout, queries: string[]];

const ROWS: Row[] = [
  ["Tu connais l'histoire de", "", "vinyl", []],
  ["Like a Tattoo, de Sade ?", "Like a Tattoo", "vinyl", []],
  ["Je raconte l'histoire derrière vos chansons préférées,", "", "mascot", []],
  ["alors abonne-toi pour la suite,", "abonne-toi", "mascot", []],
  ["ça me soutient énormément.", "énormément", "mascot", []],
  ["Mais au fait, cette chanson n'est pas née en studio.", "studio", "card", ["vintage recording studio aesthetic", "analog mixing console 90s"]],
  ["Elle est née dans un bar.", "bar", "card", ["dim bar night painting aesthetic", "new york bar 90s night"]],
  ["Début des années 90, à New York.", "New York", "card", ["new york 1990 night street photography", "nyc 90s aesthetic"]],
  ["Sade Adu est assise dans un bar de Manhattan", "Sade Adu", "card", ["sade adu 1992", "sade adu love deluxe era"]],
  ["quand un inconnu commence à lui parler.", "inconnu", "card", ["lonely man at bar painting", "man alone bar counter silhouette"]],
  ["C'est un ancien soldat.", "soldat", "card", ["veteran soldier vintage portrait", "soldier line art"]],
  ["Il a fait la guerre,", "guerre", "card", ["war memory painting dark", "haunted soldier eyes art"]],
  ["et ce qu'il a vu là-bas ne l'a jamais quitté.", "jamais", "card", ["war memory painting dark", "haunted soldier eyes art"]],
  ["On ne sait presque rien de cet homme.", "rien", "text", []],
  ["Mais sa confession, elle, est restée.", "confession", "card", ["two glasses bar night aesthetic", "late night conversation bar painting"]],
  ["Avec Andrew Hale et Stuart Matthewman,", "", "card", ["sade band 1992", "sade band stuart matthewman andrew hale"]],
  ["Sade en fait une chanson.", "chanson", "card", ["sade band 1992", "sade band stuart matthewman andrew hale"]],
  ["Juste une guitare, une voix calme,", "guitare", "cutout", ["acoustic guitar line art", "guitar soft light aesthetic"]],
  ["et cette idée : il y a des souvenirs qu'on ne peut pas effacer.", "effacer", "kinetic", []],
  ["Ils restent sur toi, comme un tatouage.", "tatouage", "card", ["fine line tattoo arm aesthetic", "tattoo skin close up aesthetic"]],
  ["En 1992,", "1992", "text", []],
  ["Like a Tattoo sort sur l'album Love Deluxe.", "Love Deluxe", "card", ["sade love deluxe album cover"]],
  ["Ce n'est pas juste une chanson.", "juste", "text", []],
  ["C'est la cicatrice d'un inconnu, gravée pour toujours.", "cicatrice", "card", ["scar heart painting", "healing scar art aesthetic"]],
  ["Tu connaissais cette histoire ?", "", "vinyl", []],
];

export function demoBeats(): Beat[] {
  const rotation = ["pop", "right", "rise", "zoomin", "left", "drop", "grow", "glide"] as const;
  let r = 0;
  return ROWS.map(([text, hero, layout, queries], i) => {
    const sameAsPrev = i > 0 && ROWS[i - 1]![3].join() === queries.join() && queries.length > 0;
    const entrance = layout === "card" || layout === "cutout" ? rotation[sameAsPrev ? r : (r = (r + 1) % rotation.length)]! : "pop";
    return {
      id: `b${String(i + 1).padStart(2, "0")}`,
      text,
      hero,
      layout,
      entrance,
      image: null,
      candidates: [],
      imageQuery: queries.length ? { kind: "pinterest" as const, queries } : { kind: "none" as const, queries: [] },
      accent: i % 4 === 2,
      reveal: i % 3 === 2 && layout === "text" ? ("fade" as const) : ("type" as const),
      voice: null,
      voiceText: null,
      gap: /[.?!]$/.test(text) ? 0.35 : 0.08,
    };
  });
}

export function demoDoc(): VideoDoc {
  return {
    title: "Like a Tattoo",
    artist: "Sade",
    angle: "la confession d'un inconnu dans un bar",
    cover: null,
    voiceTrack: null,
    beats: demoBeats(),
    assets: {},
    sources: [],
  };
}
