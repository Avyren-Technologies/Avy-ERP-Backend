import PDFDocument from 'pdfkit';
import { PassThrough } from 'stream';

// ────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────

interface MonthlyBreakdown {
  month: number;
  year: number;
  gross: number;
  pf: number;
  esi: number;
  pt: number;
  tds: number;
  lwf: number;
  net: number;
}

interface Form16PartB {
  grossSalary: number;
  exemptions: number;
  standardDeduction: number;
  incomeFromSalary: number;
  otherIncome: number;
  homeLoanInterest: number;
  grossTotalIncome: number;
  chapterVIADeductions: number;
  netTaxableIncome: number;
  totalTDSDeducted: number;
}

interface Form16Totals {
  gross: number;
  pf: number;
  esi: number;
  pt: number;
  tds: number;
  lwf: number;
  net: number;
}

interface Form16Employer {
  name: string | null;
  pan: string;
  tan: string;
  address?: any;
}

export interface Form16Record {
  employeeId: string;
  employeeName: string;
  pan: string;
  aadhaar: string;
  department: string;
  designation: string;
  regime: string;
  financialYear: string;
  assessmentYear: string;
  employer: Form16Employer;
  partB: Form16PartB;
  monthlyBreakdown: MonthlyBreakdown[];
  totals: Form16Totals;
}

// ────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────

const MONTH_NAMES = [
  '', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

const formatCurrency = (amount: number): string =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount);

const formatCurrencyShort = (amount: number): string =>
  new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(amount);

// ────────────────────────────────────────────────────────────────────
// PDF Generation
// ────────────────────────────────────────────────────────────────────

export async function generateForm16PDF(record: Form16Record): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A4', margin: 40 });
  const stream = new PassThrough();
  doc.pipe(stream);

  const LEFT = 40;
  const RIGHT = 555;
  const PAGE_WIDTH = RIGHT - LEFT;

  let y = 40;

  // ── Helper: draw horizontal line ──
  const drawLine = (yPos: number, color = '#333333', width = 0.5) => {
    doc.moveTo(LEFT, yPos).lineTo(RIGHT, yPos).strokeColor(color).lineWidth(width).stroke();
  };

  // ── Helper: page break check ──
  const ensureSpace = (needed: number) => {
    if (y + needed > 780) {
      doc.addPage();
      y = 40;
    }
  };

  // ══════════════════════════════════════════════════════════════════
  // HEADER
  // ══════════════════════════════════════════════════════════════════

  doc.font('Helvetica-Bold').fontSize(14).fillColor('#1a1a1a');
  doc.text('FORM No. 16', LEFT, y, { align: 'center', width: PAGE_WIDTH });
  y += 20;

  doc.font('Helvetica').fontSize(8).fillColor('#555555');
  doc.text(
    '[See rule 31(1)(a) of the Income-tax Rules, 1962]',
    LEFT, y, { align: 'center', width: PAGE_WIDTH },
  );
  y += 12;

  doc.font('Helvetica').fontSize(8).fillColor('#555555');
  doc.text(
    'Certificate under section 203 of the Income-tax Act, 1961 for tax deducted at source from income chargeable under the head "Salaries"',
    LEFT, y, { align: 'center', width: PAGE_WIDTH },
  );
  y += 20;

  drawLine(y, '#4A3AFF', 2);
  y += 12;

  // ══════════════════════════════════════════════════════════════════
  // PART A — Employer & Employee Information
  // ══════════════════════════════════════════════════════════════════

  doc.font('Helvetica-Bold').fontSize(11).fillColor('#1a1a1a');
  doc.text('Part A', LEFT, y);
  y += 18;

  // --- Employer Details ---
  doc.font('Helvetica-Bold').fontSize(9).fillColor('#333333');
  doc.text('Employer Details', LEFT, y);
  y += 14;

  const empInfoRows: [string, string][] = [
    ['Name of the Deductor', record.employer.name ?? '—'],
    ['TAN of the Deductor', record.employer.tan || '—'],
    ['PAN of the Deductor', record.employer.pan || '—'],
  ];

  if (record.employer.address) {
    const addr = record.employer.address;
    const addrStr = typeof addr === 'string' ? addr : [addr.line1, addr.line2, addr.city, addr.state, addr.pincode].filter(Boolean).join(', ');
    if (addrStr) empInfoRows.push(['Address', addrStr]);
  }

  for (const [label, value] of empInfoRows) {
    doc.font('Helvetica').fontSize(8).fillColor('#666666').text(label, LEFT, y, { width: 150 });
    doc.font('Helvetica').fontSize(8).fillColor('#000000').text(value, LEFT + 155, y, { width: 360 });
    y += 14;
  }

  y += 6;

  // --- Employee Details ---
  doc.font('Helvetica-Bold').fontSize(9).fillColor('#333333');
  doc.text('Employee Details', LEFT, y);
  y += 14;

  const employeeInfoRows: [string, string][] = [
    ['Name of the Employee', record.employeeName],
    ['PAN of the Employee', record.pan || '—'],
    ['Employee ID', record.employeeId],
    ['Assessment Year', record.assessmentYear],
    ['Financial Year', record.financialYear],
    ['Tax Regime', record.regime === 'OLD' ? 'Old Tax Regime' : 'New Tax Regime'],
  ];

  if (record.department) employeeInfoRows.push(['Department', record.department]);
  if (record.designation) employeeInfoRows.push(['Designation', record.designation]);

  for (const [label, value] of employeeInfoRows) {
    doc.font('Helvetica').fontSize(8).fillColor('#666666').text(label, LEFT, y, { width: 150 });
    doc.font('Helvetica').fontSize(8).fillColor('#000000').text(value, LEFT + 155, y, { width: 360 });
    y += 14;
  }

  y += 10;
  drawLine(y, '#CCCCCC');
  y += 15;

  // ══════════════════════════════════════════════════════════════════
  // MONTHLY TDS SUMMARY TABLE
  // ══════════════════════════════════════════════════════════════════

  ensureSpace(220);

  doc.font('Helvetica-Bold').fontSize(10).fillColor('#1a1a1a');
  doc.text('Monthly TDS Summary', LEFT, y);
  y += 16;

  // Column layout for the table
  const cols = {
    month: LEFT,
    gross: LEFT + 60,
    pf: LEFT + 135,
    esi: LEFT + 200,
    pt: LEFT + 260,
    tds: LEFT + 320,
    lwf: LEFT + 385,
    net: LEFT + 445,
  };

  const colWidths = {
    month: 55,
    gross: 70,
    pf: 60,
    esi: 55,
    pt: 55,
    tds: 60,
    lwf: 55,
    net: 70,
  };

  // Table header
  doc.rect(LEFT, y, PAGE_WIDTH, 18).fill('#4A3AFF');
  doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(7);
  doc.text('Month', cols.month + 4, y + 5, { width: colWidths.month });
  doc.text('Gross', cols.gross, y + 5, { width: colWidths.gross, align: 'right' });
  doc.text('PF', cols.pf, y + 5, { width: colWidths.pf, align: 'right' });
  doc.text('ESI', cols.esi, y + 5, { width: colWidths.esi, align: 'right' });
  doc.text('PT', cols.pt, y + 5, { width: colWidths.pt, align: 'right' });
  doc.text('TDS', cols.tds, y + 5, { width: colWidths.tds, align: 'right' });
  doc.text('LWF', cols.lwf, y + 5, { width: colWidths.lwf, align: 'right' });
  doc.text('Net', cols.net, y + 5, { width: colWidths.net, align: 'right' });
  y += 18;

  // Table rows
  doc.fillColor('#000000').font('Helvetica').fontSize(7);

  for (let idx = 0; idx < record.monthlyBreakdown.length; idx++) {
    ensureSpace(18);

    const row = record.monthlyBreakdown[idx]!;

    // Alternating row background
    if (idx % 2 === 0) {
      doc.rect(LEFT, y, PAGE_WIDTH, 16).fill('#F8F7FF');
      doc.fillColor('#000000');
    }

    const monthLabel = `${MONTH_NAMES[row.month]} ${row.year}`;

    doc.font('Helvetica').fontSize(7);
    doc.text(monthLabel, cols.month + 4, y + 4, { width: colWidths.month });
    doc.text(formatCurrencyShort(row.gross), cols.gross, y + 4, { width: colWidths.gross, align: 'right' });
    doc.text(formatCurrencyShort(row.pf), cols.pf, y + 4, { width: colWidths.pf, align: 'right' });
    doc.text(formatCurrencyShort(row.esi), cols.esi, y + 4, { width: colWidths.esi, align: 'right' });
    doc.text(formatCurrencyShort(row.pt), cols.pt, y + 4, { width: colWidths.pt, align: 'right' });
    doc.text(formatCurrencyShort(row.tds), cols.tds, y + 4, { width: colWidths.tds, align: 'right' });
    doc.text(formatCurrencyShort(row.lwf), cols.lwf, y + 4, { width: colWidths.lwf, align: 'right' });
    doc.text(formatCurrencyShort(row.net), cols.net, y + 4, { width: colWidths.net, align: 'right' });

    y += 16;
  }

  // Totals row
  ensureSpace(20);
  doc.rect(LEFT, y, PAGE_WIDTH, 18).fill('#E8E6FF');
  doc.fillColor('#000000').font('Helvetica-Bold').fontSize(7);
  doc.text('Total', cols.month + 4, y + 5, { width: colWidths.month });
  doc.text(formatCurrencyShort(record.totals.gross), cols.gross, y + 5, { width: colWidths.gross, align: 'right' });
  doc.text(formatCurrencyShort(record.totals.pf), cols.pf, y + 5, { width: colWidths.pf, align: 'right' });
  doc.text(formatCurrencyShort(record.totals.esi), cols.esi, y + 5, { width: colWidths.esi, align: 'right' });
  doc.text(formatCurrencyShort(record.totals.pt), cols.pt, y + 5, { width: colWidths.pt, align: 'right' });
  doc.text(formatCurrencyShort(record.totals.tds), cols.tds, y + 5, { width: colWidths.tds, align: 'right' });
  doc.text(formatCurrencyShort(record.totals.lwf), cols.lwf, y + 5, { width: colWidths.lwf, align: 'right' });
  doc.text(formatCurrencyShort(record.totals.net), cols.net, y + 5, { width: colWidths.net, align: 'right' });
  y += 18;

  // Table bottom border
  drawLine(y, '#CCCCCC');
  y += 20;

  // ══════════════════════════════════════════════════════════════════
  // PART B — Salary Details & Tax Computation
  // ══════════════════════════════════════════════════════════════════

  ensureSpace(260);

  doc.font('Helvetica-Bold').fontSize(11).fillColor('#1a1a1a');
  doc.text('Part B — Details of Salary Paid and Tax Deducted', LEFT, y);
  y += 20;

  const partB = record.partB;

  // Helper for Part B rows
  const addPartBRow = (label: string, amount: number, indent = 0, bold = false) => {
    ensureSpace(16);
    const labelX = LEFT + indent;
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(8).fillColor(bold ? '#000000' : '#333333');
    doc.text(label, labelX, y, { width: 340 - indent });
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(8).fillColor('#000000');
    doc.text(formatCurrency(amount), 400, y, { width: 155, align: 'right' });
    y += 16;
  };

  // Section: Income from Salary
  doc.font('Helvetica-Bold').fontSize(9).fillColor('#333333');
  doc.text('1. Income from Salary', LEFT, y);
  y += 16;

  addPartBRow('(a) Gross Salary', partB.grossSalary, 15);
  addPartBRow('(b) Less: Exemptions (HRA, LTA)', partB.exemptions, 15);
  addPartBRow('(c) Less: Standard Deduction u/s 16(ia)', partB.standardDeduction, 15);
  y += 4;
  drawLine(y, '#EEEEEE');
  y += 8;
  addPartBRow('Income from Salary [1(a) - 1(b) - 1(c)]', partB.incomeFromSalary, 15, true);

  y += 6;

  // Section: Other Income
  doc.font('Helvetica-Bold').fontSize(9).fillColor('#333333');
  doc.text('2. Add: Other Income declared by employee', LEFT, y);
  y += 16;
  addPartBRow('Income from other sources', partB.otherIncome, 15);

  y += 6;

  // Section: Home Loan
  doc.font('Helvetica-Bold').fontSize(9).fillColor('#333333');
  doc.text('3. Less: Interest on Home Loan (Section 24)', LEFT, y);
  y += 16;
  addPartBRow('Interest on Housing Loan', partB.homeLoanInterest, 15);

  y += 4;
  drawLine(y, '#EEEEEE');
  y += 8;
  addPartBRow('Gross Total Income', partB.grossTotalIncome, 0, true);

  y += 6;

  // Section: Chapter VI-A
  doc.font('Helvetica-Bold').fontSize(9).fillColor('#333333');
  doc.text('4. Less: Deductions under Chapter VI-A', LEFT, y);
  y += 16;
  addPartBRow('Deductions (80C, 80CCD, 80D, 80E, 80G, 80GG, 80TTA)', partB.chapterVIADeductions, 15);

  y += 4;
  drawLine(y, '#333333', 1);
  y += 10;

  // Net Taxable Income
  addPartBRow('5. Total Taxable Income', partB.netTaxableIncome, 0, true);

  y += 4;
  drawLine(y, '#333333', 1);
  y += 10;

  // TDS Summary
  addPartBRow('6. Total TDS Deducted and Deposited', partB.totalTDSDeducted, 0, true);

  y += 20;
  drawLine(y, '#CCCCCC');
  y += 20;

  // ══════════════════════════════════════════════════════════════════
  // FOOTER — Verification
  // ══════════════════════════════════════════════════════════════════

  ensureSpace(100);

  doc.font('Helvetica-Bold').fontSize(9).fillColor('#333333');
  doc.text('Verification', LEFT, y);
  y += 14;

  doc.font('Helvetica').fontSize(8).fillColor('#555555');
  doc.text(
    'I, the employer, do hereby certify that a sum of ' +
    formatCurrency(partB.totalTDSDeducted) +
    ' has been deducted and deposited to the credit of the Central Government. ' +
    'I further certify that the information given above is true, complete and correct ' +
    'and is based on the books of account, documents, TDS statements and other ' +
    'available records.',
    LEFT, y, { width: PAGE_WIDTH, lineGap: 3 },
  );
  y += 55;

  // Signature area
  doc.font('Helvetica').fontSize(8).fillColor('#666666');
  doc.text('Place: ___________________', LEFT, y);
  doc.text('Signature of the person responsible for deduction of tax', 300, y, { width: 260, align: 'right' });
  y += 16;
  doc.text('Date: ___________________', LEFT, y);
  doc.text(`Name: ${record.employer.name ?? ''}`, 300, y, { width: 260, align: 'right' });
  y += 16;
  doc.text(`Designation: Authorised Signatory`, 300, y, { width: 260, align: 'right' });

  y += 30;

  // Footer note
  doc.font('Helvetica').fontSize(7).fillColor('#999999');
  doc.text(
    'This is a computer-generated document. No signature is required.',
    LEFT, y, { align: 'center', width: PAGE_WIDTH },
  );

  // ── Finalize ──────────────────────────────────────────────────────
  doc.end();

  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on('data', (chunk: Buffer) => chunks.push(chunk));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}
