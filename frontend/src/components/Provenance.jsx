// Provenance badge — keeps the demo honest.
// Every record from Member 1's data layer carries provenance:
//   skills/roles   -> metadataSource
//   matrix edges   -> evidenceSource (+ lastVerifiedAt)
//   catalogue      -> provenance
// Seeded values say 'fictional demo …' — when we see that, we say so on screen.
// Rule: never render unknown/absent values as 0 or "never" — render nothing
// (a dash at the call site) and let this badge carry the source.

const FICTIONAL = /fictional/i;

export default function Provenance({ source, lastVerifiedAt }) {
  const fictional = source && FICTIONAL.test(source);
  return (
    <span className={`provenance ${fictional ? 'fictional' : 'sourced'}`} title={`Source: ${source ?? 'unspecified'}`}>
      {fictional ? '⚠ fictional demo' : (source ?? '—')}
      {lastVerifiedAt !== undefined && (
        <span className="verified-at"> · verified {lastVerifiedAt ?? '—'}</span>
      )}
    </span>
  );
}
