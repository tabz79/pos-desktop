const escpos = require('@node-escpos/core');
const USB = require('@node-escpos/usb-adapter');

escpos.USB = USB;

function printInvoice(invoiceData) {
  try {
    const device = new escpos.USB();
    const options = { encoding: 'CP437' }; // English-friendly encoding
    const printer = new escpos.Printer(device, options);

    const rightAlignText = (text, width = 48) => text.padStart(width, ' ');

    device.open(function (error) {
      if (error) {
        console.error('Printer connection error:', error);
        return;
      }

      const { store, meta, items, totals } = invoiceData;

      // === HEADER ===
      printer
        .align('CT')
        .style('B')
        .size(1, 2)
        .text(store.store_name || '')
        .size(1, 1)
        .style('NORMAL');

      if (store.store_subtitle) printer.text(store.store_subtitle);
      if (store.store_address) printer.text(store.store_address);
      if (store.store_phone) printer.text(`Phone: ${store.store_phone}`);
      if (store.store_gstin) printer.text(`GSTIN: ${store.store_gstin}`);

      printer.text('------------------------------------------------');

      // === Invoice Meta ===
      printer.align('LT');
      printer.text(`Invoice No: ${meta.invoice_no}`);
      printer.text(`Date: ${meta.date} ${meta.time}`);
      printer.text(`Payment Method: ${meta.payment_method}`);
      if (meta.customer_name) printer.text(`Customer: ${meta.customer_name}`);
      if (meta.customer_phone) printer.text(`Phone: ${meta.customer_phone}`);
      if (meta.customer_gstin) printer.text(`GSTIN: ${meta.customer_gstin}`);
      printer.text('------------------------------------------------');

      // === TAX INVOICE ===
      printer.align('CT').style('B').text('TAX INVOICE').style('NORMAL');
      printer.align('LT');
      printer.text('------------------------------------------------');

      // === Table Header ===
      printer.text(
        'SNo Item           Rate  GST% GSTAmt  Qty Disc   Amt'
      );

      // === Items ===
      items.forEach((item, index) => {
        const gstAmount = (
          (item.price * item.quantity * item.gst_percent) / 100
        ).toFixed(2);

        const line =
          (index + 1).toString().padEnd(3) + // SNo
          item.name.substring(0, 14).padEnd(14) + // Item
          item.price.toFixed(2).padStart(6) + // Rate
          item.gst_percent.toString().padStart(5) + // GST%
          gstAmount.padStart(7) + // GST Amt
          item.quantity.toString().padStart(4) + // Qty
          item.discount.toFixed(2).padStart(5) + // Disc
          item.final_amount.toFixed(2).padStart(7); // Amt

        printer.text(line);
      });

      printer.text('------------------------------------------------');

      // === Totals ===
      printer.style('B').align('CT').text('--- TOTALS ---').align('LT').style('NORMAL');
      printer.text(rightAlignText(`Total GST: ${totals.total_gst.toFixed(2)}`));
      printer.text(rightAlignText(`CGST: ${totals.cgst.toFixed(2)}`));
      printer.text(rightAlignText(`SGST: ${totals.sgst.toFixed(2)}`));
      printer.text(rightAlignText(`Total Amount: ${totals.total_amount.toFixed(2)}`));
      if (totals.discount > 0) {
        printer.text(rightAlignText(`Discount: -${totals.discount.toFixed(2)}`));
      }

      printer.style('B').size(2, 1);
      printer.text(rightAlignText(`Payable: ${totals.payable.toFixed(2)}`));

      // Footer
      printer.size(1, 1).style('NORMAL');
      printer.text('------------------------------------------------');
      printer.align('CT').style('B').text('Thank you! Visit again.');

      // Minimal feed & cut
      printer.feed(1);
      printer.cut();
      printer.close();
    });
  } catch (err) {
    console.error('Error in printInvoice:', err);
  }
}

module.exports = { printInvoice };
