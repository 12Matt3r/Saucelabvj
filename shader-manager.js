class ShaderManager {
    constructor(gl) {
        this.gl = gl;
        this.shaderCache = new Map();
    }
    
    getVertexShaderSource() {
        return `
            attribute vec2 a_position;
            attribute vec2 a_texCoord;
            varying vec2 v_texCoord;
            
            void main() {
                gl_Position = vec4(a_position, 0, 1);
                v_texCoord = a_texCoord;
            }
        `;
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
                return fract(sin(dot(co.xy, vec2(12.9898, 78.233))) * 43758.5453);
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
                // Prevent division by zero if segments somehow becomes zero, though highly unlikely here.
                segments = max(1.0, segments);
                float segmentAngle = 6.28318 / segments;
                angle = floor(angle / segmentAngle) * segmentAngle;

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
                combinedZoom = max(0.00001, combinedZoom); // Prevent division by zero if it somehow becomes zero

                float invCombinedZoom = 1.0 / combinedZoom;
                vec2 uv = (coord - center) * invCombinedZoom + center;

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
    
    getFragmentShaderSource() { // This method seems unused now based on video-engine.js, but I'll leave it.
        return `
            precision mediump float;
            uniform sampler2D u_texture;
            uniform float u_opacity;
            uniform int u_effect;
            uniform float u_time;
            uniform float u_crossfader;
            uniform vec2 u_resolution;
            varying vec2 v_texCoord;
            
            vec3 rgbShift(vec2 coord) {
                float offset = 0.005;
                float r = texture2D(u_texture, coord + vec2(offset, 0.0)).r;
                float g = texture2D(u_texture, coord).g;
                float b = texture2D(u_texture, coord - vec2(offset, 0.0)).b;
                return vec3(r, g, b);
            }
            
            vec3 glitchEffect(vec2 coord) {
                vec2 uv = coord;
                float time = u_time;
                
                float glitchAmount = sin(time * 10.0);
                if (glitchAmount > 0.5) {
                    uv.x += sin(uv.y * 50.0 + time) * 0.02;
                }
                
                vec3 color = texture2D(u_texture, uv).rgb;
                return color;
            }
            
            vec3 pixelateEffect(vec2 coord) {
                float pixelSize = 0.05;
                vec2 grid = floor(coord / pixelSize) * pixelSize;
                return texture2D(u_texture, grid).rgb;
            }
            
            void main() {
                vec3 color = texture2D(u_texture, v_texCoord).rgb;
                
                if (u_effect == 1) {
                    color = rgbShift(v_texCoord);
                } else if (u_effect == 2) {
                    vec2 distortedCoord = v_texCoord + sin(v_texCoord * 15.0 + u_time * 2.0) * 0.03;
                    color = texture2D(u_texture, distortedCoord).rgb;
                } else if (u_effect == 3) {
                    color = 1.0 - color;
                } else if (u_effect == 4) {
                    color = glitchEffect(v_texCoord);
                } else if (u_effect == 5) {
                    vec2 center = vec2(0.5, 0.5);
                    vec2 uv = v_texCoord - center;
                    float angle = atan(uv.y, uv.x) + u_time * 0.5;
                    float radius = length(uv);
                    float segments = 8.0;
                    angle = floor(angle / (6.28318 / segments)) * (6.28318 / segments);
                    uv = vec2(cos(angle), sin(angle)) * radius + center;
                    color = texture2D(u_texture, uv).rgb;
                } else if (u_effect == 6) {
                    color = pixelateEffect(v_texCoord);
                } else if (u_effect == 7) {
                    vec2 uv = v_texCoord;
                    if (uv.x > 0.5) uv.x = 1.0 - uv.x;
                    color = texture2D(u_texture, uv).rgb;
                } else if (u_effect == 8) {
                    color = color * vec3(1.0 + sin(u_time) * 0.5, 1.0 + sin(u_time * 1.1) * 0.5, 1.0 + sin(u_time * 1.2) * 0.5);
                } else if (u_effect == 9) {
                    vec2 center = vec2(0.5, 0.5);
                    float zoom = 1.0 + sin(u_time * 3.0) * 0.3;
                    vec2 uv = (v_texCoord - center) / zoom + center;
                    color = texture2D(u_texture, uv).rgb;
                } else if (u_effect == 10) {
                    float strobe = step(0.5, sin(u_time * 30.0));
                    color = mix(color, vec3(1.0), strobe * 0.8);
                }
                
                gl_FragColor = vec4(color, u_opacity);
            }
        `;
    }
    
    createShader(type, source) {
        const cacheKey = `${type}-${source}`;
        if (this.shaderCache.has(cacheKey)) {
            return this.shaderCache.get(cacheKey);
        }
        
        const shader = this.gl.createShader(type);
        if (!shader) {
            console.error('Failed to create shader object');
            return null;
        }
        
        this.gl.shaderSource(shader, source);
        this.gl.compileShader(shader);
        
        if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
            const shaderType = type === this.gl.VERTEX_SHADER ? 'vertex' : 'fragment';
            const error = this.gl.getShaderInfoLog(shader);
            console.error(`${shaderType} shader compilation error:`, error);
            console.error('Failed shader source:');
            console.error(source.split('\n').map((line, i) => `${i + 1}: ${line}`).join('\n'));
            this.gl.deleteShader(shader);
            return null;
        }
        
        this.shaderCache.set(cacheKey, shader);
        return shader;
    }
    
    createProgram(vertexShaderSource, fragmentShaderSource) {
        const vertexShader = this.createShader(this.gl.VERTEX_SHADER, vertexShaderSource);
        const fragmentShader = this.createShader(this.gl.FRAGMENT_SHADER, fragmentShaderSource);
        
        if (!vertexShader || !fragmentShader) {
            console.error('Cannot create program: shaders are null');
            return null;
        }
        
        const program = this.gl.createProgram();
        if (!program) {
            console.error('Failed to create program object');
            return null;
        }
        
        this.gl.attachShader(program, vertexShader);
        this.gl.attachShader(program, fragmentShader);
        this.gl.linkProgram(program);
        
        if (!this.gl.getProgramParameter(program, this.gl.LINK_STATUS)) {
            const error = this.gl.getProgramInfoLog(program);
            console.error('Program linking error:', error);
            this.gl.deleteProgram(program);
            return null;
        }
        
        return program;
    }
    
    dispose() {
        this.shaderCache.clear();
    }
}

// Prevent duplicate class declaration
if (typeof window.ShaderManager === 'undefined') {
    window.ShaderManager = ShaderManager;
}