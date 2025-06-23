class PerformanceMonitor {
    constructor(videoEngine) {
        this.videoEngine = videoEngine;
        this.metrics = {
            frameDrops: 0,
            memoryUsage: 0,
            lastUpdate: 0,
            fps: 0,
            activeLayers: 0
        };
        this.monitoring = false;
        this.updateInterval = null;
    }
    
    start() {
        if (this.monitoring) return;
        
        this.monitoring = true;
        this.setupUI();
        this.updateInterval = setInterval(() => {
            this.updateMetrics();
        }, 1000);
    }
    
    stop() {
        if (!this.monitoring) return;
        
        this.monitoring = false;
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }
    }
    
    setupUI() {
        const existing = document.getElementById('performance-monitor');
        if (existing) return;
        
        const monitor = document.createElement('div');
        monitor.id = 'performance-monitor';
        monitor.innerHTML = `
            <div class="fps-counter">FPS: <span id="fps-value">0</span></div>
            <div class="layer-count">Active: <span id="active-layers">0</span></div>
            <div class="memory-usage">Memory: <span id="memory-usage">0MB</span>
                <div class="performance-indicator good" id="memory-indicator"></div>
            </div>
            <div class="frame-drops">Drops: <span id="frame-drops">0</span>
                <div class="performance-indicator good" id="performance-indicator"></div>
            </div>
        `;
        
        const header = document.getElementById('header');
        if (header) {
            header.appendChild(monitor);
        }
    }
    
    updateMetrics() {
        try {
            // FPS monitoring
            let currentFPS = 0;
            if (this.videoEngine) {
 currentFPS = this.videoEngine.getFPS();
            }
            this.metrics.fps = currentFPS;
            
            const fpsElement = document.getElementById('fps-value');
            if (fpsElement) {
                fpsElement.textContent = currentFPS;
            }
            
            // Memory usage monitoring
            if (performance.memory) {
                const memoryMB = Math.round(performance.memory.usedJSHeapSize / 1024 / 1024);
                this.metrics.memoryUsage = memoryMB;
                
                const memoryElement = document.getElementById('memory-usage');
                if (memoryElement) {
                    memoryElement.textContent = memoryMB + 'MB';
                }
                
                const memoryIndicator = document.getElementById('memory-indicator');
                if (memoryIndicator) {
                    memoryIndicator.className = 'performance-indicator ' + 
                        (memoryMB > 200 ? 'critical' : memoryMB > 100 ? 'warning' : 'good');
                }
            }
            
            // Frame drop detection
            if (currentFPS < 50 && currentFPS > 0) {
                this.metrics.frameDrops++;
            }
            
            const frameDropsElement = document.getElementById('frame-drops');
            if (frameDropsElement) {
                frameDropsElement.textContent = this.metrics.frameDrops;
            }
            
            const perfIndicator = document.getElementById('performance-indicator');
            if (perfIndicator) {
                perfIndicator.className = 'performance-indicator ' + 
                    (currentFPS < 30 ? 'critical' : currentFPS < 50 ? 'warning' : 'good');
            }
            
            // Active layer count
            if (window.vjMixer && window.vjMixer.layerManager && window.vjMixer.layerManager.layers) {
                const activeLayers = window.vjMixer.layerManager.layers.filter(l => l.opacity > 0 && l.video).length;
                this.metrics.activeLayers = activeLayers;
                
                const activeLayersElement = document.getElementById('active-layers');
                // Check if the element exists before accessing textContent
                if (!activeLayersElement) {
                    console.warn("Performance monitor element 'active-layers' not found.");
                }
                if (activeLayersElement) {
                    activeLayersElement.textContent = activeLayers;
                }
                
                if (activeLayers > 4 && window.vjMixer.uiManager) {
                    window.vjMixer.uiManager.showNotification('High layer count may affect performance', 'warning');
                }
            }
            
        } catch (error) {
            console.warn('Performance monitoring error:', error);
        }
    }
    
    getMetrics() {
        return { ...this.metrics };
    }
    
    resetCounters() {
        this.metrics.frameDrops = 0;
        this.metrics.lastUpdate = performance.now();
    }
}