/**
 * Store Management Page Logic
 */

let allStoresData = [];
let editingStoreId = null;
let storeModal = null;

document.addEventListener('DOMContentLoaded', async () => {
  await loadStores();
  bindModalEvents();
});

async function loadStores() {
  showStoreListLoading();
  try {
    const result = await api.get('/stores');
    allStoresData = result.data;
    renderStoreList(allStoresData);
    renderStoreSummary(allStoresData);
  } catch (err) {
    showToast('載入門市失敗: ' + err.message, 'error');
  }
}

function renderStoreSummary(stores) {
  const el = document.getElementById('storeSummary');
  if (!el) return;
  const active = stores.filter(s => s.status === 'active').length;
  el.innerHTML = `
    <div class="summary-card blue">
      <div class="card-icon"><i class="bi bi-shop"></i></div>
      <div class="card-label">門市總數</div>
      <div class="card-value">${stores.length}</div>
      <div class="card-sub">所有門市</div>
    </div>
    <div class="summary-card green">
      <div class="card-icon"><i class="bi bi-check-circle"></i></div>
      <div class="card-label">營業中</div>
      <div class="card-value">${active}</div>
      <div class="card-sub">正常營業</div>
    </div>
    <div class="summary-card yellow">
      <div class="card-icon"><i class="bi bi-people"></i></div>
      <div class="card-label">員工總人數</div>
      <div class="card-value">${stores.reduce((s, st) => s + (st.employee_count || 0), 0)}</div>
      <div class="card-sub">所有在職員工</div>
    </div>
  `;
}

function renderStoreList(stores) {
  const tbody = document.getElementById('storeTableBody');
  if (!tbody) return;

  if (!stores || stores.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-center py-4 text-muted">暫無門市資料</td></tr>`;
    return;
  }

  tbody.innerHTML = stores.map(store => `
    <tr>
      <td>
        <div class="fw-600">${store.name}</div>
        <div class="text-muted fs-xs">建立: ${formatDate(store.created_at)}</div>
      </td>
      <td>
        <span class="store-code-badge" style="font-size:0.8rem;padding:3px 8px;">${store.code}</span>
      </td>
      <td>
        <div class="fw-600" style="color:#1a56db;">${formatNumber(store.target_productivity, 0)} NT$/hr</div>
      </td>
      <td>
        <span class="badge-status ${store.status === 'active' ? 'green' : 'gray'}">
          ${store.status === 'active' ? '🟢 營業中' : '⚫ 停用'}
        </span>
      </td>
      <td>${store.employee_count || 0} 人</td>
      <td>${formatDate(store.updated_at)}</td>
      <td>
        <div class="d-flex gap-2">
          <button class="btn btn-outline btn-sm" onclick="openEditStoreModal(${store.id})" title="編輯">
            <i class="bi bi-pencil"></i> 編輯
          </button>
          <button class="btn btn-outline btn-sm" onclick="viewStoreEmployees(${store.id}, '${store.name}')" title="查看員工">
            <i class="bi bi-people"></i>
          </button>
          ${store.status === 'active'
            ? `<button class="btn btn-danger btn-sm" onclick="deactivateStore(${store.id}, '${store.name}')">停用</button>`
            : `<button class="btn btn-success btn-sm" onclick="activateStore(${store.id}, '${store.name}')">啟用</button>`
          }
        </div>
      </td>
    </tr>`).join('');
}

// =============================================
// Modal
// =============================================
function bindModalEvents() {
  const modalEl = document.getElementById('storeModal');
  if (!modalEl) return;
  storeModal = new bootstrap.Modal(modalEl);

  const form = document.getElementById('storeForm');
  if (form) form.addEventListener('submit', handleStoreSubmit);
}

function openAddStoreModal() {
  editingStoreId = null;
  document.getElementById('storeModalTitle').textContent = '新增門市';
  document.getElementById('storeForm').reset();
  document.getElementById('storeStatus').value = 'active';
  storeModal.show();
}

async function openEditStoreModal(id) {
  try {
    const result = await api.get(`/stores/${id}`);
    const store = result.data;
    editingStoreId = id;

    document.getElementById('storeModalTitle').textContent = '編輯門市';
    document.getElementById('storeName').value = store.name;
    document.getElementById('storeCode').value = store.code;
    document.getElementById('storeTarget').value = store.target_productivity;
    document.getElementById('storeStatus').value = store.status;

    storeModal.show();
  } catch (err) {
    showToast('載入門市資料失敗: ' + err.message, 'error');
  }
}

async function handleStoreSubmit(e) {
  e.preventDefault();
  const btn = document.getElementById('storeSubmitBtn');
  btn.disabled = true;

  const payload = {
    name: document.getElementById('storeName').value.trim(),
    code: document.getElementById('storeCode').value.trim().toUpperCase(),
    target_productivity: parseFloat(document.getElementById('storeTarget').value),
    status: document.getElementById('storeStatus').value,
  };

  try {
    if (editingStoreId) {
      await api.put(`/stores/${editingStoreId}`, payload);
      showToast('門市資料已更新', 'success');
    } else {
      await api.post('/stores', payload);
      showToast('門市已新增', 'success');
    }
    storeModal.hide();
    await loadStores();
  } catch (err) {
    showToast('儲存失敗: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
  }
}

function deactivateStore(id, name) {
  showConfirm(`確定要停用門市「${name}」嗎？`, async () => {
    try {
      await api.delete(`/stores/${id}`);
      showToast(`門市「${name}」已停用`, 'success');
      await loadStores();
    } catch (err) {
      showToast('操作失敗: ' + err.message, 'error');
    }
  });
}

async function activateStore(id, name) {
  try {
    await api.put(`/stores/${id}`, { status: 'active' });
    showToast(`門市「${name}」已啟用`, 'success');
    await loadStores();
  } catch (err) {
    showToast('操作失敗: ' + err.message, 'error');
  }
}

async function viewStoreEmployees(storeId, storeName) {
  try {
    const result = await api.get('/employees', { store_id: storeId });
    const employees = result.data;

    let modal = document.getElementById('storeEmpModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'storeEmpModal';
      modal.className = 'modal fade';
      modal.tabIndex = -1;
      modal.innerHTML = `
        <div class="modal-dialog modal-lg">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title" id="storeEmpTitle"></h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body" id="storeEmpBody"></div>
          </div>
        </div>`;
      document.body.appendChild(modal);
    }

    document.getElementById('storeEmpTitle').textContent = `${storeName} — 員工名單`;
    document.getElementById('storeEmpBody').innerHTML = `
      <table class="table table-sm">
        <thead>
          <tr><th>姓名</th><th>職位</th><th>年資</th><th>加權係數</th><th>時薪</th><th>狀態</th></tr>
        </thead>
        <tbody>
          ${employees.length === 0
            ? `<tr><td colspan="6" class="text-center text-muted">無員工資料</td></tr>`
            : employees.map(e => `
              <tr>
                <td class="fw-600">${e.name}</td>
                <td>${positionBadge(e.position)}</td>
                <td>${e.seniority_years.toFixed(1)} 年</td>
                <td><span class="weight-badge">${e.total_weight}</span></td>
                <td>NT$${formatNumber(e.hourly_rate)}/hr</td>
                <td><span class="badge-status ${e.active ? 'green' : 'gray'}">${e.active ? '在職' : '離職'}</span></td>
              </tr>`).join('')
          }
        </tbody>
      </table>
    `;

    new bootstrap.Modal(modal).show();
  } catch (err) {
    showToast('載入員工失敗: ' + err.message, 'error');
  }
}

function showStoreListLoading() {
  const tbody = document.getElementById('storeTableBody');
  if (tbody) tbody.innerHTML = `<tr><td colspan="7" class="text-center py-4"><div class="spinner" style="margin:auto"></div></td></tr>`;
}
