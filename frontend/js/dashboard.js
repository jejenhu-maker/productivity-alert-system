/**
 * Dashboard Page Logic
 */

let dashboardData = null;
let refreshTimer = null;

document.addEventListener('DOMContentLoaded', () => {
  initMonthSelector();
  loadDashboard();
  startAutoRefresh();
});

function initMonthSelector() {
  const { year, month } = getCurrentYearMonth();
  const sel = document.getElementById('monthSelect');
  if (sel) {
    sel.innerHTML = generateMonthOptions(year, month);
    sel.addEventListener('change', () => loadDashboard());
  }
}

function getSelectedYearMonth() {
  const sel = document.getElementById('monthSelect');
  if (sel && sel.value) return parseYearMonth(sel.value);
  return getCurrentYearMonth();
}

async function loadDashboard() {
  showDashboardLoading();
  try {
    const { year, month } = getSelectedYearMonth();
    const result = await api.get('/dashboard', { year, month });
    dashboardData = result.data;
    renderSummaryCards(dashboardData.summary);
    renderStoreGrid(dashboardData.stores);
    updateLastRefresh();
  } catch (err) {
    showDashboardError(err.message);
  }
}

function renderSummaryCards(summary) {
  const el = document.getElementById('summaryCards');
  if (!el) return;

  el.innerHTML = `
    <div class="summary-card blue">
      <div class="card-icon"><i class="bi bi-shop"></i></div>
      <div class="card-label">門市總數</div>
      <div class="card-value">${summary.total}</div>
      <div class="card-sub">全部門市</div>
    </div>
    <div class="summary-card green">
      <div class="card-icon"><i class="bi bi-check-circle"></i></div>
      <div class="card-label">綠色達標</div>
      <div class="card-value">${summary.green}</div>
      <div class="card-sub">生產力達標</div>
    </div>
    <div class="summary-card yellow">
      <div class="card-icon"><i class="bi bi-exclamation-triangle"></i></div>
      <div class="card-label">黃色警示</div>
      <div class="card-value">${summary.yellow}</div>
      <div class="card-sub">需關注</div>
    </div>
    <div class="summary-card red">
      <div class="card-icon"><i class="bi bi-x-circle"></i></div>
      <div class="card-label">紅色危險</div>
      <div class="card-value">${summary.red}</div>
      <div class="card-sub">緊急處理</div>
    </div>
    <div class="summary-card blue">
      <div class="card-icon"><i class="bi bi-graph-up"></i></div>
      <div class="card-label">平均生產力</div>
      <div class="card-value" style="font-size:1.3rem;">${formatNumber(summary.avg_productivity, 0)}</div>
      <div class="card-sub">NT$/hr 平均</div>
    </div>
    <div class="summary-card ${summary.avg_achievement >= 100 ? 'green' : summary.avg_achievement >= 70 ? 'yellow' : 'red'}">
      <div class="card-icon"><i class="bi bi-percent"></i></div>
      <div class="card-label">平均達成率</div>
      <div class="card-value" style="font-size:1.4rem;">${formatPercent(summary.avg_achievement)}</div>
      <div class="card-sub">目標達成率</div>
    </div>
  `;
}

function renderStoreGrid(stores) {
  const el = document.getElementById('storeGrid');
  if (!el) return;

  if (!stores || stores.length === 0) {
    el.innerHTML = `<div class="empty-state"><div class="empty-icon">🏪</div><h4>暫無門市資料</h4></div>`;
    return;
  }

  el.innerHTML = stores.map(store => renderStoreCard(store)).join('');

  // Bind click events
  el.querySelectorAll('.store-card').forEach(card => {
    card.addEventListener('click', () => {
      const storeId = card.dataset.storeId;
      showStoreDetail(storeId);
    });
  });
}

function renderStoreCard(store) {
  const status = store.has_data ? store.alert_status : 'no-data';
  const statusInfo = getStatusInfo(store.has_data ? store.alert_status : 'no_data');
  const ratio = store.achievement_ratio || 0;
  const fillWidth = Math.min(ratio, 100);
  const fillClass = store.alert_status;
  const ratioClass = ratio >= 100 ? 'highlight-green' : ratio >= 70 ? 'highlight-yellow' : 'highlight-red';

  return `
    <div class="store-card ${status}" data-store-id="${store.store_id}" title="點擊查看詳情">
      <div class="store-card-header">
        <div>
          <div class="store-name">${store.store_name}</div>
          <span class="store-code-badge">${store.store_code}</span>
        </div>
        <div class="status-indicator ${status}">
          ${statusInfo.emoji}
        </div>
      </div>
      <div class="store-card-body">
        <div class="metric-item">
          <div class="metric-label">生產力</div>
          <div class="metric-value ${store.has_data ? ratioClass : ''}">${store.has_data ? formatNumber(store.productivity, 0) : '-'}</div>
        </div>
        <div class="metric-item">
          <div class="metric-label">目標</div>
          <div class="metric-value">${formatNumber(store.target_productivity, 0)}</div>
        </div>
        <div class="metric-item">
          <div class="metric-label">達成率</div>
          <div class="metric-value ${store.has_data ? ratioClass : ''}">${store.has_data ? formatPercent(ratio) : '-'}</div>
        </div>
        <div class="metric-item">
          <div class="metric-label">加權工時</div>
          <div class="metric-value">${store.has_data ? formatNumber(store.weighted_hours, 1) + 'hr' : '-'}</div>
        </div>
        <div class="metric-item">
          <div class="metric-label">預估營收</div>
          <div class="metric-value" style="font-size:0.8rem;">${store.has_data ? 'NT$' + formatNumber(store.estimated_revenue) : '-'}</div>
        </div>
        <div class="metric-item">
          <div class="metric-label">員工人數</div>
          <div class="metric-value">${store.employee_count} 人</div>
        </div>
      </div>
      <div class="achievement-bar">
        <div class="achievement-fill ${fillClass}" style="width:${fillWidth}%"></div>
      </div>
      <div class="store-card-footer">
        <span class="text-muted fs-xs">
          ${store.last_updated ? '更新: ' + formatDate(store.last_updated) : '尚未輸入資料'}
        </span>
        <span class="badge-status ${status}">${statusInfo.label}</span>
      </div>
    </div>
  `;
}

// =============================================
// Store Detail Modal
// =============================================
async function showStoreDetail(storeId) {
  try {
    const { year, month } = getSelectedYearMonth();
    const result = await api.get(`/dashboard/${storeId}`, { year, month });
    const store = result.data;

    let modal = document.getElementById('storeDetailModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'storeDetailModal';
      modal.className = 'modal fade';
      modal.tabIndex = -1;
      modal.innerHTML = `
        <div class="modal-dialog modal-lg modal-dialog-scrollable">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title" id="storeDetailTitle"></h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body" id="storeDetailBody"></div>
          </div>
        </div>`;
      document.body.appendChild(modal);
    }

    document.getElementById('storeDetailTitle').textContent = `${store.store_name} 詳細資訊 — ${year}/${String(month).padStart(2, '0')}`;
    document.getElementById('storeDetailBody').innerHTML = renderStoreDetailBody(store);

    // Render trend mini-chart
    setTimeout(() => renderTrendChart('detailTrendChart', store.trend, store.target_productivity), 100);

    const bsModal = new bootstrap.Modal(modal);
    bsModal.show();
  } catch (err) {
    showToast('載入門市詳情失敗: ' + err.message, 'error');
  }
}

function renderStoreDetailBody(store) {
  const statusInfo = getStatusInfo(store.has_data ? store.alert_status : 'no_data');

  const empRows = (store.employees || []).map(e => `
    <tr>
      <td>${e.name}</td>
      <td>${positionBadge(e.position)}</td>
      <td>${e.seniority_years} 年</td>
      <td><span class="weight-badge">${e.total_weight}</span></td>
      <td>NT$${formatNumber(e.hourly_rate)}/hr</td>
    </tr>`).join('');

  const trendBadges = (store.trend || []).map(t => {
    const si = getStatusInfo(t.alert_status);
    return `<span class="badge-status ${t.alert_status}" style="margin:2px;">${formatMonthLabel(t.year, t.month)}: ${formatNumber(t.productivity, 0)}</span>`;
  }).join('');

  return `
    <div class="row g-3 mb-3">
      <div class="col-6 col-md-3">
        <div class="text-center p-3 rounded" style="background:#f8fafc;border:1px solid #e5e7eb;">
          <div style="font-size:2rem">${statusInfo.emoji}</div>
          <div class="fw-600 mt-1">${statusInfo.label}</div>
          <div class="text-muted fs-xs">本月狀態</div>
        </div>
      </div>
      <div class="col-6 col-md-3">
        <div class="text-center p-3 rounded" style="background:#f8fafc;border:1px solid #e5e7eb;">
          <div class="fw-700" style="font-size:1.4rem;color:#1a56db">${formatNumber(store.productivity, 0)}</div>
          <div class="text-muted fs-xs">生產力 (NT$/hr)</div>
          <div class="fw-600 text-muted" style="font-size:0.75rem">目標: ${formatNumber(store.target_productivity, 0)}</div>
        </div>
      </div>
      <div class="col-6 col-md-3">
        <div class="text-center p-3 rounded" style="background:#f8fafc;border:1px solid #e5e7eb;">
          <div class="fw-700 ${store.achievement_ratio >= 100 ? 'text-success' : store.achievement_ratio >= 70 ? 'text-warning' : 'text-danger'}" style="font-size:1.4rem;">${formatPercent(store.achievement_ratio)}</div>
          <div class="text-muted fs-xs">達成率</div>
        </div>
      </div>
      <div class="col-6 col-md-3">
        <div class="text-center p-3 rounded" style="background:#f8fafc;border:1px solid #e5e7eb;">
          <div class="fw-700" style="font-size:1.4rem;">${formatPercent(store.cost_ratio)}</div>
          <div class="text-muted fs-xs">人力成本比</div>
        </div>
      </div>
    </div>

    <div class="row g-3 mb-3">
      <div class="col-md-6">
        <div class="p-3 rounded" style="background:#f8fafc;border:1px solid #e5e7eb;">
          <div class="fw-600 mb-2 fs-sm">本月數據</div>
          <table class="table table-sm mb-0" style="font-size:0.82rem;">
            <tbody>
              <tr><td class="text-muted">預估工時</td><td class="fw-600">${formatNumber(store.estimated_hours, 1)} hr</td></tr>
              <tr><td class="text-muted">預估營收</td><td class="fw-600">NT$${formatNumber(store.estimated_revenue)}</td></tr>
              <tr><td class="text-muted">實際工時</td><td class="fw-600">${store.actual_hours !== null ? formatNumber(store.actual_hours, 1) + ' hr' : '未填入'}</td></tr>
              <tr><td class="text-muted">實際營收</td><td class="fw-600">${store.actual_revenue !== null ? 'NT$' + formatNumber(store.actual_revenue) : '未填入'}</td></tr>
              <tr><td class="text-muted">加權工時</td><td class="fw-600">${formatNumber(store.weighted_hours, 2)} hr</td></tr>
              <tr><td class="text-muted">人力成本</td><td class="fw-600">NT$${formatNumber(store.labor_cost)}</td></tr>
            </tbody>
          </table>
        </div>
      </div>
      <div class="col-md-6">
        <div class="p-3 rounded" style="background:#f8fafc;border:1px solid #e5e7eb;">
          <div class="fw-600 mb-2 fs-sm">員工配置</div>
          <div class="table-responsive">
            <table class="table table-sm mb-0" style="font-size:0.8rem;">
              <thead><tr><th>姓名</th><th>職位</th><th>年資</th><th>加權</th><th>時薪</th></tr></thead>
              <tbody>${empRows || '<tr><td colspan="5" class="text-center text-muted">無員工資料</td></tr>'}</tbody>
            </table>
          </div>
        </div>
      </div>
    </div>

    <div>
      <div class="fw-600 mb-2 fs-sm">近期趨勢</div>
      <div style="height:180px;"><canvas id="detailTrendChart"></canvas></div>
    </div>
  `;
}

function renderTrendChart(canvasId, trend, target) {
  const canvas = document.getElementById(canvasId);
  if (!canvas || !trend || trend.length === 0) return;

  const labels = trend.map(t => formatMonthLabel(t.year, t.month));
  const data = trend.map(t => t.productivity);
  const targetLine = trend.map(() => target);

  new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: '生產力 (NT$/hr)',
          data,
          borderColor: '#1a56db',
          backgroundColor: 'rgba(26,86,219,0.08)',
          borderWidth: 2,
          tension: 0.3,
          fill: true,
          pointRadius: 4,
          pointBackgroundColor: data.map((v, i) => {
            const r = target ? (v / target * 100) : 0;
            return r >= 100 ? '#16a34a' : r >= 70 ? '#d97706' : '#dc2626';
          }),
        },
        {
          label: '目標生產力',
          data: targetLine,
          borderColor: '#dc2626',
          borderWidth: 1.5,
          borderDash: [5, 5],
          pointRadius: 0,
          fill: false,
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: true, position: 'bottom', labels: { font: { size: 11 } } } },
      scales: {
        y: {
          beginAtZero: false,
          ticks: { font: { size: 10 }, callback: v => formatNumber(v) },
        },
        x: { ticks: { font: { size: 10 } } },
      }
    }
  });
}

// =============================================
// Auto-refresh
// =============================================
function startAutoRefresh() {
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = setInterval(() => {
    loadDashboard();
  }, 5 * 60 * 1000); // 5 minutes
}

function updateLastRefresh() {
  const el = document.getElementById('lastRefresh');
  if (el) el.textContent = '最後更新: ' + new Date().toLocaleTimeString('zh-TW');
}

function showDashboardLoading() {
  const grid = document.getElementById('storeGrid');
  if (grid) grid.innerHTML = `<div class="loading" style="grid-column:1/-1"><div class="spinner"></div>載入中...</div>`;
  const cards = document.getElementById('summaryCards');
  if (cards) cards.innerHTML = '';
}

function showDashboardError(msg) {
  const grid = document.getElementById('storeGrid');
  if (grid) grid.innerHTML = `
    <div class="empty-state" style="grid-column:1/-1">
      <div class="empty-icon">⚠️</div>
      <h4>載入失敗</h4>
      <p class="text-muted">${msg}</p>
      <button class="btn btn-primary btn-sm" onclick="loadDashboard()">重新載入</button>
    </div>`;
}
