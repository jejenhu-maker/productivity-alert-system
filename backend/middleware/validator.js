/**
 * Input Validation Middleware
 */

/**
 * Calculate seniority weight based on years of service
 * @param {number} years
 * @returns {number}
 */
function getSeniorityWeight(years) {
  if (years >= 3) return 1.2;
  if (years >= 1) return 1.0;
  return 0.8;
}

/**
 * Calculate position weight based on job title
 * @param {string} position
 * @returns {number}
 */
function getPositionWeight(position) {
  const weights = {
    '店長': 1.3,
    '副店長': 1.15,
    '藥師副店長': 1.2,
    '藥師': 1.2,
    '門市人員': 1.0,
    '兼職': 0.85,
  };
  return weights[position] || 1.0;
}

/**
 * Calculate overall employee weight
 * @param {number} seniorityYears
 * @param {string} position
 * @returns {number}
 */
function getEmployeeWeight(seniorityYears, position) {
  return getSeniorityWeight(seniorityYears) * getPositionWeight(position);
}

/**
 * Determine alert status based on productivity ratio
 * @param {number} ratio - achievement ratio (0-100+)
 * @returns {'green'|'yellow'|'red'}
 */
function getAlertStatus(ratio) {
  if (ratio >= 100) return 'green';
  if (ratio >= 70) return 'yellow';
  return 'red';
}

/**
 * Validate employee data
 */
function validateEmployee(req, res, next) {
  const { name, store_id, position, hire_date, seniority_years, hourly_rate } = req.body;
  const errors = [];

  if (!name || String(name).trim() === '') errors.push('員工姓名不可為空');
  if (!store_id || isNaN(Number(store_id))) errors.push('門市ID必須為數字');
  if (!['店長', '副店長', '藥師副店長', '藥師', '門市人員', '兼職'].includes(position)) {
    errors.push('職位必須為：店長、副店長、藥師副店長、藥師、門市人員、兼職之一');
  }
  if (!hire_date || !/^\d{4}-\d{2}-\d{2}$/.test(hire_date)) {
    errors.push('到職日期格式必須為 YYYY-MM-DD');
  }
  if (seniority_years !== undefined && (isNaN(Number(seniority_years)) || Number(seniority_years) < 0)) {
    errors.push('年資必須為非負數');
  }
  if (hourly_rate !== undefined && (isNaN(Number(hourly_rate)) || Number(hourly_rate) <= 0)) {
    errors.push('時薪必須為正數');
  }

  if (errors.length > 0) {
    return res.status(400).json({ success: false, errors });
  }
  next();
}

/**
 * Validate store data
 */
function validateStore(req, res, next) {
  const { name, code, target_productivity } = req.body;
  const errors = [];

  if (!name || String(name).trim() === '') errors.push('門市名稱不可為空');
  if (!code || String(code).trim() === '') errors.push('門市代碼不可為空');
  if (target_productivity !== undefined) {
    const val = Number(target_productivity);
    if (isNaN(val) || val <= 0) errors.push('目標生產力必須為正數');
  }

  if (errors.length > 0) {
    return res.status(400).json({ success: false, errors });
  }
  next();
}

/**
 * Validate monthly data
 */
function validateMonthly(req, res, next) {
  const { store_id, year, month } = req.body;
  const errors = [];

  if (!store_id || isNaN(Number(store_id))) errors.push('門市ID必須為數字');
  if (!year || isNaN(Number(year)) || Number(year) < 2020 || Number(year) > 2099) {
    errors.push('年份必須介於 2020 至 2099 之間');
  }
  if (!month || isNaN(Number(month)) || Number(month) < 1 || Number(month) > 12) {
    errors.push('月份必須介於 1 至 12 之間');
  }

  const numFields = ['estimated_hours', 'estimated_revenue', 'actual_hours', 'actual_revenue', 'estimated_gross_margin', 'actual_gross_margin'];
  for (const field of numFields) {
    if (req.body[field] !== undefined && req.body[field] !== null && req.body[field] !== '') {
      const val = Number(req.body[field]);
      if (isNaN(val) || val < 0) errors.push(`${field} 必須為非負數`);
    }
  }

  if (errors.length > 0) {
    return res.status(400).json({ success: false, errors });
  }
  next();
}

module.exports = {
  getSeniorityWeight,
  getPositionWeight,
  getEmployeeWeight,
  getAlertStatus,
  validateEmployee,
  validateStore,
  validateMonthly,
};
