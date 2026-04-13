/**
 * Monthly Data Input Page Logic
 */

let storesList = [];
let storeEmployees = [];
let previewTimer = null;

document.addEventListener('DOMContentLoaded', async () => {
  await loadStoresForInput();
  initMonthSelector();
  bindFormEvents();
});

async function loadStoresForInput() {
  try {
    const result = await api.get('/stores');
    storesList = result.data.filter(s => s.status === 'active');
    const sel = document.getElementById('inputStoreId');
    if (!sel) return;
    sel.innerHTML = `<option value="">請選擇門市</option>` +
      storesList.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
  } catch (err) {
    showToast('載入門市失敗: ' + err.message, 'error');
  }
}

function initMonthSelector() {
  const { year, month } = getCurrentYearMonth();
  const yearSel = document.getElementById('inputYear');
  const monthSel = document.getElementById('inputMonth');

  if (yearSel) {
    for (let y = year; y >= year - 3; y--) {
      yearSel.innerHTML += `<option value="${y}" ${y === year ? 'selected' : ''}>${y} 年</option>`;
    }
  }
  if (monthSel) {
    for (let m = 1; m <= 12; m++) {
      monthSel.innerHTML += `<option value="${m}" ${m === month ? 'selected' : ''}}>${m} 月</option>`;
    }
  }
}

function bindFormEvents() {
  const form = document.getElementById('inputForm');
  if (form) form.addEventListener('submit', handleInputSubmit);

  const storeSelect = document.getElementById('inputStoreId');
  if (storeSelect) storeSelect.addEventListener('change', onStoreChange);

  // Live preview
  ['inputEstHours', 'inputEstRevenue', 'inputActHours', 'inputActRevenue',
   'inputEstGrossMargin', 'inputActGrossMargin',
   'inputYear', 'inputMonth', 'inputStoreId'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('input', schedulePreviewUpdate);
      el.addEventListener('change', schedulePreviewUpdate);
    }
  });
}

async function onStoreChange() {
  const storeId = document.getElementById('inputStoreId')?.value;
  if (!storeId) {
    clearStoreInfo();
    return;
  }

  const year = document.getElementById('inputYear')?.value;
  const month = document.getElementById('inputMonth')?.value;

  try {
    // Load existing data for selected store/month
    const result = await api.get('/monthly', { store_id: storeId, year, month });
    const existing = result.data[0];

    if (existing) {
      document.getElementById('inputEstHours').value = existing.estimated_hours || '';
      document.getElementById('inputEstRevenue').value = existing.estimated_revenue || '';
      document.getElementById('inputActHours').value = existing.actual_hours || '';
      document.getElementById('inputActRevenue').value = existing.actual_revenue || '';
      document.getElementById('inputEstGrossMargin').value = existing.estimated_gross_margin || '';
      document.getElementById('inputActGrossMargin').value = existing.actual_gross_margin || '';
      document.getElementById('inputNotes').value = existing.notes || '';
      document.getElementById('inputSubmittedBy').value = existing.submitted_by || '';
      showToast('已載入現有資料，可直接修改', 'info');
    } else {
      clearFormFields();
    }

    // Load store employees for weight info
    const empResult = await api.get('/employees', { store_id: storeId });
    storeEmployees = empResult.data;
    renderEmployeeWeightInfo(storeEmployees);

    // Load recent history
    await loadRecentHistory(storeId);
  } catch (err) {
    console.error('Error loading store data:', err);
  }

  updatePreview();
}

function clearStoreInfo() {
  const el = document.getElementById('employeeWeightInfo');
  if (el) el.innerHTML = '';
  const hist = document.getElementById('recentHistory');
  if (hist) hist.innerHTML = '';
}

function clearFormFields() {
  ['inputEstHours', 'inputEstRevenue', 'inputActHours', 'inputActRevenue',
   'inputEstGrossMargin', 'inputActGrossMargin',
   'inputNotes', 'inputSubmittedBy'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
}

function renderEmployeeWeightInfo(employees) {
  const el = document.getElementById('employeeWeightInfo');
  if (!el) return;

  if (employees.length === 0) {
    el.innerHTML = `<div class="text-muted fs-xs">此門市無員工資料</div>`;
    return;
  }

  const totalWeight = employees.reduce((sum, e) => sum + (e.total_weight || 1), 0);
  const avgWeight = (totalWeight / employees.length).toFixed(3);

  el.innerHTML = `
    <div class="mb-2">
      <span class="fw-600 fs-sm">員工加權資訊</span>
      <span class="text-muted fs-xs ms-2">平均加權: <strong>${avgWeight}</strong></span>
    </div>
    <div style="display:flex;flex-wrap:wrap;gap:6px;">
      ${employees.map(e => `
        <span title="${e.name}: 年資${e.seniority_years}年 × 職位${e.position}"
              style="background:#f1f5f9;border-radius:6px;padding:4px 8px;font-size:0.75rem;">
          ${e.name} <span class="weight-badge">${(e.total_weight || 1).toFixed(2)}</span>
        </span>`).join('')}
    </div>`;
}

async function loadRecentHistory(storeId) {
  const el = document.getElementById('recentHistory');
  if (!el) return;

  try {
    const result = await api.get('/monthly', { store_id: storeId });
    const rows = result.data.slice(0, 4);

    if (rows.length === 0) {
      el.innerHTML = `<tr><td colspan="9" class="text-center text-muted">暫無歷史資料</td></tr>`;
      return;
    }

    el.innerHTML = rows.map(r => {
      const statusInfo = getStatusInfo(r.alert_status);
      return `
        <tr>
          <td>${formatMonthLabel(r.year, r.month)}</td>
          <td>${r.estimated_hours ? formatNumber(r.estimated_hours, 1) + 'hr' : '-'}</td>
          <td>${r.estimated_revenue ? 'NT$' + formatNumber(r.estimated_revenue) : '-'}</td>
          <td>${r.actual_hours ? formatNumber(r.actual_hours, 1) + 'hr' : '-'}</td>
          <td>${r.actual_revenue ? 'NT$' + formatNumber(r.actual_revenue) : '-'}</td>
          <td>${r.estimated_gross_margin ? 'NT$' + formatNumber(r.estimated_gross_margin) : '-'}</td>
          <td>${r.actual_gross_margin ? 'NT$' + formatNumber(r.actual_gross_margin) : '-'}</td>
          <td class="fw-600">${r.productivity > 0 ? formatNumber(r.productivity, 0) + ' NT$/hr' : '-'}</td>
          <td>${statusBadge(r.alert_status)}</td>
        </tr>`;
    }).join('');
  } catch (err) {
    el.innerHTML = `<tr><td colspan="9" class="text-center text-muted">載入失敗</td></tr>`;
  }
}

// =============================================
// Live Preview
// =============================================
function schedulePreviewUpdate() {
  clearTimeout(previewTimer);
  previewTimer = setTimeout(updatePreview, 300);
}

function updatePreview() {
  const storeId = document.getElementById('inputStoreId')?.value;
  const estHours = parseFloat(document.getElementById('inputEstHours')?.value) || 0;
  const estRevenue = parseFloat(document.getElementById('inputEstRevenue')?.value) || 0;
  const actHours = parseFloat(document.getElementById('inputActHours')?.value) || 0;
  const actRevenue = parseFloat(document.getElementById('inputActRevenue')?.value) || 0;

  const previewEl = document.getElementById('livePreview');
  if (!previewEl) return;

  const store = storesList.find(s => s.id == storeId);
  const target = store?.target_productivity || 0;

  // Calculate weighted hours client-side using employee data
  let avgWeight = 1;
  if (storeEmployees.length > 0) {
    const totalW = storeEmployees.reduce((sum, e) => sum + (e.total_weight || 1), 0);
    avgWeight = totalW / storeEmployees.length;
  }

  const useHours = actHours || estHours;
  const useRevenue = actRevenue || estRevenue;
  const weightedHours = useHours * avgWeight;
  const productivity = weightedHours > 0 ? useRevenue / weightedHours : 0;
  const ratio = target > 0 ? (productivity / target * 100) : 0;

  const status = ratio >= 100 ? 'green' : ratio >= 70 ? 'yellow' : 'red';

  const labels = {
    green: { text: '達標 🟢', cls: 'alert-success' },
    yellow: { text: '警示 🟡', cls: 'alert-warning' },
    red: { text: '危險 🔴', cls: 'alert-danger' },
  };

  if (useHours === 0 || useRevenue === 0) {
    previewEl.innerHTML = `
      <div class="alert alert-info">
        <i class="bi bi-info-circle"></i> 請輸入工時與營收以預覽計算結果
      </div>`;
    return;
  }

  const lbl = labels[status];
  previewEl.innerHTML = `
    <div class="preview-box ${status}">
      <div class="d-flex align-center justify-between mb-2">
        <span class="fw-600">預覽計算結果 ${useHours === actHours ? '(實際)' : '(預估)'}</span>
        <span class="badge-status ${status}">${lbl.text}</span>
      </div>
      <div class="preview-grid">
        <div class="preview-item">
          <div class="preview-label">工時使用</div>
          <div class="preview-value">${formatNumber(useHours, 1)}<small>hr</small></div>
        </div>
        <div class="preview-item">
          <div class="preview-label">加權工時</div>
          <div class="preview-value">${formatNumber(weightedHours, 1)}<small>hr</small></div>
        </div>
        <div class="preview-item">
          <div class="preview-label">生產力</div>
          <div class="preview-value" style="color:${status === 'green' ? '#16a34a' : status === 'yellow' ? '#d97706' : '#dc2626'}">
            ${formatNumber(productivity, 0)}<small>NT$/hr</small>
          </div>
        </div>
        <div class="preview-item">
          <div class="preview-label">達成率</div>
          <div class="preview-value" style="color:${status === 'green' ? '#16a34a' : status === 'yellow' ? '#d97706' : '#dc2626'}">
            ${formatPercent(ratio)}
          </div>
        </div>
        <div class="preview-item">
          <div class="preview-label">目標生產力</div>
          <div class="preview-value">${target > 0 ? formatNumber(target, 0) : '-'}<small>NT$/hr</small></div>
        </div>
        <div class="preview-item">
          <div class="preview-label">平均加權</div>
          <div class="preview-value">${avgWeight.toFixed(3)}</div>
        </div>
      </div>
      <div class="achievement-bar mt-2">
        <div class="achievement-fill ${status}" style="width:${Math.min(ratio, 100)}%"></div>
      </div>
    </div>`;
}

// =============================================
// Form Submit
// =============================================
async function handleInputSubmit(e) {
  e.preventDefault();
  const btn = document.getElementById('inputSubmitBtn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner" style="display:inline-block;width:14px;height:14px;margin-right:6px;"></span>提交中...';

  const payload = {
    store_id: document.getElementById('inputStoreId')?.value,
    year: document.getElementById('inputYear')?.value,
    month: document.getElementById('inputMonth')?.value,
    estimated_hours: parseFloat(document.getElementById('inputEstHours')?.value) || null,
    estimated_revenue: parseFloat(document.getElementById('inputEstRevenue')?.value) || null,
    actual_hours: parseFloat(document.getElementById('inputActHours')?.value) || null,
    actual_revenue: parseFloat(document.getElementById('inputActRevenue')?.value) || null,
    estimated_gross_margin: parseFloat(document.getElementById('inputEstGrossMargin')?.value) || null,
    actual_gross_margin: parseFloat(document.getElementById('inputActGrossMargin')?.value) || null,
    submitted_by: document.getElementById('inputSubmittedBy')?.value || null,
    notes: document.getElementById('inputNotes')?.value || null,
  };

  try {
    const result = await api.post('/monthly', payload);
    showToast(result.message || '資料已提交', 'success');

    // Reload history
    const storeId = payload.store_id;
    if (storeId) await loadRecentHistory(storeId);
    updatePreview();
  } catch (err) {
    showToast('提交失敗: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="bi bi-check-lg"></i> 提交資料';
  }
}
