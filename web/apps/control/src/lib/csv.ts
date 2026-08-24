export type CsvCell = boolean | number | string | null | undefined;

export interface CsvColumn<Row> {
  header: string;
  value: (row: Row) => CsvCell;
}

function escapeCsvCell(value: CsvCell): string {
  const normalized = value == null ? "" : String(value);
  return `"${normalized.replaceAll('"', '""')}"`;
}

export function createCsv<Row>(
  rows: readonly Row[],
  columns: readonly CsvColumn<Row>[],
): string {
  const header = columns.map((column) => escapeCsvCell(column.header)).join(",");
  const body = rows.map((row) =>
    columns.map((column) => escapeCsvCell(column.value(row))).join(","),
  );

  return `\uFEFF${[header, ...body].join("\r\n")}\r\n`;
}

export function createDownloadFilename(
  parts: readonly string[],
  extension: string,
): string {
  const stem = parts
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean)
    .join("-")
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "");
  const normalizedExtension = extension.replace(/^\.+/, "");

  return `${stem || "export"}.${normalizedExtension}`;
}

export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  downloadBlob(filename, blob);
}

export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = filename;
  anchor.hidden = true;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
