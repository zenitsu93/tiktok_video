/**
 * "Quelle chanson ?" typed in letter by letter, the way the videos type their text,
 * then the question mark drops in. Pure CSS: each letter gets its delay from --i.
 */
export function TypedTitle({ first, second }: { first: string; second: string }) {
  let i = 0;
  const letters = (word: string) =>
    [...word].map((c) =>
      c === "?" ? (
        <b key={i} className="q" style={{ "--i": i++ } as React.CSSProperties}>
          ?
        </b>
      ) : (
        <i key={i} style={{ "--i": i++ } as React.CSSProperties}>
          {c === " " ? " " : c}
        </i>
      ),
    );
  return (
    <h1 className="typed" aria-label={`${first} ${second}`}>
      <span aria-hidden>{letters(first)}</span> <span aria-hidden>{letters(second)}</span>
    </h1>
  );
}
