/**
 * Employee CRUD Routes
 */
const express = require('express');
const router = express.Router();
const db = require('../database');
const { validateEmployee, getEmployeeWeight, getSeniorityWeight, getPositionWeight } = require('../middleware/validator');

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

    const employees = db.prepare(query).all(...params);

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

// GET /api/employees/:id - Get single employee
router.get('/:id', (req, res) => {
  try {
    const emp = db.prepare(`
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
    const store = db.prepare('SELECT id FROM stores WHERE id = ?').get(Number(store_id));
    if (!store) return res.status(400).json({ success: false, message: '指定門市不存在' });

    const result = db.prepare(`
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

    const newEmp = db.prepare(`
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
    const existing = db.prepare('SELECT * FROM employees WHERE id = ?').get(id);
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

    db.prepare(`
      UPDATE employees
      SET store_id=?, name=?, position=?, hire_date=?, seniority_years=?,
          hourly_rate=?, active=?, updated_at=CURRENT_TIMESTAMP
      WHERE id=?
    `).run(updatedStoreId, updatedName, updatedPosition, updatedHireDate,
           updatedSeniority, updatedHourlyRate, updatedActive, id);

    const updated = db.prepare(`
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
    const existing = db.prepare('SELECT * FROM employees WHERE id = ?').get(id);
    if (!existing) return res.status(404).json({ success: false, message: '員工不存在' });

    // Soft delete: set active = 0
    db.prepare('UPDATE employees SET active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(id);

    res.json({ success: true, message: '員工已停用' });
  } catch (err) {
    console.error('DELETE /employees/:id error:', err);
    res.status(500).json({ success: false, message: '伺服器錯誤', error: err.message });
  }
});

module.exports = router;
