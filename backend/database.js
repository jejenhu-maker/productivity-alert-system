/**
 * ?��??��? 人�??�產?��?警系�? * Database initialization using sql.js (pure JavaScript SQLite)
 * Works without any native build tools.
 */

const path = require('path');
const fs = require('fs');

const DB_DIR = path.join(__dirname, '..', 'database');
const DB_PATH = path.join(DB_DIR, 'productivity.db');

if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

const initSqlJs = require('sql.js');

// Singleton promise for the database
let _dbPromise = null;

function getDb() {
  if (!_dbPromise) {
    _dbPromise = initSqlJs().then(SQL => {
      let db;
      if (fs.existsSync(DB_PATH)) {
        const data = fs.readFileSync(DB_PATH);
        db = new SQL.Database(data);
      } else {
        db = new SQL.Database();
      }

      // Wrap sql.js API to mimic better-sqlite3's synchronous API surface
      const wrapper = createWrapper(db, SQL);
      initSchema(wrapper);
      seedData(wrapper);

      // Persist to disk after every write (wrapped in flush)
      wrapper._flush = () => {
        const data = db.export();
        fs.writeFileSync(DB_PATH, Buffer.from(data));
      };

      console.log('Database ready at:', DB_PATH);
      return wrapper;
    });
  }
  return _dbPromise;
}

/**
 * Create a synchronous-style wrapper around sql.js
 * Mimics the better-sqlite3 API: prepare().all(), .get(), .run()
 */
function createWrapper(db) {
  const wrapper = {
    _db: db,

    exec(sql) {
      db.run(sql);
      persistNow();
    },

    prepare(sql) {
      return {
        all(...params) {
          const flatParams = flattenParams(params);
          const result = [];
          const stmt = db.prepare(sql);
          stmt.bind(flatParams);
          while (stmt.step()) {
            result.push(stmt.getAsObject());
          }
          stmt.free();
          return result;
        },
        get(...params) {
          const flatParams = flattenParams(params);
          const stmt = db.prepare(sql);
          stmt.bind(flatParams);
          let row = null;
          if (stmt.step()) {
            row = stmt.getAsObject();
          }
          stmt.free();
          return row;
        },
        run(...params) {
          const flatParams = flattenParams(params);
          db.run(sql, flatParams);
          // Get last insert rowid and changes
          const meta = db.exec('SELECT last_insert_rowid() as id, changes() as changes');
          const row = meta[0] ? meta[0].values[0] : [0, 0];
          persistNow();
          return { lastInsertRowid: row[0], changes: row[1] };
        },
      };
    },

    transaction(fn) {
      return (...args) => {
        db.run('BEGIN');
        try {
          fn(...args);
          db.run('COMMIT');
          persistNow();
        } catch (e) {
          db.run('ROLLBACK');
          throw e;
        }
      };
    },

    pragma(sql) {
      try { db.run(`PRAGMA ${sql}`); } catch(e) {}
    },
  };

  let persistTimer = null;
  function persistNow() {
    // Debounce disk writes: write at most once every 200ms
    clearTimeout(persistTimer);
    persistTimer = setTimeout(() => {
      const data = db.export();
      fs.writeFileSync(DB_PATH, Buffer.from(data));
    }, 200);
  }

  return wrapper;
}

function flattenParams(params) {
  if (params.length === 0) return [];
  // If single array arg, use it directly
  if (params.length === 1 && Array.isArray(params[0])) return params[0];
  // Otherwise spread all scalar args
  return params.map(p => p === undefined ? null : p);
}

function initSchema(db) {
  // Migration: add gross margin columns if missing
  try {
    const cols = db.prepare("PRAGMA table_info(monthly_data)").all();
    const colNames = cols.map(c => c.name);
    if (!colNames.includes('estimated_gross_margin')) {
      db._db.run('ALTER TABLE monthly_data ADD COLUMN estimated_gross_margin REAL');
      console.log('Migration: added estimated_gross_margin column');
    }
    if (!colNames.includes('actual_gross_margin')) {
      db._db.run('ALTER TABLE monthly_data ADD COLUMN actual_gross_margin REAL');
      console.log('Migration: added actual_gross_margin column');
    }
  } catch (e) {
    // Table might not exist yet, will be created below
  }

  // Migration: rename 正職 → 門市人員
  try {
    db._db.run("UPDATE employees SET position = '門市人員' WHERE position = '正職'");
  } catch (e) {
    // Table might not exist yet, will be created below
  }

  db._db.run(`
    CREATE TABLE IF NOT EXISTS stores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      code TEXT NOT NULL UNIQUE,
      target_productivity REAL NOT NULL DEFAULT 5000,
      status TEXT NOT NULL DEFAULT 'active',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS employees (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      store_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      position TEXT NOT NULL,
      hire_date DATE NOT NULL,
      seniority_years REAL NOT NULL DEFAULT 0,
      hourly_rate REAL NOT NULL DEFAULT 200,
      active INTEGER NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS monthly_data (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      store_id INTEGER NOT NULL,
      year INTEGER NOT NULL,
      month INTEGER NOT NULL,
      estimated_hours REAL,
      estimated_revenue REAL,
      actual_hours REAL,
      actual_revenue REAL,
      estimated_gross_margin REAL,
      actual_gross_margin REAL,
      submitted_by TEXT,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(store_id, year, month)
    );
    CREATE TABLE IF NOT EXISTS alert_thresholds (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      metric TEXT NOT NULL UNIQUE,
      green_min REAL NOT NULL,
      yellow_min REAL NOT NULL,
      red_min REAL NOT NULL,
      description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

function seedData(db) {
  // Seed stores
  const storeCount = db.prepare('SELECT COUNT(*) as cnt FROM stores').get();
  if (!storeCount || storeCount.cnt === 0) {
    const stores = [
      ['?��?�?, 'XA', 5000],
      ['學士�?, 'XS', 4800],
      ['大墩�?, 'DD', 5200],
      ['太平�?, 'TP', 4500],
      ['?�艦�?, 'QJ', 6000],
      ['?��?�?, 'JH', 5100],
      ['Sogo�?, 'SG', 5500],
      ['?�山�?, 'DS', 4700],
    ];
    for (const [name, code, target] of stores) {
      db.prepare(
        "INSERT OR IGNORE INTO stores (name, code, target_productivity, status) VALUES (?, ?, ?, 'active')"
      ).run(name, code, target);
    }
    console.log('Stores seeded.');
  }

  // Seed thresholds
  const thCount = db.prepare('SELECT COUNT(*) as cnt FROM alert_thresholds').get();
  if (!thCount || thCount.cnt === 0) {
    db.prepare(
      "INSERT OR IGNORE INTO alert_thresholds (metric, green_min, yellow_min, red_min, description) VALUES (?, ?, ?, ?, ?)"
    ).run('productivity_ratio', 100, 70, 0, '?�產?��??��? (%) - 綠色>=100%, 黃色70-99%, 紅色<70%');
    db.prepare(
      "INSERT OR IGNORE INTO alert_thresholds (metric, green_min, yellow_min, red_min, description) VALUES (?, ?, ?, ?, ?)"
    ).run('cost_ratio', 0, 20, 30, '人�??�本比�? (%) - 綠色<20%, 黃色20-29%, 紅色>=30%');
    console.log('Alert thresholds seeded.');
  }

  // Seed employees
  const empCount = db.prepare('SELECT COUNT(*) as cnt FROM employees').get();
  if (!empCount || empCount.cnt === 0) {
    const employees = [
      [1, '?��???, '店長',  '2019-03-15', 5.0, 320],
      [1, '?��???, '?�師',  '2020-07-01', 3.7, 300],
      [1, '黃建�?, '�?��',  '2022-01-10', 2.2, 200],
      [1, '?��???, '?�職',  '2023-06-01', 0.8, 175],
      [2, '?�大??, '店長',  '2018-09-01', 5.5, 320],
      [2, '張�???, '?�師',  '2021-04-15', 2.9, 300],
      [2, '?��???, '�?��',  '2022-08-20', 1.6, 200],
      [2, '?��?�?, '?�職',  '2024-01-05', 0.2, 175],
      [3, '?��???, '店長',  '2017-05-10', 6.8, 320],
      [3, '?��???, '?��???,'2019-11-20', 4.3, 280],
      [3, '許�?�?, '?�師',  '2020-09-15', 3.5, 300],
      [3, '?��???, '�?��',  '2023-03-01', 1.1, 200],
      [4, '洪�???, '店長',  '2020-02-01', 4.1, 320],
      [4, '楊�???, '?�師',  '2021-10-10', 2.4, 300],
      [4, '謝�???, '�?��',  '2023-05-15', 0.9, 200],
      [4, '?�建??, '?�職',  '2023-08-01', 0.6, 175],
      [5, '江�???, '店長',  '2016-08-01', 7.6, 320],
      [5, '?��?�?, '?��???,'2018-12-15', 5.2, 280],
      [5, '?��?�?, '?�師',  '2019-06-01', 4.8, 300],
      [5, '?�怡�?', '�?��',  '2021-03-20', 3.0, 200],
      [5, '?��?�?, '�?��',  '2022-09-10', 1.5, 200],
      [6, '黃�???, '店長',  '2019-01-15', 5.2, 320],
      [6, '?�大??, '?�師',  '2020-11-01', 3.4, 300],
      [6, '?��???, '�?��',  '2022-05-10', 1.9, 200],
      [6, '張�???, '?�職',  '2023-11-01', 0.4, 175],
      [7, '?��?�?, '店長',  '2018-04-01', 6.0, 320],
      [7, '?�佳�?, '?��???,'2020-07-15', 3.7, 280],
      [7, '?�怡�?', '?�師',  '2021-01-20', 3.2, 300],
      [7, '許�?�?, '�?��',  '2022-10-05', 1.4, 200],
      [8, '?��???, '店長',  '2020-06-01', 3.8, 320],
      [8, '?��???, '?�師',  '2021-08-15', 2.6, 300],
      [8, '?�建�?, '�?��',  '2023-01-10', 1.2, 200],
      [8, '徐�???, '?�職',  '2024-02-01', 0.1, 175],
    ];
    for (const [store_id, name, position, hire_date, seniority_years, hourly_rate] of employees) {
      db.prepare(
        'INSERT OR IGNORE INTO employees (store_id, name, position, hire_date, seniority_years, hourly_rate, active) VALUES (?,?,?,?,?,?,1)'
      ).run(store_id, name, position, hire_date, seniority_years, hourly_rate);
    }
    console.log('Employees seeded.');
  }

  // Seed monthly data
  const monthlyCount = db.prepare('SELECT COUNT(*) as cnt FROM monthly_data').get();
  if (!monthlyCount || monthlyCount.cnt === 0) {
    const now = new Date();
    const months = [];
    for (let i = 2; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({ year: d.getFullYear(), month: d.getMonth() + 1 });
    }

    const storeBaseData = [
      { store_id: 1, baseHours: 320, baseRevenue: 1680000 },
      { store_id: 2, baseHours: 300, baseRevenue: 1490000 },
      { store_id: 3, baseHours: 380, baseRevenue: 2020000 },
      { store_id: 4, baseHours: 280, baseRevenue: 1290000 },
      { store_id: 5, baseHours: 480, baseRevenue: 2980000 },
      { store_id: 6, baseHours: 340, baseRevenue: 1750000 },
      { store_id: 7, baseHours: 400, baseRevenue: 2250000 },
      { store_id: 8, baseHours: 290, baseRevenue: 1380000 },
    ];

    const variations = [
      [0.95, 0.97, 0.93, 0.88, 1.02, 0.96, 0.91, 0.99],
      [1.00, 1.02, 0.98, 1.03, 1.05, 1.00, 0.97, 0.95],
      [1.03, 1.05, 1.07, 1.01, 1.08, 1.04, 1.02, 1.01],
    ];

    months.forEach((m, mi) => {
      storeBaseData.forEach((s, si) => {
        const v = variations[mi][si];
        const estHrs = Math.round(s.baseHours * (0.97 + 0.03 * si / 8));
        const estRev = Math.round(s.baseRevenue * v);
        const actHrs = Math.round(estHrs * 0.97);
        const actRev = Math.round(estRev * 0.99);
        db.prepare(
          `INSERT OR IGNORE INTO monthly_data
           (store_id, year, month, estimated_hours, estimated_revenue, actual_hours, actual_revenue, submitted_by, notes)
           VALUES (?,?,?,?,?,?,?,'系統?��???,'?��?範�?資�?')`
        ).run(s.store_id, m.year, m.month, estHrs, estRev, actHrs, actRev);
      });
    });
    console.log('Monthly data seeded.');
  }
}

// Export the getDb function
module.exports = getDb;
