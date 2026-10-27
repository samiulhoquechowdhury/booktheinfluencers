// RFC 4180 CSV: commas, double-quoted fields with "" escapes, and line breaks inside quotes.
// Excel and Google Sheets both write this. A leading byte-order mark is ignored.

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const input = text.replace(/^﻿/, "");

  for (let i = 0; i < input.length; i++) {
    const ch = input[i]!;
    if (quoted) {
      if (ch === '"' && input[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"' && field === "") quoted = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && input[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  // Blank lines (e.g. the trailing newline) aren't rows.
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

/** Rows as objects keyed by the header row (headers trimmed and lower-cased). */
export function parseCsvRecords(text: string): { headers: string[]; records: { line: number; values: Record<string, string> }[] } {
  const [head, ...rest] = parseCsv(text);
  const headers = (head ?? []).map((h) => h.trim().toLowerCase());
  return {
    headers,
    // Line numbers as a spreadsheet shows them: the header is line 1.
    records: rest.map((cells, i) => ({ line: i + 2, values: Object.fromEntries(headers.map((h, j) => [h, (cells[j] ?? "").trim()])) })),
  };
}

const escape = (value: string) => (/[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value);

/** The reverse: for downloadable templates and exports. */
export const toCsv = (rows: string[][]) => rows.map((r) => r.map(escape).join(",")).join("\r\n") + "\r\n";
