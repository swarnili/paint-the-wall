/**
 * controller.js — DOM UI Event Bindings for ChromaFlow Rehab.
 * Connects the HTML settings panels, calibration display, and status indicators
 * to the underlying InputHandler logic.
 */

// Synchronizes the connection status badges on the Home screen
function syncControllerUI() {
    const statusDot = document.getElementById('status-glow');
    const statusText = document.getElementById('status-text');
    const connectBtn = document.getElementById('ble-connect-btn');
    const calibrateBtn = document.getElementById('ble-calibrate-btn');

    if (!statusDot || !statusText || !connectBtn || !calibrateBtn) return;

    statusDot.className = 'glow-dot';

    const status = InputHandler.state.status;
    
    if (status === 'connected') {
        statusDot.classList.add('connected');
        statusText.innerText = 'Connected';
        connectBtn.innerText = 'Disconnect';
        calibrateBtn.disabled = false;
    } else if (status === 'connecting' || status === 'scanning') {
        statusDot.classList.add('scanning');
        statusText.innerText = (status === 'connecting') ? 'Connecting...' : 'Scanning...';
        connectBtn.innerText = 'Cancel';
        calibrateBtn.disabled = true;
    } else if (status === 'error') {
        statusDot.classList.add('disconnected');
        statusText.innerText = 'Error';
        connectBtn.innerText = 'Connect Controller';
        calibrateBtn.disabled = true;
    } else {
        statusDot.classList.add('disconnected');
        statusText.innerText = 'Disconnected';
        connectBtn.innerText = 'Connect Controller';
        calibrateBtn.disabled = true;
    }
}

const controllerSettings = {
    sensitivity: 1.0,       // Multiplier
    invertX: true,          // Default true because left/right was inverted in physical setup
    invertY: false,         // Default false (up/down is correct)
    tremorFilter: true,     // Moving average filter toggle
    tremorFilterSize: 8,    // Window size for moving average (sweet spot for rehab)
    inputMode: 'pointer'    // 'pointer' (mouse/touch direct) or 'velocity' (BLE/keyboard steering)
};

// Bind UI settings after the DOM content is fully loaded
function initControllerUI() {
    // Bind Rehabilitation UI Settings to InputHandler settings
    const brushSelect = document.getElementById('setting-brush-size');
    if (brushSelect) {
        brushSelect.addEventListener('change', (e) => {
            if (typeof activeBrushRadius !== 'undefined') {
                activeBrushRadius = parseInt(e.target.value);
            }
        });
    }

    const toleranceSelect = document.getElementById('setting-tolerance');
    if (toleranceSelect) {
        toleranceSelect.addEventListener('change', (e) => {
            if (typeof activeToleranceLimit !== 'undefined') {
                activeToleranceLimit = parseInt(e.target.value);
            }
        });
    }

    const timerSelect = document.getElementById('setting-timer');
    if (timerSelect) {
        timerSelect.addEventListener('change', (e) => {
            if (typeof activeTimerMode !== 'undefined') {
                activeTimerMode = e.target.value;
            }
        });
    }

    const sensSlider = document.getElementById('setting-sensitivity');
    if (sensSlider) {
        // Init default slider text
        document.getElementById('sens-val').innerText = InputHandler.settings.sensitivity.toFixed(1);
        sensSlider.value = InputHandler.settings.sensitivity;
        
        sensSlider.addEventListener('input', (e) => {
            const val = parseFloat(e.target.value);
            InputHandler.settings.sensitivity = val;
            document.getElementById('sens-val').innerText = val.toFixed(1);
        });
    }

    // Bind Axis Inversion & Smoothing Toggles
    const invX = document.getElementById('toggle-invert-x');
    if (invX) {
        invX.checked = InputHandler.settings.invertX;
        invX.addEventListener('change', (e) => {
            InputHandler.settings.invertX = e.target.checked;
        });
    }
    const invY = document.getElementById('toggle-invert-y');
    if (invY) {
        invY.checked = InputHandler.settings.invertY;
        invY.addEventListener('change', (e) => {
            InputHandler.settings.invertY = e.target.checked;
        });
    }
    const smoothToggle = document.getElementById('toggle-tremor');
    if (smoothToggle) {
        smoothToggle.checked = InputHandler.settings.tremorFilter;
        smoothToggle.addEventListener('change', (e) => {
            InputHandler.settings.tremorFilter = e.target.checked;
        });
    }

    // BLE Connect / Calibrate Click Triggers
    const connectBtn = document.getElementById('ble-connect-btn');
    if (connectBtn) {
        connectBtn.addEventListener('click', async () => {
            if (typeof AudioController !== 'undefined') AudioController.playClick();
            if (InputHandler.state.connected) {
                await InputHandler.disconnectBLE();
            } else {
                await InputHandler.connectBLE();
            }
        });
    }

    const calibrateBtn = document.getElementById('ble-calibrate-btn');
    if (calibrateBtn) {
        calibrateBtn.addEventListener('click', () => {
            if (typeof AudioController !== 'undefined') AudioController.playClick();
            InputHandler.calibrateZero();
            if (typeof showToast !== 'undefined') {
                showToast("Controller Calibrated Flat!", 1500);
            }
        });
    }

    // Register InputHandler connection status change listener
    InputHandler.onStatusChange = syncControllerUI;
    
    // Perform initial UI sync
    syncControllerUI();
}

// Wait for DOM to attach controls
window.addEventListener('DOMContentLoaded', initControllerUI);