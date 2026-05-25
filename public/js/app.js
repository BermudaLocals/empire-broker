/* ============================================================
   Empire Broker Pro — Shared Application Module
   ============================================================ */

const API = window.location.origin + '/api';

// ==================== API Helper ====================
async function api(endpoint, options = {}) {
  const token = localStorage.getItem('ebp_token');
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (token) headers['Authorization'] = 'Bearer ' + token;
  try {
    const res = await fetch(API + endpoint, { ...options, headers });
    if (res.status === 401) {
      localStorage.removeItem('ebp_token');
      localStorage.removeItem('ebp_user');
      window.location.href = '/';
      return null;
    }
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
  } catch (err) {
    console.error('API Error:', err);
    throw err;
  }
}

async function apiGet(endpoint) { return api(endpoint); }
async function apiPost(endpoint, body) { return api(endpoint, { method: 'POST', body: JSON.stringify(body) }); }
async function apiPut(endpoint, body) { return api(endpoint, { method: 'PUT', body: JSON.stringify(body) }); }
async function apiDelete(endpoint) { return api(endpoint, { method: 'DELETE' }); }

// ==================== Auth ====================
function getUser() {
  try { return JSON.parse(localStorage.getItem('ebp_user')); } catch { return null; }
}

function getToken() { return localStorage.getItem('ebp_token'); }

function isLoggedIn() { return !!getToken() && !!getUser(); }

function requireAuth() {
  if (!isLoggedIn()) { window.location.href = '/'; return false; }
  return true;
}

async function login(email, password) {
  const data = await apiPost('/auth/login', { email, password });
  if (data && data.token) {
    localStorage.setItem('ebp_token', data.token);
    localStorage.setItem('ebp_user', JSON.stringify(data.user));
    redirectToDashboard(data.user.role);
  }
  return data;
}

async function register(name, email, password, role, phone) {
  const data = await apiPost('/auth/register', { name, email, password, role, phone });
  if (data && data.token) {
    localStorage.setItem('ebp_token', data.token);
    localStorage.setItem('ebp_user', JSON.stringify(data.user));
    redirectToDashboard(data.user.role);
  }
  return data;
}

function logout() {
  localStorage.removeItem('ebp_token');
  localStorage.removeItem('ebp_user');
  window.location.href = '/';
}

function redirectToDashboard(role) {
  const routes = {
    mortgage_broker: '/mortgage/dashboard.html',
    agent: '/agent/dashboard.html',
    broker: '/broker/dashboard.html',
    admin: '/broker/dashboard.html'
  };
  window.location.href = routes[role] || '/';
}

// ==================== Toast Notifications ====================
function showToast(message, type = 'info') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  const toast = document.createElement('div');
  toast.className = 'toast toast-' + type;
  const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
  toast.innerHTML = '<span>' + (icons[type] || 'ℹ️') + '</span><span>' + message + '</span>';
  container.appendChild(toast);
  setTimeout(() => { toast.style.opacity = '0'; toast.style.transform = 'translateX(100%)'; setTimeout(() => toast.remove(), 300); }, 4000);
}

// ==================== Modal ====================
function openModal(id) {
  const modal = document.getElementById(id);
  if (modal) { modal.classList.add('active'); document.body.style.overflow = 'hidden'; }
}

function closeModal(id) {
  const modal = document.getElementById(id);
  if (modal) { modal.classList.remove('active'); document.body.style.overflow = ''; }
}

function closeAllModals() {
  document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active'));
  document.body.style.overflow = '';
}

// Close modal on overlay click
document.addEventListener('click', (e) => {
  if (e.target.classList.contains('modal-overlay')) closeAllModals();
});

// Close modal on Escape
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeAllModals();
});

// ==================== Sidebar Navigation ====================
function buildSidebar() {
  const user = getUser();
  if (!user) return;

  const navConfigs = {
    mortgage_broker: [
      { section: 'Mortgage CRM', items: [
        { href: '/mortgage/dashboard.html', icon: '📊', label: 'Dashboard' },
        { href: '/mortgage/calculator.html', icon: '🧮', label: 'Calculator' },
        { href: '/mortgage/clients.html', icon: '👥', label: 'Clients' },
        { href: '/mortgage/rates.html', icon: '📈', label: 'Rates' }
      ]}
    ],
    agent: [
      { section: 'Real Estate', items: [
        { href: '/agent/dashboard.html', icon: '📊', label: 'Dashboard' },
        { href: '/agent/listings.html', icon: '🏠', label: 'Listings' },
        { href: '/agent/buyers.html', icon: '🔑', label: 'Buyers' },
        { href: '/agent/sellers.html', icon: '💼', label: 'Sellers' }
      ]}
    ],
    broker: [
      { section: 'Office Admin', items: [
        { href: '/broker/dashboard.html', icon: '📊', label: 'Dashboard' },
        { href: '/broker/agents.html', icon: '👔', label: 'Agents' },
        { href: '/broker/reports.html', icon: '📋', label: 'Reports' }
      ]}
    ],
    admin: [
      { section: 'Office Admin', items: [
        { href: '/broker/dashboard.html', icon: '📊', label: 'Dashboard' },
        { href: '/broker/agents.html', icon: '👔', label: 'Agents' },
        { href: '/broker/reports.html', icon: '📋', label: 'Reports' }
      ]}
    ]
  };

  const nav = navConfigs[user.role] || [];
  const sidebarNav = document.getElementById('sidebar-nav');
  if (!sidebarNav) return;

  const currentPath = window.location.pathname;
  let html = '';
  nav.forEach(section => {
    html += '<div class="nav-section">';
    html += '<div class="nav-section-title">' + section.section + '</div>';
    section.items.forEach(item => {
      const active = currentPath === item.href ? ' active' : '';
      html += '<a href="' + item.href + '" class="nav-link' + active + '">';
      html += '<span class="nav-icon">' + item.icon + '</span>';
      html += '<span>' + item.label + '</span></a>';
    });
    html += '</div>';
  });
  sidebarNav.innerHTML = html;

  // User info
  const userName = document.getElementById('user-name');
  const userRole = document.getElementById('user-role');
  const userAvatar = document.getElementById('user-avatar');
  if (userName) userName.textContent = user.name;
  if (userRole) userRole.textContent = user.role.replace('_', ' ');
  if (userAvatar) userAvatar.textContent = user.name.charAt(0).toUpperCase();
}

// ==================== Mobile Menu ====================
function toggleMobileMenu() {
  const sidebar = document.querySelector('.sidebar');
  if (sidebar) sidebar.classList.toggle('open');
}

// ==================== Formatting Helpers ====================
function formatCurrency(amount) {
  if (amount === null || amount === undefined) return '$0.00';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

function formatCurrencyShort(amount) {
  if (!amount) return '$0';
  if (amount >= 1000000) return '$' + (amount / 1000000).toFixed(1) + 'M';
  if (amount >= 1000) return '$' + (amount / 1000).toFixed(0) + 'K';
  return formatCurrency(amount);
}

function formatNumber(num) {
  if (num === null || num === undefined) return '0';
  return new Intl.NumberFormat('en-US').format(num);
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDateTime(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function formatPercent(num) {
  if (num === null || num === undefined) return '0%';
  return parseFloat(num).toFixed(2) + '%';
}

function daysAgo(dateStr) {
  if (!dateStr) return 0;
  const diff = Date.now() - new Date(dateStr).getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

// ==================== Status Badges ====================
function statusBadge(status) {
  if (!status) return '<span class="badge badge-neutral">Unknown</span>';
  const map = {
    'pre-qualified': 'info', 'application': 'warning', 'processing': 'info',
    'underwriting': 'warning', 'closing': 'gold', 'closed': 'success', 'denied': 'error',
    'active': 'success', 'pending': 'warning', 'sold': 'info',
    'withdrawn': 'error', 'expired': 'neutral',
    'received': 'success', 'reviewed': 'info', 'approved': 'success',
    'rejected': 'error', 'scheduled': 'info', 'completed': 'success',
    'cancelled': 'error', 'interested': 'success', 'not_interested': 'error',
    'offer_made': 'gold'
  };
  const badgeType = map[status] || 'neutral';
  const label = status.replace(/[_-]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  return '<span class="badge badge-' + badgeType + '">' + label + '</span>';
}

// ==================== Confirm Dialog ====================
function confirmAction(message) {
  return window.confirm(message);
}

// ==================== Table Empty State ====================
function emptyState(icon, title, description) {
  return '<div class="empty-state"><div class="icon">' + icon + '</div><h3>' + title + '</h3><p>' + description + '</p></div>';
}

// ==================== Loading State ====================
function showLoading(containerId) {
  const el = document.getElementById(containerId);
  if (el) el.innerHTML = '<div class="loading"><div class="spinner"></div><p>Loading...</p></div>';
}

function hideLoading(containerId) {
  const el = document.getElementById(containerId);
  if (el) { const loader = el.querySelector('.loading'); if (loader) loader.remove(); }
}

// ==================== Init ====================
document.addEventListener('DOMContentLoaded', () => {
  // Build sidebar if present
  if (document.getElementById('sidebar-nav')) buildSidebar();

  // Mobile toggle
  const mobileBtn = document.querySelector('.mobile-toggle');
  if (mobileBtn) mobileBtn.addEventListener('click', toggleMobileMenu);

  // Logout buttons
  document.querySelectorAll('.logout-btn, [data-logout]').forEach(btn => {
    btn.addEventListener('click', (e) => { e.preventDefault(); logout(); });
  });
});
