class VideoEngine {
    constructor() {
        this.canvas = null;
        this.gl = null;
        this.outputCanvas = null;
        this.outputGl = null;
        this.program = null;
        this.shaderManager = null;
        this.layers = [];
        this.activeEffects = new Set();
        this.initialized = false;
        this.frameCount = 0;
        this.lastFrameTime = 0;
        this.fps = 0;
        this.crossfader = 0.5;
        this.masterOpacity = 1.0;
        this.contextLost = false;
        this.frameDropCount = 0;
        this.targetFPS = 60;
        this.beatDetector = new BeatDetector();
        this.autoSyncEnabled = false;
        this.visualizerEnabled = true;
        this.frameBuffer = null;
        this.postProcessingTexture = null;
        this.qualityMode = 'auto';
        this.adaptiveQuality = 1.0;
        this.lastRenderTime = 0;
        this.renderSkipFrames = 0;
        this.performanceStats = {
            avgFrameTime: 16.67,
            frameTimeHistory: [],
            renderCalls: 0,
            textureUpdates: 0
        };
        this.audioAnalyzer = new AudioAnalyzer();
        this.frameTimeTargets = {
            high: 16.67,    // 60fps
            medium: 33.33,  // 30fps  
            low: 50         // 20fps
        };
        this.dynamicQualityEnabled = true;
        this.memoryOptimizer = new MemoryOptimizer();
        this.audioBuffer = null;
        this.lastAudioUpdate = 0;
        this.audioUpdateInterval = 100; // Update audio analysis 10fps max
    }
    
    async init() {
        try {
            this.canvas = document.getElementById('preview-canvas');
            if (!this.canvas) {
                throw new Error('Preview canvas not found');
            }
            
            // Enhanced WebGL context with better performance settings
            const contextAttributes = {
                antialias: false,
                alpha: false,
                preserveDrawingBuffer: false,
                powerPreference: 'high-performance',
                premultipliedAlpha: false,
                stencil: false,
                depth: false
            };
            
            this.gl = this.canvas.getContext('webgl2', contextAttributes) || 
                     this.canvas.getContext('webgl', contextAttributes);
            
            if (!this.gl) {
                throw new Error('WebGL not supported');
            }
            
            // Enhanced WebGL optimization
            this.gl.disable(this.gl.DEPTH_TEST);
            this.gl.disable(this.gl.STENCIL_TEST);
            this.gl.disable(this.gl.CULL_FACE);
            this.gl.pixelStorei(this.gl.UNPACK_FLIP_Y_WEBGL, false);
            
            // Check for required extensions with fallbacks
            const optionalExtensions = ['OES_texture_float', 'OES_texture_half_float', 'WEBGL_lose_context'];
            optionalExtensions.forEach(ext => {
                const extension = this.gl.getExtension(ext);
                if (extension) {
                    console.log(`WebGL extension ${ext} enabled`);
                }
            });
            
            // Initialize shader manager with error handling
            if (!window.ShaderManager) {
                throw new Error('ShaderManager not found. Please check shader-manager.js');
            }
            this.shaderManager = new window.ShaderManager(this.gl);
            
            // Initialize shaders
            await this.initShaders();
            
            // Initialize audio analyzer
            await this.audioAnalyzer.init();
            
            // Initialize layers with better memory management
            for (let i = 0; i < 6; i++) {
                this.layers.push({
                    video: null,
                    texture: null,
                    opacity: 0,
                    blendMode: 'normal',
                    lastUpdateTime: 0,
                    needsUpdate: false,
                    texturePool: [],
                    isActive: false
                });
            }
            
            // Start optimized render loop
            this.startOptimizedRenderLoop();
            
            this.initialized = true;
            console.log('Video engine initialized with enhanced performance');
            
        } catch (error) {
            console.error('Video engine initialization error:', error);
            throw error;
        }
    }
    
    async initShaders() {
        console.log('Compiling shaders...');
        
        try {
            const vertexShaderSource = this.shaderManager.getVertexShaderSource();
            const fragmentShaderSource = this.getEnhancedFragmentShaderSource();
            
            this.program = this.shaderManager.createProgram(vertexShaderSource, fragmentShaderSource);
            
            if (!this.program) {
                throw new Error('Failed to create WebGL program');
            }
            
            console.log('Shaders compiled successfully');
            
            // Create geometry and frame buffer for post-processing
            this.createGeometry();
            this.createFrameBuffer();
            
        } catch (error) {
            console.error('Shader compilation failed:', error);
            throw new Error('Failed to compile shaders. Check console for details.');
        }
    }
    
    getEnhancedFragmentShaderSource() {
        return `
            precision mediump float;
            uniform sampler2D u_texture;
            uniform float u_opacity;
            uniform int u_effect;
            uniform float u_time;
            uniform float u_crossfader;
            uniform vec2 u_resolution;
            uniform float u_beat;
            uniform float u_bassLevel;
            uniform float u_trebleLevel;
            uniform float u_audioEnergy;
            uniform vec3 u_audioFrequencies;
            varying vec2 v_texCoord;
            
            // Enhanced noise function for better effects
            float noise(vec2 co) {
                return fract(sin(dot(co.xy, vec2(12.9898, 78.233))) * 43758.5453;
            }
            
            // Improved RGB shift with audio reactivity
            vec3 audioReactiveRGBShift(vec2 coord) {
                float intensity = 0.005 + u_audioEnergy * 0.015;
                float offset = intensity * (1.0 + u_beat * 0.5);
                
                float r = texture2D(u_texture, coord + vec2(offset, 0.0)).r;
                float g = texture2D(u_texture, coord).g;
                float b = texture2D(u_texture, coord - vec2(offset, 0.0)).b;
                
                // Add chromatic fringing based on frequencies
                r += u_audioFrequencies.x * 0.2;
                g += u_audioFrequencies.y * 0.2;
                b += u_audioFrequencies.z * 0.2;
                
                return vec3(r, g, b);
            }
            
            // Advanced glitch effect with audio synchronization
            vec3 advancedGlitchEffect(vec2 coord) {
                vec2 uv = coord;
                float time = u_time;
                float glitchIntensity = u_beat * 2.0 + u_audioEnergy;
                
                // Audio-reactive horizontal displacement
                if (u_audioFrequencies.x > 0.6) {
                    uv.x += sin(uv.y * 100.0 + time * 10.0) * 0.02 * glitchIntensity;
                }
                
                // Bass-reactive vertical displacement
                if (u_bassLevel > 0.7) {
                    uv.y += cos(uv.x * 80.0 + time * 8.0) * 0.015 * u_bassLevel;
                }
                
                // Digital noise overlay
                float noiseLevel = noise(uv * 800.0 + time) * u_audioEnergy;
                vec3 color = texture2D(u_texture, uv).rgb;
                
                // Audio-reactive color distortion
                if (u_beat > 0.8) {
                    color.r += sin(time * 40.0 + u_audioFrequencies.x * 10.0) * 0.3;
                    color.g += cos(time * 35.0 + u_audioFrequencies.y * 8.0) * 0.2;
                    color.b += sin(time * 30.0 + u_audioFrequencies.z * 12.0) * 0.25;
                }
                
                // Add digital noise
                color += vec3(noiseLevel * 0.1);
                
                return color;
            }
            
            // Frequency-reactive kaleidoscope
            vec3 frequencyKaleido(vec2 coord) {
                vec2 center = vec2(0.5, 0.5);
                vec2 uv = coord - center;
                
                float angle = atan(uv.y, uv.x) + u_time * (0.5 + u_beat);
                float radius = length(uv);
                
                // Dynamic segments based on audio frequencies
                float segments = 6.0 + u_audioFrequencies.x * 8.0 + u_bassLevel * 4.0;
                angle = floor(angle / (6.28318 / segments)) * (6.28318 / segments);
                
                // Multi-frequency scaling
                float scaleX = 1.0 + u_audioFrequencies.y * 0.3;
                float scaleY = 1.0 + u_audioFrequencies.z * 0.3;
                float beatScale = 1.0 + u_beat * 0.4;
                
                uv = vec2(cos(angle), sin(angle)) * radius * beatScale;
                uv.x *= scaleX;
                uv.y *= scaleY;
                uv += center;
                
                return texture2D(u_texture, uv).rgb;
            }
            
            // Audio-reactive zoom with frequency isolation
            vec3 frequencyZoom(vec2 coord) {
                vec2 center = vec2(0.5, 0.5);
                
                // Different zoom levels for different frequencies
                float bassZoom = 1.0 + u_bassLevel * 0.3;
                float midZoom = 1.0 + u_audioFrequencies.y * 0.2;
                float trebleZoom = 1.0 + u_trebleLevel * 0.15;
                
                float combinedZoom = bassZoom * midZoom * trebleZoom;
                combinedZoom *= (1.0 + sin(u_time * 3.0) * 0.1);
                
                vec2 uv = (coord - center) / combinedZoom + center;
                
                // Add slight rotation based on audio energy
                float rotation = u_audioEnergy * 0.1;
                float c = cos(rotation);
                float s = sin(rotation);
                mat2 rotMatrix = mat2(c, -s, s, c);
                uv = rotMatrix * (uv - center) + center;
                
                return texture2D(u_texture, uv).rgb;
            }
            
            // Enhanced strobe with frequency separation
            vec3 frequencyStrobe(vec2 coord) {
                vec3 color = texture2D(u_texture, coord).rgb;
                
                // Different strobe patterns for different frequencies
                float bassStrobe = step(0.7, sin(u_time * 20.0 + u_bassLevel * 30.0));
                float midStrobe = step(0.6, sin(u_time * 35.0 + u_audioFrequencies.y * 40.0));
                float trebleStrobe = step(0.5, sin(u_time * 50.0 + u_trebleLevel * 60.0));
                
                // Apply colored strobes
                color = mix(color, vec3(1.0, 0.2, 0.2), bassStrobe * u_bassLevel * 0.8);
                color = mix(color, vec3(0.2, 1.0, 0.2), midStrobe * u_audioFrequencies.y * 0.6);
                color = mix(color, vec3(0.2, 0.2, 1.0), trebleStrobe * u_trebleLevel * 0.7);
                
                return color;
            }
            
            void main() {
                vec3 color = texture2D(u_texture, v_texCoord).rgb;
                
                if (u_effect == 1) {
                    color = audioReactiveRGBShift(v_texCoord);
                } else if (u_effect == 2) {
                    float distortionAmount = 0.03 + u_audioEnergy * 0.02;
                    vec2 distortedCoord = v_texCoord + sin(v_texCoord * 15.0 + u_time * 2.0) * distortionAmount;
                    color = texture2D(u_texture, distortedCoord).rgb;
                } else if (u_effect == 3) {
                    color = 1.0 - color;
                    // Audio-reactive invert intensity
                    float invertStrength = 0.7 + u_beat * 0.3 + u_audioEnergy * 0.2;
                    color = mix(texture2D(u_texture, v_texCoord).rgb, color, invertStrength);
                } else if (u_effect == 4) {
                    color = advancedGlitchEffect(v_texCoord);
                } else if (u_effect == 5) {
                    color = frequencyKaleido(v_texCoord);
                } else if (u_effect == 6) {
                    float pixelSize = 0.02 + u_beat * 0.08 + u_audioEnergy * 0.05;
                    vec2 grid = floor(v_texCoord / pixelSize) * pixelSize;
                    color = texture2D(u_texture, grid).rgb;
                } else if (u_effect == 7) {
                    vec2 uv = v_texCoord;
                    if (uv.x > 0.5) uv.x = 1.0 - uv.x;
                    color = texture2D(u_texture, uv).rgb;
                } else if (u_effect == 8) {
                    // Enhanced color cycling with frequency separation
                    color = color * vec3(
                        1.0 + sin(u_time * 1.0 + u_bassLevel * 3.0) * 0.5,
                        1.0 + sin(u_time * 1.1 + u_audioFrequencies.y * 3.0) * 0.5,
                        1.0 + sin(u_time * 1.2 + u_trebleLevel * 3.0) * 0.5
                    );
                } else if (u_effect == 9) {
                    color = frequencyZoom(v_texCoord);
                } else if (u_effect == 10) {
                    color = frequencyStrobe(v_texCoord);
                }
                
                // Global audio enhancement
                if (u_audioEnergy > 0.5) {
                    color += vec3(0.05, 0.02, 0.01) * u_audioEnergy;
                }
                
                // Beat-reactive brightness boost
                if (u_beat > 0.7) {
                    color *= (1.0 + u_beat * 0.2);
                }
                
                gl_FragColor = vec4(color, u_opacity);
            }
        `;
    }
    
    createFrameBuffer() {
        try {
            this.frameBuffer = this.gl.createFramebuffer();
            this.postProcessingTexture = this.gl.createTexture();
            
            this.gl.bindTexture(this.gl.TEXTURE_2D, this.postProcessingTexture);
            this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RGBA, this.canvas.width, this.canvas.height, 0, this.gl.RGBA, this.gl.UNSIGNED_BYTE, null);
            this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR);
            this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.LINEAR);
            
            this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, this.frameBuffer);
            this.gl.framebufferTexture2D(this.gl.FRAMEBUFFER, this.gl.COLOR_ATTACHMENT0, this.gl.TEXTURE_2D, this.postProcessingTexture, 0);
            
            this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
            
        } catch (error) {
            console.warn('Failed to create frame buffer for post-processing:', error);
        }
    }
    
    createGeometry() {
        try {
            // Create quad vertices
            const vertices = new Float32Array([
                -1, -1, 0, 0,
                 1, -1, 1, 0,
                -1,  1, 0, 1,
                 1,  1, 1, 1
            ]);
            
            const buffer = this.gl.createBuffer();
            if (!buffer) {
                throw new Error('Failed to create vertex buffer');
            }
            
            this.gl.bindBuffer(this.gl.ARRAY_BUFFER, buffer);
            this.gl.bufferData(this.gl.ARRAY_BUFFER, vertices, this.gl.STATIC_DRAW);
            
            // Get attribute locations
            const positionLocation = this.gl.getAttribLocation(this.program, 'a_position');
            const texCoordLocation = this.gl.getAttribLocation(this.program, 'a_texCoord');
            
            if (positionLocation === -1 || texCoordLocation === -1) {
                throw new Error('Failed to get shader attribute locations');
            }
            
            // Setup attributes
            this.gl.enableVertexAttribArray(positionLocation);
            this.gl.vertexAttribPointer(positionLocation, 2, this.gl.FLOAT, false, 16, 0);
            
            this.gl.enableVertexAttribArray(texCoordLocation);
            this.gl.vertexAttribPointer(texCoordLocation, 2, this.gl.FLOAT, false, 16, 8);
            
        } catch (error) {
            console.error('Geometry creation failed:', error);
            throw error;
        }
    }
    
    setLayerVideo(layerIndex, video) {
        if (layerIndex >= 0 && layerIndex < this.layers.length) {
            this.layers[layerIndex].video = video;
            video.play();
        }
    }
    
    setLayerOpacity(layerIndex, opacity) {
        if (layerIndex >= 0 && layerIndex < this.layers.length) {
            this.layers[layerIndex].opacity = opacity;
        }
    }
    
    setLayerBlendMode(layerIndex, blendMode) {
        if (layerIndex >= 0 && layerIndex < this.layers.length) {
            this.layers[layerIndex].blendMode = blendMode;
        }
    }
    
    enableEffect(effectName) {
        this.activeEffects.add(effectName);
    }
    
    disableEffect(effectName) {
        this.activeEffects.delete(effectName);
    }
    
    clearEffects() {
        this.activeEffects.clear();
    }
    
    createTextureFromVideo(video) {
        const texture = this.gl.createTexture();
        this.gl.bindTexture(this.gl.TEXTURE_2D, texture);
        
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.LINEAR);
        
        this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RGB, this.gl.RGB, this.gl.UNSIGNED_BYTE, video);
        
        return texture;
    }
    
    updateTexture(texture, video) {
        this.gl.bindTexture(this.gl.TEXTURE_2D, texture);
        this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RGB, this.gl.RGB, this.gl.UNSIGNED_BYTE, video);
    }
    
    getEffectNumber(effectName) {
        const effects = {
            'rgbShift': 1,
            'distort': 2,
            'invert': 3,
            'glitch': 4,
            'kaleido': 5,
            'pixelate': 6,
            'mirror': 7,
            'color': 8,
            'zoom': 9,
            'strobe': 10
        };
        return effects[effectName] || 0;
    }
    
    setCrossfader(value) {
        this.crossfader = Math.max(0, Math.min(1, value));
    }
    
    setMasterOpacity(value) {
        this.masterOpacity = Math.max(0, Math.min(1, value));
    }
    
    render() {
        if (!this.initialized || this.contextLost || !this.gl || !this.program) return;
        
        const frameStart = performance.now();
        const deltaTime = frameStart - this.lastRenderTime;
        this.lastRenderTime = frameStart;
        
        // Enhanced performance monitoring with adaptive quality
        this.updatePerformanceStats(deltaTime);
        
        // Intelligent frame skipping based on performance budget
        if (this.shouldSkipFrameIntelligent(deltaTime)) {
            return;
        }
        
        // Memory optimization every 5 seconds
        if (frameStart % 5000 < 100) {
            this.memoryOptimizer.optimize(this.layers);
        }
        
        if (frameStart - this.lastFrameTime >= 1000) {
            this.fps = Math.round(this.frameCount * 1000 / (frameStart - this.lastFrameTime));
            this.frameCount = 0;
            this.lastFrameTime = frameStart;
            
            // Adaptive quality adjustment
            this.adjustAdaptiveQuality();
        }
        this.frameCount++;
        
        try {
            // Render with performance budgeting
            const renderBudget = this.calculateRenderBudget();
            this.renderWithBudget(renderBudget);
            
        } catch (error) {
            console.error('Enhanced render error:', error);
            this.handleRenderError();
        }
    }
    
    updatePerformanceStats(deltaTime) {
        this.performanceStats.frameTimeHistory.push(deltaTime);
        if (this.performanceStats.frameTimeHistory.length > 60) {
            this.performanceStats.frameTimeHistory.shift();
        }
        
        this.performanceStats.avgFrameTime = this.performanceStats.frameTimeHistory.reduce((a, b) => a + b, 0) / 
                                           this.performanceStats.frameTimeHistory.length;
    }
    
    shouldSkipFrameIntelligent(deltaTime) {
        const targetFrameTime = this.frameTimeTargets[this.qualityMode] || this.frameTimeTargets.medium;
        
        // Skip frames if we're consistently behind
        if (this.performanceStats.avgFrameTime > targetFrameTime * 1.5) {
            this.renderSkipFrames++;
            return this.renderSkipFrames % 2 === 0; // Skip every other frame
        }
        
        // Skip frames if memory is high
        if (performance.memory && performance.memory.usedJSHeapSize > 300 * 1024 * 1024) {
            return Math.random() < 0.3; // Skip 30% of frames
        }
        
        return false;
    }
    
    calculateRenderBudget() {
        const targetFrameTime = this.frameTimeTargets[this.qualityMode] || 33.33;
        const avgFrameTime = this.performanceStats.avgFrameTime;
        
        return {
            canRenderAllLayers: avgFrameTime < targetFrameTime * 0.8,
            canUpdateAllTextures: avgFrameTime < targetFrameTime * 0.6,
            canApplyComplexEffects: avgFrameTime < targetFrameTime * 0.7,
            maxActiveLayers: avgFrameTime < 20 ? 6 : avgFrameTime < 35 ? 4 : 2
        };
    }
    
    renderWithBudget(budget) {
        if (!this.gl || !this.program) return;
        
        this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
        this.gl.clearColor(0, 0, 0, 1);
        this.gl.clear(this.gl.COLOR_BUFFER_BIT);
        
        this.gl.useProgram(this.program);
        this.gl.enable(this.gl.BLEND);
        
        const time = performance.now() / 1000;
        
        // Optimized audio analysis - update less frequently
        let audioData, beatData;
        if (time - this.lastAudioUpdate > this.audioUpdateInterval / 1000) {
            audioData = this.audioAnalyzer.getAudioData();
            beatData = this.beatDetector.analyze();
            this.audioBuffer = { audioData, beatData };
            this.lastAudioUpdate = time;
        } else {
            audioData = this.audioBuffer?.audioData || this.audioAnalyzer.getAudioData();
            beatData = this.audioBuffer?.beatData || this.beatDetector.analyze();
        }
        
        // Enhanced uniforms with performance consideration
        this.setUniformsOptimized(time, audioData, beatData);
        
        // Render layers with budget constraints
        this.renderLayersWithBudget(budget, beatData, audioData, time);
        
        this.gl.disable(this.gl.BLEND);
        
        // Render to output if available and budget allows
        if (this.outputGl && this.outputCanvas && budget.canRenderAllLayers) {
            this.renderToCanvas(this.outputGl, this.outputCanvas);
        }
    }
    
    setUniformsOptimized(time, audioData, beatData) {
        // Batch uniform updates for better performance
        const uniforms = {
            'u_time': time,
            'u_crossfader': this.crossfader,
            'u_resolution': [this.canvas.width, this.canvas.height],
            'u_beat': beatData.beat,
            'u_bassLevel': beatData.bassLevel,
            'u_trebleLevel': beatData.trebleLevel,
            'u_audioEnergy': audioData.energy,
            'u_audioFrequencies': [audioData.bass, audioData.mid, audioData.treble]
        };
        
        Object.entries(uniforms).forEach(([name, value]) => {
            this.setUniform(this.gl, name, value);
        });
    }
    
    renderLayersWithBudget(budget, beatData, audioData, time) {
        let activeLayerCount = 0;
        const maxLayers = Math.min(budget.maxActiveLayers, this.layers.length);
        
        // Sort layers by opacity for priority rendering
        const sortedLayers = this.layers
            .map((layer, index) => ({ layer, index }))
            .filter(({ layer }) => layer.video && layer.opacity > 0.01)
            .sort((a, b) => b.layer.opacity - a.layer.opacity)
            .slice(0, maxLayers);
        
        sortedLayers.forEach(({ layer, index }) => {
            if (layer.video?.readyState >= layer.video.HAVE_CURRENT_DATA && activeLayerCount < maxLayers) {
                activeLayerCount++;
                layer.isActive = true;
                
                // Smart texture updating based on budget
                if (budget.canUpdateAllTextures || activeLayerCount <= 2) {
                    const updateRate = this.getOptimizedTextureUpdateRate();
                    if (this.shouldUpdateTexture(layer, updateRate)) {
                        this.updateLayerTexture(layer);
                    }
                }
                
                const effectiveOpacity = this.calculateEffectiveOpacity(layer, index, beatData, audioData, time);
                
                if (effectiveOpacity > 0.01) {
                    this.renderLayerOptimized(layer, effectiveOpacity, index, budget);
                }
            } else {
                layer.isActive = false;
            }
        });
        
        // Performance optimization suggestions
        if (activeLayerCount > 4 && this.fps < 45) {
            this.suggestPerformanceOptimization();
        }
    }
    
    renderLayerOptimized(layer, effectiveOpacity, layerIndex, budget) {
        // Simplified blend mode for performance
        this.setBlendModeOptimized(layer.blendMode, budget);
        
        this.setUniform(this.gl, 'u_opacity', effectiveOpacity);
        
        const textureLocation = this.gl.getUniformLocation(this.program, 'u_texture');
        if (textureLocation) this.gl.uniform1i(textureLocation, 0);
        
        // Conditional effect application based on budget
        const effectNumber = budget.canApplyComplexEffects ? 
            this.getActiveEffectNumber(layerIndex) : 0;
        
        const effectLocation = this.gl.getUniformLocation(this.program, 'u_effect');
        if (effectLocation) this.gl.uniform1i(effectLocation, effectNumber);
        
        this.gl.activeTexture(this.gl.TEXTURE0);
        this.gl.bindTexture(this.gl.TEXTURE_2D, layer.texture);
        
        this.gl.drawArrays(this.gl.TRIANGLE_STRIP, 0, 4);
    }
    
    setBlendModeOptimized(blendMode, budget) {
        // Use simpler blend modes when performance is constrained
        if (!budget.canApplyComplexEffects) {
            this.gl.blendFunc(this.gl.SRC_ALPHA, this.gl.ONE_MINUS_SRC_ALPHA);
            return;
        }
        
        this.setBlendMode(this.gl, blendMode);
    }
    
    setBlendMode(gl, blendMode) {
        if (blendMode === 'normal') {
            gl.blendFunc(gl.ONE, gl.ZERO);
        } else if (blendMode === 'add') {
            gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
        } else if (blendMode === 'subtract') {
            gl.blendFunc(gl.ZERO, gl.SRC_COLOR);
        } else if (blendMode === 'multiply') {
            gl.blendFunc(gl.ZERO, gl.SRC_COLOR);
        } else {
            gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        }
    }
    
    shouldUpdateTexture(layer, updateRate) {
        const currentTime = layer.video.currentTime;
        const timeDelta = Math.abs(currentTime - (layer.lastUpdateTime || 0));
        return !layer.lastUpdateTime || (timeDelta > updateRate && !layer.video.paused);
    }
    
    updateLayerTexture(layer) {
        if (!layer.texture) {
            layer.texture = this.createTextureFromVideo(layer.video);
        } else {
            this.updateTexture(layer.texture, layer.video);
        }
        layer.lastUpdateTime = layer.video.currentTime;
        this.performanceStats.textureUpdates++;
    }
    
    calculateEffectiveOpacity(layer, index, beatData, audioData, time) {
        let effectiveOpacity = layer.opacity;
        let crossfaderValue = this.crossfader;
        
        // Auto-sync crossfader to beat if enabled
        if (this.autoSyncEnabled && beatData.beat > 0.8) {
            crossfaderValue = Math.abs(Math.sin(time * 0.5 + audioData.energy));
        }
        
        // Enhanced crossfader curves
        const crossfaderSmooth = this.smoothstep(0, 1, crossfaderValue);
        
        if (index < 3) {
            effectiveOpacity *= Math.pow(1.0 - crossfaderSmooth, 1.5);
        } else {
            effectiveOpacity *= Math.pow(crossfaderSmooth, 1.5);
        }
        effectiveOpacity *= this.masterOpacity;
        
        // Audio-reactive opacity boost
        if (audioData.energy > 0.6) {
            effectiveOpacity = Math.min(1.0, effectiveOpacity * (1.0 + audioData.energy * 0.3));
        }
        
        return effectiveOpacity;
    }
    
    getActiveEffectNumber(layerIndex) {
        const activeEffectsArray = Array.from(this.activeEffects);
        if (activeEffectsArray.length === 0) return 0;
        
        // Layer-specific effect cycling
        const effectIndex = (layerIndex + Math.floor(performance.now() / 2000)) % activeEffectsArray.length;
        return this.getEffectNumber(activeEffectsArray[effectIndex]);
    }
    
    getOptimizedTextureUpdateRate() {
        const baseRates = {
            high: 0.016,    // 60fps
            medium: 0.033,  // 30fps
            low: 0.066,     // 15fps
            auto: 0.033 / Math.max(0.3, this.adaptiveQuality)
        };
        
        const rate = baseRates[this.qualityMode] || baseRates.auto;
        
        // Further optimization based on active layers
        const activeLayers = this.layers.filter(l => l.isActive).length;
        return rate * Math.max(1, activeLayers / 4);
    }
    
    suggestPerformanceOptimization() {
        if (window.vjMixer?.uiManager && Math.random() < 0.1) { // Only show occasionally
            window.vjMixer.uiManager.showNotification(
                'Consider reducing active layers or effects for better performance', 
                'warning', 
                4000
            );
        }
    }
    
    startOptimizedRenderLoop() {
        let lastFrameRequest = 0;
        
        const renderLoop = (timestamp) => {
            // Throttle render loop based on performance
            const minFrameInterval = 1000 / this.targetFPS;
            if (timestamp - lastFrameRequest >= minFrameInterval) {
                this.render();
                lastFrameRequest = timestamp;
            }
            requestAnimationFrame(renderLoop);
        };
        
        requestAnimationFrame(renderLoop);
    }
    
    setOutputCanvas(canvas) {
        this.outputCanvas = canvas;
        this.outputGl = canvas.getContext('webgl2') || canvas.getContext('webgl');
        
        if (this.outputGl) {
            // Copy program and setup for output canvas
            this.outputGl.useProgram(this.program);
            this.createGeometry(); // This will work on the current GL context
        }
    }
    
    resize() {
        if (this.canvas) {
            const rect = this.canvas.getBoundingClientRect();
            this.canvas.width = rect.width;
            this.canvas.height = rect.height;
        }
    }
    
    getFPS() {
        return this.fps;
    }
    
    getPerformanceStats() {
        return {
            ...this.performanceStats,
            fps: this.fps,
            adaptiveQuality: this.adaptiveQuality,
            activeLayers: this.layers.filter(l => l.isActive).length
        };
    }
    
    dispose() {
        // Clean up resources
        this.layers.forEach(layer => {
            if (layer.texture) {
                this.gl.deleteTexture(layer.texture);
            }
        });
        
        if (this.frameBuffer) {
            this.gl.deleteFramebuffer(this.frameBuffer);
        }
        
        if (this.postProcessingTexture) {
            this.gl.deleteTexture(this.postProcessingTexture);
        }
        
        if (this.shaderManager) {
            this.shaderManager.dispose();
        }
    }
}

// Enhanced BeatDetector with real audio analysis
class BeatDetector {
    constructor() {
        this.audioContext = null;
        this.analyser = null;
        this.dataArray = null;
        this.initialized = false;
        this.beatThreshold = 0.7;
        this.lastBeatTime = 0;
        this.beatInterval = 400;
        this.energyHistory = [];
        this.bassHistory = [];
        this.trebleHistory = [];
    }
    
    async init() {
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.analyser = this.audioContext.createAnalyser();
            this.analyser.fftSize = 512;
            this.analyser.smoothingTimeConstant = 0.8;
            this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
            
            // Try to get audio from active video layers
            this.connectToAudio();
            
            this.initialized = true;
            console.log('Enhanced beat detector initialized');
        } catch (error) {
            console.warn('Beat detection not available:', error);
        }
    }
    
    connectToAudio() {
        // This would connect to the audio context from video layers
        // For now, we'll simulate beat detection
    }
    
    analyze() {
        if (!this.initialized) {
            return this.getSimulatedData();
        }
        
        this.analyser.getByteFrequencyData(this.dataArray);
        
        // Calculate frequency bands
        const bassEnd = Math.floor(this.dataArray.length * 0.1);
        const midEnd = Math.floor(this.dataArray.length * 0.5);
        
        let bassLevel = 0;
        let midLevel = 0;
        let trebleLevel = 0;
        
        // Bass (0-10%)
        for (let i = 0; i < bassEnd; i++) {
            bassLevel += this.dataArray[i];
        }
        bassLevel = (bassLevel / bassEnd) / 255;
        
        // Mid (10-50%)
        for (let i = bassEnd; i < midEnd; i++) {
            midLevel += this.dataArray[i];
        }
        midLevel = (midLevel / (midEnd - bassEnd)) / 255;
        
        // Treble (50-100%)
        for (let i = midEnd; i < this.dataArray.length; i++) {
            trebleLevel += this.dataArray[i];
        }
        trebleLevel = (trebleLevel / (this.dataArray.length - midEnd)) / 255;
        
        // Beat detection with history
        this.updateHistory(bassLevel, midLevel, trebleLevel);
        const beat = this.detectBeat(bassLevel);
        
        return {
            beat: beat,
            bassLevel: bassLevel,
            trebleLevel: trebleLevel,
            midLevel: midLevel,
            energy: (bassLevel + midLevel + trebleLevel) / 3
        };
    }
    
    updateHistory(bass, mid, treble) {
        this.bassHistory.push(bass);
        this.energyHistory.push((bass + mid + treble) / 3);
        this.trebleHistory.push(treble);
        
        if (this.bassHistory.length > 20) {
            this.bassHistory.shift();
            this.energyHistory.shift();
            this.trebleHistory.shift();
        }
    }
    
    detectBeat(currentBass) {
        if (this.bassHistory.length < 10) return 0;
        
        const avgBass = this.bassHistory.reduce((a, b) => a + b, 0) / this.bassHistory.length;
        const variance = this.bassHistory.reduce((sum, val) => sum + Math.pow(val - avgBass, 2), 0) / this.bassHistory.length;
        const threshold = avgBass + Math.sqrt(variance) * 1.5;
        
        const time = performance.now();
        if (currentBass > threshold && (time - this.lastBeatTime > this.beatInterval)) {
            this.lastBeatTime = time;
            return 1.0;
        }
        
        return 0.0;
    }
    
    getSimulatedData() {
        // Enhanced simulation with more realistic patterns
        const time = performance.now();
        const beatPattern = Math.sin(time * 0.002) > 0.7;
        const bassLevel = Math.abs(Math.sin(time * 0.0008)) * 0.9;
        const trebleLevel = Math.abs(Math.cos(time * 0.003)) * 0.7;
        const midLevel = Math.abs(Math.sin(time * 0.0015)) * 0.8;
        
        const currentBeat = beatPattern && (time - this.lastBeatTime > this.beatInterval) ? 1.0 : 0.0;
        if (currentBeat > 0) {
            this.lastBeatTime = time;
        }
        
        return {
            beat: currentBeat,
            bassLevel: bassLevel,
            trebleLevel: trebleLevel,
            midLevel: midLevel,
            energy: (bassLevel + midLevel + trebleLevel) / 3
        };
    }
}

// New AudioAnalyzer class for comprehensive audio analysis
class AudioAnalyzer {
    constructor() {
        this.audioContext = null;
        this.analyser = null;
        this.dataArray = null;
        this.initialized = false;
        this.frequencyBands = {
            bass: { start: 0, end: 0 },
            mid: { start: 0, end: 0 },
            treble: { start: 0, end: 0 }
        };
    }
    
    async init() {
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.analyser = this.audioContext.createAnalyser();
            this.analyser.fftSize = 1024;
            this.analyser.smoothingTimeConstant = 0.7;
            this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
            
            // Calculate frequency bands
            const nyquist = this.audioContext.sampleRate / 2;
            const binSize = nyquist / this.analyser.frequencyBinCount;
            
            this.frequencyBands.bass.end = Math.floor(250 / binSize);
            this.frequencyBands.mid.start = this.frequencyBands.bass.end;
            this.frequencyBands.mid.end = Math.floor(4000 / binSize);
            this.frequencyBands.treble.start = this.frequencyBands.mid.end;
            this.frequencyBands.treble.end = this.analyser.frequencyBinCount;
            
            this.initialized = true;
            console.log('Audio analyzer initialized with frequency bands:', this.frequencyBands);
        } catch (error) {
            console.warn('Audio analyzer not available:', error);
        }
    }
    
    getAudioData() {
        if (!this.initialized) {
            return this.getSimulatedAudioData();
        }
        
        this.analyser.getByteFrequencyData(this.dataArray);
        
        const bass = this.calculateBandLevel(this.frequencyBands.bass);
        const mid = this.calculateBandLevel(this.frequencyBands.mid);
        const treble = this.calculateBandLevel(this.frequencyBands.treble);
        const energy = (bass + mid + treble) / 3;
        
        return { bass, mid, treble, energy };
    }
    
    calculateBandLevel(band) {
        let sum = 0;
        const count = band.end - band.start;
        
        for (let i = band.start; i < band.end; i++) {
            sum += this.dataArray[i];
        }
        
        return (sum / count) / 255;
    }
    
    getSimulatedAudioData() {
        const time = performance.now() * 0.001;
        return {
            bass: Math.abs(Math.sin(time * 0.8)) * 0.9,
            mid: Math.abs(Math.sin(time * 1.2)) * 0.8,
            treble: Math.abs(Math.sin(time * 1.8)) * 0.7,
            energy: Math.abs(Math.sin(time)) * 0.8
        };
    }
}

// Enhanced Memory Optimizer
class MemoryOptimizer {
    constructor() {
        this.lastOptimization = 0;
        this.optimizationInterval = 5000; // 5 seconds
        this.memoryThreshold = 200 * 1024 * 1024; // 200MB
    }
    
    optimize(layers) {
        const now = performance.now();
        if (now - this.lastOptimization < this.optimizationInterval) return;
        
        this.lastOptimization = now;
        
        // Clean up unused textures
        layers.forEach(layer => {
            if (!layer.isActive && layer.texture) {
                // Don't immediately delete, but mark for cleanup
                layer.textureCleanupTime = now + 10000; // Clean after 10s of inactivity
            }
            
            if (layer.textureCleanupTime && now > layer.textureCleanupTime) {
                // Texture cleanup would go here if we had gl context
                layer.textureCleanupTime = null;
            }
        });
        
        // Suggest garbage collection if memory is high
        if (performance.memory && performance.memory.usedJSHeapSize > this.memoryThreshold) {
            // Force garbage collection if available
            if (window.gc) {
                window.gc();
            }
            console.log('Memory optimization triggered');
        }
    }
}

// Make classes globally available
window.VideoEngine = VideoEngine;
window.BeatDetector = BeatDetector;
window.AudioAnalyzer = AudioAnalyzer;