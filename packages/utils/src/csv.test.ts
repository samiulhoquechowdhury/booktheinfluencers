import { describe, expect, it } from "vitest";
import { parseCsv, parseCsvRecords, toCsv } from "./csv";

describe("csv", () => {
  it("reads quoted fields, escaped quotes, commas and line breaks inside quotes", () => {
    const text = '﻿name,bio\r\n"Noor, Band","Sings ""Sufi""\nand pop"\r\nSolo,plain\r\n\r\n';
    expect(parseCsv(text)).toEqual([
      ["name", "bio"],
      ["Noor, Band", 'Sings "Sufi"\nand pop'],
      ["Solo", "plain"],
    ]);
  });

  it("keys rows by header and numbers lines like a spreadsheet", () => {
    const { headers, records } = parseCsvRecords(" Stage_Name ,City\nAsha,Pune\nRavi\n");
    expect(headers).toEqual(["stage_name", "city"]);
    expect(records).toEqual([
      { line: 2, values: { stage_name: "Asha", city: "Pune" } },
      { line: 3, values: { stage_name: "Ravi", city: "" } },
    ]);
  });

  it("round-trips through toCsv", () => {
    const rows = [["a", 'he said "hi"'], ["b,c", "line\nbreak"]];
    expect(parseCsv(toCsv(rows))).toEqual(rows);
  });
});
