const path = require('path');
const { resolvePosDbPath } = require('./db-path');

let db;

// helpers
function getTableInfo(db, table) {
  return db.prepare(`PRAGMA table_info(${table})`).all();
}
function hasColumn(db, table, col) {
  return getTableInfo(db, table).some(c => c.name === col);
}
function hasIndex(db, table, indexName) {
  return db.prepare(`PRAGMA index_list(${table})`).all().some(i => i.name === indexName);
}
function getUserVersion(db) {
  return db.prepare('PRAGMA user_version').get().user_version ?? 0;
}
function setUserVersion(db, v) {
  db.pragma(`user_version = ${v}`);
}

function initSchema(db) {
  const tx = db.transaction(() => {
    // 1) Core tables (additive & safe)
    db.prepare(`
      CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        product_id TEXT UNIQUE,
        name TEXT NOT NULL,
        price REAL NOT NULL,
        stock INTEGER NOT NULL,
        category TEXT,
        sub_category TEXT,
        brand TEXT,
        model_name TEXT,
        unit TEXT,
        hsn_code TEXT,
        gst_percent REAL,
        barcode_value TEXT UNIQUE
      )
    `).run();

    db.prepare(`
      CREATE TABLE IF NOT EXISTS sales (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        total REAL NOT NULL,
        timestamp TEXT NOT NULL,
        invoice_no TEXT,
        payment_method TEXT,
        customer_name TEXT,
        customer_phone TEXT,
        customer_gstin TEXT
      )
    `).run();

    db.prepare(`
      CREATE TABLE IF NOT EXISTS sale_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sale_id INTEGER NOT NULL,
        product_id TEXT, 
        name TEXT NOT NULL,
        price REAL NOT NULL,
        quantity INTEGER NOT NULL,
        hsn_code TEXT,
        gst_percent REAL,
        taxable_value REAL,
        gst_amount REAL,
        cgst REAL,
        sgst REAL,
        FOREIGN KEY (sale_id) REFERENCES sales(id) DEFERRABLE INITIALLY DEFERRED
      )
    `).run();

    db.prepare(`
      CREATE TABLE IF NOT EXISTS store_settings (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        store_name TEXT,
        store_address TEXT,
        label_printer_name TEXT
      )
    `).run();

    db.prepare(`
      CREATE TABLE IF NOT EXISTS invoice_counter (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        current_number INTEGER DEFAULT 0
      )
    `).run();
    db.prepare(`INSERT OR IGNORE INTO invoice_counter (id, current_number) VALUES (1, 0)`).run();

    db.prepare(`
      CREATE TABLE IF NOT EXISTS invoice_daily_counter (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        last_reset_date TEXT NOT NULL,
        current_daily_number INTEGER DEFAULT 0
      )
    `).run();
    db.prepare(`INSERT OR IGNORE INTO invoice_daily_counter (id, last_reset_date, current_daily_number) VALUES (1, ?, 0)`).run(new Date().toISOString().slice(0, 10));

    // 2) Columns added later — add only if missing
    // store_settings late columns used by saveStoreSettings
    const storeLateCols = [
      { name: 'store_subtitle', type: 'TEXT' },
      { name: 'store_phone', type: 'TEXT' },
      { name: 'store_gstin', type: 'TEXT' },
      { name: 'store_footer', type: 'TEXT' },
      { name: 'store_fssai', type: 'TEXT' },
      { name: 'schema_version', type: `TEXT DEFAULT '1.1'` },
      { name: 'label_printer_name', type: 'TEXT' } // keep in case table was created earlier without it
    ];
    for (const col of storeLateCols) {
      if (!hasColumn(db, 'store_settings', col.name)) {
        db.prepare(`ALTER TABLE store_settings ADD COLUMN ${col.name} ${col.type}`).run();
      }
    }

    if (!hasColumn(db, 'sales', 'invoice_no')) {
      db.prepare(`ALTER TABLE sales ADD COLUMN invoice_no TEXT`).run();
    }
    if (!hasColumn(db, 'sales', 'payment_method')) {
      db.prepare(`ALTER TABLE sales ADD COLUMN payment_method TEXT`).run();
    }
    if (!hasColumn(db, 'sales', 'customer_name')) {
      db.prepare(`ALTER TABLE sales ADD COLUMN customer_name TEXT`).run();
    }
    if (!hasColumn(db, 'sales', 'customer_phone')) {
      db.prepare(`ALTER TABLE sales ADD COLUMN customer_phone TEXT`).run();
    }
    if (!hasColumn(db, 'sales', 'customer_gstin')) {
      db.prepare(`ALTER TABLE sales ADD COLUMN customer_gstin TEXT`).run();
    }

    // 3) Indexes — create only if missing
    if (!hasIndex(db, 'products', 'idx_products_id')) {
      db.prepare(`CREATE INDEX idx_products_id ON products(id DESC)`).run();
    }
    if (!hasIndex(db, 'products', 'idx_products_category')) {
      db.prepare(`CREATE INDEX idx_products_category ON products(category)`).run();
    }
    if (!hasIndex(db, 'products', 'idx_products_sub_category')) {
      db.prepare(`CREATE INDEX idx_products_sub_category ON products(sub_category)`).run();
    }
    if (!hasIndex(db, 'products', 'idx_products_brand')) {
      db.prepare(`CREATE INDEX idx_products_brand ON products(brand)`).run();
    }

    // 4) One-time migrations using user_version
    const v = getUserVersion(db);
    if (v < 1) {
      // Example of a future migration
      setUserVersion(db, 1);
    }
  });

  tx();
  console.log('[DB] Schema init: idempotent setup complete');
}

try {
  const Database = require('better-sqlite3');
  const dbPath = resolvePosDbPath();
  console.log("📁 [DEBUG] DB path resolved to:", dbPath);
  db = new Database(dbPath);

  try {
    const jm = db.pragma('journal_mode = WAL');
    console.log('[DB] PRAGMA journal_mode ->', jm);

    db.pragma('foreign_keys = ON');
    console.log('[DB] PRAGMA foreign_keys -> on');

    db.pragma('synchronous = NORMAL');
    console.log('[DB] PRAGMA synchronous -> normal');
  } catch (err) {
    console.error('[DB] PRAGMA setup failed:', err);
  }

  initSchema(db);
  
} catch (err) {
  console.error("❌ Failed to load better-sqlite3:", err);
  db = null;
}

// ✅ Get all products
function getAllProducts() {
  console.time("⏱️ getAllProducts");
  const stmt = db.prepare(`
    SELECT id, product_id, name, category, sub_category, brand, model_name,
           price, stock, gst_percent
    FROM products
    ORDER BY id DESC
  `);
  const result = stmt.all();
  console.timeEnd("⏱️ getAllProducts");
  return result;
}

// ✅ Add a new product
function addProduct(product) {
  const stmt = db.prepare(`
    INSERT INTO products (name, price, stock, category, hsn_code, gst_percent, product_id, sub_category, brand, model_name, unit, barcode_value)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const info = stmt.run(
    product.name,
    product.price,
    product.stock,
    product.category || null,
    product.hsn_code || null,
    product.gst_percent ?? null,
    product.product_id || null,
    product.sub_category || null,
    product.brand || null,
    product.model_name || null,
    product.unit || null,
    product.barcode_value || null
  );
  return { success: true, id: info.lastInsertRowid };
}

// ✅ Delete a product by ID
function deleteProduct(id) {
  try {
    const stmt = db.prepare('DELETE FROM products WHERE id = ?');
    const info = stmt.run(id);
    return info.changes > 0
      ? { success: true }
      : { success: false, message: 'Product not found' };
  } catch (err) {
    console.error("❌ Failed to delete product:", err);
    return { success: false, message: 'Error deleting product' };
  }
}

// ✅ Update existing product
function updateProduct(product) {
  try {
    const stmt = db.prepare(`
      UPDATE products
      SET name = ?, price = ?, stock = ?, category = ?, hsn_code = ?, gst_percent = ?, product_id = ?, sub_category = ?, brand = ?, model_name = ?, unit = ?, barcode_value = ?
      WHERE id = ?
    `);
    const info = stmt.run(
      product.name,
      product.price,
      product.stock,
      product.category || null,
      product.hsn_code || null,
      product.gst_percent ?? null,
      product.product_id || null,
      product.sub_category || null,
      product.brand || null,
      product.model_name || null,
      product.unit || null,
      product.barcode_value || null,
      product.id
    );
    return info.changes > 0
      ? { success: true }
      : { success: false, message: 'Product not found or unchanged' };
  } catch (err) {
    console.error("❌ Failed to update product:", err);
    return { success: false, message: 'Error updating product' };
  }
}

// ✅ Save a full sale (sale + items with GST extracted from MRP)
function saveSale(saleData) {
  //  atomically insert sale, sale_items, and update stock
  const saveSaleTransaction = db.transaction((sale) => {
    const {
      invoice_no,
      timestamp,
      payment_method,
      customer_name,
      customer_phone,
      customer_gstin,
      items
    } = sale;

    if (!Array.isArray(items) || items.length === 0) {
      throw new Error("Sale must include items");
    }

    const enrichedItems = [];
    for (const i of items) {
      const price = i.price;
      const qty = i.quantity;
      const gstRate = i.gst_percent ?? 0;
      const totalMRP = price * qty;
      const divisor = 1 + gstRate / 100;
      const taxableValue = +(totalMRP / divisor).toFixed(2);
      const gstAmount = +(totalMRP - taxableValue).toFixed(2);
      const cgst = +(gstAmount / 2).toFixed(2);
      const sgst = +(gstAmount / 2).toFixed(2);
      enrichedItems.push({
        ...i,
        taxable_value: taxableValue,
        gst_amount: gstAmount,
        cgst,
        sgst
      });
    }

    const total = enrichedItems.reduce((acc, i) => acc + i.taxable_value + i.gst_amount, 0);

    const salesCols = db.prepare("PRAGMA table_info(sales)").all().map(c => c.name);
    const neededCols = [
      { name: "invoice_no", type: "TEXT" },
      { name: "payment_method", type: "TEXT" },
      { name: "customer_name", type: "TEXT" },
      { name: "customer_phone", type: "TEXT" },
      { name: "customer_gstin", type: "TEXT" }
    ];
    for (const col of neededCols) {
      if (!salesCols.includes(col.name)) {
        db.prepare(`ALTER TABLE sales ADD COLUMN ${col.name} ${col.type}`).run();
      }
    }

    const insertSale = db.prepare(`
      INSERT INTO sales (
        total, timestamp, invoice_no, payment_method,
        customer_name, customer_phone, customer_gstin
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const saleInfo = insertSale.run(
      total,
      timestamp,
      invoice_no,
      payment_method,
      customer_name || null,
      customer_phone || null,
      customer_gstin || null
    );
    const saleId = saleInfo.lastInsertRowid;

    const insertItem = db.prepare(`
      INSERT INTO sale_items (
        sale_id, product_id, name, price, quantity,
        hsn_code, gst_percent, taxable_value,
        gst_amount, cgst, sgst
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const i of enrichedItems) {
      insertItem.run(
        saleId,
        i.product_id || null,
        i.name,
        i.price,
        i.quantity,
        i.hsn_code || null,
        i.gst_percent ?? null,
        i.taxable_value,
        i.gst_amount,
        i.cgst,
        i.sgst
      );
      if (i.id) {
        db.prepare(`UPDATE products SET stock = stock - ? WHERE id = ?`).run(i.quantity, i.id);
      }
    }

    return { sale_id: saleId, invoice_no: invoice_no };
  });

  try {
    const result = saveSaleTransaction(saleData);
    return {
      success: true,
      sale_id: result.sale_id,
      invoice_no: result.invoice_no
    };
  } catch (err) {
    console.error("❌ Failed to save sale:", err);
    return { success: false, message: 'Error saving sale' };
  }
}

// --- DASHBOARD & REPORTING --- 

function getDashboardStats() {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const month = today.slice(0, 7);
    const year = today.slice(0, 4);

    const todaySales = db.prepare(`SELECT SUM(total) as total FROM sales WHERE date(timestamp) = ?`).get(today)?.total || 0;
    const monthSales = db.prepare(`SELECT SUM(total) as total FROM sales WHERE strftime('%Y-%m', timestamp) = ?`).get(month)?.total || 0;
    const yearSales = db.prepare(`SELECT SUM(total) as total FROM sales WHERE strftime('%Y', timestamp) = ?`).get(year)?.total || 0;

    const topProducts = db.prepare(`
      SELECT p.name, SUM(si.quantity) as total_quantity
      FROM sale_items si
      JOIN products p ON si.product_id = p.product_id
      GROUP BY si.product_id
      ORDER BY total_quantity DESC
      LIMIT 5
    `).all();

    const monthlySalesChart = db.prepare(`
      SELECT strftime('%Y-%m', timestamp) as month, SUM(total) as total_sales
      FROM sales
      WHERE strftime('%Y', timestamp) = ?
      GROUP BY month
      ORDER BY month
    `).all(year);

    return {
      today_sales: todaySales,
      month_sales: monthSales,
      year_sales: yearSales,
      top_products: topProducts,
      monthly_sales_chart: monthlySalesChart
    };
  } catch (err) {
    console.error("❌ Failed to get dashboard stats:", err);
    return null;
  }
}

function getRecentInvoices() {
  try {
    return db.prepare(`
      SELECT id, invoice_no, customer_name, total, timestamp
      FROM sales
      ORDER BY timestamp DESC
      LIMIT 10
    `).all();
  } catch (err) {
    console.error("❌ Failed to get recent invoices:", err);
    return [];
  }
}

function getInvoiceDetails(id) {
  try {
    const sale = db.prepare(`SELECT * FROM sales WHERE id = ?`).get(id);
    if (!sale) return null;

    const items = db.prepare(`SELECT * FROM sale_items WHERE sale_id = ?`).all(id);
    return { ...sale, items };
  } catch (err) {
    console.error("❌ Failed to get invoice details:", err);
    return null;
  }
}

function getInvoices({ page = 1, limit = 15, startDate, endDate, searchQuery = '' }) {
  try {
    const offset = (page - 1) * limit;
    let whereClauses = [];
    let params = [];

    if (startDate) {
      whereClauses.push(`date(timestamp) >= ?`);
      params.push(startDate);
    }
    if (endDate) {
      whereClauses.push(`date(timestamp) <= ?`);
      params.push(endDate);
    }
    if (searchQuery) {
      whereClauses.push(`(invoice_no LIKE ? OR customer_name LIKE ?)`)
      params.push(`%${searchQuery}%`, `%${searchQuery}%`);
    }

    const where = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const countStmt = db.prepare(`SELECT COUNT(*) as total FROM sales ${where}`);
    const { total } = countStmt.get(...params);

    const dataStmt = db.prepare(`
      SELECT id, invoice_no, customer_name, total, timestamp
      FROM sales
      ${where}
      ORDER BY timestamp DESC
      LIMIT ? OFFSET ?
    `);
    const data = dataStmt.all(...params, limit, offset);

    return { data, total, page, limit };

  } catch (err) {
    console.error("❌ Failed to get invoices:", err);
    return { data: [], total: 0, page: 1, limit };
  }
}

function getInvoicesForExport({ startDate, endDate, searchQuery = '' }) {
  try {
    const params = {};
    let whereClauses = [];
    let countWhereClauses = [];

    if (startDate) {
      whereClauses.push(`date(s.timestamp) >= :startDate`);
      countWhereClauses.push(`date(timestamp) >= :startDate`);
      params.startDate = startDate;
    }
    if (endDate) {
      whereClauses.push(`date(s.timestamp) < date(:endDate, '+1 day')`);
      countWhereClauses.push(`date(timestamp) < date(:endDate, '+1 day')`);
      params.endDate = endDate;
    }
    if (searchQuery) {
      whereClauses.push(`(s.invoice_no LIKE :searchQuery OR s.customer_name LIKE :searchQuery)`);
      countWhereClauses.push(`(invoice_no LIKE :searchQuery OR customer_name LIKE :searchQuery)`);
      params.searchQuery = `%${searchQuery}%`;
    }

    const where = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
    const countWhere = countWhereClauses.length > 0 ? `WHERE ${countWhereClauses.join(' AND ')}` : '';

    const countStmt = db.prepare(`SELECT COUNT(*) as count FROM sales ${countWhere}`);
    const salesOnlyCount = countStmt.get(params).count;

    const stmt = db.prepare(`
      SELECT
        s.invoice_no,
        s.timestamp,
        s.customer_name,
        s.customer_gstin,
        (si.taxable_value + si.gst_amount) as total,
        si.name as item_name,
        si.quantity,
        si.price,
        si.gst_percent,
        si.taxable_value,
        si.gst_amount,
        si.cgst,
        si.sgst
      FROM sales s
      LEFT JOIN sale_items si ON s.id = si.sale_id
      ${where}
      ORDER BY s.timestamp ASC, s.invoice_no ASC
    `);

    const data = stmt.all(params);
    console.log(`[DB] getInvoicesForExport salesOnlyCount: ${salesOnlyCount}, data.length: ${data.length}`);
    return { success: true, data };

  } catch (err) {
    console.error("❌ Failed to get invoices for export:", err);
    return { success: false, data: [] };
  }
}

// ✅ Save or update the singleton store settings
function saveStoreSettings(payload) {
  try {
    const exists = db.prepare('SELECT COUNT(*) as count FROM store_settings WHERE id = 1').get();
    if (exists.count > 0) {
      db.prepare(`
        UPDATE store_settings
        SET store_name = ?, store_address = ?, store_subtitle = ?, store_phone = ?, store_gstin = ?, store_footer = ?, store_fssai = ?, label_printer_name = ?
        WHERE id = 1
      `).run(
        payload.store_name || '',
        payload.store_address || '',
        payload.store_subtitle || '',
        payload.store_phone || '',
        payload.store_gstin || '',
        payload.store_footer || '',
        payload.store_fssai || '',
        payload.label_printer_name || ''
      );
    } else {
      db.prepare(`
        INSERT INTO store_settings (id, store_name, store_address, store_subtitle, store_phone, store_gstin, store_footer, store_fssai, label_printer_name)
        VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        payload.store_name || '',
        payload.store_address || '',
        payload.store_subtitle || '',
        payload.store_phone || '',
        payload.store_gstin || '',
        payload.store_footer || '',
        payload.store_fssai || '',
        payload.label_printer_name || ''
      );
    }
    return { success: true };
  } catch (err) {
    console.error("❌ Failed to save store settings:", err);
    return { success: false, message: "DB save error" };
  }
}

// ✅ Get saved store settings
function getStoreSettings() {
  try {
    const row = db.prepare('SELECT * FROM store_settings WHERE id = 1').get();
    return row || null;
  } catch (err) {
    console.error("❌ Failed to fetch store settings:", err);
    return null;
  }
}

// --- DATA DUMP & RESTORE ---

// ✅ Export all critical data
function exportDataDump() {
    console.log('📦 Starting data export...');
    try {
        const products = db.prepare('SELECT * FROM products').all();
        const sales = db.prepare('SELECT * FROM sales').all();
        const sale_items = db.prepare('SELECT * FROM sale_items').all();
        const store_settings = db.prepare('SELECT * FROM store_settings WHERE id = 1').get();
        
        const dump = { products, sales, sale_items, store_settings };
        console.log('✅ Data export completed successfully.');
        return { success: true, data: dump };
    } catch (err) {
        console.error('❌ Failed to export data:', err);
        return { success: false, message: err.message };
    }
}

// ✅ Import data from a dump file
function importDataDump(dump) {
    if (!dump || !dump.products || !dump.sales || !dump.sale_items || !dump.store_settings) {
        return { success: false, message: "Invalid data dump object provided." };
    }

    const { products, sales, sale_items, store_settings } = dump;

    const importTransaction = db.transaction(() => {
        // 1. Clear existing data
        db.prepare('DELETE FROM sale_items').run();
        db.prepare('DELETE FROM sales').run();
        db.prepare('DELETE FROM products').run();
        db.prepare('DELETE FROM store_settings').run();
        console.log('🗑️ Cleared existing data from tables.');

        // 2. Insert products
        const productStmt = db.prepare(`
            INSERT INTO products (id, product_id, name, price, stock, category, sub_category, brand, model_name, unit, hsn_code, gst_percent, barcode_value)
            VALUES (@id, @product_id, @name, @price, @stock, @category, @sub_category, @brand, @model_name, @unit, @hsn_code, @gst_percent, @barcode_value)
        `);
        for (const product of products) productStmt.run(product);
        console.log(`Imported ${products.length} products.`);

        // 3. Insert sales
        const saleStmt = db.prepare(`
            INSERT INTO sales (id, total, timestamp, invoice_no, payment_method, customer_name, customer_phone, customer_gstin)
            VALUES (@id, @total, @timestamp, @invoice_no, @payment_method, @customer_name, @customer_phone, @customer_gstin)
        `);
        for (const sale of sales) saleStmt.run(sale);
        console.log(`Imported ${sales.length} sales.`);

        // 4. Insert sale items
        const saleItemStmt = db.prepare(`
            INSERT INTO sale_items (id, sale_id, product_id, name, price, quantity, hsn_code, gst_percent, taxable_value, gst_amount, cgst, sgst)
            VALUES (@id, @sale_id, @product_id, @name, @price, @quantity, @hsn_code, @gst_percent, @taxable_value, @gst_amount, @cgst, @sgst)
        `);
        for (const item of sale_items) saleItemStmt.run(item);
        console.log(`Imported ${sale_items.length} sale items.`);

        // 5. Insert store settings
        if (store_settings) {
            const settingsStmt = db.prepare(`
                INSERT INTO store_settings (id, store_name, store_address, store_subtitle, store_phone, store_gstin, store_footer, store_fssai, schema_version, label_printer_name)
                VALUES (@id, @store_name, @store_address, @store_subtitle, @store_phone, @store_gstin, @store_footer, @store_fssai, @schema_version, @label_printer_name)
            `);
            settingsStmt.run(store_settings);
            console.log('Imported store settings.');
        }
    });

    try {
        importTransaction();
        console.log('✅ Data import transaction completed successfully.');
        return { success: true, message: 'Data imported successfully.' };
    } catch (err) {
        console.error("❌ Data import failed:", err);
        return { success: false, message: err.message };
    }
}

function importProductsFromCSV(rows, generateBarcode) {
  if (!Array.isArray(rows)) {
    return { success: false, message: "Invalid input: Expected an array of rows." };
  }

  let imported = 0;
  let skipped = 0;

  const insertStmt = db.prepare(`
    INSERT OR REPLACE INTO products (
      product_id,
      name,
      category,
      sub_category,
      brand,
      model_name,
      unit,
      price,
      gst_percent,
      hsn_code,
      barcode_value,
      stock
    ) VALUES (
      @product_id,
      @name,
      @category,
      @sub_category,
      @brand,
      @model_name,
      @unit,
      @price,
      @gst_percent,
      @hsn_code,
      @barcode_value,
      @stock
    )
  `);

  const importMany = db.transaction((parsedRows) => {
    for (const product of parsedRows) {
      insertStmt.run(product);
    }
  });

  try {
    const productsToInsert = [];

    for (const row of rows) {
      const name = row.name?.trim();
      const category = row.category?.trim();
      const productId = row.product_id?.trim();
      
      const sellingPrice = parseFloat(row.price_selling);
      const taxRate = parseFloat(row.tax_rate);
      
      if (!productId || !name || !category || isNaN(sellingPrice) || isNaN(taxRate)) {
        skipped++;
        continue;
      }

      const stock = parseInt(row.stock, 10);

      const newProduct = {
        product_id: productId,
        name: name,
        category: category,
        sub_category: row.sub_category?.trim() || null,
        brand: row.brand?.trim() || null,
        model_name: row.model_name?.trim() || null,
        unit: row.unit?.trim() || null,
        price: sellingPrice,
        gst_percent: taxRate,
        hsn_code: row.hsn_code?.trim() || null,
        stock: !isNaN(stock) && stock >= 0 ? stock : 0,
      };
      newProduct.barcode_value = generateBarcode(newProduct);

      productsToInsert.push(newProduct);
      imported++;
    }

    if (productsToInsert.length > 0) {
      importMany(productsToInsert);
    }

    return { success: true, imported, skipped };

  } catch (err) {
    console.error("❌ Failed to import products from CSV:", err);
    return { success: false, message: err.message || "An unknown error occurred during the transaction." };
  }
}

function getProductById(id) {
  try {
    const stmt = db.prepare('SELECT * FROM products WHERE id = ?');
    const product = stmt.get(id);
    return product;
  } catch (err) {
    console.error("❌ Failed to get product by ID:", err);
    return null;
  }
}

function getGSTSummary({ startDate, endDate, searchQuery = '' }) {
  try {
    const params = {};
    const where = [];
    if (startDate) { where.push(`date(s.timestamp) >= :startDate`); params.startDate = startDate; }
    if (endDate)   { where.push(`date(s.timestamp) < date(:endDate, '+1 day')`); params.endDate = endDate; }
    if (searchQuery) {
      where.push(`(s.invoice_no LIKE :q OR s.customer_name LIKE :q)`); params.q = `%${searchQuery}%`;
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const stmt = db.prepare(`
      SELECT
        COALESCE(si.hsn_code, 'NA')                           AS hsn_code,
        COALESCE(si.gst_percent, 0)                           AS gst_percent,
        ROUND(SUM(si.taxable_value), 2)                       AS taxable_value,
        ROUND(SUM(si.cgst), 2)                                AS cgst,
        ROUND(SUM(si.sgst), 2)                                AS sgst,
        ROUND(SUM(si.gst_amount), 2)                          AS gst_amount,
        ROUND(SUM(si.taxable_value + si.gst_amount), 2)       AS total
      FROM sales s
      JOIN sale_items si ON si.sale_id = s.id
      ${whereSql}
      GROUP BY hsn_code, gst_percent
      ORDER BY gst_percent, hsn_code
    `);
    const rows = stmt.all(params);
    return { success: true, data: rows };
  } catch (err) {
    console.error('❌ Failed to build GST summary:', err);
    return { success: false, data: [] };
  }
}

function getUniqueSubCategories(categoryOrNull) {
  try {
    const normalize = (s) => (s ?? '').trim();

    let rows;
    if (categoryOrNull && normalize(categoryOrNull)) {
      rows = db.prepare(`
        SELECT DISTINCT TRIM(sub_category) AS sub_category
        FROM products
        WHERE sub_category IS NOT NULL
          AND TRIM(sub_category) != ''
          AND LOWER(TRIM(category)) = LOWER(TRIM(?))
        ORDER BY sub_category
      `).all(categoryOrNull);
    } else {
      rows = db.prepare(`
        SELECT DISTINCT TRIM(sub_category) AS sub_category
        FROM products
        WHERE sub_category IS NOT NULL
          AND TRIM(sub_category) != ''
        ORDER BY sub_category
      `).all();
    }

    // final sanitize + dedupe (belt & suspenders)
    const set = new Set();
    for (const r of rows) {
      const sc = normalize(r.sub_category);
      if (sc) set.add(sc);
    }
    return [...set];
  } catch (err) {
    console.error('❌ getUniqueSubCategories failed:', err);
    return [];
  }
}

function getGSTTotals({ startDate, endDate, searchQuery = '' }) {
  try {
    const params = {};
    const where = [];
    if (startDate) { where.push(`date(s.timestamp) >= :startDate`); params.startDate = startDate; }
    if (endDate)   { where.push(`date(s.timestamp) < date(:endDate, '+1 day')`); params.endDate = endDate; }
    if (searchQuery) {
      where.push(`(s.invoice_no LIKE :q OR s.customer_name LIKE :q)`); params.q = `%${searchQuery}%`;
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const row = db.prepare(`
      SELECT
        ROUND(SUM(si.taxable_value), 2)                             AS total_taxable_value,
        ROUND(SUM(si.gst_amount), 2)                                AS total_gst_amount,
        ROUND(SUM(si.cgst), 2)                                      AS total_cgst,
        ROUND(SUM(si.sgst), 2)                                      AS total_sgst,
        ROUND(SUM(si.taxable_value + si.gst_amount), 2)             AS grand_total
      FROM sales s
      JOIN sale_items si ON si.sale_id = s.id
      ${whereSql}
    `).get(params) || {
      total_taxable_value: 0, total_gst_amount: 0,
      total_cgst: 0, total_sgst: 0, grand_total: 0
    };

    return { success: true, data: row };
  } catch (err) {
    console.error('❌ Failed to compute GST totals:', err);
    return { success: false, data: {
      total_taxable_value: 0, total_gst_amount: 0,
      total_cgst: 0, total_sgst: 0, grand_total: 0
    }};
  }
}

module.exports = {
  db,
  getAllProducts,
  addProduct,
  deleteProduct,
  updateProduct,
  saveSale,
  saveStoreSettings,
  getStoreSettings,
  getDashboardStats,
  getRecentInvoices,
  getInvoiceDetails,
  getInvoices,
  getInvoicesForExport,
  exportDataDump,
  importDataDump,
  importProductsFromCSV,
  getProductById,
  getGSTSummary,
  getUniqueSubCategories,
  getGSTTotals
};
