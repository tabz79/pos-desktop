// main.js — POS Desktop (CommonJS)

const { app, BrowserWindow, ipcMain, dialog, shell, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const ExcelJS = require('exceljs');
const { printInvoice } = require('./printer');
const { migrateDbToUserData } = require('./db-path');

console.log("▶️ Electron app starting...");

// --- String helpers (safe for CSV/Excel) ---
function csvSanitize(v) {
  return String(v ?? '')
    .replace(/"/g, '""')        // escape quotes for CSV
    .replace(/[\r\n]+/g, ' ');  // collapse newlines
}

function fmtCurrency(n) {
  return Number(n) || 0;
}
function fmtPercent(v) {
  const num = Number(v) || 0;
  const pct = num <= 1 ? num * 100 : num; // accept 0.12 or 12
  return `${pct.toFixed(2)}%`;
}

// --- Menu builder (restores File/Edit/View/Window/Help + Tools/Migrate) ---
function buildMenu() {
  const isMac = process.platform === 'darwin';
  const template = [
    ...(isMac ? [{
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    }] : []),

    // Tools near top
    {
      label: 'Tools',
      submenu: [
        {
          label: 'Migrate DB to userData (one-time)',
          click: () => {
            try {
              const oldDb = path.join(process.cwd(), 'pos.db');
              const ok = migrateDbToUserData(oldDb);
              console.log('[DB] Migration result:', ok);
            } catch (err) {
              console.error('❌ Tools/Migrate failed:', err);
            }
          }
        }
      ]
    },

    {
      label: 'File',
      submenu: [
        isMac ? { role: 'close' } : { role: 'quit' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' }, { role: 'redo' }, { type: 'separator' },
        { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'pasteAndMatchStyle' },
        { role: 'delete' }, { role: 'selectAll' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' }, { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' }, { role: 'zoom' },
        ...(isMac ? [{ type: 'separator' }, { role: 'front' }, { type: 'separator' }, { role: 'window' }] : [{ role: 'close' }])
      ]
    },
    {
      label: 'Help',
      submenu: [
        { label: 'Learn More', click: () => {} }
      ]
    }
  ];
  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// --- DB module load ---
let dbAPI;
try {
  dbAPI = require('./db');
  console.log("✅ Database module loaded.");
} catch (err) {
  console.error("❌ Failed to load database:", err);
}

// --- Validation helpers for IPC ---
const isString = v => typeof v === 'string';
const isIntLike = v => Number.isInteger(v) || (typeof v === 'string' && /^\d+$/.test(v));
const isNumber = v => typeof v === 'number' && Number.isFinite(v);
const isInt = v => Number.isInteger(v);
const isOptional = (pred) => (v) => v === undefined || v === null || v === '' || pred(v);
const isDateISO = (v) => isString(v) && /^\d{4}-\d{2}-\d{2}$/.test(v);
const isArray = Array.isArray;

/** schema = { fieldName: predicate } */
function validate(schema, obj = {}) {
  const out = {};
  for (const [k, pred] of Object.entries(schema)) {
    const val = obj[k];
    if (!pred(val)) {
      throw new Error(`Invalid "${k}"`);
    }
    out[k] = val;
  }
  return out;
}

function safeHandler(schema, fn) {
  return async (_event, args) => {
    try {
      const input = (args && typeof args === 'object') ? args : {};
      const a = schema ? validate(schema, input) : input;
      const data = await Promise.resolve(fn(a));
      return data; // return raw to keep renderer contract
    } catch (err) {
      console.error('[IPC]', fn.name || 'handler', 'error:', err);
      throw err; // reject invoke() like native behavior
    }
  };
}

// --- Window / App bootstrap ---
let mainWindow;

function createWindow() {
  console.log("📦 Creating main window...");
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    }
  });

  mainWindow.loadFile('index.html');
  console.log("✅ Window loaded.");
}

// --- Barcode helpers (unchanged logic, with counter memory) ---
let barcodeCounter = 0;

function generateBarcode(product) {
  try {
    const category = (product.category || 'UNK').substring(0, 2).toUpperCase().padEnd(2, 'X'); // 2 chars
    const subCategory = (product.sub_category || '_').substring(0, 1).toUpperCase(); // 1 char
    const brand = (product.brand || 'XX').substring(0, 2).toUpperCase().padEnd(2, 'X'); // 2 chars
    const model = (product.model_name ? product.model_name.split('-')[0] : 'ZZ').substring(0, 2).toUpperCase().padEnd(2, 'Z'); // 2 chars

    const counter = (++barcodeCounter).toString().padStart(4, '0'); // 4 digits

    return `${category}${subCategory}${brand}${counter}${model}`;
  } catch (error) {
    console.error("Failed to generate barcode for", product?.name, error);
    return "ERROR";
  }
}

async function regenerateAllBarcodes() {
  if (!dbAPI) return;
  try {
    console.log('🔄 Clearing all existing barcode values...');
    dbAPI.db.prepare('UPDATE products SET barcode_value = NULL').run();

    const products = dbAPI.getAllProducts();
    console.log(`Found ${products.length} products to process.`);
    const maxBarcode = dbAPI.db.prepare("SELECT MAX(barcode_value) as max FROM products").get();
    if (maxBarcode && maxBarcode.max) {
      const match = maxBarcode.max.match(/(\d{5})/);
      if (match) {
        barcodeCounter = parseInt(match[1], 10);
      }
    }
    console.log(`Starting barcode counter at ${barcodeCounter}`);

    console.log('🔄 Regenerating all product barcodes...');
    const updateStmt = dbAPI.db.prepare('UPDATE products SET barcode_value = ? WHERE id = ?');

    for (let i = 0; i < products.length; i++) {
      const product = products[i];
      const newBarcode = generateBarcode(product);
      updateStmt.run(newBarcode, product.id);
      if (i < 5) {
        console.log(`Generated barcode for ${product.name}: ${newBarcode}`);
      }
    }
    console.log('✅ Barcode regeneration complete.');
  } catch (error) {
    console.error('❌ Failed to regenerate barcodes:', error);
  }
}

// Recommended for some Windows GPU cache noise
app.disableHardwareAcceleration();

app.whenReady().then(async () => {
  console.log("🚀 App is ready.");
  if (process.env.NODE_ENV !== 'production') {
    // await regenerateAllBarcodes(); // Uncomment for development if needed
  } else {
    console.warn('Production mode: Automatic barcode regeneration on boot is disabled.');
  }

  createWindow();
  buildMenu();

  // ✅ IPC Handlers
  if (!dbAPI) console.warn('[DB] not initialized — IPC will still validate but ops may fail');

  // Dashboard/products
  ipcMain.handle('get-dashboard-stats', safeHandler(null, () => dbAPI.getDashboardStats()));
  ipcMain.handle('get-products', safeHandler(null, () => dbAPI.getAllProducts()));

  // Invoices
  ipcMain.handle('get-invoices', safeHandler({
    page: isOptional(isInt),
    limit: isOptional(isInt),
    startDate: isOptional(isDateISO),
    endDate: isOptional(isDateISO),
    searchQuery: isOptional(isString)
  }, (args) => dbAPI.getInvoices(args)));

  ipcMain.handle('get-invoices-for-export', safeHandler({
    startDate: isOptional(isDateISO),
    endDate: isOptional(isDateISO),
    searchQuery: isOptional(isString)
  }, (args) => dbAPI.getInvoicesForExport(args)));

  ipcMain.handle('get-invoice-details', safeHandler({ id: isInt }, ({ id }) => dbAPI.getInvoiceDetails(id)));

  // get-product-by-id — tolerant to number, string, or various object keys
  ipcMain.handle('get-product-by-id', async (_event, arg) => {
    try {
      let id = null;

      if (typeof arg === 'number' && Number.isInteger(arg)) {
        id = arg;
      } else if (typeof arg === 'string' && /^\d+$/.test(arg)) {
        id = parseInt(arg, 10);
      } else if (arg && typeof arg === 'object') {
        const cand = arg.id ?? arg.product_id ?? arg.productId ?? arg.Id;
        if (typeof cand === 'number' && Number.isInteger(cand)) {
          id = cand;
        } else if (typeof cand === 'string' && /^\d+$/.test(cand)) {
          id = parseInt(cand, 10);
        }
      }

      if (id === null) {
        if (process.env.NODE_ENV !== 'production') {
          console.error('[IPC] get-product-by-id invalid payload:', arg);
        }
        throw new Error('Invalid "id"');
      }

      const product = await dbAPI.getProductById(id);
      return product || null;
    } catch (error) {
      console.error('Error in handler for "get-product-by-id":', error);
      throw error;
    }
  });

  // Store settings
  // Store settings — GET: normalize to both snake_case and camelCase
  ipcMain.handle('get-store-settings', safeHandler(null, async () => {
    const s = await dbAPI.getStoreSettings();

    // Normalize keys (do NOT break existing fields)
    const labelSnake = s?.label_printer_name ?? s?.labelPrinterName ?? null;

    return {
      ...s,
      // ensure both exist so renderer (old/new) can read either
      label_printer_name: labelSnake,
      labelPrinterName: labelSnake,
    };
  }));

  // Store settings — SAVE: accept both key styles, unify, persist, and echo back
  ipcMain.handle('save-store-settings', safeHandler({
    store_name: isOptional(isString),
    store_subtitle: isOptional(isString),
    store_address: isOptional(isString),
    store_phone: isOptional(isString),
    store_gstin: isOptional(isString),
    store_footer: isOptional(isString),
    // accept snake or camel (validator can’t see both; we’ll normalize below)
    label_printer_name: isOptional(isString)
  }, async (payload) => {
    // also capture camelCase if the UI sent it
    const incomingCamel = (payload && typeof payload === 'object') ? payload.labelPrinterName : undefined;

    // Normalize to snake_case for DB
    const normalized = {
      ...payload,
      label_printer_name: payload.label_printer_name ?? incomingCamel ?? null,
    };

    if (process.env.NODE_ENV !== 'production') {
      console.log('[IPC] save-store-settings payload (normalized)=', normalized);
    }

    const res = await dbAPI.saveStoreSettings(normalized);

    // Read back to confirm persistence and to give both key styles to UI
    const after = await dbAPI.getStoreSettings();
    const labelSnake = after?.label_printer_name ?? after?.labelPrinterName ?? normalized.label_printer_name ?? null;

    const echo = {
      ...after,
      label_printer_name: labelSnake,
      labelPrinterName: labelSnake,
    };

    if (process.env.NODE_ENV !== 'production') {
      console.log('[IPC] save-store-settings echo =', echo);
    }

    // Normalize success contract
    if (res && typeof res === 'object' && 'success' in res) {
      return { ...res, settings: echo };
    }
    return { success: true, settings: echo };
  }));

  // CSV Product Import
  ipcMain.handle('import-products-from-csv', safeHandler({
    rows: (v) => isArray(v)
  }, ({ rows }) => dbAPI.importProductsFromCSV(rows, generateBarcode)));

  // Sales
  ipcMain.handle('save-sale', safeHandler({
    invoice_no: isOptional(isString),
    timestamp: isString,
    payment_method: isString,
    customer_name: isOptional(isString),
    customer_phone: isOptional(isString),
    customer_gstin: isOptional(isString),
    items: (v) => isArray(v) && v.length > 0
  }, (payload) => dbAPI.saveSale(payload)));

  // Product CRUD
  ipcMain.handle('add-product', safeHandler({
    name: isString,
    price: isNumber,
    stock: isInt,
    category: isOptional(isString),
    hsn_code: isOptional(isString),
    gst_percent: isOptional(isNumber),
    product_id: isOptional(isString),
    sub_category: isOptional(isString),
    brand: isOptional(isString),
    model_name: isOptional(isString),
    unit: isOptional(isString),
    barcode_value: isOptional(isString)
  }, (product) => dbAPI.addProduct(product)));

  ipcMain.handle('delete-product', safeHandler({ id: isIntLike }, ({ id }) =>
    dbAPI.deleteProduct(parseInt(id, 10))
  ));

  ipcMain.handle('update-product', safeHandler({
    id: isIntLike,
    name: isString,
    price: isNumber,
    stock: isInt,
    category: isOptional(isString),
    hsn_code: isOptional(isString),
    gst_percent: isOptional(isNumber),
    product_id: isOptional(isString),
    sub_category: isOptional(isString),
    brand: isOptional(isString),
    model_name: isOptional(isString),
    unit: isOptional(isString),
    barcode_value: isOptional(isString)
  }, (product) => dbAPI.updateProduct({ ...product, id: parseInt(product.id, 10) })));

  // Category map save
  ipcMain.handle("save-category-map", safeHandler({
    data: (v) => typeof v === 'object'
  }, ({ data }) => {
    const filePath = path.join(__dirname, 'category-hsn-map.json');
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    return { success: true };
  }));

  // Recent invoices
  ipcMain.handle('get-recent-invoices', safeHandler(null, () => dbAPI.getRecentInvoices()));

  // GST totals & subcategories
  ipcMain.handle('get-gst-totals', safeHandler({
    startDate: isOptional(isDateISO),
    endDate:   isOptional(isDateISO),
    searchQuery: isOptional(isString)
  }, (args) => dbAPI.getGSTTotals(args)));

  ipcMain.handle('getUniqueSubCategories', safeHandler({
    category: isOptional(isString)
  }, ({ category }) => {
    console.log('[IPC] getUniqueSubCategories category =', category);
    return dbAPI.getUniqueSubCategories(category || null);
  }));

  // Barcode helpers (kept for compatibility)
  ipcMain.handle('find-product-by-barcode', safeHandler({
    rawCode: isString
  }, ({ rawCode }) => {
    if (!dbAPI || !rawCode) return null;
    try {
      const normalizedCode = rawCode.trim().toUpperCase();
      const query = `
        SELECT id, name, price, product_id, barcode_value
        FROM products
        WHERE UPPER(REPLACE(barcode_value, ' ', '')) = ? OR UPPER(REPLACE(product_id, ' ', '')) = ?
      `;
      const product = dbAPI.db.prepare(query).get(normalizedCode, normalizedCode);
      return product || null;
    } catch (error) {
      console.error('❌ Failed to find product by barcode:', error);
      return null;
    }
  }));

  ipcMain.on('barcode-scan-request', (event, barcode) => {
    if (!dbAPI) {
      event.sender.send('barcode-scan-response', null);
      return;
    }
    try {
      const product = dbAPI.db.prepare(
        'SELECT * FROM products WHERE barcode_value = ? OR product_id = ?'
      ).get(barcode, barcode);
      event.sender.send('barcode-scan-response', product || null);
    } catch (error) {
      console.error('Error finding product by barcode:', error);
      event.sender.send('barcode-scan-response', null);
    }
  });

  // Printer (invoice)
  ipcMain.on('print-invoice', (_event, invoiceData) => {
    console.log('Main: Received print-invoice IPC call. Passing data to printer.js');
    printInvoice(invoiceData);
  });

  // --- PRINTER ENUMERATION (fix for label printer list) ---
  ipcMain.handle('get-printers', safeHandler(null, async () => {
    try {
      if (!mainWindow || !mainWindow.webContents) {
        throw new Error('Main window not ready');
      }

      const printers = mainWindow.webContents.getPrintersAsync
        ? await mainWindow.webContents.getPrintersAsync()
        : mainWindow.webContents.getPrinters();

      const simplified = printers.map(p => ({
        name: p.name,
        displayName: p.displayName || p.name,
        isDefault: !!p.isDefault,
        status: p.status ?? null,
        description: p.description ?? null,
        driverName: (p.options && p.options.driverName) || null,
        options: p.options || {}
      }));

      console.log(`[IPC] get-printers -> ${simplified.length} found`);
      return simplified;
    } catch (err) {
      console.error('❌ get-printers failed:', err);
      return [];
    }
  }));

  // ========= LABEL PRINTING PIPELINE (RESTORED) =========

  // Convert mm to microns for Electron custom pageSize
  const mmToMicrons = (mm) => Math.max(1, Math.round(mm * 1000));

  async function resolveLabelPrinterName(requestedName) {
    // 1) explicit arg
    if (requestedName && typeof requestedName === 'string') return requestedName;

    // 2) from store settings
    try {
      const settings = await dbAPI.getStoreSettings();
      if (settings && settings.label_printer_name) return settings.label_printer_name;
    } catch (e) {
      console.warn('⚠️ Could not read store settings for label_printer_name:', e?.message || e);
    }

    // 3) fallback: default system printer (return null to let print() choose)
    return null;
  }

  async function getPrinterList() {
    if (!mainWindow || !mainWindow.webContents) throw new Error('Main window not ready');
    const printers = mainWindow.webContents.getPrintersAsync
      ? await mainWindow.webContents.getPrintersAsync()
      : mainWindow.webContents.getPrinters();
    return Array.isArray(printers) ? printers : [];
  }

  async function executeLabelPrint({ html, widthMm = 50, heightMm = 30, printerName }) {
    if (!html || typeof html !== 'string') throw new Error('Label html is required');

    // Resolve target printer
    const desiredName = await resolveLabelPrinterName(printerName);

    const printers = await getPrinterList();
    const found = desiredName
      ? printers.find(p => p && (p.name === desiredName || p.displayName === desiredName))
      : null;

    let deviceName = null;
    let note = '';
    if (found) {
      deviceName = found.name; // Electron expects the internal name
    } else if (desiredName) {
      note = `Requested printer "${desiredName}" not found. Falling back to system default.`;
      console.warn('⚠️', note);
    }

    // Hidden window to render the label HTML
    const printWin = new BrowserWindow({
      width: Math.ceil(widthMm * 4),  // tiny preview size
      height: Math.ceil(heightMm * 4),
      show: false,
      webPreferences: {
        contextIsolation: true,
        sandbox: true
      }
    });

    // 👉 Inject Y-offset without breaking original HTML
    const offsetHtml = html
      .replace(/<body([^>]*)>/i, `<body$1><div class="yoffset">`)
      .replace(/<\/body>/i, `</div></body>`);

    const finalHtml = offsetHtml.replace(
      /<\/head>/i,
      `<style>.yoffset { position: relative; top: -7mm; }</style></head>`
    );

    const dataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(finalHtml)}`;

    await printWin.loadURL(dataUrl);

    // Build print options
    const pageSize = {
      width: mmToMicrons(Number(widthMm) || 50),
      height: mmToMicrons(Number(heightMm) || 25)
    };

    const printOpts = {
      silent: true,
      deviceName: deviceName || undefined, // undefined => default printer
      margins: { marginType: 'none' },
      printBackground: true,
      pageSize
    };

    // Wrap print in a Promise
    const ok = await new Promise((resolve) => {
      try {
        printWin.webContents.print(printOpts, (success, errorType) => {
          if (!success) {
            console.error('❌ Label print failed:', errorType);
            resolve(false);
          } else {
            resolve(true);
          }
        });
      } catch (err) {
        console.error('❌ Label print threw:', err);
        resolve(false);
      }
    });

    // Cleanup
    try { if (!printWin.isDestroyed()) printWin.destroy(); } catch (_) {}

    if (!ok) {
      return { success: false, message: 'Label print failed' + (note ? ` (${note})` : '') };
    }
    return { success: true, usedPrinter: deviceName || 'system-default', note };
  }

  // IPC: print a provided label HTML (and optional size/printer)
  ipcMain.handle('print-label', safeHandler({
    html: isString,
    widthMm: isOptional((v) => !isNaN(Number(v))),
    heightMm: isOptional((v) => !isNaN(Number(v))),
    printerName: isOptional(isString)
  }, async ({ html, widthMm, heightMm, printerName }) => {
    const res = await executeLabelPrint({ html, widthMm, heightMm, printerName });
    return res;
  }));

  // IPC: test label print (simple sample with current/specified printer)
  ipcMain.handle('test-print-label', safeHandler({
    printerName: isOptional(isString),
    widthMm: isOptional((v) => !isNaN(Number(v))),
    heightMm: isOptional((v) => !isNaN(Number(v)))
  }, async ({ printerName, widthMm, heightMm }) => {
    const sampleHtml = `
<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    @page { 
      size: ${Number(widthMm||50)}mm ${Number(heightMm||30)}mm; 
      margin: 0; 
    }
    html, body { 
      margin: 0; 
      padding: 0; 
      width: 100%; 
      height: 100%; 
    }
    body { 
      font-family: Arial, sans-serif; 
      font-size: 10pt; 
      display: flex; 
      align-items: flex-start;   /* stick to top instead of centering */
      justify-content: center; 
    }
    .label { 
      text-align: center; 
      padding: 0;   /* removed the 2mm padding that was shifting Y */
      width: 100%; 
    }
    .big { 
      font-size: 12pt; 
      font-weight: bold; 
      margin: 0; 
    }
    .small { 
      font-size: 8pt; 
      margin: 0; 
    }
  </style>
</head>
<body>
  <div class="label">
    <div class="big">TEST LABEL</div>
    <div class="small">Device: ${printerName ? String(printerName).replace(/[<>&]/g, '') : 'saved/default'}</div>
    <div class="small">${new Date().toLocaleString()}</div>
  </div>
</body>
</html>
    `.trim();

    const res = await executeLabelPrint({
      html: sampleHtml,
      widthMm: Number(widthMm) || 50,
      heightMm: Number(heightMm) || 30,
      printerName: printerName || null
    });
    return res;
  }));

  // ========= END LABEL PRINTING =========

  // --- Excel generator (safe, bounded, returns saved file path) ---
  async function generateExcelReport({ startDate, endDate, searchQuery, outPath }) {
    const os = require('os');

    // Pull data directly from DB API (raw calls)
    const totalsResp = await dbAPI.getGSTTotals({ startDate, endDate, searchQuery });
    const slabResp   = await dbAPI.getGSTSummary({ startDate, endDate, searchQuery });
    const linesResp  = await dbAPI.getInvoicesForExport({ startDate, endDate, searchQuery });

    const totals = totalsResp?.data || {
      total_taxable_value: 0, total_gst_amount: 0,
      total_cgst: 0, total_sgst: 0, grand_total: 0
    };
    const slabRows = Array.isArray(slabResp?.data) ? slabResp.data : [];
    const lines = Array.isArray(linesResp?.data) ? linesResp.data : [];

    const wb = new ExcelJS.Workbook();

    // Sheet 1: GST Summary
    const wsSum = wb.addWorksheet('GST Summary');
    wsSum.columns = [
      { header: 'Description', key: 'desc', width: 28 },
      { header: 'Amount (₹)', key: 'amt',  width: 18 },
    ];
    wsSum.addRows([
      { desc: 'Total Taxable Value', amt: fmtCurrency(totals.total_taxable_value) },
      { desc: 'Total GST Amount',    amt: fmtCurrency(totals.total_gst_amount) },
      { desc: 'Total CGST',          amt: fmtCurrency(totals.total_cgst) },
      { desc: 'Total SGST',          amt: fmtCurrency(totals.total_sgst) },
      { desc: 'Grand Total',         amt: fmtCurrency(totals.grand_total) },
    ]);

    // Sheet 2: GST Slab Summary
    const wsSlab = wb.addWorksheet('GST Slab Summary');
    wsSlab.columns = [
      { header: 'HSN Code',           key: 'hsn',  width: 14 },
      { header: 'GST %',              key: 'gstp', width: 10 },
      { header: 'Taxable Value (₹)',  key: 'tv',   width: 18 },
      { header: 'CGST (₹)',           key: 'cgst', width: 14 },
      { header: 'SGST (₹)',           key: 'sgst', width: 14 },
      { header: 'Total GST (₹)',      key: 'tgst', width: 16 },
      { header: 'Total Value (₹)',    key: 'ttl',  width: 18 },
    ];
    for (const r of slabRows) {
      wsSlab.addRow({
        hsn:  r.hsn_code || 'NA',
        gstp: fmtPercent(r.gst_percent),
        tv:   fmtCurrency(r.taxable_value),
        cgst: fmtCurrency(r.cgst),
        sgst: fmtCurrency(r.sgst),
        tgst: fmtCurrency(r.gst_amount),
        ttl:  fmtCurrency(r.total),
      });
    }

    // Sheet 3: Invoice Lines
    const wsLines = wb.addWorksheet('Invoice Lines');
    wsLines.columns = [
      { header: 'Invoice No',  key: 'inv',   width: 16 },
      { header: 'Date/Time',   key: 'ts',    width: 22 },
      { header: 'Customer',    key: 'cust',  width: 24 },
      { header: 'GSTIN',       key: 'gstin', width: 18 },
      { header: 'Item',        key: 'item',  width: 36 },
      { header: 'Qty',         key: 'qty',   width: 8  },
      { header: 'Price',       key: 'price', width: 12 },
      { header: 'GST %',       key: 'gstp',  width: 10 },
      { header: 'Taxable (₹)', key: 'tv',    width: 14 },
      { header: 'CGST (₹)',    key: 'cgst',  width: 12 },
      { header: 'SGST (₹)',    key: 'sgst',  width: 12 },
      { header: 'Total (₹)',   key: 'ttl',   width: 14 },
    ];
    for (const r of lines) {
      wsLines.addRow({
        inv:   r.invoice_no || '',
        ts:    r.timestamp || '',
        cust:  csvSanitize(r.customer_name),
        gstin: csvSanize(r.customer_gstin), // typo fix below
        item:  csvSanitize(r.item_name),
        qty:   Number(r.quantity) || 0,
        price: Number(r.price) || 0,
        gstp:  fmtPercent(r.gst_percent),
        tv:    fmtCurrency(r.taxable_value),
        cgst:  fmtCurrency(r.cgst),
        sgst:  fmtCurrency(r.sgst),
        ttl:   fmtCurrency(r.total),
      });
    }

    // Output path
    const osMod = require('os');
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    const defaultDir = path.join(osMod.homedir(), 'Downloads');
    const defaultPath = path.join(defaultDir, `gst-report-${stamp}.xlsx`);
    const filePath = outPath || defaultPath;

    await wb.xlsx.writeFile(filePath);
    return filePath;
  }

  // CSV fallback (timestamped to avoid EBUSY on Windows)
  function generateCsvFallback(data, basePath) {
    const header = [
      'InvoiceNo', 'Date', 'CustomerName', 'CustomerGSTIN', 'Total',
      'ItemName', 'Quantity', 'Price', 'GSTPercent', 'TaxableValue',
      'GSTAmount', 'CGST', 'SGST'
    ].join(',');

    const rows = data.map(row => {
      const out = [
        csvSanitize(row.invoice_no),
        row.timestamp ? new Date(row.timestamp).toISOString() : '',
        `"${csvSanitize(row.customer_name)}"`,
        csvSanize(row.customer_gstin), // typo fix below
        row.total || 0,
        `"${csvSanitize(row.item_name)}"`,
        row.quantity || 0,
        row.price || 0,
        (Number(row.gst_percent) || 0), // leave as number; Excel can format
        row.taxable_value || 0,
        row.gst_amount || 0,
        row.cgst || 0,
        row.sgst || 0,
      ];
      return out.join(',');
    });

    const content = [header, ...rows].join('\n');

    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    const csvPath = basePath.replace(/\.xlsx$/i, `-${stamp}.csv`);
    fs.writeFileSync(csvPath, content);
    return csvPath;
  }

  // 🔧 fix small typo in fallback helper above
  function csvSanize(v) { return csvSanitize(v); }

  // Export invoices / GST report (Excel first, CSV fallback)
  ipcMain.handle('export-invoices-csv', safeHandler({
    startDate: isOptional(isDateISO),
    endDate: isOptional(isDateISO),
    searchQuery: isOptional(isString)
  }, async (options) => {
    const result = await dbAPI.getInvoicesForExport(options);
    const gstSummary = await dbAPI.getGSTSummary(options);
    const gstTotals = await dbAPI.getGSTTotals(options);

    if (!result.success || !gstSummary.success || !gstTotals.success) {
      return { success: false, message: 'Failed to retrieve data for export.' };
    }

    const { filePath, canceled } = await dialog.showSaveDialog(mainWindow, {
      title: 'Export Invoices / GST Report',
      defaultPath: `invoices-${options.startDate && options.endDate ? `${options.startDate}-to-${options.endDate}` : new Date().toISOString().slice(0, 10)}.xlsx`,
      filters: [{ name: 'Excel Files', extensions: ['xlsx'] }],
    });

    if (canceled || !filePath) {
      return { success: false, message: 'Export canceled.' };
    }

    try {
      const savedPath = await generateExcelReport({
        startDate: options.startDate,
        endDate: options.endDate,
        searchQuery: options.searchQuery,
        outPath: filePath
      });
      shell.openPath(savedPath);
      return { success: true };
    } catch (error) {
      console.error('❌ Failed to generate Excel report:', error);
      try {
        const csvPath = generateCsvFallback(result.data, filePath);
        shell.openPath(csvPath);
        return {
          success: false,
          message: 'Excel failed. Created CSV fallback instead.'
        };
      } catch (csvError) {
        console.error('❌ Failed to generate CSV fallback:', csvError);
        return {
          success: false,
          message: 'Failed to generate both Excel and CSV. Please try again.'
        };
      }
    }
  }));

}); // <-- closes app.whenReady().then(() => { ... })

// Single-instance lock (optional safety; harmless if left here)
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

// Clean shutdown on all platforms
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
