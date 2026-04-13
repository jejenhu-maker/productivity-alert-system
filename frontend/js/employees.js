/**
 * Employee Management Page Logic
 */

let allEmployees = [];
let allStores = [];
let editingEmployeeId = null;
let employeeModal = null;

document.addEventListener('DOMContentLoaded', async () => {
  await loadStores();
  await loadEmployees();
  initSearch();
  initFilters();
  bindModalEvents();
});

async function loadStores() {
  try {
    const result = await api.get('/stores');
    allStores = result.data;
    populateStoreFilter();
    populateStoreSelect();
  } catch (err) {
    showToast('載入門市失敗: ' + err.message, 'error');
  }
}

async function loadEmployees() {
  showTableLoading();
  try {
    const storeFilter = document.getElementById('storeFilter');
    const params = {};
    if (storeFilter && storeFilter.value) params.store_id = storeFilter.value;

    const result = await api.get('/employees', params);
    allEmployees = result.data;
    renderEmployeeTable(allEmployees);
    updateStats();
  } catch (err) {
    showToast('載入員工失敗: ' + err.message, 'error');
    showTableEmpty('載入失敗');
  }
}

function populateStoreFilter() {
  const el = document.getElementById('storeFilter');
  if (!el) return;
  el.innerHTML = `<option value="">全部門市</option>` +
    allStores.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
}

function populateStoreSelect(selectedId = null) {
  const el = document.getElementById('empStoreId');
  if (!el) return;
  el.innerHTML = `<option value="">請選擇門市</option>` +
    allStores.map(s => `<option value="${s.id}" ${s.id == selectedId ? 'selected' : ''}>${s.name}</option>`).join('');
}

function initFilters() {
  const storeFilter = document.getElementById('storeFilter');
  if (storeFilter) storeFilter.addEventListener('change', () => loadEmployees());
}

function initSearch() {
  const searchInput = document.getElementById('searchInput');
  if (!searchInput) return;
  searchInput.addEventListener('input', debounce(() => {
    const q = searchInput.value.trim().toLowerCase();
    const filtered = q
      ? allEmployees.filter(e =>
          e.name.toLowerCase().includes(q) ||
          e.position.includes(q) ||
          e.store_name.includes(q)
        )
      : allEmployees;
    renderEmployeeTable(filtered, q);
  }, 200));
}

function renderEmployeeTable(employees, searchTerm = '') {
  const tbody = document.getElementById('employeeTableBody');
  if (!tbody) return;

  if (!employees || employees.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="text-center py-4 text-muted">暫無員工資料</td></tr>`;
    return;
  }

  tbody.innerHTML = employees.map(emp => {
    const weight = emp.total_weight || 1;
    const nameHl = highlight(emp.name, searchTerm);
    const storeHl = highlight(emp.store_name, searchTerm);

    return `
      <tr>
        <td>
          <div class="fw-600">${nameHl}</div>
          <div class="text-muted fs-xs">ID: ${emp.id}</div>
        </td>
        <td>${storeHl}</td>
        <td>${positionBadge(emp.position)}</td>
        <td>${emp.hire_date}</td>
        <td>
          <span class="${emp.seniority_years >= 3 ? 'text-success' : emp.seniority_years >= 1 ? 'text-warning' : 'text-danger'} fw-600">
            ${emp.seniority_years.toFixed(1)} 年
          </span>
        </td>
        <td>
          <span class="weight-badge">${weight.toFixed(3)}</span>
          <div class="text-muted fs-xs" style="margin-top:2px;">
            年資×${emp.seniority_weight} 職位×${emp.position_weight ? emp.position_weight.toFixed(2) : '?'}
          </div>
        </td>
        <td>NT$${formatNumber(emp.hourly_rate)}/hr</td>
        <td>
          <div class="d-flex gap-2">
            <button class="btn btn-outline btn-sm" onclick="openEditModal(${emp.id})" title="編輯">
              <i class="bi bi-pencil"></i>
            </button>
            <button class="btn btn-danger btn-sm" onclick="deleteEmployee(${emp.id}, '${emp.name}')" title="停用">
              <i class="bi bi-person-x"></i>
            </button>
          </div>
        </td>
      </tr>`;
  }).join('');
}

function updateStats() {
  const total = allEmployees.length;
  const active = allEmployees.filter(e => e.active === 1).length;
  const el = document.getElementById('empStats');
  if (el) el.textContent = `共 ${total} 位員工`;
}

// =============================================
// Modal
// =============================================
function bindModalEvents() {
  const modalEl = document.getElementById('employeeModal');
  if (!modalEl) return;
  employeeModal = new bootstrap.Modal(modalEl);

  const form = document.getElementById('employeeForm');
  if (form) form.addEventListener('submit', handleEmployeeSubmit);

  // Auto-calculate seniority preview
  ['empHireDate', 'empSeniority'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', updateWeightPreview);
  });
  const posSel = document.getElementById('empPosition');
  if (posSel) posSel.addEventListener('change', updateWeightPreview);
}

function openAddModal() {
  editingEmployeeId = null;
  document.getElementById('employeeModalTitle').textContent = '新增員工';
  document.getElementById('employeeForm').reset();
  populateStoreSelect();
  updateWeightPreview();
  employeeModal.show();
}

async function openEditModal(id) {
  try {
    const result = await api.get(`/employees/${id}`);
    const emp = result.data;
    editingEmployeeId = id;

    document.getElementById('employeeModalTitle').textContent = '編輯員工';
    populateStoreSelect(emp.store_id);
    document.getElementById('empStoreId').value = emp.store_id;
    document.getElementById('empName').value = emp.name;
    document.getElementById('empPosition').value = emp.position;
    document.getElementById('empHireDate').value = emp.hire_date;
    document.getElementById('empSeniority').value = emp.seniority_years;
    document.getElementById('empHourlyRate').value = emp.hourly_rate;

    updateWeightPreview();
    employeeModal.show();
  } catch (err) {
    showToast('載入員工資料失敗: ' + err.message, 'error');
  }
}

function updateWeightPreview() {
  const seniority = parseFloat(document.getElementById('empSeniority')?.value) || 0;
  const position = document.getElementById('empPosition')?.value || '';

  const senWeight = seniority >= 3 ? 1.2 : seniority >= 1 ? 1.0 : 0.8;
  const posWeights = { '店長': 1.3, '副店長': 1.15, '藥師': 1.2, '正職': 1.0, '兼職': 0.85 };
  const posWeight = posWeights[position] || 1.0;
  const totalWeight = (senWeight * posWeight).toFixed(3);

  const preview = document.getElementById('weightPreview');
  if (preview) {
    preview.innerHTML = `加權係數: <strong>${totalWeight}</strong> (年資 ${senWeight} × 職位 ${posWeight})`;
  }
}

async function handleEmployeeSubmit(e) {
  e.preventDefault();
  const btn = document.getElementById('empSubmitBtn');
  btn.disabled = true;
  btn.textContent = '儲存中...';

  const payload = {
    store_id: document.getElementById('empStoreId').value,
    name: document.getElementById('empName').value.trim(),
    position: document.getElementById('empPosition').value,
    hire_date: document.getElementById('empHireDate').value,
    seniority_years: parseFloat(document.getElementById('empSeniority').value) || 0,
    hourly_rate: parseFloat(document.getElementById('empHourlyRate').value) || 200,
    active: 1,
  };

  try {
    if (editingEmployeeId) {
      await api.put(`/employees/${editingEmployeeId}`, payload);
      showToast('員工資料已更新', 'success');
    } else {
      await api.post('/employees', payload);
      showToast('員工已新增', 'success');
    }
    employeeModal.hide();
    await loadEmployees();
  } catch (err) {
    showToast('儲存失敗: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = '儲存';
  }
}

function deleteEmployee(id, name) {
  showConfirm(`確定要停用員工「${name}」嗎？`, async () => {
    try {
      await api.delete(`/employees/${id}`);
      showToast(`員工「${name}」已停用`, 'success');
      await loadEmployees();
    } catch (err) {
      showToast('操作失敗: ' + err.message, 'error');
    }
  });
}

function showTableLoading() {
  const tbody = document.getElementById('employeeTableBody');
  if (tbody) tbody.innerHTML = `<tr><td colspan="8" class="text-center py-4"><div class="spinner" style="margin:auto"></div></td></tr>`;
}

function showTableEmpty(msg = '暫無資料') {
  const tbody = document.getElementById('employeeTableBody');
  if (tbody) tbody.innerHTML = `<tr><td colspan="8" class="text-center py-4 text-muted">${msg}</td></tr>`;
}

// =============================================
// Export / Import
// =============================================
function showImportModeDialog() {
  return new Promise((resolve) => {
    let modal = document.getElementById('importModeModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'importModeModal';
      modal.className = 'modal fade';
      modal.tabIndex = -1;
      modal.innerHTML = `
        <div class="modal-dialog modal-sm">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title">選擇匯入模式</h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
              <p class="mb-3" style="font-size:0.88rem;">請選擇匯入方式：</p>
              <div class="d-grid gap-2">
                <button class="btn btn-primary" id="importModeMerge">
                  <i class="bi bi-arrow-left-right"></i> 合併更新
                  <div style="font-size:0.75rem;font-weight:normal;opacity:0.8;">保留現有資料，依員工ID更新或新增</div>
                </button>
                <button class="btn btn-danger" id="importModeReplace">
                  <i class="bi bi-arrow-repeat"></i> 清空重新匯入
                  <div style="font-size:0.75rem;font-weight:normal;opacity:0.8;">刪除所有現有員工，用檔案內容取代</div>
                </button>
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-outline btn-sm" data-bs-dismiss="modal">取消</button>
            </div>
          </div>
        </div>`;
      document.body.appendChild(modal);
    }

    const bsModal = new bootstrap.Modal(modal);
    const mergeBtn = document.getElementById('importModeMerge');
    const replaceBtn = document.getElementById('importModeReplace');

    function cleanup() {
      mergeBtn.removeEventListener('click', onMerge);
      replaceBtn.removeEventListener('click', onReplace);
      modal.removeEventListener('hidden.bs.modal', onHidden);
    }
    function onMerge() { cleanup(); bsModal.hide(); resolve('merge'); }
    function onReplace() {
      if (confirm('❗ 確定要刪除所有現有員工再匯入嗎？\n此操作無法復原！')) {
        cleanup(); bsModal.hide(); resolve('replace');
      }
    }
    function onHidden() { cleanup(); resolve(null); }

    mergeBtn.addEventListener('click', onMerge);
    replaceBtn.addEventListener('click', onReplace);
    modal.addEventListener('hidden.bs.modal', onHidden);
    bsModal.show();
  });
}

function exportEmployees() {
  window.location.href = `${API_BASE}/employees/export`;
}

async function importEmployees(input) {
  const file = input.files[0];
  if (!file) return;

  // Ask user for import mode
  const mode = await showImportModeDialog();
  if (!mode) { input.value = ''; return; } // cancelled

  const formData = new FormData();
  formData.append('file', file);
  formData.append('mode', mode);

  try {
    showToast('匯入中...', 'info');
    const res = await fetch(`${API_BASE}/employees/import`, {
      method: 'POST',
      body: formData,
    });
    const data = await res.json();

    if (data.success) {
      let msg = data.message;
      if (data.errors && data.errors.length > 0) {
        const errMsgs = data.errors.slice(0, 5).map(e =>
          `第${e.row}行 ${e.name}: ${e.errors.join(', ')}`
        ).join('\n');
        msg += '\n\n錯誤明細:\n' + errMsgs;
        if (data.errors.length > 5) msg += `\n...另有 ${data.errors.length - 5} 筆錯誤`;
        showToast(`匯入完成，但有 ${data.errors.length} 筆錯誤`, 'warning', 6000);
        alert(msg);
      } else {
        showToast(data.message, 'success');
      }
      await loadEmployees();
    } else {
      showToast(data.message || '匯入失敗', 'error');
    }
  } catch (err) {
    showToast('匯入失敗: ' + err.message, 'error');
  } finally {
    input.value = ''; // reset file input
  }
}
