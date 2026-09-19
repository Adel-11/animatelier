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
        <h2>Une question. Un temps pour réfléchir.</h2>
        <p>
          Choisissez un exemple, modifiez les questions et le délai. Les
          réponses apparaissent après trois secondes par défaut.
        </p>
        <div className="button-row">
          <button
            onClick={() => {
              setSource(JSON.stringify(quizExamples.list, null, 2));
              setMessage("");
            }}
          >
            Liste de 1 à 10
          </button>
          <button
            onClick={() => {
              setSource(JSON.stringify(quizExamples.choices, null, 2));
              setMessage("");
            }}
          >
            QCM
          </button>
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
          l’éditeur. Tous les textes, formes et animations restent modifiables
          dans Éléments.
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
