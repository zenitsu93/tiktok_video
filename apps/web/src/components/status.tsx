const LABELS = {
  draft: ["Brouillon", ""],
  review: ["Script à valider", "warn"],
  generating: ["En préparation", "warn"],
  listen: ["Voix à écouter", "warn"],
  ready: ["Prête", "ok"],
  rendering: ["Montage", "warn"],
  error: ["Erreur", "hot"],
} as const;

export function StatusChip({ status, children }: { status: keyof typeof LABELS; children?: React.ReactNode }) {
  const [label, tone] = LABELS[status] ?? LABELS.draft;
  return (
    <span className={`chip ${tone}`}>
      <span className="dot" />
      {label}
      {children}
    </span>
  );
}
