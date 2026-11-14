'use strict';

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

const FEATURE_GROUPS = [
    {
        key: 'mean',
        title: 'Giá trị trung bình (Mean)',
        features: [
            'mean radius', 'mean texture', 'mean perimeter', 'mean area',
            'mean smoothness', 'mean compactness', 'mean concavity',
            'mean concave points', 'mean symmetry', 'mean fractal dimension',
        ],
    },
    {
        key: 'error',
        title: 'Sai số chuẩn (Standard Error)',
        features: [
            'radius error', 'texture error', 'perimeter error', 'area error',
            'smoothness error', 'compactness error', 'concavity error',
            'concave points error', 'symmetry error', 'fractal dimension error',
        ],
    },
    {
        key: 'worst',
        title: 'Giá trị lớn nhất (Worst)',
        features: [
            'worst radius', 'worst texture', 'worst perimeter', 'worst area',
            'worst smoothness', 'worst compactness', 'worst concavity',
            'worst concave points', 'worst symmetry', 'worst fractal dimension',
        ],
    },
];

const RADAR_FEATURES = [
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

const FEATURE_NAMES = FEATURE_GROUPS.flatMap((group) => group.features);

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

let authToken = localStorage.getItem(TOKEN_KEY);
let currentEmail = localStorage.getItem(EMAIL_KEY) || '';
let isOwner = localStorage.getItem(OWNER_KEY) === '1';
let authMode = 'login';
let metadata = null;
let metricsPayload = null;
let toastTimer = null;
let lastPredictionResult = null;
let lastPredictionFeatures = null;

const byId = (id) => document.getElementById(id);
const percent = (value, digits = 1) => `${(Number(value) * 100).toFixed(digits)}%`;
const number = (value, digits = 3) => Number(value).toFixed(digits);

/* ── JWT & Theme ────────────────────────────────────────── */
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

function initTheme() {
    const savedTheme = localStorage.getItem(THEME_KEY) || 'light';
    setTheme(savedTheme, false);
}

function setTheme(theme, save = true) {
    document.documentElement.setAttribute('data-theme', theme);
    const toggleBtn = byId('theme-toggle');
    if (toggleBtn) {
        toggleBtn.textContent = theme === 'dark' ? '☀️' : '🌙';
        toggleBtn.setAttribute('title', theme === 'dark' ? 'Chuyển sang chế độ sáng' : 'Chuyển sang chế độ tối');
    }
    if (save) {
        localStorage.setItem(THEME_KEY, theme);
    }
    if (lastPredictionFeatures) {
        drawRadarChart(lastPredictionFeatures, lastPredictionResult);
    }
}

function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme') || 'light';
    const next = current === 'dark' ? 'light' : 'dark';
    setTheme(next, true);
}

/* ── Toast ──────────────────────────────────────────────── */
function showToast(message, type = 'info') {
    const toast = byId('toast');
    if (!toast) return;
    toast.textContent = message;
    toast.className = 'toast is-visible';
    if (type === 'success') toast.classList.add('is-success');
    if (type === 'warning') toast.classList.add('is-warning');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
        toast.classList.remove('is-visible');
    }, 3400);
}

function setMessage(element, message, success = false) {
    if (!element) return;
    element.textContent = message || '';
    element.classList.toggle('is-success', Boolean(success));
}

function formatDate(value) {
    if (!value) return '—';
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime())
        ? String(value)
        : parsed.toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' });
}

function createCell(row, value, className = '') {
    const cell = document.createElement('td');
    cell.textContent = value == null ? '—' : String(value);
    if (className) cell.className = className;
    row.appendChild(cell);
    return cell;
}

function createLabelCell(row, label) {
    const cell = document.createElement('td');
    const chip = document.createElement('span');
    const malignant = String(label).toLowerCase() === 'malignant';
    chip.className = `label-chip${malignant ? ' malignant' : ''}`;
    chip.textContent = malignant ? 'Ác tính' : 'Lành tính';
    cell.appendChild(chip);
    row.appendChild(cell);
}

function authHeaders(extra = {}) {
    return authToken ? { ...extra, Authorization: `Bearer ${authToken}` } : extra;
}

async function parseError(response) {
    try {
        const payload = await response.json();
        if (typeof payload.detail === 'string') return payload.detail;
        if (payload.detail && typeof payload.detail === 'object') {
            const parts = [];
            if (payload.detail.missing_fields?.length) parts.push(`Thiếu: ${payload.detail.missing_fields.join(', ')}`);
            if (payload.detail.extra_fields?.length) parts.push(`Thừa: ${payload.detail.extra_fields.join(', ')}`);
            if (payload.detail.invalid_fields?.length) parts.push(`Không hợp lệ: ${payload.detail.invalid_fields.join(', ')}`);
            if (payload.detail.out_of_range_fields?.length) parts.push(`Ngoài phạm vi: ${payload.detail.out_of_range_fields.join(', ')}`);
            if (parts.length) return parts.join('. ');
        }
    } catch {
        // Fallback generic
    }
    return `Yêu cầu thất bại (${response.status}).`;
}

async function apiFetch(path, options = {}) {
    if (!API_BASE) throw new Error('Thiếu cấu hình API_BASE.');
    const response = await fetch(`${API_BASE}${path}`, {
        ...options,
        headers: authHeaders(options.headers || {}),
    });
    if (response.status === 401 && authToken) {
        logout(false);
        openAuth();
        showToast('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.', 'warning');
    }
    return response;
}

async function idpFetch(path, options = {}) {
    if (!IDP_BASE) throw new Error('Thiếu cấu hình IDP_BASE.');
    return fetch(`${IDP_BASE}${path}`, options);
}

/* ── Tabs ───────────────────────────────────────────────── */
function switchTab(name) {
    if ((name === 'history' || name === 'profile') && !authToken) {
        openAuth();
        return;
    }
    if (name === 'admin' && !isOwner) return;
    document.querySelectorAll('.tab-button').forEach((button) => {
        button.classList.toggle('is-active', button.dataset.tab === name);
    });
    document.querySelectorAll('.tab-panel').forEach((panel) => {
        panel.classList.toggle('is-active', panel.dataset.panel === name);
    });
    window.location.hash = name;
    if (name === 'metrics') loadMetrics();
    if (name === 'history') loadHistory();
    if (name === 'profile') loadProfile();
    if (name === 'admin') loadAdmin();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function updateAuthUi() {
    const signedIn = Boolean(authToken);
    document.querySelectorAll('.auth-only').forEach((element) => element.classList.toggle('is-hidden', !signedIn));
    document.querySelectorAll('.owner-only').forEach((element) => element.classList.toggle('is-hidden', !signedIn || !isOwner));
    byId('open-auth').classList.toggle('is-hidden', signedIn);
    byId('account-button').classList.toggle('is-hidden', !signedIn);
    byId('login-required').classList.toggle('is-hidden', signedIn);
    if (signedIn) {
        const payload = parseJwt(authToken) || {};
        currentEmail = currentEmail || payload.email || '';
        isOwner = isOwner || payload.is_owner === true;
        byId('account-email').textContent = currentEmail || 'Tài khoản';
        byId('account-button').querySelector('.avatar').textContent = (currentEmail || 'U').charAt(0).toUpperCase();
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
    if (notify) showToast('Đã đăng xuất khỏi thiết bị này.');
}

function setAuthMode(mode) {
    authMode = mode;
    const registering = mode === 'register';
    byId('auth-title').textContent = registering ? 'Tạo tài khoản' : 'Đăng nhập';
    byId('auth-subtitle').textContent = registering
        ? 'Tạo tài khoản dùng chung cho các dự án học máy.'
        : 'Dùng tài khoản chung để lưu lịch sử riêng tư.';
    byId('auth-submit').textContent = registering ? 'Đăng ký' : 'Đăng nhập';
    byId('auth-switch').textContent = registering
        ? 'Đã có tài khoản? Đăng nhập'
        : 'Chưa có tài khoản? Đăng ký';
    byId('auth-password').autocomplete = registering ? 'new-password' : 'current-password';
    setMessage(byId('auth-error'), '');
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
    setMessage(byId('auth-error'), '');
    if (!email || !password) {
        setMessage(byId('auth-error'), 'Vui lòng nhập email và mật khẩu.');
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
        if (!response.ok) throw new Error(typeof payload.detail === 'string' ? payload.detail : 'Không thể xác thực tài khoản.');
        if (authMode === 'register') {
            setAuthMode('login');
            byId('auth-email').value = email;
            setMessage(byId('auth-error'), 'Đăng ký thành công. Hãy đăng nhập.', true);
        } else {
            if (!payload.access_token) throw new Error('Identity Service không trả về access_token.');
            saveSession(payload.access_token, payload.user || {});
            closeAuth();
            byId('auth-password').value = '';
            showToast('Đăng nhập thành công.', 'success');
        }
    } catch (error) {
        setMessage(byId('auth-error'), error.message || 'Identity Service tạm thời không sẵn sàng.');
    } finally {
        submit.disabled = false;
        submit.textContent = authMode === 'register' ? 'Đăng ký' : 'Đăng nhập';
    }
}

/* ── Features form ──────────────────────────────────────── */
function renderFeatureInputs() {
    const container = byId('feature-groups');
    if (!container) return;
    container.replaceChildren();
    FEATURE_GROUPS.forEach((group) => {
        const fieldset = document.createElement('fieldset');
        fieldset.className = 'feature-group';
        const legend = document.createElement('legend');
        legend.textContent = group.title;
        fieldset.appendChild(legend);
        const grid = document.createElement('div');
        grid.className = 'field-grid';
        group.features.forEach((feature) => {
            const label = document.createElement('label');
            label.htmlFor = `feature-${feature.replaceAll(' ', '-')}`;
            const title = document.createElement('span');
            title.textContent = feature;
            const input = document.createElement('input');
            input.id = label.htmlFor;
            input.name = feature;
            input.type = 'number';
            input.step = 'any';
            input.inputMode = 'decimal';
            input.required = true;
            const hint = document.createElement('span');
            hint.className = 'input-hint';
            hint.dataset.rangeFor = feature;
            hint.textContent = 'Giá trị số hữu hạn';
            label.append(title, input, hint);
            grid.appendChild(label);
        });
        fieldset.appendChild(grid);
        container.appendChild(fieldset);
    });
}

function applyFeatureRanges(ranges) {
    if (!ranges) return;
    FEATURE_NAMES.forEach((feature) => {
        const bounds = ranges[feature];
        if (!bounds) return;
        const input = document.querySelector(`[name="${feature}"]`);
        const hint = document.querySelector(`[data-range-for="${feature}"]`);
        if (input) {
            input.min = bounds.minimum;
            input.max = bounds.maximum;
        }
        if (hint) {
            hint.textContent = `${bounds.minimum} – ${bounds.maximum}`;
        }
    });
}

function loadSample(sample) {
    FEATURE_NAMES.forEach((feature) => {
        const input = document.querySelector(`[name="${feature}"]`);
        if (input) {
            input.value = sample[feature];
            input.removeAttribute('aria-invalid');
        }
    });
    setMessage(byId('form-error'), 'Đã nạp mẫu minh hoạ.', true);
}

function collectFeatures() {
    const features = {};
    const invalid = [];
    FEATURE_NAMES.forEach((feature) => {
        const input = document.querySelector(`[name="${feature}"]`);
        if (!input) return;
        const value = Number(input.value);
        const hasValue = input.value.trim() !== '';
        const inRange = !metadata?.feature_ranges?.[feature]
            || (value >= metadata.feature_ranges[feature].minimum && value <= metadata.feature_ranges[feature].maximum);
        const valid = hasValue && Number.isFinite(value) && inRange;
        input.setAttribute('aria-invalid', valid ? 'false' : 'true');
        if (valid) features[feature] = value;
        else invalid.push(feature);
    });
    if (invalid.length) throw new Error(`Vui lòng kiểm tra các trường: ${invalid.slice(0, 5).join(', ')}${invalid.length > 5 ? '…' : ''}`);
    return features;
}

/* ── Confetti Animation ─────────────────────────────────── */
function fireConfetti() {
    const canvas = byId('confetti-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    canvas.classList.add('is-active');

    const particles = [];
    const colors = ['#6c47e8', '#9d6ff5', '#0ea875', '#34d399', '#f59e0b', '#ec4899'];
    for (let i = 0; i < 90; i++) {
        particles.push({
            x: canvas.width * 0.5 + (Math.random() - 0.5) * 200,
            y: canvas.height * 0.4 + (Math.random() - 0.5) * 100,
            vx: (Math.random() - 0.5) * 14,
            vy: -Math.random() * 12 - 4,
            size: Math.random() * 8 + 4,
            color: colors[Math.floor(Math.random() * colors.length)],
            rotation: Math.random() * Math.PI * 2,
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
            p.vy += 0.35; // gravity
            p.rotation += p.vRot;
            if (elapsed > 1200) {
                p.alpha -= 0.02;
            }
            if (p.alpha > 0) {
                alive = true;
                ctx.save();
                ctx.globalAlpha = Math.max(0, p.alpha);
                ctx.translate(p.x, p.y);
                ctx.rotate(p.rotation);
                ctx.fillStyle = p.color;
                ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
                ctx.restore();
            }
        });

        if (alive && elapsed < 3200) {
            requestAnimationFrame(animate);
        } else {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            canvas.classList.remove('is-active');
        }
    }
    requestAnimationFrame(animate);
}

/* ── Radar Chart (Canvas) ───────────────────────────────── */
function drawRadarChart(features, result) {
    const wrap = byId('radar-wrap');
    const canvas = byId('radar-canvas');
    if (!wrap || !canvas) return;
    wrap.classList.remove('is-hidden');

    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const centerX = w / 2;
    const centerY = h / 2 - 5;
    const radius = Math.min(centerX, centerY) - 38;
    const count = RADAR_FEATURES.length;
    const angleStep = (Math.PI * 2) / count;

    // Draw background rings
    const rings = 4;
    ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';
    ctx.lineWidth = 1;
    for (let r = 1; r <= rings; r++) {
        const curR = (radius / rings) * r;
        ctx.beginPath();
        for (let i = 0; i < count; i++) {
            const angle = i * angleStep - Math.PI / 2;
            const x = centerX + Math.cos(angle) * curR;
            const y = centerY + Math.sin(angle) * curR;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.stroke();
    }

    // Draw axes & labels
    ctx.fillStyle = isDark ? '#a59ec9' : '#6b7280';
    ctx.font = '10px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (let i = 0; i < count; i++) {
        const angle = i * angleStep - Math.PI / 2;
        const x = centerX + Math.cos(angle) * radius;
        const y = centerY + Math.sin(angle) * radius;

        ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)';
        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.lineTo(x, y);
        ctx.stroke();

        // Label offset
        const labelDistance = radius + 18;
        const lx = centerX + Math.cos(angle) * labelDistance;
        const ly = centerY + Math.sin(angle) * labelDistance;
        ctx.fillText(RADAR_FEATURES[i].label, lx, ly);
    }

    // Normalize feature values (0.1 to 1.0)
    const points = [];
    RADAR_FEATURES.forEach((item, i) => {
        const val = Number(features[item.name]) || 0;
        const range = metadata?.feature_ranges?.[item.name];
        let norm = 0.5;
        if (range && range.maximum > range.minimum) {
            norm = (val - range.minimum) / (range.maximum - range.minimum);
            norm = Math.max(0.08, Math.min(1.0, norm));
        }
        const curR = radius * norm;
        const angle = i * angleStep - Math.PI / 2;
        points.push({
            x: centerX + Math.cos(angle) * curR,
            y: centerY + Math.sin(angle) * curR,
        });
    });

    // Draw filled polygon
    const isMalignant = result.predicted_label === 'malignant' || result.decision === 'malignant';
    const strokeColor = isMalignant ? '#e8476c' : '#0ea875';
    const fillColor = isMalignant ? 'rgba(232, 71, 108, 0.28)' : 'rgba(14, 168, 117, 0.28)';

    ctx.beginPath();
    points.forEach((p, i) => {
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
    });
    ctx.closePath();
    ctx.fillStyle = fillColor;
    ctx.fill();
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 2.2;
    ctx.stroke();

    // Draw points
    ctx.fillStyle = strokeColor;
    points.forEach((p) => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3.5, 0, Math.PI * 2);
        ctx.fill();
    });
}

/* ── Render prediction ──────────────────────────────────── */
function renderPrediction(result, features) {
    lastPredictionResult = result;
    lastPredictionFeatures = features;
    const malignant = result.predicted_label === 'malignant' || result.decision === 'malignant';
    const card = byId('result-card');
    byId('result-empty').classList.add('is-hidden');
    card.classList.remove('is-hidden');
    card.classList.toggle('is-malignant', malignant);

    byId('result-badge').textContent = malignant ? 'Cảnh báo ác tính' : 'Nghiêng về lành tính';
    byId('result-title').textContent = malignant ? 'Ác tính' : 'Lành tính';
    byId('result-decision').textContent = malignant
        ? 'P(ác tính) đã đạt hoặc vượt ngưỡng đã khoá.'
        : 'P(ác tính) thấp hơn ngưỡng đã khoá.';
    byId('probability-malignant').textContent = percent(result.probability_malignant, 2);
    byId('probability-benign').textContent = percent(result.probability_benign, 2);
    byId('malignant-bar').style.width = percent(result.probability_malignant, 3);
    byId('benign-bar').style.width = percent(result.probability_benign, 3);
    byId('result-threshold').textContent = number(result.threshold, 4);
    byId('result-version').textContent = result.model_version;
    byId('result-warning').textContent = result.warning;

    // Draw radar chart
    if (features) {
        drawRadarChart(features, result);
    }

    // Celebrate with confetti if benign
    if (!malignant) {
        fireConfetti();
    }
}

async function submitPrediction(event) {
    event.preventDefault();
    if (!authToken) {
        openAuth();
        return;
    }
    const button = byId('predict-button');
    setMessage(byId('form-error'), '');
    try {
        const features = collectFeatures();
        button.disabled = true;
        button.textContent = 'Đang phân tích…';
        const response = await apiFetch('/predict', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ features }),
        });
        if (!response.ok) throw new Error(await parseError(response));
        const result = await response.json();
        renderPrediction(result, features);
        showToast('Đã hoàn tất phân tích mẫu.', 'success');
    } catch (error) {
        setMessage(byId('form-error'), error.message || 'Không thể dự đoán.');
    } finally {
        button.disabled = false;
        button.textContent = '🔬 Phân tích mẫu';
    }
}

function resetPrediction() {
    window.setTimeout(() => {
        document.querySelectorAll('#prediction-form input').forEach((input) => input.removeAttribute('aria-invalid'));
        byId('result-card').classList.add('is-hidden');
        byId('result-empty').classList.remove('is-hidden');
        byId('radar-wrap').classList.add('is-hidden');
        setMessage(byId('form-error'), '');
        lastPredictionResult = null;
        lastPredictionFeatures = null;
    }, 0);
}

function copyPredictionResult() {
    if (!lastPredictionResult) return;
    const r = lastPredictionResult;
    const label = r.predicted_label === 'malignant' ? 'Ác tính' : 'Lành tính';
    const text = `[Kết quả phân tích Breast Cancer SVM]
- Đánh giá: ${label}
- Xác suất ác tính: ${percent(r.probability_malignant, 2)}
- Xác suất lành tính: ${percent(r.probability_benign, 2)}
- Ngưỡng quyết định: ${number(r.threshold, 4)}
- Phiên bản mô hình: ${r.model_version}
- Thời gian: ${new Date().toLocaleString('vi-VN')}
* Lưu ý: Kết quả mang tính giáo dục, không thay thế chẩn đoán y khoa.`;

    navigator.clipboard.writeText(text).then(() => {
        showToast('Đã sao chép kết quả vào clipboard!', 'success');
    }).catch(() => {
        showToast('Không thể sao chép kết quả.', 'warning');
    });
}

/* ── Health & Metadata ──────────────────────────────────── */
async function checkHealthAndMetadata() {
    const status = byId('service-status');
    if (!API_BASE || !IDP_BASE) {
        status.textContent = 'Thiếu cấu hình URL';
        status.classList.add('is-offline');
        return;
    }
    try {
        const [healthResponse, metadataResponse] = await Promise.all([
            apiFetch('/health'), apiFetch('/metadata'),
        ]);
        if (!healthResponse.ok || !metadataResponse.ok) throw new Error('API không sẵn sàng');
        const health = await healthResponse.json();
        metadata = await metadataResponse.json();
        status.textContent = 'API sẵn sàng';
        status.className = 'status-pill is-online';
        byId('hero-threshold').textContent = number(health.threshold, 4);
        applyFeatureRanges(metadata.feature_ranges);

        // Fetch metrics to populate hero sensitivity stat
        apiFetch('/metrics').then(async (res) => {
            if (res.ok) {
                metricsPayload = await res.json();
                const cvSens = metricsPayload.metrics?.oof_cross_validation?.sensitivity_malignant;
                if (cvSens != null) {
                    byId('hero-sensitivity').textContent = percent(cvSens, 1);
                }
            }
        }).catch(() => {});
    } catch {
        status.textContent = 'API chưa sẵn sàng';
        status.className = 'status-pill is-offline';
    }
}

/* ── Metrics ────────────────────────────────────────────── */
function metricCard(container, label, value) {
    const card = document.createElement('article');
    card.className = 'metric-card';
    const title = document.createElement('span');
    title.textContent = label;
    const score = document.createElement('strong');
    score.textContent = percent(value, 2);
    card.append(title, score);
    container.appendChild(card);
}

function renderConfusionMatrix(matrix) {
    const container = byId('confusion-matrix');
    container.replaceChildren();
    const values = matrix?.matrix || matrix;
    const cells = [
        ['', 'Dự đoán ác', 'Dự đoán lành'],
        ['Thật ác', values[0][0], values[0][1]],
        ['Thật lành', values[1][0], values[1][1]],
    ];
    cells.flat().forEach((value, index) => {
        const cell = document.createElement('div');
        const row = Math.floor(index / 3);
        const column = index % 3;
        cell.className = row === 0 || column === 0
            ? 'matrix-cell label'
            : `matrix-cell value${row !== column ? ' error' : ''}`;
        cell.textContent = value;
        container.appendChild(cell);
    });
}

function addComparison(container, label, cvValue, testValue) {
    const row = document.createElement('div');
    row.className = 'compare-row';
    const header = document.createElement('div');
    const name = document.createElement('strong');
    name.textContent = label;
    const scores = document.createElement('span');
    scores.textContent = `OOF ${percent(cvValue)} · Test ${percent(testValue)}`;
    header.append(name, scores);
    const bars = document.createElement('div');
    bars.className = 'dual-bars';
    [cvValue, testValue].forEach((value) => {
        const track = document.createElement('div');
        const fill = document.createElement('span');
        fill.style.width = percent(value, 3);
        track.appendChild(fill);
        bars.appendChild(track);
    });
    row.append(header, bars);
    container.appendChild(row);
}

function detailRow(container, term, description) {
    const row = document.createElement('div');
    const dt = document.createElement('dt');
    const dd = document.createElement('dd');
    dt.textContent = term;
    dd.textContent = description;
    row.append(dt, dd);
    container.appendChild(row);
}

function renderMetrics(payload) {
    const metrics = payload.metrics;
    const test = metrics.test;
    const cv = metrics.oof_cross_validation;
    const cards = byId('metric-cards');
    cards.replaceChildren();
    metricCard(cards, 'Độ nhạy ác tính (Test)', test.sensitivity_malignant);
    metricCard(cards, 'Độ đặc hiệu lành tính (Test)', test.specificity_benign);
    metricCard(cards, 'ROC-AUC (Test)', test.roc_auc_malignant);
    metricCard(cards, 'PR-AUC (Test)', test.pr_auc_malignant);
    renderConfusionMatrix(test.confusion_matrix);
    const comparisons = byId('comparison-bars');
    comparisons.replaceChildren();
    addComparison(comparisons, 'Độ chính xác (Accuracy)', cv.accuracy, test.accuracy);
    addComparison(comparisons, 'Độ nhạy ác tính (Sensitivity)', cv.sensitivity_malignant, test.sensitivity_malignant);
    addComparison(comparisons, 'Độ đặc hiệu lành tính (Specificity)', cv.specificity_benign, test.specificity_benign);
    addComparison(comparisons, 'F1 ác tính', cv.f1_malignant, test.f1_malignant);
    byId('metrics-threshold').textContent = number(payload.threshold, 4);
    const selection = payload.threshold_selection || {};
    byId('threshold-description').textContent = `Chọn chỉ từ dự đoán out-of-fold của tập train, mục tiêu độ nhạy ≥ ${percent(selection.target_sensitivity || 0.98, 0)} và tối đa hoá độ đặc hiệu.`;
    const details = byId('model-details');
    details.replaceChildren();
    const params = metadata?.best_params || {};
    detailRow(details, 'Phiên bản', payload.model_version);
    detailRow(details, 'Thuật toán', 'Support Vector Machine (SVC)');
    detailRow(details, 'Kernel', 'RBF (Radial Basis Function)');
    detailRow(details, 'Tham số C', params.svc__C ?? params.C ?? '1.0');
    detailRow(details, 'Tham số Gamma', params.svc__gamma ?? params.gamma ?? 'scale');
    detailRow(details, 'Thư viện', `scikit-learn ${metadata?.sklearn_version || '1.6+'}`);
    byId('metrics-loading').classList.add('is-hidden');
    byId('metrics-content').classList.remove('is-hidden');
}

async function loadMetrics() {
    if (metricsPayload) {
        renderMetrics(metricsPayload);
        return;
    }
    try {
        const response = await apiFetch('/metrics');
        if (!response.ok) throw new Error(await parseError(response));
        metricsPayload = await response.json();
        if (!metadata) {
            const metadataResponse = await apiFetch('/metadata');
            if (metadataResponse.ok) metadata = await metadataResponse.json();
        }
        renderMetrics(metricsPayload);
    } catch (error) {
        byId('metrics-loading').textContent = error.message || 'Không thể tải chỉ số.';
    }
}

/* ── History ────────────────────────────────────────────── */
function renderHistory(records) {
    const body = byId('history-body');
    body.replaceChildren();
    byId('history-empty').classList.toggle('is-hidden', records.length > 0);
    records.forEach((record) => {
        const row = document.createElement('tr');
        createCell(row, formatDate(record.created_at));
        createLabelCell(row, record.predicted_label);
        createCell(row, percent(record.probability_malignant, 2));
        createCell(row, percent(record.probability_benign, 2));
        createCell(row, number(record.threshold, 4));
        createCell(row, record.model_version);
        body.appendChild(row);
    });
    byId('profile-count').textContent = records.length;
}

async function loadHistory() {
    if (!authToken) return;
    setMessage(byId('history-message'), 'Đang tải…', true);
    try {
        const response = await apiFetch('/predictions');
        if (!response.ok) throw new Error(await parseError(response));
        renderHistory(await response.json());
        setMessage(byId('history-message'), '');
    } catch (error) {
        setMessage(byId('history-message'), error.message || 'Không thể tải lịch sử.');
    }
}

async function clearHistory() {
    if (!window.confirm('Xoá vĩnh viễn toàn bộ lịch sử dự đoán của bạn?')) return;
    try {
        const response = await apiFetch('/predictions', { method: 'DELETE' });
        if (!response.ok) throw new Error(await parseError(response));
        const payload = await response.json();
        renderHistory([]);
        showToast(`Đã xoá ${payload.deleted ?? 0} bản ghi.`, 'success');
    } catch (error) {
        setMessage(byId('history-message'), error.message || 'Không thể xoá lịch sử.');
    }
}

async function exportHistory() {
    const button = byId('export-history');
    button.disabled = true;
    try {
        const response = await apiFetch('/predictions/export');
        if (!response.ok) throw new Error(await parseError(response));
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'breast_cancer_svm_predictions.xlsx';
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
        showToast('Đã xuất tệp Excel thành công!', 'success');
    } catch (error) {
        setMessage(byId('history-message'), error.message || 'Không thể xuất Excel.');
    } finally {
        button.disabled = false;
    }
}

/* ── Profile ────────────────────────────────────────────── */
async function loadProfile() {
    if (!authToken) return;
    const jwtPayload = parseJwt(authToken) || {};
    let profile = { email: currentEmail || jwtPayload.email, id: jwtPayload.sub, is_owner: isOwner };
    try {
        const response = await idpFetch('/me', { headers: authHeaders() });
        if (response.ok) profile = { ...profile, ...(await response.json()) };
        else if (response.status === 401) logout(false);
    } catch {
        showToast('Không thể cập nhật hồ sơ từ Identity Service.', 'warning');
    }
    const email = profile.email || currentEmail || '—';
    byId('profile-email').textContent = email;
    byId('profile-id').textContent = profile.id ?? profile.sub ?? jwtPayload.sub ?? '—';
    byId('profile-role').textContent = profile.is_owner || isOwner ? 'Chủ sở hữu' : 'Người dùng';
    byId('profile-avatar').textContent = email.charAt(0).toUpperCase();
    try {
        const historyResponse = await apiFetch('/predictions');
        if (historyResponse.ok) byId('profile-count').textContent = (await historyResponse.json()).length;
    } catch {
        byId('profile-count').textContent = '—';
    }
}

/* ── Admin ──────────────────────────────────────────────── */
function renderAdminUsers(users) {
    const body = byId('admin-users-body');
    body.replaceChildren();
    byId('admin-user-count').textContent = `${users.length} tài khoản`;
    users.forEach((user) => {
        const row = document.createElement('tr');
        createCell(row, user.email);
        createCell(row, user.id ?? user.sub);
        createCell(row, user.is_owner ? 'Chủ sở hữu' : 'Người dùng');
        createCell(row, formatDate(user.last_login_at));
        body.appendChild(row);
    });
}

function renderAdminPredictions(records) {
    const body = byId('admin-predictions-body');
    body.replaceChildren();
    byId('admin-prediction-count').textContent = `${records.length} lượt`;
    records.forEach((record) => {
        const row = document.createElement('tr');
        createCell(row, formatDate(record.created_at));
        createLabelCell(row, record.predicted_label);
        createCell(row, percent(record.probability_malignant, 2));
        createCell(row, number(record.threshold, 4));
        createCell(row, record.model_version);
        body.appendChild(row);
    });
}

async function loadAdmin() {
    if (!authToken || !isOwner) return;
    setMessage(byId('admin-message'), 'Đang tải dữ liệu quản trị…', true);
    try {
        const [usersResponse, predictionsResponse] = await Promise.all([
            idpFetch('/admin/users', { headers: authHeaders() }),
            apiFetch('/admin/predictions'),
        ]);
        if (!usersResponse.ok) throw new Error(`IdP: ${await parseError(usersResponse)}`);
        if (!predictionsResponse.ok) throw new Error(`API: ${await parseError(predictionsResponse)}`);
        const usersPayload = await usersResponse.json();
        const predictionsPayload = await predictionsResponse.json();
        renderAdminUsers(Array.isArray(usersPayload) ? usersPayload : usersPayload.users || []);
        renderAdminPredictions(Array.isArray(predictionsPayload) ? predictionsPayload : predictionsPayload.records || []);
        setMessage(byId('admin-message'), '');
    } catch (error) {
        setMessage(byId('admin-message'), error.message || 'Không thể tải dữ liệu quản trị.');
    }
}

/* ── Event Bindings ─────────────────────────────────────── */
function bindEvents() {
    document.querySelectorAll('.tab-button').forEach((button) => {
        button.addEventListener('click', () => switchTab(button.dataset.tab));
    });
    document.querySelectorAll('[data-tab-target]').forEach((button) => {
        button.addEventListener('click', () => switchTab(button.dataset.tabTarget));
    });
    document.querySelectorAll('[data-open-auth]').forEach((button) => button.addEventListener('click', openAuth));
    byId('open-auth').addEventListener('click', openAuth);
    byId('close-auth').addEventListener('click', closeAuth);
    byId('auth-overlay').addEventListener('click', (event) => { if (event.target === byId('auth-overlay')) closeAuth(); });
    byId('auth-switch').addEventListener('click', () => setAuthMode(authMode === 'login' ? 'register' : 'login'));
    byId('auth-form').addEventListener('submit', submitAuth);
    byId('toggle-password').addEventListener('click', () => {
        const input = byId('auth-password');
        const showing = input.type === 'text';
        input.type = showing ? 'password' : 'text';
        byId('toggle-password').textContent = showing ? 'Hiện' : 'Ẩn';
        byId('toggle-password').setAttribute('aria-label', showing ? 'Hiện mật khẩu' : 'Ẩn mật khẩu');
    });

    byId('theme-toggle').addEventListener('click', toggleTheme);
    byId('prediction-form').addEventListener('submit', submitPrediction);
    byId('prediction-form').addEventListener('reset', resetPrediction);
    byId('load-benign').addEventListener('click', () => loadSample(BENIGN_SAMPLE));
    byId('load-malignant').addEventListener('click', () => loadSample(MALIGNANT_SAMPLE));
    byId('clear-history').addEventListener('click', clearHistory);
    byId('export-history').addEventListener('click', exportHistory);
    byId('logout-button').addEventListener('click', () => logout());
    byId('copy-result').addEventListener('click', copyPredictionResult);

    // Scroll to top button
    const scrollTopBtn = byId('scroll-top');
    window.addEventListener('scroll', () => {
        if (window.scrollY > 280) {
            scrollTopBtn.classList.add('is-visible');
        } else {
            scrollTopBtn.classList.remove('is-visible');
        }
    });
    scrollTopBtn.addEventListener('click', () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && !byId('auth-overlay').classList.contains('is-hidden')) {
            closeAuth();
        }
    });

    // Resize listener for radar chart & confetti canvas
    window.addEventListener('resize', () => {
        if (lastPredictionFeatures) {
            drawRadarChart(lastPredictionFeatures, lastPredictionResult);
        }
    });
}

function initialize() {
    initTheme();
    renderFeatureInputs();
    bindEvents();
    updateAuthUi();
    checkHealthAndMetadata();
    const requestedTab = window.location.hash.slice(1);
    const allowed = ['predict', 'metrics', 'history', 'profile', 'admin', 'about'];
    if (allowed.includes(requestedTab)) switchTab(requestedTab);
}

document.addEventListener('DOMContentLoaded', initialize);
