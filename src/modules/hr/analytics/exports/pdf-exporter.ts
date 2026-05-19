// ─── Enterprise PDF Export Engine ───
import * as pdfMake from 'pdfmake';
import type { TDocumentDefinitions, Content, TableCell, Style, ContentCanvas } from 'pdfmake/interfaces';
import type { ReportConfig, SheetColumn } from './excel-exporter';

// ─── Color Constants (match Excel exporter's indigo theme) ───
const INDIGO = '#4F46E5';
const INDIGO_LIGHT = '#EEF2FF';
const GRAY_100 = '#F3F4F6';
const GRAY_200 = '#E5E7EB';
const GRAY_500 = '#6B7280';
const GRAY_700 = '#374151';
const WHITE = '#FFFFFF';

// ─── Formatting Helpers ───

function formatCurrency(value: unknown): string {
  const num = typeof value === 'number' ? value : Number(value);
  if (isNaN(num)) return String(value ?? '');
  return `\u20B9${num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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

function isNumericFormat(format?: SheetColumn['format']): boolean {
  return format === 'currency' || format === 'number' || format === 'percentage';
}

function getGeneratedTimestamp(): string {
  return new Date().toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

// ─── Table Layout ───

const avyTableLayout: Record<string, pdfMake.CustomTableLayout> = {
  avyLayout: {
    hLineWidth(i: number, node: any): number {
      // Top border of header, bottom border of header, bottom border of last row
      if (i === 0 || i === 1 || i === node.table.body.length) return 0.5;
      return 0;
    },
    vLineWidth(): number {
      return 0;
    },
    hLineColor(i: number): string {
      if (i === 1) return INDIGO;
      return GRAY_200;
    },
    fillColor(rowIndex: number, node: any): string | null {
      if (rowIndex === 0) return INDIGO;
      // Check if this is the totals row (last row when totals exist)
      // We mark totals rows via a custom property on the node
      const bodyLength = node.table.body.length;
      if (node.table._hasTotals && rowIndex === bodyLength - 1) return GRAY_100;
      // Alternating rows (data rows start at index 1)
      return rowIndex % 2 === 0 ? '#F9FAFB' : null;
    },
    paddingLeft(): number { return 6; },
    paddingRight(): number { return 6; },
    paddingTop(): number { return 4; },
    paddingBottom(): number { return 4; },
  },
};

// ─── Build PDF Content for a Single Sheet ───

function buildSheetContent(
  sheet: ReportConfig['sheets'][number],
  isFirstSheet: boolean,
): Content[] {
  const content: Content[] = [];

  // Page break before each sheet section (except the first)
  if (!isFirstSheet) {
    content.push({ text: '', pageBreak: 'before' });
  }

  // Section heading
  content.push({
    text: sheet.name,
    style: 'sectionHeading',
    margin: [0, isFirstSheet ? 0 : 4, 0, 8],
  });

  // Build table header row
  const headerRow: TableCell[] = sheet.columns.map((col) => ({
    text: col.header,
    style: 'tableHeader',
    alignment: isNumericFormat(col.format) ? 'right' as const : 'left' as const,
  }));

  // Build data rows
  const dataRows: TableCell[][] = sheet.rows.map((row) =>
    sheet.columns.map((col) => ({
      text: formatCellValue(row[col.key], col.format),
      alignment: isNumericFormat(col.format) ? 'right' as const : 'left' as const,
      fontSize: 8,
      color: GRAY_700,
    })),
  );

  // Build totals row if present
  let hasTotals = false;
  if (sheet.totalsRow) {
    hasTotals = true;
    const totalsRowCells: TableCell[] = sheet.columns.map((col) => ({
      text: formatCellValue(sheet.totalsRow![col.key], col.format),
      alignment: isNumericFormat(col.format) ? 'right' as const : 'left' as const,
      bold: true,
      fontSize: 8,
      color: GRAY_700,
    }));
    dataRows.push(totalsRowCells);
  }

  // Compute column widths — distribute proportionally across available landscape width
  // A4 landscape usable width ~ 842 - 2*24 = 794pt
  const totalDefinedWidth = sheet.columns.reduce((sum, col) => sum + (col.width ?? 15), 0);
  const widths = sheet.columns.map((col) => {
    const proportion = (col.width ?? 15) / totalDefinedWidth;
    return `${(proportion * 100).toFixed(1)}%`;
  });

  const tableBody = [headerRow, ...dataRows];

  // Build the table
  const tableContent: Content = {
    table: {
      headerRows: 1,
      widths,
      body: tableBody,
      _hasTotals: hasTotals,
    } as any,
    layout: 'avyLayout',
  };

  content.push(tableContent);

  // Record count below table
  content.push({
    text: `${sheet.rows.length} record${sheet.rows.length !== 1 ? 's' : ''}`,
    fontSize: 7,
    color: GRAY_500,
    italics: true,
    margin: [0, 4, 0, 0],
  });

  // Legend text if present
  if (sheet.legendText) {
    content.push({
      text: sheet.legendText,
      fontSize: 7,
      color: GRAY_500,
      italics: true,
      margin: [0, 2, 0, 0],
    });
  }

  return content;
}

// ─── Main Export Function ───

export async function generatePdfReport(config: ReportConfig): Promise<Buffer> {
  // Set up table layouts
  pdfMake.setTableLayouts(avyTableLayout);

  // Build all sheet content sections
  const sheetContent: Content[] = [];
  config.sheets.forEach((sheet, index) => {
    sheetContent.push(...buildSheetContent(sheet, index === 0));
  });

  const docDefinition: TDocumentDefinitions = {
    pageSize: 'A4',
    pageOrientation: 'landscape',
    pageMargins: [24, 72, 24, 40],

    // ─── Header (every page) ───
    header: (currentPage: number, pageCount: number): Content => {
      return {
        margin: [24, 16, 24, 0],
        stack: [
          {
            text: config.companyName,
            fontSize: 14,
            bold: true,
            color: GRAY_700,
          },
          {
            text: config.reportTitle,
            fontSize: 10,
            bold: true,
            color: INDIGO,
            margin: [0, 2, 0, 0],
          },
          {
            text: `Period: ${config.period}`,
            fontSize: 8,
            color: GRAY_500,
            margin: [0, 2, 0, 4],
          },
          // Thin indigo separator line
          {
            canvas: [
              {
                type: 'line',
                x1: 0,
                y1: 0,
                x2: 794, // A4 landscape width minus margins
                y2: 0,
                lineWidth: 1,
                lineColor: INDIGO,
              },
            ],
          } as ContentCanvas,
        ],
      };
    },

    // ─── Footer (every page) ───
    footer: (currentPage: number, pageCount: number): Content => {
      return {
        margin: [24, 8, 24, 0],
        columns: [
          {
            text: `Page ${currentPage} of ${pageCount}`,
            fontSize: 7,
            color: GRAY_500,
            alignment: 'left',
          },
          {
            text: `Generated by Avy ERP \u00B7 ${getGeneratedTimestamp()}`,
            fontSize: 7,
            color: GRAY_500,
            alignment: 'right',
          },
        ],
      };
    },

    // ─── Content ───
    content: sheetContent,

    // ─── Styles ───
    styles: {
      sectionHeading: {
        fontSize: 13,
        bold: true,
        color: INDIGO,
      } as Style,
      tableHeader: {
        fontSize: 8,
        bold: true,
        color: WHITE,
      } as Style,
    },

    // ─── Default Style (Helvetica built-in) ───
    defaultStyle: {
      font: 'Helvetica',
      fontSize: 9,
    },

    // ─── Metadata ───
    info: {
      title: `${config.reportTitle} — ${config.period}`,
      author: 'Avy ERP',
      subject: config.reportTitle,
      creator: 'Avy ERP',
    },
  };

  const pdf = pdfMake.createPdf(docDefinition);
  const buffer = await pdf.getBuffer();
  return Buffer.from(buffer);
}

// ─── Legacy API (backward compatible with old exportToPDF calls) ───

export async function exportToPDF(
  title: string,
  columns: { header: string; key: string; width?: number; format?: SheetColumn['format'] }[],
  rows: Record<string, unknown>[],
): Promise<Buffer> {
  // Parse title to extract company name, report title, and period
  // Expected format: "CompanyName — Report Title — Period"
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
