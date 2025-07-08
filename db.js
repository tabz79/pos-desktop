const path = require('path');

let db;
try {
  const Database = require('better-sqlite3');
  const dbPath = path.join(__dirname, 'pos.db');
  db = new Database(dbPath);

  db.prepare(`
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      price REAL NOT NULL,
      stock INTEGER NOT NULL
    )
  `).run();

  console.log("✅ SQLite DB initialized successfully.");
} catch (err) {
  console.error("❌ Failed to load better-sqlite3:", err);
  db = null;
}

module.exports = db;
