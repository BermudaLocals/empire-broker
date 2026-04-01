/* ============================================================
   Empire Broker Pro — Mortgage Module (Calculator + CRM)
   ============================================================ */

let amortizationChart, paymentChart, loansChart;
let savedScenarios = [];
let currentClients = [];
let currentRates = [];
let currentCommissions = [];

// ==================== Loan Calculator ====================
function calculateLoan(purchasePrice, downPayment, rate, term, taxRate, insurance, includePMI) {
  const P = purchasePrice - downPayment;
  const r = rate / 100 / 12;
  const n = term * 12;
  const monthlyPI = P * (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
  const downPercent = downPayment / purchasePrice;
  const monthlyPMI = (includePMI && downPercent < 0.20) ? (P * 0.005 / 12) : 0;
  const monthlyTax = (purchasePrice * (taxRate / 100)) / 12;
  const monthlyInsurance = insurance / 12;
  return {
    principal: P, purchasePrice, downPayment, rate, term,
    monthlyPI, monthlyPMI, monthlyTax, monthlyInsurance,
    totalMonthly: monthlyPI + monthlyPMI + monthlyTax + monthlyInsurance,
    downPercent: downPercent * 100
  };
}

function generateAmortizationSchedule(P, r, n) {
  const schedule = [];
  let balance = P;
  for (let i = 1; i <= n; i++) {
    const interest = balance * r;
    const principal = (P * (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1)) - interest;
    balance -= principal;
    schedule.push({
      month: i,
      payment: P * (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1),
      interest: interest,
      principal: principal,
      balance: Math.max(0, balance)
    });
  }
  return schedule;
}

// ==================== DOM Update ====================
function updateCalculator() {
  const purchasePrice = parseFloat(document.getElementById('purchasePrice')?.value) || 0;
  const downPaymentDollars = parseFloat(document.getElementById('downPayment')?.value) || 0;
  const downPercent = document.getElementById('downPercent');
  if (downPercent && purchasePrice > 0) downPercent.value = ((downPaymentDollars / purchasePrice) * 100).toFixed(1);
  const rate = parseFloat(document.getElementById('interestRate')?.value) || 0;
  const term = parseInt(document.getElementById('loanTerm')?.value) || 30;
  const taxRate = parseFloat(document.getElementById('taxRate')?.value) || 1.2;
  const insurance = parseFloat(document.getElementById('insurance')?.value) || 1200;
  const includePMI = document.getElementById('includePMI')?.checked ?? true;
  if (!purchasePrice || !downPaymentDollars || !rate) return;
  const calc = calculateLoan(purchasePrice, downPaymentDollars, rate, term, taxRate, insurance, includePMI);
  const elTotal = document.getElementById('totalPayment');
  const elPI = document.getElementById('piPayment');
  const elPmi = document.getElementById('pmiPayment');
  const elTax = document.getElementById('taxPayment');
  const elIns = document.getElementById('insPayment');
  const elLoan = document.getElementById('loanAmount');
  const elDown = document.getElementById('downPaymentPercent');
  if (elTotal) elTotal.textContent = formatCurrency(calc.totalMonthly) + '/mo';
  if (elPI) elPI.textContent = formatCurrency(calc.monthlyPI);
  if (elPmi) elPmi.textContent = (calc.monthlyPMI > 0) ? formatCurrency(calc.monthlyPMI) : '$0.00';
  if (elTax) elTax.textContent = formatCurrency(calc.monthlyTax);
  if (elIns) elIns.textContent = formatCurrency(calc.monthlyInsurance);
  if (elLoan) elLoan.textContent = formatCurrency(calc.principal);
  if (elDown) elDown.textContent = calc.downPercent.toFixed(1) + '%';
  updatePaymentChart(calc);
  updateAmortizationTableAndChart(calc);
  return calc;
}

function onDownPercentChange() {
  const purchasePrice = parseFloat(document.getElementById('purchasePrice')?.value) || 0;
  const percent = parseFloat(document.getElementById('downPercent')?.value) || 0;
  if (purchasePrice > 0) { document.getElementById('downPayment').value = (purchasePrice * percent / 100).toFixed(0); updateCalculator(); }
}

function onDownDollarsChange() {
  const purchasePrice = parseFloat(document.getElementById('purchasePrice')?.value) || 0;
  const dollars = parseFloat(document.getElementById('downPayment')?.value) || 0;
  if (purchasePrice > 0) { document.getElementById('downPercent').value = ((dollars / purchasePrice) * 100).toFixed(1); }
  updateCalculator();
}

// ==================== Charts ====================
function updatePaymentChart(calc) {
  const ctx = document.getElementById('paymentChart')?.getContext('2d');
  if (!ctx) return;
  const data = [calc.monthlyPI, calc.monthlyTax, calc.monthlyInsurance, calc.monthlyPMI];
  const labels = ['Principal & Interest', 'Taxes', 'Insurance', 'PMI'];
  const bg = ['#c5a059', '#3b82f6', '#10b981', '#f59e0b'];
  if (paymentChart) paymentChart.destroy();
  paymentChart = new Chart(ctx, {
    type: 'pie',
    data: { labels, datasets: [{ data, backgroundColor: bg, borderWidth: 0 }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { color: '#e6e6e6' } } } }
  });
}

function updateAmortizationTableAndChart(calc) {
  const schedule = generateAmortizationSchedule(calc.principal, calc.rate / 100 / 12, calc.term * 12);
  const tbody = document.getElementById('amortizationBody');
  if (tbody) {
    tbody.innerHTML = schedule.slice(0, 120).map(row =>
      '<tr><td>' + row.month + '</td><td>' + formatCurrency(row.payment) + '</td><td>' + formatCurrency(row.principal) + '</td><td>' + formatCurrency(row.interest) + '</td><td>' + formatCurrency(row.balance) + '</td></tr>'
    ).join('');
  }
  const ctx = document.getElementById('balanceChart')?.getContext('2d');
  if (!ctx) return;
  const labels = schedule.map(r => r.month).filter((_, i) => i % 12 === 0);
  const data = schedule.map(r => r.balance).filter((_, i) => i % 12 === 0);
  if (amortizationChart) amortizationChart.destroy();
  amortizationChart = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets: [{ label: 'Remaining Balance', data, borderColor: '#c5a059', backgroundColor: 'rgba(197,160,89,0.1)', fill: true, tension: 0.4 }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { x: { ticks: { color: '#888' }, grid: { color: 'rgba(255,255,255,0.05)' } }, y: { ticks: { color: '#888', callback: v => '$' + (v / 1000).toFixed(0) + 'k' }, grid: { color: 'rgba(255,255,255,0.05)' } } }
    }
  });
}

// ==================== Scenarios ====================
function saveScenario() {
  const calc = updateCalculator();
  if (!calc) return;
  const name = document.getElementById('scenarioName')?.value || 'Scenario ' + (savedScenarios.length + 1);
  savedScenarios.push({ ...calc, name });
  renderScenarios();
  showToast('Scenario saved', 'success');
}

function renderScenarios() {
  const container = document.getElementById('scenariosList');
  if (!container) return;
  container.innerHTML = savedScenarios.map((s, i) =>
    '<div class="card" style="padding:16px"><h4>' + s.name + '</h4><p>Purchase: ' + formatCurrency(s.purchasePrice) + '</p><p>Down: ' + s.downPercent.toFixed(1) + '%</p><p>Rate: ' + s.rate + '%</p><div class="big-number text-gold">' + formatCurrency(s.totalMonthly) + '</div><button class="btn btn-sm btn-danger mt-4" onclick="deleteScenario(' + i + ')">Delete</button></div>'
  ).join('');
}

function deleteScenario(index) { savedScenarios.splice(index, 1); renderScenarios(); }

function clearScenarios() { savedScenarios = []; renderScenarios(); }

// ==================== Client CRUD ====================
async function loadClients() {
  try {
    showLoading('clientsTable');
    const data = await apiGet('/mortgage/clients');
    currentClients = data || [];
    renderClients();
  } catch (err) { showToast(err.message, 'error'); }
}

function renderClients(filter = '') {
  const tbody = document.getElementById('clientsBody');
  if (!tbody) return;
  let clients = currentClients;
  if (filter) { const f = filter.toLowerCase(); clients = clients.filter(c => c.name.toLowerCase().includes(f) || (c.email && c.email.toLowerCase().includes(f))); }
  if (clients.length === 0) { tbody.innerHTML = emptyState('👥', 'No clients found', 'Add your first client to get started'); return; }
  tbody.innerHTML = clients.map(c =>
    '<tr><td>' + c.name + '</td><td>' + (c.email || '—') + '</td><td>' + (c.phone || '—') + '</td><td>' + formatCurrency(c.pre_approval_amount) + '</td><td>' + statusBadge(c.status) + '</td><td class="actions"><button class="action-btn" onclick="viewClient(' + c.id + ')">👁</button><button class="action-btn" onclick="editClient(' + c.id + ')">✏</button><button class="action-btn delete" onclick="deleteClient(' + c.id + ')">🗑</button></td></tr>'
  ).join('');
}

async function saveClient() {
  const id = document.getElementById('clientId')?.value;
  const body = {
    name: document.getElementById('clientName')?.value,
    email: document.getElementById('clientEmail')?.value,
    phone: document.getElementById('clientPhone')?.value,
    pre_approval_amount: parseFloat(document.getElementById('clientPreApproval')?.value) || null,
    credit_score: parseInt(document.getElementById('clientCredit')?.value) || null,
    status: document.getElementById('clientStatus')?.value || 'pre-qualified',
    notes: document.getElementById('clientNotes')?.value
  };
  try {
    if (id) { await apiPut('/mortgage/clients/' + id, body); showToast('Client updated', 'success'); }
    else { await apiPost('/mortgage/clients', body); showToast('Client created', 'success'); }
    closeModal('clientModal'); loadClients();
  } catch (err) { showToast(err.message, 'error'); }
}

async function viewClient(id) {
  try {
    const client = await apiGet('/mortgage/clients/' + id);
    let html = '<div class="grid-2"><div><h4>Client Info</h4><p><strong>Name:</strong> ' + client.name + '</p><p><strong>Email:</strong> ' + (client.email || '—') + '</p><p><strong>Phone:</strong> ' + (client.phone || '—') + '</p><p><strong>Pre-Approval:</strong> ' + formatCurrency(client.pre_approval_amount) + '</p><p><strong>Credit Score:</strong> ' + (client.credit_score || '—') + '</p><p><strong>Status:</strong> ' + statusBadge(client.status) + '</p></div><div><h4>Documents</h4>';
    const docs = client.documents || [];
    const docTypes = ['W2', 'Tax Return', 'Bank Statement', 'Pay Stub', 'ID', 'Purchase Agreement', 'Appraisal'];
    html += '<div class="mt-4">' + docTypes.map(dt => {
      const found = docs.find(d => d.doc_type === dt);
      const badge = found ? statusBadge(found.status) : '<span class="badge badge-neutral">Pending</span>';
      return '<div class="flex-between mb-4"><span>' + dt + '</span>' + badge + '</div>';
    }).join('') + '</div></div></div>';
    document.getElementById('viewClientContent').innerHTML = html;
    openModal('viewClientModal');
  } catch (err) { showToast(err.message, 'error'); }
}

function editClient(id) {
  const client = currentClients.find(c => c.id === id);
  if (!client) return;
  document.getElementById('clientId').value = client.id;
  document.getElementById('clientName').value = client.name;
  document.getElementById('clientEmail').value = client.email || '';
  document.getElementById('clientPhone').value = client.phone || '';
  document.getElementById('clientPreApproval').value = client.pre_approval_amount || '';
  document.getElementById('clientCredit').value = client.credit_score || '';
  document.getElementById('clientStatus').value = client.status;
  document.getElementById('clientNotes').value = client.notes || '';
  document.getElementById('clientModalTitle').textContent = 'Edit Client';
  openModal('clientModal');
}

function newClient() {
  document.getElementById('clientId').value = '';
  document.getElementById('clientName').value = '';
  document.getElementById('clientEmail').value = '';
  document.getElementById('clientPhone').value = '';
  document.getElementById('clientPreApproval').value = '';
  document.getElementById('clientCredit').value = '';
  document.getElementById('clientStatus').value = 'pre-qualified';
  document.getElementById('clientNotes').value = '';
  document.getElementById('clientModalTitle').textContent = 'Add Client';
  openModal('clientModal');
}

async function deleteClient(id) {
  if (!confirmAction('Delete this client permanently?')) return;
  try { await apiDelete('/mortgage/clients/' + id); showToast('Client deleted', 'success'); loadClients(); } catch (err) { showToast(err.message, 'error'); }
}

async function updateDocument(clientId, docType, status) {
  try {
    await apiPost('/mortgage/documents', { client_id: clientId, doc_type: docType, status });
    showToast('Document updated', 'success');
  } catch (err) { showToast(err.message, 'error'); }
}

// ==================== Rates ====================
async function loadRates() {
  try {
    currentRates = await apiGet('/mortgage/rates') || [];
    const tbody = document.getElementById('ratesBody');
    if (tbody) tbody.innerHTML = currentRates.map(r =>
      '<tr><td>' + r.lender_name + '</td><td>' + r.rate_30yr + '%</td><td>' + (r.rate_15yr || '—') + '%</td><td>' + (r.rate_arm || '—') + '%</td><td>' + (r.arm_term || '—') + '</td><td>' + r.points + '</td><td class="actions"><button class="action-btn" onclick="editRate(' + r.id + ')">✏</button><button class="action-btn delete" onclick="deleteRate(' + r.id + ')">🗑</button></td></tr>'
    ).join('');
  } catch (err) { showToast(err.message, 'error'); }
}

async function saveRate() {
  const id = document.getElementById('rateId')?.value;
  const body = { lender_name: document.getElementById('lenderName').value, rate_30yr: parseFloat(document.getElementById('rate30').value), rate_15yr: parseFloat(document.getElementById('rate15').value) || null, rate_arm: parseFloat(document.getElementById('rateArm').value) || null, arm_term: parseInt(document.getElementById('armTerm').value) || null, points: parseFloat(document.getElementById('points').value) || 0 };
  try {
    if (id) { await apiPut('/mortgage/rates/' + id, body); }
    else { await apiPost('/mortgage/rates', body); }
    closeModal('rateModal'); loadRates(); showToast('Rate saved', 'success');
  } catch (err) { showToast(err.message, 'error'); }
}

function editRate(id) {
  const rate = currentRates.find(r => r.id === id);
  if (!rate) return;
  document.getElementById('rateId').value = rate.id;
  document.getElementById('lenderName').value = rate.lender_name;
  document.getElementById('rate30').value = rate.rate_30yr;
  document.getElementById('rate15').value = rate.rate_15yr || '';
  document.getElementById('rateArm').value = rate.rate_arm || '';
  document.getElementById('armTerm').value = rate.arm_term || '';
  document.getElementById('points').value = rate.points;
  document.getElementById('rateModalTitle').textContent = 'Edit Rate';
  openModal('rateModal');
}

function newRate() {
  document.getElementById('rateId').value = '';
  document.getElementById('lenderName').value = '';
  document.getElementById('rate30').value = '';
  document.getElementById('rate15').value = '';
  document.getElementById('rateArm').value = '';
  document.getElementById('armTerm').value = '';
  document.getElementById('points').value = '';
  document.getElementById('rateModalTitle').textContent = 'Add Rate';
  openModal('rateModal');
}

async function deleteRate(id) { if (!confirmAction('Delete this rate?')) return; try { await apiDelete('/mortgage/rates/' + id); loadRates(); showToast('Rate deleted', 'success'); } catch (err) { showToast(err.message, 'error'); } }

// ==================== Rate Locks ====================
async function loadRateLocks() {
  try {
    const locks = await apiGet('/mortgage/rate-locks') || [];
    const tbody = document.getElementById('rateLocksBody');
    if (tbody) tbody.innerHTML = locks.map(l =>
      '<tr><td>' + l.client_name + '</td><td>' + l.lender_name + '</td><td>' + l.rate + '%</td><td>' + l.loan_type + '</td><td>' + formatDate(l.expiration_date) + '</td><td class="actions"><button class="action-btn delete" onclick="deleteRateLock(' + l.id + ')">🗑</button></td></tr>'
    ).join('');
  } catch (err) { console.error(err); }
}

async function saveRateLock() {
  const body = { client_id: parseInt(document.getElementById('lockClientId').value), lender_name: document.getElementById('lockLender').value, rate: parseFloat(document.getElementById('lockRate').value), loan_type: document.getElementById('lockType').value, expiration_date: document.getElementById('lockExpiration').value, notes: document.getElementById('lockNotes').value };
  try { await apiPost('/mortgage/rate-locks', body); closeModal('rateLockModal'); loadRateLocks(); showToast('Rate lock created', 'success'); } catch (err) { showToast(err.message, 'error'); }
}

async function deleteRateLock(id) { if (!confirmAction('Delete this rate lock?')) return; try { await apiDelete('/mortgage/rate-locks/' + id); loadRateLocks(); showToast('Rate lock deleted', 'success'); } catch (err) { showToast(err.message, 'error'); } }

// ==================== Commissions ====================
async function loadMortgageCommissions() {
  try {
    const data = await apiGet('/mortgage/commissions');
    currentCommissions = data.commissions || [];
    const summary = data.summary || {};
    const tbody = document.getElementById('commissionsBody');
    if (tbody) tbody.innerHTML = data.commissions.map(c =>
      '<tr><td>' + formatDate(c.commission_date) + '</td><td>' + c.client_name + '</td><td>' + (c.property_address || '—') + '</td><td>' + formatCurrency(c.sale_price) + '</td><td class="text-gold"><strong>' + formatCurrency(c.commission_amount) + '</strong></td><td>' + statusBadge(c.status) + '</td><td class="actions"><button class="action-btn delete" onclick="deleteCommission(' + c.id + ')">🗑</button></td></tr>'
    ).join('');
    const elTotal = document.getElementById('commTotal');
    const elReceived = document.getElementById('commReceived');
    const elPending = document.getElementById('commPending');
    const elYtd = document.getElementById('commYTD');
    if (elTotal) elTotal.textContent = formatCurrency(summary.total || 0);
    if (elReceived) elReceived.textContent = formatCurrency(summary.received || 0);
    if (elPending) elPending.textContent = formatCurrency(summary.pending || 0);
    if (elYtd) elYtd.textContent = formatCurrency(summary.ytd || 0);
    updateCommissionChart(data.commissions);
  } catch (err) { console.error(err); }
}

async function saveCommission() {
  const body = { client_name: document.getElementById('commClient').value, property_address: document.getElementById('commProperty').value, sale_price: parseFloat(document.getElementById('commSalePrice').value) || null, commission_amount: parseFloat(document.getElementById('commAmount').value), commission_date: document.getElementById('commDate').value, status: document.getElementById('commStatus').value, notes: document.getElementById('commNotes').value };
  try { await apiPost('/mortgage/commissions', body); closeModal('commissionModal'); loadMortgageCommissions(); showToast('Commission added', 'success'); } catch (err) { showToast(err.message, 'error'); }
}

async function deleteCommission(id) { if (!confirmAction('Delete this commission?')) return; try { await apiDelete('/mortgage/commissions/' + id); loadMortgageCommissions(); showToast('Commission deleted', 'success'); } catch (err) { showToast(err.message, 'error'); } }

function updateCommissionChart(commissions) {
  const ctx = document.getElementById('commissionChart')?.getContext('2d');
  if (!ctx || !commissions.length) return;
  const byMonth = {};
  commissions.forEach(c => { const m = new Date(c.commission_date).toLocaleString('en-US', { month: 'short', year: 'numeric' }); byMonth[m] = (byMonth[m] || 0) + c.commission_amount; });
  const labels = Object.keys(byMonth).reverse().slice(0, 6);
  const data = labels.map(l => byMonth[l]);
  if (loansChart) loansChart.destroy();
  loansChart = new Chart(ctx, {
    type: 'bar', data: { labels, datasets: [{ label: 'Commission', data, backgroundColor: '#c5a059', borderRadius: 4 }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { ticks: { callback: v => '$' + (v / 1000).toFixed(0) + 'k', color: '#888' }, grid: { color: 'rgba(255,255,255,0.05)' } }, x: { ticks: { color: '#888' }, grid: { display: false } } } }
  });
}

// ==================== Dashboard ====================
async function loadMortgageDashboard() {
  try {
    const stats = await apiGet('/dashboard/stats');
    if (stats.totalClients !== undefined) document.getElementById('statClients').textContent = formatNumber(stats.totalClients);
    if (stats.activeClients !== undefined) document.getElementById('statActive').textContent = formatNumber(stats.activeClients);
    if (stats.ytdCommission !== undefined) document.getElementById('statCommission').textContent = formatCurrency(stats.ytdCommission);
    if (stats.upcomingAppointments !== undefined) document.getElementById('statAppointments').textContent = formatNumber(stats.upcomingAppointments);
    const pipelineEl = document.getElementById('pipelineStages');
    if (pipelineEl && stats.pipeline) {
      pipelineEl.innerHTML = stats.pipeline.map(p =>
        '<div class="pipeline-stage"><div class="count">' + p.count + '</div><div class="label status-' + p.status + '">' + p.status.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) + '</div></div>'
      ).join('');
    }
    const clients = await apiGet('/mortgage/clients');
    if (clients && clients.length) {
      document.getElementById('recentClients').innerHTML = clients.slice(0, 5).map(c =>
        '<tr><td><strong>' + c.name + '</strong></td><td>' + (c.email || '—') + '</td><td>' + statusBadge(c.status) + '</td><td>' + formatDate(c.updated_at) + '</td></tr>'
      ).join('');
    }
    updateCommissionChart((await apiGet('/mortgage/commissions')).commissions || []);
  } catch (err) { console.error('Dashboard error:', err); }
}

// ==================== Init ====================
document.addEventListener('DOMContentLoaded', () => {
  const path = window.location.pathname;
  if (path.includes('/mortgage/dashboard.html')) { requireAuth(); loadMortgageDashboard(); }
  if (path.includes('/mortgage/calculator.html')) { requireAuth(); if (document.getElementById('purchasePrice')) updateCalculator(); }
  if (path.includes('/mortgage/clients.html')) { requireAuth(); loadClients(); }
  if (path.includes('/mortgage/rates.html')) { requireAuth(); loadRates(); loadRateLocks(); loadMortgageCommissions(); }
});
