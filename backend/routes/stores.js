/**
 * Store CRUD Routes
 */
const express = require('express');
const router = express.Router();
const { validateStore } = require('../middleware/validator');

// GET /api/stores - List all stores
router.get('/', (req, res) => {
  try {
    const stores = req.db.prepare(`
      SELECT s.*,
             COUNT(DISTINCT CASE WHEN e.active=1 THEN e.id END) as employee_count
      FROM stores s
      LEFT JOIN employees e ON e.store_id = s.id
      GROUP BY s.id
      ORDER BY s.id
    `).all();
    res.json({ success: true, data: stores });
  } catch (err) {
    console.error('GET /stores error:', err);
    res.status(500).json({ success: false, message: '伺服器錯誤', error: err.message });
  }
});

// GET /api/stores/:id - Single store
router.get('/:id', (req, res) => {
  try {
    const store = req.db.prepare(`
      SELECT s.*,
             COUNT(DISTINCT CASE WHEN e.active=1 THEN e.id END) as employee_count
      FROM stores s
      LEFT JOIN employees e ON e.store_id = s.id
      WHERE s.id = ?
      GROUP BY s.id
    `).get(Number(req.params.id));

    if (!store) return res.status(404).json({ success: false, message: '門市不存在' });

    const employees = req.db.prepare(`
      SELECT * FROM employees WHERE store_id = ? AND active = 1
      ORDER BY position, name
    `).all(Number(req.params.id));

    res.json({ success: true, data: { ...store, employees } });
  } catch (err) {
    console.error('GET /stores/:id error:', err);
    res.status(500).json({ success: false, message: '伺服器錯誤', error: err.message });
  }
});

// POST /api/stores - Create store
router.post('/', validateStore, (req, res) => {
  try {
    const { name, code, target_productivity, status } = req.body;

    // Check unique code
    const existing = req.db.prepare('SELECT id FROM stores WHERE code = ?').get(String(code).trim().toUpperCase());
    if (existing) return res.status(409).json({ success: false, message: '門市代碼已存在' });

    const result = req.db.prepare(`
      INSERT INTO stores (name, code, target_productivity, status)
      VALUES (?, ?, ?, ?)
    `).run(
      String(name).trim(),
      String(code).trim().toUpperCase(),
      Number(target_productivity) || 5000,
      ['active', 'inactive'].includes(status) ? status : 'active'
    );

    const newStore = req.db.prepare('SELECT * FROM stores WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json({ success: true, message: '門市已新增', data: newStore });
  } catch (err) {
    console.error('POST /stores error:', err);
    res.status(500).json({ success: false, message: '伺服器錯誤', error: err.message });
  }
});

// PUT /api/stores/:id - Update store
router.put('/:id', (req, res) => {
  try {
    const id = Number(req.params.id);
    const existing = req.db.prepare('SELECT * FROM stores WHERE id = ?').get(id);
    if (!existing) return res.status(404).json({ success: false, message: '門市不存在' });

    const { name, code, target_productivity, status } = req.body;

    const updatedName = name !== undefined ? String(name).trim() : existing.name;
    const updatedCode = code !== undefined ? String(code).trim().toUpperCase() : existing.code;
    const updatedTarget = target_productivity !== undefined ? Number(target_productivity) : existing.target_productivity;
    const updatedStatus = status !== undefined && ['active', 'inactive'].includes(status) ? status : existing.status;

    // Check code uniqueness if changed
    if (updatedCode !== existing.code) {
      const codeExists = req.db.prepare('SELECT id FROM stores WHERE code = ? AND id != ?').get(updatedCode, id);
      if (codeExists) return res.status(409).json({ success: false, message: '門市代碼已存在' });
    }

    req.db.prepare(`
      UPDATE stores SET name=?, code=?, target_productivity=?, status=?, updated_at=CURRENT_TIMESTAMP
      WHERE id=?
    `).run(updatedName, updatedCode, updatedTarget, updatedStatus, id);

    const updated = req.db.prepare('SELECT * FROM stores WHERE id = ?').get(id);
    res.json({ success: true, message: '門市資料已更新', data: updated });
  } catch (err) {
    console.error('PUT /stores/:id error:', err);
    res.status(500).json({ success: false, message: '伺服器錯誤', error: err.message });
  }
});

// DELETE /api/stores/:id - Deactivate store
router.delete('/:id', (req, res) => {
  try {
    const id = Number(req.params.id);
    const existing = req.db.prepare('SELECT * FROM stores WHERE id = ?').get(id);
    if (!existing) return res.status(404).json({ success: false, message: '門市不存在' });

    req.db.prepare("UPDATE stores SET status='inactive', updated_at=CURRENT_TIMESTAMP WHERE id=?").run(id);
    res.json({ success: true, message: '門市已停用' });
  } catch (err) {
    console.error('DELETE /stores/:id error:', err);
    res.status(500).json({ success: false, message: '伺服器錯誤', error: err.message });
  }
});

module.exports = router;
