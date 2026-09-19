// backend/src/services/order-receipt.service.js — P18-5
// Customer-facing order receipt PDF using PDFKit.
// Simpler than the GST invoice — designed for B2C customers.
// Returns a Node.js stream that can be piped directly to the HTTP response.

import PDFDocument from 'pdfkit';
import { supabaseAdmin } from '../config/supabase.js';

/**
 * generateReceipt(orderId, profileId)
 * Returns a PDFDocument stream.
 * Throws if order not found or not owned by profileId.
 */
export async function generateReceipt(orderId, profileId) {
  // 1. Fetch order + sub-orders + items
  const { data: order, error } = await supabaseAdmin
    .from('orders')
    .select(`
      id, order_number, created_at, status, total_amount, delivery_fee_paise,
      payment_method, delivery_address,
      customer:profiles!customer_id(full_name, phone, email),
      sub_orders(
        id, status,
        shop:shops(name, address),
        order_items(
          quantity,
          inventory:shop_inventory(
            price_paise, discounted_price_paise,
            product:products(name, brand, unit)
          )
        )
      )
    `)
    .eq('id', orderId)
    .eq('customer_id', profileId)
    .single();

  if (error || !order) throw new Error('Order not found or access denied');

  const doc = new PDFDocument({ margin: 50, size: 'A4' });

  // ── Header ────────────────────────────────────────────────
  doc.fontSize(22).font('Helvetica-Bold').fillColor('#F97316').text('TezzNirmaan', 50, 50);
  doc.fontSize(9).font('Helvetica').fillColor('#6b7280')
    .text('Quick Commerce for Construction Materials', 50, 76)
    .text('tezznirmaan.com | support@tezznirmaan.com', 50, 88);

  // Receipt title + number (right-aligned)
  doc.fontSize(16).font('Helvetica-Bold').fillColor('#1f2937')
    .text('ORDER RECEIPT', 350, 50, { align: 'right', width: 200 });
  doc.fontSize(10).font('Helvetica').fillColor('#6b7280')
    .text(`Order #${order.order_number}`, 350, 72, { align: 'right', width: 200 })
    .text(new Date(order.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }), 350, 86, { align: 'right', width: 200 });

  // Divider
  doc.moveTo(50, 110).lineTo(545, 110).strokeColor('#e5e7eb').lineWidth(1).stroke();

  // ── Customer + Delivery Address ─────────────────────────
  const customer  = order.customer || {};
  const addrObj   = order.delivery_address || {};
  const addrText  = [addrObj.address_line1, addrObj.city, addrObj.pincode].filter(Boolean).join(', ');

  doc.fontSize(10).font('Helvetica-Bold').fillColor('#374151').text('BILL TO', 50, 125);
  doc.fontSize(10).font('Helvetica').fillColor('#1f2937')
    .text(customer.full_name || 'Customer', 50, 140)
    .text(customer.phone || '', 50, 154)
    .text(addrText || 'Address on file', 50, 168, { width: 220 });

  doc.fontSize(10).font('Helvetica-Bold').fillColor('#374151').text('STATUS', 350, 125, { width: 200, align: 'right' });
  const statusColor = order.status === 'delivered' ? '#16a34a' : '#f97316';
  doc.fontSize(11).font('Helvetica-Bold').fillColor(statusColor)
    .text(order.status.toUpperCase(), 350, 140, { width: 200, align: 'right' });
  doc.fontSize(10).font('Helvetica-Bold').fillColor('#374151').text('PAYMENT', 350, 160, { width: 200, align: 'right' });
  doc.fontSize(10).font('Helvetica').fillColor('#1f2937')
    .text((order.payment_method || 'Razorpay').toUpperCase(), 350, 174, { width: 200, align: 'right' });

  // ── Items Table ──────────────────────────────────────────
  let y = 220;
  doc.moveTo(50, y - 10).lineTo(545, y - 10).strokeColor('#e5e7eb').lineWidth(0.5).stroke();

  // Table header
  doc.fontSize(9).font('Helvetica-Bold').fillColor('#6b7280')
    .text('ITEM', 50, y)
    .text('QTY', 360, y, { width: 60, align: 'right' })
    .text('UNIT PRICE', 420, y, { width: 70, align: 'right' })
    .text('TOTAL', 490, y, { width: 55, align: 'right' });

  y += 16;
  doc.moveTo(50, y).lineTo(545, y).strokeColor('#e5e7eb').lineWidth(0.5).stroke();
  y += 8;

  let subtotal = 0;

  for (const subOrder of (order.sub_orders || [])) {
    const shopName = subOrder.shop?.name || 'Shop';
    doc.fontSize(8).font('Helvetica-Bold').fillColor('#9ca3af').text(`From: ${shopName}`, 50, y);
    y += 14;

    for (const item of (subOrder.order_items || [])) {
      const inv      = item.inventory || {};
      const product  = inv.product || {};
      const name     = [product.brand, product.name].filter(Boolean).join(' ');
      const unit     = product.unit ? `(${product.unit})` : '';
      const price    = inv.discounted_price_paise || inv.price_paise || 0;
      const lineTotal = price * (item.quantity || 1);
      subtotal += lineTotal;

      const priceRs = Math.round(price / 100);
      const totalRs = Math.round(lineTotal / 100);

      doc.fontSize(9).font('Helvetica').fillColor('#1f2937')
        .text(`${name} ${unit}`, 50, y, { width: 300 })
        .text(String(item.quantity || 1), 360, y, { width: 60, align: 'right' })
        .text(`₹${priceRs.toLocaleString('en-IN')}`, 420, y, { width: 70, align: 'right' })
        .text(`₹${totalRs.toLocaleString('en-IN')}`, 490, y, { width: 55, align: 'right' });
      y += 16;

      // Page break guard
      if (y > 700) { doc.addPage(); y = 50; }
    }
    y += 4;
  }

  // ── Totals ───────────────────────────────────────────────
  y += 10;
  doc.moveTo(350, y).lineTo(545, y).strokeColor('#e5e7eb').lineWidth(0.5).stroke();
  y += 12;

  const deliveryFee    = order.delivery_fee_paise || 0;
  const discountAmount = Math.max(0, subtotal + deliveryFee - (order.total_amount || 0));

  const addTotalRow = (label, amount, bold = false, color = '#1f2937') => {
    doc.fontSize(10)
      .font(bold ? 'Helvetica-Bold' : 'Helvetica')
      .fillColor(color)
      .text(label, 350, y, { width: 130 })
      .text(`₹${Math.round(amount / 100).toLocaleString('en-IN')}`, 490, y, { width: 55, align: 'right' });
    y += 16;
  };

  addTotalRow('Subtotal', subtotal);
  addTotalRow('Delivery Fee', deliveryFee);
  if (discountAmount > 0) addTotalRow('Discount', discountAmount, false, '#16a34a');

  doc.moveTo(350, y).lineTo(545, y).strokeColor('#374151').lineWidth(1).stroke();
  y += 8;
  addTotalRow('TOTAL PAID', order.total_amount || 0, true, '#1f2937');

  // ── Footer ───────────────────────────────────────────────
  doc.fontSize(8).font('Helvetica').fillColor('#9ca3af')
    .text('Thank you for choosing TezzNirmaan! For support: support@tezznirmaan.com', 50, 760, { align: 'center', width: 495 })
    .text('This is a computer-generated receipt and does not require a signature.', 50, 772, { align: 'center', width: 495 });

  doc.end();
  return doc;
}
