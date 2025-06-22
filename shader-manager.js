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
    
    getFragmentShaderSource() {
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