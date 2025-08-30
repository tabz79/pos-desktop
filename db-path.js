// db-path.js (CommonJS)
const { app } = require('electron');
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

function countRows(file) {
  try {
    const db = new Database(file, { readonly: true });
    const one = (sql) => db.prepare(sql).get()?.c ?? 0;
    const products = one('SELECT COUNT(*) AS c FROM products');
    const sales    = one('SELECT COUNT(*) AS c FROM sales');
    db.close();
    return { products, sales };
  } catch {
    return { products: 0, sales: 0 };
  }
}

function verifyNonEmpty(file) {
  try {
    const db = new Database(file, { readonly: true });
    const row = db.prepare(`
      SELECT
        (SELECT COUNT(*) FROM products) +
        (SELECT COUNT(*) FROM sales) AS t
    `).get();
    db.close();
    return (row?.t ?? 0) > 0;
  } catch {
    return false;
  }
}

function resolvePosDbPath() {
  // 0) Emergency override
  const envDb = process.env.POS_DB_PATH;
  if (envDb && fs.existsSync(envDb)) {
    console.log('[DB] Using POS_DB_PATH override:', envDb);
    return envDb;
  }

  // 1) Old location (beside app)
  const oldDb = path.join(process.cwd(), 'pos.db');

  // 2) New target (userData)
  const userDir = app.getPath('userData');
  fs.mkdirSync(userDir, { recursive: true });
  const newDb = path.join(userDir, 'pos.db');

  const hasOld = fs.existsSync(oldDb);
  const hasNew = fs.existsSync(newDb);

  if (hasOld && !hasNew) {
    console.log('[DB] Only old DB exists. Staying on old for now:', oldDb);
    return oldDb;
  }

  if (hasOld && hasNew) {
    const a = countRows(oldDb);
    const b = countRows(newDb);
    const oldScore = a.products + a.sales;
    const newScore = b.products + b.sales;
    const chosen = oldScore >= newScore ? oldDb : newDb;
    console.log('[DB] Both DBs found. Scores old/new:', oldScore, newScore, '→ Using:', chosen);
    return chosen;
  }

  if (!hasOld && hasNew) {
    console.log('[DB] Only new DB exists. Using:', newDb);
    return newDb;
  }

  console.log('[DB] No DB found. Will create at:', newDb);
  return newDb;
}

function migrateDbToUserData(oldDbPath) {
  const userDir = app.getPath('userData');
  fs.mkdirSync(userDir, { recursive: true });
  const newDb = path.join(userDir, 'pos.db');

  if (!fs.existsSync(oldDbPath)) {
    console.warn('[DB] migrate: old DB missing, nothing to do.');
    return false;
  }

  if (fs.existsSync(newDb) && verifyNonEmpty(newDb)) {
    console.log('[DB] migrate: target already non-empty. Skipping.');
    return true;
  }

  fs.copyFileSync(oldDbPath, newDb);
  if (!verifyNonEmpty(newDb)) {
    try { fs.unlinkSync(newDb); } catch {}
    console.error('[DB] migrate: copy failed verification. Rolled back.');
    return false;
  }

  console.log('[DB] migrate: copied to userData and verified:', newDb);
  return true;
}

module.exports = { resolvePosDbPath, migrateDbToUserData };
