// ── SHARED STORAGE BRIDGE (syncs with Staff Portal) ────
const SHARED_REPORTS_KEY = 'bos_shared_reports';
const SHARED_NOTIFS_KEY  = 'bos_resident_notifs';

// ── STATE ──────────────────────────────────
let currentUser       = null;
let reports           = [];
let notifications     = [];
let nextReportId      = 1001;
let selectedSeverity  = 'low';
let selectedEmergType = null;
let aiAnalysisDone    = false;

// ── THEME ──────────────────────────────────
let currentTheme = localStorage.getItem('sb_theme') || 'dark';

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const isDark = theme === 'dark';
  const icon   = isDark ? '<i class="fas fa-sun"></i>' : '<i class="fas fa-moon"></i>';
  const authIcon = isDark ? '<i class="fas fa-sun"></i>' : '<i class="fas fa-moon"></i>';
  const btn  = document.getElementById('themeToggleBtn');
  const abtn = document.getElementById('authThemeBtn');
  if (btn)  btn.innerHTML  = icon;
  if (abtn) abtn.innerHTML = authIcon;
  localStorage.setItem('sb_theme', theme);
  currentTheme = theme;
}

function toggleTheme() {
  applyTheme(currentTheme === 'dark' ? 'light' : 'dark');
}

// ── LOADING SCREEN ─────────────────────────
const loadStatuses = [
  'Initializing secure connection...',
  'Loading community database...',
  'Verifying barangay services...',
  'Connecting to AI engine...',
  'Portal ready.'
];

window.addEventListener('DOMContentLoaded', () => {
  applyTheme(currentTheme);

  // Auto-prioritization: listen for description input
  document.addEventListener('input', e => {
    if (e.target && e.target.id === 'incidentDesc') {
      const detected = autoDetectSeverity(e.target.value);
      applyAutoSeverity(detected);
    }
  });

  let i = 0;
  const el = document.getElementById('loadStatus');
  const iv = setInterval(() => {
    i++;
    if (i < loadStatuses.length) {
      el.textContent = loadStatuses[i];
    } else {
      clearInterval(iv);
      setTimeout(() => {
        const ls = document.getElementById('loadingScreen');
        ls.style.transition = 'opacity .6s';
        ls.style.opacity = '0';
        setTimeout(() => {
          ls.classList.add('hidden');
          document.getElementById('authScreen').classList.remove('hidden');
        }, 600);
      }, 300);
    }
  }, 450);

  // Phone number — numbers only, max 10 digits
  const phoneField = document.getElementById('regPhone');
  if (phoneField) {
    phoneField.addEventListener('input', e => {
      let val = e.target.value.replace(/\D/g, '');
      if (val.length > 10) val = val.slice(0, 10);
      e.target.value = val;
      const counter = document.getElementById('phoneCharCount');
      if (counter) counter.textContent = val.length;
    });
    phoneField.addEventListener('keydown', e => {
      // Allow: backspace, delete, tab, arrows, numbers
      const allowed = ['Backspace','Delete','Tab','ArrowLeft','ArrowRight','ArrowUp','ArrowDown'];
      if (!allowed.includes(e.key) && !/^[0-9]$/.test(e.key)) {
        e.preventDefault();
      }
    });
    phoneField.addEventListener('paste', e => {
      e.preventDefault();
      const pasted = (e.clipboardData || window.clipboardData).getData('text').replace(/\D/g,'').slice(0,10);
      phoneField.value = pasted;
      const counter = document.getElementById('phoneCharCount');
      if (counter) counter.textContent = pasted.length;
    });
  }

  // OTP input auto-advance
  document.addEventListener('input', e => {
    if (e.target.classList.contains('otp-box')) {
      const boxes = Array.from(document.querySelectorAll('.otp-box'));
      const idx   = boxes.indexOf(e.target);
      e.target.classList.remove('otp-error');
      if (e.target.value && idx < boxes.length - 1) boxes[idx + 1].focus();
    }
  });
  document.addEventListener('keydown', e => {
    if (e.target.classList.contains('otp-box')) {
      const boxes = Array.from(document.querySelectorAll('.otp-box'));
      const idx   = boxes.indexOf(e.target);
      if (e.key === 'Backspace' && !e.target.value && idx > 0) boxes[idx - 1].focus();
      if (e.key === 'Enter') verifyOtp();
    }
  });
});

// ── PASSWORD STRENGTH ───────────────────────
function checkPasswordStrength(pass) {
  const wrap = document.getElementById('passStrengthWrap');
  if (wrap) wrap.style.display = pass.length > 0 ? '' : 'none';

  const rules = {
    length:  pass.length >= 8,
    upper:   /[A-Z]/.test(pass),
    lower:   /[a-z]/.test(pass),
    number:  /[0-9]/.test(pass),
    special: /[?!@#$%^&*]/.test(pass),
  };

  let score = Object.values(rules).filter(Boolean).length;

  // Update rule indicators
  Object.keys(rules).forEach(key => {
    const el = document.getElementById('rule-' + key);
    if (!el) return;
    el.className = 'pass-rule ' + (rules[key] ? 'ok' : '');
    el.querySelector('i').className = rules[key] ? 'fas fa-circle-check' : 'fas fa-circle-xmark';
  });

  const bar   = document.getElementById('passStrengthBar');
  const label = document.getElementById('passStrengthLabel');
  if (!bar || !label) return;

  const levels = ['', 'Very Weak', 'Weak', 'Fair', 'Strong', 'Very Strong'];
  const colors = ['', '#ff4444', '#ff8c00', '#ffc107', '#00c853', '#00e676'];
  bar.style.width  = (score / 5 * 100) + '%';
  bar.style.background = colors[score] || colors[1];
  label.textContent    = levels[score] || 'Very Weak';
  label.style.color    = colors[score] || colors[1];
}

function isValidPassword(pass) {
  return pass.length >= 8
    && /[A-Z]/.test(pass)
    && /[a-z]/.test(pass)
    && /[0-9]/.test(pass)
    && /[?!@#$%^&*]/.test(pass);
}

function isValidEmail(email) {
  // Must have valid format: user@domain.tld where tld is real letters
  return /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/.test(email);
}

// ── AUTH ───────────────────────────────────
function showSignup() {
  document.getElementById('loginPanel').classList.add('hidden');
  document.getElementById('signupPanel').classList.remove('hidden');
}
function showLogin() {
  document.getElementById('signupPanel').classList.add('hidden');
  document.getElementById('loginPanel').classList.remove('hidden');
}

function doLogin() {
  const email = document.getElementById('loginEmail').value.trim();
  const pass  = document.getElementById('loginPass').value;
  const al    = document.getElementById('loginAlert');

  if (!email || !pass) return showAlert(al, 'error', 'Please fill in all fields.');

  const saved = sessionStorage.getItem('sb_user');
  if (saved) {
    const u = JSON.parse(saved);
    if (email === u.email && pass === u.pass) {
      currentUser = u;
      const si = sessionStorage.getItem('sb_nextId');
      if (si) nextReportId = parseInt(si);
      loadResidentReports();
      loadStaffNotifications();
      launchApp();
      return;
    }
  }
  showAlert(al, 'error', 'Invalid credentials. Please register first, or check your email and password.');
}

// ── OTP STATE ─────────────────────────────
let _otpCode        = '';
let _otpPendingUser = null;
let _otpTimer       = null;
let _otpSeconds     = 300;

function doSignup() {
  const first   = document.getElementById('regFirst').value.trim();
  const last    = document.getElementById('regLast').value.trim();
  const email   = document.getElementById('regEmail').value.trim();
  const phone   = document.getElementById('regPhone').value.trim();
  const address = document.getElementById('regAddress').value.trim();
  const pass    = document.getElementById('regPass').value;
  const confirm = document.getElementById('regConfirm').value;
  const agreed  = document.getElementById('agreeTerms').checked;
  const al      = document.getElementById('signupAlert');

  if (!first || !last || !email || !phone || !address || !pass || !confirm)
    return showAlert(al, 'error', 'Please fill in all required fields.');

  // Email validation — must be a real format, reject invalid like 123@abc.com
  if (!isValidEmail(email))
    return showAlert(al, 'error', 'Please enter a valid email address (e.g. name@gmail.com). Numbers-only usernames are not accepted.');

  // Phone validation — exactly 10 digits (after stripping), numbers only
  const cleanPhone = phone.replace(/\D/g, '');
  if (cleanPhone.length !== 10)
    return showAlert(al, 'error', 'Contact number must be exactly 10 digits (e.g. 9171234567).');

  // Password rules
  if (!isValidPassword(pass))
    return showAlert(al, 'error', 'Password does not meet requirements. Must have uppercase, lowercase, number, and special character (?!@#$%^&*) — minimum 8 characters. Example: AbC93?!');
  if (pass !== confirm)
    return showAlert(al, 'error', 'Passwords do not match.');
  if (!agreed)
    return showAlert(al, 'error', 'You must agree to the Terms & Conditions to continue.');

  _otpPendingUser = { first, last, email, phone: '+63' + cleanPhone, address, barangay: 'Sta. Rita', pass, joinDate: new Date().toISOString() };
  sendOtpCode(email);
  hideAlert(al);
}

// ── EmailJS configuration ─────────────────
const EMAILJS_SERVICE_ID  = 'service_smartbgy';
const EMAILJS_TEMPLATE_ID = 'template_otp';
const EMAILJS_PUBLIC_KEY  = 'YOUR_PUBLIC_KEY';

async function _loadEmailJS() {
  if (window.emailjs) return;
  await new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/@emailjs/browser@4/dist/email.min.js';
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
  emailjs.init(EMAILJS_PUBLIC_KEY);
}

async function sendOtpCode(email) {
  _otpCode    = String(Math.floor(100000 + Math.random() * 900000));
  _otpSeconds = 300;

  document.getElementById('otpEmailDisplay').textContent = email;
  document.getElementById('otpModal').classList.remove('hidden');
  document.getElementById('otpAlert').classList.add('hidden');
  document.querySelectorAll('.otp-box').forEach(b => { b.value = ''; b.classList.remove('otp-error','otp-success'); });
  document.querySelectorAll('.otp-box')[0].focus();
  document.getElementById('otpResendBtn').disabled = true;

  startOtpTimer();

  try {
    await _loadEmailJS();
    await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, {
      to_email:   email,
      to_name:    _otpPendingUser ? `${_otpPendingUser.first} ${_otpPendingUser.last}` : email.split('@')[0],
      otp_code:   _otpCode,
      barangay:   'Barangay Sta. Rita, Olongapo City',
      expires_in: '5 minutes',
    });
    showToast(`📧 Verification code sent to ${email}. Check your inbox (and spam folder).`);
  } catch (err) {
    console.warn('[SmartBarangay OTP] EmailJS not configured. Falling back to dev mode.', err);
    console.log(`%c[SmartBarangay OTP DEV] Code for ${email}: ${_otpCode}`, 'background:#e65100;color:#fff;padding:4px 10px;border-radius:4px;font-size:14px');
    showToast(`⚠️ Email service not configured. Dev OTP shown in browser console.`);
    let hint = document.getElementById('otp-dev-hint');
    if (!hint) {
      hint = document.createElement('div');
      hint.id = 'otp-dev-hint';
      hint.style.cssText = 'position:fixed;bottom:80px;left:20px;background:#0a0f1e;border:1px solid #1565C0;padding:8px 14px;border-radius:6px;font-family:monospace;font-size:.75rem;color:#42A5F5;z-index:99999;opacity:.95';
      document.body.appendChild(hint);
    }
    hint.textContent = `[DEV] OTP for ${email}: ${_otpCode}`;
    setTimeout(() => hint?.remove(), 60000);
  }
}

function startOtpTimer() {
  clearInterval(_otpTimer);
  const cdEl = document.getElementById('otpCountdown');
  const resendBtn = document.getElementById('otpResendBtn');
  resendBtn.disabled = true;

  _otpTimer = setInterval(() => {
    _otpSeconds--;
    const m = Math.floor(_otpSeconds / 60).toString().padStart(2, '0');
    const s = (_otpSeconds % 60).toString().padStart(2, '0');
    if (cdEl) cdEl.textContent = `${m}:${s}`;
    if (_otpSeconds <= 60) {
      document.getElementById('otpTimer').style.color = 'var(--red)';
    }
    if (_otpSeconds <= 0) {
      clearInterval(_otpTimer);
      if (cdEl) cdEl.textContent = '00:00';
      document.getElementById('otpTimer').style.color = 'var(--red)';
      resendBtn.disabled = false;
    } else if (_otpSeconds <= 240) {
      resendBtn.disabled = false;
    }
  }, 1000);
}

function verifyOtp() {
  const boxes   = document.querySelectorAll('.otp-box');
  const entered = Array.from(boxes).map(b => b.value).join('');
  const al      = document.getElementById('otpAlert');

  if (entered.length < 6) {
    showAlert(al, 'error', 'Please enter all 6 digits of the OTP.');
    boxes.forEach(b => { if (!b.value) b.classList.add('otp-error'); });
    return;
  }
  if (_otpSeconds <= 0) {
    showAlert(al, 'error', '⏰ OTP has expired. Please request a new code.');
    boxes.forEach(b => b.classList.add('otp-error'));
    return;
  }
  if (entered !== _otpCode) {
    showAlert(al, 'error', '❌ Incorrect OTP. Please try again.');
    boxes.forEach(b => { b.classList.add('otp-error'); b.classList.remove('otp-success'); });
    document.querySelector('.otp-inputs').classList.add('otp-shake');
    setTimeout(() => document.querySelector('.otp-inputs').classList.remove('otp-shake'), 500);
    return;
  }

  boxes.forEach(b => { b.classList.remove('otp-error'); b.classList.add('otp-success'); });
  clearInterval(_otpTimer);
  showAlert(al, 'success', '✅ Email verified successfully!');

  setTimeout(() => {
    reports       = [];
    notifications = [];
    nextReportId  = 1001;
    sessionStorage.setItem('sb_user',   JSON.stringify(_otpPendingUser));
    sessionStorage.setItem('sb_nextId', nextReportId);

    document.getElementById('otpModal').classList.add('hidden');
    showLogin();
    document.getElementById('loginEmail').value = _otpPendingUser.email;
    document.getElementById('loginPass').value  = '';
    hideAlert(document.getElementById('signupAlert'));
    showAlert(document.getElementById('loginAlert'), 'success', '🎉 Account verified & created! Enter your password to sign in.');
    _otpPendingUser = null;
  }, 1200);
}

function resendOtp() {
  if (!_otpPendingUser) return;
  document.getElementById('otpTimer').style.color = '';
  document.getElementById('otp-dev-hint')?.remove();
  sendOtpCode(_otpPendingUser.email);
  showAlert(document.getElementById('otpAlert'), 'success', '📧 New OTP sent! Check your inbox.');
  setTimeout(() => document.getElementById('otpAlert').classList.add('hidden'), 3000);
}

function cancelOtp() {
  clearInterval(_otpTimer);
  document.getElementById('otpModal').classList.add('hidden');
  document.getElementById('otp-dev-hint')?.remove();
  _otpPendingUser = null;
  _otpCode = '';
  _otpSeconds = 0;
  showToast('OTP sending cancelled. You can try signing up again.');
}

function launchApp() {
  document.getElementById('authScreen').classList.add('hidden');
  document.getElementById('mainApp').classList.remove('hidden');
  applyUserToUI();
  refreshDashboard();
  refreshReportsTable();
  refreshNotifications();
  startStaffNotifPolling();
}

// ── SHARED DATA HELPERS ──────────────────────
function getSharedReports() {
  try { return JSON.parse(localStorage.getItem(SHARED_REPORTS_KEY) || '[]'); }
  catch { return []; }
}
function saveSharedReports(arr) {
  localStorage.setItem(SHARED_REPORTS_KEY, JSON.stringify(arr));
}
function getStoredResidentNotifs() {
  try { return JSON.parse(localStorage.getItem(SHARED_NOTIFS_KEY) || '[]'); }
  catch { return []; }
}
function saveStoredResidentNotifs(arr) {
  localStorage.setItem(SHARED_NOTIFS_KEY, JSON.stringify(arr));
}

function loadResidentReports() {
  const all = getSharedReports();
  const tag = currentUser?.email || 'resident';
  reports = all.filter(r => r.residentEmail === tag);
}

function loadStaffNotifications() {
  const stored  = getStoredResidentNotifs();
  const myIds   = new Set(reports.map(r => r.id));
  const cleared = JSON.parse(localStorage.getItem('bos_cleared_notifs') || '[]');
  stored.forEach(n => {
    const key = n.reportId + n.date;
    if (n.reportId && myIds.has(n.reportId) && !notifications.find(x => x._staffId === key) && !cleared.includes(key)) {
      notifications.push({ ...n, _staffId: key });
    }
  });
  saveStoredResidentNotifs(stored);
}

let _lastNotifCount = 0;
function startStaffNotifPolling() {
  setInterval(() => {
    if (!currentUser) return;
    const stored  = getStoredResidentNotifs();
    const myIds   = new Set(reports.map(r => r.id));
    let changed   = false;

    stored.forEach(n => {
      if (!n.fromStaff) return;
      const key     = n.reportId + n.date;
      const cleared = JSON.parse(localStorage.getItem('bos_cleared_notifs') || '[]');
      if (!notifications.find(x => x._staffId === key) && !cleared.includes(key)) {
        notifications.push({ ...n, _staffId: key });
        changed = true;
        if (n.reportId) {
          const sharedReports = getSharedReports();
          const sr = sharedReports.find(r => r.id === n.reportId);
          const lr = reports.find(r => r.id === n.reportId);
          if (sr && lr) { lr.status = sr.status; lr.completedAt = sr.completedAt; lr.timeline = sr.timeline; }
        }
      }
    });

    if (changed) {
      refreshDashboard();
      refreshReportsTable();
      refreshNotifications();
      showToast('📬 Barangay staff updated your report!');
    }
  }, 4000);
}

function applyUserToUI() {
  const initials = currentUser.first[0].toUpperCase() + currentUser.last[0].toUpperCase();
  const name     = currentUser.first + ' ' + currentUser.last;
  document.getElementById('sidebarAvatar').textContent = initials;
  document.getElementById('topAvatar').textContent     = initials;
  document.getElementById('sidebarName').textContent   = name;
  document.getElementById('dashName').textContent      = currentUser.first;
  document.getElementById('profileAvatar').textContent = initials;
  document.getElementById('profileName').textContent   = name;
  document.getElementById('profFirst').value    = currentUser.first;
  document.getElementById('profLast').value     = currentUser.last;
  document.getElementById('profEmail').value    = currentUser.email;
  document.getElementById('profPhone').value    = currentUser.phone    || '';
  document.getElementById('profAddress').value  = currentUser.address  || '';
  document.getElementById('profBarangay').value = 'Sta. Rita';
}

function doLogout() {
  sessionStorage.setItem('sb_nextId', nextReportId);
  currentUser = null;
  reports = []; notifications = [];
  document.getElementById('mainApp').classList.add('hidden');
  document.getElementById('authScreen').classList.remove('hidden');
  showLogin();
  document.getElementById('loginEmail').value = '';
  document.getElementById('loginPass').value  = '';
  hideAlert(document.getElementById('loginAlert'));
}

function togglePass(id, btn) {
  const inp = document.getElementById(id);
  if (inp.type === 'password') {
    inp.type = 'text';
    btn.innerHTML = '<i class="fas fa-eye-slash"></i>';
  } else {
    inp.type = 'password';
    btn.innerHTML = '<i class="fas fa-eye"></i>';
  }
}

function toggleTerms() { document.getElementById('termsModal').classList.remove('hidden'); }
function closeTermsModal() { document.getElementById('termsModal').classList.add('hidden'); }
function agreeAndCloseTerms() {
  document.getElementById('agreeTerms').checked = true;
  closeTermsModal();
  const box = document.querySelector('.terms-box');
  if (box) { box.classList.add('terms-agreed'); setTimeout(() => box.classList.remove('terms-agreed'), 1800); }
}

// ── NAVIGATION ─────────────────────────────
function showPage(pageId, link) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('page-' + pageId).classList.add('active');
  const titles = {
    dashboard: 'Dashboard', report: 'Report Incident', livemap: 'Live Incident Map',
    myreports: 'My Reports', notifications: 'Notifications',
    feedback: 'Feedback', profile: 'My Profile', aboutus: 'About Us'
  };
  document.getElementById('topbarTitle').textContent = titles[pageId] || pageId;
  if (link) link.classList.add('active');
  if (window.innerWidth <= 768) document.getElementById('sidebar').classList.remove('open');
  if (pageId === 'notifications') markAllNotifRead();
  if (pageId === 'dashboard')     refreshDashboard();
  if (pageId === 'livemap')       initLiveMap();
  if (pageId === 'report')        initReportMapPicker();
}

function toggleSidebar() { document.getElementById('sidebar').classList.toggle('open'); }

// ── DASHBOARD REFRESH ──────────────────────
function refreshDashboard() {
  const total    = reports.length;
  const pending  = reports.filter(r => r.status === 'pending').length;
  const resolved = reports.filter(r => r.status === 'resolved' || r.status === 'completed').length;
  const inProg   = reports.filter(r => r.status === 'in-progress').length;

  document.getElementById('statTotal').textContent    = total;
  document.getElementById('statPending').textContent  = pending;
  document.getElementById('statResolved').textContent = resolved;
  document.getElementById('statProgress').textContent = inProg;

  const pt = document.getElementById('profStatTotal');
  const pr = document.getElementById('profStatResolved');
  if (pt) pt.textContent = total;
  if (pr) pr.textContent = resolved;

  const recentEl = document.getElementById('dashRecentReports');
  if (reports.length === 0) {
    recentEl.innerHTML = '<div class="empty-state"><i class="fas fa-inbox"></i><p>No reports yet. Submit your first incident report!</p></div>';
  } else {
    const recent = [...reports].reverse().slice(0, 3);
    recentEl.innerHTML = recent.map(r => `
      <div class="report-item">
        <div class="report-dot ${r.status}"></div>
        <div class="report-info">
          <div class="report-title">${r.type}</div>
          <div class="report-date">${formatDate(r.date)}</div>
        </div>
        <span class="status-badge ${r.status}">${statusLabel(r.status)}</span>
      </div>`).join('');
  }

  const notifMiniEl = document.getElementById('dashNotifMini');
  if (notifications.length === 0) {
    notifMiniEl.innerHTML = '<div class="empty-state"><i class="fas fa-bell-slash"></i><p>No notifications yet.</p></div>';
  } else {
    const recent = [...notifications].reverse().slice(0, 3);
    notifMiniEl.innerHTML = recent.map(n => `
      <div class="notif-mini">
        <i class="fas ${n.icon} ${n.color}"></i>
        <div>
          <div class="notif-mini-text">${n.text.length > 60 ? n.text.slice(0,58)+'...' : n.text}</div>
          <div class="notif-mini-time">${timeAgo(n.date)}</div>
        </div>
      </div>`).join('');
  }

  const counts = [0,0,0,0,0,0,0];
  const now = new Date();
  reports.forEach(r => {
    const d    = new Date(r.date);
    const diff = Math.floor((now - d) / 86400000);
    if (diff < 7) counts[d.getDay()]++;
  });
  const max     = Math.max(...counts, 1);
  const ordered = [1,2,3,4,5,6,0].map(i => counts[i]);
  const today   = new Date().getDay();
  const todayIdx= [1,2,3,4,5,6,0].indexOf(today);
  for (let i = 0; i < 7; i++) {
    const bar = document.getElementById('bar' + i);
    if (!bar) continue;
    bar.style.height = Math.round((ordered[i] / max) * 100) + '%';
    bar.classList.toggle('active', i === todayIdx);
  }

  const unread   = notifications.filter(n => !n.read).length;
  const badge    = document.getElementById('notifBadge');
  const topBadge = document.getElementById('topNotifBadge');
  if (unread > 0) {
    badge.textContent = topBadge.textContent = unread;
    badge.classList.remove('hidden');
    topBadge.classList.remove('hidden');
  } else {
    badge.classList.add('hidden');
    topBadge.classList.add('hidden');
  }
}

// ── AUTO PRIORITIZATION from description ─────
function autoDetectSeverity(desc) {
  const text = desc.toLowerCase();
  const criticalKw = ['fire','burning','explosion','dead','death','murder','stabbing','gun','shot','flood','severe flood','unconscious','collapsed building','electrocuted','major accident','drowning'];
  const highKw = ['injured','injury','bleeding','crime','robbery','assault','attack','break-in','violence','gas leak','accident','dangerous','emergency','urgent','threat','armed','damage','destroyed'];
  const mediumKw = ['broken','vandalism','vandalized','stray dog','stray animal','pothole','sewage','garbage','dumping','blocked','smoke','foul smell','no electricity','streetlight','malfunction'];
  for (const kw of criticalKw) { if (text.includes(kw)) return 'critical'; }
  for (const kw of highKw)     { if (text.includes(kw)) return 'high'; }
  for (const kw of mediumKw)   { if (text.includes(kw)) return 'medium'; }
  return null;
}

function applyAutoSeverity(severity) {
  if (!severity) return;
  if (selectedSeverity === severity) return;
  document.querySelectorAll('.sev-btn').forEach(b => b.classList.remove('active'));
  const btn = document.querySelector(`.sev-btn.${severity}`);
  if (btn) btn.classList.add('active');
  selectedSeverity = severity;
  const indicator = document.getElementById('autoSevIndicator');
  if (indicator) {
    const labels = { critical: '🔴 Critical', high: '🟠 High', medium: '🟡 Medium', low: '🟢 Low' };
    indicator.textContent = `⚡ Auto-detected: ${labels[severity]}`;
    indicator.className   = 'auto-sev-indicator sev-' + severity;
    indicator.classList.remove('hidden');
  }
}

function setSev(btn, level) {
  document.querySelectorAll('.sev-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  selectedSeverity = level;
  const indicator = document.getElementById('autoSevIndicator');
  if (indicator) indicator.classList.add('hidden');
  if (aiAnalysisDone) analyzeReport();
}

// ── FILE UPLOAD ────────────────────────────
function handleFiles(files) {
  const preview = document.getElementById('uploadPreview');
  Array.from(files).forEach(file => {
    const reader = new FileReader();
    reader.onload = e => {
      const wrap = document.createElement('div');
      wrap.style.cssText = 'position:relative;display:inline-block';
      const img = document.createElement('img');
      img.src = e.target.result;
      img.className = 'preview-img';
      const del = document.createElement('button');
      del.innerHTML = '<i class="fas fa-times"></i>';
      del.className = 'preview-del';
      del.onclick = () => wrap.remove();
      wrap.appendChild(img);
      wrap.appendChild(del);
      preview.appendChild(wrap);
    };
    reader.readAsDataURL(file);
  });
}
function handleDrop(e) {
  e.preventDefault();
  handleFiles(e.dataTransfer.files);
}

// ── AI ANALYSIS ──────────────────────────────
function analyzeReport(silent = false) {
  const type     = document.getElementById('incidentType').value;
  const desc     = document.getElementById('incidentDesc').value.trim();
  const aiBox    = document.getElementById('aiBox');
  const aiResult = document.getElementById('aiResult');

  if (!type && !desc) {
    if (!silent) showToast('Please fill in the incident type and description first.');
    return;
  }

  aiBox.style.display = '';
  aiResult.innerHTML = '<div style="color:var(--text-muted);font-size:.85rem;animation:blink 1s infinite">🤖 AI is analyzing your report...</div>';

  setTimeout(() => {
    const sevColor = getSevColor();
    const sevLabel = selectedSeverity.charAt(0).toUpperCase() + selectedSeverity.slice(1);
    const priority = selectedSeverity === 'critical' ? 'Immediate (< 1 hr)'
                   : selectedSeverity === 'high'     ? 'High (2–4 hrs)'
                   : selectedSeverity === 'medium'   ? 'Standard (24 hrs)' : 'Routine (3–5 days)';
    const dept = type === 'Infrastructure / Road' || type === 'Flood / Drainage' ? 'Engineering Office'
               : type === 'Public Safety'       ? 'Barangay Peacekeeping'
               : type === 'Health & Sanitation' ? 'Health Services Unit'
               : type === 'Electrical / Street Lights' ? 'Engineering Office'
               : type === 'Vandalism'           ? 'Barangay Tanod'
               : type === 'Noise Complaint'     ? 'Lupon Tagapamayapa'
               : 'General Services Office';
    const conf = Math.floor(Math.random() * 8 + 89);
    let score = { critical: 90, high: 70, medium: 45, low: 20 }[selectedSeverity] || 20;
    const urgentKw = ['fire','flood','crime','medical','accident','violent','emergency','dead','injury'];
    urgentKw.forEach(kw => { if ((desc + ' ' + type).toLowerCase().includes(kw)) score += 8; });
    score = Math.min(100, score);

    aiResult.innerHTML = `
      <div class="ai-result-item"><span>Classified As</span><strong>${type || 'General Incident'}</strong></div>
      <div class="ai-result-item"><span>AI Severity Assessment</span><strong style="color:${sevColor}">${sevLabel}</strong></div>
      <div class="ai-result-item"><span>AI Priority Score</span><strong style="color:${sevColor}">${score}/100</strong></div>
      <div class="ai-result-item"><span>Recommended Response Time</span><strong>${priority}</strong></div>
      <div class="ai-result-item"><span>Assigned Department</span><strong>${dept}</strong></div>
      <div class="ai-result-item"><span>AI Confidence</span><strong style="color:var(--green)">${conf}%</strong></div>
      <div class="ai-result-item"><span>Status Upon Submission</span><strong>Pending Barangay Review</strong></div>
    `;
    aiAnalysisDone = true;
  }, silent ? 400 : 1600);
}

function getSevColor() {
  return selectedSeverity === 'critical' ? 'var(--red)'
       : selectedSeverity === 'high'     ? 'var(--orange)'
       : selectedSeverity === 'medium'   ? 'var(--yellow)' : 'var(--green)';
}

// ── SUBMIT REPORT ─────────────────────────────
function submitReport() {
  const type     = document.getElementById('incidentType').value;
  const location = document.getElementById('incidentLocation').value.trim();
  const desc     = document.getElementById('incidentDesc').value.trim();
  const al       = document.getElementById('reportAlert');

  if (!type)     return showAlert(al, 'error', 'Please select an incident type.');
  if (!location) return showAlert(al, 'error', 'Please enter the incident location.');
  if (!desc)     return showAlert(al, 'error', 'Please describe the incident.');

  if (!aiAnalysisDone) analyzeReport(true);

  const id  = nextReportId++;
  const now = new Date().toISOString();
  const r   = {
    id, type, location, desc,
    severity: selectedSeverity,
    status: 'pending',
    date: now,
    lat: window._pendingLat || null,
    lng: window._pendingLng || null,
    residentEmail: currentUser?.email || 'resident',
    residentName:  currentUser ? `${currentUser.first} ${currentUser.last}` : 'Resident',
    timeline: [
      { title: 'Submitted',     text: 'Report received and queued for review.',             col: 'yellow', date: now },
      { title: 'AI Classified', text: `Classified as ${type}, ${selectedSeverity} severity. Routed to Staff Portal.`, col: 'blue', date: now },
    ],
  };

  reports.push(r);
  sessionStorage.setItem('sb_nextId', nextReportId);

  const shared = getSharedReports();
  shared.push(r);
  saveSharedReports(shared);

  addNotification({
    icon: 'fa-paper-plane', color: 'blue-icon',
    text: `Your report #${id} — ${type} has been submitted and routed to Barangay staff.`,
    date: now,
  });

  showAlert(al, 'success', `✅ Report #${id} submitted! AI analysis complete. Barangay staff has been notified.`);
  showToast(`🤖 Report #${id} — AI classified and routed to Staff Portal!`);

  setTimeout(() => {
    document.getElementById('incidentType').value      = '';
    document.getElementById('incidentLocation').value  = '';
    document.getElementById('incidentDesc').value      = '';
    document.getElementById('uploadPreview').innerHTML = '';
    document.getElementById('aiBox').style.display     = 'none';
    document.querySelectorAll('.sev-btn').forEach(b => b.classList.remove('active'));
    document.querySelector('.sev-btn.low').classList.add('active');
    selectedSeverity = 'low';
    aiAnalysisDone = false;
    window._pendingLat = null;
    window._pendingLng = null;
    _pickerLat = null; _pickerLng = null;
    if (_pickerMarker && _pickerMap) { _pickerMap.removeLayer(_pickerMarker); _pickerMarker = null; }
    const coordEl = document.getElementById('mapCoords');
    if (coordEl) coordEl.innerHTML = '<i class="fas fa-info-circle"></i> Click on the map to pin the exact incident location';
    hideAlert(al);
  }, 4000);

  refreshDashboard();
  refreshReportsTable();
}

// ── REPORTS TABLE ───────────────────────────
function refreshReportsTable() {
  const tbody = document.getElementById('reportsTableBody');
  const noRow = document.getElementById('noReportsRow');
  tbody.querySelectorAll('tr[data-dynamic]').forEach(r => r.remove());

  const shared = getSharedReports();
  reports.forEach(r => {
    const sr = shared.find(s => s.id === r.id);
    if (sr) { r.status = sr.status; r.timeline = sr.timeline; }
  });

  if (reports.length === 0) {
    if (noRow) noRow.style.display = '';
    return;
  }
  if (noRow) noRow.style.display = 'none';

  [...reports].reverse().forEach(r => {
    const tr = document.createElement('tr');
    tr.dataset.status  = r.status;
    tr.dataset.dynamic = '1';
    tr.innerHTML = `
      <td>#${r.id}</td>
      <td>${r.type}</td>
      <td>${r.location}</td>
      <td>${formatDate(r.date)}</td>
      <td><span class="status-badge ${r.status}">${statusLabel(r.status)}</span></td>
      <td><button class="btn-icon" onclick="viewReport(${r.id})"><i class="fas fa-eye"></i></button></td>
    `;
    tbody.appendChild(tr);
  });
}

function filterReports(status, btn) {
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.querySelectorAll('#reportsTableBody tr[data-dynamic]').forEach(row => {
    row.style.display = (status === 'all' || row.dataset.status === status) ? '' : 'none';
  });
}

function viewReport(id) {
  const shared = getSharedReports();
  const sr = shared.find(s => s.id === id);
  const r  = reports.find(rep => rep.id === id);
  if (sr && r) { r.status = sr.status; r.timeline = sr.timeline; }
  if (!r) return;

  document.getElementById('modalTitle').textContent = `Report #${r.id}`;
  const sevColor  = r.severity === 'critical' ? 'var(--red)'  : r.severity === 'high'  ? 'var(--orange)' : r.severity === 'medium' ? 'var(--yellow)' : 'var(--green)';
  const statColor = r.status === 'resolved' || r.status === 'completed' ? 'var(--green)' : r.status === 'in-progress' ? 'var(--blue-glow)' : 'var(--yellow)';

  document.getElementById('modalBody').innerHTML = `
    <div class="modal-detail"><span>Incident Type</span><span>${r.type}</span></div>
    <div class="modal-detail"><span>Location</span><span>${r.location}</span></div>
    <div class="modal-detail"><span>Date Submitted</span><span>${formatDateFull(r.date)}</span></div>
    <div class="modal-detail"><span>Severity</span><span style="color:${sevColor};font-weight:700">${r.severity.charAt(0).toUpperCase()+r.severity.slice(1)}</span></div>
    <div class="modal-detail"><span>Status</span><span style="color:${statColor};font-weight:700">${statusLabel(r.status)}</span></div>
    ${r.completedAt ? `<div class="modal-detail"><span>Resolved On</span><span style="color:var(--green)">${formatDateFull(r.completedAt)}</span></div>` : ''}
    <div style="font-size:.83rem;color:var(--text-muted);background:var(--bg-input);padding:12px;border-radius:8px;line-height:1.6;margin-top:4px">${r.desc}</div>
    <div style="font-family:var(--font-head);font-size:.95rem;color:var(--text-main);margin-top:8px">Timeline</div>
    <div class="timeline">
      ${(r.timeline || []).map(t => `
        <div class="timeline-item">
          <div class="tl-dot" style="background:${t.col==='green'?'var(--green)':t.col==='blue'?'var(--blue-vivid)':t.col==='red'?'var(--red)':'var(--yellow)'}"></div>
          <div class="tl-text"><strong>${t.title}</strong> — ${t.text}</div>
        </div>`).join('')}
    </div>
  `;
  document.getElementById('reportModal').classList.remove('hidden');
}
function closeModal() { document.getElementById('reportModal').classList.add('hidden'); }

// ── NOTIFICATIONS ──────────────────────────
function addNotification({ icon, color, text, date }) {
  notifications.push({ icon, color, text, date, read: false });
  refreshNotifications();
  refreshDashboard();
}

function refreshNotifications() {
  const list  = document.getElementById('notifList');
  const noMsg = document.getElementById('noNotifMsg');
  list.querySelectorAll('.notif-card').forEach(c => c.remove());

  if (notifications.length === 0) {
    if (noMsg) noMsg.style.display = '';
  } else {
    if (noMsg) noMsg.style.display = 'none';
    const total = notifications.length;
    [...notifications].reverse().forEach((n, i) => {
      const realIdx = total - 1 - i;
      const div = document.createElement('div');
      div.className = 'notif-card' + (n.read ? '' : ' unread') + (n.fromStaff ? ' staff-notif' : '');
      if (n.fromStaff) div.style.cssText = 'border-left: 3px solid var(--green);';
      div.innerHTML = `
        <div class="notif-icon ${n.color}"><i class="fas ${n.icon}"></i></div>
        <div class="notif-body">
          <div class="notif-title">${n.text}</div>
          <div class="notif-time"><i class="fas fa-clock"></i> ${timeAgo(n.date)}${n.fromStaff ? ' <span style="color:var(--green);font-weight:700;font-size:.75rem"> · Barangay Staff</span>' : ''}</div>
        </div>
        ${!n.read ? `<div class="notif-mark" onclick="markOneRead(${realIdx},this)"></div>` : ''}
      `;
      list.appendChild(div);
    });
  }

  const unread   = notifications.filter(n => !n.read).length;
  const badge    = document.getElementById('notifBadge');
  const topBadge = document.getElementById('topNotifBadge');
  if (unread > 0) {
    badge.textContent = topBadge.textContent = unread;
    badge.classList.remove('hidden');
    topBadge.classList.remove('hidden');
  } else {
    badge.classList.add('hidden');
    topBadge.classList.add('hidden');
  }
}

function markOneRead(idx, dotEl) {
  if (notifications[idx]) {
    notifications[idx].read = true;
    dotEl.closest('.notif-card').classList.remove('unread');
    dotEl.remove();
    refreshDashboard();
  }
}

function markAllNotifRead() {
  let changed = false;
  notifications.forEach(n => { if (!n.read) { n.read = true; changed = true; } });
  if (changed) { refreshNotifications(); refreshDashboard(); }
}

function clearAllNotifications() {
  if (notifications.length === 0) return;
  const clearedKeys = notifications.filter(n => n._staffId).map(n => n._staffId);
  const existing = JSON.parse(localStorage.getItem('bos_cleared_notifs') || '[]');
  localStorage.setItem('bos_cleared_notifs', JSON.stringify([...new Set([...existing, ...clearedKeys])]));
  notifications = [];
  refreshNotifications();
  refreshDashboard();
  showToast('🗑️ All notifications cleared.');
}

// ── EMERGENCY ──────────────────────────────
function showEmergency() { document.getElementById('emergencyModal').classList.remove('hidden'); }
function closeEmergency() {
  document.getElementById('emergencyModal').classList.add('hidden');
  document.getElementById('emergDesc').value = '';
  document.querySelectorAll('.emerg-type-btn').forEach(b => b.classList.remove('selected'));
  selectedEmergType = null;
}
function submitEmergency(type) {
  document.querySelectorAll('.emerg-type-btn').forEach(b => b.classList.remove('selected'));
  event.currentTarget.classList.add('selected');
  selectedEmergType = type;
}
function sendEmergency() {
  if (!selectedEmergType) { showToast('Please select the type of emergency first.'); return; }
  const desc = document.getElementById('emergDesc').value.trim();
  const now  = new Date().toISOString();
  const id   = nextReportId++;
  const r    = {
    id, type: `Emergency — ${selectedEmergType}`,
    location: desc || 'Location not specified',
    desc: desc || 'Emergency quick report submitted via portal.',
    severity: 'critical', status: 'pending', date: now,
    residentEmail: currentUser?.email || 'resident',
    residentName:  currentUser ? `${currentUser.first} ${currentUser.last}` : 'Resident',
    timeline: [{ title: 'Emergency Alert Sent', text: 'Barangay officials have been notified.', col: 'red', date: now }],
  };
  reports.push(r);
  sessionStorage.setItem('sb_nextId', nextReportId);
  const shared = getSharedReports();
  shared.push(r);
  saveSharedReports(shared);
  addNotification({ icon: 'fa-triangle-exclamation', color: 'red-icon', text: `🚨 Emergency alert #${id} (${selectedEmergType}) sent. Barangay officials notified!`, date: now });
  closeEmergency();
  refreshDashboard();
  refreshReportsTable();
  showToast(`🚨 Emergency #${id} sent! Barangay has been alerted.`);
}

// ── FEEDBACK ───────────────────────────────
const ratings = {};
function rateStar(star, val, cat) {
  ratings[cat] = val;
  star.closest('.stars').querySelectorAll('i').forEach((s, i) => s.classList.toggle('lit', i < val));
}
function submitFeedback() {
  const msg = document.getElementById('feedbackMsg').value.trim();
  const al  = document.getElementById('feedbackAlert');
  if (!msg) return showAlert(al, 'error', 'Please write your feedback before submitting.');
  showAlert(al, 'success', '✅ Thank you! Your feedback has been submitted to the barangay.');
  document.getElementById('feedbackMsg').value = '';
  document.querySelectorAll('.stars i').forEach(s => s.classList.remove('lit'));
  showToast('Feedback submitted successfully!');
  setTimeout(() => hideAlert(al), 4000);
}

// ── PROFILE ────────────────────────────────
function saveProfile() {
  const first    = document.getElementById('profFirst').value.trim();
  const last     = document.getElementById('profLast').value.trim();
  const email    = document.getElementById('profEmail').value.trim();
  const phone    = document.getElementById('profPhone').value.trim();
  const address  = document.getElementById('profAddress').value.trim();
  const al       = document.getElementById('profileAlert');
  if (!first || !last) return showAlert(al, 'error', 'First and last name are required.');
  currentUser = { ...currentUser, first, last, email, phone, address, barangay: 'Sta. Rita' };
  sessionStorage.setItem('sb_user', JSON.stringify(currentUser));
  applyUserToUI();
  showAlert(al, 'success', '✅ Profile updated successfully!');
  showToast('Profile saved!');
  setTimeout(() => hideAlert(al), 3500);
}

// ── UTILITIES ──────────────────────────────
function showAlert(el, type, msg) {
  el.textContent = msg;
  el.className   = 'alert-box ' + type;
  el.classList.remove('hidden');
}
function hideAlert(el) { el.classList.add('hidden'); }

function showToast(msg) {
  const toast = document.getElementById('toast');
  document.getElementById('toastMsg').textContent = msg;
  toast.classList.remove('hidden');
  clearTimeout(window._tt);
  window._tt = setTimeout(() => toast.classList.add('hidden'), 3500);
}

function statusLabel(s) {
  if (s === 'in-progress') return 'In Progress';
  if (s === 'completed')   return 'Completed';
  return s.charAt(0).toUpperCase() + s.slice(1);
}
function formatDate(iso) {
  return new Date(iso).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
}
function formatDateFull(iso) {
  return new Date(iso).toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function timeAgo(iso) {
  const m = Math.floor((Date.now() - new Date(iso)) / 60000);
  if (m < 1)  return 'Just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hr${h>1?'s':''} ago`;
  const d = Math.floor(h / 24);
  return `${d} day${d>1?'s':''} ago`;
}

// ── KEYBOARD / OUTSIDE CLICK ───────────────
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { closeModal(); closeEmergency(); closeTermsModal(); }
});
document.addEventListener('click', e => {
  const sidebar = document.getElementById('sidebar');
  if (sidebar && window.innerWidth <= 768 && sidebar.classList.contains('open'))
    if (!sidebar.contains(e.target) && !e.target.closest('.menu-toggle'))
      sidebar.classList.remove('open');
});

/* ═══════════════════════════════════════════════════════════
   LIVE MAP — OpenStreetMap via Leaflet (no API key needed)
   Centered on Barangay Sta. Rita, Olongapo City
═══════════════════════════════════════════════════════════ */

// Sta. Rita, Olongapo City center coordinates
const STARITA_LAT = 14.8445;
const STARITA_LNG = 120.2842;

let _liveMap       = null;
let _liveMarkers   = [];
let _pickerMap     = null;
let _pickerMarker  = null;
let _pickerLat     = null;
let _pickerLng     = null;

// ── Severity → color ─────────────────────────
function sevToColor(sev) {
  return sev === 'critical' ? '#ff4444'
       : sev === 'high'     ? '#ff8c00'
       : sev === 'medium'   ? '#ffc107'
       :                      '#00e676';
}

function makeCircleIcon(color) {
  return L.divIcon({
    className: '',
    html: `<div style="
      width:16px;height:16px;border-radius:50%;
      background:${color};border:2px solid #fff;
      box-shadow:0 0 8px ${color}88;
    "></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });
}

// ── LIVE MAP (page-livemap) ───────────────────
function initLiveMap() {
  const container = document.getElementById('liveMapContainer');
  if (!container) return;

  if (_liveMap) {
    _liveMap.invalidateSize();
    refreshLiveMapMarkers('all');
    return;
  }

  _liveMap = L.map('liveMapContainer', { zoomControl: true, attributionControl: true })
    .setView([STARITA_LAT, STARITA_LNG], 15);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© <a href="https://openstreetmap.org">OpenStreetMap</a> contributors',
    maxZoom: 19,
  }).addTo(_liveMap);

  // Barangay boundary marker
  L.marker([STARITA_LAT, STARITA_LNG], {
    icon: L.divIcon({
      className: '',
      html: `<div style="
        background:#2e7d32;color:#fff;padding:4px 10px;border-radius:20px;
        font-family:sans-serif;font-size:11px;font-weight:700;white-space:nowrap;
        border:2px solid #fff;box-shadow:0 2px 10px rgba(0,0,0,0.3)
      ">📍 Brgy. Sta. Rita</div>`,
      iconAnchor: [60, 12],
    })
  }).addTo(_liveMap);

  refreshLiveMapMarkers('all');
  _liveMap.on('click', () => {});
}

function refreshLiveMapMarkers(statusFilter) {
  if (!_liveMap) return;

  // Clear old markers
  _liveMarkers.forEach(m => _liveMap.removeLayer(m));
  _liveMarkers = [];

  const shared = getSharedReports();
  const all    = [...reports, ...shared.filter(r => r.residentEmail !== (currentUser?.email || ''))];
  const unique = Object.values(
    all.reduce((acc, r) => { acc[r.id] = r; return acc; }, {})
  );

  let total = 0, pending = 0, inProg = 0, resolved = 0;
  unique.forEach(r => {
    total++;
    if (r.status === 'pending')     pending++;
    if (r.status === 'in-progress') inProg++;
    if (r.status === 'resolved' || r.status === 'completed') resolved++;

    if (statusFilter !== 'all' && r.status !== statusFilter) return;

    // Use stored coords or generate realistic offset from center
    let lat = r.lat, lng = r.lng;
    if (!lat || !lng) {
      // Deterministic offset based on report id so markers are stable
      const seed = (r.id || 1001) * 7919;
      lat = STARITA_LAT + ((seed % 200) - 100) * 0.00006;
      lng = STARITA_LNG + ((Math.floor(seed / 200) % 200) - 100) * 0.00008;
    }

    const color  = sevToColor(r.severity || 'low');
    const marker = L.marker([lat, lng], { icon: makeCircleIcon(color) });

    const sDate = r.date ? new Date(r.date).toLocaleDateString('en-PH', { month:'short', day:'numeric', year:'numeric' }) : '—';
    const statusLabel = r.status === 'in-progress' ? 'In Progress'
                      : r.status ? (r.status.charAt(0).toUpperCase() + r.status.slice(1)) : 'Pending';
    const isMine = r.residentEmail === (currentUser?.email || '');

    marker.bindPopup(`
      <div style="font-family:sans-serif;min-width:200px">
        <div style="font-weight:700;font-size:13px;margin-bottom:6px;color:#1a2e1a">
          ${r.type || 'Incident'}
          ${isMine ? '<span style="background:#2e7d32;color:#fff;font-size:9px;padding:2px 6px;border-radius:10px;margin-left:4px">MY REPORT</span>' : ''}
        </div>
        <div style="font-size:11px;color:#555;margin-bottom:4px">📍 ${r.location || 'Sta. Rita'}</div>
        <div style="font-size:11px;color:#555;margin-bottom:4px">📅 ${sDate}</div>
        <div style="display:flex;gap:6px;align-items:center;margin-top:6px">
          <span style="background:${color};color:#fff;font-size:10px;padding:2px 8px;border-radius:10px;font-weight:700">
            ${(r.severity || 'low').toUpperCase()}
          </span>
          <span style="font-size:10px;color:#777">${statusLabel}</span>
        </div>
        ${r.desc ? `<div style="font-size:11px;color:#666;margin-top:6px;border-top:1px solid #eee;padding-top:6px">${r.desc.slice(0,100)}${r.desc.length > 100 ? '…' : ''}</div>` : ''}
      </div>`, { maxWidth: 260 });

    marker.addTo(_liveMap);
    _liveMarkers.push(marker);
  });

  // Update live stats
  const t = document.getElementById('lmsTotal');
  const p = document.getElementById('lmsPending');
  const i = document.getElementById('lmsInProg');
  const rv = document.getElementById('lmsResolved');
  if (t)  t.textContent  = total;
  if (p)  p.textContent  = pending;
  if (i)  i.textContent  = inProg;
  if (rv) rv.textContent = resolved;
}

function filterMapMarkers(status, btn) {
  document.querySelectorAll('.map-filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  refreshLiveMapMarkers(status);
}

function centerMapOnMe() {
  if (!navigator.geolocation) { showToast('Geolocation not supported by your browser.'); return; }
  navigator.geolocation.getCurrentPosition(pos => {
    _liveMap?.setView([pos.coords.latitude, pos.coords.longitude], 17);
    showToast('📍 Map centered on your location.');
  }, () => {
    _liveMap?.setView([STARITA_LAT, STARITA_LNG], 15);
    showToast('Could not get your location. Showing Sta. Rita center.');
  });
}

// ── REPORT MAP PICKER (page-report) ──────────
function initReportMapPicker() {
  const container = document.getElementById('reportMapPicker');
  if (!container || _pickerMap) {
    _pickerMap?.invalidateSize();
    return;
  }

  _pickerMap = L.map('reportMapPicker', { zoomControl: true })
    .setView([STARITA_LAT, STARITA_LNG], 15);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors',
    maxZoom: 19,
  }).addTo(_pickerMap);

  // Center marker
  L.marker([STARITA_LAT, STARITA_LNG], {
    icon: L.divIcon({
      className: '',
      html: `<div style="background:#2e7d32;color:#fff;padding:3px 9px;border-radius:20px;font-size:10px;font-weight:700;border:2px solid #fff;white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,0.25)">📍 Brgy. Sta. Rita</div>`,
      iconAnchor: [55, 10],
    })
  }).addTo(_pickerMap);

  _pickerMap.on('click', e => {
    _pickerLat = e.latlng.lat;
    _pickerLng = e.latlng.lng;

    if (_pickerMarker) _pickerMap.removeLayer(_pickerMarker);
    _pickerMarker = L.marker([_pickerLat, _pickerLng], {
      icon: L.divIcon({
        className: '',
        html: `<div style="width:20px;height:20px;border-radius:50%;background:#ff4444;border:3px solid #fff;box-shadow:0 0 10px #ff444488"></div>`,
        iconSize: [20, 20], iconAnchor: [10, 10],
      })
    }).addTo(_pickerMap);

    // Reverse geocode with Nominatim (free, no API key)
    const coordText = `${_pickerLat.toFixed(5)}, ${_pickerLng.toFixed(5)}`;
    const coordEl   = document.getElementById('mapCoords');
    if (coordEl) coordEl.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Resolving address…`;

    fetch(`https://nominatim.openstreetmap.org/reverse?lat=${_pickerLat}&lon=${_pickerLng}&format=json`)
      .then(r => r.json())
      .then(data => {
        const addr = data.display_name || coordText;
        const shortAddr = addr.split(',').slice(0, 4).join(', ');
        if (coordEl) coordEl.innerHTML = `<i class="fas fa-map-pin" style="color:var(--blue-vivid)"></i> ${shortAddr}`;
        const locInput = document.getElementById('incidentLocation');
        if (locInput && !locInput.value) locInput.value = shortAddr;
      })
      .catch(() => {
        if (coordEl) coordEl.innerHTML = `<i class="fas fa-map-pin" style="color:var(--blue-vivid)"></i> ${coordText}`;
      });

    showToast('📍 Location pinned! Fill in more details if needed.');
  });
}

function getGPS() {
  if (!navigator.geolocation) { showToast('Geolocation not supported.'); return; }
  showToast('📡 Getting your GPS location…');
  navigator.geolocation.getCurrentPosition(pos => {
    const lat = pos.coords.latitude;
    const lng = pos.coords.longitude;
    _pickerLat = lat;
    _pickerLng = lng;

    if (_pickerMap) {
      _pickerMap.setView([lat, lng], 17);
      if (_pickerMarker) _pickerMap.removeLayer(_pickerMarker);
      _pickerMarker = L.marker([lat, lng], {
        icon: L.divIcon({
          className: '',
          html: `<div style="width:20px;height:20px;border-radius:50%;background:#0d6efd;border:3px solid #fff;box-shadow:0 0 10px #0d6efd88"></div>`,
          iconSize: [20,20], iconAnchor: [10,10],
        })
      }).addTo(_pickerMap);
    }

    const coordEl = document.getElementById('mapCoords');
    if (coordEl) coordEl.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Resolving your address…`;

    fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`)
      .then(r => r.json())
      .then(data => {
        const addr = data.display_name || `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
        const shortAddr = addr.split(',').slice(0, 4).join(', ');
        if (coordEl) coordEl.innerHTML = `<i class="fas fa-crosshairs" style="color:#0d6efd"></i> Your location: ${shortAddr}`;
        const locInput = document.getElementById('incidentLocation');
        if (locInput) locInput.value = shortAddr;
        showToast('✅ GPS location captured!');
      })
      .catch(() => {
        if (coordEl) coordEl.innerHTML = `<i class="fas fa-crosshairs"></i> GPS: ${lat.toFixed(5)}, ${lng.toFixed(5)}`;
        showToast('✅ GPS location captured!');
      });
  }, err => {
    showToast('Could not get GPS location. Please pin on the map manually.');
  }, { enableHighAccuracy: true, timeout: 8000 });
}

// Store lat/lng with submitted report
const _origSubmitReport = submitReport;
function submitReport() {
  // Inject pinned coords before calling original submit
  if (_pickerLat && _pickerLng) {
    window._pendingLat = _pickerLat;
    window._pendingLng = _pickerLng;
  }
  _origSubmitReport();
}

// Patch reports to include lat/lng when coords are available
const _origSubmitReportInternal = window.submitReport;

// Override the reports push to include coords
const __realSubmit = submitReport;
