/* ═══════════════════════════════════════════════
   SolarEdge Pro — Control Module
   Solar Tracker + Auto Wash System
═══════════════════════════════════════════════ */
'use strict';

// ──────────────────────────────────────
// SOLAR TRACKER CONFIGURATION
// ──────────────────────────────────────
const SOLAR_CFG = {
  lat: 13.7563,   // Bangkok latitude °N
  lon: 100.5018,  // Bangkok longitude °E
  tz:  7,         // UTC+7
  enabled: true,
};

const WASH_STATE = {
  autoMode:    true,
  isWashing:   false,
  scheduleTime:'06:00',
  duration:    15,
  zones:       ['A', 'B', 'C'],
  currentZoneIdx: 0,
  progress:    0,
  washTimer:   null,
  dropInterval:null,
  logs: [
    { icon:'✅', task:'ล้างแผงทั้งหมด', detail:'Zone A, B, C — ใช้เวลา 45 นาที', time:'10 มิ.ย. 06:05', result:'สำเร็จ' },
    { icon:'✅', task:'ล้างแผงทั้งหมด', detail:'Zone A, B, C — ใช้เวลา 48 นาที', time:'20 พ.ค. 06:02', result:'สำเร็จ' },
    { icon:'⚠️', task:'ล้างเฉพาะ Zone A', detail:'แรงดันน้ำต่ำ หยุดกลางคัน', time:'1 พ.ค. 06:00',  result:'บางส่วน' },
  ],
};

let trackerAnimFrame = null;
let prevElevation = null;
let prevAzimuth   = null;

// ──────────────────────────────────────
// INIT
// ──────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initControlModule();
});

function initControlModule() {
  renderWashLog();
  initWashDirtyOverlay();
  bindControlEvents();
  // Start tracker update loop
  updateTrackerAndDraw();
  setInterval(updateTrackerAndDraw, 2000);
}

function bindControlEvents() {
  // Tracker toggle
  const trackerToggle = document.getElementById('tracker-enabled');
  if (trackerToggle) {
    trackerToggle.addEventListener('change', () => {
      SOLAR_CFG.enabled = trackerToggle.checked;
      const label = document.getElementById('tracker-state-label');
      if (label) label.textContent = SOLAR_CFG.enabled ? 'เปิดใช้งาน' : 'ปิดระบบ';
      const modeEl = document.getElementById('tracker-mode-status');
      if (modeEl) modeEl.textContent = SOLAR_CFG.enabled ? 'อัตโนมัติ' : 'ปิด';
      showToast(SOLAR_CFG.enabled ? '☀️ เปิดระบบ Solar Tracker แล้ว' : '⏹ ปิดระบบ Solar Tracker');
    });
  }

  // Wash auto toggle
  const washToggle = document.getElementById('wash-auto-toggle');
  if (washToggle) {
    washToggle.addEventListener('change', () => {
      WASH_STATE.autoMode = washToggle.checked;
      showToast(WASH_STATE.autoMode ? '🤖 เปิดโหมดล้างอัตโนมัติ' : '🖐 เปลี่ยนเป็นโหมดด้วยมือ');
    });
  }
}

// ══════════════════════════════════════════
// SOLAR POSITION ALGORITHM
// ══════════════════════════════════════════
function getSolarPosition(date) {
  const dayOfYear = Math.floor(
    (date - new Date(date.getFullYear(), 0, 0)) / 86400000
  );

  // Declination angle (degrees)
  const decl = -23.45 * Math.cos((360 / 365) * (dayOfYear + 10) * Math.PI / 180);
  const declRad = decl * Math.PI / 180;

  // Hour angle — solar noon = 12:00
  const localHour = date.getHours() + date.getMinutes() / 60 + date.getSeconds() / 3600;
  // Equation of time correction (simple)
  const B = (360 / 365) * (dayOfYear - 81) * Math.PI / 180;
  const eot = 9.87 * Math.sin(2 * B) - 7.53 * Math.cos(B) - 1.5 * Math.sin(B); // minutes
  const solarNoon = 12 - (SOLAR_CFG.lon - SOLAR_CFG.tz * 15) / 15 - eot / 60;
  const hourAngle = (localHour - solarNoon) * 15 * Math.PI / 180; // radians

  const latRad = SOLAR_CFG.lat * Math.PI / 180;

  // Elevation (altitude)
  const sinElev = Math.sin(latRad) * Math.sin(declRad) +
                  Math.cos(latRad) * Math.cos(declRad) * Math.cos(hourAngle);
  const elevation = Math.asin(Math.max(-1, Math.min(1, sinElev))) * 180 / Math.PI;

  // Azimuth
  const cosAz = (Math.sin(declRad) - Math.sin(elevation * Math.PI / 180) * Math.sin(latRad)) /
                (Math.cos(elevation * Math.PI / 180) * Math.cos(latRad));
  let azimuth = Math.acos(Math.max(-1, Math.min(1, cosAz))) * 180 / Math.PI;
  if (hourAngle > 0) azimuth = 360 - azimuth;

  // Sunrise / Sunset (cos hour angle when elev = 0)
  const cosHaSunrise = -Math.tan(latRad) * Math.tan(declRad);
  const clampedCos   = Math.max(-1, Math.min(1, cosHaSunrise));
  const haSunrise    = Math.acos(clampedCos) * 180 / Math.PI;
  const sunriseHour  = solarNoon - haSunrise / 15;
  const sunsetHour   = solarNoon + haSunrise / 15;

  // Irradiance (simplified)
  const irradiance = elevation > 0
    ? Math.round(1361 * Math.sin(elevation * Math.PI / 180) * 0.75)
    : 0;

  // Panel optimal tilt = elevation (track the sun)
  const panelTilt    = Math.max(0, elevation);
  const panelAzimuth = elevation > 0 ? azimuth : 180;

  return {
    elevation,
    azimuth,
    panelTilt,
    panelAzimuth,
    irradiance,
    isDaytime: elevation > 0,
    sunriseHour,
    sunsetHour,
    solarNoon,
    dayLength: (sunsetHour - sunriseHour),
  };
}

function hourToTimeStr(h) {
  if (isNaN(h) || h < 0 || h > 24) return '--:--';
  const hh = Math.floor(h);
  const mm = Math.floor((h - hh) * 60);
  return `${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}`;
}

function azimuthToCardinal(az) {
  const dirs = ['เหนือ','ตะวันออกเฉียงเหนือ','ตะวันออก','ตะวันออกเฉียงใต้',
                'ใต้','ตะวันตกเฉียงใต้','ตะวันตก','ตะวันตกเฉียงเหนือ'];
  const idx = Math.round(az / 45) % 8;
  return dirs[idx];
}

// ══════════════════════════════════════════
// TRACKER UI UPDATE
// ══════════════════════════════════════════
function updateTrackerAndDraw() {
  const now = new Date();
  const sun = getSolarPosition(now);

  // Update angle displays
  setTextSafe('elev-angle-val',    sun.elevation.toFixed(1) + '°');
  setTextSafe('panel-tilt-val',    sun.panelTilt.toFixed(1) + '°');
  setTextSafe('sunrise-val',       hourToTimeStr(sun.sunriseHour) + ' น.');
  setTextSafe('sunset-val',        hourToTimeStr(sun.sunsetHour) + ' น.');
  setTextSafe('azim-angle-val',    sun.azimuth.toFixed(1) + '°');
  setTextSafe('sun-direction-val', azimuthToCardinal(sun.azimuth));
  setTextSafe('irr-tracker-val',   sun.irradiance + ' W/m²');

  // Motor readouts
  if (SOLAR_CFG.enabled && sun.isDaytime) {
    setTextSafe('motor-x-angle', sun.panelTilt.toFixed(1) + '°');
    setTextSafe('motor-y-angle', sun.panelAzimuth.toFixed(1) + '°');
    setTextSafe('ldr-val',       Math.round(sun.irradiance * 1.3) + ' lx');
    setTextSafe('tracker-gain',  '+' + (12 + Math.round(sun.elevation * 0.1)) + '%');
  } else {
    setTextSafe('motor-x-angle', '10.0° (สำรอง)');
    setTextSafe('motor-y-angle', '180.0°');
    setTextSafe('ldr-val', sun.isDaytime ? '45 lx' : '0 lx');
    setTextSafe('tracker-gain', sun.isDaytime ? '+0%' : 'กลางคืน');
  }

  // Motor mode display
  const modeEl = document.getElementById('tracker-mode-status');
  if (modeEl) {
    modeEl.textContent = SOLAR_CFG.enabled
      ? (sun.isDaytime ? 'ติดตามดวงอาทิตย์' : 'รอรุ่งอรุณ')
      : 'ปิดระบบ';
    modeEl.className = 'motor-status ' + (SOLAR_CFG.enabled ? 'ok' : 'warn');
  }

  // Sun timeline
  updateSunTimeline(now, sun);

  // Draw canvases
  drawElevationCanvas(sun);
  drawAzimuthCanvas(sun);

  prevElevation = sun.elevation;
  prevAzimuth   = sun.azimuth;
}

// ──────────────────────────────────────
// SUN TIMELINE
// ──────────────────────────────────────
function updateSunTimeline(now, sun) {
  const { sunriseHour, sunsetHour } = sun;
  const localHour = now.getHours() + now.getMinutes() / 60;
  const dayLen = sunsetHour - sunriseHour;
  let pct = 0;
  if (localHour >= sunriseHour && localHour <= sunsetHour) {
    pct = ((localHour - sunriseHour) / dayLen) * 100;
  } else if (localHour > sunsetHour) {
    pct = 100;
  }

  const fill  = document.getElementById('sun-timeline-fill');
  const thumb = document.getElementById('sun-timeline-thumb');
  if (fill)  fill.style.width = pct + '%';
  if (thumb) thumb.style.left = Math.min(Math.max(pct, 2), 98) + '%';

  setTextSafe('tl-sunrise', hourToTimeStr(sunriseHour));
  setTextSafe('tl-sunset',  hourToTimeStr(sunsetHour));
}

// ══════════════════════════════════════════
// CANVAS: ELEVATION VIEW (Side view of sky)
// ══════════════════════════════════════════
function drawElevationCanvas(sun) {
  const canvas = document.getElementById('elevation-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const groundY = H - 44;
  const cx = W / 2;

  // ── Sky gradient ──
  const skyGrad = ctx.createLinearGradient(0, 0, 0, groundY);
  if (sun.isDaytime) {
    const t = Math.sin(sun.elevation * Math.PI / 180); // 0–1
    const r1 = Math.round(135 + t * 20);
    const g1 = Math.round(206 + t * 15);
    const b1 = Math.round(235);
    const r2 = Math.round(173 + t * 20);
    const g2 = Math.round(216 + t * 20);
    const b2 = 230;
    skyGrad.addColorStop(0, isDark ? '#0a1a2e' : `rgb(${r1},${g1},${b1})`);
    skyGrad.addColorStop(1, isDark ? '#152232' : `rgb(${r2},${g2},${b2})`);
  } else {
    skyGrad.addColorStop(0, isDark ? '#050d1a' : '#1a1a2e');
    skyGrad.addColorStop(1, isDark ? '#0a1428' : '#16213e');
  }
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, W, groundY);

  // ── Sun arc path ──
  const arcRadius = Math.min(cx, groundY) * 0.85;
  ctx.beginPath();
  ctx.setLineDash([5, 8]);
  ctx.strokeStyle = 'rgba(243,156,18,0.35)';
  ctx.lineWidth = 2;
  ctx.arc(cx, groundY, arcRadius, Math.PI, 0);
  ctx.stroke();
  ctx.setLineDash([]);

  // ── Current sun position on arc ──
  const elevFraction = Math.max(0, Math.min(1, sun.elevation / 90));
  // Map elevation 0°→90° to arc angle π→π/2
  const sunArcAngle = Math.PI - elevFraction * Math.PI;
  const sunX = cx + arcRadius * Math.cos(sunArcAngle);
  const sunY = groundY + arcRadius * Math.sin(sunArcAngle);

  if (sun.isDaytime) {
    // Glow
    const glow = ctx.createRadialGradient(sunX, sunY, 2, sunX, sunY, 28);
    glow.addColorStop(0,   'rgba(255,220,50,0.9)');
    glow.addColorStop(0.4, 'rgba(255,180,0,0.4)');
    glow.addColorStop(1,   'rgba(255,180,0,0)');
    ctx.beginPath();
    ctx.arc(sunX, sunY, 28, 0, Math.PI * 2);
    ctx.fillStyle = glow;
    ctx.fill();

    // Sun disk
    ctx.beginPath();
    ctx.arc(sunX, sunY, 14, 0, Math.PI * 2);
    ctx.fillStyle = '#FFD700';
    ctx.fill();
    ctx.strokeStyle = '#FFA500';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Sun rays
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const r1 = 17, r2 = 24;
      ctx.beginPath();
      ctx.moveTo(sunX + r1 * Math.cos(a), sunY + r1 * Math.sin(a));
      ctx.lineTo(sunX + r2 * Math.cos(a), sunY + r2 * Math.sin(a));
      ctx.strokeStyle = 'rgba(255,200,0,0.8)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  } else {
    // Moon / night
    ctx.beginPath();
    ctx.arc(sunX, sunY, 12, 0, Math.PI * 2);
    ctx.fillStyle = '#C8D6E5';
    ctx.fill();
  }

  // ── Ground ──
  const gndGrad = ctx.createLinearGradient(0, groundY, 0, H);
  gndGrad.addColorStop(0, isDark ? '#1B4332' : '#27AE60');
  gndGrad.addColorStop(1, isDark ? '#0D2818' : '#1E8449');
  ctx.fillStyle = gndGrad;
  ctx.fillRect(0, groundY, W, H - groundY);

  // ── Solar Panel silhouette ──
  drawPanelSilhouette(ctx, W, H, groundY, sun.panelTilt, sun.isDaytime);

  // ── Elevation angle arc indicator ──
  if (sun.isDaytime && sun.elevation > 2) {
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(243,156,18,0.7)';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    const indicatorR = 55;
    ctx.arc(cx - 140, groundY, indicatorR, Math.PI, Math.PI + (sun.elevation / 90) * (-Math.PI / 2));
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = '#F39C12';
    ctx.font = 'bold 11px "Noto Sans Thai", Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(sun.elevation.toFixed(1) + '°', cx - 140, groundY - indicatorR - 6);
  }

  // ── Horizon line ──
  ctx.beginPath();
  ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)';
  ctx.lineWidth = 1;
  ctx.moveTo(0, groundY);
  ctx.lineTo(W, groundY);
  ctx.stroke();

  // ── Labels ──
  ctx.fillStyle = isDark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.45)';
  ctx.font = '11px "Noto Sans Thai", Inter, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('ทิศตะวันออก (E)', 8, groundY - 6);
  ctx.textAlign = 'right';
  ctx.fillText('ทิศตะวันตก (W)', W - 8, groundY - 6);
  ctx.textAlign = 'center';
  ctx.fillText('90°', cx, 14);
}

function drawPanelSilhouette(ctx, W, H, groundY, tiltDeg, isDaytime) {
  const px = W / 2 + 100;  // panel center x
  const py = groundY - 8;  // panel base y
  const pw = 72, ph = 40;  // panel size
  const tiltRad = (tiltDeg * Math.PI / 180);

  ctx.save();
  ctx.translate(px, py);

  // Support pole
  ctx.strokeStyle = '#5D6D7E';
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, -20);
  ctx.stroke();

  // Rotate panel
  ctx.translate(0, -20);
  ctx.rotate(-tiltRad);

  // Panel body
  const panelGrad = ctx.createLinearGradient(-pw/2, -ph/2, pw/2, ph/2);
  if (isDaytime) {
    panelGrad.addColorStop(0, '#1A5276');
    panelGrad.addColorStop(0.5, '#2E86C1');
    panelGrad.addColorStop(1, '#1A5276');
  } else {
    panelGrad.addColorStop(0, '#2C3E50');
    panelGrad.addColorStop(1, '#1A252F');
  }

  ctx.fillStyle = panelGrad;
  ctx.strokeStyle = isDaytime ? '#5DADE2' : '#566573';
  ctx.lineWidth = 1.5;
  roundRect(ctx, -pw/2, -ph/2, pw, ph, 3);
  ctx.fill();
  ctx.stroke();

  // Cell grid
  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.lineWidth = 0.8;
  for (let i = 1; i < 4; i++) {
    ctx.beginPath();
    ctx.moveTo(-pw/2 + (pw/4)*i, -ph/2);
    ctx.lineTo(-pw/2 + (pw/4)*i, ph/2);
    ctx.stroke();
  }
  for (let j = 1; j < 2; j++) {
    ctx.beginPath();
    ctx.moveTo(-pw/2, -ph/2 + (ph/2)*j);
    ctx.lineTo(pw/2,  -ph/2 + (ph/2)*j);
    ctx.stroke();
  }

  // Angle arc on panel
  if (isDaytime && tiltDeg > 2) {
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(243,156,18,0.6)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([3, 3]);
    ctx.arc(0, ph/2, 20, Math.PI/2, Math.PI/2 + tiltRad);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  ctx.restore();

  // Label below panel
  ctx.fillStyle = isDaytime ? '#F39C12' : '#85929E';
  ctx.font = 'bold 10px "Noto Sans Thai", Inter, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('แผงโซล่า ' + tiltDeg.toFixed(0) + '°', px, groundY + 16);
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// ══════════════════════════════════════════
// CANVAS: AZIMUTH (Top-down compass)
// ══════════════════════════════════════════
function drawAzimuthCanvas(sun) {
  const canvas = document.getElementById('azimuth-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const cx = W / 2, cy = H / 2;
  const outerR = Math.min(cx, cy) - 12;

  // ── Background circle ──
  const bgGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, outerR);
  bgGrad.addColorStop(0, isDark ? '#1A2E44' : '#EBF5FB');
  bgGrad.addColorStop(1, isDark ? '#0D1B2A' : '#D6EAF8');
  ctx.beginPath();
  ctx.arc(cx, cy, outerR, 0, Math.PI * 2);
  ctx.fillStyle = bgGrad;
  ctx.fill();
  ctx.strokeStyle = isDark ? '#1E3549' : '#AED6F1';
  ctx.lineWidth = 2;
  ctx.stroke();

  // ── Concentric rings ──
  [0.35, 0.65].forEach(f => {
    ctx.beginPath();
    ctx.arc(cx, cy, outerR * f, 0, Math.PI * 2);
    ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(26,74,110,0.1)';
    ctx.lineWidth = 1;
    ctx.stroke();
  });

  // ── Degree ticks ──
  for (let deg = 0; deg < 360; deg += 30) {
    const r1 = outerR - 4;
    const r2 = outerR - (deg % 90 === 0 ? 14 : 8);
    const rad = (deg - 90) * Math.PI / 180;
    ctx.beginPath();
    ctx.moveTo(cx + r1 * Math.cos(rad), cy + r1 * Math.sin(rad));
    ctx.lineTo(cx + r2 * Math.cos(rad), cy + r2 * Math.sin(rad));
    ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.3)' : 'rgba(26,74,110,0.4)';
    ctx.lineWidth = deg % 90 === 0 ? 2 : 1;
    ctx.stroke();
  }

  // ── Cardinal labels ──
  const cardinals = [
    { label: 'N', deg: 0   },
    { label: 'E', deg: 90  },
    { label: 'S', deg: 180 },
    { label: 'W', deg: 270 },
  ];
  ctx.font = 'bold 13px "Noto Sans Thai", Inter, sans-serif';
  cardinals.forEach(c => {
    const rad = (c.deg - 90) * Math.PI / 180;
    const r   = outerR - 24;
    const tx  = cx + r * Math.cos(rad);
    const ty  = cy + r * Math.sin(rad);
    ctx.fillStyle = c.label === 'N' ? '#E74C3C' : (isDark ? 'rgba(255,255,255,0.7)' : '#1A4A6E');
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(c.label, tx, ty);
  });

  // ── Sun position on compass ──
  const sunRad = (sun.azimuth - 90) * Math.PI / 180;
  const sunR   = outerR * 0.6;
  const sunX   = cx + sunR * Math.cos(sunRad);
  const sunY   = cy + sunR * Math.sin(sunRad);

  if (sun.isDaytime) {
    // Sun trail arc
    ctx.beginPath();
    ctx.setLineDash([3, 6]);
    ctx.arc(cx, cy, sunR, -Math.PI / 2, sunRad);
    ctx.strokeStyle = 'rgba(243,156,18,0.4)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.setLineDash([]);

    // Sun glow
    const sunGlow = ctx.createRadialGradient(sunX, sunY, 2, sunX, sunY, 20);
    sunGlow.addColorStop(0,   'rgba(255,220,50,0.9)');
    sunGlow.addColorStop(0.5, 'rgba(255,180,0,0.4)');
    sunGlow.addColorStop(1,   'rgba(255,180,0,0)');
    ctx.beginPath();
    ctx.arc(sunX, sunY, 20, 0, Math.PI * 2);
    ctx.fillStyle = sunGlow;
    ctx.fill();

    // Sun dot
    ctx.beginPath();
    ctx.arc(sunX, sunY, 10, 0, Math.PI * 2);
    ctx.fillStyle = '#FFD700';
    ctx.fill();
    ctx.strokeStyle = '#FFA500';
    ctx.lineWidth = 2;
    ctx.stroke();
  } else {
    // Moon
    ctx.beginPath();
    ctx.arc(sunX, sunY, 9, 0, Math.PI * 2);
    ctx.fillStyle = '#AEB6BF';
    ctx.fill();
  }

  // ── Panel direction arrow (pointing toward sun azimuth) ──
  if (SOLAR_CFG.enabled) {
    const panelRad = (sun.panelAzimuth - 90) * Math.PI / 180;
    const arrowR   = outerR * 0.38;
    const arrowX   = cx + arrowR * Math.cos(panelRad);
    const arrowY   = cy + arrowR * Math.sin(panelRad);

    // Arrow shaft
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(arrowX, arrowY);
    ctx.strokeStyle = isDark ? 'rgba(26,150,110,0.9)' : '#1A9670';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.stroke();

    // Arrowhead
    const headAngle = Math.atan2(arrowY - cy, arrowX - cx);
    ctx.beginPath();
    ctx.moveTo(arrowX, arrowY);
    ctx.lineTo(
      arrowX - 14 * Math.cos(headAngle - 0.45),
      arrowY - 14 * Math.sin(headAngle - 0.45)
    );
    ctx.lineTo(
      arrowX - 14 * Math.cos(headAngle + 0.45),
      arrowY - 14 * Math.sin(headAngle + 0.45)
    );
    ctx.closePath();
    ctx.fillStyle = isDark ? '#1A9670' : '#1A9670';
    ctx.fill();
  }

  // ── Center dot ──
  ctx.beginPath();
  ctx.arc(cx, cy, 6, 0, Math.PI * 2);
  ctx.fillStyle = isDark ? '#AEB6BF' : '#1A4A6E';
  ctx.fill();

  // ── Azimuth label ──
  ctx.fillStyle = isDark ? 'rgba(255,255,255,0.6)' : 'rgba(26,74,110,0.7)';
  ctx.font = '11px "Noto Sans Thai", Inter, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(sun.azimuth.toFixed(1) + '° ' + azimuthToCardinal(sun.azimuth), cx, H - 6);
}

// ══════════════════════════════════════════
// WASH CONTROL SYSTEM
// ══════════════════════════════════════════
function initWashDirtyOverlay() {
  // Show dirty texture on panels
  ['A','B','C'].forEach(z => {
    const dirty = document.getElementById(`dirty-${z}`);
    if (!dirty) return;
    dirty.style.background = 'rgba(139,90,43,0.22)';
    dirty.style.backdropFilter = 'blur(0.5px)';
  });
  renderWashLog();
}

window.startWashCycle = function() {
  if (WASH_STATE.isWashing) return;

  const zones = ['A','B','C'].filter(z => {
    const cb = document.getElementById(`wzone-${z}`);
    return cb && cb.checked;
  });
  if (!zones.length) { showToast('⚠️ กรุณาเลือกโซนที่จะล้างอย่างน้อย 1 โซน'); return; }

  WASH_STATE.isWashing = true;
  WASH_STATE.zones = zones;
  WASH_STATE.currentZoneIdx = 0;
  WASH_STATE.progress = 0;

  // Reset panel states
  ['A','B','C'].forEach(z => {
    const panel = document.getElementById(`wpanel-${z}`);
    if (panel) { panel.classList.remove('washing','done'); }
  });

  // UI
  setEl('wash-start-btn', 'display', 'none');
  setEl('wash-stop-btn',  'display', 'inline-flex');
  setEl('wash-progress-wrap', 'display', 'flex');

  setWashStatus('กำลังล้างแผง...', 'washing');
  washNextZone();
};

window.stopWashCycle = function() {
  clearInterval(WASH_STATE.washTimer);
  stopWaterDrops();
  WASH_STATE.isWashing = false;

  // Reset panel states
  WASH_STATE.zones.forEach(z => {
    const panel = document.getElementById(`wpanel-${z}`);
    if (panel) panel.classList.remove('washing');
    const nozzle = document.getElementById(`nozzle-${z}`);
    if (nozzle) nozzle.classList.remove('active');
  });

  setEl('wash-start-btn', 'display', 'inline-flex');
  setEl('wash-stop-btn',  'display', 'none');
  setEl('wash-progress-wrap', 'display', 'none');
  setWashStatus('หยุดล้างกลางคัน', 'idle');
  showToast('⏹ หยุดการล้างแผงแล้ว');
};

function washNextZone() {
  const { zones, currentZoneIdx } = WASH_STATE;
  if (currentZoneIdx >= zones.length) {
    finishWash();
    return;
  }

  const zone = zones[currentZoneIdx];
  const panel  = document.getElementById(`wpanel-${zone}`);
  const nozzle = document.getElementById(`nozzle-${zone}`);

  if (panel)  panel.classList.add('washing');
  if (nozzle) nozzle.classList.add('active');
  WASH_STATE.progress = 0;

  setTextSafe('wash-zone-label', `กำลังล้าง Zone ${zone}`);
  setWashStatus(`กำลังล้าง Zone ${zone}...`, 'washing');

  // Start water drops
  startWaterDrops(zone);

  // Progress timer
  const totalMs = (parseInt(document.getElementById('wash-duration')?.value || 15) * 1000) / zones.length;
  const step = 100 / (totalMs / 200);

  WASH_STATE.washTimer = setInterval(() => {
    WASH_STATE.progress = Math.min(100, WASH_STATE.progress + step);
    const fill = document.getElementById('wash-progress-fill');
    const pct  = document.getElementById('wash-pct-label');
    if (fill) fill.style.width = WASH_STATE.progress + '%';
    if (pct)  pct.textContent  = WASH_STATE.progress.toFixed(0) + '%';

    if (WASH_STATE.progress >= 100) {
      clearInterval(WASH_STATE.washTimer);
      stopWaterDrops();
      if (nozzle) nozzle.classList.remove('active');
      if (panel)  { panel.classList.remove('washing'); panel.classList.add('done'); }

      // Clean the dirty overlay
      const dirty = document.getElementById(`dirty-${zone}`);
      if (dirty) dirty.style.background = 'transparent';

      WASH_STATE.currentZoneIdx++;
      setTimeout(washNextZone, 600);
    }
  }, 200);
}

function finishWash() {
  WASH_STATE.isWashing = false;
  setEl('wash-start-btn', 'display', 'inline-flex');
  setEl('wash-stop-btn',  'display', 'none');
  setEl('wash-progress-wrap', 'display', 'none');
  setWashStatus('ล้างแผงเสร็จแล้ว ✅', 'ok');
  setTextSafe('last-wash-val', new Date().toLocaleString('th-TH', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  }) + ' น.');

  // Add log
  const zones = WASH_STATE.zones.join(', ');
  WASH_STATE.logs.unshift({
    icon: '✅',
    task: `ล้างแผง Zone ${zones}`,
    detail: `ใช้เวลา ${document.getElementById('wash-duration')?.value || 15} นาที`,
    time: new Date().toLocaleString('th-TH', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' }),
    result: 'สำเร็จ',
  });
  renderWashLog();

  const wCount = document.getElementById('wstat-count');
  if (wCount) wCount.textContent = (parseInt(wCount.textContent) || 14) + 1;

  showToast('✅ ล้างแผงทั้งหมดเสร็จแล้ว!');
}

window.saveWashSchedule = function() {
  const t = document.getElementById('wash-schedule-time')?.value || '06:00';
  const d = document.getElementById('wash-duration')?.value || 15;
  WASH_STATE.scheduleTime = t;
  WASH_STATE.duration     = parseInt(d);

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toLocaleDateString('th-TH', { day:'numeric', month:'long' });
  setTextSafe('next-wash-val', `${tomorrowStr} ${t} น.`);

  showToast(`💾 บันทึกตาราง: ล้างแผงทุกวัน ${t} น. ระยะเวลา ${d} นาที`);
};

// ── Water Drop Animation ──
function startWaterDrops(zone) {
  stopWaterDrops();
  const layer = document.getElementById('wash-drops-layer');
  if (!layer) return;
  layer.innerHTML = '';

  const zoneIdx = ['A','B','C'].indexOf(zone);
  const baseX   = 50 + zoneIdx * 32; // approx percentage width for zone

  WASH_STATE.dropInterval = setInterval(() => {
    for (let i = 0; i < 3; i++) {
      const drop = document.createElement('div');
      drop.className = 'water-drop';
      const x = baseX + (Math.random() - 0.5) * 28;
      const h = 6 + Math.random() * 12;
      const dur = (0.5 + Math.random() * 0.6).toFixed(2);
      const del = (Math.random() * 0.4).toFixed(2);
      drop.style.cssText = `
        left: ${x}%;
        height: ${h}px;
        --drop-dur: ${dur}s;
        --drop-delay: ${del}s;
      `;
      layer.appendChild(drop);
    }
    // Clean up old drops
    while (layer.children.length > 60) {
      layer.removeChild(layer.firstChild);
    }
  }, 120);
}

function stopWaterDrops() {
  clearInterval(WASH_STATE.dropInterval);
  const layer = document.getElementById('wash-drops-layer');
  if (layer) layer.innerHTML = '';
}

function setWashStatus(text, type) {
  setTextSafe('wash-status-text', text);
  const dot = document.getElementById('wash-status-dot');
  if (dot) dot.className = `wash-status-dot ${type}`;
}

function renderWashLog() {
  const list = document.getElementById('wash-log-list');
  if (!list) return;
  if (!WASH_STATE.logs.length) {
    list.innerHTML = '<li style="color:var(--text-muted);font-size:var(--font-size-sm);padding:8px">ยังไม่มีประวัติ</li>';
    return;
  }
  list.innerHTML = WASH_STATE.logs.map(log => `
    <li class="wash-log-item">
      <span class="wash-log-icon">${log.icon}</span>
      <div class="wash-log-info">
        <div class="wash-log-task">${log.task}</div>
        <div class="wash-log-detail">${log.detail}</div>
      </div>
      <div style="text-align:right">
        <div class="wash-log-time">${log.time}</div>
        <div class="wash-log-result">${log.result}</div>
      </div>
    </li>
  `).join('');
}

// ── Helpers ──
function setEl(id, prop, val) {
  const el = document.getElementById(id);
  if (el) el.style[prop] = val;
}

function setTextSafe(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function showToast(msg, dur = 3000) {
  let toast = document.getElementById('global-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'global-toast';
    toast.style.cssText = `
      position:fixed;bottom:24px;left:50%;transform:translateX(-50%);
      background:rgba(26,74,110,0.96);color:#fff;
      padding:12px 24px;border-radius:12px;font-size:15px;font-weight:600;
      font-family:'Noto Sans Thai',Inter,sans-serif;
      box-shadow:0 8px 30px rgba(0,0,0,0.25);z-index:9000;
      transition:opacity 0.3s ease;max-width:90vw;text-align:center;
    `;
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.style.opacity = '1';
  clearTimeout(toast._timeout);
  toast._timeout = setTimeout(() => { toast.style.opacity = '0'; }, dur);
}
