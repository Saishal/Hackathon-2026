# Sample payloads

Captured from a freshly seeded database so every teammate builds against the same
shape. `docs/API.md` is the authoritative contract; these are worked examples of it.

- `workforce.json` — `GET /api/keystone/workforce`, the full v1 snapshot.
- `risks.json` — `GET /api/keystone/risks`.
- `future-requirements.json` — `GET /api/keystone/future-requirements`.

All people, skills, proficiencies, evidence and resources in these files are fictional
demo data seeded from `backend/data/demo/*.csv`. `metadataSource` and `provenance` say so
on each record; `evidenceSource` names a kind of evidence (such as `Manager assessment`)
and is equally invented.

## Prefer the fixture in tests

For unit tests, import the fixture instead of parsing these files or touching SQLite:

```js
const { createWorkforceFixture } = require('../data/fixture');

const workforce = createWorkforceFixture();
```

Each call returns a fresh deep copy, so a test asserting a baseline was not mutated
cannot be undermined by a shared reference. `backend/tests/data.test.js` asserts the
fixture's shape still matches the live snapshot, so if the contract changes and the
fixture is not updated, the suite fails rather than drifting quietly.

## Regenerating

```sh
DB_PATH=/tmp/samples.db npm start --prefix backend
curl -s localhost:4000/api/keystone/workforce \
  | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>process.stdout.write(JSON.stringify(JSON.parse(d),null,2)+'\n'))" \
  > docs/samples/workforce.json
```

Uses node rather than python so it works anywhere the backend already runs.

Use a throwaway `DB_PATH` so local edits do not leak into the committed samples.

## Error shapes

Invalid input returns HTTP 400 with `{"error": "..."}`:

```json
{"error": "Unknown skill id(s): 9999"}
{"error": "Unknown employee id(s): 9999"}
{"error": "evidenceSource is required so a score traces to recorded evidence"}
{"error": "proficiency must be an integer between 1 and 5"}
{"error": "effectiveMonth must be an integer between 0 and 60"}
```

Unexpected failures return 500 with `{"error": "Unexpected server error"}`.
