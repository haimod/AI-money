/**
 * VND Currency Recognition System
 * Real-time Streaming with Better UX
 * Shows clear status feedback at all times
 */

// ================================
// Configuration
// ================================
// Auto-detect: If running on port 80 (Docker), use /api, else use localhost:8000
const isDocker = window.location.port === '' || window.location.port === '80';
const CONFIG = {
    API_URL: isDocker ? '/api' : 'http://localhost:8000',
    EXCHANGE_API_URL: 'https://api.exchangerate-api.com/v4/latest/VND',

    STREAM_INTERVAL: 300,        // Detection every 300ms
    STABILITY_THRESHOLD: 5,      // 5 consecutive = stable
    LOST_TIMEOUT: 1500,          // Wait 1.5s before clearing (smooth)

    RATES_UPDATE_INTERVAL: 300000,
};

// ================================
// Detection Status Types
// ================================
const STATUS = {
    SCANNING: 'scanning',        // Looking for money
    FOUND: 'found',              // Found but not stable yet
    STABLE: 'stable',            // Stable detection
    LOST: 'lost',                // Was found but now lost
};

// ================================
// State Management
// ================================
const state = {
    stream: null,
    isStreaming: false,
    streamInterval: null,
    currentFacingMode: 'environment',
    exchangeRates: { USD: 0, EUR: 0, JPY: 0 },
    totalVND: 0,
    confirmedBills: [],

    // Detection state
    currentDetection: null,
    consecutiveCount: 0,
    lastDenomination: null,
    isStable: false,
    status: STATUS.SCANNING,

    // Smooth transitions
    lostTimeout: null,
    missCount: 0,
};

// ================================
// DOM Elements
// ================================
const elements = {
    video: document.getElementById('videoElement'),
    canvas: document.getElementById('canvasElement'),
    cameraOverlay: document.getElementById('cameraOverlay'),
    scanLine: document.getElementById('scanLine'),
    detectionBoxes: document.getElementById('detectionBoxes'),

    // Status elements
    scanStatus: document.getElementById('scanStatus'),
    statusDot: document.getElementById('statusDot'),
    statusText: document.getElementById('statusText'),
    statusTip: document.getElementById('statusTip'),
    frameGuides: document.getElementById('frameGuides'),

    // Buttons
    startCameraBtn: document.getElementById('startCameraBtn'),
    captureBtn: document.getElementById('captureBtn'),
    autoModeBtn: document.getElementById('autoModeBtn'),
    switchCameraBtn: document.getElementById('switchCameraBtn'),
    refreshRatesBtn: document.getElementById('refreshRatesBtn'),
    clearResultsBtn: document.getElementById('clearResultsBtn'),

    confirmBtn: document.getElementById('confirmBtn'),
    retryBtn: document.getElementById('retryBtn'),
    cancelBtn: document.getElementById('cancelBtn'),

    dropZone: document.getElementById('dropZone'),
    fileInput: document.getElementById('fileInput'),

    // Image preview elements
    imagePreview: document.getElementById('imagePreview'),
    previewImage: document.getElementById('previewImage'),
    previewFilename: document.getElementById('previewFilename'),
    confirmUploadBtn: document.getElementById('confirmUploadBtn'),
    cancelUploadBtn: document.getElementById('cancelUploadBtn'),
    changeImageBtn: document.getElementById('changeImageBtn'),

    noResults: document.getElementById('noResults'),
    pendingPanel: document.getElementById('pendingPanel'),
    confirmedSection: document.getElementById('confirmedSection'),
    detectionResults: document.getElementById('detectionResults'),

    pendingDenomination: document.getElementById('pendingDenomination'),
    pendingConfidence: document.getElementById('pendingConfidence'),
    confirmedCount: document.getElementById('confirmedCount'),

    rateUSD: document.getElementById('rateUSD'),
    rateEUR: document.getElementById('rateEUR'),
    rateJPY: document.getElementById('rateJPY'),
    ratesUpdateTime: document.getElementById('ratesUpdateTime'),

    totalVND: document.getElementById('totalVND'),
    totalUSD: document.getElementById('totalUSD'),
    totalEUR: document.getElementById('totalEUR'),
    totalJPY: document.getElementById('totalJPY'),

    loadingOverlay: document.getElementById('loadingOverlay'),
    toastContainer: document.getElementById('toastContainer'),
};

// ================================
// Utility Functions
// ================================
function formatVND(amount) {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
}

function formatUSD(amount) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(amount);
}

function formatEUR(amount) {
    return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 }).format(amount);
}

function formatJPY(amount) {
    return new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY', minimumFractionDigits: 0 }).format(amount);
}

function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
        <svg class="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            ${type === 'success'
            ? '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>'
            : type === 'error'
                ? '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>'
                : '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>'
        }
        </svg>
        <span class="text-sm font-medium">${message}</span>
    `;
    elements.toastContainer.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

// ================================
// Status Display Functions
// ================================
function updateStatusDisplay(status, detection = null) {
    state.status = status;

    const dot = elements.statusDot;
    const text = elements.statusText;
    const tip = elements.statusTip;
    const guides = elements.frameGuides;

    switch (status) {
        case STATUS.SCANNING:
            dot.className = 'w-3 h-3 rounded-full bg-yellow-500 animate-pulse';
            text.textContent = 'Đang quét...';
            text.className = 'text-sm font-medium text-yellow-400';
            tip.textContent = '💡 Đưa tờ tiền vào khung hình';
            guides.classList.remove('hidden');
            // Make guides yellow
            guides.querySelectorAll('div').forEach(el => {
                el.className = el.className.replace('border-white/50', 'border-yellow-500/50').replace('border-green-500', 'border-yellow-500/50');
            });
            break;

        case STATUS.FOUND:
            dot.className = 'w-3 h-3 rounded-full bg-blue-500 animate-pulse';
            text.textContent = detection ? `Tìm thấy: ${detection.denomination_formatted}` : 'Đã phát hiện...';
            text.className = 'text-sm font-medium text-blue-400';
            tip.textContent = '⏳ Đang xác minh... giữ yên tờ tiền';
            guides.classList.remove('hidden');
            guides.querySelectorAll('div').forEach(el => {
                el.className = el.className.replace('border-yellow-500/50', 'border-blue-500').replace('border-white/50', 'border-blue-500');
            });
            break;

        case STATUS.STABLE:
            dot.className = 'w-3 h-3 rounded-full bg-green-500';
            text.textContent = detection ? `✓ ${detection.denomination_formatted}` : '✓ Ổn định';
            text.className = 'text-sm font-medium text-green-400';
            tip.textContent = '👆 Bấm XÁC NHẬN hoặc nhấn SPACE';
            guides.classList.remove('hidden');
            guides.querySelectorAll('div').forEach(el => {
                el.className = el.className.replace('border-yellow-500/50', 'border-green-500').replace('border-blue-500', 'border-green-500').replace('border-white/50', 'border-green-500');
            });
            break;

        case STATUS.LOST:
            dot.className = 'w-3 h-3 rounded-full bg-orange-500 animate-pulse';
            text.textContent = 'Mất tín hiệu...';
            text.className = 'text-sm font-medium text-orange-400';
            tip.textContent = '🔍 Đang tìm lại tờ tiền...';
            break;
    }
}

function showScanStatus(show) {
    elements.scanStatus.classList.toggle('hidden', !show);
    elements.frameGuides.classList.toggle('hidden', !show);
}

// ================================
// Camera Functions
// ================================
async function startCamera() {
    try {
        const constraints = {
            video: {
                facingMode: state.currentFacingMode,
                width: { ideal: 1280 },
                height: { ideal: 720 },
            },
            audio: false,
        };

        state.stream = await navigator.mediaDevices.getUserMedia(constraints);
        elements.video.srcObject = state.stream;

        await new Promise(resolve => { elements.video.onloadedmetadata = resolve; });

        elements.cameraOverlay.classList.add('hidden');
        elements.captureBtn.disabled = false;

        updateCameraButton(true);

        // Show scan status and start streaming
        showScanStatus(true);
        updateStatusDisplay(STATUS.SCANNING);
        startStreaming();

        showToast('Camera bật - Tự động nhận diện!', 'success');

    } catch (error) {
        console.error('Camera error:', error);
        showToast(`Không thể bật camera: ${error.message}`, 'error');
    }
}

function stopCamera() {
    stopStreaming();
    showScanStatus(false);

    if (state.stream) {
        state.stream.getTracks().forEach(track => track.stop());
        state.stream = null;
        elements.video.srcObject = null;
    }

    elements.cameraOverlay.classList.remove('hidden');
    elements.captureBtn.disabled = true;

    updateCameraButton(false);
    clearCurrentDetection(true); // Force clear

    showToast('Camera đã tắt', 'info');
}

function updateCameraButton(isOn) {
    if (isOn) {
        elements.startCameraBtn.innerHTML = `
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z"></path>
            </svg>
            Tắt Camera
        `;
        elements.startCameraBtn.classList.remove('from-green-500', 'to-emerald-600');
        elements.startCameraBtn.classList.add('from-slate-500', 'to-slate-600');
    } else {
        elements.startCameraBtn.innerHTML = `
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"></path>
            </svg>
            Bật Camera
        `;
        elements.startCameraBtn.classList.add('from-green-500', 'to-emerald-600');
        elements.startCameraBtn.classList.remove('from-slate-500', 'to-slate-600');
    }
}

function toggleCamera() {
    if (state.stream) {
        stopCamera();
    } else {
        startCamera();
    }
}

async function switchCamera() {
    if (!state.stream) return;
    state.currentFacingMode = state.currentFacingMode === 'user' ? 'environment' : 'user';
    stopCamera();
    await startCamera();
    elements.video.classList.toggle('mirror', state.currentFacingMode === 'user');
}

// ================================
// Streaming Detection
// ================================
function startStreaming() {
    if (state.isStreaming) return;

    state.isStreaming = true;
    elements.autoModeBtn.classList.add('auto-mode-active');

    state.streamInterval = setInterval(async () => {
        if (!state.stream || !state.isStreaming) return;
        await detectFrame();
    }, CONFIG.STREAM_INTERVAL);

    console.log('🎥 Streaming started');
}

function stopStreaming() {
    state.isStreaming = false;
    elements.autoModeBtn.classList.remove('auto-mode-active');

    if (state.streamInterval) {
        clearInterval(state.streamInterval);
        state.streamInterval = null;
    }

    if (state.lostTimeout) {
        clearTimeout(state.lostTimeout);
        state.lostTimeout = null;
    }

    console.log('🎥 Streaming stopped');
}

function toggleStreaming() {
    if (state.isStreaming) {
        stopStreaming();
        showToast('Đã tạm dừng', 'info');
    } else {
        startStreaming();
        showToast('Tiếp tục nhận diện', 'success');
    }
}

async function detectFrame() {
    if (!state.stream) return;

    const canvas = elements.canvas;
    const video = elements.video;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext('2d');
    if (state.currentFacingMode === 'user') {
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0);

    const imageData = canvas.toDataURL('image/jpeg', 0.8);

    try {
        const response = await fetch(`${CONFIG.API_URL}/predict/base64`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image: imageData }),
        });

        if (!response.ok) return;

        const result = await response.json();

        if (result.success && result.predictions.length > 0) {
            handleDetection(result.predictions[0]);
        } else {
            handleNoDetection();
        }

    } catch (error) {
        console.error('Detection error:', error);
    }
}

function handleDetection(detection) {
    // Clear any pending lost timeout
    if (state.lostTimeout) {
        clearTimeout(state.lostTimeout);
        state.lostTimeout = null;
    }
    state.missCount = 0;

    const denom = detection.denomination;

    // Same as last detection?
    if (denom === state.lastDenomination) {
        state.consecutiveCount++;
    } else {
        // New denomination
        state.consecutiveCount = 1;
        state.lastDenomination = denom;
        state.isStable = false;
    }

    state.currentDetection = detection;

    // Update status based on stability
    if (state.consecutiveCount >= CONFIG.STABILITY_THRESHOLD && !state.isStable) {
        state.isStable = true;
        updateStatusDisplay(STATUS.STABLE, detection);
    } else if (!state.isStable) {
        updateStatusDisplay(STATUS.FOUND, detection);
    } else {
        updateStatusDisplay(STATUS.STABLE, detection);
    }

    // Update UI
    displayLiveDetection(detection);
}

function handleNoDetection() {
    state.missCount++;

    // Don't immediately clear - give some tolerance
    if (state.currentDetection && state.missCount < 3) {
        // Keep showing current detection
        return;
    }

    // After 3 misses, show "lost" status
    if (state.currentDetection && !state.lostTimeout) {
        updateStatusDisplay(STATUS.LOST);

        // Set timeout to fully clear
        state.lostTimeout = setTimeout(() => {
            clearCurrentDetection(false);
            updateStatusDisplay(STATUS.SCANNING);
        }, CONFIG.LOST_TIMEOUT);
    } else if (!state.currentDetection) {
        // No detection at all
        updateStatusDisplay(STATUS.SCANNING);
    }
}

function clearCurrentDetection(force = false) {
    if (force && state.lostTimeout) {
        clearTimeout(state.lostTimeout);
        state.lostTimeout = null;
    }

    state.currentDetection = null;
    state.consecutiveCount = 0;
    state.lastDenomination = null;
    state.isStable = false;
    state.missCount = 0;

    elements.detectionBoxes.innerHTML = '';
    elements.pendingPanel.classList.add('hidden');

    if (state.confirmedBills.length === 0) {
        elements.noResults.classList.remove('hidden');
    }
}

// ================================
// Live Detection Display
// ================================
function displayLiveDetection(detection) {
    elements.noResults.classList.add('hidden');
    elements.pendingPanel.classList.remove('hidden');

    const stabilityPercent = Math.min(100, (state.consecutiveCount / CONFIG.STABILITY_THRESHOLD) * 100);

    elements.pendingDenomination.textContent = detection.denomination_formatted;

    const stabilityText = state.isStable
        ? '✓ Ổn định - Bấm XÁC NHẬN!'
        : `Đang xác minh... ${Math.round(stabilityPercent)}%`;

    elements.pendingConfidence.innerHTML = `
        <span class="block">${detection.confidence_percent} độ tin cậy</span>
        <span class="block mt-1 ${state.isStable ? 'text-green-400 font-medium' : 'text-yellow-400'}">${stabilityText}</span>
        <div class="mt-2 h-2 bg-white/10 rounded-full overflow-hidden">
            <div class="h-full transition-all duration-300 rounded-full ${state.isStable ? 'bg-green-500' : 'bg-yellow-500'}" 
                 style="width: ${stabilityPercent}%"></div>
        </div>
    `;

    // Highlight confirm button when stable
    if (state.isStable) {
        elements.confirmBtn.classList.add('ring-2', 'ring-green-400', 'ring-offset-2', 'ring-offset-slate-900');
    } else {
        elements.confirmBtn.classList.remove('ring-2', 'ring-green-400', 'ring-offset-2', 'ring-offset-slate-900');
    }

    displayDetectionBox(detection);
}

function displayDetectionBox(detection) {
    elements.detectionBoxes.innerHTML = '';

    if (!detection.bbox) return;

    const video = elements.video;
    const scaleX = video.offsetWidth / video.videoWidth;
    const scaleY = video.offsetHeight / video.videoHeight;

    const left = detection.bbox.x1 * scaleX;
    const top = detection.bbox.y1 * scaleY;
    const width = (detection.bbox.x2 - detection.bbox.x1) * scaleX;
    const height = (detection.bbox.y2 - detection.bbox.y1) * scaleY;

    const cornerColor = state.isStable ? '#22c55e' : '#3b82f6';
    const cornerSize = Math.min(25, width * 0.12, height * 0.12);

    // Main container
    const container = document.createElement('div');
    container.style.cssText = `
        position: absolute;
        left: ${left}px;
        top: ${top}px;
        width: ${width}px;
        height: ${height}px;
        transition: all 0.15s ease-out;
    `;

    // 4 Corner elements
    const corners = [
        `top: 0; left: 0; border-top: 3px solid ${cornerColor}; border-left: 3px solid ${cornerColor}; border-radius: 6px 0 0 0;`,
        `top: 0; right: 0; border-top: 3px solid ${cornerColor}; border-right: 3px solid ${cornerColor}; border-radius: 0 6px 0 0;`,
        `bottom: 0; left: 0; border-bottom: 3px solid ${cornerColor}; border-left: 3px solid ${cornerColor}; border-radius: 0 0 0 6px;`,
        `bottom: 0; right: 0; border-bottom: 3px solid ${cornerColor}; border-right: 3px solid ${cornerColor}; border-radius: 0 0 6px 0;`,
    ];

    corners.forEach(css => {
        const corner = document.createElement('div');
        corner.style.cssText = `position: absolute; width: ${cornerSize}px; height: ${cornerSize}px; ${css}`;
        container.appendChild(corner);
    });

    // Glow effect
    const glow = document.createElement('div');
    glow.style.cssText = `
        position: absolute;
        inset: -4px;
        border-radius: 8px;
        background: transparent;
        box-shadow: ${state.isStable
            ? '0 0 25px rgba(34, 197, 94, 0.4), inset 0 0 15px rgba(34, 197, 94, 0.1)'
            : '0 0 20px rgba(59, 130, 246, 0.3), inset 0 0 10px rgba(59, 130, 246, 0.1)'};
        pointer-events: none;
    `;
    container.appendChild(glow);

    // Top label
    const label = document.createElement('div');
    label.style.cssText = `
        position: absolute;
        top: -32px;
        left: 50%;
        transform: translateX(-50%);
        padding: 5px 14px;
        border-radius: 16px;
        font-size: 13px;
        font-weight: 600;
        white-space: nowrap;
        background: ${state.isStable ? 'linear-gradient(135deg, #22c55e, #16a34a)' : 'linear-gradient(135deg, #3b82f6, #2563eb)'};
        color: white;
        box-shadow: 0 3px 10px ${state.isStable ? 'rgba(34, 197, 94, 0.4)' : 'rgba(59, 130, 246, 0.4)'};
    `;
    label.textContent = detection.denomination_formatted;
    container.appendChild(label);

    // Bottom indicator
    const bottomIndicator = document.createElement('div');
    if (state.isStable) {
        bottomIndicator.style.cssText = `
            position: absolute;
            bottom: -28px;
            left: 50%;
            transform: translateX(-50%);
            background: #22c55e;
            border-radius: 50%;
            width: 24px;
            height: 24px;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 3px 8px rgba(34, 197, 94, 0.4);
        `;
        bottomIndicator.innerHTML = `<svg style="width:14px;height:14px;color:white;" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"></path></svg>`;
    } else {
        const progress = Math.min(100, (state.consecutiveCount / CONFIG.STABILITY_THRESHOLD) * 100);
        bottomIndicator.style.cssText = `
            position: absolute;
            bottom: -24px;
            left: 50%;
            transform: translateX(-50%);
            width: 50px;
            height: 5px;
            background: rgba(255,255,255,0.2);
            border-radius: 3px;
            overflow: hidden;
        `;
        bottomIndicator.innerHTML = `<div style="height:100%;width:${progress}%;background:linear-gradient(90deg,#3b82f6,#22c55e);border-radius:3px;transition:width 0.15s;"></div>`;
    }
    container.appendChild(bottomIndicator);

    elements.detectionBoxes.appendChild(container);

    // Hide static frame guides
    elements.frameGuides.classList.add('hidden');
}

// ================================
// Confirmation Functions
// ================================
function confirmDetection() {
    if (!state.currentDetection) {
        showToast('Chưa phát hiện tờ tiền nào', 'info');
        return;
    }

    const detection = state.currentDetection;

    state.totalVND += detection.denomination;
    state.confirmedBills.push({
        ...detection,
        wasStable: state.isStable,
        timestamp: new Date().toISOString()
    });

    addConfirmedResult(detection);
    updateTotals();
    clearCurrentDetection(true);
    updateStatusDisplay(STATUS.SCANNING);

    showToast(`✓ Đã thêm: ${detection.denomination_formatted}`, 'success');
}

function skipDetection() {
    clearCurrentDetection(true);
    updateStatusDisplay(STATUS.SCANNING);
    showToast('Đã bỏ qua', 'info');
}

function addConfirmedResult(detection) {
    elements.confirmedSection.classList.remove('hidden');
    elements.noResults.classList.add('hidden');

    const item = document.createElement('div');
    item.className = 'result-item flex items-center justify-between p-3 rounded-xl bg-white/5 border border-green-500/20 animate-fade-in';

    item.innerHTML = `
        <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-lg bg-gradient-to-br from-green-500/20 to-emerald-500/20 flex items-center justify-center">
                <svg class="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
                </svg>
            </div>
            <div>
                <p class="font-semibold text-green-400">${detection.denomination_formatted}</p>
                <p class="text-xs text-slate-500">${detection.confidence_percent}</p>
            </div>
        </div>
        <div class="text-right">
            <p class="text-xs text-green-400">✓ Đã thêm</p>
        </div>
    `;

    elements.detectionResults.insertBefore(item, elements.detectionResults.firstChild);
    elements.confirmedCount.textContent = `${state.confirmedBills.length} tờ`;
}

// ================================
// Exchange Rate Functions
// ================================
async function fetchExchangeRates() {
    try {
        const response = await fetch(CONFIG.EXCHANGE_API_URL);
        if (!response.ok) throw new Error('Failed');

        const data = await response.json();

        state.exchangeRates.USD = 1 / data.rates.USD;
        state.exchangeRates.EUR = 1 / data.rates.EUR;
        state.exchangeRates.JPY = 1 / data.rates.JPY;

        elements.rateUSD.textContent = Math.round(state.exchangeRates.USD).toLocaleString('vi-VN');
        elements.rateEUR.textContent = Math.round(state.exchangeRates.EUR).toLocaleString('vi-VN');
        elements.rateJPY.textContent = Math.round(state.exchangeRates.JPY).toLocaleString('vi-VN');

        elements.ratesUpdateTime.textContent = `Cập nhật lúc: ${new Date().toLocaleTimeString('vi-VN')}`;
        updateTotals();

    } catch (error) {
        state.exchangeRates = { USD: 24500, EUR: 26500, JPY: 165 };
        elements.rateUSD.textContent = '24,500';
        elements.rateEUR.textContent = '26,500';
        elements.rateJPY.textContent = '165';
    }
}

function updateTotals() {
    elements.totalVND.textContent = formatVND(state.totalVND);

    if (state.exchangeRates.USD > 0) {
        elements.totalUSD.textContent = formatUSD(state.totalVND / state.exchangeRates.USD);
        elements.totalEUR.textContent = formatEUR(state.totalVND / state.exchangeRates.EUR);
        elements.totalJPY.textContent = formatJPY(state.totalVND / state.exchangeRates.JPY);
    }
}

function clearResults() {
    state.totalVND = 0;
    state.confirmedBills = [];

    elements.detectionResults.innerHTML = '';
    elements.confirmedSection.classList.add('hidden');
    elements.confirmedCount.textContent = '0 tờ';

    if (!state.currentDetection) {
        elements.noResults.classList.remove('hidden');
    }

    updateTotals();
    showToast('Đã xóa tất cả', 'info');
}

// ================================
// File Upload with Preview
// ================================
let pendingFile = null;

function showImagePreview(file) {
    pendingFile = file;

    // Create preview URL
    const reader = new FileReader();
    reader.onload = (e) => {
        elements.previewImage.src = e.target.result;
        elements.previewFilename.textContent = file.name;

        // Show preview, hide dropzone
        elements.dropZone.classList.add('hidden');
        elements.imagePreview.classList.remove('hidden');
    };
    reader.readAsDataURL(file);

    showToast('Ảnh đã tải - Bấm Xác Nhận để nhận diện', 'info');
}

function hideImagePreview() {
    pendingFile = null;
    elements.previewImage.src = '';
    elements.dropZone.classList.remove('hidden');
    elements.imagePreview.classList.add('hidden');
}

async function processUploadedImage() {
    if (!pendingFile) {
        showToast('Chưa có ảnh để xử lý', 'error');
        return;
    }

    const wasStreaming = state.isStreaming;
    stopStreaming();

    showToast('Đang nhận diện...', 'info');

    try {
        const formData = new FormData();
        formData.append('file', pendingFile);

        const response = await fetch(`${CONFIG.API_URL}/predict`, {
            method: 'POST',
            body: formData,
        });

        const result = await response.json();

        if (result.success && result.predictions.length > 0) {
            const detection = result.predictions[0];
            state.currentDetection = detection;
            state.isStable = true;
            state.consecutiveCount = CONFIG.STABILITY_THRESHOLD;
            displayLiveDetection(detection);
            showToast(`✓ Phát hiện: ${detection.denomination_formatted}`, 'success');

            // Hide preview after successful detection
            hideImagePreview();
        } else {
            showToast('Không phát hiện tờ tiền trong ảnh', 'info');
        }

    } catch (error) {
        showToast(`Lỗi: ${error.message}`, 'error');
    }

    if (wasStreaming) {
        setTimeout(startStreaming, 2000);
    }
}

function handleFileSelect(file) {
    if (!file.type.startsWith('image/')) {
        showToast('Chọn file ảnh', 'error');
        return;
    }

    showImagePreview(file);
}

// ================================
// Event Listeners
// ================================
function initEventListeners() {
    elements.startCameraBtn.addEventListener('click', toggleCamera);
    elements.captureBtn.addEventListener('click', confirmDetection);
    elements.autoModeBtn.addEventListener('click', toggleStreaming);
    elements.switchCameraBtn.addEventListener('click', switchCamera);

    elements.confirmBtn.addEventListener('click', confirmDetection);
    elements.retryBtn.addEventListener('click', skipDetection);
    elements.cancelBtn.addEventListener('click', skipDetection);

    elements.refreshRatesBtn.addEventListener('click', fetchExchangeRates);
    elements.clearResultsBtn.addEventListener('click', clearResults);

    elements.dropZone.addEventListener('click', () => elements.fileInput.click());
    elements.dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        elements.dropZone.classList.add('drop-zone-active');
    });
    elements.dropZone.addEventListener('dragleave', () => {
        elements.dropZone.classList.remove('drop-zone-active');
    });
    elements.dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        elements.dropZone.classList.remove('drop-zone-active');
        if (e.dataTransfer.files[0]) handleFileSelect(e.dataTransfer.files[0]);
    });
    elements.fileInput.addEventListener('change', (e) => {
        if (e.target.files[0]) handleFileSelect(e.target.files[0]);
    });

    // Image preview buttons
    elements.confirmUploadBtn.addEventListener('click', processUploadedImage);
    elements.cancelUploadBtn.addEventListener('click', hideImagePreview);
    elements.changeImageBtn.addEventListener('click', () => {
        hideImagePreview();
        elements.fileInput.click();
    });

    document.addEventListener('keydown', (e) => {
        if (e.code === 'Space' && !e.repeat) {
            e.preventDefault();
            confirmDetection();
        }
        if (e.code === 'Escape' && !e.repeat) {
            e.preventDefault();
            skipDetection();
        }
        if (e.code === 'KeyP' && !e.repeat) {
            e.preventDefault();
            toggleStreaming();
        }
    });
}

// ================================
// Initialization
// ================================
async function init() {
    console.log('🚀 VND Currency Recognition - Better UX Mode');

    initEventListeners();
    await fetchExchangeRates();
    setInterval(fetchExchangeRates, CONFIG.RATES_UPDATE_INTERVAL);

    try {
        const response = await fetch(`${CONFIG.API_URL}/`);
        const data = await response.json();

        if (data.model_loaded) {
            showToast('Sẵn sàng! Bật camera để bắt đầu', 'success');
        } else {
            showToast('Model chưa được load', 'error');
        }
    } catch (error) {
        showToast('Không thể kết nối Backend', 'error');
    }
}

document.addEventListener('DOMContentLoaded', init);
