/**
 * 瑞昌藥局 人時生產力預警系統
 * Core App Utilities
 */

// Auto-detect base path from current URL
const getBasePath = () => {
  const path = window.location.pathname;
  if (path.startsWith('/productivity')) {
    return '/productivity/api';
  }
  return '/api';
};
const API_BASE = getBasePath();

// =============================================
// API Helper
// =============================================
async function apiRequest(endpoint, options = {}) {
  try {
    const url = `${API_BASE}${endpoint}`;
    const res = await fetch(url, {
      headers: { 'Content-Type': 'application/json', ...options.headers },
      ...options,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.message || `HTTP ${res.status}`);
    }
    return data;
  } catch (err) {
    console.error(`API error [${endpoint}]:`, err);
    throw err;
  }
}

const api = {
  get:    (endpoint, params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return apiRequest(qs ? `${endpoint}?${qs}` : endpoint, { method: 'GET' });
  },
  post:   (endpoint, body) => apiRequest(endpoint, { method: 'POST', body }),
  put:    (endpoint, body) => apiRequest(endpoint, { method: 'PUT', body }),
  delete: (endpoint)       => apiRequest(endpoint, { method: 'DELETE' }),
};

// =============================================
// Toast Notifications
// =============================================
function showToast(message, type = 'info', duration = 3500) {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const icons = { success: '✓', error: '✕', warning: '⚠', info: 'ℹ' };
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span>${icons[type] || icons.info}</span><span>${message}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = 'none';
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    toast.style.transition = 'all 0.3s';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// =============================================
// Formatting Helpers
// =============================================
function formatNumber(n, decimals = 0) {
  if (n === null || n === undefined || isNaN(n)) return '-';
  return Number(n).toLocaleString('zh-TW', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function formatCurrency(n) {
  if (n === null || n === undefined || isNaN(n)) return '-';
  return 'NT$' + formatNumber(n);
}

function formatProductivity(n) {
  if (n === null || n === undefined || isNaN(n)) return '-';
  return formatNumber(n, 0) + ' NT$/hr';
}

function formatPercent(n, decimals = 1) {
  if (n === null || n === undefined || isNaN(n)) return '-';
  return Number(n).toFixed(decimals) + '%';
}

function formatDate(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  return d.toLocaleDateString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

function formatMonthLabel(year, month) {
  return `${year}/${String(month).padStart(2, '0')}`;
}

// =============================================
// Alert Status Helpers
// =============================================
const STATUS_MAP = {
  green:   { label: '達標', emoji: '🟢', cls: 'green' },
  yellow:  { label: '警示', emoji: '🟡', cls: 'yellow' },
  red:     { label: '危險', emoji: '🔴', cls: 'red' },
  no_data: { label: '無資料', emoji: '⚪', cls: 'gray' },
};

function getStatusInfo(status) {
  return STATUS_MAP[status] || STATUS_MAP['no_data'];
}

function statusBadge(status) {
  const s = getStatusInfo(status);
  return `<span class="badge-status ${s.cls}">${s.emoji} ${s.label}</span>`;
}

// =============================================
// Position helpers
// =============================================
const POSITION_CLS = {
  '店長': 'manager',
  '副店長': 'manager',
  '藥師': 'pharmacist',
  '正職': 'fulltime',
  '兼職': 'parttime',
};

function positionBadge(position) {
  const cls = POSITION_CLS[position] || '';
  return `<span class="badge-position ${cls}">${position}</span>`;
}

// =============================================
// Month/Year utilities
// =============================================
function getCurrentYearMonth() {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

function generateMonthOptions(selectedYear, selectedMonth, numMonths = 24) {
  const options = [];
  const now = new Date();
  for (let i = 0; i < numMonths; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    const selected = (y === selectedYear && m === selectedMonth) ? ' selected' : '';
    options.push(`<option value="${y}-${m}"${selected}>${formatMonthLabel(y, m)}</option>`);
  }
  return options.join('');
}

function parseYearMonth(str) {
  const [y, m] = str.split('-').map(Number);
  return { year: y, month: m };
}

// =============================================
// Confirm Dialog
// =============================================
function showConfirm(message, onConfirm, title = '確認操作') {
  // Use Bootstrap modal if available, else native confirm
  if (typeof bootstrap !== 'undefined') {
    let modal = document.getElementById('confirmModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'confirmModal';
      modal.className = 'modal fade';
      modal.tabIndex = -1;
      modal.innerHTML = `
        <div class="modal-dialog modal-sm">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title">${title}</h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body" id="confirmModalBody">${message}</div>
            <div class="modal-footer">
              <button type="button" class="btn btn-outline" data-bs-dismiss="modal">取消</button>
              <button type="button" class="btn btn-danger" id="confirmModalOk">確認</button>
            </div>
          </div>
        </div>`;
      document.body.appendChild(modal);
    }
    document.getElementById('confirmModalBody').textContent = message;
    const bsModal = new bootstrap.Modal(modal);
    const okBtn = document.getElementById('confirmModalOk');
    const handler = () => {
      bsModal.hide();
      onConfirm();
      okBtn.removeEventListener('click', handler);
    };
    okBtn.addEventListener('click', handler);
    bsModal.show();
  } else {
    if (confirm(message)) onConfirm();
  }
}

// =============================================
// Highlight search term in text
// =============================================
function highlight(text, search) {
  if (!search) return text;
  const re = new RegExp(`(${search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  return String(text).replace(re, '<mark>$1</mark>');
}

// =============================================
// Debounce
// =============================================
function debounce(fn, delay = 300) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

// =============================================
// Set active nav link
// =============================================
function setActiveNav() {
  const currentPage = location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.sidebar-nav a').forEach(a => {
    const href = a.getAttribute('href') || '';
    a.classList.toggle('active', href === currentPage || (currentPage === '' && href === 'index.html'));
  });
}

// Run on DOM ready
document.addEventListener('DOMContentLoaded', setActiveNav);
