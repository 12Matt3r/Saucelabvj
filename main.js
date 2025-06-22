// Global reference for other modules
window.vjMixer = null;

// Prevent duplicate class declaration
if (typeof VJMixer === 'undefined') {
    class VJMixer {
        constructor() {
            this.storage = null;
            this.videoEngine = null;
            this.midiController = null;
            this.sequencer = null;
            this.layerManager = null;
            this.assignmentManager = null;
            this.uiManager = null;
            this.performanceMonitor = null;
            this.patternManager = null;
            
            // Core state
            this.activeEffects = new Set();
            this.effectCombinations = new Set();
            this.patternRecording = false;
            this.recordedPatterns = new Map();
            this.autoSaveTimeout = null;
            
            // Performance metrics
            this.performanceMetrics = {
                frameDrops: 0,
                memoryUsage: 0,
                lastUpdate: 0
            };
        }
        
        async init() {
            // Wait for dependencies to load
            await this.waitForDependencies();
            
            // Initialize storage
            this.storage = new VJStorage();
            
            // Initialize managers
            this.assignmentManager = new AssignmentManager();
            this.uiManager = new UIManager(this);
            this.patternManager = new PatternManager();
            
            // Initialize video engine with better error handling
            if (!window.VideoEngine) {
                console.error('VideoEngine class not found. Check if video-engine.js loaded properly.');
                this.uiManager.showNotification('VideoEngine not available. Some features may not work.', 'error', 10000);
                return;
            }
            
            this.videoEngine = new window.VideoEngine();
            
            try {
                console.log('Initializing video engine...');
                await this.videoEngine.init();
                console.log('Video engine initialized successfully');
            } catch (error) {
                console.error('Failed to initialize video engine:', error);
                this.uiManager.showNotification('WebGL initialization failed. Using fallback mode.', 'error', 10000);
                this.videoEngineEnabled = false;
            }
            
            // Initialize layer manager
            this.layerManager = new LayerManager(this.videoEngine);
            this.layerManager.init();
            
            // Initialize MIDI controller
            this.midiController = new MIDIController();
            await this.midiController.init();
            this.midiController.onMIDIMessage = this.assignmentManager.handleMIDI.bind(this.assignmentManager);
            
            // Initialize sequencer
            this.sequencer = new Sequencer();
            this.sequencer.onStepChange = this.handleSequencerStep.bind(this);
            
            // Initialize performance monitor
            this.performanceMonitor = new PerformanceMonitor(this.videoEngine);
            this.performanceMonitor.start();
            
            // Setup UI and event listeners
            this.setupUI();
            this.uiManager.setupEventListeners();
            
            // Load saved settings
            this.loadSettings();
            
            // Setup auto-save
            this.storage.setupAutoSave(() => this.saveSettings(), 10000);
            
            // Set global reference
            window.vjMixer = this;
            
            console.log('VJ Mixer initialized');
        }
        
        async waitForDependencies() {
            // Wait for all required classes to be available
            const requiredClasses = ['VideoEngine', 'VJStorage', 'AssignmentManager', 'LayerManager', 'MIDIController', 'Sequencer', 'PerformanceMonitor', 'PatternManager'];
            
            const checkDependencies = () => {
                return requiredClasses.every(className => {
                    const isAvailable = window[className] !== undefined;
                    if (!isAvailable) {
                        console.log(`Waiting for ${className}...`);
                    }
                    return isAvailable;
                });
            };
            
            // Wait up to 5 seconds for dependencies
            const timeout = 5000;
            const startTime = Date.now();
            
            while (!checkDependencies() && (Date.now() - startTime) < timeout) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            
            if (!checkDependencies()) {
                console.warn('Some dependencies may not be available:', requiredClasses.filter(c => !window[c]));
            }
        }
        
        setupUI() {
            // Create sequencer steps
            const sequencerGrid = document.getElementById('sequencer-grid');
            for (let i = 0; i < 8; i++) {
                const step = document.createElement('div');
                step.className = 'sequencer-step assignable touch-control';
                step.dataset.step = i;
                step.innerHTML = `<span class="step-number">${i + 1}</span>`;
                step.addEventListener('click', () => this.toggleSequencerStep(i));
                sequencerGrid.appendChild(step);
            }
            
            // Add pattern controls
            this.createPatternControls();
            
            // Add crossfader and master controls
            this.createMasterControls();
            
            // Add enhanced controls
            this.createEnhancedControls();
            
            // Setup performance monitor
            this.setupPerformanceMonitor();
            
            // Setup advanced performance monitoring
            this.setupAdvancedPerformanceMonitor();
        }
        
        createPatternControls() {
            const patternSection = document.createElement('div');
            patternSection.className = 'pattern-controls';
            patternSection.innerHTML = `
                <button id="record-pattern-btn" class="pattern-btn touch-control"> REC PATTERN</button>
                <button id="play-pattern-btn" class="pattern-btn touch-control"> PLAY PATTERN</button>
                <button id="clear-pattern-btn" class="pattern-btn touch-control"> CLEAR</button>
            `;
            
            document.getElementById('sequencer-section').appendChild(patternSection);
            
            // Pattern control event listeners
            document.getElementById('record-pattern-btn').addEventListener('click', () => {
                this.patternManager.toggleRecording();
            });
            
            document.getElementById('play-pattern-btn').addEventListener('click', () => {
                this.patternManager.playPattern();
            });
            
            document.getElementById('clear-pattern-btn').addEventListener('click', () => {
                this.patternManager.clearPattern();
            });
        }
        
        createMasterControls() {
            const masterSection = document.createElement('div');
            masterSection.id = 'master-controls';
            masterSection.innerHTML = `
                <h4>Master Controls</h4>
                <div class="master-row">
                    <div class="crossfader-section">
                        <label>A/B Crossfader</label>
                        <input type="range" id="crossfader" class="crossfader assignable" 
                               data-action="crossfader" min="0" max="1" step="0.01" value="0.5">
                        <div class="crossfader-labels">
                            <span>A</span>
                            <span>B</span>
                        </div>
                    </div>
                    <div class="master-opacity-section">
                        <label>Master</label>
                        <input type="range" id="master-opacity" class="master-opacity assignable" 
                               data-action="master-opacity" min="0" max="1" step="0.01" value="1" orient="vertical">
                        <span class="opacity-value">100%</span>
                    </div>
                </div>
            `;
            
            document.getElementById('main-content').appendChild(masterSection);
        }
        
        createEnhancedControls() {
            const enhancedSection = document.createElement('div');
            enhancedSection.id = 'enhanced-controls';
            enhancedSection.className = 'modern-panel';
            enhancedSection.innerHTML = `
                <h4>🎵 Enhanced Features</h4>
                <div class="enhanced-row">
                    <button id="auto-sync-btn" class="enhanced-btn touch-control modern-btn">🎯 Auto-Sync</button>
                    <button id="visualizer-btn" class="enhanced-btn touch-control modern-btn active">📊 Visualizer</button>
                    <button id="auto-crossfade-btn" class="enhanced-btn touch-control modern-btn">🔄 Auto-Fade</button>
                    <button id="beat-effects-btn" class="enhanced-btn touch-control modern-btn">💓 Beat FX</button>
                    <button id="performance-mode-btn" class="enhanced-btn touch-control modern-btn">⚡ Performance</button>
                    <button id="ai-enhance-btn" class="enhanced-btn touch-control modern-btn">🤖 AI Enhance</button>
                </div>
                <div class="quality-controls modern-controls">
                    <label>Quality: </label>
                    <select id="quality-select" class="touch-control modern-select">
                        <option value="auto">Auto</option>
                        <option value="high" selected>High</option>
                        <option value="medium">Medium</option>
                        <option value="low">Low</option>
                    </select>
                    <div class="performance-stats enhanced">
                        <span id="fps-display" class="stat-badge">60 FPS</span>
                        <span id="quality-display" class="stat-badge">100%</span>
                        <span id="memory-display" class="stat-badge">0MB</span>
                    </div>
                </div>
                <div class="ai-enhancement-panel hidden" id="ai-panel">
                    <div class="ai-controls">
                        <button id="ai-auto-mix" class="ai-btn">🎚️ Auto Mix</button>
                        <button id="ai-beat-match" class="ai-btn">🥁 Beat Match</button>
                        <button id="ai-color-sync" class="ai-btn">🌈 Color Sync</button>
                    </div>
                </div>
            `;
            
            document.getElementById('main-content').appendChild(enhancedSection);
            
            // Enhanced control event listeners
            document.getElementById('auto-sync-btn').addEventListener('click', (e) => {
                const btn = e.target;
                const isActive = btn.classList.contains('active');
                
                if (isActive) {
                    this.videoEngine.disableAutoSync();
                    btn.classList.remove('active');
                } else {
                    this.videoEngine.enableAutoSync();
                    btn.classList.add('active');
                }
            });
            
            document.getElementById('visualizer-btn').addEventListener('click', (e) => {
                const btn = e.target;
                btn.classList.toggle('active');
                this.toggleVisualizer(btn.classList.contains('active'));
            });
            
            document.getElementById('auto-crossfade-btn').addEventListener('click', (e) => {
                const btn = e.target;
                btn.classList.toggle('active');
                this.toggleAutoCrossfade(btn.classList.contains('active'));
            });
            
            document.getElementById('beat-effects-btn').addEventListener('click', (e) => {
                const btn = e.target;
                btn.classList.toggle('active');
                this.toggleBeatEffects(btn.classList.contains('active'));
            });
            
            document.getElementById('performance-mode-btn').addEventListener('click', (e) => {
                const btn = e.target;
                btn.classList.toggle('active');
                this.togglePerformanceMode(btn.classList.contains('active'));
            });
            
            document.getElementById('quality-select').addEventListener('change', (e) => {
                this.setQualityMode(e.target.value);
            });
            
            // New AI enhancement controls
            document.getElementById('ai-enhance-btn').addEventListener('click', (e) => {
                const btn = e.target;
                const panel = document.getElementById('ai-panel');
                btn.classList.toggle('active');
                panel.classList.toggle('hidden');
                
                if (btn.classList.contains('active')) {
                    this.initializeAIFeatures();
                }
            });
            
            this.setupAIControls();
            this.startEnhancedPerformanceDisplay();
        }
        
        setupAIControls() {
            document.getElementById('ai-auto-mix')?.addEventListener('click', () => {
                this.toggleAIAutoMix();
            });
            
            document.getElementById('ai-beat-match')?.addEventListener('click', () => {
                this.toggleAIBeatMatch();
            });
            
            document.getElementById('ai-color-sync')?.addEventListener('click', () => {
                this.toggleAIColorSync();
            });
        }
        
        initializeAIFeatures() {
            this.aiFeatures = {
                autoMix: false,
                beatMatch: false,
                colorSync: false,
                learningMode: true
            };
            
            this.uiManager.showNotification('AI Enhancement features activated', 'success');
        }
        
        toggleAIAutoMix() {
            if (!this.aiFeatures) return;
            
            this.aiFeatures.autoMix = !this.aiFeatures.autoMix;
            
            if (this.aiFeatures.autoMix) {
                this.startAIAutoMix();
                this.uiManager.showNotification('AI Auto Mix enabled', 'info');
            } else {
                this.stopAIAutoMix();
                this.uiManager.showNotification('AI Auto Mix disabled', 'info');
            }
        }
        
        startAIAutoMix() {
            this.aiAutoMixInterval = setInterval(() => {
                if (this.videoEngine && this.videoEngine.beatDetector) {
                    const beatData = this.videoEngine.beatDetector.analyze();
                    const audioData = this.videoEngine.audioAnalyzer.getAudioData();
                    
                    // AI-driven layer switching based on energy
                    if (audioData.energy > 0.7 && Math.random() < 0.3) {
                        const activeLayers = this.layerManager.layers.filter(l => l.video);
                        if (activeLayers.length > 1) {
                            const randomLayer = Math.floor(Math.random() * activeLayers.length);
                            this.layerManager.setActiveLayer(randomLayer);
                            
                            // Smart opacity adjustment
                            const targetOpacity = 0.5 + (audioData.energy * 0.5);
                            this.layerManager.animateOpacity(randomLayer, targetOpacity, 500);
                        }
                    }
                    
                    // Auto effect triggering based on frequency analysis
                    if (beatData.bassLevel > 0.8) {
                        const bassEffects = ['glitch', 'rgbShift', 'distort'];
                        const effect = bassEffects[Math.floor(Math.random() * bassEffects.length)];
                        this.startEffect(effect);
                        setTimeout(() => this.stopEffect(effect), 200);
                    }
                }
            }, 250);
        }
        
        stopAIAutoMix() {
            if (this.aiAutoMixInterval) {
                clearInterval(this.aiAutoMixInterval);
                this.aiAutoMixInterval = null;
            }
        }
        
        startEnhancedPerformanceDisplay() {
            setInterval(() => {
                if (this.videoEngine) {
                    const stats = this.videoEngine.getPerformanceStats();
                    
                    // Enhanced FPS display
                    const fpsDisplay = document.getElementById('fps-display');
                    if (fpsDisplay) {
                        fpsDisplay.textContent = `${stats.fps} FPS`;
                        fpsDisplay.className = `stat-badge ${stats.fps >= 55 ? 'good' : 
                                              stats.fps >= 30 ? 'warning' : 'critical'}`;
                    }
                    
                    // Enhanced quality display
                    const qualityDisplay = document.getElementById('quality-display');
                    if (qualityDisplay) {
                        const quality = Math.round(stats.adaptiveQuality * 100);
                        qualityDisplay.textContent = `${quality}%`;
                        qualityDisplay.className = `stat-badge ${quality >= 80 ? 'good' : 
                                                  quality >= 50 ? 'warning' : 'critical'}`;
                    }
                    
                    // Memory display
                    const memoryDisplay = document.getElementById('memory-display');
                    if (memoryDisplay && performance.memory) {
                        const memoryMB = Math.round(performance.memory.usedJSHeapSize / 1024 / 1024);
                        memoryDisplay.textContent = `${memoryMB}MB`;
                        memoryDisplay.className = `stat-badge ${memoryMB < 150 ? 'good' : 
                                                 memoryMB < 300 ? 'warning' : 'critical'}`;
                    }
                }
            }, 1000);
        }
        
        toggleVisualizer(enabled) {
            this.visualizerEnabled = enabled;
            if (enabled) {
                this.startVisualizer();
                this.uiManager.showNotification('Audio visualizer enabled', 'info');
            } else {
                this.stopVisualizer();
                this.uiManager.showNotification('Audio visualizer disabled', 'info');
            }
        }
        
        startVisualizer() {
            // Create enhanced visual feedback elements with better performance
            if (!document.getElementById('beat-visualizer')) {
                const visualizer = document.createElement('div');
                visualizer.id = 'beat-visualizer';
                visualizer.innerHTML = `
                    <div class="beat-circle"></div>
                    <div class="frequency-bars">
                        ${Array.from({length: 12}, (_, i) => `<div class="freq-bar" data-freq="${i}"></div>`).join('')}
                    </div>
                    <div class="waveform-display">
                        <canvas id="waveform-canvas" width="200" height="60"></canvas>
                    </div>
                `;
                document.getElementById('preview-section').appendChild(visualizer);
                
                // Start optimized visualization update loop
                let lastUpdate = 0;
                this.visualizerInterval = setInterval(() => {
                    const now = performance.now();
                    if (now - lastUpdate > 33) { // 30 FPS max for visualizer
                        this.updateEnhancedVisualizer();
                        lastUpdate = now;
                    }
                }, 16);
            }
        }
        
        updateEnhancedVisualizer() {
            if (!this.videoEngine || !this.videoEngine.beatDetector) return;
            
            const beatData = this.videoEngine.beatDetector.analyze();
            const audioData = this.videoEngine.audioAnalyzer ? this.videoEngine.audioAnalyzer.getAudioData() : 
                             { bass: 0, mid: 0, treble: 0, energy: 0 };
            
            const beatCircle = document.querySelector('.beat-circle');
            const freqBars = document.querySelectorAll('.freq-bar');
            const waveformCanvas = document.getElementById('waveform-canvas');
            
            // Enhanced beat circle with color coding
            if (beatCircle) {
                if (beatData.beat > 0.5) {
                    beatCircle.classList.add('beat-active');
                    beatCircle.style.background = `radial-gradient(circle, 
                        hsl(${audioData.energy * 360}, 80%, 60%) 0%, 
                        hsl(${audioData.energy * 360}, 60%, 40%) 100%)`;
                    setTimeout(() => beatCircle.classList.remove('beat-active'), 150);
                }
            }
            
            // Enhanced frequency bars with better responsiveness
            freqBars.forEach((bar, index) => {
                const bandRatio = index / freqBars.length;
                let intensity;
                
                if (bandRatio < 0.3) {
                    intensity = audioData.bass;
                } else if (bandRatio < 0.7) {
                    intensity = audioData.mid;
                } else {
                    intensity = audioData.treble;
                }
                
                // Add some randomness for visual appeal
                intensity = intensity * (0.8 + Math.random() * 0.4);
                
                bar.style.height = `${Math.max(2, intensity * 100)}%`;
                bar.style.background = `linear-gradient(to top, 
                    hsl(${180 + intensity * 60}, 70%, 50%), 
                    hsl(${200 + intensity * 80}, 80%, 60%))`;
            });
            
            // Simple waveform visualization
            if (waveformCanvas) {
                this.drawWaveform(waveformCanvas, audioData);
            }
        }
        
        drawWaveform(canvas, audioData) {
            const ctx = canvas.getContext('2d');
            const width = canvas.width;
            const height = canvas.height;
            
            ctx.clearRect(0, 0, width, height);
            ctx.strokeStyle = '#4ecdc4';
            ctx.lineWidth = 2;
            ctx.beginPath();
            
            const samples = 50;
            for (let i = 0; i < samples; i++) {
                const x = (i / samples) * width;
                const wave = Math.sin(i * 0.2 + performance.now() * 0.01) * audioData.energy;
                const y = height / 2 + wave * height / 4;
                
                if (i === 0) {
                    ctx.moveTo(x, y);
                } else {
                    ctx.lineTo(x, y);
                }
            }
            
            ctx.stroke();
        }
        
        stopVisualizer() {
            const visualizer = document.getElementById('beat-visualizer');
            if (visualizer) {
                visualizer.remove();
            }
            if (this.visualizerInterval) {
                clearInterval(this.visualizerInterval);
                this.visualizerInterval = null;
            }
        }
        
        updateVisualizer() {
            if (!this.videoEngine || !this.videoEngine.beatDetector) return;
            
            const beatData = this.videoEngine.beatDetector.analyze();
            const beatCircle = document.querySelector('.beat-circle');
            const freqBars = document.querySelectorAll('.freq-bar');
            
            if (beatCircle) {
                if (beatData.beat > 0.5) {
                    beatCircle.classList.add('beat-active');
                    setTimeout(() => beatCircle.classList.remove('beat-active'), 200);
                }
            }
            
            freqBars.forEach((bar, index) => {
                const intensity = Math.random() * beatData.bassLevel + Math.random() * beatData.trebleLevel;
                bar.style.height = `${intensity * 100}%`;
            });
        }
        
        toggleAutoCrossfade(enabled) {
            this.autoCrossfadeEnabled = enabled;
            if (enabled) {
                this.startAutoCrossfade();
                this.uiManager.showNotification('Auto-crossfade enabled', 'info');
            } else {
                this.stopAutoCrossfade();
                this.uiManager.showNotification('Auto-crossfade disabled', 'info');
            }
        }
        
        startAutoCrossfade() {
            this.autoCrossfadeInterval = setInterval(() => {
                if (this.videoEngine && this.videoEngine.beatDetector) {
                    const beatData = this.videoEngine.beatDetector.analyze();
                    if (beatData.beat > 0.7) {
                        const crossfader = document.getElementById('crossfader');
                        const newValue = Math.abs(Math.sin(performance.now() * 0.001));
                        crossfader.value = newValue;
                        this.videoEngine.setCrossfader(newValue);
                    }
                }
            }, 100);
        }
        
        stopAutoCrossfade() {
            if (this.autoCrossfadeInterval) {
                clearInterval(this.autoCrossfadeInterval);
                this.autoCrossfadeInterval = null;
            }
        }
        
        toggleBeatEffects(enabled) {
            this.beatEffectsEnabled = enabled;
            if (enabled) {
                this.startBeatEffects();
                this.uiManager.showNotification('Beat-reactive effects enabled', 'info');
            } else {
                this.stopBeatEffects();
                this.uiManager.showNotification('Beat-reactive effects disabled', 'info');
            }
        }
        
        startBeatEffects() {
            this.beatEffectsInterval = setInterval(() => {
                if (this.videoEngine && this.videoEngine.beatDetector) {
                    const beatData = this.videoEngine.beatDetector.analyze();
                    
                    // Trigger effects on strong beats
                    if (beatData.beat > 0.8) {
                        const effects = ['rgbShift', 'glitch', 'zoom'];
                        const randomEffect = effects[Math.floor(Math.random() * effects.length)];
                        
                        this.startEffect(randomEffect);
                        setTimeout(() => this.stopEffect(randomEffect), 300);
                    }
                    
                    // Bass-reactive layer opacity
                    if (beatData.bassLevel > 0.6) {
                        const activeLayer = this.layerManager.currentLayer;
                        const currentOpacity = this.layerManager.layers[activeLayer].opacity;
                        const boostOpacity = Math.min(1.0, currentOpacity + beatData.bassLevel * 0.3);
                        
                        this.layerManager.setLayerOpacity(activeLayer, boostOpacity);
                        setTimeout(() => {
                            this.layerManager.setLayerOpacity(activeLayer, currentOpacity);
                        }, 200);
                    }
                }
            }, 100);
        }
        
        stopBeatEffects() {
            if (this.beatEffectsInterval) {
                clearInterval(this.beatEffectsInterval);
                this.beatEffectsInterval = null;
            }
        }
        
        setQualityMode(mode) {
            if (this.videoEngine) {
                this.videoEngine.qualityMode = mode;
                this.uiManager.showNotification(`Quality set to ${mode}`, 'info');
            }
        }
        
        setupPerformanceMonitor() {
            const monitor = document.createElement('div');
            monitor.id = 'performance-monitor';
            monitor.innerHTML = `
                <div class="fps-counter">FPS: <span id="fps-value">0</span></div>
                <div class="layer-count">Active: <span id="active-layers">0</span></div>
            `;
            document.getElementById('header').appendChild(monitor);
            
            setInterval(() => {
                if (document.getElementById('fps-value')) {
                    document.getElementById('fps-value').textContent = this.videoEngine.getFPS();
                    const activeLayers = this.layerManager.layers.filter(l => l.opacity > 0 && l.video).length;
                    document.getElementById('active-layers').textContent = activeLayers;
                }
            }, 1000);
        }
        
        setupAdvancedPerformanceMonitor() {
            const monitor = document.getElementById('performance-monitor');
            if (!monitor) {
                console.warn('Performance monitor element not found');
                return;
            }
            
            // Add memory and performance indicators
            const memoryIndicator = document.createElement('div');
            memoryIndicator.innerHTML = `
                Memory: <span id="memory-usage">0MB</span>
                <div class="performance-indicator good" id="memory-indicator"></div>
            `;
            monitor.appendChild(memoryIndicator);
            
            const frameDropIndicator = document.createElement('div');
            frameDropIndicator.innerHTML = `
                Drops: <span id="frame-drops">0</span>
                <div class="performance-indicator good" id="performance-indicator"></div>
            `;
            monitor.appendChild(frameDropIndicator);
            
            // Enhanced monitoring with WebGL context loss detection
            const canvas = document.getElementById('preview-canvas');
            if (canvas) {
                canvas.addEventListener('webglcontextlost', (e) => {
                    e.preventDefault();
                    this.uiManager.showNotification('WebGL context lost - attempting recovery', 'error');
                    this.handleContextLoss();
                });
                
                canvas.addEventListener('webglcontextrestored', () => {
                    this.uiManager.showNotification('WebGL context restored', 'success');
                    this.videoEngine.init();
                });
            }
            
            // Advanced performance monitoring
            setInterval(() => {
                this.updatePerformanceMetrics();
            }, 1000);
        }
        
        updatePerformanceMetrics() {
            try {
                // Enhanced performance monitoring with video engine stats
                if (this.videoEngine) {
                    const stats = this.videoEngine.getPerformanceStats();
                    const currentFPS = stats.fps;
                    
                    // Update FPS display
                    const fpsElement = document.getElementById('fps-value');
                    if (fpsElement) {
                        fpsElement.textContent = currentFPS;
                        fpsElement.className = currentFPS >= 55 ? 'good' : 
                                              currentFPS >= 30 ? 'warning' : 'critical';
                    }
                    
                    // Advanced memory monitoring
                    if (performance.memory) {
                        const memoryMB = Math.round(performance.memory.usedJSHeapSize / 1024 / 1024);
                        const memoryElement = document.getElementById('memory-usage');
                        if (memoryElement) {
                            memoryElement.textContent = memoryMB + 'MB';
                        }
                        
                        const memoryIndicator = document.getElementById('memory-indicator');
                        if (memoryIndicator) {
                            memoryIndicator.className = 'performance-indicator ' + 
                                (memoryMB > 300 ? 'critical' : memoryMB > 150 ? 'warning' : 'good');
                        }
                        
                        // Memory leak detection
                        if (memoryMB > 500) {
                            this.uiManager.showNotification('High memory usage detected. Consider reloading.', 'warning', 5000);
                        }
                    }
                    
                    // Frame drop detection with better threshold
                    if (currentFPS < 45 && currentFPS > 0) {
                        this.performanceMetrics.frameDrops++;
                    }
                    
                    // Adaptive quality notification
                    if (stats.adaptiveQuality < 0.7) {
                        const qualityPercent = Math.round(stats.adaptiveQuality * 100);
                        this.uiManager.showNotification(
                            `Auto-quality reduced to ${qualityPercent}% for performance`, 
                            'info', 
                            2000
                        );
                    }
                    
                    // GPU performance monitoring
                    const gl = this.videoEngine.gl;
                    if (gl) {
                        const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
                        if (debugInfo && !this.gpuInfoLogged) {
                            const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
                            console.log('GPU Renderer:', renderer);
                            this.gpuInfoLogged = true;
                        }
                    }
                }
                
            } catch (error) {
                console.warn('Performance monitoring error:', error);
            }
        }
        
        handleContextLoss() {
            // Pause all videos to conserve resources
            this.layerManager.layers.forEach(layer => {
                if (layer.video) {
                    layer.video.pause();
                }
            });
            
            // Clear effects to reduce GPU load
            this.clearAllEffects();
            
            // Show loading overlay
            this.showLoadingOverlay('Recovering WebGL context...');
            
            setTimeout(() => {
                this.hideLoadingOverlay();
                this.restoreVideoPlayback();
            }, 2000);
        }
        
        showLoadingOverlay(message) {
            const overlay = document.createElement('div');
            overlay.className = 'loading-overlay';
            overlay.id = 'loading-overlay';
            overlay.innerHTML = `
                <div class="loading-spinner"></div>
                <div class="loading-text">${message}</div>
            `;
            document.body.appendChild(overlay);
        }
        
        hideLoadingOverlay() {
            const overlay = document.getElementById('loading-overlay');
            if (overlay) {
                overlay.remove();
            }
        }
        
        restoreVideoPlayback() {
            this.layerManager.layers.forEach(layer => {
                if (layer.video && layer.opacity > 0) {
                    layer.video.play().catch(console.warn);
                }
            });
        }
        
        startEffect(effectName) {
            this.videoEngine.enableEffect(effectName);
            const effectBtn = document.querySelector(`[data-effect="${effectName}"]`);
            if (effectBtn) {
                effectBtn.classList.add('active');
            }
            this.activeEffects.add(effectName);
            
            // Track effect combinations
            if (this.activeEffects.size > 1) {
                this.showEffectCombination();
            }
        }
        
        stopEffect(effectName) {
            this.videoEngine.disableEffect(effectName);
            const effectBtn = document.querySelector(`[data-effect="${effectName}"]`);
            if (effectBtn) {
                effectBtn.classList.remove('active');
            }
            this.activeEffects.delete(effectName);
            
            // Hide effect combination indicator
            this.hideEffectCombination();
        }
        
        showEffectCombination() {
            const effectBtns = document.querySelectorAll('.effect-btn.active');
            effectBtns.forEach(btn => {
                let combo = btn.querySelector('.effect-combo');
                if (!combo) {
                    combo = document.createElement('div');
                    combo.className = 'effect-combo';
                    combo.textContent = `+${this.activeEffects.size - 1}`;
                    btn.appendChild(combo);
                } else {
                    combo.textContent = `+${this.activeEffects.size - 1}`;
                }
            });
        }
        
        hideEffectCombination() {
            if (this.activeEffects.size <= 1) {
                document.querySelectorAll('.effect-combo').forEach(combo => {
                    combo.remove();
                });
            }
        }
        
        clearAllEffects() {
            this.activeEffects.forEach(effect => {
                this.stopEffect(effect);
            });
            this.videoEngine.clearEffects();
        }
        
        toggleSequencerStep(step) {
            const stepElement = document.querySelector(`[data-step="${step}"]`);
            const isActive = stepElement.classList.contains('active');
            
            if (isActive) {
                stepElement.classList.remove('active');
                this.sequencer.clearStep(step);
            } else {
                stepElement.classList.add('active');
                this.sequencer.setStep(step, { layer: this.layerManager.currentLayer });
            }
        }
        
        handleSequencerStep(step, data) {
            // Record pattern if recording mode is active
            if (this.patternManager.isRecording) {
                this.patternManager.recordStep(step, {
                    layer: this.layerManager.currentLayer,
                    opacity: this.layerManager.layers[this.layerManager.currentLayer].opacity,
                    effects: Array.from(this.activeEffects)
                });
            }
            
            // Update visual indicator
            document.querySelectorAll('.sequencer-step').forEach((el, index) => {
                el.classList.toggle('current', index === step);
            });
            
            // Enhanced beat indicator with BPM visualization
            this.updateBPMVisualization(step);
            
            // Update step counter
            const stepCounter = document.getElementById('step-counter');
            if (stepCounter) {
                stepCounter.textContent = `Step ${step + 1}/8`;
            }
            
            // Execute step data with enhanced features
            if (data && data.layer !== undefined) {
                this.layerManager.setActiveLayer(data.layer);
                
                // Apply recorded effects if available
                if (data.effects) {
                    this.clearAllEffects();
                    data.effects.forEach(effect => this.startEffect(effect));
                }
                
                // Apply recorded opacity if available
                if (data.opacity !== undefined) {
                    this.layerManager.setLayerOpacity(data.layer, data.opacity);
                }
                
                // Enhanced visual feedback
                const activeLayer = this.layerManager.layers[data.layer].element;
                activeLayer.classList.add('step-triggered');
                setTimeout(() => activeLayer.classList.remove('step-triggered'), 200);
            }
        }
        
        updateBPMVisualization(currentStep) {
            const beatIndicator = document.getElementById('beat-indicator');
            if (beatIndicator) {
                beatIndicator.classList.remove('beat');
                void beatIndicator.offsetWidth; // Force reflow
                beatIndicator.classList.add('beat');
            }
            
            // Add BPM bars if not exists
            let bpmBars = document.querySelector('.bpm-bars');
            if (!bpmBars && beatIndicator) {
                bpmBars = document.createElement('div');
                bpmBars.className = 'bpm-bars';
                for (let i = 0; i < 8; i++) {
                    const bar = document.createElement('div');
                    bar.className = 'bpm-bar';
                    bpmBars.appendChild(bar);
                }
                beatIndicator.parentNode.appendChild(bpmBars);
            }
            
            // Update BPM bars
            if (bpmBars) {
                bpmBars.querySelectorAll('.bpm-bar').forEach((bar, index) => {
                    bar.classList.toggle('active', index === currentStep);
                });
            }
        }
        
        saveSettings() {
            try {
                const settings = {
                    layers: this.layerManager.layers.map(layer => ({
                        opacity: layer.opacity,
                        blendMode: layer.blendMode,
                        hotCues: layer.hotCues,
                        videoSrc: layer.video ? layer.video.src : null
                    })),
                    assignments: this.assignmentManager.getAssignments(),
                    patterns: this.patternManager.getPatterns(),
                    bpm: this.sequencer.bpm,
                    sequencerSteps: this.sequencer.steps
                };
                
                this.storage.save(settings);
                
                // Show save indicator
                this.showSaveIndicator();
                
            } catch (error) {
                console.error('Failed to save settings:', error);
                this.uiManager.showErrorMessage('Failed to save settings');
            }
        }
        
        showSaveIndicator() {
            const indicator = document.getElementById('save-indicator');
            if (indicator) {
                indicator.classList.add('visible');
                setTimeout(() => indicator.classList.remove('visible'), 1000);
            }
        }
        
        loadSettings() {
            const settings = this.storage.load();
            if (settings) {
                // Restore BPM
                if (settings.bpm) {
                    this.sequencer.setBPM(settings.bpm);
                    const bpmInput = document.getElementById('bpm-input');
                    if (bpmInput) {
                        bpmInput.value = settings.bpm;
                    }
                }
                
                // Restore assignments
                if (settings.assignments) {
                    this.assignmentManager.setAssignments(settings.assignments);
                }
                
                // Restore patterns
                if (settings.patterns) {
                    this.patternManager.setPatterns(settings.patterns);
                }
                
                console.log('Settings loaded');
            }
        }
        
        reset() {
            // Stop sequencer
            this.sequencer.stop();
            
            // Reset layers
            this.layerManager.reset();
            
            // Clear effects
            this.clearAllEffects();
            document.querySelectorAll('.effect-btn.active').forEach(btn => {
                btn.classList.remove('active');
            });
            
            // Clear assignments
            this.assignmentManager.clear();
            
            console.log('VJ Mixer reset');
        }
        
        emergencyStop() {
            // Enhanced emergency stop with better feedback
            this.uiManager.showNotification('Emergency stop activated', 'warning', 5000);
            
            // Fade out all layers quickly
            this.layerManager.layers.forEach((layer, index) => {
                this.layerManager.animateOpacity(index, 0, 500);
            });
            
            // Stop sequencer
            this.sequencer.stop();
            
            // Clear all effects
            this.clearAllEffects();
            
            // Reset crossfader to center
            const crossfader = document.getElementById('crossfader');
            if (crossfader) {
                crossfader.value = 0.5;
                this.videoEngine.setCrossfader(0.5);
            }
            
            // Visual feedback
            document.body.style.background = 'linear-gradient(135deg, #ff6b6b 0%, #2d2d2d 100%)';
            setTimeout(() => {
                document.body.style.background = '';
            }, 1000);
            
            console.log('Enhanced emergency stop activated');
        }
    }
    
    // Make VJMixer globally available
    window.VJMixer = VJMixer;
}

// Initialize the VJ Mixer when the page loads
document.addEventListener('DOMContentLoaded', async () => {
    try {
        // Only initialize if not already initialized
        if (!window.vjMixer) {
            console.log('Starting VJ Mixer initialization...');
            const vjMixer = new VJMixer();
            await vjMixer.init();
        }
    } catch (error) {
        console.error('Failed to initialize VJ Mixer:', error);
        
        // Show error message to user
        const errorDiv = document.createElement('div');
        errorDiv.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: #ff6b6b;
            color: white;
            padding: 20px;
            border-radius: 10px;
            text-align: center;
            z-index: 9999;
            font-family: Arial, sans-serif;
        `;
        errorDiv.innerHTML = `
            <h3>VJ Mixer Failed to Start</h3>
            <p>Please check the browser console for details.</p>
            <button onclick="location.reload()" style="margin-top: 10px; padding: 8px 16px; background: white; color: #ff6b6b; border: none; border-radius: 5px; cursor: pointer;">Reload Page</button>
        `;
        document.body.appendChild(errorDiv);
    }
});