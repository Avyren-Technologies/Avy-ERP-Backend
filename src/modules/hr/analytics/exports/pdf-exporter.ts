// ─── Enterprise PDF Export Engine (Puppeteer) ───
import puppeteer from 'puppeteer';
import type { ReportConfig, SheetColumn } from './excel-exporter';

// ─── Color Constants (match Excel exporter's indigo theme) ───
const INDIGO = '#4F46E5';
const GRAY_100 = '#F3F4F6';
const GRAY_500 = '#6B7280';
const GRAY_700 = '#374151';
const WHITE = '#FFFFFF';

// ─── Formatting Helpers ───

function formatCurrency(value: unknown): string {
  const num = typeof value === 'number' ? value : Number(value);
  if (isNaN(num)) return String(value ?? '');
  return `₹${num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatPercentage(value: unknown): string {
  const num = typeof value === 'number' ? value : Number(value);
  if (isNaN(num)) return String(value ?? '');
  return `${(num * 100).toFixed(1)}%`;
}

function formatNumber(value: unknown): string {
  const num = typeof value === 'number' ? value : Number(value);
  if (isNaN(num)) return String(value ?? '');
  return num.toLocaleString('en-IN');
}

function formatCellValue(value: unknown, format?: SheetColumn['format']): string {
  if (value === null || value === undefined) return '';
  switch (format) {
    case 'currency':
      return formatCurrency(value);
    case 'percentage':
      return formatPercentage(value);
    case 'number':
      return formatNumber(value);
    case 'date':
      return String(value);
    default:
      return String(value);
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function isNumericFormat(format?: SheetColumn['format']): boolean {
  return format === 'currency' || format === 'number' || format === 'percentage';
}

function getStatusColor(value: unknown): string {
  const str = String(value ?? '').toUpperCase();
  if (['ACTIVE', 'APPROVED', 'COMPLETED', 'PRESENT', 'MERGED'].includes(str)) return '#059669';
  if (['PENDING', 'DRAFT', 'IN_PROGRESS', 'SUBMITTED'].includes(str)) return '#D97706';
  if (['REJECTED', 'ABSENT', 'EXITED', 'SUSPENDED'].includes(str)) return '#DC2626';
  return GRAY_700;
}

// ─── Build HTML ───

function buildHtml(config: ReportConfig): string {
  const timestamp = new Date().toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  });

  let sheetsHtml = '';

  config.sheets.forEach((sheet, sheetIdx) => {
    // Page break between sheets
    if (sheetIdx > 0) {
      sheetsHtml += '<div class="page-break"></div>';
    }

    // Section heading
    sheetsHtml += `<h2 class="section-heading">${escapeHtml(sheet.name)}</h2>`;

    if (sheet.legendText) {
      sheetsHtml += `<p class="legend">${escapeHtml(sheet.legendText)}</p>`;
    }

    if (sheet.rows.length === 0) {
      sheetsHtml += '<p class="empty">No data available for this section.</p>';
    } else {
      // Table
      sheetsHtml += '<table>';

      // Header row
      sheetsHtml += '<thead><tr>';
      for (const col of sheet.columns) {
        const align = isNumericFormat(col.format) ? 'right' : 'left';
        sheetsHtml += `<th style="text-align:${align}">${escapeHtml(col.header)}</th>`;
      }
      sheetsHtml += '</tr></thead>';

      // Data rows
      sheetsHtml += '<tbody>';
      for (let ri = 0; ri < sheet.rows.length; ri++) {
        const row = sheet.rows[ri]!;
        const altClass = ri % 2 === 1 ? ' class="alt"' : '';
        sheetsHtml += `<tr${altClass}>`;
        for (const col of sheet.columns) {
          const align = isNumericFormat(col.format) ? 'right' : 'left';
          const val = formatCellValue(row[col.key], col.format);
          const statusStyle = col.conditionalFormat === 'status'
            ? ` style="text-align:${align};color:${getStatusColor(row[col.key])};font-weight:600;"`
            : ` style="text-align:${align}"`;
          sheetsHtml += `<td${statusStyle}>${escapeHtml(val)}</td>`;
        }
        sheetsHtml += '</tr>';
      }

      // Totals row
      if (sheet.totalsRow) {
        sheetsHtml += '<tr class="totals">';
        for (const col of sheet.columns) {
          const align = isNumericFormat(col.format) ? 'right' : 'left';
          const val = formatCellValue(sheet.totalsRow[col.key], col.format);
          sheetsHtml += `<td style="text-align:${align}">${escapeHtml(val)}</td>`;
        }
        sheetsHtml += '</tr>';
      }

      sheetsHtml += '</tbody></table>';
    }

    // Record count
    sheetsHtml += `<p class="record-count">${sheet.rows.length} record${sheet.rows.length !== 1 ? 's' : ''}</p>`;
  });

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  @page {
    size: A4 landscape;
    margin: 16mm 8mm 12mm 8mm;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 9px;
    color: ${GRAY_700};
    line-height: 1.4;
  }
  .header {
    margin-bottom: 16px;
  }
  .company-name {
    font-size: 16px;
    font-weight: 700;
    color: ${GRAY_700};
  }
  .report-title {
    font-size: 11px;
    font-weight: 700;
    color: ${INDIGO};
    margin-top: 2px;
  }
  .period {
    font-size: 9px;
    color: ${GRAY_500};
    margin-top: 2px;
  }
  .separator {
    height: 1px;
    background: ${INDIGO};
    margin-top: 6px;
  }
  .section-heading {
    font-size: 14px;
    font-weight: 700;
    color: ${INDIGO};
    margin: 16px 0 8px 0;
  }
  .legend {
    font-size: 7px;
    color: ${GRAY_500};
    font-style: italic;
    margin-bottom: 6px;
  }
  .empty {
    font-size: 9px;
    color: ${GRAY_500};
    font-style: italic;
    padding: 16px 0;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 8px;
  }
  th {
    background: ${INDIGO};
    color: ${WHITE};
    font-weight: 700;
    font-size: 8px;
    padding: 6px 8px;
    border-bottom: 1px solid ${INDIGO};
  }
  td {
    padding: 5px 8px;
    border-bottom: 1px solid #F3F4F6;
    font-size: 8px;
    color: ${GRAY_700};
  }
  tr.alt td {
    background: #F9FAFB;
  }
  tr.totals td {
    background: ${GRAY_100};
    font-weight: 700;
    border-top: 1px solid #D1D5DB;
    border-bottom: 2px double ${GRAY_500};
  }
  .record-count {
    font-size: 7px;
    color: ${GRAY_500};
    font-style: italic;
    margin-top: 4px;
  }
  .footer {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    padding: 6px 8mm;
    font-size: 7px;
    color: ${GRAY_500};
    display: flex;
    justify-content: space-between;
  }
  .page-break {
    page-break-before: always;
  }
</style>
</head>
<body>
  <div class="header">
    <div class="company-name">${escapeHtml(config.companyName)}</div>
    <div class="report-title">${escapeHtml(config.reportTitle)}</div>
    <div class="period">Period: ${escapeHtml(config.period)}</div>
    <div class="separator"></div>
  </div>
  ${sheetsHtml}
  <div class="footer">
    <span>Generated by Avy ERP · ${escapeHtml(timestamp)}</span>
  </div>
</body>
</html>`;
}

// ─── Singleton Browser Instance ───
let browserInstance: Awaited<ReturnType<typeof puppeteer.launch>> | null = null;

async function getBrowser() {
  if (!browserInstance || !browserInstance.connected) {
    browserInstance = await puppeteer.launch({
      headless: true,
      ...(process.env.PUPPETEER_EXECUTABLE_PATH
        ? { executablePath: process.env.PUPPETEER_EXECUTABLE_PATH }
        : {}),
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });
  }
  return browserInstance;
}

// ─── Main Export Function ───

export async function generatePdfReport(config: ReportConfig): Promise<Buffer> {
  const html = buildHtml(config);
  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    await page.setContent(html, { waitUntil: 'domcontentloaded' });

    const pdfBuffer = await page.pdf({
      format: 'A4',
      landscape: true,
      printBackground: true,
      margin: { top: '16mm', right: '8mm', bottom: '12mm', left: '8mm' },
      displayHeaderFooter: true,
      headerTemplate: '<span></span>',
      footerTemplate: `
        <div style="width:100%;font-size:7px;color:#6B7280;padding:0 8mm;display:flex;justify-content:space-between;">
          <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
          <span>Generated by Avy ERP</span>
        </div>`,
    });

    return Buffer.from(pdfBuffer);
  } finally {
    await page.close();
  }
}

// ─── Legacy API (backward compatible with old exportToPDF calls) ───

export async function exportToPDF(
  title: string,
  columns: { header: string; key: string; width?: number; format?: SheetColumn['format'] }[],
  rows: Record<string, unknown>[],
): Promise<Buffer> {
  const parts = title.split(' \u2014 ');
  const companyName = parts[0] ?? 'Company';
  const reportTitle = parts.length > 1 ? parts[1]! : title;
  const period = parts.length > 2 ? parts[2]! : '';

  return generatePdfReport({
    companyName,
    reportTitle,
    period,
    sheets: [
      {
        name: reportTitle,
        columns: columns.map((c) => {
          const col: SheetColumn = { header: c.header, key: c.key };
          if (c.width !== undefined) col.width = c.width;
          if (c.format !== undefined) col.format = c.format;
          return col;
        }),
        rows,
      },
    ],
  });
}
