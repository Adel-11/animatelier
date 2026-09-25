import { useState } from "react";
import { compileQuiz, quizExamples } from "../../packages/core/quiz";
import { quizGuide } from "../../packages/core/quiz-guide";

export function QuizGuide() {
  return (
    <details className="quiz-guide">
      <summary>Guide quiz : API, timing et export</summary>
      <pre>{quizGuide}</pre>
    </details>
  );
}

export function QuizPanel({ onClose }: { onClose: () => void }) {
  const presets = [
    ["list", "Liste progressive"],
    ["choices", "QCM classique"],
    ["millionaire", "Jeu télévisé"],
    ["presenter", "Personnage présentateur"],
    ["flashcards", "Cartes mémoire"],
    ["levelsShow", "Défi vertical à niveaux"],
    ["stack", "Liste verticale animée"],
    ["customArtDirection", "Direction artistique"],
  ] as const;
  const [source, setSource] = useState(
    JSON.stringify(quizExamples.list, null, 2),
  );
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);
  const run = (load: boolean) => {
    try {
      const spec: unknown = JSON.parse(source);
      const built = compileQuiz(spec);
      if (load) {
        window.animatelier.loadQuiz(spec);
        onClose();
      } else {
        setError(false);
        setMessage(
          `${built.project.scenes.length} questions · ${built.duration} secondes. Première réponse à ${built.schedule[0].reveal} s.`,
        );
      }
    } catch (e) {
      setError(true);
      setMessage(e instanceof Error ? e.message : String(e));
    }
  };
  return (
    <div className="overlay" onClick={onClose}>
      <div
        className="modal quiz-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Créer un quiz"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="eyebrow">QUESTIONS & RÉVÉLATIONS</span>
        <h2>Un générateur de quiz pilotable par les agents.</h2>
        <p>
          Partez d’un format, puis dictez le thème, la mise en scène, le
          mouvement, les libellés, le présentateur et le minutage dans la spec.
          Le projet généré reste entièrement éditable.
        </p>
        <div className="quiz-presets" aria-label="Formats de quiz">
          {presets.map(([key, label]) => (
            <button
              key={key}
              onClick={() => {
                setSource(JSON.stringify(quizExamples[key], null, 2));
                setMessage("");
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <label className="field">
          <span>Script du quiz (JSON)</span>
          <textarea
            autoFocus
            rows={14}
            value={source}
            onChange={(e) => {
              setSource(e.target.value);
              setMessage("");
            }}
            spellCheck={false}
          />
        </label>
        {message && <pre role={error ? "alert" : "status"}>{message}</pre>}
        <p>
          Créer remplace le projet courant. Vous pourrez annuler depuis
          l’éditeur. Les agents peuvent aussi utiliser <code>compileQuiz</code>,
          <code> loadQuiz</code> ou l’outil MCP <code>quiz_compile</code> avec
          le même schéma validé.
        </p>
        <div className="button-row">
          <button onClick={() => run(false)}>Vérifier le script</button>
          <button className="primary" onClick={() => run(true)}>
            Créer le quiz
          </button>
          <button onClick={onClose}>Fermer</button>
        </div>
        <QuizGuide />
      </div>
    </div>
  );
}
