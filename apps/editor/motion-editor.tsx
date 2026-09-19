import { useEffect, useState } from "react";

export function MotionEditor({
  label,
  value,
  example,
  commit,
}: {
  label: string;
  value: unknown;
  example: unknown;
  commit: (value: unknown) => void;
}) {
  const serialized = JSON.stringify(value, null, 2);
  const [draft, setDraft] = useState(serialized);
  const [error, setError] = useState("");
  useEffect(() => {
    setDraft(serialized);
    setError("");
  }, [serialized]);
  return (
    <details className="motion-editor">
      <summary>{label}</summary>
      <p className="muted small">
        Temps en secondes de scène. Modifier le JSON puis appliquer.
      </p>
      <label className="field">
        <span>{label} (JSON)</span>
        <textarea
          aria-label={`${label} (JSON)`}
          rows={8}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          spellCheck={false}
        />
      </label>
      <div className="button-row">
        <button onClick={() => setDraft(JSON.stringify(example, null, 2))}>
          Exemple
        </button>
        <button
          onClick={() => {
            try {
              commit(JSON.parse(draft));
              setError("");
            } catch (e) {
              setError(e instanceof Error ? e.message : String(e));
            }
          }}
        >
          Appliquer {label.toLowerCase()}
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
    </details>
  );
}
