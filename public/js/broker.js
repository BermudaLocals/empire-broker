/* ============================================================
   Empire Broker Pro — Broker Admin Module
   ============================================================ */

let currentAgents = [], currentReports = {}, officeChart, performanceChart;

// ==================== Agents ====================
async function loadAgents() {
  try {
    showLoading('agentsTable');
    currentAgents = await apiGet('/broker/agents') || [];
    renderAgents();
  } catch (err) { showToast(err.message, 'error'); }
}

function renderAgents(filter = '') {
  const tbody = document.getElementById('agentsBody');
  if (!tbody) return;
  let agents = currentAgents;
  if (filter) { const f = filter.toLowerCase(); agents = agents.filter(a => a.name.toLowerCase().includes(f) || (a.email || '').toLowerCase().includes(f)); }
  if (agents.length === 0) { tbody.innerHTML = emptyState('👔', 'No agents found', 'Add your first agent'); return; }
  tbody.innerHTML = agents.map(a =>
    '<tr><td><strong>' + a.name + '</strong></td><td>' + (a.email || '—') + '</td><td>' + (a.phone || '—') + '</td><td>' + (a.license_number || '—') + '</td><td>' + a.commission_split + '%</td><td>' + statusBadge(a.active ? 'active' : 'inactive') + '</td><td class="actions"><button class="action-btn" onclick="viewAgentPerformance(' + a.id + ')">📊</button><button class="action-btn" onclick="editAgent(' + a.id + ')">✏</button><button class="action-btn delete" onclick="deleteAgent(' + a.id + ')">🗑</button></td></tr>'
  ).join('');
}

async function saveAgent() {
  const id = document.getElementById('agentId')?.value;
  const body = {
    name: document.getElementById('agentName').value,
    email: document.getElementById('agentEmail').value,
    phone: document.getElementById('agentPhone').value || null,
    license_number: document.getElementById('agentLicense').value || null,
    commission_split: parseFloat(document.getElementById('agentSplit').value) || 50.0,
    active: document.getElementById('agentActive').checked
  };
  try {
    if (id) { await apiPut('/broker/agents/' + id, body); showToast('Agent updated', 'success'); }
    else { await apiPost('/broker/agents', body); showToast('Agent added', 'success'); }
    closeModal('agentModal'); loadAgents(); loadBrokerDashboard();
  } catch (err) { showToast(err.message, 'error'); }
}

async function viewAgentPerformance(agentId) {
  try {
    const agent = currentAgents.find(a => a.id === agentId);
    if (!agent) return;
    const perf = await apiGet('/broker/agents/' + agentId + '/performance');
    let html = '<h4>' + agent.name + ' — Performance</h4><div class="mt-4">';
    if (perf && perf.length) {
      html += '<table class="table-container"><thead><tr><th>Month</th><th>Year</th><th>Listings</th><th>Sales</th><th>Volume</th><th>Commission</th></tr></thead><tbody>';
      html += perf.map(p => '<tr><td>' + p.month + '</td><td>' + p.year + '</td><td>' + p.listings_count + '</td><td>' + p.sales_count + '</td><td>' + formatCurrency(p.volume) + '</td><td class="text-gold">' + formatCurrency(p.commission_earned) + '</td></tr>').join('');
      html += '</tbody></table>';
      const totalVolume = perf.reduce((sum, p) => sum + p.volume, 0);
      const totalComm = perf.reduce((sum, p) => sum + p.commission_earned, 0);
      html += '<div class="grid-3 mt-4"><div class="stat-card"><div class="stat-value text-gold">' + formatCurrency(totalVolume) + '</div><div class="stat-label">Total Volume</div></div><div class="stat-card"><div class="stat-value text-success">' + formatCurrency(totalComm) + '</div><div class="stat-label">Total Commission</div></div><div class="stat-card"><div class="stat-value">' + perf.length + '</div><div class="stat-label">Months</div></div></div>';
    } else { html += '<p>No performance data yet</p>'; }
    html += '<div class="mt-4"><button class="btn btn-primary" onclick="openPerformanceEntry(' + agentId + ')">Add Performance Entry</button></div></div>';
    document.getElementById('viewPerformanceContent').innerHTML = html;
    openModal('viewPerformanceModal');
  } catch (err) { showToast(err.message, 'error'); }
}

function openPerformanceEntry(agentId) {
  document.getElementById('perfAgentId').value = agentId;
  document.getElementById('perfMonth').value = new Date().getMonth() + 1;
  document.getElementById('perfYear').value = new Date().getFullYear();
  document.getElementById('perfListings').value = '';
  document.getElementById('perfSales').value = '';
  document.getElementById('perfVolume').value = '';
  document.getElementById('perfCommission').value = '';
  openModal('performanceModal');
}

async function savePerformanceEntry() {
  const agentId = document.getElementById('perfAgentId').value;
  const body = {
    month: parseInt(document.getElementById('perfMonth').value),
    year: parseInt(document.getElementById('perfYear').value),
    listings_count: parseInt(document.getElementById('perfListings').value) || 0,
    sales_count: parseInt(document.getElementById('perfSales').value) || 0,
    volume: parseFloat(document.getElementById('perfVolume').value) || 0,
    commission_earned: parseFloat(document.getElementById('perfCommission').value) || 0
  };
  try {
    await apiPost('/broker/agents/' + agentId + '/performance', body);
    closeModal('performanceModal');
    viewAgentPerformance(parseInt(agentId));
    showToast('Performance saved', 'success');
  } catch (err) { showToast(err.message, 'error'); }
}

function editAgent(id) {
  const a = currentAgents.find(x => x.id === id);
  if (!a) return;
  document.getElementById('agentId').value = a.id;
  document.getElementById('agentName').value = a.name;
  document.getElementById('agentEmail').value = a.email;
  document.getElementById('agentPhone').value = a.phone || '';
  document.getElementById('agentLicense').value = a.license_number || '';
  document.getElementById('agentSplit').value = a.commission_split;
  document.getElementById('agentActive').checked = !!a.active;
  document.getElementById('agentModalTitle').textContent = 'Edit Agent';
  openModal('agentModal');
}

function newAgent() {
  document.getElementById('agentId').value = '';
  document.getElementById('agentName').value = '';
  document.getElementById('agentEmail').value = '';
  document.getElementById('agentPhone').value = '';
  document.getElementById('agentLicense').value = '';
  document.getElementById('agentSplit').value = '50';
  document.getElementById('agentActive').checked = true;
  document.getElementById('agentModalTitle').textContent = 'Add Agent';
  openModal('agentModal');
}

async function deleteAgent(id) {
  if (!confirmAction('Delete this agent permanently?')) return;
  try { await apiDelete('/broker/agents/' + id); showToast('Agent deleted', 'success'); loadAgents(); } catch (err) { showToast(err.message, 'error'); }
}

// ==================== Reports ====================
async function loadReports() {
  try {
    showLoading('reportsContent');
    currentReports = await apiGet('/broker/reports');
    renderReports();
  } catch (err) { showToast(err.message, 'error'); }
}

function renderReports() {
  const container = document.getElementById('reportsContent');
  if (!container) return;
  const { agentCount, topAgents, monthlyTotals } = currentReports;
  let html = '<div class="grid-3 mb-8">';
  html += '<div class="stat-card"><div class="stat-label">Total Agents</div><div class="stat-value" id="brokerStatAgents">' + formatNumber(agentCount.total || 0) + '</div></div>';
  html += '<div class="stat-card"><div class="stat-label">Active Agents</div><div class="stat-value text-success">' + formatNumber(agentCount.active || 0) + '</div></div>';
  html += '<div class="stat-card"><div class="stat-label">Inactive Agents</div><div class="stat-value text-warning">' + formatNumber((agentCount.total || 0) - (agentCount.active || 0)) + '</div></div></div>';

  html += '<div class="grid-2">';
  html += '<div class="card"><div class="card-header"><h3>🏆 Top Agents by Volume</h3></div><div class="card-body">';
  if (topAgents && topAgents.length) {
    html += '<table class="table-container"><thead><tr><th>Agent</th><th>Volume</th><th>Sales</th><th>Commission</th></tr></thead><tbody>';
    html += topAgents.map((a, i) => '<tr><td><strong>#' + (i + 1) + ' ' + a.name + '</strong></td><td>' + formatCurrency(a.total_volume) + '</td><td>' + a.total_sales + '</td><td class="text-gold">' + formatCurrency(a.total_commission) + '</td></tr>').join('');
    html += '</tbody></table>';
  } else { html += '<p>No data available</p>'; }
  html += '</div></div>';

  html += '<div class="card"><div class="card-header"><h3>📅 Monthly Activity</h3></div><div class="card-body" style="min-height:300px">';
  if (monthlyTotals && monthlyTotals.length) {
    const labels = monthlyTotals.map(m => m.month + '/' + m.year).slice(0, 12).reverse();
    const dataSales = monthlyTotals.map(m => m.sales).slice(0, 12).reverse();
    html += '<canvas id="monthlyChart"></canvas>';
    setTimeout(() => {
      const ctx = document.getElementById('monthlyChart')?.getContext('2d');
      if (ctx) {
        if (performanceChart) performanceChart.destroy();
        performanceChart = new Chart(ctx, {
          type: 'line', data: { labels, datasets: [{ label: 'Sales', data: dataSales, borderColor: '#c5a059', backgroundColor: 'rgba(197,160,89,0.1)', fill: true, tension: 0.4, pointBackgroundColor: '#c5a059' }] },
          options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { ticks: { color: '#888', stepSize: 1 }, grid: { color: 'rgba(255,255,255,0.05)' } }, x: { ticks: { color: '#888' }, grid: { display: false } } } }
        });
      }
    }, 0);
  } else { html += '<p>No monthly data</p>'; }
  html += '</div></div></div>';

  html += '<div class="card mt-8"><div class="card-header"><h3>📊 Office Summary</h3></div><div class="card-body">';
  if (monthlyTotals && monthlyTotals.length) {
    const totalVol = monthlyTotals.reduce((s, m) => s + m.volume, 0);
    const totalComm = monthlyTotals.reduce((s, m) => s + m.commission, 0);
    const totalList = monthlyTotals.reduce((s, m) => s + m.listings, 0);
    const totalSales = monthlyTotals.reduce((s, m) => s + m.sales, 0);
    html += '<div class="grid-4"><div class="stat-card"><div class="stat-value text-gold">' + formatCurrency(totalVol) + '</div><div class="stat-label">Office Volume (12mo)</div></div>';
    html += '<div class="stat-card"><div class="stat-value text-success">' + formatCurrency(totalComm) + '</div><div class="stat-label">Office Commission</div></div>';
    html += '<div class="stat-card"><div class="stat-value">' + formatNumber(totalList) + '</div><div class="stat-label">Total Listings</div></div>';
    html += '<div class="stat-card"><div class="stat-value">' + formatNumber(totalSales) + '</div><div class="stat-label">Total Sales</div></div></div>';
  }
  html += '</div></div>';

  container.innerHTML = html;
}

// ==================== Dashboard ====================
async function loadBrokerDashboard() {
  try {
    const stats = await apiGet('/dashboard/stats');
    if (document.getElementById('statTotalAgents')) document.getElementById('statTotalAgents').textContent = formatNumber(stats.totalAgents || 0);
    if (document.getElementById('statActiveAgents')) document.getElementById('statActiveAgents').textContent = formatNumber(stats.activeAgents || 0);
    const agents = await apiGet('/broker/agents');
    if (agents) {
      document.getElementById('statInactiveAgents').textContent = formatNumber(agents.filter(a => !a.active).length);
    }
    const reports = await apiGet('/broker/reports');
    const monthlyTotals = reports.monthlyTotals || [];
    if (monthlyTotals.length) {
      const totalVol = monthlyTotals.reduce((s, m) => s + m.volume, 0);
      document.getElementById('statOfficeVolume').textContent = formatCurrencyShort(totalVol);
    } else { document.getElementById('statOfficeVolume').textContent = '$0'; }
  } catch (err) { console.error('Dashboard error:', err); }
}

// ==================== Init ====================
document.addEventListener('DOMContentLoaded', () => {
  const path = window.location.pathname;
  if (path.includes('/broker/dashboard.html')) { requireAuth(); loadBrokerDashboard(); }
  if (path.includes('/broker/agents.html')) { requireAuth(); loadAgents(); }
  if (path.includes('/broker/reports.html')) { requireAuth(); loadReports(); }
});
