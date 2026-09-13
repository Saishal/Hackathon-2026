// Provenance label: keeps the demo honest.
// Every record from Member 1's data layer carries provenance:
//   skills/roles   -> metadataSource
//   matrix edges   -> evidenceSource (+ lastVerifiedAt)
//   catalogue      -> provenance
// Seeded values say 'fictional demo …'; when we see that, we say so on screen.
// Rule: never render unknown/absent values as 0 or "never". Render a dash at the call site and
// let this label carry the source.

const FICTIONAL = /fictional/i;

export default function Provenance({ source, lastVerifiedAt }) {
  const fictional = source && FICTIONAL.test(source);
  return (
    <span className={fictional ? 'source source-fictional' : 'source'} title={`Source: ${source ?? 'unspecified'}`}>
      {fictional ? 'Fictional demo' : (source ?? '—')}
      {lastVerifiedAt !== undefined && <span className="muted"> · verified {lastVerifiedAt ?? '—'}</span>}
    </span>
  );
}
