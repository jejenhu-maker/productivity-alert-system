/**
 * Employee CRUD Routes
 */
const express = require('express');
const router = express.Router();
const multer = require('multer');
const XLSX = require('xlsx');
const { validateEmployee, getEmployeeWeight, getSeniorityWeight, getPositionWeight } = require('../middleware/validator');

// Multer setup for file upload (memory storage)
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// GET /api/employees - List all employees (optionally filter by store_id)
router.get('/', (req, res) => {
  try {
    const { store_id, active } = req.query;
    let query = `
      SELECT e.*,
             s.name as store_name,
             s.code as store_code
      FROM employees e
      JOIN stores s ON e.store_id = s.id
      WHERE 1=1
    `;
    const params = [];

    if (store_id) {
      query += ' AND e.store_id = ?';
      params.push(Number(store_id));
    }
    if (active !== undefined) {
      query += ' AND e.active = ?';
      params.push(Number(active));
    }
    query += ' ORDER BY s.name, e.position, e.name';

    const employees = req.db.prepare(query).all(...params);

    // Add computed weight
    const enriched = employees.map(emp => ({
      ...emp,
      seniority_weight: getSeniorityWeight(emp.seniority_years),
      position_weight: getPositionWeight(emp.position),
      total_weight: parseFloat(getEmployeeWeight(emp.seniority_years, emp.position).toFixed(3)),
    }));

    res.json({ success: true, data: enriched });
  } catch (err) {
    console.error('GET /employees error:', err);
    res.status(500).json({ success: false, message: '伺服器錯誤', error: err.message });
  }
});

// =============================================
// EXPORT: GET /api/employees/export
// (Must be before /:id to avoid route conflict)
// =============================================
router.get('/export', (req, res) => {
  try {
    const employees = req.db.prepare(`
      SELECT e.id, e.name, s.name as store_name, s.code as store_code, e.position,
             e.hire_date, e.seniority_years, e.hourly_rate, e.active
      FROM employees e
      JOIN stores s ON e.store_id = s.id
      ORDER BY s.name, e.position, e.name
    `).all();

    const exportData = employees.map(emp => ({
      '員工ID': emp.id,
      '員工姓名': emp.name,
      '門市名稱': emp.store_name,
      '門市代碼': emp.store_code,
      '職位': emp.position,
      '到職日期': emp.hire_date,
      '年資(年)': emp.seniority_years,
      '時薪(NT$)': emp.hourly_rate,
      '狀態': emp.active === 1 ? '啟用' : '停用',
      '年資加權': getSeniorityWeight(emp.seniority_years),
      '職位加權': getPositionWeight(emp.position),
      '總加權係數': parseFloat(getEmployeeWeight(emp.seniority_years, emp.position).toFixed(3)),
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    ws['!cols'] = [
      { wch: 8 }, { wch: 12 }, { wch: 10 }, { wch: 8 }, { wch: 8 },
      { wch: 12 }, { wch: 8 }, { wch: 10 }, { wch: 6 },
      { wch: 8 }, { wch: 8 }, { wch: 10 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '員工資料');

    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=employees_${new Date().toISOString().slice(0,10)}.xlsx`);
    res.send(Buffer.from(buf));
  } catch (err) {
    console.error('GET /employees/export error:', err);
    res.status(500).json({ success: false, message: '匯出失敗', error: err.message });
  }
});

// GET /api/employees/:id - Get single employee
router.get('/:id', (req, res) => {
  try {
    const emp = req.db.prepare(`
      SELECT e.*, s.name as store_name, s.code as store_code
      FROM employees e
      JOIN stores s ON e.store_id = s.id
      WHERE e.id = ?
    `).get(Number(req.params.id));

    if (!emp) return res.status(404).json({ success: false, message: '員工不存在' });

    res.json({
      success: true,
      data: {
        ...emp,
        seniority_weight: getSeniorityWeight(emp.seniority_years),
        position_weight: getPositionWeight(emp.position),
        total_weight: parseFloat(getEmployeeWeight(emp.seniority_years, emp.position).toFixed(3)),
      }
    });
  } catch (err) {
    console.error('GET /employees/:id error:', err);
    res.status(500).json({ success: false, message: '伺服器錯誤', error: err.message });
  }
});

// POST /api/employees - Create employee
router.post('/', validateEmployee, (req, res) => {
  try {
    const { store_id, name, position, hire_date, seniority_years, hourly_rate, active } = req.body;

    // Verify store exists
    const store = req.db.prepare('SELECT id FROM stores WHERE id = ?').get(Number(store_id));
    if (!store) return res.status(400).json({ success: false, message: '指定門市不存在' });

    const result = req.db.prepare(`
      INSERT INTO employees (store_id, name, position, hire_date, seniority_years, hourly_rate, active)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      Number(store_id),
      String(name).trim(),
      position,
      hire_date,
      Number(seniority_years) || 0,
      Number(hourly_rate) || 200,
      active !== undefined ? Number(active) : 1
    );

    const newEmp = req.db.prepare(`
      SELECT e.*, s.name as store_name FROM employees e
      JOIN stores s ON e.store_id = s.id WHERE e.id = ?
    `).get(result.lastInsertRowid);

    res.status(201).json({
      success: true,
      message: '員工已新增',
      data: {
        ...newEmp,
        total_weight: parseFloat(getEmployeeWeight(newEmp.seniority_years, newEmp.position).toFixed(3)),
      }
    });
  } catch (err) {
    console.error('POST /employees error:', err);
    if (err.message.includes('UNIQUE')) {
      return res.status(409).json({ success: false, message: '資料重複' });
    }
    res.status(500).json({ success: false, message: '伺服器錯誤', error: err.message });
  }
});

// PUT /api/employees/:id - Update employee
router.put('/:id', (req, res) => {
  try {
    const id = Number(req.params.id);
    const existing = req.db.prepare('SELECT * FROM employees WHERE id = ?').get(id);
    if (!existing) return res.status(404).json({ success: false, message: '員工不存在' });

    const { store_id, name, position, hire_date, seniority_years, hourly_rate, active } = req.body;

    const updatedStoreId = store_id !== undefined ? Number(store_id) : existing.store_id;
    const updatedName = name !== undefined ? String(name).trim() : existing.name;
    const updatedPosition = position !== undefined ? position : existing.position;
    const updatedHireDate = hire_date !== undefined ? hire_date : existing.hire_date;
    const updatedSeniority = seniority_years !== undefined ? Number(seniority_years) : existing.seniority_years;
    const updatedHourlyRate = hourly_rate !== undefined ? Number(hourly_rate) : existing.hourly_rate;
    const updatedActive = active !== undefined ? Number(active) : existing.active;

    // Validate position if provided
    if (position && !['店長', '副店長', '藥師', '正職', '兼職'].includes(position)) {
      return res.status(400).json({ success: false, message: '無效的職位' });
    }

    req.db.prepare(`
      UPDATE employees
      SET store_id=?, name=?, position=?, hire_date=?, seniority_years=?,
          hourly_rate=?, active=?, updated_at=CURRENT_TIMESTAMP
      WHERE id=?
    `).run(updatedStoreId, updatedName, updatedPosition, updatedHireDate,
           updatedSeniority, updatedHourlyRate, updatedActive, id);

    const updated = req.db.prepare(`
      SELECT e.*, s.name as store_name FROM employees e
      JOIN stores s ON e.store_id = s.id WHERE e.id = ?
    `).get(id);

    res.json({
      success: true,
      message: '員工資料已更新',
      data: {
        ...updated,
        total_weight: parseFloat(getEmployeeWeight(updated.seniority_years, updated.position).toFixed(3)),
      }
    });
  } catch (err) {
    console.error('PUT /employees/:id error:', err);
    res.status(500).json({ success: false, message: '伺服器錯誤', error: err.message });
  }
});

// DELETE /api/employees/:id - Delete employee (soft delete)
router.delete('/:id', (req, res) => {
  try {
    const id = Number(req.params.id);
    const existing = req.db.prepare('SELECT * FROM employees WHERE id = ?').get(id);
    if (!existing) return res.status(404).json({ success: false, message: '員工不存在' });

    // Soft delete: set active = 0
    req.db.prepare('UPDATE employees SET active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(id);

    res.json({ success: true, message: '員工已停用' });
  } catch (err) {
    console.error('DELETE /employees/:id error:', err);
    res.status(500).json({ success: false, message: '伺服器錯誤', error: err.message });
  }
});

// =============================================
// IMPORT: POST /api/employees/import
// mode=replace → 先清空所有員工再匯入
// mode=merge (default) → 依員工ID更新或新增
// =============================================
router.post('/import', upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: '請上傳檔案' });
    }

    const mode = req.body.mode || req.query.mode || 'merge';

    // Replace mode: hard delete all employees first
    if (mode === 'replace') {
      req.db.prepare('DELETE FROM employees').run();
      console.log('Import replace mode: all employees deleted');
    }

    const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws);

    if (rows.length === 0) {
      return res.status(400).json({ success: false, message: '檔案中無資料' });
    }

    // Build store code → id map
    const stores = req.db.prepare('SELECT id, code, name FROM stores').all();
    const storeByCode = {};
    const storeByName = {};
    stores.forEach(s => {
      storeByCode[s.code] = s.id;
      storeByName[s.name] = s.id;
    });

    const validPositions = ['店長', '副店長', '藥師', '正職', '兼職'];
    const errors = [];
    let updated = 0;
    let created = 0;
    let skipped = 0;

    rows.forEach((row, idx) => {
      const rowNum = idx + 2; // Excel row (header is row 1)
      const rowErrors = [];

      // Parse fields (support both Chinese and English headers)
      const empId = row['員工ID'] || row['id'];
      const name = (row['員工姓名'] || row['name'] || '').toString().trim();
      const storeCode = (row['門市代碼'] || row['store_code'] || '').toString().trim();
      const storeName = (row['門市名稱'] || row['store_name'] || '').toString().trim();
      const position = (row['職位'] || row['position'] || '').toString().trim();
      const hireDate = (row['到職日期'] || row['hire_date'] || '').toString().trim();
      const seniority = parseFloat(row['年資(年)'] || row['seniority_years']);
      const hourlyRate = parseFloat(row['時薪(NT$)'] || row['hourly_rate']);
      const activeStr = (row['狀態'] || row['active'] || '啟用').toString().trim();
      const active = (activeStr === '停用' || activeStr === '0') ? 0 : 1;

      // Validate
      if (!name) rowErrors.push('姓名為空');

      // Resolve store
      let storeId = storeByCode[storeCode] || storeByName[storeName];
      if (!storeId) rowErrors.push(`找不到門市: ${storeCode || storeName || '(空)'}`);

      if (position && !validPositions.includes(position)) {
        rowErrors.push(`無效職位: ${position}`);
      }
      if (!position) rowErrors.push('職位為空');

      if (hireDate && !/^\d{4}-\d{2}-\d{2}$/.test(hireDate)) {
        rowErrors.push(`到職日期格式錯誤: ${hireDate}`);
      }
      if (!hireDate) rowErrors.push('到職日期為空');

      if (isNaN(seniority) || seniority < 0) rowErrors.push('年資無效');
      if (isNaN(hourlyRate) || hourlyRate <= 0) rowErrors.push('時薪無效');

      if (rowErrors.length > 0) {
        errors.push({ row: rowNum, name: name || '(空)', errors: rowErrors });
        skipped++;
        return;
      }

      // Upsert
      if (empId) {
        // Try update existing
        const existing = req.db.prepare('SELECT id FROM employees WHERE id = ?').get(Number(empId));
        if (existing) {
          req.db.prepare(`
            UPDATE employees
            SET store_id=?, name=?, position=?, hire_date=?, seniority_years=?,
                hourly_rate=?, active=?, updated_at=CURRENT_TIMESTAMP
            WHERE id=?
          `).run(storeId, name, position, hireDate, seniority, hourlyRate, active, Number(empId));
          updated++;
          return;
        }
      }

      // Create new
      req.db.prepare(`
        INSERT INTO employees (store_id, name, position, hire_date, seniority_years, hourly_rate, active)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(storeId, name, position, hireDate, seniority, hourlyRate, active);
      created++;
    });

    res.json({
      success: true,
      message: `匯入完成: 新增 ${created} 筆、更新 ${updated} 筆、跳過 ${skipped} 筆`,
      summary: { total: rows.length, created, updated, skipped },
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err) {
    console.error('POST /employees/import error:', err);
    res.status(500).json({ success: false, message: '匯入失敗: ' + err.message });
  }
});

module.exports = router;
