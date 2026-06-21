/**
 * profile.js — SolarEdge Pro | Profile Modal + Image Cropper
 * Depends on: auth.js (loaded before this file)
 *
 * Works with the existing HTML structure in index.html.
 * Tab names:  info / sec / prefs
 * Panel IDs:  pm-panel-info / pm-panel-sec / pm-panel-prefs
 */

/* ============================================================
   PUBLIC API
============================================================ */
function openProfileModal() {
  const overlay = document.getElementById('profile-overlay');
  if (!overlay) return;
  _pmLoadData();
  syncAvatarUI();
  overlay.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  _pmSwitchTab('info');
}

function closeProfileModal() {
  const overlay = document.getElementById('profile-overlay');
  if (!overlay) return;
  overlay.classList.add('hidden');
  document.body.style.overflow = '';
}

/* ============================================================
   INTERNAL: load saved data into form fields
============================================================ */
function _pmLoadData() {
  const user = getUser();

  // Header
  const hName = document.getElementById('pm-header-name');
  const hRole = document.getElementById('pm-header-role');
  if (hName) hName.textContent = user.name  || 'ผู้ใช้งาน';
  if (hRole) hRole.textContent = user.role  || '';

  // Tab 1 — personal
  const fName  = document.getElementById('pm-name');
  const fEmail = document.getElementById('pm-email');
  const fPhone = document.getElementById('pm-phone');
  const fRole  = document.getElementById('pm-role');
  if (fName)  fName.value  = user.name  || '';
  if (fEmail) fEmail.value = user.email || '';
  if (fPhone) fPhone.value = user.phone || '';
  if (fRole)  fRole.value  = user.role  || '';

  // Avatar display
  _pmRenderModalAvatar();

  // Tab 3 — dark mode
  const dmToggle = document.getElementById('pm-dark-mode');
  if (dmToggle) {
    dmToggle.checked = document.documentElement.getAttribute('data-theme') !== 'light';
  }

  // Notification prefs
  const prefs = _pmGetNotifPrefs();
  const elEmail = document.getElementById('pm-notify-email');
  const elSms   = document.getElementById('pm-notify-sms');
  const elPush  = document.getElementById('pm-notify-push');
  if (elEmail) elEmail.checked = prefs.email;
  if (elSms)   elSms.checked   = prefs.sms;
  if (elPush)  elPush.checked  = prefs.push;
}

function _pmRenderModalAvatar() {
  const el  = document.getElementById('pm-avatar-display');
  if (!el) return;
  const url  = getAvatar();
  const user = getUser();
  if (url) {
    el.style.backgroundImage    = `url('${url}')`;
    el.style.backgroundSize     = 'cover';
    el.style.backgroundPosition = 'center';
    el.textContent = '';
  } else {
    el.style.backgroundImage = '';
    el.textContent = getInitials(user.name);
  }
}

function _pmGetNotifPrefs() {
  try {
    const raw = localStorage.getItem('solar_notif_prefs');
    return raw ? JSON.parse(raw) : { email: true, sms: false, push: true };
  } catch { return { email: true, sms: false, push: true }; }
}

/* ============================================================
   TAB SWITCHING
============================================================ */
function _pmSwitchTab(tabName) {
  // Buttons use data-tab="info"|"sec"|"prefs"
  document.querySelectorAll('.pm-tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabName);
  });
  // Panels use id="pm-panel-info|sec|prefs"
  document.querySelectorAll('.pm-panel').forEach(panel => {
    const panelTab = panel.id.replace('pm-panel-', '');
    panel.classList.toggle('active', panelTab === tabName);
  });
}

/* ============================================================
   PERSONAL INFO SAVE
============================================================ */
function _pmSavePersonal() {
  const name  = (document.getElementById('pm-name')?.value  || '').trim();
  const phone = (document.getElementById('pm-phone')?.value || '').trim();

  if (!name) {
    _pmShowToast('pm-toast-info', 'กรุณากรอกชื่อ', 'error');
    return;
  }

  const user = getUser();
  user.name  = name;
  user.phone = phone;
  saveUser(user);

  const hName = document.getElementById('pm-header-name');
  if (hName) hName.textContent = name;

  syncAvatarUI();
  _pmRenderModalAvatar();
  _pmShowToast('pm-toast-info', '✅ บันทึกข้อมูลสำเร็จ', 'success');
}

/* ============================================================
   CHANGE PASSWORD
============================================================ */
function _pmSavePassword() {
  const oldPw  = document.getElementById('pm-current-password')?.value || '';
  const newPw  = document.getElementById('pm-new-password')?.value     || '';
  const confPw = document.getElementById('pm-confirm-password')?.value  || '';

  // Demo: fixed password is Solar@1234
  if (oldPw !== 'Solar@1234') {
    _pmShowToast('pm-toast-sec', 'รหัสผ่านเดิมไม่ถูกต้อง', 'error');
    return;
  }
  if (newPw.length < 8) {
    _pmShowToast('pm-toast-sec', 'รหัสผ่านใหม่ต้องมีอย่างน้อย 8 ตัวอักษร', 'error');
    return;
  }
  if (newPw !== confPw) {
    _pmShowToast('pm-toast-sec', 'รหัสผ่านใหม่ไม่ตรงกัน', 'error');
    return;
  }

  document.getElementById('pm-current-password').value = '';
  document.getElementById('pm-new-password').value     = '';
  document.getElementById('pm-confirm-password').value  = '';
  _pmUpdateStrength('');
  _pmShowToast('pm-toast-sec', '✅ เปลี่ยนรหัสผ่านสำเร็จ', 'success');
}

/* ── Password strength meter ─────────────────────────────── */
function _pmUpdateStrength(pw) {
  const fill  = document.getElementById('pw-strength-fill');
  const label = document.getElementById('pw-strength-label');
  if (!fill || !label) return;

  let score = 0;
  if (pw.length >= 8)           score++;
  if (/[A-Z]/.test(pw))        score++;
  if (/[0-9]/.test(pw))        score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;

  const levels = [
    { pct: '0%',   color: 'transparent', text: '' },
    { pct: '25%',  color: '#e74c3c',     text: 'อ่อนมาก' },
    { pct: '50%',  color: '#e67e22',     text: 'อ่อน' },
    { pct: '75%',  color: '#f1c40f',     text: 'ปานกลาง' },
    { pct: '100%', color: '#27ae60',     text: 'แข็งแกร่ง' },
  ];

  const lvl = pw.length === 0 ? levels[0] : (levels[score] || levels[1]);
  fill.style.width      = lvl.pct;
  fill.style.background = lvl.color;
  label.textContent     = lvl.text;
}

/* ── Password show/hide ──────────────────────────────────── */
function _pmBindPwEyes() {
  document.querySelectorAll('.pm-pw-eye').forEach(btn => {
    btn.addEventListener('click', () => {
      const input = btn.previousElementSibling;
      if (!input) return;
      const isText = input.type === 'text';
      input.type   = isText ? 'password' : 'text';
      btn.textContent = isText ? '👁' : '🙈';
    });
  });
}

/* ============================================================
   SETTINGS SAVE
============================================================ */
function _pmSaveSettings() {
  const prefs = {
    email: document.getElementById('pm-notify-email')?.checked ?? true,
    sms:   document.getElementById('pm-notify-sms')?.checked   ?? false,
    push:  document.getElementById('pm-notify-push')?.checked  ?? true,
  };
  localStorage.setItem('solar_notif_prefs', JSON.stringify(prefs));

  // Sync dark mode from toggle
  const dmOn = document.getElementById('pm-dark-mode')?.checked ?? true;
  document.documentElement.setAttribute('data-theme', dmOn ? 'dark' : 'light');
  localStorage.setItem('solar_theme', dmOn ? 'dark' : 'light');

  _pmShowToast('pm-toast-prefs', '✅ บันทึกการตั้งค่าสำเร็จ', 'success');
}

/* ============================================================
   TOAST HELPER — creates toast element if it doesn't exist
============================================================ */
function _pmShowToast(id, msg, type) {
  let el = document.getElementById(id);
  if (!el) {
    // Find nearest panel button save and append after it
    el = document.createElement('div');
    el.id = id;
    el.className = 'pm-toast';
    // Try to append inside pm-body if panel not found
    const body = document.querySelector('.pm-body');
    if (body) body.appendChild(el);
  }
  el.textContent = msg;
  el.className = `pm-toast ${type} show`;
  clearTimeout(el._timer);
  el._timer = setTimeout(() => el.classList.remove('show'), 3500);
}

/* ============================================================
   IMAGE CROPPER
============================================================ */
const _cropState = {
  img:      null,
  x:        0,
  y:        0,
  scale:    1,
  minScale: 0.5,
  maxScale: 4,
  dragging: false,
  lastX:    0,
  lastY:    0,
  canvas:   null,
  ctx:      null,
  size:     360,
  pinchDist: 0,
};

function _openCropper(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      _cropState.img = img;

      const overlay = document.getElementById('cropper-overlay');
      if (overlay) overlay.classList.remove('hidden');

      const canvas = document.getElementById('cropper-canvas');
      if (!canvas) return;

      _cropState.canvas = canvas;
      _cropState.ctx    = canvas.getContext('2d');

      const dpr  = window.devicePixelRatio || 1;
      const size = Math.min(360, window.innerWidth - 40);
      canvas.style.width  = size + 'px';
      canvas.style.height = size + 'px';
      canvas.width  = size * dpr;
      canvas.height = size * dpr;
      _cropState.ctx.scale(dpr, dpr);
      _cropState.size = size;

      const fitScale = Math.max(size / img.width, size / img.height);
      _cropState.scale    = fitScale;
      _cropState.minScale = fitScale * 0.8;
      _cropState.x = (size - img.width  * fitScale) / 2;
      _cropState.y = (size - img.height * fitScale) / 2;

      const slider = document.getElementById('crop-zoom');
      if (slider) {
        slider.min   = String(_cropState.minScale);
        slider.max   = String(_cropState.maxScale);
        slider.step  = '0.01';
        slider.value = String(fitScale);
      }

      _cropDraw();
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function _closeCropper() {
  const overlay = document.getElementById('cropper-overlay');
  if (overlay) overlay.classList.add('hidden');
  _cropState.img = null;
}

function _cropDraw() {
  const { ctx, img, x, y, scale, size } = _cropState;
  if (!ctx || !img) return;

  ctx.clearRect(0, 0, size, size);
  ctx.drawImage(img, x, y, img.width * scale, img.height * scale);

  // Darken outside circle
  const cx = size / 2, cy = size / 2, r = size * 0.44;
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.beginPath();
  ctx.rect(0, 0, size, size);
  ctx.arc(cx, cy, r, 0, Math.PI * 2, true); // counter-clockwise = "hole"
  ctx.fill('evenodd');
  ctx.restore();

  // Re-draw image inside circle on top
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  ctx.drawImage(img, x, y, img.width * scale, img.height * scale);
  ctx.restore();

  // Dashed circle guide
  ctx.save();
  ctx.setLineDash([6, 4]);
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function _cropCommit() {
  const { img, x, y, scale, size } = _cropState;
  if (!img) return;

  const r  = size * 0.44;
  const cx = size / 2, cy = size / 2;

  const out = document.createElement('canvas');
  const d   = Math.round(r * 2);
  out.width  = d;
  out.height = d;
  const octx = out.getContext('2d');

  octx.save();
  octx.beginPath();
  octx.arc(r, r, r, 0, Math.PI * 2);
  octx.clip();
  octx.drawImage(img, x - (cx - r), y - (cy - r), img.width * scale, img.height * scale);
  octx.restore();

  const dataURL = out.toDataURL('image/png');
  saveAvatar(dataURL);
  _pmRenderModalAvatar();
  syncAvatarUI();
  _closeCropper();
}

function _cropReset() {
  const { img, size } = _cropState;
  if (!img) return;
  const fitScale = Math.max(size / img.width, size / img.height);
  _cropState.scale = fitScale;
  _cropState.x = (size - img.width  * fitScale) / 2;
  _cropState.y = (size - img.height * fitScale) / 2;
  const slider = document.getElementById('crop-zoom');
  if (slider) slider.value = String(fitScale);
  _cropDraw();
}

function _cropZoom(newScale) {
  newScale = Math.min(_cropState.maxScale, Math.max(_cropState.minScale, newScale));
  const cx = _cropState.size / 2, cy = _cropState.size / 2;
  const ratio = newScale / _cropState.scale;
  _cropState.x = cx + (_cropState.x - cx) * ratio;
  _cropState.y = cy + (_cropState.y - cy) * ratio;
  _cropState.scale = newScale;
  const slider = document.getElementById('crop-zoom');
  if (slider) slider.value = String(newScale);
  _cropDraw();
}

function _cropGetPoint(e) {
  if (e.touches && e.touches.length > 0) {
    const rect = _cropState.canvas.getBoundingClientRect();
    return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
  }
  return { x: e.offsetX, y: e.offsetY };
}

function _cropPinchDist(touches) {
  const dx = touches[0].clientX - touches[1].clientX;
  const dy = touches[0].clientY - touches[1].clientY;
  return Math.hypot(dx, dy);
}

function _cropPointerDown(e) {
  e.preventDefault();
  if (e.touches && e.touches.length === 2) {
    _cropState.pinchDist = _cropPinchDist(e.touches);
    _cropState.dragging  = false;
    return;
  }
  _cropState.dragging = true;
  const pt = _cropGetPoint(e);
  _cropState.lastX = pt.x;
  _cropState.lastY = pt.y;
}

function _cropPointerMove(e) {
  e.preventDefault();
  if (e.touches && e.touches.length === 2) {
    const d = _cropPinchDist(e.touches);
    if (_cropState.pinchDist > 0) _cropZoom(_cropState.scale * (d / _cropState.pinchDist));
    _cropState.pinchDist = d;
    return;
  }
  if (!_cropState.dragging) return;
  const pt = _cropGetPoint(e);
  _cropState.x += pt.x - _cropState.lastX;
  _cropState.y += pt.y - _cropState.lastY;
  _cropState.lastX = pt.x;
  _cropState.lastY = pt.y;
  _cropDraw();
}

function _cropPointerUp() {
  _cropState.dragging  = false;
  _cropState.pinchDist = 0;
}

/* ============================================================
   INIT — bind all events on DOMContentLoaded
============================================================ */
document.addEventListener('DOMContentLoaded', () => {

  // ── Profile overlay backdrop click ──
  document.getElementById('profile-overlay')?.addEventListener('click', (e) => {
    if (e.target.id === 'profile-overlay') closeProfileModal();
  });

  // ── Tab switching ──
  document.querySelectorAll('.pm-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => _pmSwitchTab(btn.dataset.tab));
  });

  // ── Avatar: clicking avatar display OR avatar-btn ──
  const avatarDisplay = document.getElementById('pm-avatar-display');
  const avatarBtn     = document.getElementById('pm-avatar-btn');
  const fileInput     = document.getElementById('avatar-file-input');

  [avatarDisplay, avatarBtn].forEach(el => {
    el?.addEventListener('click', () => fileInput?.click());
  });

  fileInput?.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (file && file.type.startsWith('image/')) {
      _openCropper(file);
    }
    e.target.value = '';
  });

  // ── Personal save ──
  document.getElementById('pm-save-info')?.addEventListener('click', _pmSavePersonal);

  // ── Password: strength meter ──
  document.getElementById('pm-new-password')?.addEventListener('input', (e) => {
    _pmUpdateStrength(e.target.value);
  });

  // ── Password: save ──
  document.getElementById('pm-save-password')?.addEventListener('click', _pmSavePassword);

  // ── Password eye toggles ──
  _pmBindPwEyes();

  // ── Settings save ──
  document.getElementById('pm-save-settings')?.addEventListener('click', _pmSaveSettings);

  // ── Logout ──
  document.getElementById('pm-logout-btn')?.addEventListener('click', () => {
    if (typeof logout === 'function') logout();
  });

  // ── Cropper canvas events ──
  const canvas = document.getElementById('cropper-canvas');
  if (canvas) {
    canvas.addEventListener('mousedown',  _cropPointerDown);
    canvas.addEventListener('mousemove',  _cropPointerMove);
    canvas.addEventListener('mouseup',    _cropPointerUp);
    canvas.addEventListener('mouseleave', _cropPointerUp);
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      _cropZoom(_cropState.scale * (e.deltaY < 0 ? 1.08 : 0.93));
    }, { passive: false });
    canvas.addEventListener('touchstart', _cropPointerDown, { passive: false });
    canvas.addEventListener('touchmove',  _cropPointerMove, { passive: false });
    canvas.addEventListener('touchend',   _cropPointerUp);
  }

  document.getElementById('crop-zoom')?.addEventListener('input', (e) => {
    _cropZoom(parseFloat(e.target.value));
  });

  document.getElementById('crop-reset')?.addEventListener('click', _cropReset);
  document.getElementById('crop-cancel')?.addEventListener('click', _closeCropper);
  document.getElementById('crop-do')?.addEventListener('click', _cropCommit);

  // Close button in cropper header
  document.getElementById('crop-close')?.addEventListener('click', _closeCropper);

  // ── Cropper overlay backdrop ──
  document.getElementById('cropper-overlay')?.addEventListener('click', (e) => {
    if (e.target.id === 'cropper-overlay') _closeCropper();
  });

  // ── Sync avatar in header on page load ──
  syncAvatarUI();
});
