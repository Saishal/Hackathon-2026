const fs = require('node:fs');
const path = require('node:path');

// RFC 4180 subset: quoted fields may hold commas, doubled quotes and line breaks.
// Spreadsheet exports often begin with a UTF-8 byte-order mark and use CRLF, so both
// are accepted. Each row keeps the line it started on so errors can point at it.
function parseCsv(text) {
  const source = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  let line = 1;
  let rowLine = 1;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];

    if (quoted) {
      if (char === '"' && source[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        if (char === '\n') line += 1;
        field += char;
      }
    } else if (char === '"' && field === '') {
      quoted = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && source[index + 1] === '\n') index += 1;
      row.push(field);
      rows.push({ line: rowLine, values: row });
      row = [];
      field = '';
      line += 1;
      rowLine = line;
    } else {
      field += char;
    }
  }

  if (quoted) {
    throw new Error(`Unterminated quoted field starting on line ${rowLine}`);
  }

  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push({ line: rowLine, values: row });
  }

  return rows.filter((entry) => entry.values.some((value) => value.trim() !== ''));
}

// Returns one object per data row keyed by header name, with values trimmed and `at`
// set to "file.csv:line". Extra columns are allowed; missing required ones are not.
function readCsvTable(file, columns) {
  const name = path.basename(file);
  const [header, ...records] = parseCsv(fs.readFileSync(file, 'utf8'));

  if (!header) {
    throw new Error(`${name} is empty; expected columns: ${columns.join(', ')}`);
  }

  const names = header.values.map((value) => value.trim());
  const missing = columns.filter((column) => !names.includes(column));

  if (missing.length > 0) {
    throw new Error(`${name} is missing column(s): ${missing.join(', ')}`);
  }

  return records.map(({ line, values }) => {
    const at = `${name}:${line}`;

    if (values.length > names.length) {
      throw new Error(`${at}: ${values.length} fields but the header has ${names.length}`);
    }

    return {
      at,
      ...Object.fromEntries(names.map((column, index) => [column, (values[index] ?? '').trim()])),
    };
  });
}

module.exports = { parseCsv, readCsvTable };
