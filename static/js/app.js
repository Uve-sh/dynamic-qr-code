/**
 * Dynamic QR Code Studio - Frontend Controller
 * With Multi-User Isolation & Authentication
 */

// State
let currentUser = null;
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
const authModal = document.getElementById('authModal');

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

// ==================== AUTH TOKEN & API FETCH WRAPPER ====================

function getAuthToken() {
  return localStorage.getItem('qr_token') || '';
}

function setAuthToken(token) {
  if (token) {
    localStorage.setItem('qr_token', token);
  } else {
    localStorage.removeItem('qr_token');
  }
}

async function authFetch(url, options = {}) {
  const headers = options.headers || {};
  const token = getAuthToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  options.headers = headers;

  const res = await fetch(url, options);
  if (res.status === 401) {
    setAuthToken(null);
    currentUser = null;
    updateAuthUI();
    renderUnauthenticatedEmptyState();
    throw new Error('Authentication required');
  }
  return res;
}

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
  initEventListeners();
  checkAuthSession();
});

function initEventListeners() {
  // Search & Filters
  searchInput.addEventListener('input', debounce(renderFilteredList, 200));
  statusFilter.addEventListener('change', renderFilteredList);
  sortFilter.addEventListener('change', renderFilteredList);
  btnRefresh.addEventListener('click', () => {
    if (currentUser) {
      loadStats();
      loadQRCodes();
    } else {
      openAuthModal();
    }
  });

  // Modal Open/Close
  document.getElementById('btnOpenCreate').addEventListener('click', () => {
    if (!currentUser) {
      showToast('Please sign in to create QR codes', 'info');
      openAuthModal();
      return;
    }
    openCreateModal();
  });
  document.getElementById('btnCloseCreate').addEventListener('click', closeCreateModal);
  document.getElementById('btnCancelCreate').addEventListener('click', closeCreateModal);
  document.getElementById('btnSubmitCreate').addEventListener('click', handleCreateQRCode);

  document.getElementById('btnCloseEdit').addEventListener('click', closeEditModal);
  document.getElementById('btnCancelEdit').addEventListener('click', closeEditModal);
  document.getElementById('btnSaveEdit').addEventListener('click', handleSaveEdit);

  document.getElementById('btnOpenConfig').addEventListener('click', () => {
    if (!currentUser) {
      openAuthModal();
      return;
    }
    openConfigModal();
  });
  document.getElementById('btnCloseConfig').addEventListener('click', closeConfigModal);
  document.getElementById('btnCancelConfig').addEventListener('click', closeConfigModal);
  document.getElementById('btnSaveConfig').addEventListener('click', handleSaveConfig);

  // Auth Modal Listeners
  document.getElementById('btnOpenAuth').addEventListener('click', openAuthModal);
  document.getElementById('btnCloseAuth').addEventListener('click', closeAuthModal);
  document.getElementById('btnLogout').addEventListener('click', handleLogout);

  // Auth Tabs
  const tabSignIn = document.getElementById('tabSignIn');
  const tabSignUp = document.getElementById('tabSignUp');
  const formSignIn = document.getElementById('formSignIn');
  const formSignUp = document.getElementById('formSignUp');

  tabSignIn.addEventListener('click', () => {
    tabSignIn.classList.add('active');
    tabSignUp.classList.remove('active');
    formSignIn.style.display = 'block';
    formSignUp.style.display = 'none';
  });

  tabSignUp.addEventListener('click', () => {
    tabSignUp.classList.add('active');
    tabSignIn.classList.remove('active');
    formSignUp.style.display = 'block';
    formSignIn.style.display = 'none';
  });

  formSignIn.addEventListener('submit', handleLogin);
  formSignUp.addEventListener('submit', handleRegister);

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
    document.getElementById('configBaseUrl').value = 'http://localhost:8000';
  });

  // Batch PDF Button
  document.getElementById('btnBatchPdf').addEventListener('click', () => {
    if (!currentUser) {
      openAuthModal();
      return;
    }
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

// ==================== AUTHENTICATION FLOW ====================

async function checkAuthSession() {
  try {
    const res = await fetch('/api/auth/me', {
      headers: {
        'Authorization': `Bearer ${getAuthToken()}`
      }
    });
    if (res.ok) {
      const data = await res.json();
      if (data.authenticated && data.user) {
        currentUser = data.user;
        updateAuthUI();
        loadConfig();
        loadStats();
        loadQRCodes();
        return;
      }
    }
  } catch (err) {
    console.error('Session check failed:', err);
  }

  // Not authenticated
  currentUser = null;
  updateAuthUI();
  renderUnauthenticatedEmptyState();
  openAuthModal();
}

function updateAuthUI() {
  const guestSec = document.getElementById('authGuestSection');
  const userSec = document.getElementById('authUserSection');
  const userNameDisplay = document.getElementById('userNameDisplay');
  const userAvatar = document.getElementById('userAvatar');
  const userRoleBadge = document.getElementById('userRoleBadge');

  if (currentUser) {
    guestSec.style.display = 'none';
    userSec.style.display = 'inline-flex';
    userNameDisplay.textContent = currentUser.full_name || currentUser.username;
    userAvatar.textContent = (currentUser.username || 'U')[0].toUpperCase();
    userRoleBadge.textContent = currentUser.role || 'Member';
  } else {
    guestSec.style.display = 'inline-block';
    userSec.style.display = 'none';
  }
}

function openAuthModal() {
  authModal.classList.add('active');
}

function closeAuthModal() {
  // Only allow closing if already logged in
  if (currentUser) {
    authModal.classList.remove('active');
  } else {
    showToast('Please sign in or create an account to continue.', 'info');
  }
}

async function handleLogin(e) {
  if (e) e.preventDefault();
  const identifier = document.getElementById('loginIdentifier').value.trim();
  const password = document.getElementById('loginPassword').value;

  if (!identifier || !password) {
    showToast('Please fill in both fields', 'error');
    return;
  }

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier, password })
    });

    if (res.ok) {
      const data = await res.json();
      setAuthToken(data.token);
      currentUser = data.user;
      updateAuthUI();
      authModal.classList.remove('active');
      showToast(`Welcome back, ${currentUser.username}!`, 'success');
      loadConfig();
      loadStats();
      loadQRCodes();
    } else {
      const err = await res.json();
      showToast(err.detail || 'Sign in failed', 'error');
    }
  } catch (err) {
    showToast('Connection error during sign in', 'error');
  }
}

async function handleRegister(e) {
  if (e) e.preventDefault();
  const username = document.getElementById('regUsername').value.trim();
  const full_name = document.getElementById('regFullName').value.trim();
  const email = document.getElementById('regEmail').value.trim();
  const password = document.getElementById('regPassword').value;

  if (!username || !email || !password) {
    showToast('Please fill in all required fields', 'error');
    return;
  }

  try {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, full_name, email, password })
    });

    if (res.ok) {
      const data = await res.json();
      setAuthToken(data.token);
      currentUser = data.user;
      updateAuthUI();
      authModal.classList.remove('active');
      showToast(`Account created! Welcome, ${currentUser.username}!`, 'success');
      loadConfig();
      loadStats();
      loadQRCodes();
    } else {
      const err = await res.json();
      showToast(err.detail || 'Registration failed', 'error');
    }
  } catch (err) {
    showToast('Connection error during registration', 'error');
  }
}

async function handleLogout() {
  try {
    await fetch('/api/auth/logout', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${getAuthToken()}` }
    });
  } catch (err) {
    // Ignore error
  }
  setAuthToken(null);
  currentUser = null;
  updateAuthUI();
  allQRCodes = [];
  statTotalQr.textContent = '0';
  statActiveQr.textContent = '0';
  statTotalScans.textContent = '0';
  statTotalOrders.textContent = '0';
  renderUnauthenticatedEmptyState();
  openAuthModal();
  showToast('Logged out successfully', 'info');
}

function renderUnauthenticatedEmptyState() {
  qrGrid.innerHTML = `
    <div class="empty-state" style="grid-column: 1 / -1; padding: 4rem 2rem;">
      <div class="empty-icon">🔐</div>
      <h3 style="font-size: 1.4rem; margin-bottom: 0.5rem;">Private Team Workspace</h3>
      <p style="color: var(--text-secondary); max-width: 460px; margin: 0 auto 1.5rem auto;">
        Sign in to your private account to manage your own dynamic QR codes, track customer scans, and download print-ready assets.
      </p>
      <button class="btn btn-primary" onclick="openAuthModal()" style="margin: 0 auto;">
        <span>🔑</span> Sign In / Create Account
      </button>
    </div>
  `;
}

// ==================== DATA FETCHING ====================

async function loadStats() {
  if (!currentUser) return;
  try {
    const res = await authFetch('/api/stats');
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
  if (!currentUser) return;
  try {
    const res = await authFetch('/api/config');
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
  if (!currentUser) {
    renderUnauthenticatedEmptyState();
    return;
  }

  try {
    qrGrid.innerHTML = `
      <div class="empty-state" style="grid-column: 1 / -1;">
        <div class="empty-icon">⏳</div>
        <h3>Loading Dynamic QR Codes...</h3>
        <p>Fetching your private records</p>
      </div>
    `;
    const res = await authFetch('/api/qrcodes');
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
  if (!currentUser) {
    renderUnauthenticatedEmptyState();
    return;
  }

  const searchTerm = searchInput.value.trim().toLowerCase();
  const statusVal = statusFilter.value;
  const sortVal = sortFilter.value;

  let filtered = allQRCodes.filter(item => {
    const matchesSearch = !searchTerm ||
      (item.qr_id && item.qr_id.toLowerCase().includes(searchTerm)) ||
      (item.order_id && item.order_id.toLowerCase().includes(searchTerm)) ||
      (item.title && item.title.toLowerCase().includes(searchTerm)) ||
      (item.target_url && item.target_url.toLowerCase().includes(searchTerm));

    const matchesStatus = !statusVal || item.status === statusVal;
    return matchesSearch && matchesStatus;
  });

  // Sorting
  filtered.sort((a, b) => {
    if (sortVal === 'newest') return b.id - a.id;
    if (sortVal === 'scans') return (b.scan_count || 0) - (a.scan_count || 0);
    if (sortVal === 'order') return (a.order_id || '').localeCompare(b.order_id || '');
    if (sortVal === 'title') return (a.title || '').localeCompare(b.title || '');
    return 0;
  });

  if (filtered.length === 0) {
    qrGrid.innerHTML = `
      <div class="empty-state" style="grid-column: 1 / -1;">
        <div class="empty-icon">🔍</div>
        <h3>No QR Codes Found</h3>
        <p>${allQRCodes.length === 0 ? "You haven't created any dynamic QR codes yet. Click 'Create Dynamic QR' to get started!" : "No codes matched your filter criteria."}</p>
        ${allQRCodes.length === 0 ? `<button class="btn btn-primary" onclick="openCreateModal()" style="margin-top: 12px;"><span>➕</span> Create First QR Code</button>` : ''}
      </div>
    `;
    return;
  }

  qrGrid.innerHTML = filtered.map(item => renderQRCard(item)).join('');
  attachCardEvents();
}

function renderQRCard(item) {
  const isPaused = item.status === 'paused';
  const colorHex = encodeURIComponent(item.color || '#000000');
  const transparentFlag = item.transparent_bg ? 'true' : 'false';
  const previewImgSrc = `/api/qrcodes/${item.qr_id}/image?size=320&transparent=${transparentFlag}&color=${colorHex}`;

  return `
    <article class="qr-card ${isPaused ? 'paused' : ''}" data-qrid="${escapeHtml(item.qr_id)}">
      <!-- Card Header -->
      <div class="card-header">
        <div class="card-title-group">
          <h3 class="card-title" title="${escapeHtml(item.title)}">${escapeHtml(item.title)}</h3>
          <div class="badges-row">
            <span class="badge badge-qrid btnCopyQrId" data-text="${escapeHtml(item.qr_id)}" title="Click to copy QR ID">
              ${escapeHtml(item.qr_id)} 📋
            </span>
            ${item.order_id ? `
              <span class="badge badge-order" title="Order ID Reference">
                📦 ${escapeHtml(item.order_id)}
              </span>
            ` : ''}
            <span class="badge badge-status ${item.status}">
              <span class="status-dot ${item.status}"></span>
              ${item.status === 'active' ? 'Active' : 'Paused'}
            </span>
          </div>
        </div>
      </div>

      <!-- Card Body Content -->
      <div class="card-content-layout">
        <!-- Transparent Canvas Preview -->
        <div class="transparent-canvas-box" title="Transparent Background QR Code">
          <img src="${previewImgSrc}" alt="QR Code ${escapeHtml(item.qr_id)}" class="qr-image-display" loading="lazy">
        </div>

        <!-- Links & Meta -->
        <div class="card-links-info">
          <div class="info-item">
            <span class="info-label">Redirect Destination (Dynamic)</span>
            <a href="${escapeHtml(item.target_url)}" target="_blank" rel="noopener noreferrer" class="url-truncate" title="${escapeHtml(item.target_url)}">
              🔗 ${escapeHtml(item.target_url)}
            </a>
          </div>

          <div class="info-item">
            <span class="info-label">Permanent Dynamic Link</span>
            <div class="redirect-chip btnCopyUrl" data-text="${escapeHtml(item.redirect_url || '')}" title="Click to copy dynamic scan URL">
              <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(item.redirect_url || '')}</span>
              <span style="margin-left: 6px; flex-shrink: 0;">📋</span>
            </div>
          </div>

          <div class="info-item">
            <div class="scan-stat-chip">
              <span>📊 <strong>${item.scan_count || 0}</strong> scans</span>
              <span>&bull;</span>
              <span>Created ${formatDate(item.created_at)}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Card Footer Actions -->
      <div class="card-actions">
        <div style="display: flex; gap: 8px; align-items: center;">
          <button class="btn btn-secondary btn-sm btnEditDestination" data-qrid="${escapeHtml(item.qr_id)}">
            <span>✏️</span> Edit URL
          </button>
          <button class="btn btn-secondary btn-sm btnTogglePause" data-qrid="${escapeHtml(item.qr_id)}" data-status="${item.status}">
            <span>${isPaused ? '▶️ Resume' : '⏸️ Pause'}</span>
          </button>
        </div>

        <div style="display: flex; gap: 8px; align-items: center;">
          <!-- Download Dropdown -->
          <div class="download-dropdown">
            <button class="btn btn-primary btn-sm btnToggleDropdown">
              <span>⬇️</span> Export <span style="font-size: 0.65rem; margin-left: 2px;">▼</span>
            </button>
            <div class="dropdown-menu">
              <a href="/api/qrcodes/${escapeHtml(item.qr_id)}/image?size=2048&transparent=true&download=true" class="dropdown-item" download>
                <span>🖼️</span> High-Res PNG (Transparent)
              </a>
              <a href="/api/qrcodes/${escapeHtml(item.qr_id)}/svg?download=true" class="dropdown-item" download>
                <span>📐</span> Vector SVG (Infinite Scale)
              </a>
              <a href="/api/qrcodes/${escapeHtml(item.qr_id)}/pdf" class="dropdown-item" target="_blank">
                <span>📄</span> Printable Label PDF
              </a>
            </div>
          </div>

          <button class="btn btn-danger-outline btn-sm btnDelete" data-qrid="${escapeHtml(item.qr_id)}" title="Delete QR Code">
            🗑️
          </button>
        </div>
      </div>
    </article>
  `;
}

function attachCardEvents() {
  document.querySelectorAll('.btnCopyQrId').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      copyToClipboard(btn.dataset.text, `Copied QR ID: ${btn.dataset.text}`);
    });
  });

  document.querySelectorAll('.btnCopyUrl').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      copyToClipboard(btn.dataset.text, 'Dynamic redirect link copied to clipboard!');
    });
  });

  document.querySelectorAll('.btnEditDestination').forEach(btn => {
    btn.addEventListener('click', () => {
      const qrId = btn.dataset.qrid;
      const item = allQRCodes.find(q => q.qr_id === qrId);
      if (item) openEditModal(item);
    });
  });

  document.querySelectorAll('.btnTogglePause').forEach(btn => {
    btn.addEventListener('click', () => {
      const qrId = btn.dataset.qrid;
      const current = btn.dataset.status;
      const newStatus = current === 'active' ? 'paused' : 'active';
      updateQRStatus(qrId, newStatus);
    });
  });

  document.querySelectorAll('.btnDelete').forEach(btn => {
    btn.addEventListener('click', () => {
      const qrId = btn.dataset.qrid;
      if (confirm(`Are you sure you want to permanently delete dynamic QR code ${qrId}? Scanners will hit a 404 page.`)) {
        deleteQRCode(qrId);
      }
    });
  });

  document.querySelectorAll('.btnToggleDropdown').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const menu = btn.nextElementSibling;
      document.querySelectorAll('.dropdown-menu').forEach(m => {
        if (m !== menu) m.classList.remove('show');
      });
      menu.classList.toggle('show');
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
    const res = await authFetch('/api/suggest-id');
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
    const res = await authFetch('/api/qrcodes', {
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
    const res = await authFetch(`/api/qrcodes/${activeEditQrId}`, {
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
    const res = await authFetch(`/api/qrcodes/${qrId}`, {
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
    const res = await authFetch(`/api/qrcodes/${qrId}`, { method: 'DELETE' });
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
    const res = await authFetch('/api/config', {
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

function formatDate(isoStr) {
  if (!isoStr) return '';
  try {
    const d = new Date(isoStr);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return isoStr;
  }
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
