// ─── PDF Exporter — CSV Fallback (placeholder for future PDF implementation) ───

export async function exportToPDF(
  title: string,
  columns: { header: string; key: string }[],
  rows: Record<string, unknown>[],
): Promise<Buffer> {
  const headers = columns.map((c) => c.header).join(',');
  const body = rows
    .map((row) =>
      columns
        .map((c) => {
          const val = String(row[c.key] ?? '');
          // Escape CSV values that contain commas, quotes, or newlines
          if (val.includes(',') || val.includes('"') || val.includes('\n')) {
            return `"${val.replace(/"/g, '""')}"`;
          }
          return val;
        })
        .join(','),
    )
    .join('\n');
  return Buffer.from(`${title}\n\n${headers}\n${body}`, 'utf-8');
}
