# Sample payloads

Captured from a freshly seeded database so every teammate builds against the same
shape. `docs/API.md` is the authoritative contract; these are worked examples of it.

- `workforce.json` — `GET /api/keystone/workforce`, the full v1 snapshot.
- `risks.json` — `GET /api/keystone/risks`.
- `future-requirements.json` — `GET /api/keystone/future-requirements`.

All people, skills, proficiencies and resources in these files are fictional demo
data. `metadataSource`, `evidenceSource` and `provenance` say so on each record.

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
curl -s localhost:4000/api/keystone/workforce | python -m json.tool > docs/samples/workforce.json
```

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
