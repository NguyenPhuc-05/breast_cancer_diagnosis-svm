'use strict';

/* ================================================================
   Breast Cancer AI · Wisconsin SVM Diagnostic
   Frontend Controller (Matching Iris AI Explorer architecture)
   ================================================================ */

const CLIENT_ID = 'project-two-api';
const TOKEN_KEY = 'bc_auth_token';
const EMAIL_KEY = 'bc_auth_email';
const OWNER_KEY = 'bc_auth_owner';
const THEME_KEY = 'bc_theme';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '']);
const isLocal = LOCAL_HOSTS.has(window.location.hostname);
const deployment = window.BC_DEPLOYMENT || {};
const API_BASE = isLocal ? 'http://127.0.0.1:8000' : deployment.apiOrigin;
const IDP_BASE = isLocal ? 'http://127.0.0.1:8001' : deployment.identityOrigin;

/* ─── 30 Features of WDBC grouped into 3 sets of 10 ─── */
const FEATURE_GROUPS = [
    {
        key: 'mean',
        title: 'Nhóm 1: Giá trị trung bình (Mean)',
        icon: '📊',
        features: [
            { name: 'mean radius', label: 'Bán kính TB' },
            { name: 'mean texture', label: 'Độ nhám TB' },
            { name: 'mean perimeter', label: 'Chu vi TB' },
            { name: 'mean area', label: 'Diện tích TB' },
            { name: 'mean smoothness', label: 'Độ mịn TB' },
            { name: 'mean compactness', label: 'Độ đặc TB' },
            { name: 'mean concavity', label: 'Độ lõm TB' },
            { name: 'mean concave points', label: 'Điểm lõm TB' },
            { name: 'mean symmetry', label: 'Đối xứng TB' },
            { name: 'mean fractal dimension', label: 'Fractal TB' },
        ],
    },
    {
        key: 'error',
        title: 'Nhóm 2: Sai số chuẩn (Standard Error)',
        icon: '📐',
        features: [
            { name: 'radius error', label: 'Sai số bán kính' },
            { name: 'texture error', label: 'Sai số độ nhám' },
            { name: 'perimeter error', label: 'Sai số chu vi' },
            { name: 'area error', label: 'Sai số diện tích' },
            { name: 'smoothness error', label: 'Sai số độ mịn' },
            { name: 'compactness error', label: 'Sai số độ đặc' },
            { name: 'concavity error', label: 'Sai số độ lõm' },
            { name: 'concave points error', label: 'Sai số điểm lõm' },
            { name: 'symmetry error', label: 'Sai số đối xứng' },
            { name: 'fractal dimension error', label: 'Sai số fractal' },
        ],
    },
    {
        key: 'worst',
        title: 'Nhóm 3: Giá trị xấu nhất (Worst / Largest)',
        icon: '⚠️',
        features: [
            { name: 'worst radius', label: 'Bán kính lớn nhất' },
            { name: 'worst texture', label: 'Độ nhám lớn nhất' },
            { name: 'worst perimeter', label: 'Chu vi lớn nhất' },
            { name: 'worst area', label: 'Diện tích lớn nhất' },
            { name: 'worst smoothness', label: 'Độ mịn lớn nhất' },
            { name: 'worst compactness', label: 'Độ đặc lớn nhất' },
            { name: 'worst concavity', label: 'Độ lõm lớn nhất' },
            { name: 'worst concave points', label: 'Điểm lõm lớn nhất' },
            { name: 'worst symmetry', label: 'Đối xứng lớn nhất' },
            { name: 'worst fractal dimension', label: 'Fractal lớn nhất' },
        ],
    },
];

const ALL_FEATURE_NAMES = FEATURE_GROUPS.flatMap((g) => g.features.map((f) => f.name));

const RADAR_ITEMS = [
    { name: 'mean radius', label: 'Bán kính' },
    { name: 'mean texture', label: 'Độ nhám' },
    { name: 'mean perimeter', label: 'Chu vi' },
    { name: 'mean area', label: 'Diện tích' },
    { name: 'mean smoothness', label: 'Độ mịn' },
    { name: 'mean compactness', label: 'Độ đặc' },
    { name: 'mean concavity', label: 'Độ lõm' },
    { name: 'mean concave points', label: 'Điểm lõm' },
    { name: 'mean symmetry', label: 'Đối xứng' },
    { name: 'mean fractal dimension', label: 'Fractal' },
];

/* ─── Preset sample values from WDBC dataset ─── */
const BENIGN_SAMPLE = {
    'mean radius': 13.54, 'mean texture': 14.36, 'mean perimeter': 87.46,
    'mean area': 566.3, 'mean smoothness': 0.09779, 'mean compactness': 0.08129,
    'mean concavity': 0.06664, 'mean concave points': 0.04781,
    'mean symmetry': 0.1885, 'mean fractal dimension': 0.05766,
    'radius error': 0.2699, 'texture error': 0.7886, 'perimeter error': 2.058,
    'area error': 23.56, 'smoothness error': 0.008462,
    'compactness error': 0.0146, 'concavity error': 0.02387,
    'concave points error': 0.01315, 'symmetry error': 0.0198,
    'fractal dimension error': 0.0023, 'worst radius': 15.11,
    'worst texture': 19.26, 'worst perimeter': 99.7, 'worst area': 711.2,
    'worst smoothness': 0.144, 'worst compactness': 0.1773,
    'worst concavity': 0.239, 'worst concave points': 0.1288,
    'worst symmetry': 0.2977, 'worst fractal dimension': 0.07259,
};

const MALIGNANT_SAMPLE = {
    'mean radius': 17.99, 'mean texture': 10.38, 'mean perimeter': 122.8,
    'mean area': 1001, 'mean smoothness': 0.1184, 'mean compactness': 0.2776,
    'mean concavity': 0.3001, 'mean concave points': 0.1471,
    'mean symmetry': 0.2419, 'mean fractal dimension': 0.07871,
    'radius error': 1.095, 'texture error': 0.9053, 'perimeter error': 8.589,
    'area error': 153.4, 'smoothness error': 0.006399,
    'compactness error': 0.04904, 'concavity error': 0.05373,
    'concave points error': 0.01587, 'symmetry error': 0.03003,
    'fractal dimension error': 0.006193, 'worst radius': 25.38,
    'worst texture': 17.33, 'worst perimeter': 184.6, 'worst area': 2019,
    'worst smoothness': 0.1622, 'worst compactness': 0.6656,
    'worst concavity': 0.7119, 'worst concave points': 0.2654,
    'worst symmetry': 0.4601, 'worst fractal dimension': 0.1189,
};

/* ─── State ─── */
let authToken = localStorage.getItem(TOKEN_KEY);
let currentEmail = localStorage.getItem(EMAIL_KEY) || '';
let isOwner = localStorage.getItem(OWNER_KEY) === '1';
let authMode = 'login';
let metadata = null;
let metricsPayload = null;
let toastTimeout = null;
let lastPredictionResult = null;
let lastPredictionFeatures = null;

const byId = (id) => document.getElementById(id);
const percent = (v, d = 1) => `${(Number(v) * 100).toFixed(d)}%`;
const number = (v, d = 3) => Number(v).toFixed(d);

/* ─── Cursor Glow Effect (Signature DA1) ─── */
function initCursorGlow() {
    const glow = byId('cursor-glow');
    if (!glow) return;
    let rafId = null;
    let targetX = 0, targetY = 0;

    window.addEventListener('mousemove', (e) => {
        targetX = e.clientX;
        targetY = e.clientY;
        glow.classList.add('active');
        if (!rafId) {
            rafId = requestAnimationFrame(() => {
                glow.style.left = `${targetX}px`;
                glow.style.top = `${targetY}px`;
                rafId = null;
            });
        }
    });

    document.addEventListener('mouseleave', () => glow.classList.remove('active'));
}

/* ─── Bio Particles (Signature DA1 floating effect) ─── */
function initBioParticles() {
    const container = byId('particles-container');
    if (!container) return;

    function spawnParticle() {
        const p = document.createElement('div');
        p.className = 'bio-particle';
        const size = Math.random() * 10 + 6;
        p.style.width = `${size}px`;
        p.style.height = `${size}px`;
        p.style.left = `${Math.random() * 100}vw`;
        const dur = Math.random() * 14 + 10;
        p.style.animationDuration = `${dur}s`;
        container.appendChild(p);

        setTimeout(() => p.remove(), dur * 1000);
    }

    // Spawn 14 initial particles, then interval
    for (let i = 0; i < 12; i++) {
        setTimeout(spawnParticle, i * 600);
    }
    setInterval(spawnParticle, 3200);
}

/* ─── Theme Switcher (Light / Dark) ─── */
function initTheme() {
    const saved = localStorage.getItem(THEME_KEY) || 'light';
    setTheme(saved, false);
}

function setTheme(theme, save = true) {
    document.documentElement.setAttribute('data-theme', theme);
    const icon = byId('theme-icon');
    if (icon) icon.textContent = theme === 'dark' ? '☀️' : '🌙';
    if (save) localStorage.setItem(THEME_KEY, theme);
    if (lastPredictionFeatures) {
        drawRadarChart(lastPredictionFeatures, lastPredictionResult);
    }
}

function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme') || 'light';
    setTheme(current === 'dark' ? 'light' : 'dark', true);
}

/* ─── Toast Notifications ─── */
function showToast(msg, type = 'info') {
    const toast = byId('toast-msg');
    if (!toast) return;
    toast.textContent = msg;
    toast.className = 'toast-msg show';
    if (type === 'success') toast.classList.add('success');
    if (type === 'warning') toast.classList.add('warning');

    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
        toast.classList.remove('show');
    }, 3400);
}

/* ─── JWT Parsing ─── */
function parseJwt(token) {
    try {
        const body = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
        const padded = body.padEnd(Math.ceil(body.length / 4) * 4, '=');
        return JSON.parse(decodeURIComponent(atob(padded).split('').map(
            (char) => `%${char.charCodeAt(0).toString(16).padStart(2, '0')}`,
        ).join('')));
    } catch {
        return null;
    }
}

function authHeaders(extra = {}) {
    return authToken ? { ...extra, Authorization: `Bearer ${authToken}` } : extra;
}

async function apiFetch(path, options = {}) {
    if (!API_BASE) throw new Error('Chưa cấu hình API_BASE.');
    const response = await fetch(`${API_BASE}${path}`, {
        ...options,
        headers: authHeaders(options.headers || {}),
    });
    if (response.status === 401 && authToken) {
        logout(false);
        openAuth();
        showToast('Phiên đăng nhập đã hết hạn.', 'warning');
    }
    return response;
}

async function idpFetch(path, options = {}) {
    if (!IDP_BASE) throw new Error('Chưa cấu hình IDP_BASE.');
    return fetch(`${IDP_BASE}${path}`, options);
}

async function parseError(response) {
    try {
        const payload = await response.json();
        if (typeof payload.detail === 'string') return payload.detail;
        if (payload.detail && typeof payload.detail === 'object') {
            const parts = [];
            if (payload.detail.missing_fields?.length) parts.push(`Thiếu: ${payload.detail.missing_fields.join(', ')}`);
            if (payload.detail.invalid_fields?.length) parts.push(`Không hợp lệ: ${payload.detail.invalid_fields.join(', ')}`);
            if (payload.detail.out_of_range_fields?.length) parts.push(`Ngoài phạm vi: ${payload.detail.out_of_range_fields.join(', ')}`);
            if (parts.length) return parts.join('. ');
        }
    } catch {
        // Fallback
    }
    return `Yêu cầu thất bại (${response.status}).`;
}

/* ─── Tab Switching ─── */
function switchTab(name) {
    if ((name === 'history' || name === 'profile') && !authToken) {
        openAuth();
        return;
    }
    if (name === 'admin' && !isOwner) return;

    document.querySelectorAll('.tab-btn').forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.tab === name);
        btn.setAttribute('aria-selected', btn.dataset.tab === name ? 'true' : 'false');
    });

    document.querySelectorAll('.tab-panel').forEach((panel) => {
        panel.classList.toggle('active', panel.id === `panel-${name}`);
    });

    window.location.hash = name;

    if (name === 'metrics') loadMetrics();
    if (name === 'history') loadHistory();
    if (name === 'profile') loadProfile();
    if (name === 'admin') loadAdmin();

    window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ─── Auth UI & Session ─── */
function updateAuthUi() {
    const signedIn = Boolean(authToken);
    document.querySelectorAll('.auth-only').forEach((el) => el.classList.toggle('is-hidden', !signedIn));
    document.querySelectorAll('.owner-only').forEach((el) => el.classList.toggle('is-hidden', !signedIn || !isOwner));
    byId('open-auth').classList.toggle('is-hidden', signedIn);
    byId('account-chip').classList.toggle('is-hidden', !signedIn);
    byId('login-required').classList.toggle('is-hidden', signedIn);

    if (signedIn) {
        const payload = parseJwt(authToken) || {};
        currentEmail = currentEmail || payload.email || '';
        isOwner = isOwner || payload.is_owner === true;
        byId('header-email').textContent = currentEmail || 'Tài khoản';
        byId('header-avatar').textContent = (currentEmail || 'U').charAt(0).toUpperCase();
        localStorage.setItem(EMAIL_KEY, currentEmail);
        localStorage.setItem(OWNER_KEY, isOwner ? '1' : '0');
    }
}

function saveSession(token, user = {}) {
    const payload = parseJwt(token) || {};
    authToken = token;
    currentEmail = user.email || payload.email || '';
    isOwner = Boolean(user.is_owner || payload.is_owner);
    localStorage.setItem(TOKEN_KEY, authToken);
    localStorage.setItem(EMAIL_KEY, currentEmail);
    localStorage.setItem(OWNER_KEY, isOwner ? '1' : '0');
    updateAuthUi();
}

function logout(notify = true) {
    authToken = null;
    currentEmail = '';
    isOwner = false;
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(EMAIL_KEY);
    localStorage.removeItem(OWNER_KEY);
    updateAuthUi();
    if (['history', 'profile', 'admin'].includes(window.location.hash.slice(1))) {
        switchTab('predict');
    }
    if (notify) showToast('Đã đăng xuất.', 'info');
}

function setAuthMode(mode) {
    authMode = mode;
    const registering = mode === 'register';
    byId('auth-title').textContent = registering ? 'Tạo tài khoản' : 'Đăng nhập';
    byId('auth-subtitle').textContent = registering
        ? 'Tạo tài khoản dùng chung cho các dự án Học máy.'
        : 'Dùng tài khoản chung để lưu lịch sử phân tích.';
    byId('auth-submit').textContent = registering ? 'Đăng ký' : 'Đăng nhập';
    byId('auth-switch').textContent = registering
        ? 'Đã có tài khoản? Đăng nhập'
        : 'Chưa có tài khoản? Đăng ký';
    byId('auth-error').textContent = '';
}

function openAuth() {
    byId('auth-overlay').classList.remove('is-hidden');
    document.body.style.overflow = 'hidden';
    byId('auth-email').focus();
}

function closeAuth() {
    byId('auth-overlay').classList.add('is-hidden');
    document.body.style.overflow = '';
}

async function submitAuth(event) {
    event.preventDefault();
    const email = byId('auth-email').value.trim();
    const password = byId('auth-password').value;
    const submit = byId('auth-submit');
    const errEl = byId('auth-error');
    errEl.textContent = '';

    if (!email || !password) {
        errEl.textContent = 'Vui lòng điền email và mật khẩu.';
        return;
    }

    submit.disabled = true;
    submit.textContent = 'Đang xử lý…';

    try {
        const response = await idpFetch(`/${authMode}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password, client_id: CLIENT_ID }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(typeof payload.detail === 'string' ? payload.detail : 'Không thể xác thực.');

        if (authMode === 'register') {
            setAuthMode('login');
            byId('auth-email').value = email;
            showToast('Đăng ký thành công! Hãy đăng nhập.', 'success');
        } else {
            if (!payload.access_token) throw new Error('Thiếu access_token từ IdP.');
            saveSession(payload.access_token, payload.user || {});
            closeAuth();
            byId('auth-password').value = '';
            showToast('Đăng nhập thành công!', 'success');
        }
    } catch (err) {
        errEl.textContent = err.message || 'Lỗi kết nối IdP.';
    } finally {
        submit.disabled = false;
        submit.textContent = authMode === 'register' ? 'Đăng ký' : 'Đăng nhập';
    }
}

/* ─── Render 30 Feature Input Fields ─── */
function renderFeatureInputs() {
    const container = byId('feature-groups-container');
    if (!container) return;
    container.replaceChildren();

    FEATURE_GROUPS.forEach((group) => {
        const box = document.createElement('div');
        box.className = 'feature-group-box';

        const header = document.createElement('div');
        header.className = 'feature-group-header';
        header.innerHTML = `<span class="feature-group-title">${group.icon} ${group.title}</span>`;
        box.appendChild(header);

        const grid = document.createElement('div');
        grid.className = 'inputs-subgrid';

        group.features.forEach((feat) => {
            const field = document.createElement('div');
            field.className = 'inp-field';

            const label = document.createElement('label');
            label.htmlFor = `input-${feat.name.replaceAll(' ', '-')}`;
            label.innerHTML = `<span>${feat.label}</span> <span class="inp-range-hint" data-hint-for="${feat.name}">[số]</span>`;

            const input = document.createElement('input');
            input.id = label.htmlFor;
            input.name = feat.name;
            input.type = 'number';
            input.step = 'any';
            input.inputMode = 'decimal';
            input.className = 'val-inp';
            input.required = true;

            field.append(label, input);
            grid.appendChild(field);
        });

        box.appendChild(grid);
        container.appendChild(box);
    });
}

function applyFeatureRanges(ranges) {
    if (!ranges) return;
    ALL_FEATURE_NAMES.forEach((name) => {
        const bounds = ranges[name];
        if (!bounds) return;
        const input = document.querySelector(`[name="${name}"]`);
        const hint = document.querySelector(`[data-hint-for="${name}"]`);
        if (input) {
            input.min = bounds.minimum;
            input.max = bounds.maximum;
        }
        if (hint) {
            hint.textContent = `${bounds.minimum} ~ ${bounds.maximum}`;
        }
    });
}

function loadSample(sample) {
    ALL_FEATURE_NAMES.forEach((name) => {
        const input = document.querySelector(`[name="${name}"]`);
        if (input) {
            input.value = sample[name];
            input.removeAttribute('aria-invalid');
        }
    });
    byId('form-error').textContent = '';
    showToast('Đã nạp mẫu dữ liệu minh hoạ.', 'info');
}

function collectFeatures() {
    const features = {};
    const invalid = [];
    ALL_FEATURE_NAMES.forEach((name) => {
        const input = document.querySelector(`[name="${name}"]`);
        if (!input) return;
        const val = Number(input.value);
        const hasVal = input.value.trim() !== '';
        const inRange = !metadata?.feature_ranges?.[name]
            || (val >= metadata.feature_ranges[name].minimum && val <= metadata.feature_ranges[name].maximum);
        const valid = hasVal && Number.isFinite(val) && inRange;

        input.setAttribute('aria-invalid', valid ? 'false' : 'true');
        if (valid) features[name] = val;
        else invalid.push(name);
    });

    if (invalid.length) {
        throw new Error(`Kiểm tra lại ${invalid.length} trường chưa hợp lệ (ngoài phạm vi hoặc còn trống).`);
    }
    return features;
}

/* ─── Confetti Animation (on Benign diagnosis) ─── */
function fireConfetti() {
    const canvas = byId('confetti-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    canvas.style.display = 'block';

    const particles = [];
    const colors = ['#593E67', '#84495F', '#B85B56', '#DE741C', '#FEA837', '#10b981'];
    for (let i = 0; i < 90; i++) {
        particles.push({
            x: canvas.width * 0.5 + (Math.random() - 0.5) * 200,
            y: canvas.height * 0.4 + (Math.random() - 0.5) * 80,
            vx: (Math.random() - 0.5) * 14,
            vy: -Math.random() * 12 - 4,
            size: Math.random() * 8 + 4,
            color: colors[Math.floor(Math.random() * colors.length)],
            rot: Math.random() * Math.PI * 2,
            vRot: (Math.random() - 0.5) * 0.2,
            alpha: 1,
        });
    }

    let start = null;
    function animate(ts) {
        if (!start) start = ts;
        const elapsed = ts - start;
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        let alive = false;
        particles.forEach((p) => {
            p.x += p.vx;
            p.y += p.vy;
            p.vy += 0.35;
            p.rot += p.vRot;
            if (elapsed > 1200) p.alpha -= 0.02;
            if (p.alpha > 0) {
                alive = true;
                ctx.save();
                ctx.globalAlpha = Math.max(0, p.alpha);
                ctx.translate(p.x, p.y);
                ctx.rotate(p.rot);
                ctx.fillStyle = p.color;
                ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
                ctx.restore();
            }
        });

        if (alive && elapsed < 3200) {
            requestAnimationFrame(animate);
        } else {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            canvas.style.display = 'none';
        }
    }
    requestAnimationFrame(animate);
}

/* ─── Canvas Radar Chart ─── */
function drawRadarChart(features, result) {
    const box = byId('radar-box');
    const canvas = byId('radar-canvas');
    if (!box || !canvas) return;
    box.classList.remove('is-hidden');

    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const cx = w / 2;
    const cy = h / 2 - 4;
    const radius = Math.min(cx, cy) - 36;
    const count = RADAR_ITEMS.length;
    const angleStep = (Math.PI * 2) / count;

    // Rings
    const rings = 4;
    ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(89,62,103,0.1)';
    ctx.lineWidth = 1;
    for (let r = 1; r <= rings; r++) {
        const curR = (radius / rings) * r;
        ctx.beginPath();
        for (let i = 0; i < count; i++) {
            const angle = i * angleStep - Math.PI / 2;
            const x = cx + Math.cos(angle) * curR;
            const y = cy + Math.sin(angle) * curR;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.stroke();
    }

    // Axes & Labels
    ctx.fillStyle = isDark ? '#a08aaa' : '#6e5570';
    ctx.font = '10px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (let i = 0; i < count; i++) {
        const angle = i * angleStep - Math.PI / 2;
        const x = cx + Math.cos(angle) * radius;
        const y = cy + Math.sin(angle) * radius;

        ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(89,62,103,0.1)';
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(x, y);
        ctx.stroke();

        const lx = cx + Math.cos(angle) * (radius + 18);
        const ly = cy + Math.sin(angle) * (radius + 18);
        ctx.fillText(RADAR_ITEMS[i].label, lx, ly);
    }

    // Data points
    const pts = [];
    RADAR_ITEMS.forEach((item, i) => {
        const val = Number(features[item.name]) || 0;
        const range = metadata?.feature_ranges?.[item.name];
        let norm = 0.5;
        if (range && range.maximum > range.minimum) {
            norm = (val - range.minimum) / (range.maximum - range.minimum);
            norm = Math.max(0.08, Math.min(1.0, norm));
        }
        const curR = radius * norm;
        const angle = i * angleStep - Math.PI / 2;
        pts.push({ x: cx + Math.cos(angle) * curR, y: cy + Math.sin(angle) * curR });
    });

    const isMal = result.predicted_label === 'malignant' || result.decision === 'malignant';
    const stroke = isMal ? '#e11d48' : '#059669';
    const fill = isMal ? 'rgba(225, 29, 72, 0.25)' : 'rgba(5, 150, 105, 0.25)';

    ctx.beginPath();
    pts.forEach((p, i) => {
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
    });
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 2.2;
    ctx.stroke();

    ctx.fillStyle = stroke;
    pts.forEach((p) => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
        ctx.fill();
    });
}

/* ─── Render Prediction Results ─── */
function renderPrediction(result, features) {
    lastPredictionResult = result;
    lastPredictionFeatures = features;
    const isMalignant = result.predicted_label === 'malignant' || result.decision === 'malignant';

    byId('result-empty').classList.add('is-hidden');
    byId('result-content').classList.remove('is-hidden');

    const resultBox = byId('result-box');
    resultBox.classList.toggle('is-malignant', isMalignant);

    const badge = byId('result-badge');
    badge.textContent = isMalignant ? '🔴 Cảnh báo: Ác tính' : '🟢 Kết luận: Lành tính';

    byId('result-title').textContent = isMalignant ? 'Khối u Ác tính' : 'Khối u Lành tính';
    byId('result-decision').textContent = isMalignant
        ? `Xác suất ác tính (${percent(result.probability_malignant, 2)}) ≥ Ngưỡng tối ưu độ nhạy (${number(result.threshold, 4)}).`
        : `Xác suất ác tính (${percent(result.probability_malignant, 2)}) < Ngưỡng khoá (${number(result.threshold, 4)}).`;

    byId('prob-malignant-val').textContent = percent(result.probability_malignant, 2);
    byId('prob-benign-val').textContent = percent(result.probability_benign, 2);

    byId('prob-malignant-bar').style.width = percent(result.probability_malignant, 2);
    byId('prob-benign-bar').style.width = percent(result.probability_benign, 2);

    byId('res-meta-threshold').textContent = number(result.threshold, 4);
    byId('res-meta-version').textContent = result.model_version;

    if (features) drawRadarChart(features, result);

    if (!isMalignant) {
        fireConfetti();
    }
}

async function submitPrediction(event) {
    event.preventDefault();
    if (!authToken) {
        openAuth();
        return;
    }

    const btn = byId('predict-button');
    const btnText = byId('predict-btn-text');
    byId('form-error').textContent = '';

    try {
        const features = collectFeatures();
        btn.disabled = true;
        btnText.textContent = '⏳ Đang phân tích mẫu…';

        const response = await apiFetch('/predict', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ features }),
        });

        if (!response.ok) throw new Error(await parseError(response));
        const result = await response.json();
        renderPrediction(result, features);
        showToast('Hoàn tất phân tích mẫu!', 'success');
    } catch (err) {
        byId('form-error').textContent = err.message || 'Không thể thực hiện phân tích.';
    } finally {
        btn.disabled = false;
        btnText.textContent = '🔬 Phân tích mẫu';
    }
}

function resetPrediction() {
    setTimeout(() => {
        document.querySelectorAll('#prediction-form input').forEach((i) => i.removeAttribute('aria-invalid'));
        byId('result-content').classList.add('is-hidden');
        byId('result-empty').classList.remove('is-hidden');
        byId('radar-box').classList.add('is-hidden');
        byId('form-error').textContent = '';
        lastPredictionResult = null;
        lastPredictionFeatures = null;
    }, 0);
}

function copyPredictionResult() {
    if (!lastPredictionResult) return;
    const r = lastPredictionResult;
    const label = r.predicted_label === 'malignant' ? 'Ác tính (Malignant)' : 'Lành tính (Benign)';
    const text = `[Kết quả phân tích Breast Cancer SVM · WDBC]
- Đánh giá: ${label}
- P(Ác tính): ${percent(r.probability_malignant, 2)}
- P(Lành tính): ${percent(r.probability_benign, 2)}
- Ngưỡng quyết định: ${number(r.threshold, 4)}
- Phiên bản mô hình: ${r.model_version}
- Thời gian phân tích: ${new Date().toLocaleString('vi-VN')}
* Lưu ý: Kết quả mô phỏng học máy, không thay thế chẩn đoán y khoa.`;

    navigator.clipboard.writeText(text).then(() => {
        showToast('Đã sao chép kết quả vào clipboard!', 'success');
    }).catch(() => {
        showToast('Không thể sao chép.', 'warning');
    });
}

/* ─── Health & Metadata Check ─── */
async function checkHealthAndMetadata() {
    const statusBox = byId('api-status');
    const statusLabel = byId('status-label');

    statusBox.className = 'api-status warming';
    statusLabel.textContent = 'Kết nối...';

    if (!API_BASE || !IDP_BASE) {
        statusBox.className = 'api-status offline';
        statusLabel.textContent = 'Thiếu cấu hình';
        return;
    }

    try {
        const [hRes, mRes] = await Promise.all([
            apiFetch('/health'),
            apiFetch('/metadata'),
        ]);

        if (!hRes.ok || !mRes.ok) throw new Error('API chưa phản hồi');
        const health = await hRes.json();
        metadata = await mRes.json();

        statusBox.className = 'api-status online';
        statusLabel.textContent = 'Sẵn sàng';
        byId('hero-threshold').textContent = number(health.threshold, 4);

        applyFeatureRanges(metadata.feature_ranges);

        // Fetch metrics to populate hero stats
        apiFetch('/metrics').then(async (res) => {
            if (res.ok) {
                metricsPayload = await res.json();
                const cvSens = metricsPayload.metrics?.oof_cross_validation?.sensitivity_malignant;
                if (cvSens != null) {
                    byId('hero-cv-sens').textContent = percent(cvSens, 1);
                }
            }
        }).catch(() => {});
    } catch {
        statusBox.className = 'api-status offline';
        statusLabel.textContent = 'Mất kết nối';
    }
}

/* ─── Metrics View ─── */
function renderMetrics(payload) {
    const test = payload.metrics?.test || {};
    const grid = byId('metrics-stat-grid');
    grid.replaceChildren();

    const stats = [
        { label: 'Độ nhạy ác tính (Sensitivity)', val: test.sensitivity_malignant },
        { label: 'Độ đặc hiệu lành tính (Specificity)', val: test.specificity_benign },
        { label: 'ROC-AUC (Test)', val: test.roc_auc_malignant },
        { label: 'PR-AUC (Test)', val: test.pr_auc_malignant },
    ];

    stats.forEach((s) => {
        const card = document.createElement('div');
        card.className = 'metric-card';
        card.innerHTML = `<span>${s.label}</span><strong>${percent(s.val, 2)}</strong>`;
        grid.appendChild(card);
    });

    // Confusion matrix
    const matrix = test.confusion_matrix?.matrix || test.confusion_matrix || [[0, 0], [0, 0]];
    const cmDiv = byId('confusion-matrix-display');
    cmDiv.replaceChildren();

    const cells = [
        ['', 'Dự đoán Ác', 'Dự đoán Lành'],
        ['Thật Ác', matrix[0][0], matrix[0][1]],
        ['Thật Lành', matrix[1][0], matrix[1][1]],
    ];

    cells.flat().forEach((val, idx) => {
        const d = document.createElement('div');
        const row = Math.floor(idx / 3);
        const col = idx % 3;
        if (row === 0 || col === 0) {
            d.className = 'm-cell label';
        } else if (row === col) {
            d.className = 'm-cell hit';
        } else {
            d.className = 'm-cell miss';
        }
        d.textContent = val;
        cmDiv.appendChild(d);
    });

    const params = metadata?.best_params || {};
    byId('param-c').textContent = params.svc__C ?? params.C ?? '1.0';
    byId('param-gamma').textContent = params.svc__gamma ?? params.gamma ?? 'scale';
    byId('param-threshold').textContent = number(payload.threshold, 4);

    byId('metrics-loading').classList.add('is-hidden');
    byId('metrics-view').classList.remove('is-hidden');
}

async function loadMetrics() {
    if (metricsPayload) {
        renderMetrics(metricsPayload);
        return;
    }
    try {
        const res = await apiFetch('/metrics');
        if (!res.ok) throw new Error(await parseError(res));
        metricsPayload = await res.json();
        renderMetrics(metricsPayload);
    } catch (err) {
        byId('metrics-loading').textContent = err.message || 'Không thể tải chỉ số.';
    }
}

/* ─── History ─── */
function renderHistory(records) {
    const tbody = byId('history-table-body');
    tbody.replaceChildren();
    byId('history-empty').classList.toggle('is-hidden', records.length > 0);

    records.forEach((r) => {
        const tr = document.createElement('tr');
        const isMal = r.predicted_label === 'malignant';

        const tdTime = document.createElement('td');
        const d = new Date(r.created_at);
        tdTime.textContent = Number.isNaN(d.getTime()) ? String(r.created_at) : d.toLocaleString('vi-VN');

        const tdLabel = document.createElement('td');
        tdLabel.innerHTML = `<span class="label-pill ${isMal ? 'malignant' : 'benign'}">${isMal ? 'Ác tính' : 'Lành tính'}</span>`;

        const tdMal = document.createElement('td');
        tdMal.textContent = percent(r.probability_malignant, 2);

        const tdBen = document.createElement('td');
        tdBen.textContent = percent(r.probability_benign, 2);

        const tdThresh = document.createElement('td');
        tdThresh.textContent = number(r.threshold, 4);

        const tdVer = document.createElement('td');
        tdVer.textContent = r.model_version;

        tr.append(tdTime, tdLabel, tdMal, tdBen, tdThresh, tdVer);
        tbody.appendChild(tr);
    });

    byId('profile-prediction-count').textContent = records.length;
}

async function loadHistory() {
    if (!authToken) return;
    const msg = byId('history-msg');
    msg.textContent = 'Đang tải lịch sử…';
    try {
        const res = await apiFetch('/predictions');
        if (!res.ok) throw new Error(await parseError(res));
        renderHistory(await res.json());
        msg.textContent = '';
    } catch (err) {
        msg.textContent = err.message || 'Không thể tải lịch sử.';
    }
}

async function clearHistory() {
    if (!window.confirm('Xoá vĩnh viễn toàn bộ lịch sử dự đoán của bạn?')) return;
    try {
        const res = await apiFetch('/predictions', { method: 'DELETE' });
        if (!res.ok) throw new Error(await parseError(res));
        const data = await res.json();
        renderHistory([]);
        showToast(`Đã xoá ${data.deleted ?? 0} bản ghi.`, 'success');
    } catch (err) {
        showToast(err.message || 'Lỗi khi xoá lịch sử.', 'warning');
    }
}

async function exportHistory() {
    const btn = byId('export-history');
    btn.disabled = true;
    try {
        const res = await apiFetch('/predictions/export');
        if (!res.ok) throw new Error(await parseError(res));
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'breast_cancer_svm_predictions.xlsx';
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        showToast('Đã tải xuống tệp Excel!', 'success');
    } catch (err) {
        showToast(err.message || 'Lỗi xuất Excel.', 'warning');
    } finally {
        btn.disabled = false;
    }
}

/* ─── Profile ─── */
async function loadProfile() {
    if (!authToken) return;
    const jwt = parseJwt(authToken) || {};
    let prof = { email: currentEmail || jwt.email, id: jwt.sub, is_owner: isOwner };

    try {
        const res = await idpFetch('/me', { headers: authHeaders() });
        if (res.ok) prof = { ...prof, ...(await res.json()) };
    } catch {
        // Fallback to local JWT
    }

    const email = prof.email || currentEmail || '—';
    byId('profile-email-text').textContent = email;
    byId('profile-avatar-large').textContent = email.charAt(0).toUpperCase();
    byId('profile-id-code').textContent = prof.id ?? prof.sub ?? '—';
    byId('profile-role-chip').textContent = prof.is_owner || isOwner ? '👑 Chủ sở hữu' : '👤 Người dùng';

    try {
        const hRes = await apiFetch('/predictions');
        if (hRes.ok) byId('profile-prediction-count').textContent = (await hRes.json()).length;
    } catch {
        byId('profile-prediction-count').textContent = '—';
    }
}

/* ─── Admin (Owner only) ─── */
async function loadAdmin() {
    if (!authToken || !isOwner) return;
    const msg = byId('admin-status-msg');
    msg.textContent = 'Đang tải dữ liệu quản trị…';

    try {
        const [uRes, pRes] = await Promise.all([
            idpFetch('/admin/users', { headers: authHeaders() }),
            apiFetch('/admin/predictions'),
        ]);

        if (!uRes.ok) throw new Error(`IdP: ${await parseError(uRes)}`);
        if (!pRes.ok) throw new Error(`API: ${await parseError(pRes)}`);

        const uData = await uRes.json();
        const pData = await pRes.json();

        const users = Array.isArray(uData) ? uData : uData.users || [];
        const preds = Array.isArray(pData) ? pData : pData.records || [];

        byId('admin-user-count').textContent = `${users.length} tài khoản`;
        byId('admin-prediction-count').textContent = `${preds.length} lượt`;

        const uTbody = byId('admin-users-table');
        uTbody.replaceChildren();
        users.forEach((u) => {
            const tr = document.createElement('tr');
            tr.innerHTML = `<td><strong>${u.email}</strong></td><td><code>${u.id ?? u.sub}</code></td><td>${u.is_owner ? '👑 Chủ sở hữu' : 'Người dùng'}</td><td>${u.last_login_at ? new Date(u.last_login_at).toLocaleString('vi-VN') : '—'}</td>`;
            uTbody.appendChild(tr);
        });

        const pTbody = byId('admin-predictions-table');
        pTbody.replaceChildren();
        preds.forEach((p) => {
            const tr = document.createElement('tr');
            const isMal = p.predicted_label === 'malignant';
            tr.innerHTML = `<td>${new Date(p.created_at).toLocaleString('vi-VN')}</td><td><span class="label-pill ${isMal ? 'malignant' : 'benign'}">${isMal ? 'Ác tính' : 'Lành tính'}</span></td><td>${percent(p.probability_malignant, 2)}</td><td>${number(p.threshold, 4)}</td><td>${p.model_version}</td>`;
            pTbody.appendChild(tr);
        });

        msg.textContent = '';
    } catch (err) {
        msg.textContent = err.message || 'Lỗi tải dữ liệu quản trị.';
    }
}

/* ─── Event Listeners ─── */
function bindEvents() {
    document.querySelectorAll('.tab-btn').forEach((btn) => {
        btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });

    document.querySelectorAll('[data-tab-target]').forEach((el) => {
        el.addEventListener('click', () => switchTab(el.dataset.tabTarget));
    });

    document.querySelectorAll('[data-open-auth]').forEach((btn) => btn.addEventListener('click', openAuth));
    byId('open-auth').addEventListener('click', openAuth);
    byId('close-auth').addEventListener('click', closeAuth);
    byId('auth-overlay').addEventListener('click', (e) => {
        if (e.target === byId('auth-overlay')) closeAuth();
    });

    byId('auth-switch').addEventListener('click', () => {
        setAuthMode(authMode === 'login' ? 'register' : 'login');
    });
    byId('auth-form').addEventListener('submit', submitAuth);

    byId('toggle-password').addEventListener('click', () => {
        const inp = byId('auth-password');
        const show = inp.type === 'text';
        inp.type = show ? 'password' : 'text';
        byId('toggle-password').textContent = show ? 'Hiện' : 'Ẩn';
    });

    byId('theme-toggle').addEventListener('click', toggleTheme);
    byId('prediction-form').addEventListener('submit', submitPrediction);
    byId('prediction-form').addEventListener('reset', resetPrediction);

    byId('load-benign').addEventListener('click', () => loadSample(BENIGN_SAMPLE));
    byId('load-malignant').addEventListener('click', () => loadSample(MALIGNANT_SAMPLE));
    byId('copy-result').addEventListener('click', copyPredictionResult);

    byId('clear-history').addEventListener('click', clearHistory);
    byId('export-history').addEventListener('click', exportHistory);
    byId('logout-button').addEventListener('click', () => logout());

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !byId('auth-overlay').classList.contains('is-hidden')) {
            closeAuth();
        }
    });

    window.addEventListener('resize', () => {
        if (lastPredictionFeatures) {
            drawRadarChart(lastPredictionFeatures, lastPredictionResult);
        }
    });
}

function init() {
    initTheme();
    initCursorGlow();
    initBioParticles();
    renderFeatureInputs();
    bindEvents();
    updateAuthUi();
    checkHealthAndMetadata();

    const hash = window.location.hash.slice(1);
    const validTabs = ['predict', 'metrics', 'svm', 'history', 'profile', 'about', 'admin'];
    if (validTabs.includes(hash)) switchTab(hash);
}

document.addEventListener('DOMContentLoaded', init);
