'use strict';

/* ─── THEME ──────────────────────────────────────────────── */
let _staffTheme = localStorage.getItem('sb_staff_theme') || 'dark';

function applyStaffTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  _staffTheme = theme;
  localStorage.setItem('sb_staff_theme', theme);
  const isDark = theme === 'dark';
  const icon   = isDark ? '🌙' : '☀️';
  const label  = isDark ? 'Dark Mode' : 'Light Mode';

  // Standard toggle buttons
  ['landing-theme-btn','login-theme-btn','reg-theme-btn'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = icon;
  });

  // Dashboard pill toggle
  const pillIcon  = document.getElementById('staff-theme-icon');
  const pillLabel = document.getElementById('staff-theme-label');
  const pillBtn   = document.getElementById('staff-theme-btn');
  if (pillIcon)  pillIcon.textContent  = icon;
  if (pillLabel) pillLabel.textContent = label;

  // Also keep fallback for old btn id
  const staffBtn = document.getElementById('staff-theme-btn');
  if (staffBtn && !pillLabel) staffBtn.textContent = icon;
}

function toggleStaffTheme() {
  applyStaffTheme(_staffTheme === 'dark' ? 'light' : 'dark');
}

// Apply theme immediately on page load
document.addEventListener('DOMContentLoaded', () => applyStaffTheme(_staffTheme));

/* ─── STATE ─────────────────────────────────────────────── */
const state = {
  currentUser: null,
  currentRole: null,
  loginTime: null,
  pendingOTP: null,
  pendingRegData: null,
};

const RESIDENTS_KEY      = 'sb_residents';
const ACCOUNTS_KEY       = 'sb_accounts';
const INCIDENTS_KEY      = 'sb_incidents';
const NOTIFS_KEY         = 'sb_notifs';
const TASKS_KEY          = 'sb_tasks';
const SHARED_REPORTS_KEY = 'bos_shared_reports';
const SHARED_NOTIFS_KEY  = 'bos_resident_notifs';

/* ─── STORAGE HELPERS ───────────────────────────────────── */
function getLS(key, def=[]) { try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(def)); } catch { return def; } }
function setLS(key, val)    { localStorage.setItem(key, JSON.stringify(val)); }

function getResidents()  { return getLS(RESIDENTS_KEY, []); }
function saveResidents(d){ setLS(RESIDENTS_KEY, d); }
function getAccounts()   { return getLS(ACCOUNTS_KEY, []); }
function saveAccounts(d) { setLS(ACCOUNTS_KEY, d); }
function getIncidents()  { return getLS(INCIDENTS_KEY, []); }
function saveIncidents(d){ setLS(INCIDENTS_KEY, d); }
function getNotifs()     { return getLS(NOTIFS_KEY, []); }
function saveNotifs(d)   { setLS(NOTIFS_KEY, d); }
function getTasks()      { return getLS(TASKS_KEY, []); }
function saveTasks(d)    { setLS(TASKS_KEY, d); }
function getSharedReports()    { return getLS(SHARED_REPORTS_KEY, []); }
function saveSharedReports(d)  { setLS(SHARED_REPORTS_KEY, d); }
function getResidentNotifs()   { return getLS(SHARED_NOTIFS_KEY, []); }
function saveResidentNotifs(d) { setLS(SHARED_NOTIFS_KEY, d); }

/* ─── UTILS ─────────────────────────────────────────────── */
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const s = document.getElementById(id);
  if (s) s.classList.add('active');
  if (id === 'landing-screen') updateLandingStat();
}

function toast(msg, type='') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast show' + (type ? ' '+type : '');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), 3600);
}

function switchPanel(name) {
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.sb-link').forEach(l => l.classList.remove('active'));
  const panel = document.getElementById('panel-'+name);
  if (panel) panel.classList.add('active');
  const link = document.querySelector(`.sb-link[onclick="switchPanel('${name}')"]`);
  if (link) link.classList.add('active');
  const titles = { dash:'Dashboard', incidents:'Incident Management', residents:'Resident Management', notifications:'Notifications', settings:'Settings', analytics:'Analytics', announcements:'Announcements', officials:'Officials Directory', activitylog:'Activity Log', livemap:'Live Incident Map' };
  const bc = document.getElementById('dash-breadcrumb');
  if (bc) bc.textContent = titles[name] || name;
  if (window.innerWidth <= 800) document.getElementById('sidebar')?.classList.remove('open');

  if (name === 'dash')          { updateDashKPIs(); renderDashNotifs(); renderTodaysTasks(); renderMonthlyChart(); }
  if (name === 'incidents')     renderIncidentsTable();
  if (name === 'residents')     renderResidentsTable();
  if (name === 'notifications') renderNotificationsPanel();
  if (name === 'analytics')     renderAnalytics();
  if (name === 'announcements') renderAnnouncements();
  if (name === 'activitylog')   renderActivityLog();
  if (name === 'livemap')       renderLiveMap();
}

function toggleSidebar() { document.getElementById('sidebar')?.classList.toggle('open'); }

function updateLandingStat() {
  const el = document.getElementById('landing-residents');
  if (el) el.textContent = getResidents().length;
}

/* ─── AI PRIORITY ENGINE ─────────────────────────────────── */
function computeAIPriority(incident) {
  let score = 0;
  const sevMap = { critical: 90, high: 70, medium: 45, low: 20 };
  score += sevMap[incident.severity] || 20;
  const urgentKw = ['fire','flood','crime','medical','accident','violent','emergency','dead','injury','stab','shoot','drown','assault'];
  const text = ((incident.desc||'') + ' ' + (incident.type||'')).toLowerCase();
  urgentKw.forEach(kw => { if (text.includes(kw)) score += 8; });
  score = Math.min(100, score);
  let label, color, badge;
  if (score >= 85)      { label='CRITICAL'; color='#D32F2F'; badge='🔴'; }
  else if (score >= 65) { label='HIGH';     color='#E65100'; badge='🟠'; }
  else if (score >= 40) { label='MEDIUM';   color='#F57F17'; badge='🟡'; }
  else                  { label='LOW';      color='#1565C0'; badge='🔵'; }
  return { score, label, color, badge };
}

/* ─── DASHBOARD KPIs ────────────────────────────────────── */
function updateDashKPIs() {
  const residents  = getResidents();
  const incidents  = getIncidents();
  const sharedReps = getSharedReports();
  const active     = incidents.filter(i => i.status !== 'completed').length + sharedReps.filter(r => r.status !== 'completed').length;
  const completed  = incidents.filter(i => i.status === 'completed').length + sharedReps.filter(r => r.status === 'completed').length;

  const r = document.getElementById('kpi-residents');
  const i = document.getElementById('kpi-incidents');
  const c = document.getElementById('kpi-completed');
  if (r) r.textContent = residents.length;
  if (i) i.textContent = active;
  if (c) c.textContent = completed;

  const rt = document.getElementById('kpi-res-trend');
  if (rt) rt.textContent = residents.length > 0 ? `${residents.length} registered` : 'No data yet';

  const it = document.getElementById('kpi-inc-trend');
  if (it) it.textContent = active > 0 ? `${active} pending resolution` : 'All clear';

  updateNotifBadge();
}

/* ─── MONTHLY CHART ─────────────────────────────────────── */
function renderMonthlyChart() {
  const incidents  = getIncidents();
  const sharedReps = getSharedReports();
  const all        = [...incidents, ...sharedReps];
  const monthly    = Array(12).fill(0);
  const currentYear = new Date().getFullYear();
  all.forEach(item => {
    const d = new Date(item.date || item.createdAt || Date.now());
    if (d.getFullYear() === currentYear) monthly[d.getMonth()]++;
  });
  const max = Math.max(...monthly, 1);
  for (let i = 0; i < 12; i++) {
    const bar = document.getElementById('bar-' + i);
    if (bar) {
      const h = Math.round((monthly[i] / max) * 90);
      bar.style.cssText = `--h:${Math.max(h, 4)}px; height:${Math.max(h, 4)}px`;
      bar.title = `${monthly[i]} incidents`;
    }
  }
  const curMonth = new Date().getMonth();
  document.querySelectorAll('#monthly-chart .bar').forEach((b,i) => {
    b.classList.toggle('active', i === curMonth);
  });
}

/* ─── DASHBOARD NOTIFICATIONS WIDGET ───────────────────── */
function renderDashNotifs() {
  const el = document.getElementById('dash-notif-list');
  if (!el) return;
  const notifs = getNotifs().slice(0, 4);
  if (notifs.length === 0) {
    el.innerHTML = '<div style="padding:20px;text-align:center;opacity:0.5;">No notifications</div>';
    return;
  }
  el.innerHTML = notifs.map(n => `
    <div style="display:flex;gap:10px;padding:8px 0;border-bottom:1px solid var(--border);align-items:flex-start">
      <span style="font-size:1rem;flex-shrink:0">${n.icon||'🔔'}</span>
      <div style="flex:1;min-width:0">
        <div style="font-size:.82rem;color:var(--text-primary);${n.read ? 'opacity:.6' : 'font-weight:600'}">${n.text}</div>
        <div style="font-size:.7rem;color:var(--text-dim);margin-top:2px">${timeAgo(n.date)}</div>
      </div>
    </div>`).join('');
}

/* ─── TODAY'S TASKS WIDGET ──────────────────────────────── */
function renderTodaysTasks() {
  const el = document.getElementById('dash-task-list');
  if (!el) return;
  const tasks = getTasks();
  const today = new Date().toDateString();
  const todayTasks = tasks.filter(t => new Date(t.dueDate).toDateString() === today || t.today);
  if (todayTasks.length === 0) {
    el.innerHTML = '<div style="padding:20px;text-align:center;opacity:0.5;">No tasks for today</div>';
    return;
  }
  el.innerHTML = todayTasks.map(t => `
    <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border)">
      <input type="checkbox" ${t.done?'checked':''} onchange="toggleTask(${t.id})" style="accent-color:var(--blue-bright);flex-shrink:0"/>
      <div style="flex:1;min-width:0">
        <div style="font-size:.83rem;color:var(--text-primary);${t.done?'text-decoration:line-through;opacity:.5':''}">${t.title}</div>
        <div style="font-size:.7rem;color:var(--text-dim)">${t.assignee||'Unassigned'}</div>
      </div>
      <span style="font-size:.7rem;padding:2px 7px;border-radius:4px;background:rgba(21,101,192,0.1);color:var(--blue-accent)">${t.priority||'Normal'}</span>
    </div>`).join('');
}

function toggleTask(id) {
  const tasks = getTasks();
  const idx = tasks.findIndex(t => t.id === id);
  if (idx !== -1) { tasks[idx].done = !tasks[idx].done; saveTasks(tasks); renderTodaysTasks(); }
}

/* ─── NOTIFICATIONS PANEL ───────────────────────────────── */
function renderNotificationsPanel() {
  const el = document.getElementById('notif-full-list');
  if (!el) return;
  const notifs = getNotifs();
  const sharedReps = getSharedReports();
  const pending = sharedReps.filter(r => r.status === 'pending');
  const inProg  = sharedReps.filter(r => r.status === 'in-progress');

  const reportItems = [
    ...pending.map(r => {
      const ai = computeAIPriority(r);
      const reporterName = r.reporterName || r.residentName || 'Anonymous';
      return `<div style="background:var(--bg-card2);border:1px solid ${ai.color}44;border-left:3px solid ${ai.color};border-radius:8px;padding:14px 18px;margin-bottom:10px;display:flex;gap:14px;align-items:center">
        <div style="font-size:1.3rem">${ai.badge}</div>
        <div style="flex:1">
          <div style="font-weight:700;color:var(--text-primary)">New Resident Report #${r.id}</div>
          <div style="font-size:.81rem;color:var(--text-sec)">${r.type||'Incident'} · ${r.location||''}</div>
          <div style="font-size:.74rem;color:#64B5F6;margin-top:2px">👤 Reporter: <strong>${reporterName}</strong></div>
          <div style="font-size:.74rem;color:var(--text-dim)">AI: <strong style="color:${ai.color}">${ai.label} (${ai.score})</strong> · ${formatDateShort(r.date||r.createdAt)}</div>
        </div>
        <div style="display:flex;flex-direction:column;gap:5px">
          <button class="btn-sm blue" onclick="viewReportDetails(${r.id},'shared')" style="font-size:.75rem">👁 Details</button>
          <button class="btn-sm" onclick="markSharedReportInProgress(${r.id})" style="font-size:.75rem">⚙️ In Progress</button>
          <button class="btn-sm green" onclick="markSharedReportComplete(${r.id})" style="font-size:.75rem">✅ Resolve</button>
        </div>
      </div>`;
    }),
    ...inProg.map(r => {
      const reporterName = r.reporterName || r.residentName || 'Anonymous';
      return `<div style="background:var(--bg-card2);border:1px solid #42A5F544;border-left:3px solid #42A5F5;border-radius:8px;padding:12px 18px;margin-bottom:8px;display:flex;gap:14px;align-items:center">
        <div style="font-size:1.2rem">⚙️</div>
        <div style="flex:1">
          <div style="font-weight:700;color:var(--text-primary)">In Progress — Report #${r.id}</div>
          <div style="font-size:.8rem;color:var(--text-sec)">${r.type||''} · ${r.location||''}</div>
          <div style="font-size:.74rem;color:#64B5F6;margin-top:2px">👤 Reporter: <strong>${reporterName}</strong></div>
        </div>
        <div style="display:flex;flex-direction:column;gap:5px">
          <button class="btn-sm blue" onclick="viewReportDetails(${r.id},'shared')" style="font-size:.75rem">👁 Details</button>
          <button class="btn-sm green" onclick="markSharedReportComplete(${r.id})" style="font-size:.75rem">✅ Complete</button>
        </div>
      </div>`;
    })
  ];

  const staffNotifItems = notifs.map(n => `
    <div style="background:var(--bg-card2);border:1px solid var(--border);border-left:3px solid ${n.read?'var(--border)':'var(--blue-bright)'};border-radius:8px;padding:14px 18px;margin-bottom:8px;display:flex;gap:14px;align-items:center">
      <div style="font-size:1.3rem">${n.icon||'🔔'}</div>
      <div style="flex:1">
        <div style="font-size:.84rem;color:var(--text-primary);${n.read?'opacity:.6':'font-weight:600'}">${n.text}</div>
        <div style="font-size:.73rem;color:var(--text-dim);margin-top:2px">${timeAgo(n.date)}</div>
      </div>
      ${!n.read ? `<button class="btn-sm" onclick="markNotifRead(${n.id})" style="font-size:.7rem">Mark Read</button>` : ''}
    </div>`);

  const all = [...reportItems, ...staffNotifItems];
  el.innerHTML = all.length
    ? all.join('')
    : '<div style="padding:32px;text-align:center;opacity:0.5;">No notifications</div>';
}

function addNotif(icon, text) {
  const notifs = getNotifs();
  const n = { id: Date.now(), icon, text, date: new Date().toISOString(), read: false };
  notifs.unshift(n);
  saveNotifs(notifs);
  updateNotifBadge();
  renderDashNotifs();
}

function markNotifRead(id) {
  const notifs = getNotifs();
  const idx = notifs.findIndex(n => n.id === id);
  if (idx !== -1) { notifs[idx].read = true; saveNotifs(notifs); }
  renderNotificationsPanel();
  updateNotifBadge();
}

function markAllNotifsRead() {
  const notifs = getNotifs().map(n => ({...n, read:true}));
  saveNotifs(notifs);
  renderNotificationsPanel();
  updateNotifBadge();
  toast('All notifications marked as read.', 'success');
}

/* ─── CLEAR ALL NOTIFICATIONS (with toggle confirmation) ── */
function clearAllNotifs() {
  const existing = document.getElementById('clear-notif-confirm');
  if (existing) { existing.remove(); return; }

  const bar = document.createElement('div');
  bar.id = 'clear-notif-confirm';
  bar.style.cssText = `
    display:flex;align-items:center;gap:12px;
    background:rgba(211,47,47,0.1);border:1px solid rgba(211,47,47,0.35);
    border-radius:8px;padding:12px 16px;margin-bottom:12px;
    animation:fadeIn .2s ease;
  `;
  bar.innerHTML = `
    <span style="font-size:1rem">⚠️</span>
    <span style="flex:1;font-size:.83rem;color:var(--text-sec)">Clear all staff notifications? This cannot be undone.</span>
    <button class="btn-sm orange" onclick="confirmClearNotifs()" style="font-size:.75rem">🗑 Yes, Clear All</button>
    <button class="btn-sm" onclick="document.getElementById('clear-notif-confirm')?.remove()" style="font-size:.75rem">Cancel</button>
  `;
  const list = document.getElementById('notif-full-list');
  list?.parentNode?.insertBefore(bar, list);
}

function confirmClearNotifs() {
  saveNotifs([]);
  document.getElementById('clear-notif-confirm')?.remove();
  renderNotificationsPanel();
  updateNotifBadge();
  toast('All staff notifications cleared.');
}

function addTestNotification() {
  const tests = ['🔔 New resident registered in Purok 3', '🚨 Incident report submitted by resident', '✅ Report #12 resolved by staff', '📋 Monthly incident data updated'];
  addNotif('🔔', tests[Math.floor(Math.random() * tests.length)]);
  toast('Test notification added!', 'success');
  renderNotificationsPanel();
}

function updateNotifBadge() {
  const notifs  = getNotifs().filter(n => !n.read).length;
  const pending = getSharedReports().filter(r => r.status === 'pending').length;
  const total   = notifs + pending;
  const badge   = document.getElementById('notif-count-badge');
  if (badge) {
    badge.textContent = total;
    badge.style.background = total > 0 ? 'var(--orange)' : '';
  }
}

/* ─── VIEW REPORT DETAILS MODAL ──────────────────────────── */
function viewReportDetails(id, source) {
  let report;
  if (source === 'shared') {
    report = getSharedReports().find(r => r.id === id);
  } else {
    report = getIncidents().find(r => r.id === id);
  }
  if (!report) return;

  const ai = computeAIPriority(report);
  const statusColor = report.status==='completed' ? '#00C853' : report.status==='in-progress' ? '#42A5F5' : '#F57F17';
  const statusLabel = report.status==='completed' ? '✅ Completed' : report.status==='in-progress' ? '⚙️ In Progress' : '⏳ Pending';
  const reporterName = report.reporterName || report.residentName || report.createdBy || 'Staff';
  const reporterContact = report.reporterContact || report.contact || '—';

  const m = document.createElement('div');
  m.className = 'modal-overlay';
  m.innerHTML = `
    <div class="modal-box" style="max-width:520px">
      <button onclick="this.closest('.modal-overlay').remove()" style="position:absolute;top:14px;right:16px;background:transparent;border:none;color:#7A94C1;font-size:1.2rem;cursor:pointer;line-height:1">✕</button>
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:22px">
        <div style="font-size:2rem">${ai.badge}</div>
        <div>
          <div style="font-family:var(--font-display);font-size:.9rem;color:var(--blue-accent);font-weight:700">Report #${report.id} — Details</div>
          <div style="font-size:.72rem;color:var(--text-dim);margin-top:2px;font-family:var(--font-mono)">${source === 'shared' ? 'RESIDENT REPORT' : 'STAFF INCIDENT'}</div>
        </div>
        <div style="margin-left:auto">
          <span style="padding:4px 12px;border-radius:20px;font-size:.72rem;font-weight:700;border:1px solid ${statusColor}44;color:${statusColor};background:${statusColor}18">${statusLabel}</span>
        </div>
      </div>

      <div style="background:var(--bg-dark);border:1px solid var(--border);border-radius:8px;padding:14px 18px;margin-bottom:14px">
        <div style="font-family:var(--font-mono);font-size:.62rem;color:var(--text-dim);letter-spacing:.1em;margin-bottom:8px">👤 REPORTER INFORMATION</div>
        <div style="display:flex;flex-direction:column;gap:6px">
          <div style="display:flex;justify-content:space-between"><span style="color:var(--text-dim);font-size:.78rem">Name</span><strong style="color:#64B5F6;font-size:.82rem">${reporterName}</strong></div>
          <div style="display:flex;justify-content:space-between"><span style="color:var(--text-dim);font-size:.78rem">Contact</span><strong style="color:var(--text-primary);font-size:.82rem">${reporterContact}</strong></div>
          <div style="display:flex;justify-content:space-between"><span style="color:var(--text-dim);font-size:.78rem">Email</span><strong style="color:var(--text-primary);font-size:.82rem">${report.reporterEmail || report.email || '—'}</strong></div>
        </div>
      </div>

      <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:16px">
        ${[
          ['Incident Type', report.type || 'Unknown'],
          ['Location / Purok', report.location || '—'],
          ['Severity', (report.severity||'low').toUpperCase()],
          ['AI Priority', `<span style="color:${ai.color};font-weight:700">${ai.badge} ${ai.label} (Score: ${ai.score})</span>`],
          ['Date Reported', formatDateShort(report.date||report.createdAt||Date.now())],
          ['Completed At', report.completedAt ? formatDateShort(report.completedAt) : '—'],
          ['Completed By', report.completedBy || '—'],
        ].map(([k,v]) => `
          <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid var(--border);padding-bottom:7px">
            <span style="color:var(--text-dim);font-size:.78rem;font-family:var(--font-mono)">${k}</span>
            <strong style="color:var(--text-primary);font-size:.81rem;text-align:right">${v}</strong>
          </div>`).join('')}
      </div>

      ${report.desc ? `
        <div style="background:var(--bg-dark);border:1px solid var(--border);border-radius:8px;padding:14px 18px;margin-bottom:16px">
          <div style="font-family:var(--font-mono);font-size:.62rem;color:var(--text-dim);letter-spacing:.1em;margin-bottom:8px">📝 DESCRIPTION</div>
          <div style="font-size:.84rem;color:var(--text-sec);line-height:1.6">${report.desc}</div>
        </div>` : ''}

      ${report.status !== 'completed' ? `
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:6px">
          ${report.status !== 'in-progress' ? `<button class="btn-sm" onclick="setReportStatus(${id},'${source}','in-progress',this)" style="flex:1;font-size:.8rem;padding:9px 12px;border:1px solid #42A5F5;color:#42A5F5;background:#42A5F518">⚙️ Mark In Progress</button>` : `<span style="color:#42A5F5;font-size:.8rem;padding:9px 12px">⚙️ Already In Progress</span>`}
          <button class="btn-sm green" onclick="setReportStatus(${id},'${source}','completed',this)" style="flex:1;font-size:.8rem;padding:9px 12px">✅ Mark Completed</button>
        </div>` : `<div style="text-align:center;color:var(--green);font-size:.85rem;font-weight:700;padding:8px">✅ This report has been resolved</div>`}
    </div>`;
  document.body.appendChild(m);
  m.addEventListener('click', e => { if (e.target===m) m.remove(); });
}

function setReportStatus(id, source, newStatus, btn) {
  if (btn) { btn.disabled = true; btn.textContent = 'Saving...'; }

  if (source === 'shared') {
    const reports = getSharedReports();
    const idx = reports.findIndex(r => r.id === id);
    if (idx === -1) return;
    reports[idx].status = newStatus;
    if (newStatus === 'completed') {
      reports[idx].completedAt = new Date().toISOString();
      reports[idx].completedBy = state.currentRole || 'Barangay Staff';
      // Notify resident
      const resNotifs = getResidentNotifs();
      resNotifs.push({ icon:'fa-circle-check', color:'green-icon', text:`✅ Your report #${id} — ${reports[idx].type} has been resolved by the Barangay!`, date:new Date().toISOString(), read:false, fromStaff:true, reportId:id, residentEmail: reports[idx].residentEmail || '' });
      saveResidentNotifs(resNotifs);
      addNotif('✅', `Resident report #${id} resolved — ${reports[idx].type}`);
      toast(`✅ Report #${id} resolved! Resident notified.`, 'success');
    } else {
      addNotif('⚙️', `Report #${id} marked as In Progress — ${reports[idx].type}`);
      toast(`⚙️ Report #${id} set to In Progress.`, 'success');
    }
    saveSharedReports(reports);
  } else {
    const incidents = getIncidents();
    const idx = incidents.findIndex(i => i.id === id);
    if (idx === -1) return;
    incidents[idx].status = newStatus;
    if (newStatus === 'completed') {
      incidents[idx].completedAt = new Date().toISOString();
      addNotif('✅', `Incident #${id} marked as completed`);
      toast(`✅ Incident #${id} resolved!`, 'success');
    } else {
      addNotif('⚙️', `Incident #${id} marked as In Progress`);
      toast(`⚙️ Incident #${id} set to In Progress.`, 'success');
    }
    saveIncidents(incidents);
  }

  // Close modal and refresh
  document.querySelectorAll('.modal-overlay').forEach(m => m.remove());
  renderIncidentsTable();
  renderNotificationsPanel();
  updateDashKPIs();
  renderMonthlyChart();
}

/* ─── INCIDENTS ──────────────────────────────────────────── */
function renderIncidentsTable() {
  const tbody = document.getElementById('incidents-tbody');
  if (!tbody) return;
  const incidents  = getIncidents();
  const sharedReps = getSharedReports();
  const all = [
    ...incidents.map(r => ({...r, _source:'staff'})),
    ...sharedReps.map(r => ({...r, fromResident: true, _source:'shared'}))
  ].sort((a, b) => new Date(b.date||b.createdAt||0) - new Date(a.date||a.createdAt||0));

  if (all.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:24px;opacity:0.5;">No incidents recorded</td></tr>';
    return;
  }
  tbody.innerHTML = all.map(r => {
    const ai = computeAIPriority(r);
    const statusColor = r.status==='completed' ? '#00C853' : r.status==='in-progress' ? '#42A5F5' : '#F57F17';
    const statusLabel = r.status==='completed' ? '✅ Completed' : r.status==='in-progress' ? '⚙️ In Progress' : '⏳ Pending';
    const reporterName = r.reporterName || r.residentName || r.createdBy || 'Staff';
    const source = r._source || (r.fromResident ? 'shared' : 'staff');
    const isShared = source === 'shared';
    const actionBtns = r.status !== 'completed'
      ? `<button class="btn-sm blue" onclick="viewReportDetails(${r.id},'${source}')" style="font-size:.7rem">👁 View</button>
         ${r.status !== 'in-progress' && isShared ? `<button class="btn-sm" onclick="markSharedReportInProgress(${r.id})" style="margin-left:4px;font-size:.7rem">⚙️ In Progress</button>` : ''}
         <button class="btn-sm green" onclick="${isShared ? 'markSharedReportComplete' : 'markIncidentComplete'}(${r.id})" style="margin-left:4px;font-size:.7rem">✅ Resolve</button>`
      : `<button class="btn-sm blue" onclick="viewReportDetails(${r.id},'${source}')" style="font-size:.7rem">👁 View</button>`;
    return `<tr>
      <td style="font-family:var(--font-mono);font-size:.72rem">#${r.id}</td>
      <td>${r.type||'Unknown'}</td>
      <td>${r.location||'—'}</td>
      <td style="color:#64B5F6;font-weight:600">${reporterName}</td>
      <td>${formatDateShort(r.date||r.createdAt||Date.now())}</td>
      <td><span style="background:${ai.color}22;color:${ai.color};padding:2px 8px;border-radius:4px;font-size:.75rem;font-weight:700;border:1px solid ${ai.color}55">${ai.badge} ${ai.label} (${ai.score})</span></td>
      <td><span style="color:${statusColor};font-weight:600">${statusLabel}</span></td>
      <td>${actionBtns}</td>
    </tr>`;
  }).join('');
}

function showAddIncidentModal() {
  const existing = document.getElementById('add-incident-modal');
  if (existing) existing.remove();
  const m = document.createElement('div');
  m.id = 'add-incident-modal';
  m.className = 'modal-overlay';
  m.innerHTML = `
    <div class="modal-box" style="max-width:480px">
      <button onclick="document.getElementById('add-incident-modal').remove()" style="position:absolute;top:14px;right:16px;background:transparent;border:none;color:#7A94C1;font-size:1.2rem;cursor:pointer">✕</button>
      <div style="font-family:var(--font-display);font-size:.9rem;color:var(--blue-accent);margin-bottom:20px">🚨 New Incident</div>
      <div style="display:flex;flex-direction:column;gap:12px">
        <div class="input-group"><label>Incident Type</label><div class="input-wrap select-wrap"><span class="inp-icon">📋</span><select id="inc-type"><option value="">Select type</option><option>Infrastructure / Road</option><option>Flood / Drainage</option><option>Public Safety</option><option>Health & Sanitation</option><option>Noise Complaint</option><option>Vandalism</option><option>Fire</option><option>Medical Emergency</option><option>Other</option></select></div></div>
        <div class="input-group"><label>Location / Purok</label><div class="input-wrap"><span class="inp-icon">📍</span><input type="text" id="inc-location" placeholder="e.g. Purok 3, Starita"/></div></div>
        <div class="input-group"><label>Severity</label><div class="input-wrap select-wrap"><span class="inp-icon">⚠️</span><select id="inc-severity"><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option></select></div></div>
        <div class="input-group"><label>Description</label><div class="input-wrap"><textarea id="inc-desc" style="flex:1;background:transparent;border:none;outline:none;color:var(--text-primary);font-family:var(--font-body);font-size:.88rem;padding:11px 12px;min-height:80px;resize:vertical" placeholder="Describe the incident..."></textarea></div></div>
        <div style="display:flex;gap:10px;justify-content:flex-end">
          <button class="btn-ghost" onclick="document.getElementById('add-incident-modal').remove()">Cancel</button>
          <button class="btn-primary" onclick="submitIncident()"><span class="btn-icon">🚨</span> Submit</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(m);
  m.addEventListener('click', e => { if (e.target===m) m.remove(); });
}

function submitIncident() {
  const type     = document.getElementById('inc-type').value;
  const location = document.getElementById('inc-location').value.trim();
  const severity = document.getElementById('inc-severity').value;
  const desc     = document.getElementById('inc-desc').value.trim();
  if (!type)     { toast('Please select an incident type.', 'error'); return; }
  if (!location) { toast('Please enter the location.', 'error'); return; }

  const incidents = getIncidents();
  const newInc = {
    id: Date.now(), type, location, severity, desc,
    status: 'pending', date: new Date().toISOString(),
    createdBy: state.currentUser,
    reporterName: state.currentUser || 'Barangay Staff',
    _source: 'staff'
  };
  incidents.unshift(newInc);
  saveIncidents(incidents);

  addNotif('🚨', `New ${severity.toUpperCase()} incident: ${type} at ${location}`);
  logActivity('🚨', 'Incident created', `${type} at ${location} — severity: ${severity} (by ${state.currentUser||'Staff'})`);
  document.getElementById('add-incident-modal')?.remove();
  toast('✅ Incident reported successfully!', 'success');
  renderIncidentsTable();
  updateDashKPIs();
  renderMonthlyChart();
}

function markIncidentComplete(id) {
  const incidents = getIncidents();
  const idx = incidents.findIndex(i => i.id === id);
  if (idx !== -1) {
    incidents[idx].status = 'completed';
    incidents[idx].completedAt = new Date().toISOString();
    incidents[idx].completedBy = state.currentRole || 'Barangay Staff';
    saveIncidents(incidents);
    addNotif('✅', `Incident #${id} marked as completed`);
    toast(`✅ Incident #${id} resolved!`, 'success');
    renderIncidentsTable();
    updateDashKPIs();
    renderMonthlyChart();
  }
}

function markSharedReportInProgress(reportId) {
  const reports = getSharedReports();
  const idx = reports.findIndex(r => r.id === reportId);
  if (idx === -1) return;
  if (reports[idx].status === 'completed') { toast('Already completed.', 'error'); return; }
  reports[idx].status = 'in-progress';
  saveSharedReports(reports);
  const resNotifs = getResidentNotifs();
  resNotifs.push({ icon:'fa-spinner', color:'blue-icon', text:`⚙️ Your report #${reportId} — ${reports[idx].type} is now being handled by Barangay staff!`, date:new Date().toISOString(), read:false, fromStaff:true, reportId, residentEmail: reports[idx].residentEmail || '' });
  saveResidentNotifs(resNotifs);
  addNotif('⚙️', `Resident report #${reportId} set to In Progress — ${reports[idx].type}`);
  toast(`⚙️ Report #${reportId} marked In Progress. Resident notified.`, 'success');
  renderIncidentsTable();
  renderNotificationsPanel();
  updateDashKPIs();
}

function markSharedReportComplete(reportId) {
  const reports = getSharedReports();
  const idx = reports.findIndex(r => r.id === reportId);
  if (idx === -1) return;
  if (reports[idx].status === 'completed') { toast('Already completed.', 'error'); return; }
  const now = new Date().toISOString();
  reports[idx].status = 'completed';
  reports[idx].completedAt = now;
  reports[idx].completedBy = state.currentRole || 'Barangay Staff';
  saveSharedReports(reports);
  const resNotifs = getResidentNotifs();
  resNotifs.push({ icon:'fa-circle-check', color:'green-icon', text:`✅ Your report #${reportId} — ${reports[idx].type} has been resolved by the Barangay!`, date:now, read:false, fromStaff:true, reportId, residentEmail: reports[idx].residentEmail || '' });
  saveResidentNotifs(resNotifs);
  addNotif('✅', `Resident report #${reportId} resolved — ${reports[idx].type}`);
  toast(`✅ Report #${reportId} resolved! Resident notified.`, 'success');
  renderIncidentsTable();
  renderNotificationsPanel();
  updateDashKPIs();
  renderMonthlyChart();
}

/* ─── RESIDENTS ──────────────────────────────────────────── */
function renderResidentsTable(filter='') {
  const tbody = document.getElementById('residents-tbody');
  if (!tbody) return;
  let residents = getResidents();
  if (filter) {
    const q = filter.toLowerCase();
    residents = residents.filter(r =>
      (r.firstName+' '+r.lastName).toLowerCase().includes(q) ||
      (r.purok||'').toLowerCase().includes(q) ||
      (r.reporterName||'').toLowerCase().includes(q)
    );
  }
  if (residents.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:24px;opacity:0.5;">${filter?'No residents found':'No residents registered'}</td></tr>`;
    return;
  }

  // Get reports to show count per resident
  const sharedReps = getSharedReports();

  tbody.innerHTML = residents.map(r => {
    const reportCount = sharedReps.filter(rep =>
      rep.reporterName === `${r.firstName} ${r.lastName}` ||
      rep.residentName === `${r.firstName} ${r.lastName}` ||
      rep.reporterId === r.id
    ).length;
    const registeredBy = r.registeredBy || 'System';
    return `<tr>
      <td style="font-family:var(--font-mono);font-size:.72rem">RES-${String(r.id).slice(-5)}</td>
      <td style="color:var(--text-primary);font-weight:600">${r.firstName} ${r.lastName}</td>
      <td>${r.purok||'—'}</td>
      <td><span style="font-family:var(--font-mono);font-size:.7rem;padding:2px 8px;border-radius:4px;background:rgba(21,101,192,0.1);color:var(--blue-accent)">${r.category||'Resident'}</span></td>
      <td style="font-size:.75rem;color:#64B5F6">${registeredBy}</td>
      <td>${reportCount > 0 ? `<span style="background:rgba(255,109,0,0.12);color:var(--orange-soft);border:1px solid rgba(255,109,0,0.3);padding:2px 8px;border-radius:4px;font-size:.72rem;font-family:var(--font-mono)">${reportCount} report${reportCount>1?'s':''}</span>` : '<span style="opacity:.4;font-size:.74rem">—</span>'}</td>
      <td><span style="color:var(--green);font-size:.78rem;font-weight:600">● Active</span></td>
      <td>
        <button class="btn-sm blue" onclick="viewResident(${r.id})">👁 View</button>
        ${reportCount > 0 ? `<button class="btn-sm orange" onclick="viewResidentReports(${r.id})" style="margin-left:4px;font-size:.7rem">📋 Reports</button>` : ''}
        <button class="btn-sm orange" onclick="deleteResident(${r.id})" style="margin-left:4px">🗑</button>
      </td>
    </tr>`;
  }).join('');
}

function filterResidents(q) { renderResidentsTable(q); }

/* ─── VIEW RESIDENT REPORTS ──────────────────────────────── */
function viewResidentReports(residentId) {
  const r = getResidents().find(x => x.id === residentId);
  if (!r) return;
  const fullName = `${r.firstName} ${r.lastName}`;
  const sharedReps = getSharedReports();
  const resReports = sharedReps.filter(rep =>
    rep.reporterName === fullName ||
    rep.residentName === fullName ||
    rep.reporterId === residentId
  );

  const m = document.createElement('div');
  m.className = 'modal-overlay';
  m.innerHTML = `
    <div class="modal-box" style="max-width:560px">
      <button onclick="this.closest('.modal-overlay').remove()" style="position:absolute;top:14px;right:16px;background:transparent;border:none;color:#7A94C1;font-size:1.2rem;cursor:pointer;line-height:1">✕</button>
      <div style="font-family:var(--font-display);font-size:.9rem;color:var(--blue-accent);margin-bottom:20px">📋 Reports by ${fullName}</div>
      ${resReports.length === 0
        ? '<div style="text-align:center;padding:32px;opacity:.5;">No reports submitted by this resident</div>'
        : resReports.map(rep => {
            const ai = computeAIPriority(rep);
            const statusColor = rep.status==='completed' ? '#00C853' : rep.status==='in-progress' ? '#42A5F5' : '#F57F17';
            const statusLabel = rep.status==='completed' ? '✅ Completed' : rep.status==='in-progress' ? '⚙️ In Progress' : '⏳ Pending';
            return `<div style="background:var(--bg-dark);border:1px solid var(--border);border-left:3px solid ${ai.color};border-radius:8px;padding:14px 16px;margin-bottom:10px">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
                <div style="font-weight:700;color:var(--text-primary)">Report #${rep.id} — ${rep.type||'Unknown'}</div>
                <span style="color:${statusColor};font-size:.75rem;font-weight:700">${statusLabel}</span>
              </div>
              <div style="font-size:.78rem;color:var(--text-sec);margin-bottom:6px">📍 ${rep.location||'—'} · ${formatDateShort(rep.date||rep.createdAt||Date.now())}</div>
              ${rep.desc ? `<div style="font-size:.76rem;color:var(--text-dim);margin-bottom:10px;line-height:1.5">${rep.desc}</div>` : ''}
              ${rep.status !== 'completed' ? `<div style="display:flex;gap:6px">
                ${rep.status !== 'in-progress' ? `<button class="btn-sm" onclick="setReportStatus(${rep.id},'shared','in-progress',this);setTimeout(()=>viewResidentReports(${residentId}),400)" style="font-size:.72rem;color:#42A5F5;border-color:#42A5F5">⚙️ In Progress</button>` : ''}
                <button class="btn-sm green" onclick="setReportStatus(${rep.id},'shared','completed',this);setTimeout(()=>viewResidentReports(${residentId}),400)" style="font-size:.72rem">✅ Resolve</button>
              </div>` : ''}
            </div>`;
          }).join('')}
    </div>`;
  document.body.appendChild(m);
  m.addEventListener('click', e => { if (e.target===m) m.remove(); });
}

function showAddResidentModal() {
  const existing = document.getElementById('add-resident-modal');
  if (existing) existing.remove();
  const m = document.createElement('div');
  m.id = 'add-resident-modal';
  m.className = 'modal-overlay';
  m.innerHTML = `
    <div class="modal-box" style="max-width:560px">
      <button onclick="document.getElementById('add-resident-modal').remove()" style="position:absolute;top:14px;right:16px;background:transparent;border:none;color:#7A94C1;font-size:1.2rem;cursor:pointer">✕</button>
      <div style="font-family:var(--font-display);font-size:.9rem;color:var(--blue-accent);margin-bottom:20px">👥 Add Resident — Barangay Starita</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div class="input-group"><label>First Name</label><div class="input-wrap"><span class="inp-icon">👤</span><input type="text" id="res-fname" placeholder="Juan"/></div></div>
        <div class="input-group"><label>Last Name</label><div class="input-wrap"><span class="inp-icon">👤</span><input type="text" id="res-lname" placeholder="Dela Cruz"/></div></div>
        <div class="input-group"><label>Date of Birth</label><div class="input-wrap"><span class="inp-icon">🗓</span><input type="date" id="res-dob"/></div></div>
        <div class="input-group"><label>Gender</label><div class="input-wrap select-wrap"><span class="inp-icon">👤</span><select id="res-gender"><option value="">Select</option><option>Male</option><option>Female</option><option>Other</option></select></div></div>
        <div class="input-group"><label>Purok</label><div class="input-wrap select-wrap"><span class="inp-icon">📍</span><select id="res-purok"><option value="">Select Purok</option><option>Purok 1</option><option>Purok 2</option><option>Purok 3</option><option>Purok 4</option><option>Purok 5</option><option>Purok 6</option></select></div></div>
        <div class="input-group"><label>Category</label><div class="input-wrap select-wrap"><span class="inp-icon">🏷</span><select id="res-category"><option value="Resident">Resident</option><option value="Senior Citizen">Senior Citizen</option><option value="PWD">PWD</option><option value="Solo Parent">Solo Parent</option><option value="Youth">Youth</option></select></div></div>
        <div class="input-group" style="grid-column:1/-1"><label>Address</label><div class="input-wrap"><span class="inp-icon">🏠</span><input type="text" id="res-address" placeholder="House No., Street, Barangay Starita"/></div></div>
        <div class="input-group"><label>Contact Number</label><div class="input-wrap"><span class="inp-icon">📱</span><input type="tel" id="res-contact" placeholder="+63 9XX XXX XXXX"/></div></div>
        <div class="input-group"><label>Civil Status</label><div class="input-wrap select-wrap"><span class="inp-icon">💍</span><select id="res-civil"><option value="">Select</option><option>Single</option><option>Married</option><option>Widowed</option><option>Separated</option></select></div></div>
      </div>
      <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:16px">
        <button class="btn-ghost" onclick="document.getElementById('add-resident-modal').remove()">Cancel</button>
        <button class="btn-primary" onclick="submitResident()"><span class="btn-icon">👥</span> Register Resident</button>
      </div>
    </div>`;
  document.body.appendChild(m);
  m.addEventListener('click', e => { if (e.target===m) m.remove(); });
}

function submitResident() {
  const fname    = document.getElementById('res-fname').value.trim();
  const lname    = document.getElementById('res-lname').value.trim();
  const purok    = document.getElementById('res-purok').value;
  const category = document.getElementById('res-category').value;
  const dob      = document.getElementById('res-dob').value;
  const gender   = document.getElementById('res-gender').value;
  const address  = document.getElementById('res-address').value.trim();
  const contact  = document.getElementById('res-contact').value.trim();
  const civil    = document.getElementById('res-civil').value;

  if (!fname || !lname) { toast('Please enter the resident\'s full name.', 'error'); return; }
  if (!purok)           { toast('Please select a Purok.', 'error'); return; }

  const residents = getResidents();
  const staffName = state.currentUser || 'Staff';
  const newRes = {
    id: Date.now(), firstName: fname, lastName: lname, purok, category, dob, gender, address, contact, civil,
    registeredAt: new Date().toISOString(), status: 'active',
    registeredBy: staffName,
  };
  residents.unshift(newRes);
  saveResidents(residents);

  addNotif('👥', `New resident registered: ${fname} ${lname} — ${purok} (by ${staffName})`);
  logActivity('👥', 'Resident registered', `${fname} ${lname} — ${purok}, Category: ${category} (by ${staffName})`);
  document.getElementById('add-resident-modal')?.remove();
  toast(`✅ ${fname} ${lname} registered successfully!`, 'success');
  renderResidentsTable();
  updateDashKPIs();
}

function viewResident(id) {
  const r = getResidents().find(x => x.id === id);
  if (!r) return;
  const sharedReps = getSharedReports();
  const reportCount = sharedReps.filter(rep =>
    rep.reporterName === `${r.firstName} ${r.lastName}` ||
    rep.reporterId === r.id
  ).length;
  const m = document.createElement('div');
  m.className = 'modal-overlay';
  m.innerHTML = `
    <div class="modal-box" style="max-width:480px">
      <button onclick="this.closest('.modal-overlay').remove()" style="position:absolute;top:14px;right:16px;background:transparent;border:none;color:#7A94C1;font-size:1.2rem;cursor:pointer">✕</button>
      <div style="font-family:var(--font-display);font-size:.9rem;color:var(--blue-accent);margin-bottom:20px">👥 Resident Details</div>
      <div style="display:flex;flex-direction:column;gap:10px">
        ${[
          ['Full Name',`${r.firstName} ${r.lastName}`],
          ['Purok',r.purok||'—'],
          ['Category',r.category||'Resident'],
          ['Date of Birth',r.dob||'—'],
          ['Gender',r.gender||'—'],
          ['Civil Status',r.civil||'—'],
          ['Contact',r.contact||'—'],
          ['Address',r.address||'—'],
          ['Status','● Active'],
          ['Reports Filed', reportCount > 0 ? `<span style="color:var(--orange-soft)">${reportCount} report(s)</span>` : '0'],
          ['Registered',formatDateShort(r.registeredAt||Date.now())],
          ['Registered By', `<span style="color:#64B5F6">${r.registeredBy||'System'}</span>`],
        ].map(([k,v])=>`
          <div style="display:flex;justify-content:space-between;border-bottom:1px solid var(--border);padding-bottom:8px">
            <span style="color:var(--text-dim);font-size:.8rem;font-family:var(--font-mono)">${k}</span>
            <strong style="color:var(--text-primary);font-size:.82rem;text-align:right">${v}</strong>
          </div>`).join('')}
      </div>
      ${reportCount > 0 ? `<button class="btn-sm orange" style="margin-top:16px;width:100%" onclick="this.closest('.modal-overlay').remove();viewResidentReports(${r.id})">📋 View All Reports by This Resident</button>` : ''}
    </div>`;
  document.body.appendChild(m);
  m.addEventListener('click', e => { if (e.target===m) m.remove(); });
}

function deleteResident(id) {
  if (!confirm('Delete this resident record?')) return;
  const residents = getResidents().filter(r => r.id !== id);
  saveResidents(residents);
  toast('Resident record deleted.', 'error');
  renderResidentsTable();
  updateDashKPIs();
}

/* ─── OTP SYSTEM (EmailJS — real Gmail delivery) ─────────── */
// EmailJS configuration
// Sign up free at https://www.emailjs.com and replace these values:
const EMAILJS_SERVICE_ID  = 'service_smartbgy';   // Your EmailJS Service ID
const EMAILJS_TEMPLATE_ID = 'template_otp';        // Your EmailJS Template ID
const EMAILJS_PUBLIC_KEY  = 'YOUR_PUBLIC_KEY';     // Your EmailJS Public Key

function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

async function sendOTPEmail(email, otp, name) {
  // Load EmailJS SDK if not already loaded
  if (!window.emailjs) {
    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/@emailjs/browser@4/dist/email.min.js';
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
    emailjs.init(EMAILJS_PUBLIC_KEY);
  }

  const templateParams = {
    to_email:   email,
    to_name:    name || email.split('@')[0],
    otp_code:   otp,
    barangay:   'Barangay Starita, Olongapo City',
    expires_in: '5 minutes',
  };

  try {
    await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, templateParams);
    console.log(`[OTP] Email sent to ${email}`);
  } catch (err) {
    console.warn('[OTP] EmailJS send failed — falling back to dev mode:', err);
    // Fallback: show OTP on screen so dev can still test
    toast(`⚠️ Email service not configured. Dev OTP: ${otp}`, 'error');
  }
}

// Global OTP verify callback — needed so inline onclick can call it
window._otpVerifyCallback = null;

function showOTPModal(email, onVerify) {
  const existing = document.getElementById('otp-modal');
  if (existing) existing.remove();

  // Store callback globally so the inline button onclick can reach it
  window._otpVerifyCallback = onVerify;

  const m = document.createElement('div');
  m.id = 'otp-modal';
  m.className = 'modal-overlay';
  m.innerHTML = `
    <div class="modal-box" style="max-width:420px;text-align:center">
      <div style="font-size:2.5rem;margin-bottom:12px">📧</div>
      <div style="font-family:var(--font-display);font-size:1rem;color:var(--blue-accent);margin-bottom:8px;font-weight:700">Email Verification</div>
      <div style="font-size:.82rem;color:var(--text-sec);margin-bottom:6px">A 6-digit verification code was sent to:</div>
      <div style="font-family:var(--font-mono);font-size:.9rem;color:var(--text-primary);background:var(--bg-dark);border:1px solid var(--border);border-radius:6px;padding:8px 16px;margin-bottom:6px;display:inline-block">${email}</div>
      <div style="font-size:.74rem;color:var(--text-dim);margin-bottom:20px">(Check your inbox and spam folder)</div>

      <div style="display:flex;gap:8px;justify-content:center;margin-bottom:16px" id="otp-inputs">
        ${[0,1,2,3,4,5].map(i=>`<input id="otp-d${i}" type="text" maxlength="1" inputmode="numeric" pattern="[0-9]" style="width:42px;height:50px;text-align:center;font-size:1.3rem;font-family:var(--font-mono);background:var(--bg-dark);border:2px solid var(--border);border-radius:8px;color:var(--text-primary);outline:none;transition:border-color .2s" oninput="otpInput(this,${i})" onkeydown="otpKey(this,${i},event)"/>`).join('')}
      </div>

      <div id="otp-error" style="color:var(--red);font-size:.78rem;margin-bottom:10px;display:none">❌ Incorrect code. Please try again.</div>
      <div id="otp-timer" style="font-family:var(--font-mono);font-size:.72rem;color:var(--text-dim);margin-bottom:16px">Code expires in <span id="otp-countdown">5:00</span></div>

      <button class="btn-primary full" id="otp-verify-btn" style="margin-bottom:12px">🔐 Verify Code</button>
      <button class="btn-ghost full" onclick="resendOTP('${email}')">↩ Resend Code</button>
      <button class="btn-back" style="margin-top:10px;text-align:center;width:100%;color:var(--red);font-size:.75rem;" onclick="cancelOTP()">✕ Cancel Verification</button>
    </div>`;

  document.body.appendChild(m);

  // Attach click handler via JS (not inline) so callback scope is correct
  document.getElementById('otp-verify-btn').addEventListener('click', () => {
    verifyOTP(email, window._otpVerifyCallback);
  });

  // Focus first input
  setTimeout(() => document.getElementById('otp-d0')?.focus(), 100);

  // Start countdown
  startOTPCountdown();
}

function otpInput(el, idx) {
  el.value = el.value.replace(/[^0-9]/g,'');
  el.style.borderColor = el.value ? 'var(--blue-bright)' : 'var(--border)';
  if (el.value && idx < 5) {
    document.getElementById(`otp-d${idx+1}`)?.focus();
  }
}

function otpKey(el, idx, e) {
  if (e.key === 'Backspace' && !el.value && idx > 0) {
    document.getElementById(`otp-d${idx-1}`)?.focus();
  }
}

let otpCountdownTimer = null;
function startOTPCountdown() {
  clearInterval(otpCountdownTimer);
  let secs = 300;
  const el = document.getElementById('otp-countdown');
  otpCountdownTimer = setInterval(() => {
    if (!el) { clearInterval(otpCountdownTimer); return; }
    secs--;
    const m = Math.floor(secs/60);
    const s = secs % 60;
    el.textContent = `${m}:${s.toString().padStart(2,'0')}`;
    if (secs <= 0) {
      clearInterval(otpCountdownTimer);
      el.textContent = 'EXPIRED';
      el.style.color = 'var(--red)';
    }
  }, 1000);
}

/* ─── CANCEL OTP ─────────────────────────────────────────── */
function cancelOTP() {
  clearInterval(otpCountdownTimer);
  document.getElementById('otp-modal')?.remove();
  document.getElementById('otp-dev-hint')?.remove();
  state.pendingOTP = null;
  state.pendingRegData = null;
  window._otpVerifyCallback = null;
  toast('Verification cancelled. You may re-submit to get a new code.', '');
}

function verifyOTP(email, onVerify) {
  const entered = [0,1,2,3,4,5].map(i => document.getElementById(`otp-d${i}`)?.value||'').join('');
  const errEl = document.getElementById('otp-error');

  if (entered.length < 6) {
    if (errEl) { errEl.textContent = '⚠️ Please enter the complete 6-digit code.'; errEl.style.display='block'; }
    return;
  }
  if (entered !== state.pendingOTP) {
    if (errEl) { errEl.textContent = '❌ Incorrect code. Please try again.'; errEl.style.display='block'; }
    [0,1,2,3,4,5].forEach(i => {
      const inp = document.getElementById(`otp-d${i}`);
      if (inp) inp.style.borderColor = 'var(--red)';
    });
    return;
  }

  // OTP correct — use passed callback, or fall back to stored global callback
  clearInterval(otpCountdownTimer);
  document.getElementById('otp-modal')?.remove();
  const cb = (typeof onVerify === 'function') ? onVerify : window._otpVerifyCallback;
  window._otpVerifyCallback = null;
  if (typeof cb === 'function') cb();
}

async function resendOTP(email) {
  const otp = generateOTP();
  state.pendingOTP = otp;
  toast(`📧 New code sent to ${email}`, 'success');
  // Reset inputs
  [0,1,2,3,4,5].forEach(i => {
    const inp = document.getElementById(`otp-d${i}`);
    if (inp) { inp.value = ''; inp.style.borderColor = 'var(--border)'; }
  });
  document.getElementById('otp-error').style.display = 'none';
  startOTPCountdown();
  await sendOTPEmail(email, otp, '');
  // For demo: show OTP in console and a subtle hint
  console.log('[Smart Barangay OTP]', otp);
  // Show OTP in dev helper (remove in production)
  const devHint = document.getElementById('otp-dev-hint');
  if (!devHint) {
    const hint = document.createElement('div');
    hint.id = 'otp-dev-hint';
    hint.style.cssText = 'position:fixed;bottom:80px;left:30px;background:#0a1020;border:1px solid #1565C0;padding:8px 14px;border-radius:6px;font-family:monospace;font-size:.75rem;color:#42A5F5;z-index:99999;opacity:.9';
    hint.textContent = `[DEV] OTP: ${otp}`;
    document.body.appendChild(hint);
    setTimeout(() => hint?.remove(), 60000);
  } else {
    devHint.textContent = `[DEV] OTP: ${otp}`;
  }
}

/* ─── AUTH ───────────────────────────────────────────────── */
function doLogin() {
  const email = document.getElementById('login-email').value.trim();
  const pass  = document.getElementById('login-pass').value;

  if (!email) { toast('Please enter your Employee ID or Email.', 'error'); return; }
  if (!pass)  { toast('Please enter your password.', 'error'); return; }

  const accounts = getAccounts();
  const account  = accounts.find(a => (a.email === email || a.empId === email) && a.password === pass);

  const btn = document.querySelector('#login-screen .btn-primary.full');
  btn.textContent = 'Authenticating...';
  btn.disabled = true;

  setTimeout(() => {
    btn.innerHTML = '<span class="btn-icon">🔐</span> Authenticate';
    btn.disabled  = false;

    if (!account && accounts.length > 0) {
      toast('Invalid credentials. Please check your email and password.', 'error');
      return;
    }

    const roleLabels = { admin:'Barangay Captain / Admin', secretary:'Barangay Secretary', treasurer:'Barangay Treasurer', kagawad:'Kagawad', lupon:'Lupon Tagapamayapa', tanod:'Barangay Tanod', health:'Health Worker', clerk:'Records Clerk' };
    const role  = account ? account.role : 'admin';
    const label = roleLabels[role] || role;
    const name  = account ? `${account.firstName} ${account.lastName}` : email.split('@')[0].replace(/\b\w/g, c => c.toUpperCase());

    state.currentUser = name;
    state.currentRole = role;
    state.loginTime   = new Date();

    const nameEl = document.getElementById('dash-username');
    const roleEl = document.getElementById('dash-role');
    if (nameEl) nameEl.textContent = name;
    if (roleEl) roleEl.textContent = label;

    const siRole = document.getElementById('si-role');
    const siTime = document.getElementById('si-login-time');
    const siAcc  = document.getElementById('si-account');
    if (siRole) siRole.textContent = label;
    if (siTime) siTime.textContent = state.loginTime.toLocaleString('en-PH');
    if (siAcc)  siAcc.textContent  = account?.email || email;

    const setName  = document.getElementById('set-name');
    const setEmail = document.getElementById('set-email');
    if (setName && account)  setName.value  = name;
    if (setEmail && account) setEmail.value = account.email;

    showScreen('dashboard-screen');
    switchPanel('residents');
    startClock();
    toast(`Welcome back, ${name}!`, 'success');

    const pending = getSharedReports().filter(r => r.status === 'pending').length;
    if (pending > 0) setTimeout(() => toast(`📬 ${pending} resident report${pending>1?'s':''} awaiting review!`, 'success'), 1500);
    updateDashKPIs();
    addNotif('🔑', `Staff login: ${name} (${label})`);
    logActivity('🔑', `Staff login`, `${name} (${label}) authenticated successfully`);
  }, 1200);
}

function doRegister() {
  const fname   = document.getElementById('reg-fname').value.trim();
  const lname   = document.getElementById('reg-lname').value.trim();
  const empId   = document.getElementById('reg-empid').value.trim();
  const email   = document.getElementById('reg-email').value.trim();
  const role    = document.getElementById('reg-role').value;
  const contact = document.getElementById('reg-contact').value.trim();
  const pass    = document.getElementById('reg-pass').value;
  const pass2   = document.getElementById('reg-pass2').value;
  const tnc     = document.getElementById('tnc-agree');
  const confirm = document.getElementById('reg-confirm');

  if (!fname || !lname) { toast('Please enter your full name.', 'error'); return; }
  if (!email)           { toast('Please enter your email address.', 'error'); return; }
  if (!email.includes('@') || !email.includes('.')) { toast('Please enter a valid email address.', 'error'); return; }
  if (!role)            { toast('Please select your assigned role.', 'error'); return; }
  if (!pass)            { toast('Please enter a password.', 'error'); return; }
  if (pass.length < 8)  { toast('Password must be at least 8 characters.', 'error'); return; }
  if (pass !== pass2)   { toast('Passwords do not match.', 'error'); return; }
  if (!tnc?.checked)    { toast('You must accept the Terms & Conditions.', 'error'); return; }
  if (!confirm?.checked){ toast('Please confirm your information is accurate.', 'error'); return; }

  const accounts = getAccounts();
  if (accounts.find(a => a.email === email)) { toast('An account with this email already exists.', 'error'); return; }

  // Store pending registration data and send OTP
  state.pendingRegData = { fname, lname, empId, email, role, contact, pass };
  const otp = generateOTP();
  state.pendingOTP = otp;

  toast(`📧 Sending verification code to ${email}...`, 'success');
  sendOTPEmail(email, otp, fname).then(() => {
    showOTPModal(email, completeRegistration);
    // Dev hint
    const hint = document.createElement('div');
    hint.id = 'otp-dev-hint';
    hint.style.cssText = 'position:fixed;bottom:80px;left:30px;background:#0a1020;border:1px solid #1565C0;padding:8px 14px;border-radius:6px;font-family:monospace;font-size:.75rem;color:#42A5F5;z-index:99999;opacity:.9';
    hint.textContent = `[DEV] OTP Code: ${otp}`;
    document.body.appendChild(hint);
    setTimeout(() => hint?.remove(), 60000);
  });
}

function completeRegistration() {
  const { fname, lname, empId, email, role, contact, pass } = state.pendingRegData || {};
  if (!fname) { toast('Registration data lost. Please try again.', 'error'); return; }

  const accounts = getAccounts();
  const newAccount = { id: Date.now(), firstName: fname, lastName: lname, empId, email, role, contact, password: pass, registeredAt: new Date().toISOString() };
  accounts.push(newAccount);
  saveAccounts(accounts);

  // Also add to residents management
  const residents = getResidents();
  residents.unshift({
    id: Date.now() + 1,
    firstName: fname,
    lastName: lname,
    purok: '—',
    category: 'Staff Account',
    registeredAt: new Date().toISOString(),
    status: 'active',
    contact,
    address: 'Barangay Starita, Olongapo City',
    registeredBy: 'Self-Registration (Email Verified)',
    role,
    isStaffAccount: true
  });
  saveResidents(residents);

  state.pendingOTP = null;
  state.pendingRegData = null;

  toast(`✅ Email verified! Account created for ${fname} ${lname}. You may now log in.`, 'success');
  setTimeout(() => {
    document.getElementById('login-email').value = email;
    showScreen('login-screen');
  }, 2000);
}

function doLogout() {
  state.currentUser = null;
  state.currentRole = null;
  toast('You have been logged out securely.');
  setTimeout(() => showScreen('landing-screen'), 600);
}

function saveProfile() {
  toast('Profile updated successfully!', 'success');
}

/* ─── TERMS MODAL ────────────────────────────────────────── */
function showTnCModal() {
  const existing = document.getElementById('tnc-modal');
  if (existing) { existing.remove(); return; }
  const sections = [
    ['1. PURPOSE','Smart Barangay Starita is an official digital platform for authorized barangay personnel of Barangay Starita, Olongapo City, Republic of the Philippines.'],
    ['2. AUTHORIZED ACCESS','Access is role-based. Unauthorized access is prohibited under RA 10175 (Cybercrime Prevention Act of 2012).'],
    ['3. DATA PRIVACY','All resident data is protected under RA 10173 (Data Privacy Act of 2012). Staff must not disclose resident information to unauthorized parties.'],
    ['4. ACCEPTABLE USE','System must be used exclusively for official barangay functions. All activities are monitored.'],
    ['5. ACCOUNT SECURITY','You are responsible for the confidentiality of your credentials. Report unauthorized access immediately.'],
    ['6. TERMINATION','System access is revoked upon resignation, termination, or reassignment.'],
    ['7. ACCEPTANCE','By registering, you affirm you are authorized barangay staff of Barangay Starita and agree to comply fully.'],
  ];
  const modal = document.createElement('div');
  modal.id = 'tnc-modal';
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal-box">
      <button onclick="document.getElementById('tnc-modal').remove()" style="position:absolute;top:16px;right:18px;background:transparent;border:none;color:#7A94C1;font-size:1.3rem;cursor:pointer;line-height:1">✕</button>
      <div style="display:flex;align-items:center;gap:14px;margin-bottom:22px">
        <div style="font-size:2.2rem">📜</div>
        <div>
          <div style="font-family:var(--font-display);font-size:1.05rem;color:#42A5F5;font-weight:700;letter-spacing:.5px">TERMS &amp; CONDITIONS</div>
          <div style="font-size:.8rem;color:#7A94C1;margin-top:3px">Smart Barangay Starita · Olongapo City · v2.0</div>
        </div>
      </div>
      ${sections.map(([t,b])=>`<div style="margin-bottom:16px;padding-bottom:16px;border-bottom:1px solid #1a2744"><div style="font-family:var(--font-display);font-size:.76rem;color:#1E88E5;margin-bottom:6px;letter-spacing:.5px">${t}</div><div style="font-size:.84rem;color:#b0c4e8;line-height:1.65">${b}</div></div>`).join('')}
      <div style="text-align:center;margin-top:8px;padding-top:16px;border-top:1px solid #1a2744">
        <button onclick="document.getElementById('tnc-modal').remove()" style="background:linear-gradient(135deg,#1565C0,#1E88E5);color:#fff;border:none;border-radius:8px;padding:10px 32px;cursor:pointer;font-family:var(--font-display);font-size:.82rem;letter-spacing:.5px">I Understand — Close</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  modal.addEventListener('click', e => { if (e.target===modal) modal.remove(); });
}

/* ─── DATE & TIME HELPERS ────────────────────────────────── */
function formatDateShort(iso) {
  return new Date(iso).toLocaleDateString('en-PH', { month:'short', day:'numeric', year:'numeric' });
}
function timeAgo(iso) {
  const m = Math.floor((Date.now() - new Date(iso)) / 60000);
  if (m < 1)  return 'Just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m/60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h/24)}d ago`;
}

function startClock() {
  const el = document.getElementById('dash-time');
  if (!el) return;
  function tick() {
    const now = new Date();
    const d = now.toLocaleDateString('en-PH', { month:'short', day:'2-digit', year:'numeric' });
    const t = now.toLocaleTimeString('en-PH', { hour12:true, hour:'2-digit', minute:'2-digit', second:'2-digit' });
    el.textContent = `${d} · ${t}`;
  }
  tick();
  setInterval(tick, 1000);
}

/* ─── KEYBOARD SHORTCUTS ─────────────────────────────────── */
document.addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    const active = document.querySelector('.screen.active');
    if (active?.id === 'login-screen') doLogin();
    if (document.getElementById('otp-modal')) {
      const email = document.querySelector('#otp-modal .modal-box div[style*="font-mono"]')?.textContent;
      if (email) verifyOTP(email.trim(), null);
    }
  }
  if (e.key === 'Escape') {
    document.getElementById('sidebar')?.classList.remove('open');
    document.querySelectorAll('.modal-overlay').forEach(m => m.remove());
    document.getElementById('tnc-modal')?.remove();
    document.getElementById('clear-notif-confirm')?.remove();
  }
});

/* ─── POLL FOR CHANGES ───────────────────────────────────── */
setInterval(() => {
  if (!document.getElementById('dashboard-screen')?.classList.contains('active')) return;
  updateDashKPIs();
  if (document.getElementById('panel-livemap')?.classList.contains('active')) renderLiveMap();
}, 5000);

/* ─── LOADING SCREEN ─────────────────────────────────────── */
(function runLoader() {
  const lines = [
    '> Initializing Smart Barangay Starita v2.0...',
    '> Loading encryption modules... [OK]',
    '> Establishing secure connection... [OK]',
    '> Verifying role-based access policies... [OK]',
    '> Connecting to AI prioritization engine... [OK]',
    '> Loading resident registry module... [OK]',
    '> Loading incident management module... [OK]',
    '> Starting real-time notification service... [OK]',
    '> Loading OTP verification module... [OK]',
    '> Barangay Starita, Olongapo City systems ready.',
    '> Welcome.',
  ];
  const statuses = ['Loading encryption...','Establishing connection...','Verifying access...','Connecting AI engine...','Loading resident registry...','Loading incident module...','Starting notifications...','Loading OTP module...','Finalizing...','System ready.','Welcome to Smart Barangay!'];
  const bar      = document.getElementById('progress-bar');
  const statusEl = document.getElementById('loader-status');
  const bootEl   = document.getElementById('boot-lines');
  let progress = 0, lineIdx = 0;

  const interval = setInterval(() => {
    if (lineIdx < lines.length) {
      const div = document.createElement('div');
      div.textContent = lines[lineIdx];
      bootEl.appendChild(div);
      bootEl.scrollTop = bootEl.scrollHeight;
      if (statuses[lineIdx]) statusEl.textContent = statuses[lineIdx];
      lineIdx++;
    }
    progress = Math.min(100, progress + (lineIdx/lines.length)*12);
    bar.style.width = progress + '%';
    if (lineIdx >= lines.length && progress >= 98) {
      bar.style.width = '100%';
      clearInterval(interval);
      setTimeout(() => { showScreen('landing-screen'); updateLandingStat(); }, 800);
    }
  }, 220);
})();

/* ═══════════════════════════════════════════════════════════
   ACTIVITY LOG
═══════════════════════════════════════════════════════════ */
const ACTLOG_KEY = 'sb_actlog';

function getActivityLog() { return getLS(ACTLOG_KEY, []); }
function saveActivityLog(d) { setLS(ACTLOG_KEY, d); }

function logActivity(icon, action, detail) {
  const log = getActivityLog();
  log.unshift({
    id: Date.now(),
    icon,
    action,
    detail,
    actor: state.currentUser || 'System',
    date: new Date().toISOString(),
  });
  // Keep max 200 entries
  if (log.length > 200) log.splice(200);
  saveActivityLog(log);
}

function renderActivityLog() {
  const el = document.getElementById('activitylog-list');
  const countEl = document.getElementById('actlog-count');
  if (!el) return;
  const log = getActivityLog();
  if (countEl) countEl.textContent = `${log.length} entr${log.length === 1 ? 'y' : 'ies'}`;
  if (log.length === 0) {
    el.innerHTML = '<div style="padding:32px;text-align:center;opacity:.5">No activity recorded yet.</div>';
    return;
  }
  el.innerHTML = log.map(entry => `
    <div class="actlog-entry">
      <div class="actlog-icon">${entry.icon}</div>
      <div class="actlog-body">
        <div class="actlog-action">${entry.action}</div>
        <div class="actlog-detail">${entry.detail}</div>
        <div class="actlog-meta">
          <span class="actlog-actor">👤 ${entry.actor}</span>
          <span class="actlog-time">${timeAgo(entry.date)} · ${formatDateShort(entry.date)}</span>
        </div>
      </div>
    </div>`).join('');
}

function clearActivityLog() {
  if (!confirm('Clear the entire activity log? This cannot be undone.')) return;
  saveActivityLog([]);
  renderActivityLog();
  toast('Activity log cleared.', 'success');
}

/* ═══════════════════════════════════════════════════════════
   ANNOUNCEMENTS
═══════════════════════════════════════════════════════════ */
const ANNOUNCE_KEY = 'sb_announcements';
const ANNOUNCE_PRIORITIES = { urgent: { label: 'URGENT', color: '#D32F2F', bg: 'rgba(211,47,47,0.10)', icon: '🚨' }, important: { label: 'IMPORTANT', color: '#E65100', bg: 'rgba(230,81,0,0.10)', icon: '⚠️' }, info: { label: 'INFO', color: '#1565C0', bg: 'rgba(21,101,192,0.10)', icon: 'ℹ️' }, general: { label: 'GENERAL', color: '#555', bg: 'rgba(100,181,246,0.06)', icon: '📌' } };

function getAnnouncements() { return getLS(ANNOUNCE_KEY, []); }
function saveAnnouncements(d) { setLS(ANNOUNCE_KEY, d); }

function renderAnnouncements(filter = '') {
  const el = document.getElementById('announcements-list');
  if (!el) return;
  let items = getAnnouncements();
  if (filter) {
    const q = filter.toLowerCase();
    items = items.filter(a => a.title.toLowerCase().includes(q) || a.body.toLowerCase().includes(q));
  }
  if (items.length === 0) {
    el.innerHTML = `<div style="padding:32px;text-align:center;opacity:.5">${filter ? 'No matching announcements.' : 'No announcements yet. Create the first one!'}</div>`;
    return;
  }
  el.innerHTML = items.map(a => {
    const p = ANNOUNCE_PRIORITIES[a.priority] || ANNOUNCE_PRIORITIES.general;
    return `
      <div class="announce-card" style="border-left-color:${p.color};background:${p.bg}">
        <div class="announce-header">
          <span class="announce-badge" style="color:${p.color};border-color:${p.color}44">${p.icon} ${p.label}</span>
          <div class="announce-actions">
            <button class="btn-sm blue" onclick="editAnnouncement(${a.id})" style="font-size:.7rem">✏️ Edit</button>
            <button class="btn-sm orange" onclick="deleteAnnouncement(${a.id})" style="font-size:.7rem">🗑</button>
          </div>
        </div>
        <div class="announce-title">${a.title}</div>
        <div class="announce-body">${a.body}</div>
        <div class="announce-footer">
          <span>📅 ${formatDateShort(a.date)}</span>
          <span>✍️ ${a.author || 'Barangay Staff'}</span>
          ${a.expiry ? `<span>⏰ Expires: ${formatDateShort(a.expiry)}</span>` : ''}
        </div>
      </div>`;
  }).join('');
}

function filterAnnouncements(q) { renderAnnouncements(q); }

function showAddAnnouncementModal(existing = null) {
  const modalId = 'add-announce-modal';
  document.getElementById(modalId)?.remove();
  const m = document.createElement('div');
  m.id = modalId;
  m.className = 'modal-overlay';
  m.innerHTML = `
    <div class="modal-box" style="max-width:560px">
      <button onclick="document.getElementById('${modalId}').remove()" style="position:absolute;top:14px;right:16px;background:transparent;border:none;color:#7A94C1;font-size:1.2rem;cursor:pointer">✕</button>
      <div style="font-family:var(--font-display);font-size:.9rem;color:var(--blue-accent);margin-bottom:20px">📢 ${existing ? 'Edit' : 'New'} Announcement</div>
      <div style="display:flex;flex-direction:column;gap:12px">
        <div class="input-group"><label>Title</label><div class="input-wrap"><span class="inp-icon">📢</span><input type="text" id="ann-title" placeholder="Announcement title..." value="${existing?.title||''}"/></div></div>
        <div class="input-group"><label>Priority</label><div class="input-wrap select-wrap"><span class="inp-icon">⚠️</span><select id="ann-priority"><option value="general" ${existing?.priority==='general'?'selected':''}>📌 General</option><option value="info" ${existing?.priority==='info'?'selected':''}>ℹ️ Info</option><option value="important" ${existing?.priority==='important'?'selected':''}>⚠️ Important</option><option value="urgent" ${existing?.priority==='urgent'?'selected':''}>🚨 Urgent</option></select></div></div>
        <div class="input-group"><label>Message / Body</label><div class="input-wrap"><textarea id="ann-body" style="flex:1;background:transparent;border:none;outline:none;color:var(--text-primary);font-family:var(--font-body);font-size:.88rem;padding:11px 12px;min-height:100px;resize:vertical" placeholder="Write the full announcement...">${existing?.body||''}</textarea></div></div>
        <div class="input-group"><label>Expiry Date <span style="font-size:.65rem;color:var(--text-dim)">(optional)</span></label><div class="input-wrap"><span class="inp-icon">⏰</span><input type="date" id="ann-expiry" value="${existing?.expiry||''}"/></div></div>
        <div style="display:flex;gap:10px;justify-content:flex-end">
          <button class="btn-ghost" onclick="document.getElementById('${modalId}').remove()">Cancel</button>
          <button class="btn-primary" onclick="submitAnnouncement(${existing?.id||'null'})"><span class="btn-icon">📢</span> ${existing ? 'Update' : 'Post'} Announcement</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(m);
  m.addEventListener('click', e => { if (e.target === m) m.remove(); });
}

function submitAnnouncement(editId) {
  const title  = document.getElementById('ann-title').value.trim();
  const body   = document.getElementById('ann-body').value.trim();
  const priority = document.getElementById('ann-priority').value;
  const expiry = document.getElementById('ann-expiry').value;
  if (!title) { toast('Please enter a title.', 'error'); return; }
  if (!body)  { toast('Please write the announcement body.', 'error'); return; }

  const items = getAnnouncements();
  if (editId && editId !== 'null') {
    const idx = items.findIndex(a => a.id === editId);
    if (idx !== -1) { items[idx] = { ...items[idx], title, body, priority, expiry, updatedAt: new Date().toISOString() }; }
  } else {
    items.unshift({ id: Date.now(), title, body, priority, expiry, author: state.currentUser || 'Barangay Staff', date: new Date().toISOString() });
  }
  saveAnnouncements(items);
  addNotif('📢', `Announcement posted: "${title}"`);
  logActivity('📢', editId && editId !== 'null' ? 'Announcement updated' : 'Announcement posted', `"${title}" — Priority: ${priority} (by ${state.currentUser||'Staff'})`);
  document.getElementById('add-announce-modal')?.remove();
  toast(`✅ Announcement ${editId && editId !== 'null' ? 'updated' : 'posted'} successfully!`, 'success');
  renderAnnouncements();
}

function editAnnouncement(id) {
  const a = getAnnouncements().find(x => x.id === id);
  if (a) showAddAnnouncementModal(a);
}

function deleteAnnouncement(id) {
  if (!confirm('Delete this announcement?')) return;
  saveAnnouncements(getAnnouncements().filter(a => a.id !== id));
  logActivity('🗑️', 'Announcement deleted', `Announcement ID ${id} removed (by ${state.currentUser||'Staff'})`);
  toast('Announcement deleted.', 'success');
  renderAnnouncements();
}

/* ═══════════════════════════════════════════════════════════
   LIVE MAP
═══════════════════════════════════════════════════════════ */
// Approximate purok coordinates within Barangay Starita, Olongapo City
const PUROK_COORDS = {
  'Purok 1': { lat: 14.838, lng: 120.279, ox: 18, oy: 30 },
  'Purok 2': { lat: 14.836, lng: 120.282, ox: 35, oy: 45 },
  'Purok 3': { lat: 14.834, lng: 120.285, ox: 52, oy: 58 },
  'Purok 4': { lat: 14.840, lng: 120.275, ox: 20, oy: 55 },
  'Purok 5': { lat: 14.842, lng: 120.280, ox: 42, oy: 25 },
  'Purok 6': { lat: 14.831, lng: 120.277, ox: 65, oy: 70 },
};

function getPurokFromLocation(loc) {
  if (!loc) return null;
  const m = loc.match(/purok\s*(\d+)/i);
  if (!m) return null;
  return `Purok ${m[1]}`;
}

function renderLiveMap() {
  const filterPurok  = document.getElementById('map-filter-purok')?.value  || '';
  const filterStatus = document.getElementById('map-filter-status')?.value || '';

  const incidents  = getIncidents();
  const sharedReps = getSharedReports();
  let all = [
    ...incidents.map(r => ({...r, _source:'staff'})),
    ...sharedReps.map(r => ({...r, _source:'shared'}))
  ];

  if (filterStatus) all = all.filter(r => r.status === filterStatus);

  // Group by purok
  const byPurok = {};
  all.forEach(r => {
    const pk = filterPurok || getPurokFromLocation(r.location) || 'Unknown';
    if (filterPurok && getPurokFromLocation(r.location) !== filterPurok) return;
    if (!byPurok[pk]) byPurok[pk] = [];
    byPurok[pk].push(r);
  });

  // Stats bar
  const statsEl = document.getElementById('livemap-stats');
  if (statsEl) {
    const pending   = all.filter(r => r.status === 'pending').length;
    const inProg    = all.filter(r => r.status === 'in-progress').length;
    const completed = all.filter(r => r.status === 'completed').length;
    const critical  = all.filter(r => { const ai = computeAIPriority(r); return ai.label === 'CRITICAL'; }).length;
    statsEl.innerHTML = `
      <div class="livemap-stat-item" style="border-left-color:#F57F17"><div class="livemap-stat-val">${pending}</div><div class="livemap-stat-lbl">Pending</div></div>
      <div class="livemap-stat-item" style="border-left-color:#42A5F5"><div class="livemap-stat-val">${inProg}</div><div class="livemap-stat-lbl">In Progress</div></div>
      <div class="livemap-stat-item" style="border-left-color:#00C853"><div class="livemap-stat-val">${completed}</div><div class="livemap-stat-lbl">Resolved</div></div>
      <div class="livemap-stat-item" style="border-left-color:#D32F2F"><div class="livemap-stat-val">${critical}</div><div class="livemap-stat-lbl">Critical</div></div>
      <div class="livemap-stat-item" style="border-left-color:#7B1FA2"><div class="livemap-stat-val">${all.length}</div><div class="livemap-stat-lbl">Total Reports</div></div>
      <div class="livemap-stat-item" style="border-left-color:#2e7d32"><div class="livemap-stat-val">${Object.keys(byPurok).length}</div><div class="livemap-stat-lbl">Affected Puroks</div></div>
    `;
  }

  // Incident list sidebar
  const listEl = document.getElementById('livemap-incident-list');
  if (listEl) {
    if (all.length === 0) {
      listEl.innerHTML = '<div style="padding:20px;text-align:center;opacity:.5;font-size:.8rem;">No incidents to show</div>';
    } else {
      listEl.innerHTML = all.slice(0, 20).map(r => {
        const ai = computeAIPriority(r);
        const statusColor = r.status==='completed' ? '#00C853' : r.status==='in-progress' ? '#42A5F5' : '#F57F17';
        return `<div class="livemap-inc-card" style="border-left-color:${ai.color}" onclick="viewReportDetails(${r.id},'${r._source}')">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
            <span style="font-size:.72rem;font-weight:700;color:${ai.color}">${ai.badge} ${ai.label}</span>
            <span style="font-size:.66rem;color:${statusColor}">${r.status==='completed'?'✅':r.status==='in-progress'?'⚙️':'⏳'} ${r.status}</span>
          </div>
          <div style="font-size:.78rem;color:var(--text-primary);font-weight:600;margin-bottom:2px">${r.type||'Unknown'}</div>
          <div style="font-size:.7rem;color:var(--text-sec)">📍 ${r.location||'Unknown location'}</div>
          <div style="font-size:.67rem;color:var(--text-dim);margin-top:3px">${formatDateShort(r.date||r.createdAt||Date.now())}</div>
        </div>`;
      }).join('');
    }
  }

  // Visual pins overlay using percentage positions
  const pinsEl = document.getElementById('livemap-pins-overlay');
  if (pinsEl) {
    const purokPins = {};
    all.forEach(r => {
      const pk = getPurokFromLocation(r.location);
      if (!pk) return;
      if (!purokPins[pk]) purokPins[pk] = { total: 0, critical: 0, pending: 0, coords: PUROK_COORDS[pk] };
      purokPins[pk].total++;
      if (r.status !== 'completed') purokPins[pk].pending++;
      if (computeAIPriority(r).label === 'CRITICAL') purokPins[pk].critical++;
    });

    pinsEl.innerHTML = Object.entries(purokPins).map(([pk, info]) => {
      if (!info.coords) return '';
      const pinColor = info.critical > 0 ? '#D32F2F' : info.pending > 0 ? '#F57F17' : '#00C853';
      const { ox, oy } = info.coords;
      return `<div class="map-pin" style="left:${ox}%;top:${oy}%;pointer-events:auto;cursor:pointer" title="${pk}: ${info.total} incident(s)" onclick="alert('${pk}\\n${info.total} total | ${info.pending} pending | ${info.critical} critical')">
        <div class="map-pin-dot" style="background:${pinColor};box-shadow:0 0 12px ${pinColor}aa">
          <span style="font-size:.6rem;font-weight:900;color:#fff">${info.total}</span>
        </div>
        <div class="map-pin-label">${pk}</div>
      </div>`;
    }).join('');
  }
}

/* ═══════════════════════════════════════════════════════════
   ANALYTICS
═══════════════════════════════════════════════════════════ */
function renderAnalytics() {
  const incidents  = getIncidents();
  const sharedReps = getSharedReports();
  const all        = [...incidents, ...sharedReps];

  // ── KPI Row ──
  const total     = all.length;
  const pending   = all.filter(r => r.status === 'pending').length;
  const inProg    = all.filter(r => r.status === 'in-progress').length;
  const completed = all.filter(r => r.status === 'completed').length;
  const critical  = all.filter(r => (r.severity||'').toLowerCase() === 'critical').length;
  const resRate   = total > 0 ? Math.round((completed / total) * 100) : 0;

  const kpiEl = document.getElementById('analytics-kpis');
  if (kpiEl) kpiEl.innerHTML = [
    { icon:'📋', val: total,     label: 'Total Reports',     color:'#1E88E5' },
    { icon:'⏳', val: pending,   label: 'Pending',           color:'#F57F17' },
    { icon:'⚙️', val: inProg,    label: 'In Progress',       color:'#42A5F5' },
    { icon:'✅', val: completed, label: 'Resolved',          color:'#00C853' },
    { icon:'🔴', val: critical,  label: 'Critical',          color:'#D32F2F' },
    { icon:'📈', val: resRate+'%', label: 'Resolution Rate', color:'#7B1FA2' },
  ].map(k => `<div class="analytics-kpi-tile" style="border-top:3px solid ${k.color}">
    <div class="analytics-kpi-icon">${k.icon}</div>
    <div class="analytics-kpi-val" style="color:${k.color}">${k.val}</div>
    <div class="analytics-kpi-label">${k.label}</div>
  </div>`).join('');

  // ── Severity Donut ──
  renderDonut('analytics-severity-chart', [
    { label:'Critical', count: all.filter(r=>r.severity==='critical').length, color:'#D32F2F' },
    { label:'High',     count: all.filter(r=>r.severity==='high').length,     color:'#E65100' },
    { label:'Medium',   count: all.filter(r=>r.severity==='medium').length,   color:'#F57F17' },
    { label:'Low',      count: all.filter(r=>r.severity==='low' || !r.severity).length, color:'#1565C0' },
  ]);

  // ── Status Donut ──
  renderDonut('analytics-status-chart', [
    { label:'Pending',     count: pending,   color:'#F57F17' },
    { label:'In Progress', count: inProg,    color:'#42A5F5' },
    { label:'Completed',   count: completed, color:'#00C853' },
  ]);

  // ── Incidents by Type ──
  const typeCounts = {};
  all.forEach(r => { const t = r.type || 'Unknown'; typeCounts[t] = (typeCounts[t]||0) + 1; });
  renderHBar('analytics-type-chart', typeCounts, '#1E88E5');

  // ── Incidents by Purok ──
  const purokCounts = {};
  all.forEach(r => { const p = r.location ? (r.location.match(/purok\s*\d+/i)||['—'])[0].toUpperCase() : '—'; purokCounts[p] = (purokCounts[p]||0) + 1; });
  renderHBar('analytics-purok-chart', purokCounts, '#7B1FA2');

  // ── Top Reporters ──
  const reporterCounts = {};
  all.forEach(r => { const n = r.residentName || r.reporterName || r.createdBy || 'Staff'; reporterCounts[n] = (reporterCounts[n]||0) + 1; });
  const top = Object.entries(reporterCounts).sort((a,b)=>b[1]-a[1]).slice(0, 8);
  const repEl = document.getElementById('analytics-reporters-list');
  if (repEl) {
    if (top.length === 0) { repEl.innerHTML = '<div style="padding:20px;text-align:center;opacity:.5">No report data yet</div>'; return; }
    const max = top[0][1];
    repEl.innerHTML = top.map(([name, count], i) => `
      <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border)">
        <div style="font-family:var(--font-mono);font-size:.7rem;color:var(--text-dim);width:18px">#${i+1}</div>
        <div style="flex:1;min-width:0">
          <div style="font-size:.83rem;color:var(--text-primary);font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${name}</div>
          <div style="height:4px;background:var(--border);border-radius:2px;margin-top:4px;overflow:hidden"><div style="height:100%;background:#1E88E5;width:${Math.round((count/max)*100)}%;border-radius:2px"></div></div>
        </div>
        <div style="font-family:var(--font-mono);font-size:.78rem;color:#42A5F5;font-weight:700;flex-shrink:0">${count}</div>
      </div>`).join('');
  }
}

function renderDonut(containerId, segments) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const total = segments.reduce((s, x) => s + x.count, 0);
  if (total === 0) { el.innerHTML = '<div style="padding:20px;text-align:center;opacity:.5">No data yet</div>'; return; }

  // Build SVG donut
  const cx = 70, cy = 70, r = 50, strokeW = 18;
  const circumference = 2 * Math.PI * r;
  let offset = 0;
  const slices = segments.map(seg => {
    const pct   = seg.count / total;
    const dash  = pct * circumference;
    const slice = { ...seg, dash, offset, pct };
    offset += dash;
    return slice;
  });

  const svgSlices = slices.map(s => `
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${s.color}"
      stroke-width="${strokeW}" stroke-dasharray="${s.dash} ${circumference - s.dash}"
      stroke-dashoffset="${-(s.offset - circumference / 4)}"
      transform="rotate(-90 ${cx} ${cy})" opacity=".9"/>
  `).join('');

  const legend = segments.map(s => `
    <div style="display:flex;align-items:center;gap:7px;font-size:.75rem;color:var(--text-sec)">
      <div style="width:10px;height:10px;border-radius:2px;background:${s.color};flex-shrink:0"></div>
      <span style="flex:1">${s.label}</span>
      <strong style="color:var(--text-primary)">${s.count}</strong>
    </div>`).join('');

  el.innerHTML = `
    <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap">
      <div style="position:relative;flex-shrink:0">
        <svg width="140" height="140" viewBox="0 0 140 140">${svgSlices}
          <text x="70" y="65" text-anchor="middle" font-family="Orbitron,sans-serif" font-size="20" font-weight="700" fill="#e8f0fe">${total}</text>
          <text x="70" y="82" text-anchor="middle" font-family="Exo 2,sans-serif" font-size="9" fill="#7A94C1">TOTAL</text>
        </svg>
      </div>
      <div style="display:flex;flex-direction:column;gap:8px;flex:1;min-width:100px">${legend}</div>
    </div>`;
}

function renderHBar(containerId, countObj, color) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const entries = Object.entries(countObj).sort((a,b) => b[1] - a[1]).slice(0, 10);
  if (entries.length === 0) { el.innerHTML = '<div style="padding:20px;text-align:center;opacity:.5">No data yet</div>'; return; }
  const max = entries[0][1];
  el.innerHTML = entries.map(([label, count]) => `
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
      <div style="font-size:.76rem;color:var(--text-sec);width:160px;flex-shrink:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${label}">${label}</div>
      <div style="flex:1;height:18px;background:var(--border);border-radius:4px;overflow:hidden">
        <div style="height:100%;width:${Math.round((count/max)*100)}%;background:${color};border-radius:4px;transition:width .5s"></div>
      </div>
      <div style="font-family:var(--font-mono);font-size:.75rem;color:${color};font-weight:700;width:24px;text-align:right">${count}</div>
    </div>`).join('');
}
