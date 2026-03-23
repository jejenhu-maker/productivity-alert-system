-- 瑞昌藥局 人時生產力預警系統 資料庫結構
-- Database Schema for Ruichang Pharmacy Productivity Alert System

PRAGMA foreign_keys = ON;

-- =============================================
-- Table: stores (門市資料)
-- =============================================
CREATE TABLE IF NOT EXISTS stores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  target_productivity REAL NOT NULL DEFAULT 5000,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'inactive')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- =============================================
-- Table: employees (員工資料)
-- =============================================
CREATE TABLE IF NOT EXISTS employees (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  store_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  position TEXT NOT NULL CHECK(position IN ('店長', '副店長', '藥師', '正職', '兼職')),
  hire_date DATE NOT NULL,
  seniority_years REAL NOT NULL DEFAULT 0,
  hourly_rate REAL NOT NULL DEFAULT 200,
  active INTEGER NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE
);

-- =============================================
-- Table: monthly_data (每月資料)
-- =============================================
CREATE TABLE IF NOT EXISTS monthly_data (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  store_id INTEGER NOT NULL,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL,
  estimated_hours REAL,
  estimated_revenue REAL,
  actual_hours REAL,
  actual_revenue REAL,
  submitted_by TEXT,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(store_id, year, month),
  FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE
);

-- =============================================
-- Table: alert_thresholds (預警門檻值)
-- =============================================
CREATE TABLE IF NOT EXISTS alert_thresholds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  metric TEXT NOT NULL UNIQUE,
  green_min REAL NOT NULL,
  yellow_min REAL NOT NULL,
  red_min REAL NOT NULL,
  description TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- =============================================
-- Initial Data: Stores (門市初始資料)
-- =============================================
INSERT OR IGNORE INTO stores (name, code, target_productivity, status) VALUES
  ('興安店', 'XA', 5000, 'active'),
  ('學士店', 'XS', 4800, 'active'),
  ('大墩店', 'DD', 5200, 'active'),
  ('太平店', 'TP', 4500, 'active'),
  ('旗艦店', 'QJ', 6000, 'active'),
  ('進化店', 'JH', 5100, 'active'),
  ('Sogo店', 'SG', 5500, 'active'),
  ('東山店', 'DS', 4700, 'active');

-- =============================================
-- Initial Data: Alert Thresholds (預警門檻初始值)
-- =============================================
INSERT OR IGNORE INTO alert_thresholds (metric, green_min, yellow_min, red_min, description) VALUES
  ('productivity_ratio', 100, 70, 0, '生產力達成率 (%) - 綠色>=100%, 黃色70-99%, 紅色<70%'),
  ('cost_ratio', 0, 20, 30, '人力成本比率 (%) - 綠色<20%, 黃色20-29%, 紅色>=30%');

-- =============================================
-- Initial Data: Employees (員工初始資料)
-- =============================================
-- 興安店 employees
INSERT OR IGNORE INTO employees (store_id, name, position, hire_date, seniority_years, hourly_rate, active) VALUES
  (1, '陳志明', '店長', '2019-03-15', 5.0, 320, 1),
  (1, '林美玲', '藥師', '2020-07-01', 3.7, 300, 1),
  (1, '黃建宏', '正職', '2022-01-10', 2.2, 200, 1),
  (1, '吳珊珊', '兼職', '2023-06-01', 0.8, 175, 1);

-- 學士店 employees
INSERT OR IGNORE INTO employees (store_id, name, position, hire_date, seniority_years, hourly_rate, active) VALUES
  (2, '王大偉', '店長', '2018-09-01', 5.5, 320, 1),
  (2, '張淑芬', '藥師', '2021-04-15', 2.9, 300, 1),
  (2, '李明哲', '正職', '2022-08-20', 1.6, 200, 1),
  (2, '周雅婷', '兼職', '2024-01-05', 0.2, 175, 1);

-- 大墩店 employees
INSERT OR IGNORE INTO employees (store_id, name, position, hire_date, seniority_years, hourly_rate, active) VALUES
  (3, '劉文雄', '店長', '2017-05-10', 6.8, 320, 1),
  (3, '蔡秀蘭', '副店長', '2019-11-20', 4.3, 280, 1),
  (3, '許志豪', '藥師', '2020-09-15', 3.5, 300, 1),
  (3, '鄭雅文', '正職', '2023-03-01', 1.1, 200, 1);

-- 太平店 employees
INSERT OR IGNORE INTO employees (store_id, name, position, hire_date, seniority_years, hourly_rate, active) VALUES
  (4, '洪美英', '店長', '2020-02-01', 4.1, 320, 1),
  (4, '楊俊傑', '藥師', '2021-10-10', 2.4, 300, 1),
  (4, '謝宜靜', '正職', '2023-05-15', 0.9, 200, 1),
  (4, '邱建國', '兼職', '2023-08-01', 0.6, 175, 1);

-- 旗艦店 employees
INSERT OR IGNORE INTO employees (store_id, name, position, hire_date, seniority_years, hourly_rate, active) VALUES
  (5, '江志成', '店長', '2016-08-01', 7.6, 320, 1),
  (5, '方淑媛', '副店長', '2018-12-15', 5.2, 280, 1),
  (5, '林俊宏', '藥師', '2019-06-01', 4.8, 300, 1),
  (5, '陳怡君', '正職', '2021-03-20', 3.0, 200, 1),
  (5, '吳嘉豪', '正職', '2022-09-10', 1.5, 200, 1);

-- 進化店 employees
INSERT OR IGNORE INTO employees (store_id, name, position, hire_date, seniority_years, hourly_rate, active) VALUES
  (6, '黃淑華', '店長', '2019-01-15', 5.2, 320, 1),
  (6, '蘇大明', '藥師', '2020-11-01', 3.4, 300, 1),
  (6, '李雅琴', '正職', '2022-05-10', 1.9, 200, 1),
  (6, '張文昌', '兼職', '2023-11-01', 0.4, 175, 1);

-- Sogo店 employees
INSERT OR IGNORE INTO employees (store_id, name, position, hire_date, seniority_years, hourly_rate, active) VALUES
  (7, '陳俊豪', '店長', '2018-04-01', 6.0, 320, 1),
  (7, '林佳穎', '副店長', '2020-07-15', 3.7, 280, 1),
  (7, '王怡萍', '藥師', '2021-01-20', 3.2, 300, 1),
  (7, '許明德', '正職', '2022-10-05', 1.4, 200, 1);

-- 東山店 employees
INSERT OR IGNORE INTO employees (store_id, name, position, hire_date, seniority_years, hourly_rate, active) VALUES
  (8, '吳文哲', '店長', '2020-06-01', 3.8, 320, 1),
  (8, '鄭美珠', '藥師', '2021-08-15', 2.6, 300, 1),
  (8, '葉建志', '正職', '2023-01-10', 1.2, 200, 1),
  (8, '徐雅雯', '兼職', '2024-02-01', 0.1, 175, 1);
