/**
 * Dynamic QR Code Studio - Frontend Controller
 */

// State
let allQRCodes = [];
let activeConfig = {};
let selectedColor = '#000000';
let activeEditQrId = null;

// DOM Elements
const qrGrid = document.getElementById('qrGrid');
const searchInput = document.getElementById('searchInput');
const statusFilter = document.getElementById('statusFilter');
const sortFilter = document.getElementById('sortFilter');
const btnRefresh = document.getElementById('btnRefresh');

// Stats Elements
const statTotalQr = document.getElementById('statTotalQr');
const statActiveQr = document.getElementById('statActiveQr');
const statTotalScans = document.getElementById('statTotalScans');
const statTotalOrders = document.getElementById('statTotalOrders');

// Modals
const createModal = document.getElementById('createModal');
const editModal = document.getElementById('editModal');
const configModal = document.getElementById('configModal');

// Create Modal Inputs
const inputQrId = document.getElementById('inputQrId');
const inputOrderId = document.getElementById('inputOrderId');
const inputTitle = document.getElementById('inputTitle');
const inputTargetUrl = document.getElementById('inputTargetUrl');
const inputTransparentBg = document.getElementById('inputTransparentBg');
const inputCustomColor = document.getElementById('inputCustomColor');
const inputNotes = document.getElementById('inputNotes');
const createPreviewImg = document.getElementById('createPreviewImg');
const createPreviewPlaceholder = document.getElementById('createPreviewPlaceholder');
const createPreviewUrl = document.getElementById('createPreviewUrl');

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
  initEventListeners();
  loadConfig();
  loadStats();
  loadQRCodes();
});

function initEventListeners() {
  // Search & Filters
  searchInput.addEventListener('input', debounce(renderFilteredList, 200));
  statusFilter.addEventListener('change', renderFilteredList);
  sortFilter.addEventListener('change', renderFilteredList);
  btnRefresh.addEventListener('click', () => {
    loadStats();
    loadQRCodes();
  });

  // Modal Open/Close
  document.getElementById('btnOpenCreate').addEventListener('click', openCreateModal);
  document.getElementById('btnCloseCreate').addEventListener('click', closeCreateModal);
  document.getElementById('btnCancelCreate').addEventListener('click', closeCreateModal);
  document.getElementById('btnSubmitCreate').addEventListener('click', handleCreateQRCode);

  document.getElementById('btnCloseEdit').addEventListener('click', closeEditModal);
  document.getElementById('btnCancelEdit').addEventListener('click', closeEditModal);
  document.getElementById('btnSaveEdit').addEventListener('click', handleSaveEdit);

  document.getElementById('btnOpenConfig').addEventListener('click', openConfigModal);
  document.getElementById('btnCloseConfig').addEventListener('click', closeConfigModal);
  document.getElementById('btnCancelConfig').addEventListener('click', closeConfigModal);
  document.getElementById('btnSaveConfig').addEventListener('click', handleSaveConfig);

  // Auto-generate QRID
  document.getElementById('btnAutoGenerateQrId').addEventListener('click', fetchSuggestedQrId);

  // Color Swatches
  document.querySelectorAll('.color-swatch').forEach(swatch => {
    swatch.addEventListener('click', () => {
      document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
      swatch.classList.add('active');
      selectedColor = swatch.dataset.color;
      inputCustomColor.value = selectedColor;
      updateCreatePreview();
    });
  });

  inputCustomColor.addEventListener('input', (e) => {
    document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
    selectedColor = e.target.value;
    updateCreatePreview();
  });

  inputTransparentBg.addEventListener('change', updateCreatePreview);
  inputQrId.addEventListener('input', updateCreatePreview);

  // Host Config Presets
  document.getElementById('btnUseLanIp').addEventListener('click', () => {
    if (activeConfig.auto_detected_lan_url) {
      document.getElementById('configBaseUrl').value = activeConfig.auto_detected_lan_url;
    }
  });

  document.getElementById('btnUseLocalhost').addEventListener('click', () => {
    document.getElementById('configBaseUrl').value = window.location.origin;
  });

  // Batch PDF Sheet
  document.getElementById('btnBatchPdf').addEventListener('click', () => {
    const searchVal = encodeURIComponent(searchInput.value.trim());
    window.open(`/api/batch/pdf?search=${searchVal}`, '_blank');
  });

  // Close dropdowns on outside click
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.download-dropdown')) {
      document.querySelectorAll('.dropdown-menu').forEach(menu => menu.classList.remove('show'));
    }
  });
}

// ==================== DATA FETCHING ====================

async function loadStats() {
  try {
    const res = await fetch('/api/stats');
    if (res.ok) {
      const data = await res.json();
      statTotalQr.textContent = data.total_qr || 0;
      statActiveQr.textContent = data.active_count || 0;
      statTotalScans.textContent = data.total_scans || 0;
      statTotalOrders.textContent = data.total_orders || 0;
    }
  } catch (err) {
    console.error('Failed to load stats:', err);
  }
}

async function loadConfig() {
  try {
    const res = await fetch('/api/config');
    if (res.ok) {
      activeConfig = await res.json();
      document.getElementById('lanIpDisplay').textContent = activeConfig.local_ip || 'Auto';
      document.getElementById('configBaseUrl').value = activeConfig.configured_base_url || activeConfig.active_base_url;
    }
  } catch (err) {
    console.error('Failed to load config:', err);
  }
}

async function loadQRCodes() {
  try {
    qrGrid.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">⏳</div>
        <h3>Loading Dynamic QR Codes...</h3>
        <p>Fetching records from local database</p>
      </div>
    `;
    const res = await fetch('/api/qrcodes');
    if (res.ok) {
      allQRCodes = await res.json();
      renderFilteredList();
    } else {
      showToast('Error loading QR codes from server', 'error');
    }
  } catch (err) {
    console.error(err);
    showToast('Failed to connect to backend', 'error');
  }
}

// ==================== RENDERING & FILTERING ====================

function renderFilteredList() {
  const searchTerm = searchInput.value.trim().toLowerCase();
  const statusVal = statusFilter.value;
  const sortVal = sortFilter.value;

  let filtered = allQRCodes.filter(item => {
    const matchesSearch = !searchTerm || 
      item.qr_id.toLowerCase().includes(searchTerm) ||
      (item.order_id && item.order_id.toLowerCase().includes(searchTerm)) ||
      item.title.toLowerCase().includes(searchTerm) ||
      item.target_url.toLowerCase().includes(searchTerm);

    const matchesStatus = !statusVal || item.status === statusVal;

    return matchesSearch && matchesStatus;
  });

  // Sorting
  if (sortVal === 'scans') {
    filtered.sort((a, b) => (b.scan_count || 0) - (a.scan_count || 0));
  } else if (sortVal === 'order') {
    filtered.sort((a, b) => (a.order_id || '').localeCompare(b.order_id || ''));
  } else if (sortVal === 'title') {
    filtered.sort((a, b) => a.title.localeCompare(b.title));
  } else {
    // Newest first (id desc)
    filtered.sort((a, b) => b.id - a.id);
  }

  if (filtered.length === 0) {
    qrGrid.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🔍</div>
        <h3>No Dynamic QR Codes Found</h3>
        <p>${searchTerm ? `No results matching "${searchTerm}". Try a different keyword or filter.` : 'You haven\'t created any dynamic QR codes yet. Click the button below to generate one!'}</p>
        <button class="btn btn-primary" onclick="openCreateModal()">➕ Create Your First QR Code</button>
      </div>
    `;
    return;
  }

  qrGrid.innerHTML = filtered.map(item => createCardHTML(item)).join('');

  // Attach event handlers to card elements
  attachCardEvents();
}

function createCardHTML(item) {
  const isTransparent = item.transparent_bg === 1 || item.transparent_bg === true;
  const isActive = item.status === 'active';
  const colorHex = encodeURIComponent(item.color || '#000000');
  const qrImgSrc = `/api/qrcodes/${item.qr_id}/image?size=280&transparent=true&color=${colorHex}&v=${encodeURIComponent(item.updated_at)}`;

  return `
    <div class="qr-card" data-qrid="${item.qr_id}">
      <div class="card-header">
        <div class="card-title-group">
          <div class="card-title" title="${escapeHtml(item.title)}">${escapeHtml(item.title)}</div>
          <div class="badges-row">
            <span class="badge badge-qrid" title="Click to copy QRID" data-action="copy-qrid" data-text="${item.qr_id}">
              ⚡ ${item.qr_id}
            </span>
            ${item.order_id ? `
              <span class="badge badge-order" title="Order ID (Click to filter)" data-action="filter-order" data-order="${escapeHtml(item.order_id)}">
                📦 ${escapeHtml(item.order_id)}
              </span>
            ` : ''}
            <span class="badge badge-status ${isActive ? 'active' : 'paused'}">
              <span class="status-dot ${isActive ? 'active' : 'paused'}"></span>
              ${isActive ? 'Active' : 'Paused'}
            </span>
          </div>
        </div>
      </div>

      <div class="card-content-layout">
        <!-- Transparent Checkerboard Pattern Preview -->
        <div class="transparent-canvas-box" title="Transparent QR Code (Alpha Checkerboard)">
          <img src="${qrImgSrc}" alt="QR ${item.qr_id}" loading="lazy">
        </div>

        <div class="card-links-info">
          <div class="info-item">
            <span class="info-label">Dynamic Redirect Link:</span>
            <div class="redirect-chip" title="Click to copy redirect link" data-action="copy-redirect" data-url="${item.redirect_url}">
              <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 170px;">
                ${item.redirect_url}
              </span>
              <span style="opacity: 0.8; margin-left: 6px;">📋</span>
            </div>
          </div>

          <div class="info-item">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <span class="info-label">Destination URL:</span>
              <button class="btn btn-secondary btn-sm" style="padding: 2px 6px; font-size: 0.72rem;" data-action="edit-dest">
                ✏️ Edit
              </button>
            </div>
            <a href="${escapeHtml(item.target_url)}" target="_blank" rel="noopener noreferrer" class="url-truncate" title="Open Destination">
              🔗 ${escapeHtml(item.target_url)}
            </a>
          </div>

          <div style="display: flex; align-items: center; justify-content: space-between; margin-top: 4px;">
            <div class="scan-stat-chip">
              <span>📈 Scans:</span>
              <strong style="color: #ffffff; font-size: 0.9rem;">${item.scan_count || 0}</strong>
            </div>
            <a href="${item.redirect_url}" target="_blank" class="btn btn-secondary btn-sm" style="font-size: 0.75rem; padding: 3px 8px;" title="Test redirect as scanner">
              ⚡ Test Scan
            </a>
          </div>
        </div>
      </div>

      <div class="card-actions">
        <!-- Download Dropdown -->
        <div class="download-dropdown">
          <button class="btn btn-primary btn-sm" data-action="toggle-download">
            <span>💾</span> Download ▼
          </button>
          <div class="dropdown-menu">
            <a class="dropdown-item" href="/api/qrcodes/${item.qr_id}/image?size=1024&transparent=true&download=true">
              <span>🖼️</span> Transparent PNG (1024px)
            </a>
            <a class="dropdown-item" href="/api/qrcodes/${item.qr_id}/image?size=2048&transparent=true&download=true">
              <span>📐</span> Ultra Print PNG (2048px)
            </a>
            <a class="dropdown-item" href="/api/qrcodes/${item.qr_id}/svg?download=true">
              <span>✨</span> Vector SVG (Transparent)
            </a>
            <a class="dropdown-item" href="/api/qrcodes/${item.qr_id}/pdf" target="_blank">
              <span>📄</span> Printable PDF Label Sheet
            </a>
          </div>
        </div>

        <div style="display: flex; gap: 6px;">
          <button class="btn btn-secondary btn-sm" data-action="toggle-status" title="${isActive ? 'Pause redirect' : 'Resume redirect'}">
            ${isActive ? '⏸️ Pause' : '▶️ Resume'}
          </button>
          <button class="btn btn-danger-outline btn-sm btn-icon" data-action="delete" title="Delete QR Code">
            🗑️
          </button>
        </div>
      </div>
    </div>
  `;
}

function attachCardEvents() {
  document.querySelectorAll('.qr-card').forEach(card => {
    const qrId = card.dataset.qrid;
    const item = allQRCodes.find(q => q.qr_id === qrId);
    if (!item) return;

    // Copy QRID
    card.querySelectorAll('[data-action="copy-qrid"]').forEach(el => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        copyToClipboard(item.qr_id, `Copied QRID: ${item.qr_id}`);
      });
    });

    // Filter by Order ID
    card.querySelectorAll('[data-action="filter-order"]').forEach(el => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const order = el.dataset.order;
        searchInput.value = order;
        renderFilteredList();
      });
    });

    // Copy Redirect Link
    card.querySelectorAll('[data-action="copy-redirect"]').forEach(el => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        copyToClipboard(item.redirect_url, 'Copied Dynamic Redirect URL to clipboard!');
      });
    });

    // Edit Destination
    card.querySelectorAll('[data-action="edit-dest"]').forEach(el => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        openEditModal(item);
      });
    });

    // Download dropdown toggle
    card.querySelectorAll('[data-action="toggle-download"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const dropdown = btn.parentElement.querySelector('.dropdown-menu');
        document.querySelectorAll('.dropdown-menu').forEach(m => {
          if (m !== dropdown) m.classList.remove('show');
        });
        dropdown.classList.toggle('show');
      });
    });

    // Toggle status (Active / Paused)
    card.querySelectorAll('[data-action="toggle-status"]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const newStatus = item.status === 'active' ? 'paused' : 'active';
        await updateQRStatus(item.qr_id, newStatus);
      });
    });

    // Delete
    card.querySelectorAll('[data-action="delete"]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (confirm(`Are you sure you want to delete dynamic QR code "${item.qr_id}" (${item.title})?`)) {
          await deleteQRCode(item.qr_id);
        }
      });
    });
  });
}

// ==================== MODAL ACTIONS ====================

async function openCreateModal() {
  createModal.classList.add('active');
  inputTitle.value = '';
  inputTargetUrl.value = '';
  inputOrderId.value = '';
  inputNotes.value = '';
  inputTransparentBg.checked = true;

  await fetchSuggestedQrId();
  updateCreatePreview();
}

function closeCreateModal() {
  createModal.classList.remove('active');
}

async function fetchSuggestedQrId() {
  try {
    const res = await fetch('/api/suggest-id');
    if (res.ok) {
      const data = await res.json();
      inputQrId.value = data.suggested_id;
      updateCreatePreview();
    }
  } catch (err) {
    console.error(err);
  }
}

function updateCreatePreview() {
  const qrId = inputQrId.value.trim() || 'QR-DEMO';
  const base = activeConfig.active_base_url || window.location.origin;
  const redirectUrl = `${base.replace(/\/$/, '')}/r/${qrId}`;
  createPreviewUrl.textContent = redirectUrl;

  const colorHex = encodeURIComponent(selectedColor);
  const isTrans = inputTransparentBg.checked;
  const previewSrc = `/api/qrcodes/${qrId}/image?size=260&transparent=${isTrans}&color=${colorHex}`;

  createPreviewPlaceholder.style.display = 'none';
  createPreviewImg.style.display = 'block';
  createPreviewImg.src = previewSrc;
}

async function handleCreateQRCode() {
  const qr_id = inputQrId.value.trim();
  const order_id = inputOrderId.value.trim();
  const title = inputTitle.value.trim();
  const target_url = inputTargetUrl.value.trim();
  const notes = inputNotes.value.trim();
  const transparent_bg = inputTransparentBg.checked;

  if (!qr_id) {
    showToast('Please specify a QR ID', 'error');
    inputQrId.focus();
    return;
  }
  if (!title) {
    showToast('Please provide a Title/Label', 'error');
    inputTitle.focus();
    return;
  }
  if (!target_url) {
    showToast('Please enter the Target Destination URL', 'error');
    inputTargetUrl.focus();
    return;
  }

  try {
    const res = await fetch('/api/qrcodes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        qr_id,
        order_id,
        title,
        target_url,
        color: selectedColor,
        transparent_bg,
        notes
      })
    });

    if (res.ok) {
      const created = await res.json();
      showToast(`Dynamic QR Code ${created.qr_id} created successfully!`, 'success');
      closeCreateModal();
      loadStats();
      loadQRCodes();
    } else {
      const err = await res.json();
      showToast(err.detail || 'Failed to create QR code', 'error');
    }
  } catch (err) {
    console.error(err);
    showToast('Network error while creating QR code', 'error');
  }
}

// ==================== EDIT DESTINATION ====================

function openEditModal(item) {
  activeEditQrId = item.qr_id;
  document.getElementById('editModalQrid').textContent = item.qr_id;
  document.getElementById('editTitle').value = item.title;
  document.getElementById('editOrderId').value = item.order_id || '';
  document.getElementById('editTargetUrl').value = item.target_url;
  document.getElementById('editStatus').value = item.status;
  editModal.classList.add('active');
}

function closeEditModal() {
  editModal.classList.remove('active');
  activeEditQrId = null;
}

async function handleSaveEdit() {
  if (!activeEditQrId) return;

  const title = document.getElementById('editTitle').value.trim();
  const order_id = document.getElementById('editOrderId').value.trim();
  const target_url = document.getElementById('editTargetUrl').value.trim();
  const status = document.getElementById('editStatus').value;

  if (!target_url) {
    showToast('Destination URL cannot be empty', 'error');
    return;
  }

  try {
    const res = await fetch(`/api/qrcodes/${activeEditQrId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title,
        order_id,
        target_url,
        status
      })
    });

    if (res.ok) {
      showToast('Destination updated! Any scan will now redirect to the new URL.', 'success');
      closeEditModal();
      loadStats();
      loadQRCodes();
    } else {
      const err = await res.json();
      showToast(err.detail || 'Failed to update QR code', 'error');
    }
  } catch (err) {
    console.error(err);
    showToast('Error updating QR code', 'error');
  }
}

async function updateQRStatus(qrId, newStatus) {
  try {
    const res = await fetch(`/api/qrcodes/${qrId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus })
    });
    if (res.ok) {
      showToast(`QR Code status set to ${newStatus}`, 'success');
      loadStats();
      loadQRCodes();
    }
  } catch (err) {
    showToast('Failed to update status', 'error');
  }
}

async function deleteQRCode(qrId) {
  try {
    const res = await fetch(`/api/qrcodes/${qrId}`, { method: 'DELETE' });
    if (res.ok) {
      showToast(`Deleted ${qrId}`, 'success');
      loadStats();
      loadQRCodes();
    }
  } catch (err) {
    showToast('Failed to delete QR Code', 'error');
  }
}

// ==================== CONFIG MODAL ====================

function openConfigModal() {
  configModal.classList.add('active');
  loadConfig();
}

function closeConfigModal() {
  configModal.classList.remove('active');
}

async function handleSaveConfig() {
  const base_url = document.getElementById('configBaseUrl').value.trim();
  if (!base_url) {
    showToast('Base URL is required', 'error');
    return;
  }

  try {
    const res = await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ base_url })
    });
    if (res.ok) {
      showToast('Host configuration saved! QR codes updated.', 'success');
      closeConfigModal();
      loadConfig();
      loadQRCodes();
    }
  } catch (err) {
    showToast('Failed to save configuration', 'error');
  }
}

// ==================== UTILITIES ====================

function copyToClipboard(text, message = 'Copied to clipboard!') {
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text).then(() => {
      showToast(message, 'success');
    }).catch(() => fallbackCopy(text, message));
  } else {
    fallbackCopy(text, message);
  }
}

function fallbackCopy(text, message) {
  const textArea = document.createElement('textarea');
  textArea.value = text;
  textArea.style.position = 'fixed';
  textArea.style.opacity = '0';
  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();
  try {
    document.execCommand('copy');
    showToast(message, 'success');
  } catch (err) {
    showToast('Copy failed, please copy manually', 'error');
  }
  document.body.removeChild(textArea);
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span>${type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️'}</span> <span>${escapeHtml(message)}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(20px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
