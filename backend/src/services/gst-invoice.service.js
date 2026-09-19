// backend/src/services/gst-invoice.service.js — P15-2
// Generates a GST-compliant invoice PDF using pdfkit (pure Node.js).
// Returns a Buffer — caller streams it as application/pdf.

import PDFDocument from 'pdfkit';

const COMPANY = {
  name:    'TezzNirmaan Technologies Pvt. Ltd.',
  address: 'Bihar, India',
  gstin:   process.env.COMPANY_GSTIN || 'YOUR_GSTIN_HERE',
  email:   'billing@tezznirmaan.in',
  phone:   '+91 9876543210',
};

/**
 * generateGSTInvoice(invoice, contractor, orderItems)
 * invoice   = { invoice_number, created_at, due_date, ... }
 * contractor = { company_name, gst_number, address }
 * orderItems = [{ name, hsn_code, qty, unit_price_paise, gst_pct }]
 * Returns: Promise<Buffer>
 */
export function generateGSTInvoice(invoice, contractor, orderItems = []) {
  return new Promise((resolve, reject) => {
    const doc    = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks = [];
    doc.on('data', c => chunks.push(c));
    doc.on('end',  () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const W = doc.page.width - 100; // usable width

    // ─── Header ───────────────────────────────────────────────
    doc.fontSize(20).font('Helvetica-Bold').fillColor('#f97316').text('TAX INVOICE', 50, 50);
    doc.fontSize(9).font('Helvetica').fillColor('#374151')
      .text(COMPANY.name, 50, 80)
      .text(COMPANY.address, 50, 92)
      .text(`GSTIN: ${COMPANY.gstin}`, 50, 104)
      .text(`Email: ${COMPANY.email}  |  ${COMPANY.phone}`, 50, 116);

    // Invoice meta (right side)
    const invDate = new Date(invoice.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    const dueDate = invoice.due_date ? new Date(invoice.due_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Due on delivery';
    doc.font('Helvetica-Bold').text(`Invoice No: ${invoice.invoice_number || invoice.id?.slice(0,8).toUpperCase()}`, 350, 80)
      .text(`Date: ${invDate}`, 350, 92)
      .text(`Due: ${dueDate}`, 350, 104);

    // Divider
    doc.moveTo(50, 135).lineTo(50 + W, 135).strokeColor('#e5e7eb').lineWidth(1).stroke();

    // ─── Bill To ──────────────────────────────────────────────
    doc.fontSize(9).font('Helvetica-Bold').fillColor('#374151').text('BILL TO:', 50, 148);
    doc.font('Helvetica').fontSize(9)
      .text(contractor.company_name || 'Contractor', 50, 160)
      .text(contractor.address || '', 50, 172)
      .text(`GSTIN: ${contractor.gst_number || 'N/A'}`, 50, 184);

    // ─── Items Table ──────────────────────────────────────────
    let y = 220;
    const cols = { item: 50, hsn: 250, qty: 310, rate: 360, gst: 420, total: 480 };
    const headers = ['Item Description', 'HSN', 'Qty', 'Rate (₹)', 'GST%', 'Total (₹)'];

    // Header row
    doc.rect(50, y, W, 18).fill('#f9fafb').stroke('#e5e7eb');
    doc.fillColor('#374151').font('Helvetica-Bold').fontSize(8);
    Object.entries(cols).forEach(([key, x], i) => doc.text(headers[i], x, y + 5, { width: 60 }));
    y += 22;

    // Item rows
    let subtotal = 0, totalGST = 0;
    doc.font('Helvetica').fontSize(8).fillColor('#1f2937');
    for (const item of orderItems) {
      const rate  = (item.unit_price_paise || 0) / 100;
      const total = rate * (item.qty || 1);
      const gstAmt = total * ((item.gst_pct || 18) / 100);
      subtotal += total;
      totalGST += gstAmt;

      doc.text(item.name || 'Product', cols.item, y, { width: 190 })
        .text(item.hsn_code || '3214', cols.hsn, y)
        .text(String(item.qty || 1), cols.qty, y)
        .text(rate.toFixed(2), cols.rate, y)
        .text(`${item.gst_pct || 18}%`, cols.gst, y)
        .text((total + gstAmt).toFixed(2), cols.total, y);

      doc.moveTo(50, y + 14).lineTo(50 + W, y + 14).strokeColor('#f3f4f6').lineWidth(0.5).stroke();
      y += 18;
      if (y > 700) { doc.addPage(); y = 50; }
    }

    // ─── Totals ───────────────────────────────────────────────
    y += 10;
    const grandTotal = subtotal + totalGST;
    const cgst = totalGST / 2, sgst = totalGST / 2;

    doc.moveTo(350, y).lineTo(50 + W, y).strokeColor('#e5e7eb').lineWidth(1).stroke();
    const totLine = (label, val, bold = false) => {
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9)
        .fillColor('#374151').text(label, 350, y + 6)
        .text(`₹${val.toFixed(2)}`, 480, y + 6);
      y += 16;
    };
    totLine('Subtotal', subtotal);
    totLine(`CGST (${(totalGST / subtotal * 50).toFixed(0)}%)`, cgst);
    totLine(`SGST (${(totalGST / subtotal * 50).toFixed(0)}%)`, sgst);
    totLine('Grand Total', grandTotal, true);

    // ─── Footer ───────────────────────────────────────────────
    doc.fontSize(8).font('Helvetica').fillColor('#9ca3af')
      .text('This is a computer-generated invoice and does not require a signature.', 50, 750, { align: 'center', width: W })
      .text('For queries: billing@tezznirmaan.in', 50, 762, { align: 'center', width: W });

    doc.end();
  });
}
