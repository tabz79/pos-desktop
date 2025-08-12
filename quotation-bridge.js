document.addEventListener('DOMContentLoaded', () => {
  const quotationBtn = document.getElementById('quotationBtn');

  if (quotationBtn) {
    quotationBtn.addEventListener('click', async () => {
      const cart = window.getCart();
      if (cart.length === 0) {
        // You might want to show a message to the user
        return;
      }

      // 1. Show the preview modal
      window.populateInvoiceModal([...cart], null, true);
      document.getElementById('invoice-modal').classList.remove('hidden');

      // 2. Trigger silent printing
      await window.completeSaleAndPrint(true);
    });
  }
});