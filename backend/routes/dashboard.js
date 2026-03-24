/**
 * Dashboard & Alert Routes
 */
const express = require('express');
const router = express.Router();
const { getEmployeeWeight } = require('../middleware/validator');

function calculateWeightedHours(db, storeId, totalHours) {
  const employees = db.prepare(
    'SELECT seniority_years, position FROM employees WHERE store_id = ? AND active = 1'
  ).all(storeId);
  if (employees.length === 0) return totalHours;
  const totalWeight = employees.reduce((sum, e) => sum + getEmployeeWeight(e.seniority_years, e.position), 0);
  return parseFloat((totalHours * (totalWeight / employees.length)).toFixed(2));
}

function calculateLaborCost(db, storeId, totalHours) {
  const employees = db.prepare(
    'SELECT hourly_rate FROM employees WHERE store_id = ? AND active = 1'
  ).all(storeId);
  if (employees.length === 0) return 0;
  const avgRate = employees.reduce((s, e) => s + e.hourly_rate, 0) / employees.length;
  return parseFloat((totalHours * avgRate).toFixed(2));
}

function getAlertColor(ratio) {
  if (ratio >= 100) return 'green';
  if (ratio >= 70) return 'yellow';
  return 'red';
}

function buildStoreStatus(db, store, monthlyRow) {
  if (!monthlyRow) {
    return {
      store_id: store.id,
      store_name: store.name,
      store_code: store.code,
      target_productivity: store.target_productivity,
      alert_status: 'red',
      alert_color: 'red',
      achievement_ratio: 0,
      productivity: 0,
      weighted_hours: 0,
      estimated_hours: 0,
      estimated_revenue: 0,
      actual_hours: null,
      actual_revenue: null,
      labor_cost: 0,
      cost_ratio: 0,
      employee_count: store.employee_count || 0,
      last_updated: null,
      has_data: false,
    };
  }

  const hours = monthlyRow.actual_hours || monthlyRow.estimated_hours || 0;
  const revenue = monthlyRow.actual_revenue || monthlyRow.estimated_revenue || 0;
  const weightedHrs = calculateWeightedHours(db, store.id, hours);
  const laborCost = calculateLaborCost(db, store.id, hours);
  const productivity = weightedHrs > 0 ? parseFloat((revenue / weightedHrs).toFixed(2)) : 0;
  const ratio = store.target_productivity > 0
    ? parseFloat((productivity / store.target_productivity * 100).toFixed(1))
    : 0;
  const costRatio = revenue > 0 ? parseFloat((laborCost / revenue * 100).toFixed(1)) : 0;

  return {
    store_id: store.id,
    store_name: store.name,
    store_code: store.code,
    target_productivity: store.target_productivity,
    alert_status: getAlertColor(ratio),
    alert_color: getAlertColor(ratio),
    achievement_ratio: ratio,
    productivity,
    weighted_hours: weightedHrs,
    estimated_hours: monthlyRow.estimated_hours || 0,
    estimated_revenue: monthlyRow.estimated_revenue || 0,
    actual_hours: monthlyRow.actual_hours,
    actual_revenue: monthlyRow.actual_revenue,
    labor_cost: laborCost,
    cost_ratio: costRatio,
    employee_count: store.employee_count || 0,
    last_updated: monthlyRow.updated_at,
    monthly_id: monthlyRow.id,
    year: monthlyRow.year,
    month: monthlyRow.month,
    has_data: true,
  };
}

// GET /api/dashboard - All stores current status
router.get('/', (req, res) => {
  try {
    const now = new Date();
    let { year, month } = req.query;
    year = year ? Number(year) : now.getFullYear();
    month = month ? Number(month) : now.getMonth() + 1;

    const stores = req.db.prepare(`
      SELECT s.*, COUNT(DISTINCT CASE WHEN e.active=1 THEN e.id END) as employee_count
      FROM stores s
      LEFT JOIN employees e ON e.store_id = s.id
      WHERE s.status = 'active'
      GROUP BY s.id ORDER BY s.id
    `).all();

    const monthlyRows = req.db.prepare(`
      SELECT * FROM monthly_data WHERE year = ? AND month = ?
    `).all(year, month);
    const monthlyByStore = {};
    for (const row of monthlyRows) monthlyByStore[row.store_id] = row;

    const storeStatuses = stores.map(store => buildStoreStatus(req.db, store, monthlyByStore[store.id]));

    const summary = {
      total: storeStatuses.length,
      green: storeStatuses.filter(s => s.alert_status === 'green').length,
      yellow: storeStatuses.filter(s => s.alert_status === 'yellow').length,
      red: storeStatuses.filter(s => s.alert_status === 'red').length,
      avg_productivity: storeStatuses.filter(s => s.productivity > 0).length > 0
        ? parseFloat((
            storeStatuses.filter(s => s.productivity > 0)
              .reduce((sum, s) => sum + s.productivity, 0)
            / storeStatuses.filter(s => s.productivity > 0).length
          ).toFixed(2))
        : 0,
      avg_achievement: storeStatuses.filter(s => s.achievement_ratio > 0).length > 0
        ? parseFloat((
            storeStatuses.filter(s => s.achievement_ratio > 0)
              .reduce((sum, s) => sum + s.achievement_ratio, 0)
            / storeStatuses.filter(s => s.achievement_ratio > 0).length
          ).toFixed(1))
        : 0,
    };

    res.json({
      success: true,
      data: {
        year,
        month,
        summary,
        stores: storeStatuses,
      }
    });
  } catch (err) {
    console.error('GET /dashboard error:', err);
    res.status(500).json({ success: false, message: '伺服器錯誤', error: err.message });
  }
});

// GET /api/dashboard/:storeId - Single store detail
router.get('/:storeId', (req, res) => {
  try {
    const storeId = Number(req.params.storeId);
    const now = new Date();
    let { year, month } = req.query;
    year = year ? Number(year) : now.getFullYear();
    month = month ? Number(month) : now.getMonth() + 1;

    const store = req.db.prepare(`
      SELECT s.*, COUNT(DISTINCT CASE WHEN e.active=1 THEN e.id END) as employee_count
      FROM stores s
      LEFT JOIN employees e ON e.store_id = s.id
      WHERE s.id = ?
      GROUP BY s.id
    `).get(storeId);

    if (!store) return res.status(404).json({ success: false, message: '門市不存在' });

    const monthlyRow = req.db.prepare(
      'SELECT * FROM monthly_data WHERE store_id=? AND year=? AND month=?'
    ).get(storeId, year, month);

    const currentStatus = buildStoreStatus(req.db, store, monthlyRow);

    // Get employees with weights
    const employees = req.db.prepare(`
      SELECT * FROM employees WHERE store_id = ? AND active = 1
      ORDER BY position, name
    `).all(storeId);

    const enrichedEmployees = employees.map(e => ({
      ...e,
      total_weight: parseFloat(getEmployeeWeight(e.seniority_years, e.position).toFixed(3)),
    }));

    // Get last 6 months trend
    const trend = req.db.prepare(`
      SELECT md.*, s.target_productivity
      FROM monthly_data md
      JOIN stores s ON md.store_id = s.id
      WHERE md.store_id = ?
      ORDER BY md.year DESC, md.month DESC
      LIMIT 6
    `).all(storeId).map(row => {
      const h = row.actual_hours || row.estimated_hours || 0;
      const r = row.actual_revenue || row.estimated_revenue || 0;
      const wh = calculateWeightedHours(req.db, storeId, h);
      const prod = wh > 0 ? parseFloat((r / wh).toFixed(2)) : 0;
      const ratio = row.target_productivity > 0 ? parseFloat((prod / row.target_productivity * 100).toFixed(1)) : 0;
      return {
        year: row.year,
        month: row.month,
        productivity: prod,
        achievement_ratio: ratio,
        weighted_hours: wh,
        revenue: r,
        alert_status: getAlertColor(ratio),
      };
    }).reverse();

    res.json({
      success: true,
      data: {
        ...currentStatus,
        employees: enrichedEmployees,
        trend,
        year,
        month,
      }
    });
  } catch (err) {
    console.error('GET /dashboard/:storeId error:', err);
    res.status(500).json({ success: false, message: '伺服器錯誤', error: err.message });
  }
});

module.exports = router;
