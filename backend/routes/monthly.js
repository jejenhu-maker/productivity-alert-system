/**
 * Monthly Data Routes
 */
const express = require('express');
const router = express.Router();
const { validateMonthly, getEmployeeWeight } = require('../middleware/validator');

/**
 * Calculate weighted hours for a store in a given period
 * Uses total store hours divided proportionally by employee weights
 * @param {object} db - Database instance
 * @param {number} storeId
 * @param {number} totalHours
 * @returns {number} weighted hours
 */
function calculateWeightedHours(db, storeId, totalHours) {
  const employees = db.prepare(`
    SELECT seniority_years, position, hourly_rate
    FROM employees
    WHERE store_id = ? AND active = 1
  `).all(storeId);

  if (employees.length === 0) return totalHours;

  const totalWeight = employees.reduce((sum, e) => sum + getEmployeeWeight(e.seniority_years, e.position), 0);
  const avgWeight = totalWeight / employees.length;

  return parseFloat((totalHours * avgWeight).toFixed(2));
}

/**
 * Calculate total labor cost for a store
 * @param {object} db - Database instance
 * @param {number} storeId
 * @param {number} totalHours
 * @returns {number} labor cost
 */
function calculateLaborCost(db, storeId, totalHours) {
  const employees = db.prepare(`
    SELECT hourly_rate FROM employees WHERE store_id = ? AND active = 1
  `).all(storeId);

  if (employees.length === 0) return 0;

  const avgRate = employees.reduce((sum, e) => sum + e.hourly_rate, 0) / employees.length;
  return parseFloat((totalHours * avgRate).toFixed(2));
}

// GET /api/monthly - List monthly data
router.get('/', (req, res) => {
  try {
    const { store_id, year, month } = req.query;
    let query = `
      SELECT md.*, s.name as store_name, s.code as store_code, s.target_productivity
      FROM monthly_data md
      JOIN stores s ON md.store_id = s.id
      WHERE 1=1
    `;
    const params = [];

    if (store_id) { query += ' AND md.store_id = ?'; params.push(Number(store_id)); }
    if (year) { query += ' AND md.year = ?'; params.push(Number(year)); }
    if (month) { query += ' AND md.month = ?'; params.push(Number(month)); }

    query += ' ORDER BY md.year DESC, md.month DESC, s.id';

    const rows = req.db.prepare(query).all(...params);

    const enriched = rows.map(row => {
      const hours = row.actual_hours || row.estimated_hours || 0;
      const revenue = row.actual_revenue || row.estimated_revenue || 0;
      const weightedHrs = calculateWeightedHours(req.db, row.store_id, hours);
      const laborCost = calculateLaborCost(req.db, row.store_id, hours);
      const productivity = weightedHrs > 0 ? parseFloat((revenue / weightedHrs).toFixed(2)) : 0;
      const ratio = row.target_productivity > 0 ? parseFloat((productivity / row.target_productivity * 100).toFixed(1)) : 0;
      const costRatio = revenue > 0 ? parseFloat((laborCost / revenue * 100).toFixed(1)) : 0;

      let status = 'red';
      if (ratio >= 100) status = 'green';
      else if (ratio >= 70) status = 'yellow';

      return {
        ...row,
        weighted_hours: weightedHrs,
        labor_cost: laborCost,
        productivity,
        achievement_ratio: ratio,
        cost_ratio: costRatio,
        alert_status: status,
      };
    });

    res.json({ success: true, data: enriched });
  } catch (err) {
    console.error('GET /monthly error:', err);
    res.status(500).json({ success: false, message: '伺服器錯誤', error: err.message });
  }
});

// GET /api/monthly/:id
router.get('/:id', (req, res) => {
  try {
    const row = req.db.prepare(`
      SELECT md.*, s.name as store_name, s.code as store_code, s.target_productivity
      FROM monthly_data md
      JOIN stores s ON md.store_id = s.id
      WHERE md.id = ?
    `).get(Number(req.params.id));

    if (!row) return res.status(404).json({ success: false, message: '資料不存在' });

    const hours = row.actual_hours || row.estimated_hours || 0;
    const revenue = row.actual_revenue || row.estimated_revenue || 0;
    const weightedHrs = calculateWeightedHours(req.db, row.store_id, hours);
    const laborCost = calculateLaborCost(req.db, row.store_id, hours);
    const productivity = weightedHrs > 0 ? parseFloat((revenue / weightedHrs).toFixed(2)) : 0;
    const ratio = row.target_productivity > 0 ? parseFloat((productivity / row.target_productivity * 100).toFixed(1)) : 0;
    const costRatio = revenue > 0 ? parseFloat((laborCost / revenue * 100).toFixed(1)) : 0;

    let status = 'red';
    if (ratio >= 100) status = 'green';
    else if (ratio >= 70) status = 'yellow';

    res.json({
      success: true,
      data: {
        ...row,
        weighted_hours: weightedHrs,
        labor_cost: laborCost,
        productivity,
        achievement_ratio: ratio,
        cost_ratio: costRatio,
        alert_status: status,
      }
    });
  } catch (err) {
    console.error('GET /monthly/:id error:', err);
    res.status(500).json({ success: false, message: '伺服器錯誤', error: err.message });
  }
});

// POST /api/monthly - Create or update monthly data
router.post('/', validateMonthly, (req, res) => {
  try {
    const {
      store_id, year, month,
      estimated_hours, estimated_revenue,
      actual_hours, actual_revenue,
      submitted_by, notes
    } = req.body;

    // Verify store
    const store = req.db.prepare('SELECT id FROM stores WHERE id = ?').get(Number(store_id));
    if (!store) return res.status(400).json({ success: false, message: '門市不存在' });

    // Check if record exists
    const existing = req.db.prepare(
      'SELECT id FROM monthly_data WHERE store_id=? AND year=? AND month=?'
    ).get(Number(store_id), Number(year), Number(month));

    let rowId;
    if (existing) {
      req.db.prepare(`
        UPDATE monthly_data
        SET estimated_hours=?, estimated_revenue=?, actual_hours=?, actual_revenue=?,
            submitted_by=?, notes=?, updated_at=CURRENT_TIMESTAMP
        WHERE store_id=? AND year=? AND month=?
      `).run(
        estimated_hours || null, estimated_revenue || null,
        actual_hours || null, actual_revenue || null,
        submitted_by || null, notes || null,
        Number(store_id), Number(year), Number(month)
      );
      rowId = existing.id;
    } else {
      const result = req.db.prepare(`
        INSERT INTO monthly_data
          (store_id, year, month, estimated_hours, estimated_revenue, actual_hours, actual_revenue, submitted_by, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        Number(store_id), Number(year), Number(month),
        estimated_hours || null, estimated_revenue || null,
        actual_hours || null, actual_revenue || null,
        submitted_by || null, notes || null
      );
      rowId = result.lastInsertRowid;
    }

    const row = req.db.prepare(`
      SELECT md.*, s.name as store_name, s.target_productivity
      FROM monthly_data md JOIN stores s ON md.store_id = s.id
      WHERE md.id = ?
    `).get(rowId);

    const hours = row.actual_hours || row.estimated_hours || 0;
    const revenue = row.actual_revenue || row.estimated_revenue || 0;
    const weightedHrs = calculateWeightedHours(req.db, row.store_id, hours);
    const productivity = weightedHrs > 0 ? parseFloat((revenue / weightedHrs).toFixed(2)) : 0;
    const ratio = row.target_productivity > 0 ? parseFloat((productivity / row.target_productivity * 100).toFixed(1)) : 0;

    let status = 'red';
    if (ratio >= 100) status = 'green';
    else if (ratio >= 70) status = 'yellow';

    res.status(existing ? 200 : 201).json({
      success: true,
      message: existing ? '月份資料已更新' : '月份資料已新增',
      data: { ...row, weighted_hours: weightedHrs, productivity, achievement_ratio: ratio, alert_status: status }
    });
  } catch (err) {
    console.error('POST /monthly error:', err);
    res.status(500).json({ success: false, message: '伺服器錯誤', error: err.message });
  }
});

// PUT /api/monthly/:id
router.put('/:id', (req, res) => {
  try {
    const id = Number(req.params.id);
    const existing = req.db.prepare('SELECT * FROM monthly_data WHERE id = ?').get(id);
    if (!existing) return res.status(404).json({ success: false, message: '資料不存在' });

    const fields = ['estimated_hours', 'estimated_revenue', 'actual_hours', 'actual_revenue', 'submitted_by', 'notes'];
    const updates = {};
    for (const f of fields) {
      updates[f] = req.body[f] !== undefined ? req.body[f] : existing[f];
    }

    req.db.prepare(`
      UPDATE monthly_data
      SET estimated_hours=?, estimated_revenue=?, actual_hours=?, actual_revenue=?,
          submitted_by=?, notes=?, updated_at=CURRENT_TIMESTAMP
      WHERE id=?
    `).run(
      updates.estimated_hours, updates.estimated_revenue,
      updates.actual_hours, updates.actual_revenue,
      updates.submitted_by, updates.notes, id
    );

    const row = req.db.prepare(`
      SELECT md.*, s.name as store_name, s.target_productivity
      FROM monthly_data md JOIN stores s ON md.store_id = s.id WHERE md.id = ?
    `).get(id);

    res.json({ success: true, message: '月份資料已更新', data: row });
  } catch (err) {
    console.error('PUT /monthly/:id error:', err);
    res.status(500).json({ success: false, message: '伺服器錯誤', error: err.message });
  }
});

module.exports = router;
module.exports.calculateWeightedHours = calculateWeightedHours;
module.exports.calculateLaborCost = calculateLaborCost;
