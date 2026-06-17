/**
 * input_handler.js — Abstracted input system for ChromaFlow Rehab.
 * Manages Bluetooth Low Energy (BLE) connection to 'RehabController',
 * MPU6050 packet parsing, zero-calibration, inversion filters, sensitivity,
 * tremor filtering, and keyboard steering fallback.
 */

const InputHandler = {
    // Unified state accessible by the game engine
    state: {
        x: 0.0,
        y: 0.0,
        btnA: false,
        btnB: false,
        btnC: false,
        connected: false,
        status: 'disconnected', // 'disconnected', 'scanning', 'connecting', 'connected', 'error'
        errorMsg: '',
        rawX: 0.0,
        rawY: 0.0,
        offsetX: 0.0,
        offsetY: 0.0
    },

    // Calibration and adjustment settings
    settings: {
        sensitivity: 1.0,
        invertX: true,
        invertY: false,
        tremorFilter: true,
        tremorFilterSize: 8,
        inputMode: 'pointer' // 'pointer' or 'velocity'
    },

    // Web Bluetooth GATT UUIDs
    UUIDS: {
        SERVICE: '4fafc201-1fb5-459e-8fcc-c5c9c331914b',
        CHARACTERISTIC: 'beb5483e-36e1-4688-b7f5-ea07361b26a8'
    },

    device: null,
    characteristic: null,
    bleHistory: { x: [], y: [] },
    keyboardKeys: {
        ArrowLeft: false, ArrowRight: false, ArrowUp: false, ArrowDown: false,
        KeyA: false, KeyD: false, KeyW: false, KeyS: false,
        Space: false, Enter: false, Escape: false
    },

    // Callback when controller connection state changes
    onStatusChange: null,

    /**
     * Initializes input listeners
     */
    init() {
        window.addEventListener('keydown', (e) => this.handleKeyDown(e));
        window.addEventListener('keyup', (e) => this.handleKeyUp(e));
        
        // Tick keyboard updates periodically
        setInterval(() => this.tickKeyboardInput(), 16);
    },

    /**
     * Connect to the physical BLE RehabController
     */
    async connectBLE() {
        if (this.state.connected) {
            await this.disconnectBLE();
        }
        
        this.state.status = 'scanning';
        this.state.errorMsg = '';
        this.notifyStatusChange();

        try {
            console.log('[InputHandler] Requesting BLE device RehabController...');
            const device = await navigator.bluetooth.requestDevice({
                filters: [{ name: 'RehabController' }],
                optionalServices: [this.UUIDS.SERVICE]
            });

            this.device = device;
            this.state.status = 'connecting';
            this.notifyStatusChange();

            console.log('[InputHandler] Connecting to GATT server...');
            const server = await device.gatt.connect();
            
            device.addEventListener('gattserverdisconnected', () => this.onBLEDisconnected());

            console.log('[InputHandler] Getting primary service...');
            const service = await server.getPrimaryService(this.UUIDS.SERVICE);

            console.log('[InputHandler] Getting characteristic...');
            const characteristic = await service.getCharacteristic(this.UUIDS.CHARACTERISTIC);
            this.characteristic = characteristic;

            await characteristic.startNotifications();
            characteristic.addEventListener('characteristicvaluechanged', (e) => this.handleBLENotification(e));

            this.state.connected = true;
            this.state.status = 'connected';
            this.settings.inputMode = 'velocity';
            
            this.calibrateZero();
            
            console.log('[InputHandler] Connected successfully!');
            if (typeof showToast !== 'undefined') {
                showToast('BLE Controller Connected & Calibrated!', 2500);
            }
            this.notifyStatusChange();
            
        } catch (err) {
            console.error('[InputHandler] Connection failed:', err);
            this.state.connected = false;
            this.state.status = 'error';
            this.state.errorMsg = err.message || 'Connection failed.';
            if (typeof showToast !== 'undefined') {
                showToast(`BLE Error: ${err.message}`, 3000);
            }
            this.notifyStatusChange();
        }
    },

    /**
     * Disconnect BLE client
     */
    async disconnectBLE() {
        if (this.device && this.device.gatt.connected) {
            this.device.gatt.disconnect();
        } else {
            this.onBLEDisconnected();
        }
    },

    onBLEDisconnected() {
        console.log('[InputHandler] BLE Disconnected.');
        this.state.connected = false;
        this.state.status = 'disconnected';
        this.device = null;
        this.characteristic = null;
        this.bleHistory.x = [];
        this.bleHistory.y = [];
        
        if (!this.isKeyboardSteeringActive()) {
            this.settings.inputMode = 'pointer';
        }
        
        if (typeof showToast !== 'undefined') {
            showToast('BLE Controller Disconnected', 2000);
        }
        this.notifyStatusChange();
    },

    /**
     * Zero calibration setup
     */
    calibrateZero() {
        this.state.offsetX = this.state.rawX;
        this.state.offsetY = this.state.rawY;
        console.log(`[InputHandler] Calibration offsets: X=${this.state.offsetX.toFixed(4)}, Y=${this.state.offsetY.toFixed(4)}`);
        this.bleHistory.x = [];
        this.bleHistory.y = [];
    },

    handleBLENotification(event) {
        try {
            const valueStr = new TextDecoder().decode(event.target.value).trim();
            const parts = valueStr.split(',');
            if (parts.length === 2) {
                const rawX = parseFloat(parts[0]);
                const rawY = parseFloat(parts[1]);
                
                if (isNaN(rawX) || isNaN(rawY)) return;

                this.state.rawX = rawX;
                this.state.rawY = rawY;
                
                // Piecewise linear calibration mapping to preserve full [-1, 1] range of motion
                let calibX = 0;
                const offX = Math.max(-0.9, Math.min(0.9, this.state.offsetX));
                if (rawX >= offX) {
                    calibX = (1.0 - offX) !== 0 ? (rawX - offX) / (1.0 - offX) : 0;
                } else {
                    calibX = (offX + 1.0) !== 0 ? (rawX - offX) / (offX + 1.0) : 0;
                }

                let calibY = 0;
                const offY = Math.max(-0.9, Math.min(0.9, this.state.offsetY));
                if (rawY >= offY) {
                    calibY = (1.0 - offY) !== 0 ? (rawY - offY) / (1.0 - offY) : 0;
                } else {
                    calibY = (offY + 1.0) !== 0 ? (rawY - offY) / (offY + 1.0) : 0;
                }

                // Apply soft dead zone to prevent drift at neutral position
                const DEAD_ZONE = 0.05;
                if (Math.abs(calibX) < DEAD_ZONE) {
                    calibX = 0.0;
                } else {
                    calibX = Math.sign(calibX) * ((Math.abs(calibX) - DEAD_ZONE) / (1.0 - DEAD_ZONE));
                }

                if (Math.abs(calibY) < DEAD_ZONE) {
                    calibY = 0.0;
                } else {
                    calibY = Math.sign(calibY) * ((Math.abs(calibY) - DEAD_ZONE) / (1.0 - DEAD_ZONE));
                }

                if (this.settings.invertX) calibX = -calibX;
                if (this.settings.invertY) calibY = -calibY;

                let outX = calibX * this.settings.sensitivity;
                let outY = calibY * this.settings.sensitivity;

                if (this.settings.tremorFilter) {
                    this.bleHistory.x.push(outX);
                    this.bleHistory.y.push(outY);
                    
                    while (this.bleHistory.x.length > this.settings.tremorFilterSize) {
                        this.bleHistory.x.shift();
                        this.bleHistory.y.shift();
                    }
                    
                    this.state.x = this.bleHistory.x.reduce((a, b) => a + b, 0) / this.bleHistory.x.length;
                    this.state.y = this.bleHistory.y.reduce((a, b) => a + b, 0) / this.bleHistory.y.length;
                } else {
                    this.state.x = outX;
                    this.state.y = outY;
                }

                this.state.x = Math.max(-1.0, Math.min(1.0, this.state.x));
                this.state.y = Math.max(-1.0, Math.min(1.0, this.state.y));
            }
        } catch (e) {
            console.error('[InputHandler] Notification error:', e);
        }
    },

    // Keyboard handlers
    handleKeyDown(e) {
        if (e.code in this.keyboardKeys) {
            if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
                e.preventDefault();
            }
            this.keyboardKeys[e.code] = true;
            
            if (e.code === 'Escape') this.state.btnC = true;
            if (e.code === 'Space') this.state.btnA = true;
            if (e.code === 'Enter') this.state.btnB = true;
        }
    },

    handleKeyUp(e) {
        if (e.code in this.keyboardKeys) {
            this.keyboardKeys[e.code] = false;
            
            if (e.code === 'Escape') this.state.btnC = false;
            if (e.code === 'Space') this.state.btnA = false;
            if (e.code === 'Enter') this.state.btnB = false;
        }
    },

    isKeyboardSteeringActive() {
        return this.keyboardKeys.ArrowLeft || this.keyboardKeys.ArrowRight || 
               this.keyboardKeys.ArrowUp || this.keyboardKeys.ArrowDown ||
               this.keyboardKeys.KeyA || this.keyboardKeys.KeyD || 
               this.keyboardKeys.KeyW || this.keyboardKeys.KeyS;
    },

    tickKeyboardInput() {
        if (this.state.connected) return;

        let dx = 0.0;
        let dy = 0.0;

        if (this.keyboardKeys.ArrowLeft || this.keyboardKeys.KeyA) dx -= 1.0;
        if (this.keyboardKeys.ArrowRight || this.keyboardKeys.KeyD) dx += 1.0;
        if (this.keyboardKeys.ArrowUp || this.keyboardKeys.KeyW) dy -= 1.0;
        if (this.keyboardKeys.ArrowDown || this.keyboardKeys.KeyS) dy += 1.0;

        if (dx !== 0.0 || dy !== 0.0) {
            this.settings.inputMode = 'velocity';
            const mag = Math.hypot(dx, dy);
            if (mag > 0) {
                dx /= mag;
                dy /= mag;
            }
            this.state.x += (dx - this.state.x) * 0.15;
            this.state.y += (dy - this.state.y) * 0.15;
        } else {
            this.state.x += (0 - this.state.x) * 0.25;
            this.state.y += (0 - this.state.y) * 0.25;
            
            if (Math.hypot(this.state.x, this.state.y) < 0.01) {
                this.state.x = 0;
                this.state.y = 0;
                if (typeof mouse !== 'undefined' && !mouse.isDown) {
                    this.settings.inputMode = 'pointer';
                }
            }
        }
    },

    notifyStatusChange() {
        if (typeof this.onStatusChange === 'function') {
            this.onStatusChange();
        }
    }
};

// Initialize input handler
InputHandler.init();
