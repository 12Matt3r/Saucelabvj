class LayerManager {
    constructor(videoEngine) {
        this.videoEngine = videoEngine;
        this.layers = [];
        this.maxLayers = 6;
        this.currentLayer = 0;
    }
    
    init() {
        // Create layer controls
        const layersContainer = document.getElementById('layers-container');
        
        for (let i = 0; i < this.maxLayers; i++) {
            const layer = this.createLayerControl(i);
            this.layers.push({
                id: i,
                video: null,
                opacity: 0,
                blendMode: 'normal',
                hotCues: [],
                element: layer,
                solo: false,
                touchStartTime: 0,
                syncToSequencer: false
            });
            layersContainer.appendChild(layer);
        }
        
        // Set first layer as active
        if (this.layers.length > 0) {
            this.setActiveLayer(0);
        }
    }
    
    createLayerControl(index) {
        const layer = document.createElement('div');
        layer.className = 'layer assignable';
        layer.dataset.layer = index;
        
        layer.innerHTML = `
            <div class="layer-header">
                <span>Layer ${index + 1}</span>
                <button class="layer-solo-btn assignable" data-action="solo" data-layer="${index}">SOLO</button>
            </div>
            <div class="layer-preview assignable" data-action="load-video" data-layer="${index}">
                <span>Click to load video</span>
            </div>
            <div class="layer-controls">
                <div class="opacity-control">
                    <label>Opacity</label>
                    <input type="range" class="opacity-slider assignable" 
                           data-action="opacity" data-layer="${index}"
                           min="0" max="1" step="0.01" value="0" orient="vertical">
                    <span class="opacity-value">0%</span>
                </div>
                <select class="blend-select assignable" data-action="blend" data-layer="${index}">
                    <option value="normal">Normal</option>
                    <option value="add">Add</option>
                    <option value="screen">Screen</option>
                    <option value="multiply">Multiply</option>
                </select>
                <div class="hot-cues">
                    <button class="hot-cue-btn assignable" data-action="hot-cue" data-layer="${index}" data-cue="0">A</button>
                    <button class="hot-cue-btn assignable" data-action="hot-cue" data-layer="${index}" data-cue="1">B</button>
                    <button class="hot-cue-btn assignable" data-action="hot-cue" data-layer="${index}" data-cue="2">C</button>
                    <button class="hot-cue-btn assignable" data-action="hot-cue" data-layer="${index}" data-cue="3">D</button>
                </div>
            </div>
        `;
        
        return layer;
    }
    
    async setLayerVideo(layerIndex, file) {
        const layer = this.layers[layerIndex];
        const preview = layer.element.querySelector('.layer-preview');
        
        // Show loading state
        preview.innerHTML = '<div class="loading">Loading...</div>';
        preview.classList.add('loading-state');
        
        try {
            const video = document.createElement('video');
            video.src = URL.createObjectURL(file);
            video.loop = true;
            video.muted = true;
            
            await new Promise((resolve, reject) => {
                video.onloadeddata = resolve;
                video.onerror = reject;
                setTimeout(reject, 10000);
            });
            
            this.layers[layerIndex].video = video;
            this.layers[layerIndex].hotCues = [];
            
            // Update preview
            preview.innerHTML = '';
            preview.classList.remove('loading-state');
            const previewVideo = video.cloneNode();
            previewVideo.src = video.src;
            previewVideo.currentTime = video.currentTime;
            preview.appendChild(previewVideo);
            
            // Add file name overlay
            const fileName = document.createElement('div');
            fileName.className = 'file-name';
            fileName.textContent = file.name;
            preview.appendChild(fileName);
            
            // Add to video engine
            this.videoEngine.setLayerVideo(layerIndex, video);
            
            console.log(`Video loaded for layer ${layerIndex}: ${file.name}`);
            
        } catch (error) {
            console.error('Failed to load video:', error);
            preview.innerHTML = '<div class="error">Failed to load video</div>';
            preview.classList.remove('loading-state');
            preview.classList.add('error-state');
        }
    }
    
    setLayerOpacity(layerIndex, opacity) {
        this.layers[layerIndex].opacity = opacity;
        this.videoEngine.setLayerOpacity(layerIndex, opacity);
        
        // Update UI
        const opacityValue = this.layers[layerIndex].element.querySelector('.opacity-value');
        opacityValue.textContent = Math.round(opacity * 100) + '%';
        
        // Enhanced visual feedback
        const layer = this.layers[layerIndex].element;
        if (opacity > 0) {
            layer.classList.add('layer-active');
            layer.style.setProperty('--opacity-level', opacity);
        } else {
            layer.classList.remove('layer-active');
        }
    }
    
    setLayerBlendMode(layerIndex, blendMode) {
        this.layers[layerIndex].blendMode = blendMode;
        this.videoEngine.setLayerBlendMode(layerIndex, blendMode);
    }
    
    setActiveLayer(layerIndex) {
        // Remove active class from all layers
        this.layers.forEach(layer => layer.element.classList.remove('active'));
        
        // Add active class to selected layer
        this.layers[layerIndex].element.classList.add('active');
        this.currentLayer = layerIndex;
    }
    
    soloLayer(layerIndex) {
        const targetLayer = this.layers[layerIndex];
        const wasSolo = targetLayer.solo;
        
        // Toggle solo state
        this.layers.forEach((layer, index) => {
            layer.solo = index === layerIndex && !wasSolo;
            
            if (wasSolo) {
                // Restore previous opacity
                this.animateOpacity(index, layer.previousOpacity || 0);
            } else {
                // Set opacity based on solo state
                layer.previousOpacity = layer.opacity;
                const targetOpacity = layer.solo ? 1 : 0;
                this.animateOpacity(index, targetOpacity);
            }
            
            // Update UI
            const soloBtn = layer.element.querySelector('.layer-solo-btn');
            soloBtn.classList.toggle('active', layer.solo);
        });
    }
    
    animateOpacity(layerIndex, targetOpacity, duration = 1000) {
        const layer = this.layers[layerIndex];
        const startOpacity = layer.opacity;
        const startTime = performance.now();
        
        const animate = (currentTime) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            
            // Smooth easing
            const easeProgress = 1 - Math.pow(1 - progress, 3);
            const currentOpacity = startOpacity + (targetOpacity - startOpacity) * easeProgress;
            
            this.setLayerOpacity(layerIndex, currentOpacity);
            
            // Update slider
            const slider = layer.element.querySelector('.opacity-slider');
            slider.value = currentOpacity;
            
            if (progress < 1) {
                requestAnimationFrame(animate);
            }
        };
        
        requestAnimationFrame(animate);
    }
    
    triggerHotCue(layerIndex, cueIndex) {
        const layer = this.layers[layerIndex];
        if (layer.video && layer.hotCues[cueIndex] !== undefined) {
            layer.video.currentTime = layer.hotCues[cueIndex];
        } else if (layer.video) {
            // Record current time as hot cue
            layer.hotCues[cueIndex] = layer.video.currentTime;
            console.log(`Hot cue ${cueIndex} set at ${layer.video.currentTime}s for layer ${layerIndex}`);
        }
    }
    
    reset() {
        // Stop all videos
        this.layers.forEach(layer => {
            if (layer.video) {
                layer.video.pause();
                layer.video.src = '';
            }
            layer.opacity = 0;
            layer.blendMode = 'normal';
            layer.hotCues = [];
        });
        
        // Reset UI
        document.querySelectorAll('.opacity-slider').forEach(slider => {
            slider.value = 0;
        });
        
        document.querySelectorAll('.opacity-value').forEach(value => {
            value.textContent = '0%';
        });
        
        document.querySelectorAll('.blend-select').forEach(select => {
            select.value = 'normal';
        });
    }
    
    getLayers() {
        return this.layers;
    }
    
    getCurrentLayer() {
        return this.currentLayer;
    }
}