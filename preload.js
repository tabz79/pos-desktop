// Preload with sandbox-safe, multi-hop bwip loader (no Node APIs)
const { contextBridge, ipcRenderer } = require('electron');

(function () {
  if (typeof window !== 'undefined' && window.bwipjs) return;

  function inject(url, onload, onerror) {
    try {
      var s = document.createElement('script');
      s.src = url;
      s.defer = false;
      s.async = false;
      s.onload = function () {
        try { onload && onload(); } catch (e) {}
      };
      s.onerror = function () {
        try { onerror && onerror(); } catch (_) {}
      };
      (document.head || document.documentElement).appendChild(s);
    } catch (e) { try { onerror && onerror(e); } catch (_) {} }
  }

  function tryLoad(urls, done) {
    if (!urls || !urls.length) return done && done(false);
    var url = urls.shift();
    inject(url, function () { done && done(!!window.bwipjs); },
                 function () { tryLoad(urls, done); });
  }

  // Build a robust fallback list relative to the current page URL
  var base = (function () {
    try { return new URL('.', location.href).href; } catch (_) { return null; }
  })();

  var rels = [
    // Common dev/packaged relative paths
    'assets/vendor/bwip-js-min.js',
    '../assets/vendor/bwip-js-min.js',
    '../../assets/vendor/bwip-js-min.js',
    '../../../assets/vendor/bwip-js-min.js',

    // When index.html is inside app.asar and assets are outside in resources/
    '../assets/vendor/bwip-js-min.js',              // app.asar/ -> ../assets
    '../../resources/assets/vendor/bwip-js-min.js',
    '../../../resources/assets/vendor/bwip-js-min.js',
  ];

  var urls = [];
  for (var i = 0; i < rels.length; i++) {
    try { urls.push(new URL(rels[i], base || location.href).href); } catch (_) {}
  }

  if (typeof document !== 'undefined') {
    var run = function () { tryLoad(urls.slice(), function () {}); };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', run, { once: true });
    } else {
      run();
    }
  }

  // Optional manual trigger
  try {
    const ensure = function (cb) {
      if (window.bwipjs) return cb ? cb(true) : true;
      tryLoad(urls.slice(), function (ok) { if (cb) cb(ok); });
      return true;
    };
    Object.defineProperty(window, 'ensureBwip', { value: ensure, configurable: false, writable: false });
  } catch (_) {}
})();

// Keep your existing API exposure intact below
contextBridge.exposeInMainWorld('api', {
  // Activation
  getDeviceId: () => ipcRenderer.invoke('get-device-id'),
  saveLicense: (licenseJson) => ipcRenderer.invoke('save-license', licenseJson),

  // 🔄 Product Operations
  getProducts: () => ipcRenderer.invoke('get-products'),
  addProduct: (product) => ipcRenderer.invoke('add-product', product),
  deleteProduct: (id) => ipcRenderer.invoke('delete-product', id),
  updateProduct: (product) => ipcRenderer.invoke('update-product', product),

  importProductsCSV: (rows) => ipcRenderer.invoke('import-products-csv', rows),

  // 🧾 Save Sale with inclusive GST
  saveSale: (saleData) => ipcRenderer.invoke('save-sale', saleData),

  // 🏪 Store Settings
  getStoreSettings: () => ipcRenderer.invoke('get-store-settings'),
  saveStoreSettings: (settings) => ipcRenderer.invoke('save-store-settings', settings),
  saveCategoryMap: (data) => ipcRenderer.invoke('save-category-map', data),
  getNextInvoiceNo: () => ipcRenderer.invoke('get-next-invoice-no'),

  // 📊 Dashboard & Reports
  getDashboardStats: () => ipcRenderer.invoke('get-dashboard-stats'),
  getRecentInvoices: () => ipcRenderer.invoke('get-recent-invoices'),
  getInvoiceDetails: (id) => ipcRenderer.invoke('get-invoice-details', { id: id }),
  getInvoices: (options) => ipcRenderer.invoke('get-invoices', options),
  exportInvoicesCsv: (options) => ipcRenderer.invoke('export-invoices-csv', options),

  // ✅ Sub-Category fetcher
  getUniqueSubCategories: (category) => ipcRenderer.invoke('getUniqueSubCategories', { category }),

  // ✅ Backup
  backupNow: () => ipcRenderer.invoke('export-data-dump'),

  // ✅ Import products from CSV rows
  importProductsCSV: (rows) => ipcRenderer.invoke('import-products-csv', rows),
  regenerateBarcodes: () => ipcRenderer.invoke('regenerate-barcodes'),
  generateBarcode: (draft) => ipcRenderer.invoke('generate-barcode', draft),
  getProductById: (id) => ipcRenderer.invoke('get-product-by-id', id),
  printLabel: (options) => ipcRenderer.invoke('print-label', options),
  testPrintLabel: (printerName) => ipcRenderer.invoke('test-print-label', printerName),
  getPrinters: () => ipcRenderer.invoke('get-printers'),
  printInvoice: (data) => ipcRenderer.invoke('print-invoice', data),
  findProductByBarcode: (code) => ipcRenderer.invoke('find-product-by-barcode', code),

  onBarcodeScanned: (callback) => ipcRenderer.on('barcode-scanned', (event, barcode) => callback(barcode)),
  // ...leave other api functions untouched
});
