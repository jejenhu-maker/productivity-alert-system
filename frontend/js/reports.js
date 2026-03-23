/**
 * Reports Page Logic
 */

let trendChartInstance = null;
let comparisonChartInstance = null;
let reportData = [];

const STORE_COLORS = [
  '#1a56db', '#16a34a', '#d97706', '#dc2626',
  '#7c3aed', '#0891b2', '#db2777', '#65a30d',
];

document.addEventListener('DOMContentLoaded', () => {
  initReportFilters();
  loadReports();
});

function initReportFilters() {
  const { year, month } = getCurrentYearMonth();

  // Month range selectors
  const fromSel = document.getElementById('reportFrom');
  const toSel = document.getElementById('reportTo');
  if (fromSel) {
    fromSel.innerHTML = generateMonthOptions(year, month - 5 < 1 ? month + 7 : month - 5, 24);
  }
  if (toSel) {
    toSel.innerHTML = generateMonthOptions(year, month);
  }

  // Single month for comparison
  const compSel = document.getElementById('comparisonMonth');
  if (compSel) {
    compSel.innerHTML = generateMonthOptions(year, month);
  }

  // Bind change events
  ['reportFrom', 'reportTo', 'reportStoreId'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', loadTrendReport);
  });

  document.getElementById('comparisonMonth')?.addEventListener('change', loadComparisonReport);

  // Load stores for filter
  api.get('/stores').then(result => {
    const stores = result.data;
    const sel = document.getElementById('reportStoreId');
    if (sel) {
      sel.innerHTML = `<option value="">全部門市</option>` +
        stores.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
    }
  });
}

async function loadReports() {
  await Promise.all([loadTrendReport(), loadComparisonReport()]);
}

// =============================================
// Trend Report (line charts)
// =============================================
async function loadTrendReport() {
  showTrendLoading();
  try {
    const storeId = document.getElementById('reportStoreId')?.value;
    const params = { months: 6 };
    if (storeId) params.store_id = storeId;

    const result = await api.get('/reports/monthly', params);
    renderTrendCharts(result.data);
    renderMonthlyTable(result.data);
  } catch (err) {
    showToast('載入趨勢報表失敗: ' + err.message, 'error');
  }
}

function renderTrendCharts(storeDataList) {
  const canvas = document.getElementById('trendChart');
  if (!canvas) return;

  if (!storeDataList || storeDataList.length === 0) {
    canvas.parentElement.innerHTML = `<div class="empty-state"><div class="empty-icon">📊</div><h4>暫無資料</h4></div>`;
    return;
  }

  // Get all labels (union of all months)
  const labelSet = new Set();
  storeDataList.forEach(s => s.data.forEach(d => labelSet.add(d.label)));
  const labels = Array.from(labelSet).sort();

  const datasets = storeDataList.map((store, i) => {
    const dataMap = {};
    store.data.forEach(d => dataMap[d.label] = d.productivity);

    return {
      label: store.store_name,
      data: labels.map(l => dataMap[l] || null),
      borderColor: STORE_COLORS[i % STORE_COLORS.length],
      backgroundColor: STORE_COLORS[i % STORE_COLORS.length] + '18',
      borderWidth: 2,
      tension: 0.3,
      fill: false,
      pointRadius: 4,
      spanGaps: false,
    };
  });

  // Add target lines
  storeDataList.forEach((store, i) => {
    datasets.push({
      label: `${store.store_name} 目標`,
      data: labels.map(() => store.target_productivity),
      borderColor: STORE_COLORS[i % STORE_COLORS.length],
      borderWidth: 1,
      borderDash: [4, 4],
      pointRadius: 0,
      fill: false,
      tension: 0,
    });
  });

  if (trendChartInstance) trendChartInstance.destroy();

  trendChartInstance = new Chart(canvas, {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: { font: { size: 11 }, filter: item => !item.text.includes('目標') },
        },
        tooltip: {
          callbacks: {
            label: ctx => `${ctx.dataset.label}: ${ctx.parsed.y ? formatNumber(ctx.parsed.y, 0) + ' NT$/hr' : '無資料'}`,
          }
        }
      },
      scales: {
        y: {
          beginAtZero: false,
          ticks: {
            callback: v => formatNumber(v),
            font: { size: 11 },
          },
          title: { display: true, text: '生產力 (NT$/hr)', font: { size: 11 } }
        },
        x: { ticks: { font: { size: 11 } } }
      }
    }
  });
}

// =============================================
// Comparison Report (bar chart)
// =============================================
async function loadComparisonReport() {
  try {
    const compMonth = document.getElementById('comparisonMonth')?.value;
    const params = compMonth ? parseYearMonth(compMonth) : getCurrentYearMonth();

    const result = await api.get('/reports/stores', params);
    renderComparisonChart(result.data);
  } catch (err) {
    showToast('載入比較報表失敗: ' + err.message, 'error');
  }
}

function renderComparisonChart(data) {
  const canvas = document.getElementById('comparisonChart');
  if (!canvas || !data || !data.stores) return;

  const stores = data.stores;
  const labels = stores.map(s => s.store_name);
  const productivities = stores.map(s => s.productivity || 0);
  const targets = stores.map(s => s.target_productivity || 0);
  const bgColors = stores.map(s =>
    !s.has_data ? '#e5e7eb'
    : s.alert_status === 'green' ? '#16a34a'
    : s.alert_status === 'yellow' ? '#d97706'
    : '#dc2626'
  );

  if (comparisonChartInstance) comparisonChartInstance.destroy();

  comparisonChartInstance = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: '生產力 (NT$/hr)',
          data: productivities,
          backgroundColor: bgColors,
          borderRadius: 6,
          borderSkipped: false,
        },
        {
          label: '目標生產力',
          data: targets,
          type: 'line',
          borderColor: '#1a56db',
          backgroundColor: 'transparent',
          borderWidth: 2,
          borderDash: [5, 5],
          pointRadius: 4,
          pointBackgroundColor: '#1a56db',
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { font: { size: 11 } } },
        tooltip: {
          callbacks: {
            label: ctx => {
              const s = stores[ctx.dataIndex];
              if (!s) return '';
              if (ctx.datasetIndex === 0) {
                return `生產力: ${formatNumber(ctx.parsed.y, 0)} NT$/hr (達成率: ${s.achievement_ratio || 0}%)`;
              }
              return `目標: ${formatNumber(ctx.parsed.y, 0)} NT$/hr`;
            }
          }
        }
      },
      scales: {
        y: {
          beginAtZero: false,
          ticks: { callback: v => formatNumber(v), font: { size: 11 } },
          title: { display: true, text: '生產力 (NT$/hr)', font: { size: 11 } },
        },
        x: { ticks: { font: { size: 11 } } }
      }
    }
  });

  renderRankingTable(stores, data.year, data.month);
}

// =============================================
// Data Tables
// =============================================
function renderMonthlyTable(storeDataList) {
  const tbody = document.getElementById('monthlyTableBody');
  if (!tbody) return;

  const rows = [];
  storeDataList.forEach(store => {
    store.data.forEach(d => {
      rows.push({
        store_name: store.store_name,
        ...d,
        target: store.target_productivity,
      });
    });
  });

  rows.sort((a, b) => {
    if (a.label !== b.label) return a.label < b.label ? -1 : 1;
    return a.store_name < b.store_name ? -1 : 1;
  });

  if (rows.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-center text-muted py-4">暫無資料</td></tr>`;
    return;
  }

  tbody.innerHTML = rows.map(r => `
    <tr>
      <td>${r.label}</td>
      <td class="fw-600">${r.store_name}</td>
      <td>${formatNumber(r.weighted_hours, 1)} hr</td>
      <td>NT$${formatNumber(r.revenue)}</td>
      <td class="fw-600 ${r.alert_status === 'green' ? 'text-success' : r.alert_status === 'yellow' ? 'text-warning' : 'text-danger'}">
        ${formatNumber(r.productivity, 0)} NT$/hr
      </td>
      <td class="${r.alert_status === 'green' ? 'text-success' : r.alert_status === 'yellow' ? 'text-warning' : 'text-danger'}">
        ${formatPercent(r.achievement_ratio)}
      </td>
      <td>${statusBadge(r.alert_status)}</td>
    </tr>`).join('');
}

function renderRankingTable(stores, year, month) {
  const el = document.getElementById('rankingTableBody');
  if (!el) return;

  const ranked = stores.filter(s => s.has_data).sort((a, b) => b.productivity - a.productivity);
  const noData = stores.filter(s => !s.has_data);

  el.innerHTML = [...ranked, ...noData].map((s, i) => `
    <tr>
      <td>
        <span style="font-size:1.2rem;">${i < ranked.length ? (i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`) : '-'}</span>
      </td>
      <td class="fw-600">${s.store_name}</td>
      <td class="fw-600 ${s.alert_status === 'green' ? 'text-success' : s.alert_status === 'yellow' ? 'text-warning' : 'text-danger'}">
        ${s.has_data ? formatNumber(s.productivity, 0) + ' NT$/hr' : '-'}
      </td>
      <td>${s.has_data ? formatNumber(s.target_productivity, 0) + ' NT$/hr' : formatNumber(s.target_productivity, 0) + ' NT$/hr'}</td>
      <td class="${s.alert_status === 'green' ? 'text-success' : s.alert_status === 'yellow' ? 'text-warning' : 'text-danger'}">
        ${s.has_data ? formatPercent(s.achievement_ratio) : '-'}
      </td>
      <td>${s.has_data ? statusBadge(s.alert_status) : statusBadge('no_data')}</td>
    </tr>`).join('');
}

// =============================================
// Export CSV
// =============================================
function exportCSV() {
  const compMonth = document.getElementById('comparisonMonth')?.value;
  const params = compMonth ? parseYearMonth(compMonth) : getCurrentYearMonth();
  const storeId = document.getElementById('reportStoreId')?.value;

  const qs = new URLSearchParams({ ...params, ...(storeId ? { store_id: storeId } : {}) }).toString();
  window.open(`/api/reports/export?${qs}`, '_blank');
  showToast('CSV 匯出已開始下載', 'success');
}

function showTrendLoading() {
  const canvas = document.getElementById('trendChart');
  if (canvas) canvas.parentElement.innerHTML = `
    <div class="loading"><div class="spinner"></div>載入中...</div>
    <canvas id="trendChart"></canvas>`;
}
