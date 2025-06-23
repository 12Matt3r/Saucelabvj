class UIManager {
    constructor(vjMixer) {
        this.vjMixer = vjMixer;
        this.outputWindow = null;
        this.notifications = [];
        this.gestureStartTime = 0;
        this.isPerformanceMode = false;
    }
    
    setupEventListeners() {
        // Header controls
        const keyAssignmentBtn = document.getElementById('key-assignment-btn');
        if (keyAssignmentBtn) {
            keyAssignmentBtn.addEventListener('click', () => {
                this.vjMixer.assignmentManager.toggleAssignmentMode('keyboard');
            });
        }
        
        const midiAssignmentBtn = document.getElementById('midi-assignment-btn');
        if (midiAssignmentBtn) {
            midiAssignmentBtn.addEventListener('click', () => {
                this.vjMixer.assignmentManager.toggleAssignmentMode('midi');
            });
        }
        
        const outputWindowBtn = document.getElementById('output-window-btn');
        if (outputWindowBtn) {
            outputWindowBtn.addEventListener('click', () => {
            this.toggleOutputWindow();
            });
        }
        
        const fullscreenBtn = document.getElementById('fullscreen-btn');
        if (fullscreenBtn) {
            fullscreenBtn.addEventListener('click', () => {
            this.toggleFullscreen();
            });
        }
        
        const resetBtn = document.getElementById('reset-btn');
        if (resetBtn) {
            resetBtn.addEventListener('click', () => {
                this.vjMixer.reset();
            });
        }
        
        // BPM controls
        const bpmInput = document.getElementById('bpm-input');
        if (bpmInput) {
            bpmInput.addEventListener('change', (e) => {
                if (this.vjMixer && this.vjMixer.sequencer) {
                    this.vjMixer.sequencer.setBPM(parseInt(e.target.value));
                }
            });
        }
        
        const tapTempoBtn = document.getElementById('tap-tempo-btn');
        if (tapTempoBtn && bpmInput) {
            tapTempoBtn.addEventListener('click', () => {
                if (this.vjMixer && this.vjMixer.sequencer) {
                    const bpm = this.vjMixer.sequencer.tapTempo();
                    if (bpm) {
                        bpmInput.value = Math.round(bpm);
                    }
                }
            });
        }
        
        // Video file input
        const videoFileInput = document.getElementById('video-file-input');
        if (videoFileInput) {
            videoFileInput.addEventListener('change', (e) => {
                this.handleVideoFiles(e.target.files);
            });
            document.getElementById('video-file-input').click();
        });
        
        // Drag and drop functionality
        this.setupDragAndDrop();
        
        // Effects
        const effectButtons = document.querySelectorAll('.effect-btn');
        effectButtons.forEach(btn => {
            if (btn && this.vjMixer) {
                btn.addEventListener('mousedown', (e) => this.vjMixer.startEffect(e.target.dataset.effect));
                btn.addEventListener('mouseup', (e) => this.vjMixer.stopEffect(e.target.dataset.effect));
                btn.addEventListener('mouseleave', (e) => this.vjMixer.stopEffect(e.target.dataset.effect));
            }
        });
        
        // Sequencer controls
        const sequencerPlayBtn = document.getElementById('sequencer-play-btn');
        if (sequencerPlayBtn && this.vjMixer && this.vjMixer.sequencer) {
            sequencerPlayBtn.addEventListener('click', () => {
                this.vjMixer.sequencer.play();
            });
        }
        
        const sequencerStopBtn = document.getElementById('sequencer-stop-btn');
        if (sequencerStopBtn && this.vjMixer && this.vjMixer.sequencer) {
            sequencerStopBtn.addEventListener('click', () => {
                this.vjMixer.sequencer.stop();
            });
        }
        
        // Assignment mode overlay
        const exitAssignmentBtn = document.getElementById('exit-assignment-btn');
        if (exitAssignmentBtn && this.vjMixer && this.vjMixer.assignmentManager) {
            exitAssignmentBtn.addEventListener('click', () => {
                this.vjMixer.assignmentManager.exitAssignmentMode();
            });
        }
        
        // Layer controls delegation
        const layersContainer = document.getElementById('layers-container');
        if (layersContainer) {
            layersContainer.addEventListener('click', this.handleLayerClick.bind(this));
            layersContainer.addEventListener('input', this.handleLayerInput.bind(this));
            layersContainer.addEventListener('contextmenu', this.handleLayerRightClick.bind(this));
        }
        
        // Assignment mode clicks
        document.addEventListener('click', this.handleAssignmentClick.bind(this));
        document.addEventListener('contextmenu', this.handleAssignmentRightClick.bind(this));
        
        // Window resize
        window.addEventListener('resize', () => {
            if (this.vjMixer && this.vjMixer.videoEngine) {
                this.vjMixer.videoEngine.resize();
            }
        });
        
        // Prevent default context menu in assignment mode
        document.addEventListener('contextmenu', (e) => {
            if (this.vjMixer && this.vjMixer.assignmentManager && this.vjMixer.assignmentManager.isInAssignmentMode()) {
                e.preventDefault();
            }
        });
        
        // Master controls
        document.addEventListener('input', (e) => {
            if (!this.vjMixer || !this.vjMixer.videoEngine) {
                return;
            }

            if (e.target.id === 'crossfader') {
                const value = parseFloat(e.target.value);
                if (!isNaN(value)) {
                    this.vjMixer.videoEngine.setCrossfader(value);
                }
            } else if (e.target.id === 'master-opacity') {

                const value = parseFloat(e.target.value);
                this.vjMixer.videoEngine.setMasterOpacity(value);
                const opacityValue = e.target.parentNode.querySelector('.opacity-value');
                opacityValue.textContent = Math.round(value * 100) + '%';
            }
        });
        
        this.setupEnhancedKeyboardShortcuts();
        this.setupTouchControls();
    }
    
    setupEnhancedKeyboardShortcuts() {
        const pressedKeys = new Set();
        
        document.addEventListener('keydown', (e) => {
            if (pressedKeys.has(e.code)) return;
            pressedKeys.add(e.code);
            
            // Handle fullscreen toggle
            if (e.key === 'F11') {
                e.preventDefault();
                this.toggleFullscreen();
                return;
            }
            
            if (!this.vjMixer || !this.vjMixer.assignmentManager) {
                return; // Exit if managers are not available
            }

            // Handle assignments
            this.vjMixer.assignmentManager.handleKeyDown(e.code);
            
            // Number keys for quick layer selection
            if (e.code >= 'Digit1' && e.code <= 'Digit6' && this.vjMixer.layerManager) {
                const layerIndex = parseInt(e.code.replace('Digit', '')) - 1;
                if (layerIndex < this.vjMixer.layerManager.layers.length) {
                    this.vjMixer.layerManager.setActiveLayer(layerIndex);
                    e.preventDefault();
                }
            }

            if (!this.vjMixer || !this.vjMixer.videoEngine) {
                return; // Exit if video engine is not available for master controls
            }
            // Space for emergency stop
            if (e.code === 'Space') {
                this.vjMixer.emergencyStop();
                e.preventDefault();
            }
            // Arrow keys for crossfader
            if (e.code === 'ArrowLeft') {
                const crossfader = document.getElementById('crossfader');
                crossfader.value = Math.max(0, parseFloat(crossfader.value) - 0.05);
                this.vjMixer.videoEngine.setCrossfader(parseFloat(crossfader.value));
                e.preventDefault();
            } else if (e.code === 'ArrowRight') {
                const crossfader = document.getElementById('crossfader');
                crossfader.value = Math.min(1, parseFloat(crossfader.value) + 0.05);
                this.vjMixer.videoEngine.setCrossfader(parseFloat(crossfader.value));
                e.preventDefault();
            }
        });
        
        document.addEventListener('keyup', (e) => {
            pressedKeys.delete(e.code);
            if (this.vjMixer && this.vjMixer.assignmentManager) {
                this.vjMixer.assignmentManager.handleKeyUp(e.code);
            }
        });
    }
    
    setupTouchControls() {
        if ('ontouchstart' in window) {
            document.body.classList.add('touch-device');
            
            // Enhanced haptic feedback with better patterns
            this.setupAdvancedHapticFeedback();
            
            // Improved touch gesture recognition
            this.setupAdvancedTouchGestures();
            
            // Enhanced visual feedback for touch
            this.setupTouchVisualFeedback();
        }
    }
    
    setupAdvancedHapticFeedback() {
        this.hapticPatterns = {
            light: [10],
            medium: [25],
            strong: [50],
            double: [25, 50, 25],
            success: [10, 20, 30],
            error: [100, 50, 100]
        };
        
        this.hapticSupported = 'vibrate' in navigator;
    }
    
    setupAdvancedTouchGestures() {
        let touchStartPos = { x: 0, y: 0 };
        let touchStartTime = 0;
        let touchElement = null;
        
        document.addEventListener('touchstart', (e) => {
            const touch = e.touches[0];
            touchStartPos = { x: touch.clientX, y: touch.clientY };
            touchStartTime = performance.now();
            touchElement = e.target;
            
            // Add ripple effect
            this.createTouchRipple(touch.clientX, touch.clientY, touchElement);
            
        }, { passive: true });
        
        document.addEventListener('touchmove', (e) => {
            if (!touchElement) return;
            
            const touch = e.touches[0];
            const deltaX = touch.clientX - touchStartPos.x;
            const deltaY = touch.clientY - touchStartPos.y;
            const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
            
            // Gesture recognition for layer controls
            if (touchElement.classList.contains('layer-preview') && distance > 30) {
                const layerIndex = parseInt(touchElement.closest('[data-layer]').dataset.layer);
                
                if (Math.abs(deltaY) > Math.abs(deltaX)) {
                    // Vertical swipe for opacity
                    const sensitivity = 0.003;
                    const opacityChange = -deltaY * sensitivity;
                    const currentOpacity = this.vjMixer.layerManager.layers[layerIndex].opacity;
                    const newOpacity = Math.max(0, Math.min(1, currentOpacity + opacityChange));
                    
                    if (this.vjMixer && this.vjMixer.layerManager) {
                         this.vjMixer.layerManager.setLayerOpacity(layerIndex, newOpacity);
                    }
                    this.triggerAdvancedHaptic('light');
                    
                    // Visual feedback
                    touchElement.style.transform = `scale(${1 + Math.abs(opacityChange)})`;
                }
            }
        }, { passive: true });
        
        document.addEventListener('touchend', (e) => {
            if (touchElement) {
                touchElement.style.transform = '';
                touchElement = null;
            }
        }, { passive: true });
    }
    
    createTouchRipple(x, y, element) {
        const ripple = document.createElement('div');
        ripple.className = 'touch-ripple';
        
        const rect = element.getBoundingClientRect();
        const size = Math.max(rect.width, rect.height);
        
        ripple.style.cssText = `
            position: absolute;
            width: ${size}px;
            height: ${size}px;
            border-radius: 50%;
            background: radial-gradient(circle, rgba(78, 205, 196, 0.3) 0%, transparent 70%);
            transform: scale(0);
            pointer-events: none;
            z-index: 1000;
            left: ${x - rect.left - size/2}px;
            top: ${y - rect.top - size/2}px;
            animation: rippleEffect 0.6s ease-out;
        `;
        
        element.style.position = 'relative';
        element.appendChild(ripple);
        
        setTimeout(() => ripple.remove(), 600);
    }
    
    setupTouchVisualFeedback() {
        // Add CSS for ripple animation
        if (!document.getElementById('touch-feedback-styles')) {
            const style = document.createElement('style');
            style.id = 'touch-feedback-styles';
            style.textContent = `
                @keyframes rippleEffect {
                    to {
                        transform: scale(2);
                        opacity: 0;
                    }
                }
                
                .touch-active-feedback {
                    transform: scale(0.98) !important;
                    filter: brightness(1.2) !important;
                    transition: all 0.1s ease !important;
                }
                
                .touch-device .assignable:active {
                    transform: scale(0.95);
                    filter: brightness(1.1);
                }
            `;
            document.head.appendChild(style);
        }
    }
    
    triggerAdvancedHaptic(pattern = 'light') {
        if (!this.hapticSupported) return;
        
        const hapticPattern = this.hapticPatterns[pattern] || this.hapticPatterns.light;
        navigator.vibrate(hapticPattern);
    }
    
    setupDragAndDrop() {
        const mainInterface = document.getElementById('main-interface');
        if (mainInterface) {
            // Prevent default drag behaviors
            ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
                mainInterface.addEventListener(eventName, this.preventDefaults, false);
            });
            
            // Highlight drop zone when item is dragged over it
            ['dragenter', 'dragover'].forEach(eventName => {
                mainInterface.addEventListener(eventName, this.highlight.bind(this), false);
            });
            
            ['dragleave', 'drop'].forEach(eventName => {
                mainInterface.addEventListener(eventName, this.unhighlight.bind(this), false);
            });
            
            // Handle dropped files
            mainInterface.addEventListener('drop', this.handleDrop.bind(this), false);
        }

        document.body.addEventListener('dragenter', this.preventDefaults, false);
        document.body.addEventListener('dragover', this.preventDefaults, false);
        document.body.addEventListener('dragleave', this.preventDefaults, false);
        document.body.addEventListener('drop', this.preventDefaults, false);
        
        // Layer-specific drop zones
        document.querySelectorAll('.layer-preview').forEach((preview, index) => {
             if (!preview) return;

            ['dragenter', 'dragover'].forEach(eventName => {
                preview.addEventListener(eventName, (e) => {
                     // Ensure the element with data-layer is a parent
                     const layerElement = e.target.closest('[data-layer]');
                     if (!layerElement) return;
                    e.stopPropagation();
                    preview.classList.add('drag-over');
                }, false);
            });
            
            ['dragleave', 'drop'].forEach(eventName => {
                preview.addEventListener(eventName, (e) => {
                     const layerElement = e.target.closest('[data-layer]');
                     if (!layerElement) return;
                    e.stopPropagation();
                    preview.classList.remove('drag-over');
                }, false);
            });
            
            preview.addEventListener('drop', (e) => {
                const layerElement = e.target.closest('[data-layer]');
                if (!layerElement || !this.vjMixer || !this.vjMixer.layerManager) {
                     return;
                }
                e.stopPropagation();
                const files = e.dataTransfer.files;
                if (files.length > 0 && this.isVideoFile(files[0])) {
                    this.vjMixer.layerManager.setLayerVideo(index, files[0]);
                }
            }, false);
        });
    }
    
    preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }
    
    highlight(e) {
        const mainInterface = document.getElementById('main-interface');
        if (mainInterface) {
             mainInterface.classList.add('drag-highlight');
        }
    }
    
    unhighlight(e) {
         const mainInterface = document.getElementById('main-interface');
        if (mainInterface) {
             mainInterface.classList.remove('drag-highlight');
        }
    }
    
    handleDrop(e) {
        const dt = e.dataTransfer;
        const files = dt.files;
        this.handleVideoFiles(files);
    }
    
    isVideoFile(file) {
        return file.type.startsWith('video/');
    }
    
    handleVideoFiles(files) {
        if (!this.vjMixer || !this.vjMixer.layerManager) {
             return;
        }

        const videoFiles = Array.from(files).filter(file => this.isVideoFile(file));
        
        videoFiles.forEach((file, index) => {
            if (index < this.vjMixer.layerManager.maxLayers) {
                this.vjMixer.layerManager.setLayerVideo(index, file);
            }
         });
        
        if (videoFiles.length === 0 && files.length > 0) {
            this.showErrorMessage('No valid video files found. Supported formats: MP4, WebM, MOV, AVI');
        }
    }
    
    handleLayerClick(e) {
        const target = e.target;
        const layerElement = target.closest('[data-layer]');
        if (!layerElement || !this.vjMixer || !this.vjMixer.assignmentManager || !this.vjMixer.layerManager) {
             return;
        }

        const layer = parseInt(target.dataset.layer);
        const action = target.dataset.action;
        
        if (this.vjMixer.assignmentManager.isInAssignmentMode()) {
            this.vjMixer.assignmentManager.assignControl(target);
            return;
         }

        if (isNaN(layer)) {
            console.warn('UIManager: Invalid layer index from dataset:', target.dataset.layer);
             return;
        }

        
        switch (action) {
            case 'load-video':
                this.loadVideoForLayer(layer);
                break;
            case 'solo':
                 this.vjMixer.layerManager.soloLayer(layer);
                break;
            case 'hot-cue':
                const cue = parseInt(target.dataset.cue);
                 if (!isNaN(cue)) {
                     this.vjMixer.layerManager.triggerHotCue(layer, cue);
                 } else {
                     console.warn('UIManager: Invalid cue index from dataset:', target.dataset.cue);
                 }
                break;
        }

        this.vjMixer.layerManager.setActiveLayer(layer);
    }
    
    handleLayerInput(e) {
        const target = e.target;
        const layerElement = target.closest('[data-layer]');
 if (!layerElement) return; // Exit if the target is not within a layer element
        const layer = parseInt(layerElement.dataset.layer);
        const action = target.dataset.action;

        switch (action) {
            case 'opacity':
                this.vjMixer.layerManager.setLayerOpacity(layer, parseFloat(target.value));
                this.addVisualFeedback(target, 'opacity-change');
                break;
            case 'blend':
                this.vjMixer.layerManager.setLayerBlendMode(layer, target.value);
                this.addVisualFeedback(target, 'blend-change');
                break;
        }
    }
    
    addVisualFeedback(element, feedbackClass) {
        element.classList.add(feedbackClass);
        setTimeout(() => element.classList.remove(feedbackClass), 300);
    }
    
    updateOpacitySlider(layerIndex, opacity) {
        const layerElement = document.querySelector(`.layer[data-layer="${layerIndex}"]`);
        if (!layerElement) {
            console.warn(`UIManager: Could not find layer element for index ${layerIndex}`);
            return;
        }
        const opacitySlider = layerElement.querySelector('.layer-controls input[type="range"][data-action="opacity"]');
        const opacityValueSpan = layerElement.querySelector('.layer-controls .opacity-value');

        if (opacitySlider) {
            opacitySlider.value = opacity;
        }
        if (opacityValueSpan) {
            opacityValueSpan.textContent = Math.round(opacity * 100) + '%';
        }
    }
    
    handleLayerRightClick(e) {
        if (this.vjMixer && this.vjMixer.assignmentManager && this.vjMixer.assignmentManager.isInAssignmentMode()) {
            e.preventDefault();
            this.vjMixer.assignmentManager.removeAssignment(e.target);
        }
    }
    
    handleAssignmentClick(e) {
        if (!this.vjMixer || !this.vjMixer.assignmentManager) {
             return;
        }

        const target = e.target;

        if (this.vjMixer.assignmentManager.isInAssignmentMode() && target.classList.contains('assignable')) {
             // Ensure the target is actually in the DOM if needed, although classList check is usually sufficient
            if (!document.body.contains(target)) return;
            e.preventDefault();
            e.stopPropagation();
            this.vjMixer.assignmentManager.assignControl(e.target);
        }
    }
    
    handleAssignmentRightClick(e) {
        if (!this.vjMixer || !this.vjMixer.assignmentManager) {
             return;
        }

        const target = e.target;

        if (this.vjMixer.assignmentManager.isInAssignmentMode() && target.classList.contains('assignable')) {
            e.preventDefault();
            this.vjMixer.assignmentManager.removeAssignment(e.target);
        }
    }
    
    async loadVideoForLayer(layer) {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'video/*';
        input.onchange = (e) => {
            const file = e.target.files[0];
            if (file && this.vjMixer && this.vjMixer.layerManager) {
                this.vjMixer.layerManager.setLayerVideo(layer, file);
            }
        };
        input.click();
    }
    
    toggleOutputWindow() {
        if (this.outputWindow && !this.outputWindow.closed) {
            this.outputWindow.close();
            this.outputWindow = null;
        } else {
            this.outputWindow = window.open('', 'VJ_Output', 
                 'width=1920,height=1080,toolbar=no,menubar=no,scrollbars=no');
            
            this.outputWindow.document.write(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>VJ Output</title>
                    <style>
                        body { margin: 0; padding: 0; background: black; }
                        canvas { display: block; width: 100vw; height: 100vh; }
                    </style>
                </head>
                <body>
                    <canvas id="output-canvas" width="1920" height="1080"></canvas>
                </body>
                </html>
            `);
            
            this.outputWindow.document.close();
            
            // Setup output canvas
            if (this.outputWindow.document && this.vjMixer && this.vjMixer.videoEngine) {
                const outputCanvas = this.outputWindow.document.getElementById('output-canvas');
                 if (outputCanvas) this.vjMixer.videoEngine.setOutputCanvas(outputCanvas);
            }
        }
    }
    
    toggleFullscreen() {
        if (document.fullscreenElement) {
            document.exitFullscreen();
        } else {
            document.documentElement.requestFullscreen();
        }
    }
    
    showErrorMessage(message) {
        // This is a basic error message, doesn't strictly need DOM checks here for robustness against missing body
        const errorDiv = document.createElement('div');
        errorDiv.className = 'error-message';
        errorDiv.textContent = message;
        document.body.appendChild(errorDiv);
        
        setTimeout(() => {
            if (errorDiv.parentNode) {
                errorDiv.parentNode.removeChild(errorDiv);
            }
        }, 3000);
    }
    
    showNotification(message, type = 'info', duration = 3000) {
        const notification = document.createElement('div');
        notification.className = `notification ${type} enhanced`;
        
        const icons = {
            info: '💡',
            success: '✨',
            warning: '⚠️',
            error: '❌',
            performance: '⚡'
        };
        
        notification.innerHTML = `
            <div class="notification-content">
                <span class="notification-icon">${icons[type] || icons.info}</span>
                <span class="notification-text">${message}</span>
                <div class="notification-progress"></div>
            </div>
        `;
        
        const container = this.getOrCreateNotificationContainer();
        if (container) {
            container.appendChild(notification);
        }
        
        // Enhanced animation with progress bar
        setTimeout(() => {
            notification.classList.add('show');
            this.triggerAdvancedHaptic(type === 'error' ? 'error' : 'success');
            
            // Animate progress bar
            const progress = notification.querySelector('.notification-progress');
            progress.style.animation = `notificationProgress ${duration}ms linear`;
        }, 10);
        
        setTimeout(() => {
            notification.classList.remove('show');
            notification.classList.add('fade-out');
            setTimeout(() => notification.remove(), 300);
        }, duration);
        
        // Auto-cleanup excess notifications
        this.cleanupNotifications(container);
    }
    
    getOrCreateNotificationContainer() {
        let container = document.getElementById('notification-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'notification-container';
             container.classList.add('notification-container', 'enhanced');
             // Add check before appending to body
            if (!document.body) return null; // Or handle gracefully
            document.body.appendChild(container);
        }
        return container;
    }
    
    cleanupNotifications(container) {
        const notifications = container.querySelectorAll('.notification');
        if (!container || !notifications) return;

        if (notifications.length > 4 && notifications[0]) {
            notifications[0].classList.add('fade-out');
            setTimeout(() => notifications[0].remove(), 200);
        }
    }
    
    setupNotificationSystem() {
        if (document.getElementById('notification-container')) return;
        
        const notificationContainer = document.createElement('div');
        notificationContainer.id = 'notification-container';
        notificationContainer.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 1004;
            pointer-events: none;
        `;
        document.body.appendChild(notificationContainer);
    }
    
    togglePerformanceMode(enabled) {
        this.isPerformanceMode = enabled;
        document.body.classList.toggle('performance-mode', enabled);
        
        if (enabled) {
            this.showNotification('Performance mode activated', 'info');
            // Reduce visual effects for better performance
            document.documentElement.style.setProperty('--animation-duration', '0.1s');
        } else {
            this.showNotification('Performance mode deactivated', 'info');
            document.documentElement.style.setProperty('--animation-duration', '0.3s');
        }
    }
}