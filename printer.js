// printer.js
const escpos = require('@node-escpos/core');
const USB = require('@node-escpos/usb-adapter');

escpos.USB = USB;

// Constants
const LINE_WIDTH = 48; // 80mm typical
const SEP = ' ';

// pad helper returns exactly `width` chars (truncate or pad)
function pad(text, width, align = 'L') {
  text = String(text ?? '');
  if (text.length > width) return text.substring(0, width);
  return align === 'R' ? text.padStart(width, ' ') : text.padEnd(width, ' ');
}

// word-wrap helper: attempts not to break words; falls back to hard-slice if a word is too long
function wrapTextWord(text, width) {
  text = String(text ?? '');
  if (!text) return [''];
  const words = text.split(/\s+/);
  const lines = [];
  let current = '';

  for (const w of words) {
    if (!current) {
      if (w.length <= width) current = w;
      else {
        // word longer than width -> split the word
        for (let i = 0; i < w.length; i += width) {
          lines.push(w.substring(i, i + width));
        }
      }
    } else {
      if ((current.length + 1 + w.length) <= width) {
        current += ' ' + w;
      } else {
        lines.push(current);
        if (w.length <= width) {
          current = w;
        } else {
          // split long word
          for (let i = 0; i < w.length; i += width) {
            const part = w.substring(i, i + width);
            if (i === 0) current = part;
            else lines.push(part);
          }
        }
      }
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [''];
}

function printInvoice(invoiceData) {
  try {
    const device = new escpos.USB();
    const printer = new escpos.Printer(device, { encoding: 'CP437' });

    // Columns for 80mm, total widths must sum to LINE_WIDTH - number_of_separators.
    // We have 7 columns => 6 separators, so widths sum must equal LINE_WIDTH - 6 = 42.
    const col = {
      sno: 3,   // 3
      name: 10, // 10 (reduced to force wrapping)
      rate: 7,  // 7 (rate as integer when possible)
      gstp: 4,  // 4
      qty: 4,   // 4 (left aligned)
      disc: 5,  // 5 (left aligned)
      amt: 9    // 9 (enough for large totals like 15300.00)
    };
    // Sanity check
    const widthsSum = col.sno + col.name + col.rate + col.gstp + col.qty + col.disc + col.amt;
    const expected = LINE_WIDTH - 6;
    if (widthsSum !== expected) {
      console.warn(`printer.js: WARNING column widths sum (${widthsSum}) != available (${expected}). Adjust settings.`);
    }

    device.open(function (error) {
      if (error) {
        console.error('Printer connection error:', error);
        return;
      }

      const store = invoiceData.store || {};
      const meta = invoiceData.meta || {};
      const items = Array.isArray(invoiceData.items) ? invoiceData.items : [];
      const totals = invoiceData.totals || {};

      // ----- HEADER -----
      try {
        printer.align('CT').style('B').size(1, 2).text(store.store_name || '');
        printer.size(1, 1).style('NORMAL');
      } catch (e) {
        // some drivers ignore style; continue
        printer.text(store.store_name || '');
      }
      if (store.store_subtitle) printer.text(store.store_subtitle);
      if (store.store_address) printer.text(store.store_address);
      if (store.store_phone) printer.text(`Phone: ${store.store_phone || ''}`);
      if (store.store_gstin) printer.text(`GSTIN: ${store.store_gstin || ''}`);
      printer.text('-'.repeat(LINE_WIDTH));

      // ----- META -----
      printer.align('LT');
      printer.text(`Invoice No: ${meta.invoice_no || ''}`);
      const dateStr = meta.date || meta.datetime || meta.timestamp || '';
      const timeStr = meta.time || '';
      printer.text(`Date: ${dateStr} ${timeStr}`.trim());
      printer.text(`Payment Method: ${meta.payment_method || ''}`);
      if (meta.customer_name) printer.text(`Customer: ${meta.customer_name}`);
      if (meta.customer_phone) printer.text(`Phone: ${meta.customer_phone}`);
      if (meta.customer_gstin) printer.text(`GSTIN: ${meta.customer_gstin}`);
      printer.text('-'.repeat(LINE_WIDTH));

      // ----- TABLE HEADER (best-effort condensed & small) -----
      try {
        printer.style('condensed');
        printer.size(0, 0);
      } catch (e) {
        // ignore if not supported
      }

      // Build header columns (pad each to its width), join with single-space separators
      const headerParts = [
        pad('SNo', col.sno, 'L'),
        pad('Item', col.name, 'L'),
        pad('Rate', col.rate, 'R'),
        pad('GST%', col.gstp, 'R'),
        pad('Qty', col.qty, 'L'),
        pad('Disc', col.disc, 'L'),
        pad('Amt', col.amt, 'R')
      ];
      printer.text(headerParts.join(SEP));
      printer.text('-'.repeat(LINE_WIDTH));

      // ----- ITEMS -----
      items.forEach((rawItem, idx) => {
        const item = {
          name: rawItem.name || '',
          price: Number(rawItem.price ?? 0),
          quantity: Number(rawItem.quantity ?? 0),
          gst_percent: Number(rawItem.gst_percent ?? 0),
          discount: Number(rawItem.discount ?? 0),
          final_amount: Number(rawItem.final_amount ?? 0)
        };

        // Format rate: print integer if whole, otherwise two decimals
        const rateStr = (Math.abs(item.price % 1) === 0) ? String(item.price) : item.price.toFixed(2);

        // GST percent as integer or with decimals if needed
        const gstStr = (Math.abs(item.gst_percent % 1) === 0) ? String(item.gst_percent) : item.gst_percent.toFixed(2);

        // Qty left-aligned
        const qtyStr = String(item.quantity);

        // Discount: hide .00 when integer
        const discStr = (Math.abs(item.discount % 1) === 0) ? String(item.discount) : item.discount.toFixed(2);

        // Amount always with 2 decimals
        const amtStr = item.final_amount.toFixed(2);

        // Wrap name into lines BEFORE printing numbers
        const nameLines = wrapTextWord(item.name, col.name);

        // First line includes numeric columns
        const rowParts = [
          pad(String(idx + 1), col.sno, 'L'),
          pad(nameLines[0] || '', col.name, 'L'),
          pad(rateStr, col.rate, 'R'),
          pad(gstStr, col.gstp, 'R'),
          pad(qtyStr, col.qty, 'L'),
          pad(discStr, col.disc, 'L'),
          pad(amtStr, col.amt, 'R')
        ];
        printer.text(rowParts.join(SEP));

        // Additional name-only lines
        for (let i = 1; i < nameLines.length; i++) {
          const extraParts = [
            pad('', col.sno, 'L'),
            pad(nameLines[i], col.name, 'L'),
            pad('', col.rate, 'R'),
            pad('', col.gstp, 'R'),
            pad('', col.qty, 'L'),
            pad('', col.disc, 'L'),
            pad('', col.amt, 'R')
          ];
          printer.text(extraParts.join(SEP));
        }
      });

      // Reset style/size and print totals
      try {
        printer.style('NORMAL');
        printer.size(1, 1);
      } catch (e) {}

      printer.text('-'.repeat(LINE_WIDTH));

      const toNum = v => Number(v ?? 0);
      printer.style('B').align('CT').text('--- TOTALS ---').align('LT').style('NORMAL');
      printer.text(`Total GST: ${toNum(totals.total_gst).toFixed(2)}`);
      printer.text(`CGST: ${toNum(totals.cgst).toFixed(2)}`);
      printer.text(`SGST: ${toNum(totals.sgst).toFixed(2)}`);
      printer.text(`Total Amount: ${toNum(totals.total_amount).toFixed(2)}`);
      if (toNum(totals.discount) > 0) {
        printer.text(`Discount: -${toNum(totals.discount).toFixed(2)}`);
      }

      printer.style('B').size(2, 1);
      printer.text(`Payable: ${toNum(totals.payable).toFixed(2)}`);

      // Footer
      printer.size(1, 1).style('NORMAL');
      printer.text('-'.repeat(LINE_WIDTH));
      printer.align('CT').style('B').text('Thank you! Visit again.');

      printer.feed(1);
      printer.cut();
      printer.close();
    });
  } catch (err) {
    console.error('Error in printInvoice:', err);
  }
}

module.exports = { printInvoice };
