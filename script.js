let canvas;
let ctx;

const GLOBAL_COLORS = [
    { id: 1, hex: '#c5b4a0', name: 'Warm Ochre' },
    { id: 2, hex: '#8fa89b', name: 'Soft Sage' },
    { id: 3, hex: '#a6b1e1', name: 'Serene Blue' },
    { id: 4, hex: '#d9a0a0', name: 'Blush Clay' },
    { id: 5, hex: '#edd1b0', name: 'Muted Amber' },
    { id: 6, hex: '#a3b899', name: 'Olive Green' },
    { id: 7, hex: '#e2b4bd', name: 'Pale Rose' },
    { id: 8, hex: '#b2e3e8', name: 'Soft Cyan' },
    { id: 9, hex: '#c8b6ff', name: 'Light Violet' }
];

let gameState = 'HOME';
let currentLevelIndex = 0;
let activeColorIndex = 0;
let levelTimer = null;
let timeRemaining = 0;
let lastSpiderSoundTime = 0;

// Upgraded Rehab & Setting configurations
let activeBrushRadius = 26;          // Default brush size
let activeToleranceLimit = 40;       // Default spill limit percentage
let activeTimerMode = 'calm';        // Default: calm (no timer)
let brush = { worldX: 512, worldY: 320 }; // Virtual steering brush coordinates

// Session telemetry logs
let sessionStartTime = 0;
let sessionTotalTime = 0;
let sessionPaintTicks = 0;
let sessionSpillTicks = 0;
let sessionStrokeSpeeds = [];
let sessionStabilityDeviations = [];

// Web Audio API Sound Controller
const AudioController = {
    ctx: null,
    swooshPlaying: false,
    
    init() {
        if (!this.ctx) {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    },
    
    playClick() {
        this.init();
        if (!this.ctx) return;
        let osc = this.ctx.createOscillator();
        let gain = this.ctx.createGain();
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        
        osc.type = 'sine';
        osc.frequency.setValueAtTime(600, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(150, this.ctx.currentTime + 0.1);
        
        gain.gain.setValueAtTime(0.05, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.1);
        
        osc.start();
        osc.stop(this.ctx.currentTime + 0.1);
    },
    
    playSuccess() {
        this.init();
        if (!this.ctx) return;
        let now = this.ctx.currentTime;
        
        const playTone = (freq, delay, duration, vol) => {
            let osc = this.ctx.createOscillator();
            let gain = this.ctx.createGain();
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(freq, now + delay);
            gain.gain.setValueAtTime(0, now + delay);
            gain.gain.linearRampToValueAtTime(vol, now + delay + 0.05);
            gain.gain.exponentialRampToValueAtTime(0.001, now + delay + duration);
            
            osc.start(now + delay);
            osc.stop(now + delay + duration);
        };
        
        playTone(523.25, 0, 0.5, 0.06);
        playTone(587.33, 0.08, 0.5, 0.06);
        playTone(659.25, 0.16, 0.5, 0.06);
        playTone(783.99, 0.24, 0.5, 0.06);
        playTone(1046.50, 0.36, 0.8, 0.08);
    },
    
    playFailure() {
        this.init();
        if (!this.ctx) return;
        let now = this.ctx.currentTime;
        let osc = this.ctx.createOscillator();
        let gain = this.ctx.createGain();
        let filter = this.ctx.createBiquadFilter();
        
        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.ctx.destination);
        
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(180, now);
        osc.frequency.linearRampToValueAtTime(90, now + 0.45);
        
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(320, now);
        
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
        
        osc.start();
        osc.stop(now + 0.5);
    },

    playSpiderBite() {
        this.init();
        if (!this.ctx) return;
        let now = this.ctx.currentTime;
        let osc = this.ctx.createOscillator();
        let gain = this.ctx.createGain();
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        
        osc.type = 'square';
        osc.frequency.setValueAtTime(650, now);
        osc.frequency.exponentialRampToValueAtTime(80, now + 0.16);
        
        gain.gain.setValueAtTime(0.04, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
        
        osc.start();
        osc.stop(now + 0.16);
    },

    playPaintSwoosh() {
        this.init();
        if (!this.ctx || this.swooshPlaying) return;
        this.swooshPlaying = true;
        
        let now = this.ctx.currentTime;
        let bufferSize = this.ctx.sampleRate * 0.35; 
        let buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        let data = buffer.getChannelData(0);
        
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }
        
        let noise = this.ctx.createBufferSource();
        noise.buffer = buffer;
        
        let filter = this.ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = 350;
        filter.Q.value = 1.2;
        
        let gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.015, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
        
        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.ctx.destination);
        
        noise.start();
        
        setTimeout(() => {
            this.swooshPlaying = false;
        }, 250);
    }
};

const camera = {
    x: 512, y: 320, scale: 0.5,
    targetX: 512, targetY: 320, targetScale: 0.5,
    speed: 0.08,
    update() {
        this.x += (this.targetX - this.x) * this.speed;
        this.y += (this.targetY - this.y) * this.speed;
        this.scale += (this.targetScale - this.scale) * this.speed;
    }
};

const mouse = {
    canvasX: 512, canvasY: 320,
    worldX: 512, worldY: 320,
    lastWorldX: 512, lastWorldY: 320,
    isDown: false,
    vx: 0, vy: 0
};

let tremorOffset = { x: 0, y: 0 };
let tremorPhase = 0;

const ROOM_SURFACES = [
    {
        id: 1,
        name: "Left Focal Wall",
        desc: "Concentric Design Sandbox: Customize the 3 concentric rings and outer background wall. Select any color from the 9-color palette for your design.",
        poly: [{x:100, y:120}, {x:320, y:160}, {x:320, y:480}, {x:100, y:520}],
        colorTheme: GLOBAL_COLORS,
        type: 'sequence'
    },
    {
        id: 2,
        name: "Right Accent Wall",
        desc: "Accent Surface Customization: Stabilize this accent wall with any color choice you prefer.",
        poly: [{x:704, y:160}, {x:924, y:120}, {x:924, y:520}, {x:704, y:480}],
        colorTheme: GLOBAL_COLORS,
        type: 'spillover'
    },
    {
        id: 3,
        name: "Central Segmented Panel",
        desc: "Modernist Collage: Customize the geometric shapes (Square, Circle, Triangle, Pentagon, Background). Stay close to your active segment to avoid spillover.",
        poly: [{x:360, y:170}, {x:664, y:170}, {x:664, y:470}, {x:360, y:470}],
        colorTheme: GLOBAL_COLORS,
        type: 'sequence'
    },
    {
        id: 4,
        name: "The Modern Gallery Frame",
        desc: "Triptych Frame Sandbox: Color the 3 vertical gallery canvases with any colors while bypassing the moving obstacle cables.",
        poly: [{x:360, y:170}, {x:664, y:170}, {x:664, y:470}, {x:360, y:470}],
        colorTheme: GLOBAL_COLORS,
        type: 'complex',
        obstacles: [
            { cx: 412, cy: 220, r: 22, origY: 220, speedOffset: 0 },
            { cx: 612, cy: 420, r: 22, origY: 420, speedOffset: Math.PI }
        ]
    },
    {
        id: 5,
        name: "Upper Atrium Ceiling",
        desc: "Ceiling Chevron Sandbox: Coat the atrium ceiling with any color choice under tremor parameters. Banish the spider and stabilize.",
        poly: [{x:100, y:30}, {x:924, y:30}, {x:704, y:120}, {x:320, y:120}],
        colorTheme: GLOBAL_COLORS,
        type: 'master',
        spider: { x: 300, y: 60, vx: 2.2, vy: 1.5, r: 16, eatRadius: 28, active: true }
    }
];

const FURNITURE = [
    { type: 'Sofa Base', poly: [{x:360, y:480}, {x:664, y:480}, {x:684, y:570}, {x:340, y:570}], color: '#cbd5e1' },
    { type: 'Sofa Back', poly: [{x:360, y:440}, {x:664, y:440}, {x:664, y:480}, {x:360, y:480}], color: '#94a3b8' },
    // Lamp positioned on the right side of the room
    { type: 'Lamp Stem', poly: [{x:728, y:490}, {x:732, y:490}, {x:732, y:580}, {x:728, y:580}], color: '#475569' },
    { type: 'Lamp Shade', poly: [{x:716, y:440}, {x:744, y:440}, {x:752, y:490}, {x:708, y:490}], color: '#f8fafc' },
    { type: 'Table Unit', poly: [{x:420, y:560}, {x:604, y:560}, {x:614, y:600}, {x:410, y:600}], color: '#64748b' }
];

// Concentric circle classifier helper for Wall 1
function getWall1Tile(pt, surface) {
    let cx = 210, cy = 320;
    let dist = Math.hypot(pt.x - cx, pt.y - cy);
    if (dist < 30) return surface.tiles[0];
    if (dist < 60) return surface.tiles[1];
    if (dist < 95) return surface.tiles[2];
    return surface.tiles[3];
}

// Geometric shape classifier helper for Wall 3
function getWall3Tile(pt, surface) {
    // Check Square
    if (pt.x >= 388 && pt.x <= 452 && pt.y >= 208 && pt.y <= 272) {
        return surface.tiles[0];
    }
    // Check Circle
    if (Math.hypot(pt.x - 600, pt.y - 240) < 32) {
        return surface.tiles[1];
    }
    // Check Triangle
    if (isPointInPoly(pt, surface.tiles[2].poly)) {
        return surface.tiles[2];
    }
    // Check Pentagon
    if (isPointInPoly(pt, surface.tiles[3].poly)) {
        return surface.tiles[3];
    }
    // Otherwise Background
    return surface.tiles[4];
}

function initSurfaceMasks(surface) {
    let minX = Math.min(...surface.poly.map(p => p.x));
    let maxX = Math.max(...surface.poly.map(p => p.x));
    let minY = Math.min(...surface.poly.map(p => p.y));
    let maxY = Math.max(...surface.poly.map(p => p.y));

    surface.bounds = { minX: minX - 10, maxX: maxX + 10, minY: minY - 10, maxY: maxY + 10, w: (maxX - minX) + 20, h: (maxY - minY) + 20 };

    let pCanvas = document.createElement('canvas');
    pCanvas.width = surface.bounds.w;
    pCanvas.height = surface.bounds.h;
    surface.paintCtx = pCanvas.getContext('2d');
    surface.paintCanvas = pCanvas;

    if(surface.type === 'sequence') {
        if (surface.id === 1) {
            // Concentric rings on Wall 1
            surface.tiles = [
                { id: 1, name: "Inner Circle", isCircle: true, rMax: 30, rMin: 0, cleared: false, colorHex: null },
                { id: 2, name: "Middle Ring", isCircle: true, rMax: 60, rMin: 30, cleared: false, colorHex: null },
                { id: 3, name: "Outer Ring", isCircle: true, rMax: 95, rMin: 60, cleared: false, colorHex: null },
                { id: 4, name: "Wall Background", isCircle: true, rMax: Infinity, rMin: 95, cleared: false, colorHex: null }
            ];
        } else {
            // Shapes layout split for Wall 3
            surface.tiles = [
                { id: 1, name: "Square Segment", type: 'square', cleared: false, colorHex: null },
                { id: 2, name: "Circle Segment", type: 'circle', cleared: false, colorHex: null },
                { id: 3, name: "Triangle Segment", type: 'poly', poly: [{x:420, y:360}, {x:385, y:430}, {x:455, y:430}], cleared: false, colorHex: null },
                { id: 4, name: "Pentagon Segment", type: 'poly', poly: [{x:600, y:364}, {x:634, y:389}, {x:621, y:429}, {x:579, y:429}, {x:566, y:389}], cleared: false, colorHex: null },
                { id: 5, name: "Panel Background", type: 'bg', cleared: false, colorHex: null }
            ];
        }
    }

    if(surface.type === 'complex') {
        let p1 = minX + (maxX - minX) * 0.22;
        let p2 = minX + (maxX - minX) * 0.78;
        surface.zones = [
            { id: 1, colorId: 2, name: "Left Accent Pillar", poly: [{x:minX, y:minY}, {x:p1, y:minY}, {x:p1, y:maxY}, {x:minX, y:maxY}], cleared: false, colorHex: null },
            { id: 2, colorId: 3, name: "Main Focal Frame", poly: [{x:p1, y:minY}, {x:p2, y:minY}, {x:p2, y:maxY}, {x:p1, y:maxY}], cleared: false, colorHex: null },
            { id: 3, colorId: 4, name: "Right Accent Pillar", poly: [{x:p2, y:minY}, {x:maxX, y:minY}, {x:maxX, y:maxY}, {x:p2, y:maxY}], cleared: false, colorHex: null }
        ];
    }

    mapTargetAnalysis(surface);
}

function mapTargetAnalysis(surface) {
    surface.samplePoints = [];
    for (let y = surface.bounds.minY; y <= surface.bounds.maxY; y += 6) {
        for (let x = surface.bounds.minX; x <= surface.bounds.maxX; x += 6) {
            let pt = { x: x, y: y };
            if (isPointInPoly(pt, surface.poly)) {
                let closeToEdge = false;
                for (let k = 0; k < surface.poly.length; k++) {
                    let p1 = surface.poly[k];
                    let p2 = surface.poly[(k + 1) % surface.poly.length];
                    if (getDistanceToSegment(pt, p1, p2) < 5) {
                        closeToEdge = true;
                        break;
                    }
                }
                if (!closeToEdge) {
                    let spt = { x: x, y: y, filled: false };
                    if (surface.id === 1) {
                        let tile = getWall1Tile(spt, surface);
                        spt.tileId = tile.id;
                    } else if (surface.id === 3) {
                        let tile = getWall3Tile(spt, surface);
                        spt.tileId = tile.id;
                    }
                    surface.samplePoints.push(spt);
                }
            }
        }
    }
    surface.totalTargetPoints = surface.samplePoints.length;
    surface.coveragePct = 0;
    surface.spilloverPct = 0;
    surface.totalSpillStrikes = 0;
    surface.paintResource = 100.0;
    surface.colorHex = null;
    if(surface.tiles) {
        surface.tiles.forEach(t => {
            t.cleared = false;
            t.colorHex = null;
        });
    }
    if(surface.paintCtx) {
        surface.paintCtx.clearRect(0, 0, surface.bounds.w, surface.bounds.h);
    }
    if(surface.spider) {
        surface.spider.x = surface.bounds.minX + 60;
        surface.spider.y = surface.bounds.minY + 30;
        surface.spider.vx = Math.abs(surface.spider.vx);
        surface.spider.vy = Math.abs(surface.spider.vy);
        surface.spider.active = true;
    }
}

function getDistanceToSegment(p, a, b) {
    let l2 = Math.hypot(b.x - a.x, b.y - a.y) ** 2;
    if (l2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
    let t = ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / l2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(p.x - (a.x + t * (b.x - a.x)), p.y - (a.y + t * (b.y - a.y)));
}

function isPointInPoly(pt, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        let xi = poly[i].x, yi = poly[i].y;
        let xj = poly[j].x, yj = poly[j].y;
        if (((yi > pt.y) !== (yj > pt.y)) && (pt.x < (xj - xi) * (pt.y - yi) / (yj - yi) + xi)) {
            inside = !inside;
        }
    }
    return inside;
}

function resizeGame() {
    const wrapper = document.getElementById('game-wrapper');
    if (!wrapper) return;
    const width = 1024;
    const height = 640;
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;
    
    const scaleX = (windowWidth - 30) / width;
    const scaleY = (windowHeight - 30) / height;
    const scale = Math.min(1, Math.min(scaleX, scaleY));
    
    if (scale < 1) {
        wrapper.style.transform = `scale(${scale})`;
        wrapper.style.transformOrigin = 'center center';
    } else {
        wrapper.style.transform = 'none';
    }
}

function init() {
    canvas = document.getElementById('gameCanvas');
    ctx = canvas.getContext('2d');

    const updateCoords = (clientX, clientY) => {
        let rect = canvas.getBoundingClientRect();
        mouse.canvasX = (clientX - rect.left) * (canvas.width / rect.width);
        mouse.canvasY = (clientY - rect.top) * (canvas.height / rect.height);
    };

    window.addEventListener('mousemove', (e) => updateCoords(e.clientX, e.clientY));
    window.addEventListener('mousedown', () => { 
        AudioController.init();
        mouse.isDown = true; 
    });
    window.addEventListener('mouseup', () => { mouse.isDown = false; });

    window.addEventListener('touchmove', (e) => {
        if (gameState === 'PLAYING') {
            e.preventDefault(); 
        }
        if(e.touches.length > 0) { updateCoords(e.touches[0].clientX, e.touches[0].clientY); }
    }, { passive: false });
    
    window.addEventListener('touchstart', (e) => {
        AudioController.init();
        if(e.touches.length > 0) { updateCoords(e.touches[0].clientX, e.touches[0].clientY); }
        mouse.isDown = true;
    }, { passive: true });
    window.addEventListener('touchend', () => { mouse.isDown = false; });
    window.addEventListener('touchcancel', () => { mouse.isDown = false; });

    window.addEventListener('resize', resizeGame);
    resizeGame();

    // Pause screen buttons
    document.getElementById('pause-resume-btn').addEventListener('click', () => {
        AudioController.playClick();
        resumeGame();
    });
    document.getElementById('pause-restart-btn').addEventListener('click', () => {
        AudioController.playClick();
        resumeGame();
        resetLevel(currentLevelIndex);
    });
    document.getElementById('pause-quit-btn').addEventListener('click', () => {
        AudioController.playClick();
        if (levelTimer) { clearInterval(levelTimer); }
        switchScreen('home-screen');
        gameState = 'HOME';
        currentLevelIndex = 0;
        camera.targetScale = 0.5;
        camera.targetX = 512;
        camera.targetY = 320;
    });

    // Summary screen buttons
    document.getElementById('export-report-btn').addEventListener('click', () => {
        AudioController.playClick();
        exportSessionCSV();
    });

    // Core Game flow button triggers
    document.getElementById('start-btn').addEventListener('click', () => {
        AudioController.playClick();
        startCinematicSequence();
    });
    document.getElementById('retry-btn').addEventListener('click', () => {
        AudioController.playClick();
        resetLevel(currentLevelIndex);
    });
    document.getElementById('next-btn').addEventListener('click', () => {
        AudioController.playClick();
        advanceSequence();
    });
    document.getElementById('restart-game-btn').addEventListener('click', () => {
        AudioController.playClick();
        ROOM_SURFACES.forEach(s => {
            if(s.paintCtx) { s.paintCtx.clearRect(0,0, s.bounds.w, s.bounds.h); }
            mapTargetAnalysis(s);
        });
        switchScreen('home-screen');
        gameState = 'HOME';
        currentLevelIndex = 0;
        camera.targetScale = 0.5;
        camera.targetX = 512;
        camera.targetY = 320;
    });

    ROOM_SURFACES.forEach(surface => initSurfaceMasks(surface));
    requestAnimationFrame(tick);
}

function startCinematicSequence() {
    // Capture settings
    activeBrushRadius = parseInt(document.getElementById('setting-brush-size').value);
    activeToleranceLimit = parseInt(document.getElementById('setting-tolerance').value);
    activeTimerMode = document.getElementById('setting-timer').value;

    // Reset session metrics
    sessionStartTime = Date.now();
    sessionTotalTime = 0;
    sessionPaintTicks = 0;
    sessionSpillTicks = 0;
    sessionStrokeSpeeds = [];
    sessionStabilityDeviations = [];
    
    // Set initial virtual brush coordinates to center
    brush.worldX = 512;
    brush.worldY = 320;

    switchScreen(null);
    gameState = 'CINEMATIC';
    camera.targetScale = 0.85;
    camera.targetX = 512;
    camera.targetY = 320;
    showToast("Observe the space. Controlled stability restores harmony.", 3200);
    setTimeout(() => { enterLevel(0); }, 3500);
}

function enterLevel(idx) {
    currentLevelIndex = idx;
    let surface = ROOM_SURFACES[idx];
    gameState = 'PLAYING';

    let sBounds = surface.bounds;
    let targetCX = sBounds.minX + sBounds.w / 2;
    let targetCY = sBounds.minY + sBounds.h / 2;

    camera.targetScale = 1.4;
    camera.targetX = targetCX;
    camera.targetY = targetCY;

    // Center the steering brush on the target to prevent sudden boundary spillover checks
    brush.worldX = targetCX;
    brush.worldY = targetCY;
    mouse.worldX = targetCX;
    mouse.worldY = targetCY;
    mouse.lastWorldX = targetCX;
    mouse.lastWorldY = targetCY;
    mouse.vx = 0;
    mouse.vy = 0;

    document.getElementById('hud-level-title').innerText = `Level ${surface.id}: ${surface.name}`;
    document.getElementById('hud-level-desc').innerText = surface.desc;

    document.getElementById('stat-spill-container').style.display = 'flex';
    document.getElementById('stat-resource-container').style.display = (surface.type === 'master') ? 'flex' : 'none';

    setInitialColorForLevel(surface);
    buildPaletteUI(surface);
    updateHUDMetrics(surface);
    setupTimer(surface);

    document.getElementById('hud').classList.add('active');
    document.getElementById('palette-container').classList.add('active');
}

function setInitialColorForLevel(surface) {
    if (activeColorIndex === undefined || activeColorIndex === null) {
        activeColorIndex = 0;
    }
}

function buildPaletteUI(surface) {
    let container = document.getElementById('palette');
    container.innerHTML = '';
    
    // Build full 9-color selection set
    GLOBAL_COLORS.forEach((color, idx) => {
        let el = document.createElement('div');
        el.className = `palette-color ${idx === activeColorIndex ? 'active' : ''}`;
        el.style.backgroundColor = color.hex;
        el.innerText = color.id;
        el.title = color.name;
        el.addEventListener('click', () => {
            AudioController.playClick();
            activeColorIndex = idx;
            container.querySelectorAll('.palette-color').forEach(btn => btn.classList.remove('active'));
            el.classList.add('active');
            showToast(`Selected Color ${color.id}: ${color.name}`, 1500);
        });
        container.appendChild(el);
    });
}

function setupTimer(surface) {
    if(levelTimer) { clearInterval(levelTimer); }
    if (activeTimerMode === 'calm') {
        document.getElementById('stat-timer').innerText = "CALM";
        return;
    }
    timeRemaining = (surface.type === 'master') ? 90 : 180;
    updateTimerUI();
    levelTimer = setInterval(() => {
        if(gameState === 'PLAYING') {
            timeRemaining--;
            updateTimerUI();
            if(timeRemaining <= 0) {
                triggerFailure("Time Window Concluded", "Let's step back, reset fatigue parameters, and enter again.");
            }
        }
    }, 1000);
}

function updateTimerUI() {
    let m = Math.floor(timeRemaining / 60);
    let s = timeRemaining % 60;
    document.getElementById('stat-timer').innerText = `${m}:${s < 10 ? '0' : ''}${s}`;
}

function updateHUDMetrics(surface) {
    let roundedCoverage = Math.min(100, Math.floor(surface.coveragePct));
    document.getElementById('stat-coverage').innerText = `${roundedCoverage}%`;
    document.getElementById('stat-spillover').innerText = `${Math.floor(surface.spilloverPct)}%`;
    document.getElementById('stat-resource').innerText = `${Math.ceil(surface.paintResource)}%`;

    if(surface.spilloverPct > 30) {
        document.getElementById('stat-spillover').classList.add('danger');
    } else {
        document.getElementById('stat-spillover').classList.remove('danger');
    }
}

function processPaintingStroke(surface) {
    if (surface.type === 'master') {
        tremorPhase += 0.28;
        tremorOffset.x = Math.sin(tremorPhase) * 3.5;
        tremorOffset.y = Math.cos(tremorPhase * 0.7) * 3.5;
    } else {
        tremorOffset.x = 0;
        tremorOffset.y = 0;
    }

    if (InputHandler.settings.inputMode === 'velocity') {
        // Velocity-based steering (Rehab BLE / Keyboard)
        const speed = 3.0;
        brush.worldX += InputHandler.state.x * speed;
        brush.worldY += InputHandler.state.y * speed;

        // Clamp inside canvas boundary
        brush.worldX = Math.max(0, Math.min(1024, brush.worldX));
        brush.worldY = Math.max(0, Math.min(640, brush.worldY));

        mouse.worldX = brush.worldX + tremorOffset.x;
        mouse.worldY = brush.worldY + tremorOffset.y;
    } else {
        // Absolute Pointer mode (Mouse/Touch)
        let unscaledX = mouse.canvasX - canvas.width / 2;
        let unscaledY = mouse.canvasY - canvas.height / 2;
        brush.worldX = unscaledX / camera.scale + camera.x;
        brush.worldY = unscaledY / camera.scale + camera.y;

        mouse.worldX = brush.worldX + tremorOffset.x;
        mouse.worldY = brush.worldY + tremorOffset.y;
    }

    mouse.vx = mouse.worldX - mouse.lastWorldX;
    mouse.vy = mouse.worldY - mouse.lastWorldY;
    mouse.lastWorldX = mouse.worldX;
    mouse.lastWorldY = mouse.worldY;

    // Check if painting is active
    const isPainting = (InputHandler.settings.inputMode === 'velocity') ? true : mouse.isDown;
    if (!isPainting) { return; }
    if (InputHandler.settings.inputMode !== 'velocity' && mouse.canvasY > 540) { return; }
    if (surface.type === 'master' && surface.paintResource <= 0) { return; }

    // Session logs: increment active paint ticks
    sessionPaintTicks++;

    // Track velocities and tremor deviations for telemetry
    const velocity = Math.hypot(mouse.vx, mouse.vy);
    sessionStrokeSpeeds.push(velocity);
    if (InputHandler.state.connected) {
        const rawDelta = Math.hypot(InputHandler.state.rawX - InputHandler.state.x, InputHandler.state.rawY - InputHandler.state.y);
        sessionStabilityDeviations.push(rawDelta);
    }

    // Play subtle swooshing audio feedback
    if (velocity > 1.5) {
        AudioController.playPaintSwoosh();
    }

    let activeColor = GLOBAL_COLORS[activeColorIndex];
    let brushRadius = activeBrushRadius;
    let ptWorld = { x: mouse.worldX, y: mouse.worldY };
    let isInsideSurface = isPointInPoly(ptWorld, surface.poly);

    if (!isInsideSurface) {
        sessionSpillTicks++;
        surface.totalSpillStrikes += 1.8;
        surface.spilloverPct = (surface.totalSpillStrikes / 200) * 100;
        updateHUDMetrics(surface);
        if (surface.spilloverPct >= activeToleranceLimit) {
            triggerFailure("Boundary Precision Limit", `Spillover crossed the strict ${activeToleranceLimit}% margin threshold.`);
        }
        return;
    }

    // Save colors chosen by the user for single-color walls
    if (surface.type === 'spillover' || surface.type === 'master') {
        surface.colorHex = activeColor.hex;
    }

    // Obstacle interference cable check for Level 4
    if (surface.type === 'complex') {
        let hitObstacle = surface.obstacles.some(obs => Math.hypot(mouse.worldX - obs.cx, mouse.worldY - obs.cy) < (obs.r + brushRadius * 0.3));
        if (hitObstacle) {
            sessionSpillTicks += 2; // heavier penalty
            surface.totalSpillStrikes += 4.5;
            surface.spilloverPct = (surface.totalSpillStrikes / 200) * 100;
            updateHUDMetrics(surface);
            if (surface.spilloverPct >= activeToleranceLimit) {
                triggerFailure("Structural Interference Strike", `The hanging cables touched the active paint line boundary.`);
            }
            return;
        }
        
        let activeZone = surface.zones.find(z => isPointInPoly(ptWorld, z.poly));
        if (activeZone && !activeZone.cleared) {
            let zPoints = surface.samplePoints.filter(p => p.x >= activeZone.poly[0].x && p.x <= activeZone.poly[1].x);
            let zFilled = zPoints.filter(p => p.filled).length;
            if (zPoints.length > 0 && (zFilled / zPoints.length) >= 0.94) {
                activeZone.cleared = true;
                activeZone.colorHex = activeColor.hex; // SAVE USER COLOR CHOICE
                showToast(`${activeZone.name} Clear!`, 1500);
            }
        }
    }

    if (surface.type === 'master') {
        let strokeVelocity = Math.hypot(mouse.vx, mouse.vy);
        surface.paintResource = Math.max(0, surface.paintResource - (strokeVelocity * 0.012 + 0.04));
        updateHUDMetrics(surface);
        if (surface.paintResource <= 0 && surface.coveragePct < 98.0) {
            triggerFailure("Paint Reserves Exhausted", "Resource configuration efficiency fell beneath operating standard thresholds.");
            return;
        }
    }

    let pCtx = surface.paintCtx;
    let localX = mouse.worldX - surface.bounds.minX;
    let localY = mouse.worldY - surface.bounds.minY;

    pCtx.save();
    pCtx.globalCompositeOperation = 'source-over';
    pCtx.beginPath();
    pCtx.arc(localX, localY, brushRadius, 0, Math.PI * 2);
    pCtx.fillStyle = activeColor.hex;
    pCtx.fill();
    pCtx.restore();

    let filledCount = 0;
    surface.samplePoints.forEach(pt => {
        if (!pt.filled) {
            let dist = Math.hypot(mouse.worldX - pt.x, mouse.worldY - pt.y);
            if (dist < (brushRadius * 0.75)) {
                pt.filled = true;
            }
        }
        if (pt.filled) { filledCount++; }
    });

    surface.coveragePct = (filledCount / surface.totalTargetPoints) * 100;

    if (surface.type === 'sequence') {
        surface.tiles.forEach(tile => {
            if (!tile.cleared) {
                let tPoints = surface.samplePoints.filter(p => p.tileId === tile.id);
                let tFilled = tPoints.filter(p => p.filled).length;
                if (tPoints.length > 0 && (tFilled / tPoints.length) >= 0.94) {
                    tile.cleared = true;
                    tile.colorHex = activeColor.hex; // SAVE USER COLOR CHOICE
                    showToast(`${tile.name} Stabilized!`, 1500);
                }
            }
        });

        let allTilesCleared = surface.tiles.every(t => t.cleared);
        if (allTilesCleared) {
            surface.coveragePct = 100;
        }
    }

    updateHUDMetrics(surface);

    // Require 98% coverage to complete (locks in 100% cleanly)
    if (surface.coveragePct >= 98.0) {
        triggerLevelSuccess();
    }
}

function finalizeSurfaceCoverage(surface) {
    surface.samplePoints.forEach(pt => pt.filled = true);
    surface.coveragePct = 100;

    let pCtx = surface.paintCtx;
    pCtx.save();
    pCtx.globalCompositeOperation = 'source-over';

    if (surface.type === 'sequence') {
        surface.tiles.forEach(tile => {
            tile.cleared = true;
            let colorHex = tile.colorHex || GLOBAL_COLORS[activeColorIndex].hex;
            pCtx.beginPath();
            if (surface.id === 1) {
                // Concentric circles clipping paths for Wall 1
                let cx = 210 - surface.bounds.minX;
                let cy = 320 - surface.bounds.minY;
                if (tile.id === 1) {
                    pCtx.arc(cx, cy, 30, 0, Math.PI * 2);
                } else if (tile.id === 2) {
                    pCtx.arc(cx, cy, 60, 0, Math.PI * 2);
                    pCtx.arc(cx, cy, 30, 0, Math.PI * 2, true);
                } else if (tile.id === 3) {
                    pCtx.arc(cx, cy, 95, 0, Math.PI * 2);
                    pCtx.arc(cx, cy, 60, 0, Math.PI * 2, true);
                } else {
                    surface.poly.forEach((p, i) => {
                        let lx = p.x - surface.bounds.minX;
                        let ly = p.y - surface.bounds.minY;
                        i === 0 ? pCtx.moveTo(lx, ly) : pCtx.lineTo(lx, ly);
                    });
                    pCtx.closePath();
                    pCtx.arc(cx, cy, 95, 0, Math.PI * 2, true);
                }
            } else if (surface.id === 3) {
                // Shapes collage clipping paths for Wall 3
                if (tile.id === 1) { // Square
                    pCtx.rect(388 - surface.bounds.minX, 208 - surface.bounds.minY, 64, 64);
                } else if (tile.id === 2) { // Circle
                    pCtx.arc(600 - surface.bounds.minX, 240 - surface.bounds.minY, 32, 0, Math.PI * 2);
                } else if (tile.id === 3 || tile.id === 4) { // Triangle & Pentagon
                    tile.poly.forEach((p, i) => {
                        let lx = p.x - surface.bounds.minX;
                        let ly = p.y - surface.bounds.minY;
                        i === 0 ? pCtx.moveTo(lx, ly) : pCtx.lineTo(lx, ly);
                    });
                } else { // Wall Background
                    surface.poly.forEach((p, i) => {
                        let lx = p.x - surface.bounds.minX;
                        let ly = p.y - surface.bounds.minY;
                        i === 0 ? pCtx.moveTo(lx, ly) : pCtx.lineTo(lx, ly);
                    });
                    pCtx.closePath();
                    // Cutouts
                    pCtx.rect(388 - surface.bounds.minX, 208 - surface.bounds.minY, 64, 64);
                    pCtx.arc(600 - surface.bounds.minX, 240 - surface.bounds.minY, 32, 0, Math.PI * 2, true);
                    
                    let tri = surface.tiles[2];
                    tri.poly.forEach((p, i) => {
                        let lx = p.x - surface.bounds.minX;
                        let ly = p.y - surface.bounds.minY;
                        i === 0 ? pCtx.moveTo(lx, ly) : pCtx.lineTo(lx, ly);
                    });
                    pCtx.closePath();
                    
                    let pent = surface.tiles[3];
                    pent.poly.forEach((p, i) => {
                        let lx = p.x - surface.bounds.minX;
                        let ly = p.y - surface.bounds.minY;
                        i === 0 ? pCtx.moveTo(lx, ly) : pCtx.lineTo(lx, ly);
                    });
                    pCtx.closePath();
                }
            }
            pCtx.closePath();
            pCtx.fillStyle = colorHex;
            pCtx.fill('evenodd');
        });
    } else if (surface.type === 'complex') {
        surface.zones.forEach(z => {
            let colorHex = z.colorHex || GLOBAL_COLORS[activeColorIndex].hex;
            pCtx.beginPath();
            z.poly.forEach((p, i) => {
                let lx = p.x - surface.bounds.minX;
                let ly = p.y - surface.bounds.minY;
                if (i === 0) pCtx.moveTo(lx, ly);
                else pCtx.lineTo(lx, ly);
            });
            pCtx.closePath();
            pCtx.fillStyle = colorHex;
            pCtx.fill();
        });
    } else {
        let colorHex = surface.colorHex || GLOBAL_COLORS[activeColorIndex].hex;
        pCtx.beginPath();
        surface.poly.forEach((p, i) => {
            let lx = p.x - surface.bounds.minX;
            let ly = p.y - surface.bounds.minY;
            if (i === 0) pCtx.moveTo(lx, ly);
            else pCtx.lineTo(lx, ly);
        });
        pCtx.closePath();
        pCtx.fillStyle = colorHex;
        pCtx.fill();
    }

    pCtx.restore();
    updateHUDMetrics(surface);
}

function triggerLevelSuccess() {
    let surface = ROOM_SURFACES[currentLevelIndex];

    finalizeSurfaceCoverage(surface);

    gameState = 'CINEMATIC';
    if (levelTimer) { clearInterval(levelTimer); }
    
    AudioController.playSuccess();
    
    document.getElementById('hud').classList.remove('active');
    document.getElementById('palette-container').classList.remove('active');
    camera.targetScale = 0.5;
    camera.targetX = 512;
    camera.targetY = 320;
    setTimeout(() => {
        if (currentLevelIndex === ROOM_SURFACES.length - 1) {
            showSessionSummary();
        } else {
            switchScreen('success-screen');
            gameState = 'SUCCESS_SCREEN';
        }
    }, 1200);
}

function triggerFailure(title, description) {
    gameState = 'CINEMATIC';
    if (levelTimer) { clearInterval(levelTimer); }
    
    AudioController.playFailure();
    
    document.getElementById('hud').classList.remove('active');
    document.getElementById('palette-container').classList.remove('active');
    camera.targetScale = 0.5;
    camera.targetX = 512;
    camera.targetY = 320;
    document.getElementById('fail-title').innerText = title;
    document.getElementById('fail-reason').innerText = description;
    setTimeout(() => {
        switchScreen('fail-screen');
        gameState = 'FAIL_SCREEN';
    }, 1200);
}

function resetLevel(idx) {
    let surface = ROOM_SURFACES[idx];
    surface.paintCtx.clearRect(0, 0, surface.bounds.w, surface.bounds.h);
    mapTargetAnalysis(surface);
    switchScreen(null);
    enterLevel(idx);
}

// ─── REHAB CLINICAL TELEMETRY & CONTROLS ─────────────────────────────────────

function showSessionSummary() {
    // 1. Calculate active session time
    let durationSec = Math.floor((Date.now() - sessionStartTime) / 1000);
    sessionTotalTime = durationSec;
    let mins = Math.floor(durationSec / 60);
    let secs = durationSec % 60;
    document.getElementById('summary-time').innerText = `${mins}m ${secs}s`;

    // 2. Calculate accuracy (in-bounds ticks vs total ticks)
    let accuracy = 100;
    if (sessionPaintTicks > 0) {
        accuracy = Math.max(0, Math.min(100, Math.floor(((sessionPaintTicks - sessionSpillTicks) / sessionPaintTicks) * 100)));
    }
    document.getElementById('summary-accuracy').innerText = `${accuracy}%`;

    // 3. Calculate average pacing (stroke speed, scaled for readability)
    let avgSpeed = 0;
    if (sessionStrokeSpeeds.length > 0) {
        let sum = sessionStrokeSpeeds.reduce((a, b) => a + b, 0);
        avgSpeed = Math.floor((sum / sessionStrokeSpeeds.length) * 60); // px/second approx
    }
    document.getElementById('summary-speed').innerText = `${avgSpeed} px/s`;

    // 4. Calculate stability score
    let stability = 100;
    if (sessionStabilityDeviations.length > 0) {
        let avgDev = sessionStabilityDeviations.reduce((a, b) => a + b, 0) / sessionStabilityDeviations.length;
        // Map average deviation to 0-100 stability score (lower deviation = higher stability)
        stability = Math.max(20, Math.min(100, Math.floor(100 - (avgDev * 150))));
    }
    document.getElementById('summary-stability').innerText = `${stability}%`;
    
    // Switch to completion screen
    switchScreen('completion-screen');
    gameState = 'FINAL_SCREEN';
}

function exportSessionCSV() {
    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "ChromaFlow Rehab - Patient Session Report\n";
    csvContent += `Date,${new Date().toLocaleDateString()}\n`;
    csvContent += `Time,${new Date().toLocaleTimeString()}\n`;
    csvContent += `Total Duration,${Math.floor(sessionTotalTime / 60)}m ${sessionTotalTime % 60}s\n`;
    
    let accuracy = 100;
    if (sessionPaintTicks > 0) {
        accuracy = Math.max(0, Math.min(100, Math.floor(((sessionPaintTicks - sessionSpillTicks) / sessionPaintTicks) * 100)));
    }
    csvContent += `Overall Boundary Accuracy,${accuracy}%\n`;
    
    let avgSpeed = 0;
    if (sessionStrokeSpeeds.length > 0) {
        avgSpeed = Math.floor((sessionStrokeSpeeds.reduce((a, b) => a + b, 0) / sessionStrokeSpeeds.length) * 60);
    }
    csvContent += `Average Pacing Speed,${avgSpeed} px/s\n`;
    
    let stability = 100;
    if (sessionStabilityDeviations.length > 0) {
        let avgDev = sessionStabilityDeviations.reduce((a, b) => a + b, 0) / sessionStabilityDeviations.length;
        stability = Math.max(20, Math.min(100, Math.floor(100 - (avgDev * 150))));
    }
    csvContent += `Patient Stability Index,${stability}%\n\n`;
    
    csvContent += "Level Metrics Breakdown:\n";
    csvContent += "Level ID,Level Name,Completed Status\n";
    ROOM_SURFACES.forEach((s) => {
        csvContent += `${s.id},"${s.name}",${s.coveragePct.toFixed(1)}% Coverage (Spillover: ${s.spilloverPct.toFixed(1)}%)\n`;
    });
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `ChromaFlow_Rehab_Report_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function pauseGame() {
    if (gameState !== 'PLAYING') return;
    gameState = 'PAUSED';
    switchScreen('pause-screen');
    showToast("Session Paused", 1500);
}

function resumeGame() {
    if (gameState !== 'PAUSED') return;
    gameState = 'PLAYING';
    switchScreen(null); // hides screen overlay
}

function advanceSequence() {
    switchScreen(null);
    gameState = 'CINEMATIC';
    let nextIdx = currentLevelIndex + 1;
    if (nextIdx < ROOM_SURFACES.length) {
        enterLevel(nextIdx);
    }
}

function switchScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    if (id) { document.getElementById(id).classList.add('active'); }
}

// Draw centered circular badges for segment blueprint guide labels
function drawMiniLabel(lx, ly, text, isActive = true) {
    ctx.save();
    ctx.fillStyle = isActive ? 'rgba(58, 63, 88, 0.94)' : 'rgba(143, 168, 155, 0.85)';
    ctx.beginPath();
    ctx.arc(lx, ly, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.stroke();
    
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 11px Outfit';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${text}`, lx, ly);
    ctx.restore();
}

function showToast(msg, duration = 2000) {
    let toast = document.getElementById('toast');
    toast.innerText = msg;
    toast.classList.add('show');
    if(toast.tRef) { clearTimeout(toast.tRef); }
    toast.tRef = setTimeout(() => { toast.classList.remove('show'); }, duration);
}

function tick() {
    camera.update();

    // 1. Update calibration visualizer dot when on home screen
    if (gameState === 'HOME') {
        const dot = document.getElementById('cal-cursor-dot');
        if (dot) {
            // Piecewise linear calibration mapping to preserve full [-1, 1] range of motion
            let calibX = 0;
            const offX = Math.max(-0.9, Math.min(0.9, InputHandler.state.offsetX));
            const rawX = InputHandler.state.rawX;
            if (rawX >= offX) {
                calibX = (1.0 - offX) !== 0 ? (rawX - offX) / (1.0 - offX) : 0;
            } else {
                calibX = (offX + 1.0) !== 0 ? (rawX - offX) / (offX + 1.0) : 0;
            }

            let calibY = 0;
            const offY = Math.max(-0.9, Math.min(0.9, InputHandler.state.offsetY));
            const rawY = InputHandler.state.rawY;
            if (rawY >= offY) {
                calibY = (1.0 - offY) !== 0 ? (rawY - offY) / (1.0 - offY) : 0;
            } else {
                calibY = (offY + 1.0) !== 0 ? (rawY - offY) / (offY + 1.0) : 0;
            }

            // Apply active inversions to match physical tilt direction
            if (InputHandler.settings.invertX) calibX = -calibX;
            if (InputHandler.settings.invertY) calibY = -calibY;

            const clampedX = Math.max(-1.0, Math.min(1.0, calibX));
            const clampedY = Math.max(-1.0, Math.min(1.0, calibY));
            
            // Map raw values to visualizer coordinate grid (110x110 center is 55, radius offset is 45)
            const leftPos = 55 + clampedX * 45;
            const topPos = 55 + clampedY * 45;
            
            dot.style.left = `${leftPos}px`;
            dot.style.top = `${topPos}px`;
        }
    }

    // 2. Pause trigger checking
    if (gameState === 'PLAYING' && InputHandler.state.btnC) {
        InputHandler.state.btnC = false; // Reset trigger flag
        pauseGame();
    }

    // 3. Obstacles movement updates
    if (gameState === 'PLAYING' && currentLevelIndex === 3) {
        let surface4 = ROOM_SURFACES[3];
        let timeFactor = Date.now() * 0.0024;
        surface4.obstacles[0].cy = surface4.obstacles[0].origY + Math.sin(timeFactor + surface4.obstacles[0].speedOffset) * 65;
        surface4.obstacles[1].cy = surface4.obstacles[1].origY + Math.sin(timeFactor + surface4.obstacles[1].speedOffset) * 65;
    }

    if (gameState === 'PLAYING' && currentLevelIndex === 4) {
        updateSpider(ROOM_SURFACES[4]);
    }

    // 4. Paint then Render to eliminate lag
    if (gameState === 'PLAYING') {
        processPaintingStroke(ROOM_SURFACES[currentLevelIndex]);
    }
    render();
    
    requestAnimationFrame(tick);
}

function updateSpider(surface) {
    let spider = surface.spider;
    if (!spider || !spider.active) return;

    let nextX = spider.x + spider.vx;
    let nextY = spider.y + spider.vy;

    if (!isPointInPoly({ x: nextX, y: nextY }, surface.poly)) {
        spider.vx *= -1;
        spider.vy *= -1;
        
        let dx = 512 - spider.x;
        let dy = 75 - spider.y;
        let dist = Math.hypot(dx, dy);
        if (dist > 0) {
            spider.vx += (dx / dist) * 0.4;
            spider.vy += (dy / dist) * 0.4;
        }

        let speed = Math.hypot(spider.vx, spider.vy);
        let targetSpeed = 2.4;
        spider.vx = (spider.vx / speed) * targetSpeed;
        spider.vy = (spider.vy / speed) * targetSpeed;
    } else {
        spider.x = nextX;
        spider.y = nextY;
    }

    let ateAny = false;
    surface.samplePoints.forEach(pt => {
        if (pt.filled && Math.hypot(pt.x - spider.x, pt.y - spider.y) < spider.eatRadius) {
            pt.filled = false;
            ateAny = true;
        }
    });

    let localX = spider.x - surface.bounds.minX;
    let localY = spider.y - surface.bounds.minY;
    surface.paintCtx.save();
    surface.paintCtx.globalCompositeOperation = 'destination-out';
    surface.paintCtx.beginPath();
    surface.paintCtx.arc(localX, localY, spider.eatRadius, 0, Math.PI * 2);
    surface.paintCtx.fill();
    surface.paintCtx.restore();

    if (ateAny) {
        let filledCount = surface.samplePoints.filter(p => p.filled).length;
        surface.coveragePct = (filledCount / surface.totalTargetPoints) * 100;
        updateHUDMetrics(surface);
        
        if (!lastSpiderSoundTime || Date.now() - lastSpiderSoundTime > 1200) {
            AudioController.playSpiderBite();
            lastSpiderSoundTime = Date.now();
        }
    }

    if (surface.coveragePct >= 50) {
        spider.active = false;
        showToast("The spider has fled! Paint freely now.", 2200);
    }
}

function render() {
    ctx.clearRect(0,0, canvas.width, canvas.height);

    if (gameState === 'FINAL_SCREEN') {
        ctx.fillStyle = '#090d16'; // sleek dark room showcase bg
    } else {
        ctx.fillStyle = '#fbfbfa';
    }
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.scale(camera.scale, camera.scale);
    ctx.translate(-camera.x, -camera.y);

    // Draw background shadow gradient for room
    let roomBgGrad = ctx.createRadialGradient(512, 320, 200, 512, 320, 600);
    if (gameState === 'FINAL_SCREEN') {
        roomBgGrad.addColorStop(0, '#1e293b');
        roomBgGrad.addColorStop(1, '#0f172a');
    } else {
        roomBgGrad.addColorStop(0, '#fbfbfa');
        roomBgGrad.addColorStop(1, '#e5e0d3');
    }
    ctx.fillStyle = roomBgGrad;
    ctx.fillRect(0, 0, 1024, 640);

    // Floor Base Polygon
    ctx.fillStyle = (gameState === 'FINAL_SCREEN') ? '#1e293b' : '#dedad0';
    ctx.beginPath();
    ctx.moveTo(320, 480); ctx.lineTo(704, 480);
    ctx.lineTo(1024, 640); ctx.lineTo(0, 640);
    ctx.closePath();
    ctx.fill();

    // Render Wall Fills (Interactive or Final Showcase Canvas)
    if (gameState === 'FINAL_SCREEN') {
        ROOM_SURFACES.forEach(surface => {
            if (surface.paintCanvas) {
                ctx.save();
                ctx.beginPath();
                ctx.moveTo(surface.poly[0].x, surface.poly[0].y);
                for(let i=1; i<surface.poly.length; i++) { ctx.lineTo(surface.poly[i].x, surface.poly[i].y); }
                ctx.closePath();
                ctx.clip();
                ctx.drawImage(surface.paintCanvas, surface.bounds.minX, surface.bounds.minY);
                ctx.restore();
            }
        });
    } else {
        ROOM_SURFACES.forEach((surface, index) => {
            if (index > currentLevelIndex && isPointsMatch(surface.poly, ROOM_SURFACES[currentLevelIndex].poly)) {
                return;
            }

            ctx.save();
            ctx.fillStyle = '#fdfdfb';
            ctx.beginPath();
            ctx.moveTo(surface.poly[0].x, surface.poly[0].y);
            for(let i=1; i<surface.poly.length; i++) { ctx.lineTo(surface.poly[i].x, surface.poly[i].y); }
            ctx.closePath();
            ctx.fill();

            if(surface.paintCanvas) {
                ctx.save();
                ctx.beginPath();
                ctx.moveTo(surface.poly[0].x, surface.poly[0].y);
                for(let i=1; i<surface.poly.length; i++) { ctx.lineTo(surface.poly[i].x, surface.poly[i].y); }
                ctx.closePath();
                ctx.clip();
                ctx.drawImage(surface.paintCanvas, surface.bounds.minX, surface.bounds.minY);
                ctx.restore();
            }

            if (currentLevelIndex === index && gameState === 'PLAYING') {
                renderOverlayGuides(surface);
            }

            ctx.strokeStyle = (gameState === 'PLAYING' && currentLevelIndex === index)
                ? 'rgba(143, 168, 155, 0.8)' : 'rgba(58, 63, 88, 0.15)';
            ctx.lineWidth = (gameState === 'PLAYING' && currentLevelIndex === index) ? 4.5 : 1.5;
            ctx.beginPath();
            ctx.moveTo(surface.poly[0].x, surface.poly[0].y);
            for(let i=1; i<surface.poly.length; i++) { ctx.lineTo(surface.poly[i].x, surface.poly[i].y); }
            ctx.closePath();
            ctx.stroke();

            ctx.restore();
        });
    }

    // Draw furniture
    let hideOccludingFurniture = (gameState === 'PLAYING' && (currentLevelIndex === 2 || currentLevelIndex === 3));
    FURNITURE.forEach(f => {
        ctx.save();
        if (gameState === 'FINAL_SCREEN') {
            ctx.shadowColor = 'rgba(15, 23, 42, 0.4)';
            ctx.shadowBlur = 15;
            ctx.shadowOffsetY = 6;
        } else if (hideOccludingFurniture && (f.type === 'Sofa Base' || f.type === 'Sofa Back' || f.type === 'Table Unit')) {
            ctx.translate(0, 220);
        }
        ctx.fillStyle = f.color;
        ctx.beginPath();
        ctx.moveTo(f.poly[0].x, f.poly[0].y);
        for(let i=1; i<f.poly.length; i++) { ctx.lineTo(f.poly[i].x, f.poly[i].y); }
        ctx.closePath();
        ctx.fill();
        ctx.restore();
    });

    // Corner Outlines of 3D Isometric Room structure (Drawn on top for high precision crisp lines)
    ctx.strokeStyle = (gameState === 'FINAL_SCREEN') ? '#334155' : '#c7c2b5';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(0,0); ctx.lineTo(320, 120);
    ctx.moveTo(0, 640); ctx.lineTo(320, 480);
    ctx.moveTo(1024, 0); ctx.lineTo(704, 120);
    ctx.moveTo(1024, 640); ctx.lineTo(704, 480);
    ctx.stroke();

    if(gameState === 'PLAYING') {
        renderPaintBrushTool();
    }

    ctx.restore();
}

function isPointsMatch(poly1, poly2) {
    if (poly1.length !== poly2.length) return false;
    return poly1[0].x === poly2[0].x && poly1[0].y === poly2[0].y && poly1[2].x === poly2[2].x && poly1[2].y === poly2[2].y;
}

function renderOverlayGuides(surface) {
    // Wall 1: 3 Concentric Rings
    if (surface.id === 1) {
        let cx = 210, cy = 320;
        ctx.save();
        ctx.lineWidth = 1.5;
        
        [30, 60, 95].forEach((r, rIdx) => {
            let tile = surface.tiles[rIdx];
            ctx.strokeStyle = tile.cleared ? 'rgba(143,168,155,0.25)' : 'rgba(58,63,88,0.5)';
            ctx.beginPath();
            ctx.arc(cx, cy, r, 0, Math.PI * 2);
            ctx.stroke();
            
            if (!tile.cleared) {
                let labelAngle = -Math.PI / 4 - rIdx * 0.3; // Offset label position slightly
                let lx = cx + Math.cos(labelAngle) * (r - 15);
                let ly = cy + Math.sin(labelAngle) * (r - 15);
                
                drawMiniLabel(lx, ly, tile.id, true);
            }
        });
        
        // Background wall portion label
        if (!surface.tiles[3].cleared) {
            drawMiniLabel(cx - 70, cy + 120, 4, false);
        }
        
        ctx.restore();
    }

    // Wall 3: Square, Circle, Triangle, Pentagon Modernist Collage
    if (surface.id === 3) {
        ctx.save();
        ctx.lineWidth = 1.5;
        
        // 1. Square
        let sq = surface.tiles[0];
        ctx.strokeStyle = sq.cleared ? 'rgba(143,168,155,0.25)' : 'rgba(58,63,88,0.5)';
        ctx.strokeRect(388, 208, 64, 64);
        if (!sq.cleared) drawMiniLabel(420, 240, 1, true);
        
        // 2. Circle
        let ci = surface.tiles[1];
        ctx.strokeStyle = ci.cleared ? 'rgba(143,168,155,0.25)' : 'rgba(58,63,88,0.5)';
        ctx.beginPath();
        ctx.arc(600, 240, 32, 0, Math.PI * 2);
        ctx.stroke();
        if (!ci.cleared) drawMiniLabel(600, 240, 2, true);
        
        // 3. Triangle
        let tri = surface.tiles[2];
        ctx.strokeStyle = tri.cleared ? 'rgba(143,168,155,0.25)' : 'rgba(58,63,88,0.5)';
        ctx.beginPath();
        ctx.moveTo(tri.poly[0].x, tri.poly[0].y);
        ctx.lineTo(tri.poly[1].x, tri.poly[1].y);
        ctx.lineTo(tri.poly[2].x, tri.poly[2].y);
        ctx.closePath();
        ctx.stroke();
        if (!tri.cleared) drawMiniLabel(420, 410, 3, true);
        
        // 4. Pentagon
        let pent = surface.tiles[3];
        ctx.strokeStyle = pent.cleared ? 'rgba(143,168,155,0.25)' : 'rgba(58,63,88,0.5)';
        ctx.beginPath();
        ctx.moveTo(pent.poly[0].x, pent.poly[0].y);
        for(let i=1; i<pent.poly.length; i++) ctx.lineTo(pent.poly[i].x, pent.poly[i].y);
        ctx.closePath();
        ctx.stroke();
        if (!pent.cleared) drawMiniLabel(600, 405, 4, true);
        
        // 5. Panel Background
        let bg = surface.tiles[4];
        if (!bg.cleared) {
            drawMiniLabel(512, 320, 5, false);
        }
        
        ctx.restore();
    }

    // Wall 4: 3 columns frame
    if(surface.type === 'complex') {
        ctx.save();
        surface.zones.forEach(z => {
            ctx.strokeStyle = 'rgba(58,63,88,0.2)';
            ctx.lineWidth = 1.5;
            ctx.setLineDash([4, 4]);
            ctx.beginPath();
            ctx.moveTo(z.poly[1].x, 170);
            ctx.lineTo(z.poly[1].x, 470);
            ctx.stroke();

            let cx = (z.poly[0].x + z.poly[1].x)/2;
            let cy = 210; 
            
            if (!z.cleared) {
                drawMiniLabel(cx, cy, z.id, true);
            } else {
                drawMiniLabel(cx, cy, "✓", false);
            }
        });
        ctx.restore();

        surface.obstacles.forEach((obs, obsIdx) => {
            ctx.save();
            ctx.strokeStyle = 'rgba(58, 63, 88, 0.45)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(obs.cx, 170);
            ctx.lineTo(obs.cx, obs.cy);
            ctx.stroke();
            ctx.restore();

            let pulseScale = 1 + Math.sin(Date.now() * 0.008) * 0.08;
            ctx.fillStyle = '#bf6161';
            ctx.beginPath();
            ctx.arc(obs.cx, obs.cy, obs.r * pulseScale, 0, Math.PI * 2);
            ctx.fill();

            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2;
            ctx.stroke();

            ctx.fillStyle = '#ffffff';
            ctx.font = '900 9px Outfit';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText("OBSTACLE", obs.cx, obs.cy);
        });
    }

    // Wall 2 and Wall 5 (Single Color custom choice indicators)
    if (surface.type === 'spillover' || surface.type === 'master') {
        let minX = Math.min(...surface.poly.map(p => p.x));
        let maxX = Math.max(...surface.poly.map(p => p.x));
        let minY = Math.min(...surface.poly.map(p => p.y));
        let maxY = Math.max(...surface.poly.map(p => p.y));
        let cx = (minX + maxX)/2;
        let cy = (minY + maxY)/2;
        
        ctx.save();
        if ((surface.type === 'spillover' && !surface.colorHex) || (surface.type === 'master' && !surface.colorHex)) {
            drawMiniLabel(cx, cy, surface.id === 2 ? "2" : "5", true);
        } else {
            drawMiniLabel(cx, cy, "✓", false);
        }
        ctx.restore();
    }

    if(surface.type === 'master') {
        ctx.save();
        ctx.strokeStyle = 'rgba(58, 63, 88, 0.35)';
        ctx.lineWidth = 2.5;
        ctx.setLineDash([6, 4]);
        for (let cx = 140; cx < 880; cx += 50) {
            ctx.beginPath();
            ctx.moveTo(cx, 35);
            ctx.lineTo(cx + 60, 75);
            ctx.lineTo(cx + 120, 35);
            ctx.stroke();
        }
        ctx.fillStyle = 'rgba(58, 63, 88, 0.75)';
        ctx.font = 'bold 12px Outfit';
        ctx.textAlign = 'center';
        ctx.fillText("STRUCTURAL MOLDING CHEVRONS GUIDELINES ACTIVE", 512, 110);
        ctx.restore();

        if (surface.spider) {
            if (surface.spider.active) {
                renderSpider(surface.spider);
                ctx.save();
                ctx.fillStyle = 'rgba(191, 97, 97, 0.85)';
                ctx.font = 'bold 12px Outfit';
                ctx.textAlign = 'center';
                ctx.fillText("⚠ A SPIDER IS EATING YOUR PAINT — REACH 50% COVERAGE TO BANISH IT", 512, 95);
                ctx.restore();
            } else {
                ctx.save();
                ctx.fillStyle = 'rgba(143, 168, 155, 0.85)';
                ctx.font = 'bold 12px Outfit';
                ctx.textAlign = 'center';
                ctx.fillText("Spider banished — paint freely!", 512, 95);
                ctx.restore();
            }
        }
    }
}

function renderSpider(spider) {
    ctx.save();
    ctx.translate(spider.x, spider.y);

    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.beginPath();
    ctx.ellipse(2, spider.r * 0.7, spider.r * 1.1, spider.r * 0.35, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#232323';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    let wiggleSpeed = Date.now() * 0.015;
    for (let leg = 0; leg < 8; leg++) {
        let side = leg < 4 ? 1 : -1;
        let index = leg % 4; 
        let angle = -Math.PI / 4 + (index * Math.PI / 6) + Math.sin(wiggleSpeed + index * 1.5) * 0.15;
        let length = spider.r * 1.6;
        
        ctx.beginPath();
        let jx = Math.cos(angle) * length * 0.6 * side;
        let jy = Math.sin(angle) * length * 0.6;
        let lx = jx + Math.cos(angle - 0.4) * length * 0.5 * side;
        let ly = jy + Math.sin(angle + 0.4) * length * 0.5;
        
        ctx.moveTo(0, -spider.r * 0.2);
        ctx.quadraticCurveTo(jx, jy, lx, ly);
        ctx.stroke();
    }

    ctx.fillStyle = '#2b2b2b';
    ctx.beginPath();
    ctx.ellipse(0, 2, spider.r, spider.r * 0.8, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#1e1e1e';
    ctx.beginPath();
    ctx.ellipse(0, -spider.r * 0.7, spider.r * 0.55, spider.r * 0.45, 0, 0, Math.PI * 2);
    ctx.fill();

    let eyePulse = 0.8 + Math.sin(Date.now() * 0.01) * 0.2;
    ctx.fillStyle = `rgba(255, 68, 68, ${eyePulse})`;
    ctx.beginPath();
    ctx.arc(-4, -spider.r * 0.7, 2.2, 0, Math.PI * 2);
    ctx.arc(4, -spider.r * 0.7, 2.2, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
}

function renderPaintBrushTool() {
    let curSurface = ROOM_SURFACES[currentLevelIndex];
    let activeColor = GLOBAL_COLORS[activeColorIndex];

    ctx.save();
    ctx.translate(mouse.worldX, mouse.worldY);

    let tiltAngle = Math.max(-0.4, Math.min(0.4, mouse.vx * 0.025));
    ctx.rotate(tiltAngle);

    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.beginPath();
    ctx.ellipse(8, 8, 14, 5, Math.PI/6, 0, Math.PI*2);
    ctx.fill();

    ctx.fillStyle = '#c27d38'; 
    ctx.beginPath();
    ctx.moveTo(-6, -30);
    ctx.lineTo(-3, -75);
    ctx.quadraticCurveTo(0, -80, 3, -75);
    ctx.lineTo(6, -30);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = activeColor.hex;
    ctx.beginPath();
    ctx.moveTo(-4, -65);
    ctx.lineTo(-3, -75);
    ctx.quadraticCurveTo(0, -80, 3, -75);
    ctx.lineTo(4, -65);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#a1a1aa';
    ctx.fillRect(-8, -30, 16, 12);
    
    ctx.fillStyle = '#d4d4d8';
    ctx.fillRect(-8, -25, 16, 2);

    ctx.fillStyle = '#f5f5f4';
    ctx.beginPath();
    ctx.moveTo(-8, -18);
    ctx.lineTo(-10, -6);
    ctx.lineTo(10, -6);
    ctx.lineTo(8, -18);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = activeColor.hex;
    ctx.beginPath();
    ctx.moveTo(-10, -6);
    ctx.quadraticCurveTo(0, 4, 10, -6);
    ctx.lineTo(8, -12);
    ctx.quadraticCurveTo(0, -6, -8, -12);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
}

window.addEventListener('DOMContentLoaded', init);