const path = require('path');

let db;
try {
  const Database = require('better-sqlite3');
  const dbPath = path.join(__dirname, 'pos.db');
  db = new Database(dbPath);

  db.pragma('foreign_keys = ON');

  // ✅ Create initial products table (for first install only)
  db.prepare(`
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      price REAL NOT NULL,
      stock INTEGER NOT NULL,
      hsn_code TEXT
    )
  `).run();

  // 🛠️ Rebuild products table with category, hsn_code, gst_percent (safe migration)
  try {
    const columns = db.prepare(`PRAGMA table_info(products)`).all();
    const hasCategory = columns.some(col => col.name === 'category');
    const hasGST = columns.some(col => col.name === 'gst_percent');
    const hasProductId = columns.some(col => col.name === 'product_id');
    const hasSubCategory = columns.some(col => col.name === 'sub_category');
    const hasBrand = columns.some(col => col.name === 'brand');
    const hasModelName = columns.some(col => col.name === 'model_name');
    const hasUnit = columns.some(col => col.name === 'unit');
    const hasBarcodeValue = columns.some(col => col.name === 'barcode_value');

    if (!hasCategory || !hasGST || !hasProductId || !hasSubCategory || !hasBrand || !hasModelName || !hasUnit || !hasBarcodeValue) {
      console.log("♻️ Rebuilding products table with new Excel fields...");
      db.exec('PRAGMA foreign_keys = OFF');
      db.prepare(`ALTER TABLE products RENAME TO products_old`).run();
      db.prepare(`
        CREATE TABLE products (
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
        INSERT INTO products (id, name, price, stock, category, hsn_code, gst_percent)
        SELECT id, name, price, stock, category, hsn_code, gst_percent FROM products_old
      `).run();
      db.prepare(`DROP TABLE products_old`).run();
      db.exec('PRAGMA foreign_keys = ON');
      console.log("✅ Products table updated with Excel fields.");
    }
  } catch (err) {
    console.error("❌ Failed to migrate products table:", err);
  }

  // ✅ Create sales table
  db.prepare(`
    CREATE TABLE IF NOT EXISTS sales (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      total REAL NOT NULL,
      timestamp TEXT NOT NULL
    )
  `).run();

  // 🩺 One-time migration from 'created_at' → 'timestamp'
  try {
    const columns = db.prepare(`PRAGMA table_info(sales)`).all();
    const hasCreatedAt = columns.some(col => col.name === 'created_at');
    const hasTimestamp = columns.some(col => col.name === 'timestamp');

    if (hasCreatedAt && !hasTimestamp) {
      db.exec('PRAGMA foreign_keys = OFF');

      db.prepare(`ALTER TABLE sales RENAME TO sales_old`).run();
      db.prepare(`
        CREATE TABLE sales (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          total REAL NOT NULL,
          timestamp TEXT NOT NULL
        )
      `).run();
      db.prepare(`
        INSERT INTO sales (id, total, timestamp)
        SELECT id, total, created_at FROM sales_old
      `).run();
      db.prepare(`DROP TABLE sales_old`).run();

      db.exec('PRAGMA foreign_keys = ON');
      console.log("⚙️ Migrated sales table: renamed 'created_at' to 'timestamp'.");
    }
  } catch (err) {
    console.error("⚠️ Migration check failed:", err);
  }

  // ✅ Recreate sale_items with full GST structure
  try {
    console.log("♻️ Forcing recreation of sale_items table...");
    db.exec('PRAGMA foreign_keys = OFF');

    db.exec('PRAGMA foreign_keys = ON');

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

    console.log("✅ Rebuilt sale_items table with GST columns.");
  } catch (err) {
    console.error("⚠️ Failed updating sale_items table:", err);
  }

  // ✅ Create store_settings table (singleton row)
  db.prepare(`
    CREATE TABLE IF NOT EXISTS store_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      store_name TEXT,
      store_address TEXT
    )
  `).run();

  // ✅ Create invoice_counter table
  db.prepare(`
    CREATE TABLE IF NOT EXISTS invoice_counter (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      current_number INTEGER DEFAULT 0
    )
  `).run();
  // Initialize counter if it doesn't exist
  db.prepare(`INSERT OR IGNORE INTO invoice_counter (id, current_number) VALUES (1, 0)`).run();

  // ✅ Create invoice_daily_counter table
  db.prepare(`
    CREATE TABLE IF NOT EXISTS invoice_daily_counter (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      last_reset_date TEXT NOT NULL,
      current_daily_number INTEGER DEFAULT 0
    )
  `).run();
  // Initialize daily counter if it doesn't exist
  db.prepare(`INSERT OR IGNORE INTO invoice_daily_counter (id, last_reset_date, current_daily_number) VALUES (1, ?, 0)`).run(new Date().toISOString().slice(0, 10));

  console.log("✅ SQLite DB initialized successfully.");
} catch (err) {
  console.error("❌ Failed to load better-sqlite3:", err);
  db = null;
}

// ✅ Get all products
function getAllProducts() {
  const stmt = db.prepare('SELECT * FROM products ORDER BY id DESC');
  return stmt.all();
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
  try {
    const {
      invoice_no,
      timestamp,
      payment_method,
      customer_name,
      customer_phone,
      customer_gstin,
      items
    } = saleData;

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

    // 🧠 Auto-add columns to sales if not present
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
        console.log(`✅ Added column to sales: ${col.name}`);
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
      invoice_no, // Use the provided invoice number
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

    const insertMany = db.transaction((items) => {
      for (const i of items) {
        insertItem.run(
          saleId,
          i.product_id || null, // Use the generated product_id string
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
          db.prepare(`UPDATE products SET stock = stock - ? WHERE id = ?`)
            .run(i.quantity, i.id);
        }
      }
    });

    insertMany(enrichedItems);

    return {
      success: true,
      sale_id: saleId,
      invoice_no: invoice_no // Send back the provided invoice number
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

// 🧠 Safe schema patch for store_settings (runs only if columns are missing)
try {
  const storeCols = db.prepare(`PRAGMA table_info(store_settings)`).all().map(c => c.name);
  const neededCols = [
    { name: 'store_subtitle', type: 'TEXT' },
    { name: 'store_phone', type: 'TEXT' },
    { name: 'store_gstin', type: 'TEXT' },
    { name: 'store_footer', type: 'TEXT' },
    { name: 'store_fssai', type: 'TEXT' }
  ];

  neededCols.forEach(col => {
    if (!storeCols.includes(col.name)) {
      db.prepare(`ALTER TABLE store_settings ADD COLUMN ${col.name} ${col.type}`).run();
      console.log(`✅ Added column: ${col.name} to store_settings`);
    }
  });
} catch (err) {
  console.error("❌ Failed to patch store_settings schema:", err);
}
// ✅ Save or update the singleton store settings
function saveStoreSettings(payload) {
  try {
    const exists = db.prepare('SELECT COUNT(*) as count FROM store_settings WHERE id = 1').get();
    if (exists.count > 0) {
      db.prepare(`
        UPDATE store_settings
        SET store_name = ?, store_address = ?, store_subtitle = ?, store_phone = ?, store_gstin = ?, store_footer = ?, store_fssai = ?
        WHERE id = 1
      `).run(
        payload.store_name || '',
        payload.store_address || '',
        payload.store_subtitle || '',
        payload.store_phone || '',
        payload.store_gstin || '',
        payload.store_footer || '',
        payload.store_fssai || ''
      );
    } else {
      db.prepare(`
        INSERT INTO store_settings (id, store_name, store_address, store_subtitle, store_phone, store_gstin, store_footer, store_fssai)
        VALUES (1, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        payload.store_name || '',
        payload.store_address || '',
        payload.store_subtitle || '',
        payload.store_phone || '',
        payload.store_gstin || '',
        payload.store_footer || '',
        payload.store_fssai || ''
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
  getInvoices
};