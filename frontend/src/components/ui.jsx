// Small shared components: the dependency score meter, holders-versus-needed pips and a loading skeleton.

const scoreTone = (score) => (score >= 70 ? 'danger' : score >= 40 ? 'warn' : 'neutral');

export function ScoreMeter({ score }) {
  const width = Math.max(0, Math.min(100, score));
  return (
    <span className="score" title={`Dependency score ${score} of 100`}>
      <span className={`meter meter-${scoreTone(score)}`} aria-hidden="true"><span style={{ width: `${width}%` }} /></span>
      <span className="num">{score}</span>
      <span className="sr-only"> of 100</span>
    </span>
  );
}

// Filled pips are qualified people on record, empty pips the rest of what the skill needs.
export function Coverage({ holders, needed }) {
  const slots = Math.max(needed ?? 0, holders);
  return (
    <span className="coverage">
      {slots > 0 && slots <= 8 && (
        <span className="pips" aria-hidden="true">
          {Array.from({ length: slots }, (_, index) => <span key={index} className={index < holders ? 'pip on' : 'pip'} />)}
        </span>
      )}
      <span className={holders === 0 ? 'text-danger' : undefined}>{holders} of {needed ?? '—'}</span>
    </span>
  );
}

export function Skeleton({ lines = 3 }) {
  return (
    <div className="skeleton" role="status" aria-label="Loading">
      {Array.from({ length: lines }, (_, index) => <span key={index} style={{ width: `${92 - (index % 3) * 14}%` }} />)}
    </div>
  );
}
