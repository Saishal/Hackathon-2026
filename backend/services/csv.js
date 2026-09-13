// RFC 4180 CSV output. Text cells beginning with = + - @ or a control character are prefixed with an
// apostrophe so spreadsheet applications show them as text instead of running them as formulas.
function cell(value) {
  if (value === null || value === undefined) return '';
  let text = String(value);
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

// columns: [{ label, value }] where value is a property name or a function of the row.
function toCsv(columns, rows) {
  const header = columns.map((column) => cell(column.label)).join(',');
  const body = rows.map((row) => columns
    .map((column) => cell(typeof column.value === 'function' ? column.value(row) : row[column.value]))
    .join(','));
  return `${[header, ...body].join('\r\n')}\r\n`;
}

module.exports = { toCsv };
