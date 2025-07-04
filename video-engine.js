1class VideoEngine {
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
        this.frameBuffer = null; // May be deprecated by new FBOs
        this.postProcessingTexture = null; // May be deprecated by new FBOs
        this.fboA = null;
        this.texA = null;
        this.fboB = null;
        this.texB = null;
        this.effectPrograms = {}; // To cache compiled effect programs
        this.vertexBuffer = null; // Added to store vertex buffer for disposal
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
        this.lastMemoryOptimizationTime = 0; // Added for MemoryOptimizer
        this.audioBuffer = null;
        this.lastAudioUpdate = 0;
        this.audioUpdateInterval = 100; // Update audio analysis 10fps max
        this.onPerformanceWarning = null; // Callback for performance warnings

        // New global controls from spec
        this.brightness = 0.0;
        this.contrast = 1.0;
        this.saturation = 1.0;
        this.motionThreshold = 0.12;
        this.trailPersistence = 0.9;
        this.hueShiftSpeed = 0.0;
        this.motionExtrapolation = 0.0;
        this.intensity = 0.5; // General intensity for effects that use it

        // Effect-specific controls
        this.effectControls = {
            datamosh: {
                intensity: 0.5,
                displacement: 0.01,
                feedback: 0.5
            },
            crt: {
                scanlineIntensity: 0.1,
                scanlineDensity: 250.0,
                curvatureAmount: 0.03,
                phosphorOffset: 0.002,
                vignetteStrength: 0.2,
                vignetteSoftness: 0.5
                },
                pixelsort: {
                    intensity: 0.5,
                    displacement: 0.02, // Small default, range 0-0.1 or similar
                    feedback: 0.0,
                    threshold: 0.5
                },
                feedback: {
                    intensity: 0.5,
                    displacement: 0.01, // Small warp
                    feedback: 0.85, // Strong feedback default
                    feedback_glowThreshold: 0.1 // Specific threshold for glow
                },
                feedbackDisplace: {
                    displacement_map_strength: 0.01, // Subtle default
                    intensity: 0.5 // Modulator for strength
                }
                // Add other new effects' controls here as they are implemented
            };

            this.texPrevFrame = null; // Texture to hold the output of the previous full frame for feedback effects
        this.fboPrevFrame = null; // FBO to render into texPrevFrame
    }

    smoothstep(edge0, edge1, x) {
        const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
        return t * t * (3 - 2 * t);
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
            // const fragmentShaderSource = this.getEnhancedFragmentShaderSource(); // Old way
            const fragmentShaderSource = this.shaderManager.getEnhancedFragmentShaderSource(); // New way
            
            this.program = this.shaderManager.createProgram(vertexShaderSource, fragmentShaderSource);
            
            if (!this.program) {
                throw new Error('Failed to create WebGL program');
            }
            
            console.log('Shaders compiled successfully');
            
            // const fragmentShaderSource = this.shaderManager.getEnhancedFragmentShaderSource(); // Old way for uber-shader
            // this.program = this.shaderManager.createProgram(vertexShaderSource, fragmentShaderSource); // Old uber-shader program
            // if (!this.program) {
            //     throw new Error('Failed to create WebGL program (uber-shader)');
            // }

            // Compile individual effect shaders
            const effectShaderSources = {
                passthrough: this.shaderManager.getPassthroughFragmentSource(),
                rgbShift: this.shaderManager.getRgbShiftFragmentSource(),
                distort: this.shaderManager.getDistortFragmentSource(),
                glitch: this.shaderManager.getGlitchFragmentSource(),
                invert: this.shaderManager.getInvertFragmentSource(),
                kaleido: this.shaderManager.getKaleidoFragmentSource(),
                pixelate: this.shaderManager.getPixelateFragmentSource(),
                mirror: this.shaderManager.getMirrorFragmentSource(),
                color: this.shaderManager.getColorFragmentSource(),      // Renamed from colorCycle
                zoom: this.shaderManager.getZoomFragmentSource(),        // Renamed from zoomPulse
                strobe: this.shaderManager.getStrobeFragmentSource(),
                finalPass: this.shaderManager.getFinalPassFragmentSource(),
                datamosh: this.shaderManager.getDatamoshFragmentSource(), // Added new Datamosh shader
                crt: this.shaderManager.getCRTFragmentSource(),           // Added new CRT shader
                pixelsort: this.shaderManager.getPixelSortFragmentSource(), // Added PixelSort
                feedback: this.shaderManager.getFeedbackFragmentSource(),   // Added Feedback
                feedbackDisplace: this.shaderManager.getFeedbackDisplaceFragmentSource(), // Added FeedbackDisplace
            };

            for (const effectName in effectShaderSources) {
                if (effectShaderSources.hasOwnProperty(effectName)) {
                    const fsSource = effectShaderSources[effectName];
                    const program = this.shaderManager.createProgram(vertexShaderSource, fsSource);
                    if (!program) {
                        throw new Error(`Failed to create program for effect: ${effectName}`);
                    }
                    this.effectPrograms[effectName] = program;
                }
            }

            // Ensure a default program exists if needed (e.g. passthrough might be the main one now)
            this.program = this.effectPrograms.passthrough; // Set a default program for geometry setup, etc.


            console.log('Individual effect shaders compiled successfully.');

            // Create geometry (used by all programs)
            this.createGeometry();

            // Create ping-pong framebuffers for multi-pass rendering
            const { fbo: fboA, texture: texA } = this._createFboAndTexture(this.canvas.width, this.canvas.height);
            this.fboA = fboA;
            this.texA = texA;
            const { fbo: fboB, texture: texB } = this._createFboAndTexture(this.canvas.width, this.canvas.height);
            this.fboB = fboB;
            this.texB = texB;

            // Initialize FBO for storing the previous frame's output (for feedback effects)
            const { fbo: fboPrev, texture: texPrev } = this._createFboAndTexture(this.canvas.width, this.canvas.height);
            this.fboPrevFrame = fboPrev;
            this.texPrevFrame = texPrev;
            // Initialize texPrevFrame with black or some default content?
            // For now, it will be empty until the first frame is copied.
            
            console.log('Shaders and FBOs (including prevFrame FBO) initialized for multi-pass rendering.');

        } catch (error) {
            console.error('Shader or FBO initialization failed:', error);
            // Ensure this error is specific enough or rethrow if main.js handles it.
            throw new Error(`Shader/FBO Init: ${error.message}`);
        }
    }
    
    _createFboAndTexture(width, height) {
        const gl = this.gl;
        const fbo = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);

        const texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);

        const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
        if (status !== gl.FRAMEBUFFER_COMPLETE) {
            console.error('FBO status incomplete: ' + status.toString() + ` for FBO for texture of size ${width}x${height}`);
            // Consider throwing an error here or returning nulls
            gl.deleteTexture(texture);
            gl.deleteFramebuffer(fbo);
            throw new Error('Framebuffer incomplete: ' + status.toString());
        }

        gl.bindTexture(gl.TEXTURE_2D, null);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        return { fbo, texture };
    }
    
    // Removed getEnhancedFragmentShaderSource() method from here. It's now in ShaderManager.

    // Old createFrameBuffer is replaced by _createFboAndTexture and specific FBO setup.
    // Commenting out the old one to avoid confusion.
    /*
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
    */
    
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
            this.vertexBuffer = buffer; // Store the reference
            
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
    
    // getEffectNumber(effectName) { // Obsolete with multi-pass rendering
    //     const effects = {
    //         'rgbShift': 1,
    //         'distort': 2,
    //         'invert': 3,
    //         'glitch': 4,
    //         'kaleido': 5,
    //         'pixelate': 6,
    //         'mirror': 7,
    //         'color': 8,
    //         'zoom': 9,
    //         'strobe': 10
    //     };
    //     return effects[effectName] || 0;
    // }
    
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
        
        // Memory optimization
        if (frameStart - this.lastMemoryOptimizationTime > this.memoryOptimizer.optimizationInterval) {
            this.memoryOptimizer.optimize(this.layers, this.gl); // Pass gl context
            this.lastMemoryOptimizationTime = frameStart;
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
        
        // Enhanced uniforms with performance consideration (will be set per program now)
        // this.setUniformsOptimized(time, audioData, beatData); // Old way for single program

        // 1. Render Layers to an FBO (e.g., fboA)
        // This part needs to be carefully designed. For now, assume `renderLayersToFBO`
        // handles compositing all video layers (with their opacities, blend modes, crossfader)
        // into this.fboA using their respective video textures and the passthrough shader.
        // The output in this.texA will be the base image for post-processing effects.
        // Clearing and viewport setting will be handled by renderBaseSceneToFBO itself.
        // this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, this.fboA); // Done by renderBaseSceneToFBO
        // this.gl.viewport(0, 0, this.canvas.width, this.canvas.height); // Done by renderBaseSceneToFBO
        // this.gl.clearColor(0, 0, 0, 1); // Done by renderBaseSceneToFBO
        // this.gl.clear(this.gl.COLOR_BUFFER_BIT); // Done by renderBaseSceneToFBO

        // The old renderLayersWithBudget drew directly to screen.
        // It needs to be adapted to draw to the current FBO (this.fboA).
        // It would use the passthrough shader for each video layer.
        // For simplicity, let's assume this step populates this.texA correctly.
        // This is a MAJOR refactor point for renderLayersWithBudget and renderLayerOptimized.
        // For now, we'll simulate this by just rendering ONE layer if available.
        this.renderBaseSceneToFBO(this.fboA, budget, audioData, beatData, time);


        let currentReadFBO = this.fboA;
        let currentReadTexture = this.texA;
        let currentWriteFBO = this.fboB;
        // let currentWriteTexture = this.texB; // Not directly needed, FBO attachment is key

        const activeEffectNames = Array.from(this.activeEffects);

        if (activeEffectNames.length > 0 && budget.canApplyComplexEffects) {
            this.gl.disable(this.gl.BLEND); // Usually no blending between full-screen effect passes

            for (let i = 0; i < activeEffectNames.length; i++) {
                const effectName = activeEffectNames[i];
                const effectProgram = this.effectPrograms[effectName];

                if (!effectProgram) {
                    console.warn(`Effect program for ${effectName} not found. Skipping.`);
                    continue;
                }

                this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, currentWriteFBO);
                this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
                // Do not clear here, we are processing the image from the previous pass.

                this.gl.useProgram(effectProgram);
                this.setGlobalUniforms(effectProgram, time, audioData, beatData);
                this.setEffectSpecificUniforms(effectProgram, effectName); // Set effect-specific uniforms

                // Bind textures: u_webcamTexture (current state) and u_previousFrameTexture
                this.gl.activeTexture(this.gl.TEXTURE0);
                this.gl.bindTexture(this.gl.TEXTURE_2D, currentReadTexture); // This is the input from previous pass or base scene
                const sourceTexLoc = this.gl.getUniformLocation(effectProgram, 'u_sourceTexture');
                if (sourceTexLoc) this.gl.uniform1i(sourceTexLoc, 0);
                // No fallback needed now, all shaders should use u_sourceTexture for main input


                if (this.texPrevFrame) { // Check if prevFrame texture is available
                    this.gl.activeTexture(this.gl.TEXTURE1);
                    this.gl.bindTexture(this.gl.TEXTURE_2D, this.texPrevFrame);
                    const prevFrameTexLoc = this.gl.getUniformLocation(effectProgram, 'u_previousFrameTexture');
                    if (prevFrameTexLoc) this.gl.uniform1i(prevFrameTexLoc, 1);
                }

                const opacityLoc = this.gl.getUniformLocation(effectProgram, 'u_opacity');
                if(opacityLoc) this.gl.uniform1f(opacityLoc, 1.0); // Effects render at full opacity internally

                this.gl.drawArrays(this.gl.TRIANGLE_STRIP, 0, 4);

                // Ping-pong FBOs for next pass
                let tempTex = currentReadTexture;
                currentReadTexture = (currentWriteFBO === this.fboA) ? this.texA : this.texB; // Texture of FBO we just wrote to

                let tempFBO = currentReadFBO; // FBO we read from (becomes next write target)
                currentReadFBO = currentWriteFBO; // FBO we wrote to (becomes next read source)
                currentWriteFBO = tempFBO; // Old read FBO is new write target
            }
            this.gl.enable(this.gl.BLEND);
        } else {
            // No effects, currentReadTexture is still the base scene from fboA.
        }

        // NEW PLACEMENT: 3. Copy the result of the effect chain (currentReadTexture) to this.texPrevFrame
        // This happens BEFORE FinalPassShader, so texPrevFrame stores the raw effect output.
        if (this.fboPrevFrame && this.effectPrograms.passthrough && currentReadTexture) {
            this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, this.fboPrevFrame);
            this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
            // No need to clear if we're overwriting fully with an opaque quad

            this.gl.useProgram(this.effectPrograms.passthrough);
            // Set minimal uniforms for passthrough (tex, opacity 1.0)
            this.gl.activeTexture(this.gl.TEXTURE0);
            this.gl.bindTexture(this.gl.TEXTURE_2D, currentReadTexture); // Output of effect chain
            const passthroughTexLoc = this.gl.getUniformLocation(this.effectPrograms.passthrough, 'u_sourceTexture');
            if (passthroughTexLoc) this.gl.uniform1i(passthroughTexLoc, 0);
            this.gl.uniform1f(this.gl.getUniformLocation(this.effectPrograms.passthrough, 'u_opacity'), 1.0);

            this.gl.disable(this.gl.BLEND); // Draw opaque
            this.gl.drawArrays(this.gl.TRIANGLE_STRIP, 0, 4);
            // Important: Leave this.fboPrevFrame bound if we are immediately going to use its texture.
            // However, standard practice is to unbind after use. For texPrevFrame, it's now populated.
            // The next frame will BIND this.texPrevFrame for reading.
        }
        // currentReadTexture still holds the output of the effect chain.

        // 2. Render the result (currentReadTexture) to the screen (canvas) using FinalPassShader
        this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
        this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
        this.gl.clearColor(0, 0, 0, 1);
        this.gl.clear(this.gl.COLOR_BUFFER_BIT);

        const finalProgram = this.effectPrograms.finalPass || this.effectPrograms.passthrough;
        this.gl.useProgram(finalProgram);
        this.setGlobalUniforms(finalProgram, time, audioData, beatData);
        
        this.gl.activeTexture(this.gl.TEXTURE0);
        this.gl.bindTexture(this.gl.TEXTURE_2D, currentReadTexture); // This is the output of the effect chain
        const finalSourceTexLoc = this.gl.getUniformLocation(finalProgram, 'u_sourceTexture');
        if (finalSourceTexLoc) this.gl.uniform1i(finalSourceTexLoc, 0);

        const finalOpacityLoc = this.gl.getUniformLocation(finalProgram, 'u_opacity');
        if(finalOpacityLoc) this.gl.uniform1f(finalOpacityLoc, this.masterOpacity);

        this.gl.enable(this.gl.BLEND);
        this.gl.blendFunc(this.gl.SRC_ALPHA, this.gl.ONE_MINUS_SRC_ALPHA);
        this.gl.drawArrays(this.gl.TRIANGLE_STRIP, 0, 4);
        this.gl.disable(this.gl.BLEND);
        
        // Render to output window if available
        // The currentReadTexture passed here is the output of the effect chain (pre-FinalPass for main canvas)
        // If outputCanvas also needs FinalPass applied, it should use finalProgram.
        // The current call to renderToCanvas already passes finalProgram.
        if (this.outputGl && this.outputCanvas && budget.canRenderAllLayers) {
            this.renderToCanvas(this.outputGl, this.outputCanvas, currentReadTexture, finalProgram, time, audioData, beatData);
        }
        // Unbind any FBOs at the very end if necessary, though binding to null (screen) does this for FRAMEBUFFER.
        this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
    }

    // Helper to set global uniforms for a given program
    setGlobalUniforms(program, time, audioData, beatData) {
        const gl = this.gl;
        gl.uniform1f(gl.getUniformLocation(program, 'u_time'), time);
        gl.uniform2f(gl.getUniformLocation(program, 'u_resolution'), this.canvas.width, this.canvas.height);
        
        // Add console.warn if uniform location is null or -1
        const timeLoc = gl.getUniformLocation(program, 'u_time');
        if (timeLoc === null || timeLoc === -1) console.warn(`Uniform 'u_time' not found in program:`, program);
        const resolutionLoc = gl.getUniformLocation(program, 'u_resolution');
        if (resolutionLoc === null || resolutionLoc === -1) console.warn(`Uniform 'u_resolution' not found in program:`, program);

        // Audio uniforms (for old effects and potentially new ones if they use these names)
        if (audioData && beatData) {
            gl.uniform1f(gl.getUniformLocation(program, 'u_beat'), beatData.beat);
            if (gl.getUniformLocation(program, 'u_beat') === null || gl.getUniformLocation(program, 'u_beat') === -1) console.warn(`Uniform 'u_beat' not found in program:`, program);
            gl.uniform1f(gl.getUniformLocation(program, 'u_bassLevel'), beatData.bassLevel);
            if (gl.getUniformLocation(program, 'u_bassLevel') === null || gl.getUniformLocation(program, 'u_bassLevel') === -1) console.warn(`Uniform 'u_bassLevel' not found in program:`, program);
            gl.uniform1f(gl.getUniformLocation(program, 'u_trebleLevel'), beatData.trebleLevel);
            if (gl.getUniformLocation(program, 'u_trebleLevel') === null || gl.getUniformLocation(program, 'u_trebleLevel') === -1) console.warn(`Uniform 'u_trebleLevel' not found in program:`, program);
            gl.uniform1f(gl.getUniformLocation(program, 'u_audioEnergy'), audioData.energy);
            if (gl.getUniformLocation(program, 'u_audioEnergy') === null || gl.getUniformLocation(program, 'u_audioEnergy') === -1) console.warn(`Uniform 'u_audioEnergy' not found in program:`, program);
            gl.uniform3f(gl.getUniformLocation(program, 'u_audioFrequencies'), audioData.bass, audioData.mid, audioData.treble);
        }

        // New global control uniforms (from the new shader spec)
        // Shaders must declare these if they use them.
        gl.uniform1f(gl.getUniformLocation(program, 'u_brightness'), this.brightness);
        gl.uniform1f(gl.getUniformLocation(program, 'u_contrast'), this.contrast);
        if (gl.getUniformLocation(program, 'u_brightness') === null || gl.getUniformLocation(program, 'u_brightness') === -1) console.warn(`Uniform 'u_brightness' not found in program:`, program);
        if (gl.getUniformLocation(program, 'u_contrast') === null || gl.getUniformLocation(program, 'u_contrast') === -1) console.warn(`Uniform 'u_contrast' not found in program:`, program);
        gl.uniform1f(gl.getUniformLocation(program, 'u_saturation'), this.saturation);
        if (gl.getUniformLocation(program, 'u_saturation') === null || gl.getUniformLocation(program, 'u_saturation') === -1) console.warn(`Uniform 'u_saturation' not found in program:`, program);
        gl.uniform1f(gl.getUniformLocation(program, 'u_motionThreshold'), this.motionThreshold);
        if (gl.getUniformLocation(program, 'u_motionThreshold') === null || gl.getUniformLocation(program, 'u_motionThreshold') === -1) console.warn(`Uniform 'u_motionThreshold' not found in program:`, program);
        gl.uniform1f(gl.getUniformLocation(program, 'u_trailPersistence'), this.trailPersistence);
        if (gl.getUniformLocation(program, 'u_trailPersistence') === null || gl.getUniformLocation(program, 'u_trailPersistence') === -1) console.warn(`Uniform 'u_trailPersistence' not found in program:`, program);
        gl.uniform1f(gl.getUniformLocation(program, 'u_hueShiftSpeed'), this.hueShiftSpeed);
        if (gl.getUniformLocation(program, 'u_hueShiftSpeed') === null || gl.getUniformLocation(program, 'u_hueShiftSpeed') === -1) console.warn(`Uniform 'u_hueShiftSpeed' not found in program:`, program);
        gl.uniform1f(gl.getUniformLocation(program, 'u_motionExtrapolation'), this.motionExtrapolation);
        if (gl.getUniformLocation(program, 'u_motionExtrapolation') === null || gl.getUniformLocation(program, 'u_motionExtrapolation') === -1) console.warn(`Uniform 'u_motionExtrapolation' not found in program:`, program);
        gl.uniform1f(gl.getUniformLocation(program, 'u_intensity'), this.intensity); // General intensity
        if (gl.getUniformLocation(program, 'u_intensity') === null || gl.getUniformLocation(program, 'u_intensity') === -1) console.warn(`Uniform 'u_intensity' not found in program:`, program);

        // Note: u_crossfader is part of base scene rendering, not a global effect uniform.
        // u_opacity for effect passes is 1.0, masterOpacity for final pass.
    }

    setEffectSpecificUniforms(program, effectName) {
        const gl = this.gl;
        const controls = this.effectControls[effectName];
        if (!controls) {
            // This effect might not have specific controls defined in this.effectControls
            // or it might be an older effect that doesn't use this structure.
            // setGlobalUniforms already sets global uniforms like u_intensity if needed.
            return;
        }

        // Iterate through controls defined for this effect
        for (const paramName in controls) {
            if (controls.hasOwnProperty(paramName)) {
                const uniformName = `u_${paramName}`; // Assuming uniform names match control names with 'u_' prefix
                const value = controls[paramName];
                const location = gl.getUniformLocation(program, uniformName);

                if (location !== null && location !== -1) {
                    // Set the uniform based on its type. Assuming float for now.
                    // Need more robust type checking for different uniform types (vec2, vec3 etc.)
                    if (typeof value === 'number') {
                        gl.uniform1f(location, value);
                    } else if (Array.isArray(value)) {
                         // Add checks for vec2, vec3, etc. if needed
                         if (value.length === 2) gl.uniform2fv(location, value);
                         else if (value.length === 3) gl.uniform3fv(location, value);
                         else if (value.length === 4) gl.uniform4fv(location, value);
                    } // Add more types as needed
                } else {
                    console.warn(`Uniform '${uniformName}' not found in ${effectName} program.`);
                }
            }
        }

        // Keep specific logic for datamosh if its 'u_intensity' conflicts with global 'u_intensity'
        // However, the new structure assumes effect-specific controls override or use different names.
        // If an effect *specifically* needs to use the global 'u_intensity' AND an effect-specific 'u_intensity',
        // the shader itself would need to use different uniform names or this logic would need
        // to handle that case (e.g., rename the effect-specific uniform to something like u_datamoshIntensity).
        // Assuming for now that effect-specific controls share the same uniform name as the control name.
        if (effectName === 'datamosh') {
             // No extra logic needed here now if uniforms are named u_intensity, u_displacement, u_feedback.
             // The loop above handles these if they exist in effectControls.datamosh.
        } else if (effectName === 'crt') {
             // No extra logic needed here now if uniforms are named u_scanlineIntensity etc.
             // The loop above handles these if they exist in effectControls.crt.
        } else if (effectName === 'pixelsort') {
             // No extra logic needed here now.
        } else if (effectName === 'feedback') {
             // No extra logic needed here now.
        } else if (effectName === 'feedbackDisplace') {
            const intensityLoc = gl.getUniformLocation(program, 'u_intensity');
            if (intensityLoc !== null && intensityLoc !== -1) gl.uniform1f(intensityLoc, controls.intensity);
            else console.warn(`Uniform 'u_intensity' not found in ${effectName} program.`);
            // Note: FeedbackDisplace uses 'u_intensity' from controls, which overrides the global u_intensity if set here.
            // The loop above will set u_displacement_map_strength.
        }

        // Add checks for other effects here if they have complex uniform setting logic
        // that isn't covered by the simple u_paramName mapping.
    }

    renderBaseSceneToFBO(targetFbo, budget, audioData, beatData, time) {
        // This is a simplified placeholder for rendering the composited video layers.
        // The full logic from renderLayersWithBudget needs to be adapted here.
        // It should iterate through active layers, apply their individual opacities,
        // blend modes, and crossfader contributions, rendering each to targetFbo.
        // Each layer would use its own video texture and the 'passthrough' shader.

        // Simplified: Render the first active, visible layer using passthrough
        const gl = this.gl;
        gl.bindFramebuffer(gl.FRAMEBUFFER, targetFbo);
        // Viewport and clear are assumed to be done by caller for the FBO

        const firstActiveLayer = this.layers.find(l => l.video && l.opacity > 0.01 && l.video.readyState >= l.video.HAVE_CURRENT_DATA);

        if (firstActiveLayer) {
            if (!firstActiveLayer.texture) this.updateLayerTexture(firstActiveLayer); // Ensure texture exists
            if (!firstActiveLayer.texture) return; // Still no texture

            const passthroughProgram = this.effectPrograms.passthrough;
            gl.useProgram(passthroughProgram);
            this.setGlobalUniforms(passthroughProgram, time, audioData, beatData);

            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, firstActiveLayer.texture);
            gl.uniform1i(gl.getUniformLocation(passthroughProgram, 'u_texture'), 0);

            // Here, we'd need to calculate the layer's effective opacity after crossfader, etc.
            // For this placeholder, just use its direct opacity.
            let effectiveOpacity = firstActiveLayer.opacity;
            // This does not include crossfader or master opacity yet.
            // Crossfader logic would need to be applied if rendering multiple base layers.
            // Master opacity is applied in the final screen draw.

            gl.uniform1f(gl.getUniformLocation(passthroughProgram, 'u_opacity'), effectiveOpacity);

            // For a single layer being drawn to FBO, blend mode might be less critical
            // if the FBO was cleared, but if multiple layers are drawn to the same FBO,
            // then their blend modes and opacities matter.
            this.setBlendMode(gl, firstActiveLayer.blendMode); // or just SRC_ALPHA, ONE_MINUS_SRC_ALPHA
            gl.enable(gl.BLEND);

            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
            gl.disable(gl.BLEND);
        }
        // IMPORTANT: This placeholder does NOT correctly composite multiple layers
        // with crossfader and individual blend modes. That's a major piece of work
        // to refactor from the old renderLayersWithBudget.
        // --- END OF PLACEHOLDER ---
    }

    // setUniformsOptimized(time, audioData, beatData) { // Obsolete: Replaced by setGlobalUniforms used per program.
    //     const currentProgram = this.gl.getParameter(this.gl.CURRENT_PROGRAM);
    //     if (!currentProgram) return;
    //     const uniforms = {
    //         'u_time': time,
    //         'u_crossfader': this.crossfader,
    //         'u_resolution': [this.canvas.width, this.canvas.height],
    //         'u_beat': beatData.beat,
    //         'u_bassLevel': beatData.bassLevel,
    //         'u_trebleLevel': beatData.trebleLevel,
    //         'u_audioEnergy': audioData.energy,
    //         'u_audioFrequencies': [audioData.bass, audioData.mid, audioData.treble]
    //     };
    //     Object.entries(uniforms).forEach(([name, value]) => {
    //         this.setUniform(this.gl, name, value);
    //     });
    // }
    
    // renderLayersWithBudget(budget, beatData, audioData, time) { // Obsolete: Logic moved to renderBaseSceneToFBO and effect loop in renderWithBudget
    // }

    // renderLayerOptimized(layer, effectiveOpacity, layerIndex, budget) { // Obsolete: Logic moved to renderBaseSceneToFBO
    // }
    
    setBlendModeOptimized(blendMode, budget) {
        // Use simpler blend modes when performance is constrained
        if (!budget.canApplyComplexEffects) {
            this.gl.blendFunc(this.gl.SRC_ALPHA, this.gl.ONE_MINUS_SRC_ALPHA);
            return;
        }
        
        this.setBlendMode(this.gl, blendMode);
    }
    
    setBlendMode(gl, blendMode) {
        // Note: Accurate implementations of 'subtract' and 'multiply' blend modes may require
        // shader-based blending due to limitations of WebGL 1.0 fixed-function blending.
        // The current implementation uses approximations.
        // Ensure blend equation is ADD, which is the default for WebGL
        gl.blendEquation(gl.FUNC_ADD);

        if (blendMode === 'normal') {
            // Standard alpha blending: C_result = C_source * A_source + C_dest * (1 - A_source)
            gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        } else if (blendMode === 'add') {
            // Additive blending: C_result = C_source * A_source + C_dest * 1
            gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
        } else if (blendMode === 'subtract') {
            // Subtract-like effect (can vary): C_result = C_dest * 1 - C_source * A_source
            // This requires FUNC_REVERSE_SUBTRACT or careful shader math.
            // For a simple subtractive effect with standard FUNC_ADD:
            // This is actually hard to achieve correctly with fixed-function pipeline for "Source - Dest"
            // or "Dest - Source".
            // A common VJ "subtract" might be Dest - Source.
            // Using gl.blendEquation(gl.FUNC_REVERSE_SUBTRACT); and gl.blendFunc(gl.SRC_ALPHA, gl.ONE); is one way.
            // For now, let's keep it simple or note it for review.
            // The original gl.ZERO, gl.SRC_COLOR was: D*0 + S*Sc = S*Sc (not subtract)
            // Let's use standard alpha blending as a placeholder if true subtract is complex.
            console.warn(`Blend mode 'subtract' may not be standard. Review its intended visual effect.`);
            gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); // Placeholder
        } else if (blendMode === 'multiply') {
            // Multiply blending: C_result = C_source * C_dest + C_dest * 0
            // Requires shader output alpha to be 1 or use gl.ONE_MINUS_SRC_ALPHA for second factor
            // gl.blendFunc(gl.DST_COLOR, gl.ZERO); // Common for multiply: Dst * Src
            // The original gl.ZERO, gl.SRC_COLOR was: D*0 + S*Sc = S*Sc (not multiply)
            console.warn(`Blend mode 'multiply' may not be standard. Review its intended visual effect.`);
            gl.blendFunc(gl.DST_COLOR, gl.ONE_MINUS_SRC_ALPHA); // A common multiply mode
        } else {
            // Default to standard alpha blending
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
    
    // calculateEffectiveOpacity(layer, index, beatData, audioData, time) { // Obsolete: Replaced by calculateBaseLayerOpacity (which excludes masterOpacity)
    //     let effectiveOpacity = layer.opacity;
    //     let crossfaderValue = this.crossfader;

    //     // Auto-sync crossfader to beat if enabled
    //     if (this.autoSyncEnabled && beatData.beat > 0.8) {
    //         crossfaderValue = Math.abs(Math.sin(time * 0.5 + audioData.energy));
    //     }

    //     // Enhanced crossfader curves
    //     const crossfaderSmooth = this.smoothstep(0, 1, crossfaderValue);

    //     if (index < 3) {
    //         effectiveOpacity *= Math.pow(1.0 - crossfaderSmooth, 1.5);
    //     } else {
    //         effectiveOpacity *= Math.pow(crossfaderSmooth, 1.5);
    //     }
    //     effectiveOpacity *= this.masterOpacity; // This was the key difference

    //     // Audio-reactive opacity boost
    //     if (audioData.energy > 0.6) {
    //         effectiveOpacity = Math.min(1.0, effectiveOpacity * (1.0 + audioData.energy * 0.3));
    //     }

    //     return effectiveOpacity;
    // }
    
    // getActiveEffectNumber(layerIndex) { // Obsolete with multi-pass rendering
    //     const activeEffectsArray = Array.from(this.activeEffects);
    //     if (activeEffectsArray.length === 0) return 0;

    //     // Layer-specific effect cycling
    //     const effectIndex = (layerIndex + Math.floor(performance.now() / 2000)) % activeEffectsArray.length;
    //     return this.getEffectNumber(activeEffectsArray[effectIndex]);
    // }
    
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
        if (this.onPerformanceWarning && Math.random() < 0.1) { // Only show occasionally
            this.onPerformanceWarning('Consider reducing active layers or effects for better performance');
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

        // Delete ping-pong FBOs and textures
        if (this.fboA) this.gl.deleteFramebuffer(this.fboA);
        if (this.texA) this.gl.deleteTexture(this.texA);
        if (this.fboB) this.gl.deleteFramebuffer(this.fboB);
        if (this.texB) this.gl.deleteTexture(this.texB);

        // Delete feedback FBO and texture
        if (this.fboPrevFrame) this.gl.deleteFramebuffer(this.fboPrevFrame);
        if (this.texPrevFrame) this.gl.deleteTexture(this.texPrevFrame);

        // Delete vertex buffer
        if (this.vertexBuffer) {
            this.gl.deleteBuffer(this.vertexBuffer);
            this.vertexBuffer = null; // Release reference
        }

        // Clear GL context and other references
        this.gl = null;
        this.canvas = null;
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
    
    optimize(layers, gl) { // Added gl parameter
        const now = performance.now();
        if (now - this.lastOptimization < this.optimizationInterval) return;
        
        this.lastOptimization = now;
        
        if (!gl) {
            console.warn('MemoryOptimizer: WebGL context not provided for optimization.');
            return;
        }

        // Clean up unused textures
        layers.forEach(layer => {
            if (!layer.isActive && layer.texture && !layer.textureCleanupTime) {
                // If layer is inactive and has a texture not already marked for cleanup
                console.log(`MemoryOptimizer: Marking texture for layer for potential cleanup.`);
                layer.textureCleanupTime = now + 10000; // Clean after 10s of inactivity
            } else if (layer.isActive && layer.textureCleanupTime) {
                // If layer becomes active again, cancel cleanup
                console.log(`MemoryOptimizer: Layer became active, cancelling texture cleanup.`);
                layer.textureCleanupTime = null;
            }
            
            if (layer.textureCleanupTime && now > layer.textureCleanupTime) {
                if (layer.texture && !layer.isActive) { // Double check layer is still inactive
                    console.log(`MemoryOptimizer: Deleting texture for inactive layer.`);
                    gl.deleteTexture(layer.texture);
                    layer.texture = null; // Important to release reference
                }
                layer.textureCleanupTime = null; // Reset timer
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