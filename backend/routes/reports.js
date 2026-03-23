/**
 * Reports Routes
 */
const express = require('express');
const router = express.Router();
const db = require('../database');
const { getEmployeeWeight } = require('../middleware/validator');

function calculateWeightedHours(storeId, totalHours) {
  const employees = db.prepare(
    'SELECT seniority_years, position FROM employees WHERE store_id = ? AND active = 1'
  ).all(storeId);
  if (employees.length === 0) return totalHours;
  const totalWeight = employees.reduce((sum, e) => sum + getEmployeeWeight(e.seniority_years, e.position), 0);
  return parseFloat((totalHours * (totalWeight / employees.length)).toFixed(2));
}

function calculateLaborCost(storeId, totalHours) {
  const employees = db.prepare(
    'SELECT hourly_rate FROM employees WHERE store_id = ? AND active = 1'
  ).all(storeId);
  if (employees.length === 0) return 0;
  const avgRate = employees.reduce((s, e) => s + e.hourly_rate, 0) / employees.length;
  return parseFloat((totalHours * avgRate).toFixed(2));
}

function enrichRow(row) {
  const hours = row.actual_hours || row.estimated_hours || 0;
  const revenue = row.actual_revenue || row.estimated_revenue || 0;
  const weightedHrs = calculateWeightedHours(row.store_id, hours);
  const laborCost = calculateLaborCost(row.store_id, hours);
  const productivity = weightedHrs > 0 ? parseFloat((revenue / weightedHrs).toFixed(2)) : 0;
  const ratio = row.target_productivity > 0
    ? parseFloat((productivity / row.target_productivity * 100).toFixed(1))
    : 0;
  const costRatio = revenue > 0 ? parseFloat((laborCost / revenue * 100).toFixed(1)) : 0;

  let alertStatus = 'red';
  if (ratio >= 100) alertStatus = 'green';
  else if (ratio >= 70) alertStatus = 'yellow';

  return {
    ...row,
    hours_used: hours,
    revenue_used: revenue,
    weighted_hours: weightedHrs,
    labor_cost: laborCost,
    productivity,
    achievement_ratio: ratio,
    cost_ratio: costRatio,
    alert_status: alertStatus,
  };
}

// GET /api/reports/monthly - Monthly trend data
router.get('/monthly', (req, res) => {
  try {
    const { store_id, months = 6 } = req.query;
    let query = `
      SELECT md.*, s.name as store_name, s.code as store_code, s.target_productivity
      FROM monthly_data md
      JOIN stores s ON md.store_id = s.id
      WHERE s.status = 'active'
    `;
    const params = [];

    if (store_id) {
      query += ' AND md.store_id = ?';
      params.push(Number(store_id));
    }

    query += ' ORDER BY s.id, md.year DESC, md.month DESC';

    let rows = db.prepare(query).all(...params);

    // Limit per store
    if (!store_id) {
      const byStore = {};
      rows.forEach(r => {
        if (!byStore[r.store_id]) byStore[r.store_id] = [];
        if (byStore[r.store_id].length < Number(months)) {
          byStore[r.store_id].push(r);
        }
      });
      rows = Object.values(byStore).flat();
    } else {
      rows = rows.slice(0, Number(months));
    }

    const enriched = rows.map(enrichRow).sort((a, b) => {
      if (a.store_id !== b.store_id) return a.store_id - b.store_id;
      if (a.year !== b.year) return a.year - b.year;
      return a.month - b.month;
    });

    // Group by store for chart-ready format
    const byStore = {};
    enriched.forEach(r => {
      if (!byStore[r.store_id]) {
        byStore[r.store_id] = {
          store_id: r.store_id,
          store_name: r.store_name,
          store_code: r.store_code,
          target_productivity: r.target_productivity,
          data: [],
        };
      }
      byStore[r.store_id].data.push({
        year: r.year,
        month: r.month,
        label: `${r.year}/${String(r.month).padStart(2, '0')}`,
        productivity: r.productivity,
        achievement_ratio: r.achievement_ratio,
        weighted_hours: r.weighted_hours,
        revenue: r.revenue_used,
        labor_cost: r.labor_cost,
        cost_ratio: r.cost_ratio,
        alert_status: r.alert_status,
      });
    });

    res.json({ success: true, data: Object.values(byStore) });
  } catch (err) {
    console.error('GET /reports/monthly error:', err);
    res.status(500).json({ success: false, message: '伺服器錯誤', error: err.message });
  }
});

// GET /api/reports/stores - Cross-store comparison for a specific month
router.get('/stores', (req, res) => {
  try {
    const now = new Date();
    let { year, month } = req.query;
    year = year ? Number(year) : now.getFullYear();
    month = month ? Number(month) : now.getMonth() + 1;

    const rows = db.prepare(`
      SELECT md.*, s.name as store_name, s.code as store_code, s.target_productivity
      FROM stores s
      LEFT JOIN monthly_data md ON md.store_id = s.id AND md.year = ? AND md.month = ?
      WHERE s.status = 'active'
      ORDER BY s.id
    `).all(year, month);

    const enriched = rows.map(row => {
      if (!row.id) {
        // No data for this store
        const store = db.prepare('SELECT * FROM stores WHERE id = ?').get(row.store_id || row.id);
        return {
          store_id: row.store_id,
          store_name: row.store_name,
          store_code: row.store_code,
          target_productivity: row.target_productivity,
          productivity: 0,
          achievement_ratio: 0,
          weighted_hours: 0,
          labor_cost: 0,
          cost_ratio: 0,
          alert_status: 'red',
          has_data: false,
        };
      }
      const e = enrichRow(row);
      return { ...e, has_data: true };
    });

    // Ranking by productivity
    const withRank = [...enriched]
      .filter(s => s.has_data)
      .sort((a, b) => b.productivity - a.productivity)
      .map((s, i) => ({ ...s, rank: i + 1 }));

    const noData = enriched.filter(s => !s.has_data).map(s => ({ ...s, rank: null }));
    const final = [...withRank, ...noData];

    res.json({
      success: true,
      data: {
        year,
        month,
        stores: final,
      }
    });
  } catch (err) {
    console.error('GET /reports/stores error:', err);
    res.status(500).json({ success: false, message: '伺服器錯誤', error: err.message });
  }
});

// GET /api/reports/export - CSV export
router.get('/export', (req, res) => {
  try {
    const { year, month, store_id } = req.query;
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
    query += ' ORDER BY md.year, md.month, s.id';

    const rows = db.prepare(query).all(...params).map(enrichRow);

    // Build CSV
    const headers = [
      '年份', '月份', '門市代碼', '門市名稱',
      '目標生產力(NT$/hr)', '預估工時', '預估營收(NT$)',
      '實際工時', '實際營收(NT$)', '加權工時',
      '生產力(NT$/hr)', '達成率(%)',
      '人力成本(NT$)', '成本比率(%)', '預警狀態',
    ];

    const statusMap = { green: '綠色-達標', yellow: '黃色-警示', red: '紅色-危險' };

    const csvRows = rows.map(r => [
      r.year, r.month, r.store_code, r.store_name,
      r.target_productivity,
      r.estimated_hours || '',
      r.estimated_revenue || '',
      r.actual_hours || '',
      r.actual_revenue || '',
      r.weighted_hours,
      r.productivity,
      r.achievement_ratio,
      r.labor_cost,
      r.cost_ratio,
      statusMap[r.alert_status] || r.alert_status,
    ]);

    const bom = '\uFEFF'; // UTF-8 BOM for Excel
    const csvContent = bom + [headers, ...csvRows]
      .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const filename = `productivity_report_${year || 'all'}_${month || 'all'}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csvContent);
  } catch (err) {
    console.error('GET /reports/export error:', err);
    res.status(500).json({ success: false, message: '匯出失敗', error: err.message });
  }
});

module.exports = router;
