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
            if (UIManager) { // Check if UIManager class is available
                this.uiManager = new UIManager(this);
            }
            this.patternManager = new PatternManager();
            
            // Initialize video engine with better error handling
            if (!window.VideoEngine) {
                console.error('VideoEngine class not found. Check if video-engine.js loaded properly.');
                this.uiManager.showNotification('VideoEngine not available. Some features may not work.', 'error', 10000);
                return;
            } else {
                this.videoEngineEnabled = true; // Assume enabled unless init fails
            }
            
            this.videoEngine = new window.VideoEngine();
            this.videoEngine.onPerformanceWarning = (message) => {
                if (this.uiManager) {
                    this.uiManager.showNotification(message, 'warning', 4000);
                }
            };
            
            try {
                console.log('Initializing video engine...');
                await this.videoEngine.init();
                console.log('Video engine initialized successfully');
            } catch (error) {
                console.error('Failed to initialize video engine:', error);
                this.uiManager.showNotification('WebGL initialization failed. Using fallback mode.', 'error', 10000);
                this.videoEngine = null; // Explicitly set to null on failure
                this.videoEngineEnabled = false; // Indicate failure
            }
            
            // Initialize layer manager
            if (LayerManager && this.videoEngineEnabled && this.videoEngine) { // LayerManager depends on VideoEngine
                this.layerManager = new LayerManager(this.videoEngine);
                this.layerManager.init();
            } else if (this.uiManager) {
                 this.uiManager.showNotification('Layer management unavailable due to VideoEngine issues.', 'warning', 5000);
            }
            
            // Initialize MIDI controller
            if (MIDIController) {
                this.midiController = new MIDIController();
                try {
                    await this.midiController.init();
                    if (this.assignmentManager && this.midiController.onMIDIMessage) {
                         this.midiController.onMIDIMessage = this.assignmentManager.handleMIDI.bind(this.assignmentManager);
                    }
                } catch (error) {
                     console.warn('Failed to initialize MIDI Controller:', error);
                     if (this.uiManager) {
                        this.uiManager.showNotification('MIDI Controller not available.', 'warning', 5000);
                     }
                     this.midiController = null; // Explicitly set to null on failure
                }
            }
            
            // Initialize sequencer
            if (Sequencer) {
                this.sequencer = new Sequencer();
                this.sequencer.onStepChange = this.handleSequencerStep.bind(this);
            }
            
            // Initialize performance monitor
            if (PerformanceMonitor && this.videoEngine) { // PerformanceMonitor depends on VideoEngine
                this.performanceMonitor = new PerformanceMonitor(this.videoEngine);
                this.performanceMonitor.start();
            }
            
            // Setup UI and event listeners - Only if UIManager is available
            if (this.uiManager) {
                this.setupUI();
                this.uiManager.setupEventListeners();
            } else {
                 console.warn('UI Manager not initialized. UI setup skipped.');
            }

            // Setup listeners for new global shader controls
            this.setupGlobalControlsListeners();
            // Setup listeners for new effect-specific shader controls and panel visibility
            this.setupEffectSpecificControlsListeners();
        }

        setupGlobalControlsListeners() {
            const globalControlSliders = document.querySelectorAll('.global-control-slider'); // Matches HTML class

            globalControlSliders.forEach(slider => {
                const propertyName = slider.dataset.engineProperty;
                const valueDisplaySpan = document.getElementById(`${slider.id.replace('-slider', '-value')}`);

                if (!propertyName || !this.videoEngine || typeof this.videoEngine[propertyName] === 'undefined') {
                    console.warn(`Global control slider for '${propertyName}' (ID: ${slider.id}) has no matching VideoEngine property or the property is undefined. Ensure VideoEngine has property '${propertyName}' and HTML element ID for value display is '${slider.id.replace('-slider', '-value')}'.`);
                    return;
                }

                try {
                    slider.value = this.videoEngine[propertyName];
                    if (valueDisplaySpan) {
                        let step = slider.step || "0.01"; // Default step for formatting if not set
                        valueDisplaySpan.textContent = Number(slider.value).toFixed(step.includes('.') ? step.split('.')[1].length : 0);
                    }
                } catch (e) {
                    console.error(`Error setting initial value for global control ${propertyName}:`, e);
                }


                slider.addEventListener('input', (e) => {
                    const value = parseFloat(e.target.value);

                    if (this.videoEngine && typeof this.videoEngine[propertyName] !== 'undefined') {
                        this.videoEngine[propertyName] = value;
                    }

                    if (valueDisplaySpan) {
                        let step = slider.step || "0.01";
                        let decimals = 0;
                        if (step.includes('.')) {
                            decimals = step.split('.')[1].length;
                        } else if (parseFloat(step) === 0) { // step="any" or invalid might parse to 0 or NaN
                            decimals = 2; // Default for "any"
                        }
                        valueDisplaySpan.textContent = value.toFixed(decimals);
                    }
                });
            });
        }

        showSpecificControlsForEffect(effectNameToShow) {
            document.querySelectorAll('.effect-specific-panel').forEach(panel => {
                panel.style.display = 'none';
            });

            if (effectNameToShow) {
                const panelId = `${effectNameToShow}-controls-panel`;
                const activePanel = document.getElementById(panelId);
                if (activePanel) {
                    this.initializeEffectPanelSliders(effectNameToShow, activePanel);
                    activePanel.style.display = 'block'; // Or 'grid', 'flex' based on CSS
                } // else {
                    // console.warn(`Control panel not found for effect: ${effectNameToShow} (expected ID: ${panelId})`);
                }
            }
        }

        initializeEffectPanelSliders(effectName, panelElement) {
            const sliders = panelElement.querySelectorAll('.effect-param-slider');
            sliders.forEach(slider => {
                const paramName = slider.dataset.param;
                const valueDisplaySpan = document.getElementById(`${slider.id.replace('-slider', '-value')}`);

                if (this.videoEngine &&
                    this.videoEngine.effectControls &&
                    this.videoEngine.effectControls[effectName] &&
                    typeof this.videoEngine.effectControls[effectName][paramName] !== 'undefined') {

                    slider.value = this.videoEngine.effectControls[effectName][paramName];
                    if (valueDisplaySpan) {
                        let step = slider.step || "0.01";
                        let decimals = 0;
                        if (step.includes('.')) { decimals = step.split('.')[1].length; }
                        else if (parseFloat(step) === 0) { decimals = 2; }
                        valueDisplaySpan.textContent = Number(slider.value).toFixed(decimals);
                    }
                } else {
                    console.warn(`Cannot initialize slider for ${effectName}.${paramName} - control data not found in VideoEngine.effectControls.`);
                }
            });
        }

        setupEffectSpecificControlsListeners() {
            const specificControlSliders = document.querySelectorAll('.effect-param-slider');

            specificControlSliders.forEach(slider => {
                const effectName = slider.dataset.effect;
                const paramName = slider.dataset.param;
                const valueDisplaySpan = document.getElementById(`${slider.id.replace('-slider', '-value')}`);

                if (!effectName || !paramName ||
                    !this.videoEngine || !this.videoEngine.effectControls || !this.videoEngine.effectControls[effectName] ||
                    typeof this.videoEngine.effectControls[effectName][paramName] === 'undefined') {
                    console.warn(`Specific control slider for ${effectName}.${paramName} (ID: ${slider.id}) has an issue or no matching VideoEngine control. Ensure effectControls are defined.`);
                    return;
                }

                // Initial value is set by initializeEffectPanelSliders when panel is shown

                slider.addEventListener('input', (e) => {
                    const value = parseFloat(e.target.value);

                    if (this.videoEngine && this.videoEngine.effectControls[effectName]) {
                        this.videoEngine.effectControls[effectName][paramName] = value;
                    }

                    if (valueDisplaySpan) {
                        let step = slider.step || "0.01";
                        let decimals = 0;
                        if (step.includes('.')) { decimals = step.split('.')[1].length; }
                        else if (parseFloat(step) === 0) { decimals = 2; }
                        valueDisplaySpan.textContent = value.toFixed(decimals);
                    }
                    // console.log(`Set VideoEngine.effectControls.${effectName}.${paramName} = ${value}`);
                });
            });

            // Add listeners to main effect buttons to toggle effects and show/hide specific control panels
            const effectButtons = document.querySelectorAll('#effects-grid .effect-btn');
            effectButtons.forEach(button => {
                button.addEventListener('click', () => { // Using 'click' as it's more standard than 'mousedown' for toggles
                    const effectName = button.dataset.effect;
                    // Check if the button currently has the 'active' class
                    const wasActive = button.classList.contains('active');

                    if (wasActive) {
                        this.stopEffect(effectName); // Manages this.activeEffects and button class
                        
                        // --- Effect Panel Visibility Logic ---
                        // When an active effect button is clicked (to deactivate it),
                        // check if its corresponding control panel was visible.
                        const panelId = `${effectName}-controls-panel`;
                        const panel = document.getElementById(panelId);
                        // If the panel exists and was visible, hide all effect-specific panels.
                        // This is the current behavior: toggling off an effect hides its panel
                        // and any other effect panels that might have been open (though currently only one can be open).
                        if (panel && panel.style.display !== 'none') {
                           this.showSpecificControlsForEffect(null);
                        }
                        // Note: To allow multiple panels to remain open when an effect is deactivated,
                        // you would remove this 'if' block and the following call to showSpecificControlsForEffect(null).
                        // You would instead potentially add logic in stopEffect or elsewhere to manage panel visibility
                        // if you wanted panels to persist regardless of button state.
                    } else {
                        // When an inactive effect button is clicked (to activate it),
                        // Before activating, if UI should only show one panel at a time for "new" effects,
                        // and if the effect being activated is one of the "new" ones.
                        // This logic might need refinement based on whether old and new effects can have panels simultaneously.
                        // For now, assume activating any effect that *has* a panel should show it and hide others.
                        this.startEffect(effectName); // Manages this.activeEffects and button class

                        // Check if this effect has a specific panel to show
                        // This is the current behavior: if the activated effect has a dedicated panel,
                        // show ONLY that panel and hide all others.
                        const panelId = `${effectName}-controls-panel`;
                        if (document.getElementById(panelId)) {
                            this.showSpecificControlsForEffect(effectName);
                        } else {
                            // If the activated effect does NOT have a dedicated panel,
                            // It's an old effect or one without specific UI panel, hide all specific panels.
                            // This ensures clicking an effect without a panel still clears other panels.
                            this.showSpecificControlsForEffect(null);
                        }
                        // Note: To allow multiple panels to be open simultaneously (if an effect has a panel),
                        // you would modify the showSpecificControlsForEffect method so it doesn't hide all panels first.
                        // Then, here, you would simply call showSpecificControlsForEffect(effectName) if the panel exists,
                        // without the 'else' block that hides all panels.
                        }
                    }
                });
            });
        }

        // Initial load of settings after core components are ready
        // Moved outside of async init to ensure managers are assigned, even if init partially fails
        async postInitSetup() {
             // Load saved settings
            this.loadSettings();
            
            // Setup auto-save
            if (this.storage) {
                this.storage.setupAutoSave(() => this.saveSettings(), 10000);
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
                beatMatch: false, // Note: Implementation for beatMatch is missing
                colorSync: false, // Note: Implementation for colorSync is missing
                learningMode: true // Note: learningMode is not currently used
            };
            this.aiLastEffectTime = 0; // For effect cooldown
            
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
                    const now = performance.now();
                    const aiEffectCooldown = 1000; // Minimum 1 second between AI effects
                    if (beatData.bassLevel > 0.8 && (now - this.aiLastEffectTime > aiEffectCooldown)) {
                        const AIEffects = ['glitch', 'rgbShift', 'distort', 'pixelate', 'zoom', 'strobe'];
                        const effect = AIEffects[Math.floor(Math.random() * AIEffects.length)];

                        console.log(`AI triggering effect: ${effect}`);
                        this.startEffect(effect);
                        setTimeout(() => this.stopEffect(effect), 200 + Math.random() * 300); // Duration 200-500ms

                        this.aiLastEffectTime = now;
                    }
                }
            }, 250); // Interval check remains 250ms
        }
        
        stopAIAutoMix() {
            if (this.aiAutoMixInterval) {
                clearInterval(this.aiAutoMixInterval);
                this.aiAutoMixInterval = null;
            }
        }
        
        startEnhancedPerformanceDisplay() {
             if (!this.videoEngine) {
                console.warn('VideoEngine not available for enhanced performance display.');
                return;
            }
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
            if (this.videoEngine) this.autoCrossfadeEnabled = enabled;
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
            if (this.videoEngine) this.beatEffectsEnabled = enabled;
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
            if (!this.videoEngine || !this.layerManager) {
                 console.warn('VideoEngine or LayerManager not available for performance monitor setup.');
                 return;
            }
            const monitor = document.createElement('div');
            monitor.id = 'performance-monitor';
            monitor.innerHTML = `
                <div class="fps-counter">FPS: <span id="fps-value">--</span></div>
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
             if (!this.videoEngine) {
                 console.warn('VideoEngine not available for advanced performance monitor setup.');
                 return;
            }
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
                    if (this.uiManager) this.uiManager.showNotification('WebGL context lost - attempting recovery', 'error');
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
                 if (!this.videoEngine || !this.layerManager) {
                     console.warn('VideoEngine or LayerManager not available for performance metrics update.');
                     return;
                }
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
            if (this.layerManager) {
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
             if (this.layerManager) {
                 this.layerManager.layers.forEach(layer => {
                    if (layer.video && layer.opacity > 0) {
                        layer.video.play().catch(console.warn);
                    }
                });
            }
        }
        
        startEffect(effectName) {
             if (!this.videoEngine) return; // Effects depend on VideoEngine

            // this.videoEngine.enableEffect(effectName); // Obsolete: VideoEngine now uses activeEffects Set
            const effectBtn = document.querySelector(`#effects-grid [data-effect="${effectName}"]`); // More specific selector
            if (effectBtn) {
                effectBtn.classList.add('active');
            }
            this.activeEffects.add(effectName);
            
            // Track effect combinations
            if (this.activeEffects.size > 1) {
                this.showEffectCombination();
            }
            // Panel visibility is handled by the click listener in setupEffectSpecificControlsListeners
        }
        
        stopEffect(effectName) {
             if (!this.videoEngine) return; // Effects depend on VideoEngine

             // this.videoEngine.disableEffect(effectName); // Obsolete: VideoEngine now uses activeEffects Set
            const effectBtn = document.querySelector(`#effects-grid [data-effect="${effectName}"]`); // More specific selector
            if (effectBtn) {
                effectBtn.classList.remove('active');
            }
            this.activeEffects.delete(effectName);
            
            // Hide effect combination indicator
            this.hideEffectCombination();
            // Panel visibility is handled by the click listener in setupEffectSpecificControlsListeners
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
        }
        
        toggleSequencerStep(step) {
            const stepElement = document.querySelector(`[data-step="${step}"]`);
            const isActive = stepElement.classList.contains('active');
            
            if (isActive) {
                stepElement.classList.remove('active');
                this.sequencer.clearStep(step);
                 // Optionally clear recorded data for this step in PatternManager if recording is off
                 if (this.patternManager && !this.patternManager.isRecording) {
                    // patternManager might need a method like clearRecordedStep(step)
                 }
            } else {
                 if (!this.sequencer || !this.layerManager) return; // Depend on Sequencer and LayerManager

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
                    
                    // Update UI element for opacity if UIManager exists and the method exists there
                    // This requires UIManager to have an updateOpacitySlider method
                    if (this.uiManager) this.uiManager.updateOpacitySlider(data.opacity);
                }
                
                // Enhanced visual feedback
                const activeLayer = this.layerManager.layers[data.layer].element;
                 if (activeLayer) activeLayer.classList.add('step-triggered');
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
            try { // Wrap saving logic in a try-catch
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
                    sequencerSteps: this.sequencer.steps // Ensure this is safe to serialize
                };
                
                this.storage.save(settings);
                
                // Show save indicator - Delegate to UIManager
                if (this.uiManager) {
                    this.uiManager.showSaveIndicator();
                } else {
                    // Fallback or log if uiManager is not available
                    const indicator = document.getElementById('save-indicator');
                    if (indicator) {
                        indicator.classList.add('visible');
                        setTimeout(() => indicator.classList.remove('visible'), 1000);
                    }
                }
                
            } catch (error) {
                console.error('Failed to save settings:', error);
                this.uiManager.showErrorMessage('Failed to save settings');
            }
        }
        
        // showSaveIndicator() {
        //     // This method's logic would move to UIManager.showSaveIndicator()
        //     // const indicator = document.getElementById('save-indicator');
        //     // if (indicator) {
        //     //     indicator.classList.add('visible');
        //     //     setTimeout(() => indicator.classList.remove('visible'), 1000);
        //     // }
        // }

        loadSettings() {
            try {
                if (!this.storage) {
                    console.warn('Storage not available. Cannot load settings.');
                    return;
                }
                const settings = this.storage.load(); // Attempt to load settings

                // Basic check if settings is a non-null object
                if (settings && typeof settings === 'object') {
                    console.log('Applying loaded settings...');

                    try {
                        // Restore BPM
                        if (this.sequencer && typeof settings.bpm === 'number' && !isNaN(settings.bpm)) {
                            this.sequencer.setBPM(settings.bpm);
                            const bpmInput = document.getElementById('bpm-input');
                            if (bpmInput) {
                                bpmInput.value = settings.bpm;
                            }
                        } else if (settings.bpm !== undefined) {
                            console.warn('Invalid or missing BPM data in settings:', settings.bpm);
                        }

                        // Restore sequencer steps
                        if (this.sequencer && Array.isArray(settings.sequencerSteps)) {
                            // Basic validation of steps array content (e.g., check for objects with expected properties)
                            const validSteps = settings.sequencerSteps.filter(step =>
                                step === null || (typeof step === 'object' && step !== null && step.layer !== undefined)
                            );
                            this.sequencer.steps = validSteps.slice(0, 8); // Ensure only 8 steps are loaded
                            // Optionally update UI based on loaded steps here or in Sequencer/UIManager
                        } else if (settings.sequencerSteps !== undefined) {
                            console.warn('Invalid or missing sequencerSteps data in settings:', settings.sequencerSteps);
 }
                        // Update sequencer UI based on loaded steps
                        if (this.sequencer && this.sequencer.steps) {
 this.updateSequencerUI();
                        }


                        // Restore assignments
                        if (typeof settings.assignments === 'object' && settings.assignments !== null) {
                             if (this.assignmentManager) {
                                this.assignmentManager.setAssignments(settings.assignments);
                            } else {
                                 console.warn('AssignmentManager not available to load assignments.');
                            }
                        }

                        // Restore patterns
                        if (typeof settings.patterns === 'object' && settings.patterns !== null) {
                            if (this.patternManager) {
                                this.patternManager.setPatterns(settings.patterns);
                            } else {
                                console.warn('PatternManager not available to load patterns.');
                            }
                        }

                        // Restore layers (example - assuming layer data needs careful application)
                        if (Array.isArray(settings.layers)) {
                             if (this.layerManager) {
                                // LayerManager needs a method like loadLayers(layerData)
                                // that handles validation and application of each layer's settings.
                                console.warn('LayerManager needs a specific method to load layer settings from data.');
                             } else {
                                console.warn('LayerManager not available to load layer settings.');
                            }
                        } else if (settings.layers !== undefined) {
                            console.log('Layer settings found, ensure LayerManager handles this restore.');
                        }

                        console.log('Settings applied successfully.');
                        if (this.uiManager) {
                            this.uiManager.showNotification('Settings loaded successfully.', 'success', 3000);
                        }

                    } catch (applyError) {
                        console.error('Error applying loaded settings:', applyError);
                        if (this.uiManager) {
                            this.uiManager.showErrorMessage('Failed to apply some settings. Data might be corrupt.');
                        }
                    }
                } else {
                    console.log('No saved settings found or settings were invalid.');
                    // Optionally notify user if settings were expected but not found/invalid
                    // if (this.uiManager) {
                    //     this.uiManager.showNotification('No valid settings found to load.', 'info', 3000);
                    // }
                }
            } catch (loadError) {
                console.error('Error loading settings from storage:', loadError);
                if (this.uiManager) {
                    this.uiManager.showErrorMessage('Failed to load settings. Storage might be corrupt.');
                }
            }
        }
        
        reset() {
            // Stop sequencer if available
            if (this.sequencer) {
                this.sequencer.stop();
            } else {
                 console.warn('Sequencer not available to stop during reset.');
            }

            // Reset layers
            if (this.layerManager) {
                this.layerManager.reset();
            } else {
                 console.warn('LayerManager not available to reset.');
            }

            // Clear effects
            this.clearAllEffects();
             // Reset effect UI buttons
            document.querySelectorAll('#effects-grid .effect-btn.active').forEach(btn => {
                btn.classList.remove('active');
            });

            // Clear assignments
            if (this.assignmentManager) {
                this.assignmentManager.clear();
            } else {
                 console.warn('AssignmentManager not available to clear assignments.');
            }
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
            if (this.sequencer) {
                this.sequencer.stop();
            }
            
            // Clear all effects
            this.clearAllEffects();
            
            // Reset crossfader to center
            const crossfader = document.getElementById('crossfader');
            if (crossfader) {
                crossfader.value = 0.5;
                this.videoEngine.setCrossfader(0.5);
            }
            
            // Visual feedback - Delegate to UIManager
            if (this.uiManager) {
                this.uiManager.showEmergencyVisuals(); // Assumes UIManager handles the timed removal as well
            } else {
                // Fallback or log
                document.body.style.background = 'linear-gradient(135deg, #ff6b6b 0%, #2d2d2d 100%)';
                setTimeout(() => {
                    document.body.style.background = '';
                }, 1000);
            }
            
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
                 window.vjMixer = vjMixer; // Set global reference early
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