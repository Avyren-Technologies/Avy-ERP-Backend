import PDFDocument from 'pdfkit';
import { PassThrough } from 'stream';

// ────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────

interface LineItem {
  description: string;
  locationName?: string;
  quantity: number;
  unitPrice: number;
  amount: number;
}

interface InvoiceForPdf {
  invoiceNumber: string;
  status: string;
  invoiceType: string;
  createdAt: Date;
  dueDate: Date;
  billingPeriodStart: Date | null;
  billingPeriodEnd: Date | null;
  lineItems: any;
  subtotal: number;
  cgst: number;
  sgst: number;
  igst: number;
  totalTax: number;
  totalAmount: number;
  gstNotApplicable: boolean;
  subscription?: {
    tenant?: {
      company?: {
        name: string;
        displayName?: string | null;
        companyCode?: string | null;
      } | null;
      gstin?: string | null;
      address?: string | null;
    } | null;
  } | null;
}

// ────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────

const formatCurrency = (amount: number): string =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(amount);

const formatDate = (date: Date | string | null): string => {
  if (!date) return '—';
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

// ────────────────────────────────────────────────────────────────────
// PDF Service
// ────────────────────────────────────────────────────────────────────

class PdfService {
  async generateInvoicePdf(invoice: InvoiceForPdf): Promise<Buffer> {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const stream = new PassThrough();
    doc.pipe(stream);

    const lineItems: LineItem[] =
      typeof invoice.lineItems === 'string'
        ? JSON.parse(invoice.lineItems)
        : invoice.lineItems ?? [];

    const company = invoice.subscription?.tenant?.company;
    const tenant = invoice.subscription?.tenant;
    const companyName = company?.displayName ?? company?.name ?? 'Unknown Company';

    // ── Header ──────────────────────────────────────────────────────
    doc.font('Helvetica-Bold').fontSize(28).text('INVOICE', 50, 50);
    doc
      .font('Helvetica-Bold')
      .fontSize(12)
      .text('Avyren Technologies', 50, 50, { align: 'right' });
    doc
      .font('Helvetica')
      .fontSize(9)
      .fillColor('#666666')
      .text('www.avyren.com', 50, 66, { align: 'right' });
    doc.fillColor('#000000');

    // Divider
    doc
      .moveTo(50, 95)
      .lineTo(545, 95)
      .strokeColor('#4A3AFF')
      .lineWidth(2)
      .stroke();

    // ── Invoice Details Box ─────────────────────────────────────────
    let y = 110;
    const leftCol = 50;
    const rightCol = 300;

    doc.font('Helvetica-Bold').fontSize(10).fillColor('#333333');
    doc.text('Invoice Details', leftCol, y);
    y += 18;

    const detailRows: [string, string][] = [
      ['Invoice #', invoice.invoiceNumber],
      ['Invoice Date', formatDate(invoice.createdAt)],
      ['Due Date', formatDate(invoice.dueDate)],
      ['Status', invoice.status],
    ];

    if (invoice.billingPeriodStart && invoice.billingPeriodEnd) {
      detailRows.push([
        'Billing Period',
        `${formatDate(invoice.billingPeriodStart)} — ${formatDate(invoice.billingPeriodEnd)}`,
      ]);
    }

    for (const [label, value] of detailRows) {
      doc.font('Helvetica').fontSize(9).fillColor('#666666').text(label, leftCol, y);
      doc.font('Helvetica').fontSize(9).fillColor('#000000').text(value, leftCol + 100, y);
      y += 16;
    }

    // ── Bill To Box ─────────────────────────────────────────────────
    let billY = 128;
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#333333').text('Bill To', rightCol, billY);
    billY += 18;

    doc.font('Helvetica-Bold').fontSize(9).fillColor('#000000').text(companyName, rightCol, billY);
    billY += 14;

    if ((tenant as any)?.address) {
      doc.font('Helvetica').fontSize(9).fillColor('#666666').text((tenant as any).address, rightCol, billY, { width: 220 });
      billY += doc.heightOfString((tenant as any).address, { width: 220 }) + 4;
    }

    if ((tenant as any)?.gstin) {
      doc.font('Helvetica').fontSize(9).fillColor('#666666').text(`GSTIN: ${(tenant as any).gstin}`, rightCol, billY);
      billY += 14;
    }

    // ── Line Items Table ────────────────────────────────────────────
    y = Math.max(y, billY) + 20;
    doc.fillColor('#000000');

    // Table column positions
    const cols = {
      sno: 50,
      desc: 80,
      loc: 250,
      qty: 350,
      unit: 400,
      amt: 480,
    };
    const tableRight = 545;

    // Table header background
    doc.rect(50, y, tableRight - 50, 22).fill('#4A3AFF');
    doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(8);
    doc.text('S.No', cols.sno + 4, y + 6);
    doc.text('Description', cols.desc, y + 6);
    doc.text('Location', cols.loc, y + 6);
    doc.text('Qty', cols.qty, y + 6, { width: 40, align: 'right' });
    doc.text('Unit Price', cols.unit, y + 6, { width: 65, align: 'right' });
    doc.text('Amount', cols.amt, y + 6, { width: 60, align: 'right' });

    y += 22;
    doc.fillColor('#000000').font('Helvetica').fontSize(8);

    lineItems.forEach((item, idx) => {
      // Check for page break
      if (y > 700) {
        doc.addPage();
        y = 50;
      }

      // Alternating row background
      if (idx % 2 === 0) {
        doc.rect(50, y, tableRight - 50, 20).fill('#F8F7FF');
        doc.fillColor('#000000');
      }

      doc.font('Helvetica').fontSize(8);
      doc.text(String(idx + 1), cols.sno + 4, y + 6);
      doc.text(item.description ?? '', cols.desc, y + 6, { width: 165, lineBreak: false });
      doc.text(item.locationName ?? '—', cols.loc, y + 6, { width: 90, lineBreak: false });
      doc.text(String(item.quantity ?? 1), cols.qty, y + 6, { width: 40, align: 'right' });
      doc.text(formatCurrency(item.unitPrice ?? 0), cols.unit, y + 6, { width: 65, align: 'right' });
      doc.text(formatCurrency(item.amount ?? 0), cols.amt, y + 6, { width: 60, align: 'right' });

      y += 20;
    });

    // Table bottom line
    doc.moveTo(50, y).lineTo(tableRight, y).strokeColor('#CCCCCC').lineWidth(0.5).stroke();

    // ── Totals Section ──────────────────────────────────────────────
    y += 15;
    const totalsX = 380;
    const totalsValX = 480;
    const totalsWidth = 65;

    const addTotalRow = (label: string, value: number, bold = false) => {
      if (y > 750) {
        doc.addPage();
        y = 50;
      }
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(bold ? 10 : 9).fillColor('#000000');
      doc.text(label, totalsX, y, { width: 95, align: 'right' });
      doc.text(formatCurrency(value), totalsValX, y, { width: totalsWidth, align: 'right' });
      y += bold ? 20 : 16;
    };

    addTotalRow('Subtotal:', invoice.subtotal);

    if (!invoice.gstNotApplicable) {
      if (invoice.cgst > 0) addTotalRow('CGST (9%):', invoice.cgst);
      if (invoice.sgst > 0) addTotalRow('SGST (9%):', invoice.sgst);
      if (invoice.igst > 0) addTotalRow('IGST (18%):', invoice.igst);
      addTotalRow('Total Tax:', invoice.totalTax);
    } else {
      doc.font('Helvetica').fontSize(8).fillColor('#999999');
      doc.text('GST not applicable', totalsX, y, { width: totalsWidth + 95, align: 'right' });
      y += 16;
    }

    // Grand total divider
    doc.moveTo(totalsX, y - 4).lineTo(tableRight, y - 4).strokeColor('#333333').lineWidth(1).stroke();
    addTotalRow('Grand Total:', invoice.totalAmount, true);

    // ── Footer ──────────────────────────────────────────────────────
    y += 30;
    if (y > 730) {
      doc.addPage();
      y = 50;
    }

    doc.moveTo(50, y).lineTo(545, y).strokeColor('#EEEEEE').lineWidth(0.5).stroke();
    y += 12;

    doc.font('Helvetica').fontSize(8).fillColor('#666666');
    doc.text('Payment Terms: Net 15 days', 50, y);
    y += 14;
    doc.text('Thank you for your business!', 50, y);
    y += 20;
    doc
      .fontSize(7)
      .fillColor('#999999')
      .text(`\u00A9 ${new Date().getFullYear()} Avyren Technologies. All rights reserved.`, 50, y);

    // ── Finalize ────────────────────────────────────────────────────
    doc.end();

    return new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      stream.on('data', (chunk: Buffer) => chunks.push(chunk));
      stream.on('end', () => resolve(Buffer.concat(chunks)));
      stream.on('error', reject);
    });
  }
}

export const pdfService = new PdfService();
