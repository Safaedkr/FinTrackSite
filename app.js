/* ─────────────────────────────────────────────
   FinTrack — frontend (API-backed version)
   All data lives on the server via /api/*
   State is cached in memory for the session.
───────────────────────────────────────────── */

// ── In-memory state ──────────────────────────
let state = {
  expenses:         [],
  budgets:          {},
  salary:           0,
  savingsGoal:      0,
  customCategories: [],
};

let currentUser      = null;
let currentCurrency  = 'MAD';
let currentMonthOffset = 0;

const currencySymbols = { MAD: 'MAD', EUR: '€', USD: '$', GBP: '£' };
const currencyRates   = { MAD: 1, EUR: 0.09, USD: 0.10, GBP: 0.08 };

const defaultCategories = [
  { id: 'alimentation', name: 'Alimentation', emoji: '🍔' },
  { id: 'transport',    name: 'Transport',    emoji: '🚗' },
  { id: 'loisirs',      name: 'Loisirs',      emoji: '🎮' },
  { id: 'sante',        name: 'Santé',        emoji: '💊' },
  { id: 'logement',     name: 'Logement',     emoji: '🏠' },
  { id: 'education',    name: 'Éducation',    emoji: '📚' },
  { id: 'savings',      name: 'Épargne',      emoji: '🏦' },
  { id: 'autre',        name: 'Autre',        emoji: '📦' },
];

// ── API helper ───────────────────────────────
const api = {
  get token()  { return sessionStorage.getItem('fintrack_token'); },
  set token(v) { v ? sessionStorage.setItem('fintrack_token', v) : sessionStorage.removeItem('fintrack_token'); },

  async req(method, path, body) {
    const res = await fetch('/api' + path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(this.token ? { Authorization: 'Bearer ' + this.token } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Erreur réseau' }));
      throw new Error(err.error || 'Erreur serveur');
    }
    return res.json();
  },

  get:    (p)    => api.req('GET',    p),
  post:   (p, b) => api.req('POST',   p, b),
  put:    (p, b) => api.req('PUT',    p, b),
  delete: (p)    => api.req('DELETE', p),
};

// ── Load everything for the current user ─────
async function loadUserData() {
  const [expenses, budgets, settings] = await Promise.all([
    api.get('/expenses'),
    api.get('/budgets'),
    api.get('/settings'),
  ]);
  state.expenses         = expenses;
  state.budgets          = budgets;
  state.salary           = settings.salary      || 0;
  state.savingsGoal      = settings.savingsGoal || 0;
  state.customCategories = settings.customCategories || [];
}

// ── State accessors (keep function names compatible) ──
function getData()       { return state.expenses; }
function getSalary()     { return state.salary; }
function getBudgets()    { return state.budgets; }
function getCategories() { return [...defaultCategories, ...state.customCategories]; }

// ── Month helpers ─────────────────────────────
function getMonthDates() {
  const now = new Date();
  const d   = new Date(now.getFullYear(), now.getMonth() + currentMonthOffset, 1);
  return { year: d.getFullYear(), month: d.getMonth() };
}
function formatMonth(y, m) {
  return new Date(y, m, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
}
function prevMonth() { currentMonthOffset--; refreshAll(); }
function nextMonth() { currentMonthOffset++; refreshAll(); }

function getMonthExpenses() {
  const { year, month } = getMonthDates();
  return state.expenses.filter(e => {
    const d = new Date(e.date);
    return d.getFullYear() === year && d.getMonth() === month;
  });
}

// ── Currency ──────────────────────────────────
function fmtAmount(n) {
  const converted = n * currencyRates[currentCurrency];
  if (currentCurrency === 'MAD') return converted.toFixed(2) + ' MAD';
  return currencySymbols[currentCurrency] + converted.toFixed(2);
}
function changeCurrency(c) {
  currentCurrency = c;
  document.querySelectorAll('.currency-select').forEach(s => s.value = c);
  refreshAll();
}

// ── Page routing ──────────────────────────────
function showPage(id) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

function showAuth(mode) {
  showPage('authPage');
  if (mode === 'signup') {
    document.getElementById('authTitle').textContent    = 'Créer un compte 🚀';
    document.getElementById('authSubtitle').textContent = 'Commencez à gérer vos finances';
    document.getElementById('signupExtra').classList.remove('hidden');
    document.getElementById('authBtn').textContent      = "S'inscrire";
    document.getElementById('authSwitch').innerHTML     = 'Déjà un compte ? <a onclick="toggleAuth()">Se connecter</a>';
    document.getElementById('authBtn').dataset.mode     = 'signup';
  } else {
    document.getElementById('authTitle').textContent    = 'Bon retour 👋';
    document.getElementById('authSubtitle').textContent = 'Connectez-vous à votre compte';
    document.getElementById('signupExtra').classList.add('hidden');
    document.getElementById('authBtn').textContent      = 'Se connecter';
    document.getElementById('authSwitch').innerHTML     = "Pas encore de compte ? <a onclick=\"toggleAuth()\">S'inscrire</a>";
    document.getElementById('authBtn').dataset.mode     = 'login';
  }
}

function toggleAuth() {
  const mode = document.getElementById('authBtn').dataset.mode === 'login' ? 'signup' : 'login';
  showAuth(mode);
}

// ── Auth ──────────────────────────────────────
async function doAuth() {
  const email    = document.getElementById('authEmail').value.trim();
  const password = document.getElementById('authPassword').value;
  const mode     = document.getElementById('authBtn').dataset.mode;
  const name     = mode === 'signup' ? (document.getElementById('fullName').value.trim() || 'Utilisateur') : '';

  if (!email || !password) { alert('Email et mot de passe requis'); return; }

  const btn = document.getElementById('authBtn');
  btn.disabled   = true;
  btn.textContent = '…';

  try {
    const endpoint = mode === 'signup' ? '/auth/signup' : '/auth/login';
    const body     = mode === 'signup' ? { name, email, password } : { email, password };
    const { user, token } = await api.post(endpoint, body);

    api.token   = token;
    currentUser = user;
    sessionStorage.setItem('fintrack_user', JSON.stringify(user));

    await loadUserData();
    enterApp();
  } catch (err) {
    alert(err.message);
  } finally {
    btn.disabled    = false;
    btn.textContent = mode === 'signup' ? "S'inscrire" : 'Se connecter';
  }
}

function enterApp() {
  showPage('appPage');
  const n = currentUser ? currentUser.name.split(' ')[0] : 'Utilisateur';
  document.getElementById('sidebarName').textContent    = n;
  document.getElementById('sidebarAvatar').textContent  = n[0].toUpperCase();
  document.getElementById('welcomeName').textContent    = n;
  document.getElementById('settingName').textContent    = currentUser?.name || n;
  document.getElementById('currentSalary').textContent  = state.salary ? fmtAmount(state.salary) : 'Non défini';
  document.getElementById('authEmail').value    = '';
  document.getElementById('authPassword').value = '';
  refreshAll();
}

function logout() {
  api.token   = null;
  currentUser = null;
  state       = { expenses: [], budgets: {}, salary: 0, savingsGoal: 0, customCategories: [] };
  sessionStorage.removeItem('fintrack_user');
  showPage('landingPage');
}

// ── Navigation ────────────────────────────────
function showMain(id) {
  document.querySelectorAll('.main-page').forEach(p  => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n   => n.classList.remove('active'));
  document.getElementById(id + 'Page').classList.add('active');
  document.getElementById('nav-' + id)?.classList.add('active');
  if (id === 'analytics') renderAnalytics();
  if (id === 'trophies')  renderTrophies();
  if (id === 'savings')   renderSavings();
  if (id === 'budget')    renderBudget();
  if (id === 'expenses')  renderExpenseList();
  if (id === 'settings')  renderCategoryList();
}

function refreshAll() {
  const { year, month } = getMonthDates();
  document.getElementById('currentMonthLabel').textContent = formatMonth(year, month);
  renderDashboard();
  renderBudget();
  checkAlerts();
  updatePoints();
}

// ── Dashboard ─────────────────────────────────
function renderDashboard() {
  const expenses = getMonthExpenses();
  const total    = expenses.reduce((s, e) => s + e.amount, 0);
  const salary   = getSalary();
  const balance  = salary - total;
  const rate     = salary > 0 ? Math.round((balance / salary) * 100) : 0;

  document.getElementById('incomeDisplay').textContent  = fmtAmount(salary);
  document.getElementById('totalDisplay').textContent   = fmtAmount(total);
  const balEl = document.getElementById('balanceDisplay');
  balEl.textContent = fmtAmount(balance);
  balEl.className   = 'stat-value ' + (balance >= 0 ? 'positive' : 'negative');
  document.getElementById('balanceSub').textContent         = balance >= 0 ? 'Budget disponible' : 'Dépassement';
  document.getElementById('savingsRateDisplay').textContent = rate + '%';
  document.getElementById('expSummaryTotal').textContent    = fmtAmount(total);
  document.getElementById('expSummaryCount').textContent    = expenses.length;
  document.getElementById('expSummaryCats').textContent     = new Set(expenses.map(e => e.category)).size;
  renderRecentExpenses();
  renderDoughnut(expenses);
  renderLine();
}

function renderRecentExpenses() {
  const expenses = getMonthExpenses().slice(-5).reverse();
  const el = document.getElementById('recentExpenses');
  if (!expenses.length) {
    el.innerHTML = '<div style="text-align:center;padding:32px;color:var(--text2)">Aucune dépense ce mois</div>';
    return;
  }
  el.innerHTML = expenses.map(e => expenseHTML(e)).join('');
}

function expenseHTML(e) {
  const cat = getCategories().find(c => c.id === e.category) || { emoji: '📦', name: 'Autre' };
  return `<div class="expense-item">
    <div class="exp-icon" style="background:rgba(108,92,231,0.12)">${cat.emoji}</div>
    <div class="exp-info">
      <div class="exp-name">${e.description || cat.name}</div>
      <div class="exp-meta">${cat.name} • ${new Date(e.date).toLocaleDateString('fr-FR')}</div>
    </div>
    <div class="exp-amount">${fmtAmount(e.amount)}</div>
    <button class="exp-delete" onclick="deleteExpense('${e.id}')">✕</button>
  </div>`;
}

// ── Charts ────────────────────────────────────
let doughnutChart = null, lineChart = null;

function renderDoughnut(expenses) {
  const cats = getCategories();
  const bycat = {};
  expenses.forEach(e => { bycat[e.category] = (bycat[e.category] || 0) + e.amount; });
  const labels = Object.keys(bycat).map(k => cats.find(c => c.id === k)?.name || k);
  const data   = Object.values(bycat);
  const colors = ['#6c5ce7','#a29bfe','#fd79a8','#fdcb6e','#00b894','#0984e3','#e17055','#74b9ff'];
  const ctx = document.getElementById('doughnutChart').getContext('2d');
  if (doughnutChart) doughnutChart.destroy();
  doughnutChart = new Chart(ctx, {
    type: 'doughnut',
    data: { labels, datasets: [{ data, backgroundColor: colors.slice(0, data.length), borderWidth: 2, borderColor: '#12121a' }] },
    options: { responsive: true, maintainAspectRatio: false, cutout: '65%',
      plugins: {
        legend: { position: 'right', labels: { color: '#a0a0b8', font: { size: 13 }, padding: 12 } },
        tooltip: { callbacks: { label: ctx => `${ctx.label}: ${fmtAmount(ctx.parsed)}` } },
      },
    },
  });
}

function renderLine() {
  const data = getData();
  const months = [], vals = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(); d.setMonth(d.getMonth() - i);
    const y = d.getFullYear(), m = d.getMonth();
    const total = data
      .filter(e => { const ed = new Date(e.date); return ed.getFullYear() === y && ed.getMonth() === m; })
      .reduce((s, e) => s + e.amount, 0);
    months.push(d.toLocaleDateString('fr-FR', { month: 'short' }));
    vals.push(parseFloat((total * currencyRates[currentCurrency]).toFixed(2)));
  }
  const ctx = document.getElementById('lineChart').getContext('2d');
  if (lineChart) lineChart.destroy();
  lineChart = new Chart(ctx, {
    type: 'line',
    data: { labels: months, datasets: [{ label: 'Dépenses', data: vals, borderColor: '#6c5ce7', backgroundColor: 'rgba(108,92,231,0.1)', fill: true, tension: 0.4, pointBackgroundColor: '#a29bfe', pointRadius: 5 }] },
    options: { responsive: true, maintainAspectRatio: false,
      scales: {
        y: { ticks: { color: '#60607a', callback: v => v + ' ' + currentCurrency }, grid: { color: 'rgba(255,255,255,0.05)' } },
        x: { ticks: { color: '#60607a' }, grid: { color: 'rgba(255,255,255,0.05)' } },
      },
      plugins: { legend: { display: false } },
    },
  });
}

// ── Budget ────────────────────────────────────
function renderBudget() {
  const budgets  = getBudgets();
  const expenses = getMonthExpenses();
  const cats     = getCategories();
  let totalBudget = 0, totalSpent = 0, html = '';

  cats.forEach(cat => {
    const limit = budgets[cat.id];
    if (!limit) return;
    const spent = expenses.filter(e => e.category === cat.id).reduce((s, e) => s + e.amount, 0);
    totalBudget += limit; totalSpent += spent;
    const pct = Math.min((spent / limit) * 100, 100);
    const cls = pct >= 100 ? 'over' : pct >= 80 ? 'warn' : 'ok';
    html += `<div class="budget-item">
      <div class="budget-item-header">
        <div class="budget-label">${cat.emoji} ${cat.name}</div>
        <div class="budget-amounts">${fmtAmount(spent)} / ${fmtAmount(limit)}</div>
      </div>
      <div class="budget-bar-bg"><div class="budget-bar-fill ${cls}" style="width:${pct}%"></div></div>
      ${pct >= 100 ? `<div style="font-size:12px;color:var(--red);margin-top:4px">⚠️ Dépassé de ${fmtAmount(spent - limit)}</div>` : ''}
    </div>`;
  });

  document.getElementById('budgetBars').innerHTML = html || '<div style="text-align:center;padding:32px;color:var(--text2)">Aucun budget défini. Cliquez sur "+ Définir budget".</div>';
  document.getElementById('budgetTotal').textContent = totalBudget ? fmtAmount(totalBudget - totalSpent) : '— ' + currentCurrency;

  const { year, month } = getMonthDates();
  const dayOfMonth  = new Date().getDate();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const predicted   = dayOfMonth > 0 ? (totalSpent / dayOfMonth) * daysInMonth : 0;
  document.getElementById('predictedTotal').textContent = fmtAmount(predicted);
  document.getElementById('predictedNote').textContent  = `À ce rythme, vous dépenserez ${fmtAmount(predicted)} ce mois (${daysInMonth} jours)`;
}

function checkAlerts() {
  const budgets  = getBudgets();
  const expenses = getMonthExpenses();
  const cats     = getCategories();
  const alerts   = [];

  cats.forEach(cat => {
    const limit = budgets[cat.id]; if (!limit) return;
    const spent = expenses.filter(e => e.category === cat.id).reduce((s, e) => s + e.amount, 0);
    const pct   = (spent / limit) * 100;
    if (pct >= 100) alerts.push({ type: 'danger',  msg: `🔴 ${cat.emoji} ${cat.name}: Budget dépassé de ${fmtAmount(spent - limit)} (+${Math.round(pct - 100)}%)` });
    else if (pct >= 80) alerts.push({ type: 'warning', msg: `⚠️ ${cat.emoji} ${cat.name}: ${Math.round(pct)}% du budget utilisé (${fmtAmount(limit - spent)} restant)` });
  });

  const salary = getSalary();
  const total  = expenses.reduce((s, e) => s + e.amount, 0);
  if (salary > 0 && total > salary) alerts.push({ type: 'danger', msg: `🔴 Vous avez dépassé votre revenu mensuel de ${fmtAmount(total - salary)}` });

  document.getElementById('alertsContainer').innerHTML = alerts.map(a => `<div class="alert alert-${a.type}">${a.msg}</div>`).join('');
}

// ── Expense list ──────────────────────────────
function renderExpenseList() {
  const filterCat = document.getElementById('filterCat').value;
  const cats = getCategories();
  const sel  = document.getElementById('filterCat');
  sel.innerHTML = '<option value="">Toutes les catégories</option>' +
    cats.map(c => `<option value="${c.id}">${c.emoji} ${c.name}</option>`).join('');
  sel.value = filterCat;

  let expenses = getMonthExpenses();
  if (filterCat) expenses = expenses.filter(e => e.category === filterCat);
  expenses = [...expenses].reverse();

  const el = document.getElementById('fullExpenseList');
  el.innerHTML = expenses.length
    ? expenses.map(e => expenseHTML(e)).join('')
    : '<div style="text-align:center;padding:32px;color:var(--text2)">Aucune dépense trouvée</div>';
}

// ── Analytics ─────────────────────────────────
let analyticsBarChart = null, analyticsCompareChart = null;

function renderAnalytics() {
  const expenses = getMonthExpenses();
  const cats     = getCategories();
  const bycat    = {};
  expenses.forEach(e => { bycat[e.category] = (bycat[e.category] || 0) + e.amount; });
  const filteredCats = cats.filter(c => bycat[c.id]);
  const labels = filteredCats.map(c => c.emoji + ' ' + c.name);
  const vals   = filteredCats.map(c => parseFloat((bycat[c.id] * currencyRates[currentCurrency]).toFixed(2)));

  const ctx = document.getElementById('analyticsBar').getContext('2d');
  if (analyticsBarChart) analyticsBarChart.destroy();
  analyticsBarChart = new Chart(ctx, {
    type: 'bar',
    data: { labels, datasets: [{ label: 'Dépenses', data: vals, backgroundColor: 'rgba(108,92,231,0.7)', borderRadius: 8 }] },
    options: { responsive: true, maintainAspectRatio: false,
      scales: {
        y: { ticks: { color: '#60607a' }, grid: { color: 'rgba(255,255,255,0.05)' } },
        x: { ticks: { color: '#60607a', font: { size: 11 } }, grid: { display: false } },
      },
      plugins: { legend: { display: false } },
    },
  });

  const allData = getData();
  const months = [], incomeVals = [], expVals = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(); d.setMonth(d.getMonth() - i);
    const y = d.getFullYear(), m = d.getMonth();
    const total = allData
      .filter(e => { const ed = new Date(e.date); return ed.getFullYear() === y && ed.getMonth() === m; })
      .reduce((s, e) => s + e.amount, 0);
    months.push(d.toLocaleDateString('fr-FR', { month: 'short' }));
    incomeVals.push(parseFloat((getSalary() * currencyRates[currentCurrency]).toFixed(2)));
    expVals.push(parseFloat((total * currencyRates[currentCurrency]).toFixed(2)));
  }

  const ctx2 = document.getElementById('analyticsCompare').getContext('2d');
  if (analyticsCompareChart) analyticsCompareChart.destroy();
  analyticsCompareChart = new Chart(ctx2, {
    type: 'bar',
    data: { labels: months, datasets: [
      { label: 'Revenus',  data: incomeVals, backgroundColor: 'rgba(0,184,148,0.6)',  borderRadius: 6 },
      { label: 'Dépenses', data: expVals,    backgroundColor: 'rgba(214,48,49,0.6)',  borderRadius: 6 },
    ]},
    options: { responsive: true, maintainAspectRatio: false,
      scales: {
        y: { ticks: { color: '#60607a' }, grid: { color: 'rgba(255,255,255,0.05)' } },
        x: { ticks: { color: '#60607a' }, grid: { display: false } },
      },
      plugins: { legend: { labels: { color: '#a0a0b8' } } },
    },
  });

  renderInsights(expenses);
}

function renderInsights(expenses) {
  const salary = getSalary();
  const total  = expenses.reduce((s, e) => s + e.amount, 0);
  const cats   = getCategories();
  const bycat  = {};
  expenses.forEach(e => { bycat[e.category] = (bycat[e.category] || 0) + e.amount; });
  const top    = Object.entries(bycat).sort((a, b) => b[1] - a[1])[0];
  const topCat = top ? cats.find(c => c.id === top[0]) : null;

  let html = '<div class="card"><div class="card-header"><div class="card-title">💡 Insights</div></div>';
  if (total === 0) {
    html += '<div class="insight-card"><p>Ajoutez des dépenses pour voir vos analyses personnalisées.</p></div></div>';
    document.getElementById('insightsContainer').innerHTML = html; return;
  }
  if (topCat) html += `<div class="insight-card"><h4>${topCat.emoji} Principale dépense : ${topCat.name}</h4><p>Vous avez dépensé ${fmtAmount(top[1])} en ${topCat.name} ce mois, soit ${Math.round((top[1] / total) * 100)}% de vos dépenses totales.</p></div>`;
  if (salary > 0) {
    const rate = Math.round(((salary - total) / salary) * 100);
    const tag  = rate >= 20 ? 'tag-green' : rate >= 0 ? 'tag-amber' : 'tag-red';
    const msg  = rate >= 20 ? 'Excellent ! Vous épargnez bien.' : rate >= 0 ? 'Attention à vos dépenses.' : 'Vous dépassez votre revenu !';
    html += `<div class="insight-card"><h4>📊 Taux d'épargne</h4><p>Vous avez économisé <span class="tag ${tag}">${rate}%</span> de votre revenu ce mois. ${msg}</p></div>`;
  }
  const avgPerDay = total / new Date().getDate();
  html += `<div class="insight-card"><h4>📅 Dépense moyenne</h4><p>Vous dépensez en moyenne ${fmtAmount(avgPerDay)} par jour ce mois.</p></div>`;
  html += '</div>';
  document.getElementById('insightsContainer').innerHTML = html;
}

// ── Savings ───────────────────────────────────
let savingsChart = null;

function renderSavings() {
  const salary   = getSalary();
  const expenses = getMonthExpenses();
  const total    = expenses.reduce((s, e) => s + e.amount, 0);
  const savings  = Math.max(0, salary - total);
  const rate     = salary > 0 ? Math.round((savings / salary) * 100) : 0;
  const goal     = state.savingsGoal || 0;

  document.getElementById('savingsAmount').textContent      = fmtAmount(savings);
  document.getElementById('savingsRate2').textContent       = rate + '%';
  document.getElementById('savingsGoalDisplay').textContent = goal ? fmtAmount(goal) : 'Non défini';

  let tips = '';
  if (rate >= 20)     tips = '<div class="insight-card"><h4>🌟 Excellent !</h4><p>Votre taux d\'épargne est excellent. Continuez ainsi !</p></div>';
  else if (rate >= 10) tips = '<div class="insight-card"><h4>👍 Bon travail</h4><p>Essayez d\'atteindre 20% d\'épargne. Réduisez les loisirs.</p></div>';
  else                 tips = '<div class="insight-card"><h4>⚠️ Amélioration nécessaire</h4><p>Essayez de réduire vos dépenses non essentielles pour épargner davantage.</p></div>';
  document.getElementById('savingsTips').innerHTML = tips;

  const data = getData();
  const months = [], savVals = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(); d.setMonth(d.getMonth() - i);
    const y = d.getFullYear(), m = d.getMonth();
    const tot = data
      .filter(e => { const ed = new Date(e.date); return ed.getFullYear() === y && ed.getMonth() === m; })
      .reduce((s, e) => s + e.amount, 0);
    months.push(d.toLocaleDateString('fr-FR', { month: 'short' }));
    savVals.push(parseFloat((Math.max(0, salary - tot) * currencyRates[currentCurrency]).toFixed(2)));
  }

  const ctx = document.getElementById('savingsChart').getContext('2d');
  if (savingsChart) savingsChart.destroy();
  savingsChart = new Chart(ctx, {
    type: 'line',
    data: { labels: months, datasets: [{ label: 'Épargne', data: savVals, borderColor: '#fdcb6e', backgroundColor: 'rgba(253,203,110,0.1)', fill: true, tension: 0.4, pointBackgroundColor: '#fdcb6e', pointRadius: 5 }] },
    options: { responsive: true, maintainAspectRatio: false,
      scales: {
        y: { ticks: { color: '#60607a' }, grid: { color: 'rgba(255,255,255,0.05)' } },
        x: { ticks: { color: '#60607a' }, grid: { color: 'rgba(255,255,255,0.05)' } },
      },
      plugins: { legend: { display: false } },
    },
  });
}

async function setSavingsGoal() {
  const g = parseFloat(document.getElementById('savingsGoalInput').value);
  if (!g) return;
  try {
    await api.put('/settings', { savingsGoal: g });
    state.savingsGoal = g;
    renderSavings();
  } catch (err) { alert(err.message); }
}

// ── Trophies ──────────────────────────────────
const trophyDefs = [
  { id: 'first',      name: 'Premier pas',      emoji: '🌱', desc: 'Première dépense ajoutée',        check: () => getData().length >= 1 },
  { id: 'ten',        name: 'Actif',             emoji: '⚡', desc: '10 dépenses enregistrées',        check: () => getData().length >= 10 },
  { id: 'budget',     name: 'Budgeteur',         emoji: '🎯', desc: 'Premier budget défini',           check: () => Object.keys(getBudgets()).length >= 1 },
  { id: 'saver',      name: 'Épargnant',         emoji: '🏦', desc: 'Économiser 10% du revenu',        check: () => { const s = getSalary(); const t = getMonthExpenses().reduce((a, e) => a + e.amount, 0); return s > 0 && (s - t) / s >= 0.1; } },
  { id: 'nosave',     name: 'Super épargnant',   emoji: '💎', desc: 'Économiser 20% du revenu',        check: () => { const s = getSalary(); const t = getMonthExpenses().reduce((a, e) => a + e.amount, 0); return s > 0 && (s - t) / s >= 0.2; } },
  { id: 'categories', name: 'Organisé',          emoji: '📂', desc: 'Dépenses dans 5 catégories',     check: () => new Set(getData().map(e => e.category)).size >= 5 },
  { id: 'salary',     name: 'Revenus définis',   emoji: '💼', desc: 'Revenu mensuel configuré',        check: () => getSalary() > 0 },
  { id: 'custom',     name: 'Personnalisé',      emoji: '✨', desc: 'Catégorie personnalisée créée',   check: () => state.customCategories.length >= 1 },
];

function renderTrophies() {
  const earned = trophyDefs.filter(t => t.check());
  const pts    = earned.length * 100;
  const levels = [
    { min: 0,   name: 'Débutant' }, { min: 200, name: 'Intermédiaire' },
    { min: 400, name: 'Avancé'   }, { min: 700, name: 'Expert' },
    { min: 800, name: 'Maître 🌟' },
  ];
  const level = levels.filter(l => pts >= l.min).pop();
  document.getElementById('totalPoints').textContent   = pts;
  document.getElementById('trophiesEarned').textContent = `${earned.length}/${trophyDefs.length}`;
  document.getElementById('userLevel').textContent      = level.name;
  document.getElementById('pointsDisplay').textContent  = pts;
  document.getElementById('trophyGrid').innerHTML = trophyDefs.map(t => {
    const ok = t.check();
    return `<div class="trophy ${ok ? 'earned' : ''}">
      <div class="trophy-emoji">${t.emoji}</div>
      <div class="trophy-name">${t.name}</div>
      <div class="trophy-desc">${t.desc}</div>
      ${ok ? '<div style="font-size:11px;color:var(--amber);margin-top:6px">+100 pts</div>' : ''}
    </div>`;
  }).join('');
}

function updatePoints() {
  const pts = trophyDefs.filter(t => t.check()).length * 100;
  document.getElementById('pointsDisplay').textContent = pts;
}

// ── Modals ────────────────────────────────────
function openAddModal() {
  const cats = getCategories();
  const sel  = document.getElementById('modalCategory');
  sel.innerHTML = '<option value="">Choisir une catégorie</option>' +
    cats.map(c => `<option value="${c.id}">${c.emoji} ${c.name}</option>`).join('');
  document.getElementById('modalDate').value   = new Date().toISOString().split('T')[0];
  document.getElementById('modalAmount').value = '';
  document.getElementById('modalDesc').value   = '';
  document.getElementById('addModal').classList.add('open');
}

function openBudgetModal() {
  const cats = getCategories();
  const sel  = document.getElementById('budgetModalCat');
  sel.innerHTML = '<option value="">Choisir une catégorie</option>' +
    cats.map(c => `<option value="${c.id}">${c.emoji} ${c.name}</option>`).join('');
  document.getElementById('budgetModalAmount').value = '';
  document.getElementById('budgetModal').classList.add('open');
}

function closeModal(id) { document.getElementById(id).classList.remove('open'); }

// ── CRUD — Expenses ───────────────────────────
async function addExpense() {
  const amount      = parseFloat(document.getElementById('modalAmount').value);
  const category    = document.getElementById('modalCategory').value;
  const date        = document.getElementById('modalDate').value;
  const description = document.getElementById('modalDesc').value;

  if (!amount || !category || !date) { alert('Veuillez remplir les champs requis'); return; }

  try {
    const expense = await api.post('/expenses', { amount, category, date, description });
    state.expenses.push(expense);
    closeModal('addModal');
    refreshAll();
    renderExpenseList();
  } catch (err) { alert(err.message); }
}

async function deleteExpense(id) {
  try {
    await api.delete('/expenses/' + id);
    state.expenses = state.expenses.filter(e => e.id !== id);
    refreshAll();
    renderExpenseList();
    renderRecentExpenses();
  } catch (err) { alert(err.message); }
}

// ── CRUD — Budget ─────────────────────────────
async function saveBudget() {
  const category = document.getElementById('budgetModalCat').value;
  const amount   = parseFloat(document.getElementById('budgetModalAmount').value);
  if (!category || !amount) { alert('Veuillez remplir tous les champs'); return; }

  try {
    await api.post('/budgets', { category, amount });
    state.budgets[category] = amount;
    closeModal('budgetModal');
    renderBudget();
    checkAlerts();
  } catch (err) { alert(err.message); }
}

// ── CRUD — Salary ─────────────────────────────
async function setSalary() {
  const s = parseFloat(document.getElementById('salaryInput').value);
  if (!s) { alert('Entrez un montant valide'); return; }

  try {
    await api.put('/settings', { salary: s });
    state.salary = s;
    document.getElementById('currentSalary').textContent = fmtAmount(s);
    refreshAll();
  } catch (err) { alert(err.message); }
}

// ── CRUD — Custom categories ──────────────────
async function addCustomCategory() {
  const name  = document.getElementById('newCatName').value.trim();
  const emoji = document.getElementById('newCatEmoji').value.trim() || '🏷️';
  if (!name) { alert('Nom requis'); return; }

  try {
    const id  = name.toLowerCase().replace(/\s+/g, '_') + Date.now();
    const cat = await api.post('/settings/categories', { id, name, emoji });
    state.customCategories.push(cat);
    document.getElementById('newCatName').value  = '';
    document.getElementById('newCatEmoji').value = '';
    renderCategoryList();
  } catch (err) { alert(err.message); }
}

async function deleteCategory(id) {
  try {
    await api.delete('/settings/categories/' + id);
    state.customCategories = state.customCategories.filter(c => c.id !== id);
    renderCategoryList();
  } catch (err) { alert(err.message); }
}

function renderCategoryList() {
  const all    = getCategories();
  const custom = state.customCategories;
  const el     = document.getElementById('categoryList');
  el.innerHTML = all.map(c => {
    const isCustom = custom.find(x => x.id === c.id);
    return `<div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--border)">
      <span style="font-size:20px">${c.emoji}</span>
      <span style="flex:1;font-size:15px">${c.name}</span>
      ${isCustom
        ? `<button onclick="deleteCategory('${c.id}')" style="background:none;border:none;cursor:pointer;color:var(--text3);font-size:14px;opacity:0.6" onmouseover="this.style.opacity=1;this.style.color='var(--red)'" onmouseout="this.style.opacity=0.6;this.style.color='var(--text3)'">✕</button>`
        : '<span style="font-size:12px;color:var(--text3)">Par défaut</span>'}
    </div>`;
  }).join('');
}

// ── Restore session on page load ──────────────
(async function init() {
  const token   = sessionStorage.getItem('fintrack_token');
  const userStr = sessionStorage.getItem('fintrack_user');

  if (token && userStr) {
    try {
      currentUser = JSON.parse(userStr);
      await loadUserData();
      enterApp();
      return;
    } catch {
      // Token expired or invalid — fall through to landing
      api.token = null;
      sessionStorage.removeItem('fintrack_user');
    }
  }

  showPage('landingPage');
})();
