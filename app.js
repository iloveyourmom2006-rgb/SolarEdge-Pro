/* ═══════════════════════════════════════
   SolarEdge Pro — Application Logic
   Smart Solar Panel Control System
═══════════════════════════════════════ */
'use strict';

// ──────────────────────────────────────
// 1. STATE
// ──────────────────────────────────────
const state = {
  isOnline: true,
  commandQueue: [],
  alerts: [],
  maintenanceLogs: [],
  upcomingMaintenance: [],
  currentRange: 'today',
  alertFilter: 'all',
  energyChart: null,
  degradeChart: null,
  panels: [],
  zones: [],
  telemetry: {
    voltage: 0, current: 0, power: 0, energy: 0,
    temperature: 0, cleanliness: 0, irradiance: 0,
    performanceRatio: 0,
  },
  prevTelemetry: null,
  updateInterval: null,
  lastUpdateTime: null,
};

// ──────────────────────────────────────
// 2. DATA DEFINITIONS
// ──────────────────────────────────────
const PANELS_DATA = [
  { id:'A-01', zone:'A', name:'แผง A-01', status:'ok',    voltage:48.2, current:8.5,  power:409.7, temp:42 },
  { id:'A-02', zone:'A', name:'แผง A-02', status:'ok',    voltage:47.9, current:8.4,  power:402.4, temp:44 },
  { id:'A-03', zone:'A', name:'แผง A-03', status:'error', voltage:43.1, current:3.2,  power:137.9, temp:71 },
  { id:'A-04', zone:'A', name:'แผง A-04', status:'warn',  voltage:46.5, current:7.1,  power:330.2, temp:58 },
  { id:'B-01', zone:'B', name:'แผง B-01', status:'ok',    voltage:48.8, current:8.9,  power:434.3, temp:40 },
  { id:'B-02', zone:'B', name:'แผง B-02', status:'ok',    voltage:48.5, current:8.7,  power:421.9, temp:41 },
  { id:'B-03', zone:'B', name:'แผง B-03', status:'warn',  voltage:45.2, current:6.8,  power:307.4, temp:62 },
  { id:'B-04', zone:'B', name:'แผง B-04', status:'ok',    voltage:48.1, current:8.6,  power:413.7, temp:43 },
  { id:'B-05', zone:'B', name:'แผง B-05', status:'ok',    voltage:47.7, current:8.3,  power:396.1, temp:45 },
  { id:'C-01', zone:'C', name:'แผง C-01', status:'ok',    voltage:49.0, current:9.0,  power:441.0, temp:39 },
  { id:'C-02', zone:'C', name:'แผง C-02', status:'ok',    voltage:48.7, current:8.8,  power:428.6, temp:40 },
  { id:'C-03', zone:'C', name:'แผง C-03', status:'warn',  voltage:46.0, current:7.0,  power:322.0, temp:60 },
  { id:'C-04', zone:'C', name:'แผง C-04', status:'ok',    voltage:48.3, current:8.6,  power:415.4, temp:42 },
];

const ZONES_DATA = [
  {
    id:'A', name:'Zone A', location:'หลังคาอาคาร 1', icon:'🏢',
    panels: PANELS_DATA.filter(p => p.zone === 'A'),
    installed: '12 แผง', capacity: '6.0 kWp',
  },
  {
    id:'B', name:'Zone B', location:'หลังคาอาคาร 2', icon:'🏗️',
    panels: PANELS_DATA.filter(p => p.zone === 'B'),
    installed: '8 แผง', capacity: '4.0 kWp',
  },
  {
    id:'C', name:'Zone C', location:'ลานจอดรถ (Carport)', icon:'🅿️',
    panels: PANELS_DATA.filter(p => p.zone === 'C'),
    installed: '4 แผง', capacity: '2.0 kWp',
  },
];

const INITIAL_ALERTS = [
  {
    id: 'em1', type: 'emergency', icon: '⚡',
    title: 'ตรวจพบกระแสไฟลัดวงจร',
    desc: 'Zone A — แผง A-03 กระแสผิดปกติ ต้องตรวจสอบทันที',
    time: '15:02 น.',
  },
  {
    id: 'w1', type: 'warning', icon: '🌡️',
    title: 'อุณหภูมิสูงกว่าปกติ',
    desc: 'Zone B-03 อุณหภูมิ 62°C เกินเกณฑ์ปกติ (>55°C)',
    time: '14:47 น.',
  },
  {
    id: 'w2', type: 'warning', icon: '🧹',
    title: 'แผงสกปรก — ควรล้างด่วน',
    desc: 'Zone C-03 ดัชนีความสะอาดต่ำกว่า 60% ประสิทธิภาพลดลง 18%',
    time: '13:30 น.',
  },
  {
    id: 'i1', type: 'info', icon: 'ℹ️',
    title: 'พลังงานสะสมวันนี้ทะลุเป้า',
    desc: 'ผลิตได้ 24.8 kWh เกินเป้าหมายรายวัน (22 kWh)',
    time: '12:15 น.',
  },
  {
    id: 'i2', type: 'info', icon: '🔄',
    title: 'ซิงค์ข้อมูลเรียบร้อย',
    desc: 'ข้อมูลทั้งหมดอัปเดตไปยังคลาวด์แล้ว',
    time: '11:00 น.',
  },
  {
    id: 'i3', type: 'info', icon: '📅',
    title: 'กำหนดล้างแผง Zone A ใน 7 วัน',
    desc: 'วันที่ 21 มิ.ย. 2026 — โปรดเตรียมทีมงาน',
    time: '09:00 น.',
  },
];

const UPCOMING_MAINTENANCE_DATA = [
  { task: 'ล้างทำความสะอาดแผง', zone: 'Zone A', daysLeft: 7 },
  { task: 'ตรวจเช็คอินเวอร์เตอร์', zone: 'Zone B', daysLeft: 15 },
  { task: 'เปลี่ยนสายไฟ Connector', zone: 'Zone C', daysLeft: 32 },
];

const MAINT_LOG_INITIAL = [
  { date: '10 พ.ค. 2026', text: 'ล้างแผง Zone A ทุกแผง', zone: 'Zone A' },
  { date: '2 เม.ย. 2026',  text: 'เปลี่ยนสายไฟ B-03', zone: 'Zone B' },
  { date: '15 มี.ค. 2026', text: 'ตรวจเช็คอินเวอร์เตอร์ Zone C', zone: 'Zone C' },
];

// ──────────────────────────────────────
// 3. INITIALIZATION
// ──────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initState();
  initUI();
  initCharts();
  initPanelList();
  initZoneCards();
  initAlerts();
  initMaintLogs();
  initUpcomingMaintenance();
  initQRGrid();
  initBTDevices();
  updateClock();
  setInterval(updateClock, 1000);
  startTelemetrySimulation();
  setTodayDateDefault();
  setupOfflineSimulation();

  // Show emergency after 3s demo
  setTimeout(showEmergencyAlert, 3000);
});

function initState() {
  state.alerts = JSON.parse(JSON.stringify(INITIAL_ALERTS));
  state.maintenanceLogs = JSON.parse(JSON.stringify(MAINT_LOG_INITIAL));
  state.upcomingMaintenance = JSON.parse(JSON.stringify(UPCOMING_MAINTENANCE_DATA));
  state.panels = JSON.parse(JSON.stringify(PANELS_DATA));
  state.zones = JSON.parse(JSON.stringify(ZONES_DATA));
  // Load from localStorage
  const savedLogs = localStorage.getItem('solarEdge_maintLogs');
  if (savedLogs) state.maintenanceLogs = JSON.parse(savedLogs);
  const savedQueue = localStorage.getItem('solarEdge_cmdQueue');
  if (savedQueue) state.commandQueue = JSON.parse(savedQueue);
}

// ──────────────────────────────────────
// 4. UI BINDINGS
// ──────────────────────────────────────
function initUI() {
  // Nav tabs
  document.querySelectorAll('.nav-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      const section = btn.dataset.section;
      switchSection(section);
    });
  });

  // Chart range chips
  document.querySelectorAll('[data-range]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-range]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.currentRange = btn.dataset.range;
      updateEnergyChart();
    });
  });

  // Alert type tabs
  document.querySelectorAll('.alert-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.alert-tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.alertFilter = btn.dataset.type;
      renderAlerts();
    });
  });

  // Emergency modal
  document.getElementById('emergency-dismiss-btn').addEventListener('click', () => {
    document.getElementById('emergency-overlay').classList.add('hidden');
  });
  document.getElementById('emergency-view-btn').addEventListener('click', () => {
    document.getElementById('emergency-overlay').classList.add('hidden');
    switchSection('alerts');
  });

  // Connect modal
  document.getElementById('connect-btn').addEventListener('click', openConnectModal);
  document.getElementById('modal-close').addEventListener('click', closeConnectModal);
  document.getElementById('modal-backdrop').addEventListener('click', closeConnectModal);

  // Modal tabs
  document.getElementById('tab-qr').addEventListener('click', () => switchModalTab('qr'));
  document.getElementById('tab-bt').addEventListener('click', () => switchModalTab('bluetooth'));

  // Maintenance modal
  document.getElementById('maint-open-btn').addEventListener('click', openMaintModal);
  document.getElementById('maint-close').addEventListener('click', closeMaintModal);
  document.getElementById('maint-backdrop').addEventListener('click', closeMaintModal);
  document.getElementById('maint-save-btn').addEventListener('click', saveMaintenance);

  // Theme toggle
  document.getElementById('theme-toggle').addEventListener('click', toggleTheme);

  // Offline toggle
  document.getElementById('toggle-offline-btn').addEventListener('click', toggleOffline);

  // Sync btn
  document.getElementById('sync-btn').addEventListener('click', syncNow);

  // Notification btn → go to alerts
  document.getElementById('notif-btn').addEventListener('click', () => switchSection('alerts'));

  // Clear all alerts
  document.getElementById('clear-all-btn').addEventListener('click', clearAllAlerts);
}

function switchSection(sectionId) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(b => b.classList.remove('active'));
  document.getElementById(`section-${sectionId}`).classList.add('active');
  document.getElementById(`nav-${sectionId}`).classList.add('active');
}

// ──────────────────────────────────────
// 5. CLOCK
// ──────────────────────────────────────
function updateClock() {
  const now = new Date();
  const timeStr = now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const dateEl = document.getElementById('current-time');
  if (dateEl) dateEl.textContent = timeStr;
  const lastEl = document.getElementById('last-update');
  if (lastEl) lastEl.textContent = now.toLocaleString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit', day: 'numeric', month: 'short' });
}

// ──────────────────────────────────────
// 6. TELEMETRY SIMULATION
// ──────────────────────────────────────
function startTelemetrySimulation() {
  updateTelemetry();
  state.updateInterval = setInterval(updateTelemetry, 3000);
}

function randomBetween(min, max) {
  return +(min + Math.random() * (max - min)).toFixed(1);
}

function updateTelemetry() {
  state.prevTelemetry = { ...state.telemetry };

  const hour = new Date().getHours();
  const sunFactor = Math.max(0, Math.sin((hour - 6) / 12 * Math.PI));
  const noise = () => 1 + (Math.random() - 0.5) * 0.08;

  state.telemetry.voltage = +(47.5 + sunFactor * 3 + (Math.random()-0.5)*1.5).toFixed(1);
  state.telemetry.current = +(sunFactor * 9.5 * noise()).toFixed(2);
  state.telemetry.power   = +(state.telemetry.voltage * state.telemetry.current / 1000 * 22).toFixed(2);
  state.telemetry.energy  = +(state.telemetry.power * (hour - 6 > 0 ? (hour - 6) : 0) * 0.18 + 2.4).toFixed(1);
  state.telemetry.temperature = +(40 + sunFactor * 32 + (Math.random()-0.5)*4).toFixed(1);
  state.telemetry.cleanliness = randomBetween(58, 88);
  state.telemetry.irradiance  = +(sunFactor * 980 * noise()).toFixed(0);
  state.telemetry.performanceRatio = +(0.72 + sunFactor * 0.11 * noise()).toFixed(2);

  renderKPIs();
  updateGauges();
  updateCleanlinessDisplay();
  updateDegradeDisplay();
  updateZoneStats();

  // Randomly update panel values
  state.panels = state.panels.map(p => ({
    ...p,
    voltage: +(p.voltage + (Math.random()-0.5)*0.8).toFixed(1),
    current: +(p.current + (Math.random()-0.5)*0.3).toFixed(2),
    power:   +(p.voltage * p.current).toFixed(1),
    temp:    +(p.temp + (Math.random()-0.5)*1.5).toFixed(1),
  }));
  updatePanelList();
}

// ──────────────────────────────────────
// 7. KPI RENDERING
// ──────────────────────────────────────
function renderKPIs() {
  const t = state.telemetry;
  const p = state.prevTelemetry;

  setKPI('val-voltage', t.voltage.toFixed(1), 'trend-voltage', p ? t.voltage - p.voltage : 0, 'V');
  setKPI('val-current', t.current.toFixed(2), 'trend-current', p ? t.current - p.current : 0, 'A');
  setKPI('val-power',   t.power.toFixed(2),   'trend-power',   p ? t.power   - p.power   : 0, 'kW');
  setKPI('val-energy',  t.energy.toFixed(1),  'trend-energy',  p ? t.energy  - p.energy  : 0, 'kWh');

  // Power bar (max ~12kW)
  const pct = Math.min(100, (t.power / 12) * 100);
  document.getElementById('power-bar').style.width = pct + '%';
}

function setKPI(valueId, value, trendId, delta, unit) {
  const el = document.getElementById(valueId);
  if (el) {
    el.textContent = value;
    el.classList.remove('value-update');
    void el.offsetWidth; // reflow
    el.classList.add('value-update');
  }

  const tEl = document.getElementById(trendId);
  if (tEl) {
    if (delta > 0.01) {
      tEl.innerHTML = `<span style="color:var(--color-success)">▲ +${Math.abs(delta).toFixed(1)}</span>`;
    } else if (delta < -0.01) {
      tEl.innerHTML = `<span style="color:var(--color-danger)">▼ ${delta.toFixed(1)}</span>`;
    } else {
      tEl.innerHTML = `<span style="color:var(--text-muted)">— เท่าเดิม</span>`;
    }
  }
}

// ──────────────────────────────────────
// 8. CHARTS
// ──────────────────────────────────────
function getChartColors() {
  return {
    today:     'rgba(243,156,18,1)',
    todayFill: 'rgba(243,156,18,0.12)',
    yesterday: 'rgba(42,110,166,0.8)',
    avg:       'rgba(39,174,96,0.7)',
    text:      getComputedStyle(document.documentElement).getPropertyValue('--text-secondary').trim() || '#4A5568',
    grid:      getComputedStyle(document.documentElement).getPropertyValue('--border-color').trim() || '#D8E0EB',
  };
}

function generateHourlyData(baseMultiplier, spread) {
  const data = [];
  for (let h = 0; h < 24; h++) {
    const sunFactor = Math.max(0, Math.sin((h - 6) / 12 * Math.PI));
    data.push(+(sunFactor * baseMultiplier * (1 + (Math.random()-0.5) * spread)).toFixed(2));
  }
  return data;
}

function generateDailyLabels(n) {
  const labels = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    labels.push(d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' }));
  }
  return labels;
}

function generateWeeklyData(n, base) {
  return Array.from({ length: n }, () => +(base * 0.7 + Math.random() * base * 0.6).toFixed(1));
}

function initCharts() {
  initEnergyChart();
  initDegradeChart();
}

function initEnergyChart() {
  const ctx = document.getElementById('energy-chart');
  if (!ctx) return;
  const colors = getChartColors();
  const labels = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2,'0')}:00`);

  if (state.energyChart) state.energyChart.destroy();

  state.energyChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'วันนี้',
          data: generateHourlyData(10.8, 0.12),
          borderColor: colors.today,
          backgroundColor: colors.todayFill,
          borderWidth: 3,
          fill: true,
          tension: 0.45,
          pointRadius: 0,
          pointHoverRadius: 6,
          pointHoverBackgroundColor: colors.today,
        },
        {
          label: 'เมื่อวาน',
          data: generateHourlyData(9.5, 0.15),
          borderColor: colors.yesterday,
          backgroundColor: 'transparent',
          borderWidth: 2,
          fill: false,
          tension: 0.45,
          borderDash: [5, 4],
          pointRadius: 0,
          pointHoverRadius: 5,
        },
        {
          label: 'ค่าเฉลี่ย 30 วัน',
          data: generateHourlyData(9.9, 0.05),
          borderColor: colors.avg,
          backgroundColor: 'transparent',
          borderWidth: 2,
          fill: false,
          tension: 0.45,
          borderDash: [3, 3],
          pointRadius: 0,
          pointHoverRadius: 5,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(15,32,48,0.92)',
          titleFont: { family: 'Noto Sans Thai, Inter', size: 13 },
          bodyFont:  { family: 'Noto Sans Thai, Inter', size: 12 },
          padding: 12,
          cornerRadius: 10,
          callbacks: {
            label: (ctx) => ` ${ctx.dataset.label}: ${ctx.parsed.y} kW`,
          },
        },
      },
      scales: {
        x: {
          grid: { color: colors.grid, drawBorder: false },
          ticks: {
            color: colors.text,
            font: { family: 'Noto Sans Thai, Inter', size: 11 },
            maxTicksLimit: 8,
            maxRotation: 0,
          },
        },
        y: {
          grid: { color: colors.grid, drawBorder: false },
          ticks: {
            color: colors.text,
            font: { family: 'Noto Sans Thai, Inter', size: 11 },
            callback: v => v + ' kW',
          },
          beginAtZero: true,
        },
      },
    },
  });
}

function updateEnergyChart() {
  if (!state.energyChart) return;
  const r = state.currentRange;
  let labels, multiplier;

  if (r === 'today') {
    labels = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2,'0')}:00`);
    state.energyChart.data.datasets[0].data = generateHourlyData(10.8, 0.12);
    state.energyChart.data.datasets[1].data = generateHourlyData(9.5, 0.15);
    state.energyChart.data.datasets[2].data = generateHourlyData(9.9, 0.05);
  } else if (r === 'week') {
    labels = generateDailyLabels(7);
    state.energyChart.data.datasets[0].data = generateWeeklyData(7, 26);
    state.energyChart.data.datasets[1].data = generateWeeklyData(7, 24);
    state.energyChart.data.datasets[2].data = generateWeeklyData(7, 25);
    state.energyChart.options.scales.y.ticks.callback = v => v + ' kWh';
    state.energyChart.options.plugins.tooltip.callbacks.label = ctx => ` ${ctx.dataset.label}: ${ctx.parsed.y} kWh`;
  } else {
    labels = generateDailyLabels(30);
    state.energyChart.data.datasets[0].data = generateWeeklyData(30, 25);
    state.energyChart.data.datasets[1].data = generateWeeklyData(30, 23);
    state.energyChart.data.datasets[2].data = generateWeeklyData(30, 24);
  }

  state.energyChart.data.labels = labels;
  state.energyChart.update('active');
}

function initDegradeChart() {
  const ctx = document.getElementById('degrade-chart');
  if (!ctx) return;
  const colors = getChartColors();
  const labels = Array.from({ length: 12 }, (_, i) => {
    const d = new Date();
    d.setMonth(d.getMonth() - 11 + i);
    return d.toLocaleDateString('th-TH', { month: 'short' });
  });

  if (state.degradeChart) state.degradeChart.destroy();

  state.degradeChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'PR จริง',
          data: Array.from({ length: 12 }, (_, i) => +(0.82 - i * 0.003 + (Math.random()-0.5)*0.02).toFixed(3)),
          borderColor: colors.today,
          backgroundColor: 'rgba(243,156,18,0.1)',
          borderWidth: 2.5,
          fill: true,
          tension: 0.4,
          pointRadius: 3,
        },
        {
          label: 'PR เป้าหมาย',
          data: Array.from({ length: 12 }, () => 0.78),
          borderColor: colors.avg,
          backgroundColor: 'transparent',
          borderWidth: 1.5,
          borderDash: [4, 3],
          pointRadius: 0,
          tension: 0,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(15,32,48,0.92)',
          titleFont: { family: 'Noto Sans Thai, Inter', size: 12 },
          bodyFont:  { family: 'Noto Sans Thai, Inter', size: 11 },
          padding: 10,
          cornerRadius: 8,
        },
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: colors.text, font: { family: 'Noto Sans Thai, Inter', size: 10 }, maxRotation: 0 } },
        y: { grid: { color: colors.grid }, ticks: { color: colors.text, font: { family: 'Noto Sans Thai, Inter', size: 10 }, callback: v => (v * 100).toFixed(0) + '%' }, min: 0.65, max: 0.92 },
      },
    },
  });
}

// ──────────────────────────────────────
// 9. GAUGE (CANVAS)
// ──────────────────────────────────────
function updateGauges() {
  drawTempGauge(state.telemetry.temperature);
  document.getElementById('gauge-temp-val').textContent = state.telemetry.temperature.toFixed(1);
  renderTempZoneList();
}

function drawTempGauge(temp) {
  const canvas = document.getElementById('temp-gauge');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  const cx = W / 2, cy = H - 10;
  const r = Math.min(W, H * 1.8) * 0.42;
  const startAngle = Math.PI;
  const endAngle   = 2 * Math.PI;

  // Background arc
  ctx.beginPath();
  ctx.arc(cx, cy, r, startAngle, endAngle);
  ctx.lineWidth = 18;
  ctx.strokeStyle = '#E2E8F0';
  ctx.stroke();

  // Color segments
  const segments = [
    { from: 0, to: 55,  color: '#27AE60' },
    { from: 55, to: 70, color: '#F39C12' },
    { from: 70, to: 90, color: '#E74C3C' },
  ];

  const maxTemp = 90;
  segments.forEach(seg => {
    const aStart = startAngle + (seg.from / maxTemp) * Math.PI;
    const aEnd   = startAngle + (seg.to   / maxTemp) * Math.PI;
    ctx.beginPath();
    ctx.arc(cx, cy, r, aStart, aEnd);
    ctx.lineWidth = 18;
    ctx.strokeStyle = seg.color;
    ctx.stroke();
  });

  // Needle
  const angle = startAngle + (Math.min(temp, maxTemp) / maxTemp) * Math.PI;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);
  ctx.beginPath();
  ctx.moveTo(-8, 0);
  ctx.lineTo(r - 10, 0);
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#1A2532';
  ctx.lineCap = 'round';
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, 7, 0, Math.PI * 2);
  ctx.fillStyle = '#1A2532';
  ctx.fill();
  ctx.restore();

  // Min/Max labels
  ctx.font = '12px "Noto Sans Thai", Inter, sans-serif';
  ctx.fillStyle = '#8E9BB0';
  ctx.textAlign = 'left';
  ctx.fillText('0°', cx - r - 14, cy + 16);
  ctx.textAlign = 'right';
  ctx.fillText('90°', cx + r + 14, cy + 16);
}

// ──────────────────────────────────────
// 10. CLEANLINESS
// ──────────────────────────────────────
function updateCleanlinessDisplay() {
  const pct = state.telemetry.cleanliness;
  document.getElementById('clean-pct').textContent = pct.toFixed(0) + '%';

  const arcEl = document.getElementById('clean-arc');
  const circumference = 2 * Math.PI * 50;
  const offset = circumference * (1 - pct / 100);
  arcEl.setAttribute('stroke-dashoffset', offset.toFixed(2));

  let strokeColor = '#27AE60';
  if (pct < 60) strokeColor = '#E74C3C';
  else if (pct < 75) strokeColor = '#F39C12';
  arcEl.setAttribute('stroke', strokeColor);

  // Action message
  const msgEl = document.getElementById('clean-action-msg');
  if (pct >= 80) {
    msgEl.textContent = '✅ แผงสะอาดดี ไม่ต้องล้างในตอนนี้';
    msgEl.className = 'clean-action good';
  } else if (pct >= 65) {
    msgEl.textContent = '⚠️ ควรวางแผนล้างแผงในอีก 7–14 วัน';
    msgEl.className = 'clean-action caution';
  } else {
    msgEl.textContent = '🚨 ต้องล้างแผงทันที! ประสิทธิภาพลดลงมาก';
    msgEl.className = 'clean-action urgent';
  }

  // Dust bars per zone
  renderDustBars();
}

function renderDustBars() {
  const container = document.getElementById('dust-bars');
  if (!container) return;
  const zones = [
    { name: 'Zone A', pct: randomBetween(60, 92) },
    { name: 'Zone B', pct: randomBetween(55, 88) },
    { name: 'Zone C', pct: randomBetween(50, 75) },
  ];
  container.innerHTML = zones.map(z => {
    let color = '#27AE60';
    if (z.pct < 60) color = '#E74C3C';
    else if (z.pct < 75) color = '#F39C12';
    return `
      <div class="dust-bar-row">
        <span class="dust-bar-label">${z.name}</span>
        <div class="dust-bar-track">
          <div class="dust-bar-fill" style="width:${z.pct}%;background:${color}"></div>
        </div>
        <span class="dust-bar-pct" style="color:${color}">${z.pct.toFixed(0)}%</span>
      </div>
    `;
  }).join('');
}

// ──────────────────────────────────────
// 11. DEGRADATION
// ──────────────────────────────────────
function updateDegradeDisplay() {
  const t = state.telemetry;
  document.getElementById('irr-val').textContent = `${t.irradiance} W/m²`;

  const expectedKw = (t.irradiance / 1000) * 12 * 0.82;
  const ratio = expectedKw > 0.1 ? t.power / expectedKw : 1;
  document.getElementById('pwr-ratio').textContent =
    `${t.power.toFixed(1)} / ${expectedKw.toFixed(1)} kW (${(ratio * 100).toFixed(0)}%)`;

  const pr = t.performanceRatio;
  document.getElementById('pr-val').textContent = `${(pr * 100).toFixed(1)}%`;

  const alertEl = document.getElementById('degrade-alert');
  if (pr > 0.78) {
    alertEl.textContent = '✅ ระบบทำงานปกติ ประสิทธิภาพดี';
    alertEl.className = 'degrade-alert ok';
  } else if (pr > 0.70) {
    alertEl.textContent = '⚠️ ประสิทธิภาพต่ำกว่าเป้า — แนะนำล้างแผง';
    alertEl.className = 'degrade-alert warning';
  } else {
    alertEl.textContent = '🚨 ประสิทธิภาพต่ำมาก — ตรวจสอบแผงและล้างทันที!';
    alertEl.className = 'degrade-alert danger';
  }
}

// ──────────────────────────────────────
// 12. TEMPERATURE ZONE LIST
// ──────────────────────────────────────
function renderTempZoneList() {
  const container = document.getElementById('temp-zone-list');
  if (!container) return;
  const zoneTemps = state.panels.reduce((acc, p) => {
    if (!acc[p.zone]) acc[p.zone] = [];
    acc[p.zone].push(p.temp);
    return acc;
  }, {});

  container.innerHTML = Object.entries(zoneTemps).map(([zone, temps]) => {
    const avg = (temps.reduce((a, b) => a + b, 0) / temps.length).toFixed(1);
    const max = 90;
    const pct = Math.min(100, (avg / max) * 100);
    let color = '#27AE60';
    if (avg > 70) color = '#E74C3C';
    else if (avg > 55) color = '#F39C12';
    return `
      <div class="env-zone-row">
        <span class="env-zone-name">Zone ${zone}</span>
        <div class="env-zone-bar">
          <div class="env-zone-fill" style="width:${pct}%;background:${color}"></div>
        </div>
        <span class="env-zone-val" style="color:${color}">${avg}°C</span>
      </div>
    `;
  }).join('');
}

// ──────────────────────────────────────
// 13. PANEL LIST
// ──────────────────────────────────────
function initPanelList() {
  renderPanelList();
}

function renderPanelList() {
  const container = document.getElementById('panel-list');
  if (!container) return;

  container.innerHTML = state.panels.map(p => {
    const statusClass = p.status === 'error' ? 'status-error' : p.status === 'warn' ? 'status-warn' : '';
    const dotClass    = p.status === 'error' ? 'error' : p.status === 'warn' ? 'warn' : 'ok';
    return `
      <div class="panel-item ${statusClass}" id="panel-item-${p.id}" role="listitem">
        <div class="panel-header" onclick="togglePanel('${p.id}')" role="button" tabindex="0" aria-expanded="false" aria-controls="panel-detail-${p.id}">
          <span class="panel-status-dot ${dotClass}"></span>
          <span class="panel-name">${p.name}</span>
          <span class="panel-power-tag">${p.power.toFixed(0)} W</span>
          <span class="panel-chevron">▾</span>
        </div>
        <div class="panel-detail" id="panel-detail-${p.id}">
          <div class="detail-row"><span class="detail-label">แรงดัน</span><span class="detail-val">${p.voltage.toFixed(1)} V</span></div>
          <div class="detail-row"><span class="detail-label">กระแส</span><span class="detail-val">${p.current.toFixed(2)} A</span></div>
          <div class="detail-row"><span class="detail-label">กำลัง</span><span class="detail-val">${p.power.toFixed(1)} W</span></div>
          <div class="detail-row"><span class="detail-label">อุณหภูมิ</span><span class="detail-val ${p.temp > 70 ? 'danger-text' : p.temp > 55 ? 'warn-text' : ''}">${p.temp.toFixed(1)} °C</span></div>
          <div class="detail-row"><span class="detail-label">สถานะ</span><span class="detail-val">${p.status === 'ok' ? '✅ ปกติ' : p.status === 'warn' ? '⚠️ ระวัง' : '🔴 ผิดปกติ'}</span></div>
          <div class="detail-row"><span class="detail-label">โซน</span><span class="detail-val">Zone ${p.zone}</span></div>
        </div>
      </div>
    `;
  }).join('');

  // Update counts
  const ok   = state.panels.filter(p => p.status === 'ok').length;
  const warn = state.panels.filter(p => p.status === 'warn').length;
  const err  = state.panels.filter(p => p.status === 'error').length;
  setTextSafe('panel-ok-count',   ok);
  setTextSafe('panel-warn-count', warn);
  setTextSafe('panel-err-count',  err);
}

function updatePanelList() {
  state.panels.forEach(p => {
    const detail = document.getElementById(`panel-detail-${p.id}`);
    if (!detail) return;
    const rows = detail.querySelectorAll('.detail-row');
    if (rows[0]) rows[0].querySelector('.detail-val').textContent = `${p.voltage.toFixed(1)} V`;
    if (rows[1]) rows[1].querySelector('.detail-val').textContent = `${p.current.toFixed(2)} A`;
    if (rows[2]) rows[2].querySelector('.detail-val').textContent = `${p.power.toFixed(1)} W`;
    if (rows[3]) rows[3].querySelector('.detail-val').textContent = `${p.temp.toFixed(1)} °C`;
    const powerTag = document.querySelector(`#panel-item-${p.id} .panel-power-tag`);
    if (powerTag) powerTag.textContent = `${p.power.toFixed(0)} W`;
  });
}

function togglePanel(id) {
  const item = document.getElementById(`panel-item-${id}`);
  if (!item) return;
  const expanded = item.classList.toggle('expanded');
  const header = item.querySelector('.panel-header');
  if (header) header.setAttribute('aria-expanded', expanded);
  // Queue command if offline
  if (!state.isOnline) {
    addToQueue(`ดูรายละเอียด แผง ${id}`);
  }
}

// ──────────────────────────────────────
// 14. ZONE CARDS
// ──────────────────────────────────────
function initZoneCards() {
  const grid = document.getElementById('zone-cards-grid');
  if (!grid) return;
  grid.innerHTML = state.zones.map(z => {
    const totalPower = z.panels.reduce((sum, p) => sum + p.power, 0) / 1000;
    const okCount    = z.panels.filter(p => p.status === 'ok').length;
    const maxCap     = parseFloat(z.capacity);
    const efficiency = ((totalPower / maxCap) * 100).toFixed(0);
    return `
      <div class="zone-card" id="zone-card-${z.id}">
        <div class="zone-card-header">
          <div class="zone-icon">${z.icon}</div>
          <div>
            <div class="zone-name">${z.name}</div>
            <div class="zone-loc">📍 ${z.location}</div>
          </div>
        </div>
        <div class="zone-stats">
          <div class="zone-stat">
            <div class="zone-stat-val" id="zs-power-${z.id}">${totalPower.toFixed(2)} kW</div>
            <div class="zone-stat-label">กำลังรวม</div>
          </div>
          <div class="zone-stat">
            <div class="zone-stat-val">${z.installed}</div>
            <div class="zone-stat-label">ติดตั้ง</div>
          </div>
          <div class="zone-stat">
            <div class="zone-stat-val" style="color:var(--color-success)">${okCount}/${z.panels.length}</div>
            <div class="zone-stat-label">ปกติ/ทั้งหมด</div>
          </div>
          <div class="zone-stat">
            <div class="zone-stat-val">${z.capacity}</div>
            <div class="zone-stat-label">ความจุ</div>
          </div>
        </div>
        <div class="zone-bar-row">
          <span style="font-size:var(--font-size-xs);color:var(--text-muted)">ประสิทธิภาพ ${efficiency}%</span>
          <div class="zone-bar-track" style="margin-left:auto;width:60%">
            <div class="zone-bar-fill" id="zone-bar-${z.id}" style="width:${efficiency}%"></div>
          </div>
        </div>
        <div class="zone-action-row">
          <button class="btn btn-outline btn-sm" onclick="viewZoneAlerts('${z.id}')">🔔 แจ้งเตือน</button>
          <button class="btn btn-outline-primary btn-sm" onclick="scheduleZoneMaint('${z.id}')">📅 บำรุงรักษา</button>
          <button class="btn btn-primary btn-sm" onclick="viewZoneDetails('${z.id}')">🔍 รายละเอียด</button>
        </div>
      </div>
    `;
  }).join('');
}

function updateZoneStats() {
  state.zones.forEach(z => {
    const totalPower = z.panels.reduce((sum, p) => sum + p.power, 0) / 1000;
    const el = document.getElementById(`zs-power-${z.id}`);
    if (el) el.textContent = `${totalPower.toFixed(2)} kW`;
  });
}

function viewZoneAlerts(zoneId) {
  switchSection('alerts');
}

function scheduleZoneMaint(zoneId) {
  openMaintModal();
  const sel = document.getElementById('maint-zone');
  if (sel) {
    const opt = Array.from(sel.options).find(o => o.text.startsWith(`Zone ${zoneId}`));
    if (opt) sel.value = opt.value;
  }
}

function viewZoneDetails(zoneId) {
  switchSection('dashboard');
  // Expand panels of this zone
  state.panels.filter(p => p.zone === zoneId).forEach(p => {
    const item = document.getElementById(`panel-item-${p.id}`);
    if (item && !item.classList.contains('expanded')) {
      item.classList.add('expanded');
    }
  });
}

// ──────────────────────────────────────
// 15. ALERTS
// ──────────────────────────────────────
function initAlerts() {
  renderAlerts();
  updateNotifBadge();
}

function renderAlerts() {
  const container = document.getElementById('alert-list');
  if (!container) return;
  const filtered = state.alertFilter === 'all'
    ? state.alerts
    : state.alerts.filter(a => a.type === state.alertFilter);

  if (!filtered.length) {
    container.innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:32px;">ไม่มีการแจ้งเตือน</p>';
    return;
  }

  container.innerHTML = filtered.map(a => `
    <div class="alert-item ${a.type}" id="alert-${a.id}" role="listitem">
      <div class="alert-icon-wrap">${a.icon}</div>
      <div class="alert-content">
        <div class="alert-title">${a.title}</div>
        <div class="alert-desc">${a.desc}</div>
        <div class="alert-time">${a.time}</div>
      </div>
      <button class="alert-dismiss" onclick="dismissAlert('${a.id}')" aria-label="ปิดการแจ้งเตือน">✕</button>
    </div>
  `).join('');
}

function dismissAlert(id) {
  const el = document.getElementById(`alert-${id}`);
  if (el) {
    el.style.opacity = '0';
    el.style.transform = 'translateX(20px)';
    el.style.transition = 'all 0.3s ease';
    setTimeout(() => {
      state.alerts = state.alerts.filter(a => a.id !== id);
      renderAlerts();
      updateNotifBadge();
    }, 300);
  }
  if (!state.isOnline) addToQueue(`ปิดแจ้งเตือน #${id}`);
}

function clearAllAlerts() {
  state.alerts = [];
  renderAlerts();
  updateNotifBadge();
  if (!state.isOnline) addToQueue('ล้างการแจ้งเตือนทั้งหมด');
}

function updateNotifBadge() {
  const count = state.alerts.filter(a => a.type === 'emergency' || a.type === 'warning').length;
  setTextSafe('notif-badge', count > 0 ? count : '');
  setTextSafe('nav-alert-badge', count > 0 ? count : '');
  const badge = document.getElementById('notif-badge');
  if (badge) badge.style.display = count > 0 ? 'flex' : 'none';
  const navBadge = document.getElementById('nav-alert-badge');
  if (navBadge) navBadge.style.display = count > 0 ? 'inline' : 'none';
}

function showEmergencyAlert() {
  const overlay = document.getElementById('emergency-overlay');
  if (overlay) {
    overlay.classList.remove('hidden');
    // Add emergency alert to list
    const newAlert = {
      id: 'em_auto', type: 'emergency', icon: '⚡',
      title: 'ตรวจพบกระแสไฟผิดปกติ',
      desc: 'Zone A-03: กระแสไฟ 3.2A ขณะที่ควรอยู่ที่ 8.5A — อาจมีการลัดวงจร',
      time: new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) + ' น.',
    };
    if (!state.alerts.find(a => a.id === 'em_auto')) {
      state.alerts.unshift(newAlert);
      updateNotifBadge();
    }
  }
}

// ──────────────────────────────────────
// 16. MAINTENANCE
// ──────────────────────────────────────
function initMaintLogs() {
  renderMaintLogs();
}

function renderMaintLogs() {
  const container = document.getElementById('maint-log-list');
  if (!container) return;
  if (!state.maintenanceLogs.length) {
    container.innerHTML = '<li style="color:var(--text-muted);font-size:var(--font-size-sm);padding:8px">ยังไม่มีประวัติ</li>';
    return;
  }
  container.innerHTML = state.maintenanceLogs.map(log => `
    <li class="maint-log-item">
      <span class="maint-log-date">${log.date}</span>
      <span class="maint-log-text">${log.text} — ${log.zone}</span>
    </li>
  `).join('');
}

function initUpcomingMaintenance() {
  const list = document.getElementById('upcoming-list');
  if (!list) return;
  list.innerHTML = state.upcomingMaintenance.map(m => {
    const dClass = m.daysLeft <= 7 ? 'soon' : m.daysLeft <= 14 ? 'near' : 'later';
    const icon   = m.daysLeft <= 7 ? '🔴' : m.daysLeft <= 14 ? '🟡' : '🟢';
    return `
      <li class="upcoming-item">
        <span class="upcoming-icon">${icon}</span>
        <div class="upcoming-info">
          <div class="upcoming-task">${m.task}</div>
          <div class="upcoming-zone">${m.zone}</div>
        </div>
        <span class="upcoming-days ${dClass}">
          ${m.daysLeft <= 0 ? 'เกินกำหนด!' : `อีก ${m.daysLeft} วัน`}
        </span>
      </li>
    `;
  }).join('');
}

function openMaintModal() {
  document.getElementById('maintenance-modal').classList.remove('hidden');
}

function closeMaintModal() {
  document.getElementById('maintenance-modal').classList.add('hidden');
}

function saveMaintenance() {
  const zone = document.getElementById('maint-zone').value;
  const type = document.getElementById('maint-type').value;
  const date = document.getElementById('maint-date').value;
  const note = document.getElementById('maint-note').value;

  if (!date) {
    alert('กรุณาเลือกวันที่');
    return;
  }

  const log = {
    date: new Date(date).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' }),
    text: type + (note ? ` (${note})` : ''),
    zone: zone.split(' — ')[0],
  };

  state.maintenanceLogs.unshift(log);
  localStorage.setItem('solarEdge_maintLogs', JSON.stringify(state.maintenanceLogs));
  renderMaintLogs();

  if (!state.isOnline) {
    addToQueue(`บันทึกบำรุงรักษา: ${type} — ${zone}`);
  }

  document.getElementById('maint-note').value = '';
  showToast('✅ บันทึกแผนบำรุงรักษาเรียบร้อยแล้ว');
  closeMaintModal();
}

function setTodayDateDefault() {
  const dateInput = document.getElementById('maint-date');
  if (dateInput) {
    const now = new Date();
    now.setDate(now.getDate() + 7);
    dateInput.value = now.toISOString().split('T')[0];
  }
}

// ──────────────────────────────────────
// 17. OFFLINE / QUEUE
// ──────────────────────────────────────
function toggleOffline() {
  state.isOnline = !state.isOnline;
  const banner    = document.getElementById('offline-banner');
  const statusDot = document.getElementById('status-dot');
  const statusLabel = document.getElementById('status-label');
  const syncBtn   = document.getElementById('sync-btn');

  if (!state.isOnline) {
    banner.classList.remove('hidden');
    statusDot.className = 'status-dot offline';
    statusLabel.textContent = 'ออฟไลน์';
    document.getElementById('sync-status-text').textContent = 'ไม่ได้เชื่อมต่อ';
    document.getElementById('sync-dot').className = 'sync-dot unsynced';
    syncBtn.classList.add('hidden');
  } else {
    banner.classList.add('hidden');
    statusDot.className = 'status-dot online';
    statusLabel.textContent = 'ออนไลน์';
    if (state.commandQueue.length > 0) {
      syncBtn.classList.remove('hidden');
    }
    setTimeout(() => {
      if (state.commandQueue.length > 0) syncNow();
    }, 1500);
  }
}

function addToQueue(cmd) {
  const item = {
    id: Date.now(),
    cmd,
    time: new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }),
  };
  state.commandQueue.unshift(item);
  localStorage.setItem('solarEdge_cmdQueue', JSON.stringify(state.commandQueue));
  renderQueue();
}

function renderQueue() {
  const list = document.getElementById('queue-list');
  const count = document.getElementById('queue-count');
  const badge = document.getElementById('queue-badge');
  if (count) count.textContent = state.commandQueue.length;
  if (badge) badge.textContent = `${state.commandQueue.length} รายการ`;

  if (!list) return;
  if (!state.commandQueue.length) {
    list.innerHTML = '<li class="queue-empty">ไม่มีคำสั่งค้างอยู่</li>';
    return;
  }
  list.innerHTML = state.commandQueue.map(q => `
    <li class="queue-item">
      <span class="queue-item-icon">📤</span>
      <span class="queue-item-text">${q.cmd}</span>
      <span class="queue-item-time">${q.time}</span>
    </li>
  `).join('');
}

function syncNow() {
  const syncDot  = document.getElementById('sync-dot');
  const syncText = document.getElementById('sync-status-text');
  if (syncDot) syncDot.className = 'sync-dot syncing';
  if (syncText) syncText.textContent = 'กำลังซิงค์...';

  setTimeout(() => {
    state.commandQueue = [];
    localStorage.removeItem('solarEdge_cmdQueue');
    renderQueue();
    if (syncDot) syncDot.className = 'sync-dot synced';
    if (syncText) syncText.textContent = `ซิงค์ล่าสุด: ${new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
    document.getElementById('sync-btn').classList.add('hidden');
    showToast('✅ ซิงค์ข้อมูลทั้งหมดเรียบร้อย!');
  }, 2000);
}

function setupOfflineSimulation() {
  renderQueue();
  // Listen for actual online/offline events
  window.addEventListener('online',  () => { state.isOnline = true;  updateOnlineStatus(); });
  window.addEventListener('offline', () => { state.isOnline = false; updateOnlineStatus(); });
}

function updateOnlineStatus() {
  const banner = document.getElementById('offline-banner');
  const statusDot = document.getElementById('status-dot');
  const statusLabel = document.getElementById('status-label');
  if (!state.isOnline) {
    banner.classList.remove('hidden');
    statusDot.className = 'status-dot offline';
    statusLabel.textContent = 'ออฟไลน์';
  } else {
    banner.classList.add('hidden');
    statusDot.className = 'status-dot online';
    statusLabel.textContent = 'ออนไลน์';
    if (state.commandQueue.length) syncNow();
  }
}

// ──────────────────────────────────────
// 18. CONNECT MODAL
// ──────────────────────────────────────
function openConnectModal() {
  document.getElementById('connect-modal').classList.remove('hidden');
  switchModalTab('qr');
  if (!state.isOnline) addToQueue('เปิดหน้าเชื่อมต่ออุปกรณ์');
}

function closeConnectModal() {
  document.getElementById('connect-modal').classList.add('hidden');
}

function switchModalTab(tabId) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  document.getElementById(`tab-${tabId}`).classList.add('active');
  document.getElementById(`tab-content-${tabId}`).classList.add('active');

  if (tabId === 'bluetooth') startBTScan();
}

// ──────────────────────────────────────
// 19. QR CODE GENERATOR
// ──────────────────────────────────────
function initQRGrid() {
  const grid = document.getElementById('qr-grid');
  if (!grid) return;
  // Simple visual QR pattern (decorative)
  const pattern = generateQRPattern();
  grid.innerHTML = pattern.map(cell =>
    `<div class="qr-cell" style="background:${cell ? '#1A4A6E' : 'transparent'}"></div>`
  ).join('');
}

function generateQRPattern() {
  const size = 15;
  const cells = Array(size * size).fill(false);
  // Position detection patterns (corners)
  const addSquare = (r, c, s) => {
    for (let i = r; i < r + s; i++)
      for (let j = c; j < c + s; j++)
        if (i >= 0 && i < size && j >= 0 && j < size)
          cells[i * size + j] = true;
  };
  const hollowSquare = (r, c, s) => {
    for (let i = r; i < r + s; i++)
      for (let j = c; j < c + s; j++)
        if (i >= 0 && i < size && j >= 0 && j < size)
          if (i === r || i === r+s-1 || j === c || j === c+s-1)
            cells[i * size + j] = true;
  };
  addSquare(0, 0, 7); hollowSquare(1, 1, 5); addSquare(2, 2, 3);
  addSquare(0, 8, 7); hollowSquare(1, 9, 5); addSquare(2, 10, 3);
  addSquare(8, 0, 7); hollowSquare(9, 1, 5); addSquare(10, 2, 3);
  // Random data cells
  for (let i = 0; i < size * size; i++) {
    if (!cells[i] && Math.random() > 0.55) cells[i] = true;
  }
  return cells;
}

// ──────────────────────────────────────
// 20. BLUETOOTH SCAN
// ──────────────────────────────────────
function startBTScan() {
  const deviceList = document.getElementById('bt-devices');
  const status = document.getElementById('bt-status');
  const spinner = document.getElementById('bt-spinner');
  if (!deviceList) return;
  deviceList.innerHTML = '';
  if (status) status.textContent = 'กำลังสแกนหาอุปกรณ์...';
  if (spinner) spinner.style.display = 'block';

  const devices = [
    { name: 'SolarBox-Zone-A', signal: '📶📶📶', id: 'A' },
    { name: 'SolarBox-Zone-B', signal: '📶📶', id: 'B' },
    { name: 'SolarInverter-01', signal: '📶📶📶📶', id: 'INV' },
  ];

  devices.forEach((dev, i) => {
    setTimeout(() => {
      const li = document.createElement('li');
      li.className = 'bt-device';
      li.innerHTML = `<span class="bt-signal">${dev.signal}</span><span>${dev.name}</span>`;
      li.addEventListener('click', () => pairDevice(dev.name));
      deviceList.appendChild(li);
      if (i === devices.length - 1) {
        if (status) status.textContent = `พบ ${devices.length} อุปกรณ์`;
        if (spinner) spinner.style.display = 'none';
      }
    }, (i + 1) * 800);
  });
}

function pairDevice(name) {
  showToast(`🔵 กำลังจับคู่กับ ${name}...`);
  if (!state.isOnline) addToQueue(`เชื่อมต่ออุปกรณ์: ${name}`);
  setTimeout(() => {
    showToast(`✅ เชื่อมต่อกับ ${name} สำเร็จ!`);
    closeConnectModal();
  }, 1800);
}

// ──────────────────────────────────────
// 21. THEME
// ──────────────────────────────────────
function toggleTheme() {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  document.documentElement.setAttribute('data-theme', isDark ? '' : 'dark');
  const icon = document.getElementById('theme-icon');
  if (icon) {
    icon.innerHTML = isDark
      ? '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>'
      : '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>';
  }
  setTimeout(() => {
    initCharts();
  }, 100);
}

// ──────────────────────────────────────
// 22. TOAST NOTIFICATION
// ──────────────────────────────────────
function showToast(msg, duration = 3000) {
  let toast = document.getElementById('global-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'global-toast';
    toast.style.cssText = `
      position:fixed; bottom:24px; left:50%; transform:translateX(-50%);
      background:rgba(26,74,110,0.96); color:#fff;
      padding:12px 24px; border-radius:12px; font-size:15px; font-weight:600;
      font-family:'Noto Sans Thai',Inter,sans-serif;
      box-shadow:0 8px 30px rgba(0,0,0,0.25); z-index:9000;
      transition:opacity 0.3s ease; max-width:90vw; text-align:center;
    `;
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.style.opacity = '1';
  clearTimeout(toast._timeout);
  toast._timeout = setTimeout(() => {
    toast.style.opacity = '0';
  }, duration);
}

// ──────────────────────────────────────
// 23. UTILS
// ──────────────────────────────────────
function setTextSafe(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}
