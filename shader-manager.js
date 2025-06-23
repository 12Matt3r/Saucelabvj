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

    getFeedbackDisplaceFragmentSource() {
        // Specific Uniforms: u_displacement_map_strength, u_intensity (for modulation)
        // Global Uniforms used: u_resolution (optional in spec, useful)
        // Textures: u_sourceTexture, u_previousFrameTexture (as displacement map)
        return `
            precision highp float;
            varying vec2 v_texCoord;

            uniform sampler2D u_sourceTexture;          // Current live input
            uniform sampler2D u_previousFrameTexture;   // Used as displacement map

            uniform float u_displacement_map_strength;
            uniform vec2 u_resolution; // For pixel-based displacement option
            uniform float u_intensity;  // To modulate displacement strength

            // Global adjustments that FinalPassShader will handle
            // uniform float u_brightness;
            // uniform float u_contrast;
            // uniform float u_saturation;

            // Helper functions from the spec (if needed, but this shader is simpler)
            // For this shader, only adjustBrightnessContrast and adjustSaturation were listed with its GLSL,
            // but they are removed as they are handled by FinalPassShader.

            void main() {
                // Sample the displacement map (using previous frame's output)
                vec4 displacementColor = texture2D(u_previousFrameTexture, v_texCoord);

                float actualDisplacementStrength = u_displacement_map_strength * (0.5 + u_intensity * 0.5);

                // Calculate displacement vector from color (typically R and G channels)
                vec2 displacement = (displacementColor.rg * 2.0 - 1.0) * actualDisplacementStrength;

                // Optional pixel-based displacement (from spec comment)
                // if (u_resolution.x > 0.0 && u_resolution.y > 0.0) {
                //     displacement /= u_resolution;
                // }
                // For now, using screen-percentage based displacement as per the primary logic.

                // Standard mirroring for current source input before displacement
                vec2 mirroredSourceTexcoord = vec2(1.0 - v_texCoord.x, v_texCoord.y);
                vec2 displacedTexcoord = mirroredSourceTexcoord + displacement;

                vec4 finalColor;
                // Boundary check after displacement
                if (displacedTexcoord.x < 0.0 || displacedTexcoord.x > 1.0 ||
                    displacedTexcoord.y < 0.0 || displacedTexcoord.y > 1.0) {
                    finalColor = vec4(0.0, 0.0, 0.0, 1.0); // Output black if out of bounds
                } else {
                    finalColor = texture2D(u_sourceTexture, displacedTexcoord);
                }

                // Brightness/Contrast/Saturation handled by FinalPassShader

                gl_FragColor = finalColor;
            }
        `;
    }

    getFeedbackFragmentSource() {
        // Specific Uniforms: u_intensity, u_displacement, u_feedback, u_feedback_glowThreshold (was u_threshold)
        // Global Uniforms used: u_time, u_motionThreshold (for glow, distinct from specific threshold), u_hueShiftSpeed
        // Textures: u_sourceTexture, u_previousFrameTexture
        return `
            precision highp float;
            varying vec2 v_texCoord;

            uniform sampler2D u_sourceTexture;
            uniform sampler2D u_previousFrameTexture;
            uniform float u_time;
            uniform float u_motionThreshold; // Global motion threshold
            // uniform float u_trailPersistence; // Not used in this shader's logic
            uniform float u_hueShiftSpeed;
            // uniform float u_motionExtrapolation; // Not used

            // Effect-specific
            uniform float u_intensity;
            uniform float u_displacement;
            uniform float u_feedback;
            uniform float u_feedback_glowThreshold; // Renamed from u_threshold to be specific

            // Helper functions from the spec
            float random (vec2 st) { return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123 + u_time * 0.01); }
            float noise (vec2 st) { vec2 i = floor(st); vec2 f = fract(st); float a = random(i); float b = random(i + vec2(1.,0.)); float c = random(i + vec2(0.,1.)); float d = random(i + vec2(1.,1.)); vec2 u = f*f*(3.0-2.0*f); return mix(a, b, u.x) + (c - a)* u.y * (1.0 - u.x) + (d - b) * u.x * u.y; }
            vec3 rgb2hsl(vec3 color) { float r = color.r; float g = color.g; float b = color.b; float maxC = max(max(r, g), b); float minC = min(min(r, g), b); float h = 0.0, s = 0.0, l = (maxC + minC) / 2.0; if (maxC == minC) { h = s = 0.0; } else { float d = maxC - minC; s = l > 0.5 ? d / (2.0 - maxC - minC) : d / (maxC + minC); if (maxC == r) { h = (g - b) / d + (g < b ? 6.0 : 0.0); } else if (maxC == g) { h = (b - r) / d + 2.0; } else if (maxC == b) { h = (r - g) / d + 4.0; } h /= 6.0; } return vec3(h, s, l); }
            float hue2rgb(float p, float q, float t) { if(t < 0.0) t += 1.0; if(t > 1.0) t -= 1.0; if(t < 1.0/6.0) return p + (q - p) * 6.0 * t; if(t < 1.0/2.0) return q; if(t < 2.0/3.0) return p + (q - p) * (2.0/3.0 - t) * 6.0; return p; }
            vec3 hsl2rgb(vec3 hsl) { float h = hsl.x; float s = hsl.y; float l = hsl.z; float r, g, b; if(s == 0.0){ r = g = b = l; } else { float q = l < 0.5 ? l * (1.0 + s) : l + s - l * s; float p = 2.0 * l - q; r = hue2rgb(p, q, h + 1.0/3.0); g = hue2rgb(p, q, h); b = hue2rgb(p, q, h - 1.0/3.0); } return vec3(r, g, b); }

            void main() {
                vec2 mirroredTexCoord = vec2(1.0 - v_texCoord.x, v_texCoord.y); // Standard mirroring for current input

                float angle = u_time * 0.05 * u_intensity;
                float zoom = 1.0 + sin(u_time * 0.1) * 0.01 * u_intensity;

                vec2 center = vec2(0.5, 0.5);
                vec2 fbCoord = v_texCoord - center; // Feedback texture is sampled with non-mirrored coords
                fbCoord = vec2(
                    fbCoord.x * cos(angle) - fbCoord.y * sin(angle),
                    fbCoord.x * sin(angle) + fbCoord.y * cos(angle)
                );
                fbCoord = fbCoord * zoom + center;

                fbCoord += vec2(
                    noise(fbCoord * 5.0 + u_time * 0.1) - 0.5,
                    noise(fbCoord * 5.0 - u_time * 0.1) - 0.5
                ) * u_displacement * 0.1;

                vec4 currentSourceColor = texture2D(u_sourceTexture, mirroredTexCoord);
                vec4 feedbackColorSample = texture2D(u_previousFrameTexture, fbCoord);

                float feedbackAmount = clamp(u_feedback * (1.0 + u_intensity), 0.0, 0.95); // Max feedback 0.95 to avoid full lock
                vec4 finalColor = mix(currentSourceColor, feedbackColorSample, feedbackAmount);

                // Motion-reactive glow uses u_motionThreshold (global) or a specific u_feedback_glowThreshold
                // The spec says "threshold: The motion detection threshold for the glow effect."
                // Let's use u_feedback_glowThreshold if provided, otherwise global u_motionThreshold.
                // For this implementation, I defined u_feedback_glowThreshold.
                float difference = length(currentSourceColor.rgb - feedbackColorSample.rgb);
                if (difference > u_feedback_glowThreshold) { // Using specific threshold for glow
                    vec3 hsl = rgb2hsl(finalColor.rgb);
                    hsl.y = min(hsl.y + 0.2 * u_intensity, 1.0);
                    hsl.z = min(hsl.z + 0.1 * u_intensity, 0.9);
                    finalColor.rgb = hsl2rgb(hsl);
                }

                if (u_hueShiftSpeed != 0.0) {
                    vec3 hsl = rgb2hsl(finalColor.rgb);
                    hsl.x = fract(hsl.x + u_time * u_hueShiftSpeed);
                    finalColor.rgb = hsl2rgb(hsl);
                }

                // Brightness/Contrast/Saturation handled by FinalPassShader

                finalColor = clamp(finalColor, 0.0, 1.0);
                gl_FragColor = finalColor;
            }
        `;
    }

    getPixelSortFragmentSource() {
        // Specific Uniforms: u_intensity, u_displacement, u_feedback, u_threshold
        // Global Uniforms used: u_time, u_trailPersistence, u_hueShiftSpeed
        // (u_brightness, u_contrast, u_saturation are for FinalPassShader)
        // Textures: u_sourceTexture, u_previousFrameTexture
        return `
            precision highp float;
            varying vec2 v_texCoord;

            uniform sampler2D u_sourceTexture;
            uniform sampler2D u_previousFrameTexture;
            uniform float u_time;
            // uniform float u_motionThreshold; // Not used in provided GLSL logic for PixelSort
            uniform float u_trailPersistence;
            uniform float u_hueShiftSpeed;
            // uniform float u_motionExtrapolation; // Not used

            // Effect-specific
            uniform float u_intensity;
            uniform float u_displacement;
            uniform float u_feedback;
            uniform float u_threshold;

            // Global adjustments that FinalPassShader will handle
            // uniform float u_brightness;
            // uniform float u_contrast;
            // uniform float u_saturation;

            // Helper functions from the spec
            float random (vec2 st) { return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123 + u_time * 0.01); }
            float noise (vec2 st) { vec2 i = floor(st); vec2 f = fract(st); float a = random(i); float b = random(i + vec2(1.,0.)); float c = random(i + vec2(0.,1.)); float d = random(i + vec2(1.,1.)); vec2 u = f*f*(3.0-2.0*f); return mix(a, b, u.x) + (c - a)* u.y * (1.0 - u.x) + (d - b) * u.x * u.y; }
            vec3 rgb2hsl(vec3 color) { float r = color.r; float g = color.g; float b = color.b; float maxC = max(max(r, g), b); float minC = min(min(r, g), b); float h = 0.0, s = 0.0, l = (maxC + minC) / 2.0; if (maxC == minC) { h = s = 0.0; } else { float d = maxC - minC; s = l > 0.5 ? d / (2.0 - maxC - minC) : d / (maxC + minC); if (maxC == r) { h = (g - b) / d + (g < b ? 6.0 : 0.0); } else if (maxC == g) { h = (b - r) / d + 2.0; } else if (maxC == b) { h = (r - g) / d + 4.0; } h /= 6.0; } return vec3(h, s, l); }
            float hue2rgb(float p, float q, float t) { if(t < 0.0) t += 1.0; if(t > 1.0) t -= 1.0; if(t < 1.0/6.0) return p + (q - p) * 6.0 * t; if(t < 1.0/2.0) return q; if(t < 2.0/3.0) return p + (q - p) * (2.0/3.0 - t) * 6.0; return p; }
            vec3 hsl2rgb(vec3 hsl) { float h = hsl.x; float s = hsl.y; float l = hsl.z; float r, g, b; if(s == 0.0){ r = g = b = l; } else { float q = l < 0.5 ? l * (1.0 + s) : l + s - l * s; float p = 2.0 * l - q; r = hue2rgb(p, q, h + 1.0/3.0); g = hue2rgb(p, q, h); b = hue2rgb(p, q, h - 1.0/3.0); } return vec3(r, g, b); }

            // adjustBrightnessContrast and adjustSaturation removed as they are handled by FinalPassShader

            void main() {
                // Standard mirroring (as in other new spec shaders)
                vec2 mirroredTexCoord = vec2(1.0 - v_texCoord.x, v_texCoord.y);
                vec4 currentSourceColor = texture2D(u_sourceTexture, mirroredTexCoord);
                vec4 previousFrameColor = texture2D(u_previousFrameTexture, v_texCoord); // Not mirrored in spec for prev frame

                float brightness = dot(currentSourceColor.rgb, vec3(0.299, 0.587, 0.114));

                vec2 sortDir = vec2(0.0, 1.0); // Sort vertically
                if (sin(u_time * 0.1) > 0.0) { // Time-based switch for sort direction
                    sortDir = vec2(1.0, 0.0);
                }

                float adjustedThreshold = u_threshold * (1.0 + u_intensity * 0.5);

                vec2 sortedCoord = mirroredTexCoord;
                if (brightness > adjustedThreshold) {
                    // Displacement calculation in spec seems large, might need tuning.
                    // Using u_displacement directly here. The '10.0' multiplier from spec might be too much.
                    sortedCoord += sortDir * u_displacement * (brightness - adjustedThreshold);
                    sortedCoord = fract(sortedCoord);
                }

                vec4 sortedColor = texture2D(u_sourceTexture, sortedCoord);

                vec4 finalColor = mix(sortedColor, previousFrameColor, u_trailPersistence);

                if (u_feedback > 0.0) {
                    vec2 feedbackOffset = vec2(noise(v_texCoord*3.0 + u_time*0.1)-0.5) * 0.01 * u_feedback;
                    vec4 feedbackColorSample = texture2D(u_previousFrameTexture, v_texCoord + feedbackOffset);
                    finalColor = mix(finalColor, feedbackColorSample, u_feedback * 0.5);
                }

                if (u_hueShiftSpeed != 0.0) {
                    vec3 hsl = rgb2hsl(finalColor.rgb);
                    hsl.x = fract(hsl.x + u_time * u_hueShiftSpeed);
                    finalColor.rgb = hsl2rgb(hsl);
                }

                // Brightness/Contrast/Saturation handled by FinalPassShader

                finalColor = clamp(finalColor, 0.0, 1.0);
                gl_FragColor = finalColor;
            }
        `;
    }

    getCRTFragmentSource() {
        // NOTE: This shader uses u_webcamTexture. It does not use u_previousFrameTexture.
        // Specific Uniforms: u_scanlineIntensity, u_scanlineDensity, u_curvatureAmount,
        // u_phosphorOffset, u_vignetteStrength, u_vignetteSoftness.
        // Global Uniforms: u_time, u_brightness, u_contrast, u_saturation, u_intensity (though u_intensity seems unused in CRT spec).
        return `
            precision highp float;
            varying vec2 v_texCoord;

            uniform sampler2D u_sourceTexture; // WAS: u_webcamTexture
            uniform float u_time; // Available, though CRT spec doesn't explicitly use it in main logic

            // Global adjustments (part of the shader's original spec)
            uniform float u_brightness;
            uniform float u_contrast;
            uniform float u_saturation;
            uniform float u_intensity; // Available, though CRT spec doesn't explicitly use it

            // CRT Specific Uniforms
            uniform float u_scanlineIntensity;
            uniform float u_scanlineDensity;
            uniform float u_curvatureAmount;
            uniform float u_phosphorOffset;
            uniform float u_vignetteStrength;
            uniform float u_vignetteSoftness;

            // Helper functions from the spec
            vec3 adjustBrightnessContrast(vec3 color, float brightness, float contrast) {
                vec3 result = color + brightness;
                result = (result - 0.5) * contrast + 0.5;
                return clamp(result, 0.0, 1.0);
            }
            vec3 adjustSaturation(vec3 color, float saturation) {
                vec3 gray = vec3(dot(color, vec3(0.2126, 0.7152, 0.0722)));
                return mix(gray, color, saturation);
            }

            void main() {
                vec2 uv = v_texCoord;
                // Mirroring as per CRT shader spec (consistent with others)
                uv.x = 1.0 - uv.x;

                // Screen Curvature (Barrel Distortion)
                vec2 centeredUV = uv * 2.0 - 1.0;
                float r_sq = dot(centeredUV, centeredUV);
                vec2 distortedUV = centeredUV * (1.0 - u_curvatureAmount * r_sq);
                distortedUV = (distortedUV + 1.0) * 0.5;

                vec4 finalColor = vec4(0.0, 0.0, 0.0, 1.0); // Default to black if out of bounds

                if (distortedUV.x >= 0.0 && distortedUV.x <= 1.0 && distortedUV.y >= 0.0 && distortedUV.y <= 1.0) {
                    // Chromatic Aberration for phosphor effect
                    vec2 r_offset = vec2(u_phosphorOffset, 0.0);
                    vec2 b_offset = vec2(-u_phosphorOffset, 0.0);
                    float r_channel = texture2D(u_sourceTexture, distortedUV + r_offset).r; // WAS: u_webcamTexture
                    float g_channel = texture2D(u_sourceTexture, distortedUV).g; // WAS: u_webcamTexture
                    float b_channel = texture2D(u_sourceTexture, distortedUV + b_offset).b; // WAS: u_webcamTexture
                    finalColor = vec4(r_channel, g_channel, b_channel, 1.0);

                    // Scanlines
                    // The constant 3.1415926535 * 2.0 is 2*PI.
                    float scanlineEffect = sin(distortedUV.y * u_scanlineDensity * 6.283185307);
                    scanlineEffect = (scanlineEffect + 1.0) * 0.5; // Remap to 0-1
                    finalColor.rgb *= (1.0 - u_scanlineIntensity * (1.0 - scanlineEffect));
                }

                // Vignette
                // The 1.414 is approx sqrt(2) to make vignette reach corners better.
                float vignette = 1.0 - u_vignetteStrength * smoothstep(u_vignetteSoftness, 0.0, length(centeredUV * 1.41421356));
                finalColor.rgb *= vignette;

                // Brightness, contrast, saturation are handled by the FinalPassShader
                // finalColor.rgb = adjustSaturation(
                //     adjustBrightnessContrast(finalColor.rgb, u_brightness, u_contrast),
                //     u_saturation
                // );
                gl_FragColor = finalColor; // Already clamped by previous operations or needs explicit clamp if B/C/S removed
            }
        `;
    }

    getDatamoshFragmentSource() {
        // NOTE: This shader uses u_webcamTexture and u_previousFrameTexture.
        // It also has specific uniforms: u_intensity, u_displacement, u_feedback
        // And global uniforms: u_time, u_motionThreshold, u_trailPersistence, u_hueShiftSpeed,
        // u_motionExtrapolation, u_brightness, u_contrast, u_saturation.
        // The VideoEngine will need to manage and supply all of these.
        return `
            precision highp float;
            varying vec2 v_texCoord;

            uniform sampler2D u_sourceTexture; // WAS: u_webcamTexture - Current composited scene
            uniform sampler2D u_previousFrameTexture; // Output of the previous full frame

            uniform float u_time;
            uniform float u_motionThreshold;
            uniform float u_trailPersistence;
            uniform float u_hueShiftSpeed;
            uniform float u_motionExtrapolation;

            // Datamosh specific
            uniform float u_intensity;
            uniform float u_displacement;
            uniform float u_feedback;

            // Global adjustments (also part of the shader's original spec)
            uniform float u_brightness;
            uniform float u_contrast;
            uniform float u_saturation;

            // Helper functions from the spec
            float random (vec2 st) { return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123 + u_time * 0.01); }
            float noise (vec2 st) { vec2 i = floor(st); vec2 f = fract(st); float a = random(i); float b = random(i + vec2(1.,0.)); float c = random(i + vec2(0.,1.)); float d = random(i + vec2(1.,1.)); vec2 u = f*f*(3.0-2.0*f); return mix(a, b, u.x) + (c - a)* u.y * (1.0 - u.x) + (d - b) * u.x * u.y; }
            vec3 rgb2hsl(vec3 color) { float r = color.r; float g = color.g; float b = color.b; float maxC = max(max(r, g), b); float minC = min(min(r, g), b); float h = 0.0, s = 0.0, l = (maxC + minC) / 2.0; if (maxC == minC) { h = s = 0.0; } else { float d = maxC - minC; s = l > 0.5 ? d / (2.0 - maxC - minC) : d / (maxC + minC); if (maxC == r) { h = (g - b) / d + (g < b ? 6.0 : 0.0); } else if (maxC == g) { h = (b - r) / d + 2.0; } else if (maxC == b) { h = (r - g) / d + 4.0; } h /= 6.0; } return vec3(h, s, l); }
            float hue2rgb(float p, float q, float t) { if(t < 0.0) t += 1.0; if(t > 1.0) t -= 1.0; if(t < 1.0/6.0) return p + (q - p) * 6.0 * t; if(t < 1.0/2.0) return q; if(t < 2.0/3.0) return p + (q - p) * (2.0/3.0 - t) * 6.0; return p; }
            vec3 hsl2rgb(vec3 hsl) { float h = hsl.x; float s = hsl.y; float l = hsl.z; float r, g, b; if(s == 0.0){ r = g = b = l; } else { float q = l < 0.5 ? l * (1.0 + s) : l + s - l * s; float p = 2.0 * l - q; r = hue2rgb(p, q, h + 1.0/3.0); g = hue2rgb(p, q, h); b = hue2rgb(p, q, h - 1.0/3.0); } return vec3(r, g, b); }
            vec3 adjustBrightnessContrast(vec3 color, float brightness, float contrast) { vec3 result = color + brightness; result = (result - 0.5) * contrast + 0.5; return clamp(result, 0.0, 1.0); }
            vec3 adjustSaturation(vec3 color, float saturation) { vec3 gray = vec3(dot(color, vec3(0.2126, 0.7152, 0.0722))); return mix(gray, color, saturation); }

            void main() {
                // The spec uses 'mirroredTexCoord' for u_webcamTexture.
                // If VideoEngine already handles mirroring for video layers, this might double-mirror.
                // For now, assume VideoEngine provides non-mirrored video, so this shader's mirroring is desired.
                vec2 mirroredTexCoord = vec2(1.0 - v_texCoord.x, v_texCoord.y);

                vec4 currentSourceColor = texture2D(u_sourceTexture, mirroredTexCoord); // WAS: u_webcamTexture, currentWebcamColor
                vec4 previousOrStaticColor = texture2D(u_previousFrameTexture, v_texCoord); // previousFrame is not mirrored in spec

                float difference = length(currentSourceColor.rgb - previousOrStaticColor.rgb);
                vec4 finalColor; vec4 motionDerivedColor; vec4 staticDerivedColor;

                float displacementAmount = u_displacement * (1.0 + u_intensity * 2.0);
                vec2 R_offset = vec2(random(mirroredTexCoord.yx + u_time * 0.1) - 0.5) * displacementAmount;
                vec2 B_offset = vec2(random(mirroredTexCoord.xy - u_time * 0.1) - 0.5) * displacementAmount;

                motionDerivedColor = vec4(
                    texture2D(u_sourceTexture, mirroredTexCoord + R_offset).r, // WAS: u_webcamTexture
                    currentSourceColor.g, // WAS: currentWebcamColor.g
                    texture2D(u_sourceTexture, mirroredTexCoord + B_offset).b, // WAS: u_webcamTexture
                    1.0
                );

                vec2 smearOffset = vec2(noise(v_texCoord*8.0 + u_time*0.05)-0.5) * 0.003 * (1.0 + u_feedback * 3.0);
                vec4 smearedPreviousOrStatic = texture2D(u_previousFrameTexture, v_texCoord + smearOffset);

                float adjustedTrailPersistence = clamp(u_trailPersistence * (1.0 + u_intensity * 0.5), 0.0, 1.0);
                // The spec had clamp(..., 0.0, 100.0) which is likely a typo for a mix factor. Assuming 0.0 to 1.0.
                staticDerivedColor = mix(currentSourceColor, smearedPreviousOrStatic, adjustedTrailPersistence); // WAS: currentWebcamColor

                if (difference > u_motionThreshold) {
                    finalColor = mix(staticDerivedColor, motionDerivedColor, 0.85 * (1.0 + u_intensity * 0.3));
                } else {
                    finalColor = staticDerivedColor;
                }

                if (u_motionExtrapolation > 0.0) {
                    vec2 pseudoVelocityOffset = vec2(noise(v_texCoord*8.0 + u_time*0.05)-0.5) * 0.003 * (1.0 + u_feedback);
                    vec2 extrapolatedCoord = v_texCoord + pseudoVelocityOffset * u_motionExtrapolation;
                    vec4 extrapolatedColor = texture2D(u_previousFrameTexture, extrapolatedCoord);
                    float extrapolationMix = u_motionExtrapolation * smoothstep(u_motionThreshold + 0.05, u_motionThreshold - 0.05, difference);
                    extrapolationMix = clamp(extrapolationMix, 0.0, 0.9);
                    finalColor = mix(finalColor, extrapolatedColor, extrapolationMix);
                }

                if (u_hueShiftSpeed != 0.0) {
                    vec3 hsl = rgb2hsl(finalColor.rgb);
                    hsl.x = fract(hsl.x + u_time * u_hueShiftSpeed);
                    if (hsl.y < 0.1) { hsl.y = 0.7; } // Boost saturation if too low during hue shift
                    finalColor.rgb = hsl2rgb(hsl);
                }

                // Brightness, contrast, saturation are handled by the FinalPassShader
                // finalColor.rgb = adjustSaturation(
                //     adjustBrightnessContrast(finalColor.rgb, u_brightness, u_contrast),
                //     u_saturation
                // );

                finalColor = clamp(finalColor, 0.0, 1.0);
                if (finalColor.a < 0.01) discard; // Keep discard as per spec
                gl_FragColor = finalColor;
            }
        `;
    }

    getFinalPassFragmentSource() {
        return this._getBaseFragmentPrelude() + `
            // Helper functions for final pass adjustments
            vec3 adjustBrightnessContrast(vec3 color, float brightness, float contrast) {
                vec3 result = color + brightness;
                result = (result - 0.5) * contrast + 0.5;
                return clamp(result, 0.0, 1.0);
            }
            vec3 adjustSaturation(vec3 color, float saturation) {
                // u_saturation is expected to be a uniform available here
                vec3 gray = vec3(dot(color, vec3(0.2126, 0.7152, 0.0722)));
                return mix(gray, color, saturation);
            }

            void main() {
                vec3 effectedColor = texture2D(u_sourceTexture, v_texCoord).rgb; // WAS: u_texture

                // Apply global audio enhancements
                if (u_audioEnergy > 0.5) {
                    effectedColor += vec3(0.05, 0.02, 0.01) * u_audioEnergy;
                }
                if (u_beat > 0.7) {
                    effectedColor *= (1.0 + u_beat * 0.2);
                }

                // Apply global brightness, contrast, saturation adjustments
                // Assumes u_brightness, u_contrast, u_saturation are available via setGlobalUniforms
                effectedColor = adjustSaturation(
                    adjustBrightnessContrast(effectedColor, u_brightness, u_contrast),
                    u_saturation
                );

                gl_FragColor = vec4(effectedColor, u_opacity); // u_opacity will be masterOpacity
            }
        `;
    }

    getPixelateFragmentSource() {
        return this._getBaseFragmentPrelude() + `
            vec3 effect_pixelate(vec2 coord, sampler2D tex, float beat, float audioEnergy) {
                float pixelSize = 0.02 + beat * 0.08 + audioEnergy * 0.05;
                pixelSize = max(0.001, pixelSize); // Prevent division by zero if pixelSize is too small or zero
                vec2 grid = floor(coord / pixelSize) * pixelSize;
                return texture2D(tex, grid).rgb;
            }

            void main() {
                vec3 effectedColor = effect_pixelate(v_texCoord, u_texture, u_beat, u_audioEnergy);
                ${this._getGlobalEnhancements()}
                gl_FragColor = vec4(effectedColor, u_opacity);
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

    // === Methods for Single-Effect Shaders (for multi-pass rendering) ===

    _getBaseFragmentPrelude() {
        return `
            precision mediump float;
            uniform sampler2D u_sourceTexture; // Standardized name for the main input texture
            uniform float u_opacity;     // Opacity for the final output (usually 1.0 for intermediate)
            uniform float u_time;
            uniform vec2 u_resolution;
            // Audio reactive uniforms
            uniform float u_beat;
            uniform float u_bassLevel;
            uniform float u_trebleLevel;
            uniform float u_audioEnergy;
            uniform vec3 u_audioFrequencies;
            varying vec2 v_texCoord;

            float noise(vec2 co) { // Noise function, used by some effects
                return fract(sin(dot(co.xy, vec2(12.9898, 78.233))) * 43758.5453);
            }
        `;
    }

    // _getGlobalEnhancements() { // Logic moved to getFinalPassFragmentSource, no longer needed here.
    //     return `
    //         if (u_audioEnergy > 0.5) {
    //             effectedColor += vec3(0.05, 0.02, 0.01) * u_audioEnergy;
    //         }
    //         if (u_beat > 0.7) {
    //             effectedColor *= (1.0 + u_beat * 0.2);
    //         }
    //     `;
    // }

    getPassthroughFragmentSource() {
        return this._getBaseFragmentPrelude() + `
            void main() {
                vec3 effectedColor = texture2D(u_sourceTexture, v_texCoord).rgb; // Changed u_texture to u_sourceTexture
                // Global enhancements removed, will be applied in final pass
                gl_FragColor = vec4(effectedColor, u_opacity);
            }
        `;
    }

    getRgbShiftFragmentSource() {
        return this._getBaseFragmentPrelude() + `
            vec3 effect_rgbShift(vec2 coord, sampler2D tex, float audioEnergy, float beat, vec3 audioFreq) {
                float intensity = 0.005 + audioEnergy * 0.015;
                float offset = intensity * (1.0 + beat * 0.5);

                float r = texture2D(tex, coord + vec2(offset, 0.0)).r;
                float g = texture2D(tex, coord).g;
                float b = texture2D(tex, coord - vec2(offset, 0.0)).b;

                r += audioFreq.x * 0.2;
                g += audioFreq.y * 0.2;
                b += audioFreq.z * 0.2;

                return vec3(r, g, b);
            }

            void main() {
                vec3 effectedColor = effect_rgbShift(v_texCoord, u_sourceTexture, u_audioEnergy, u_beat, u_audioFrequencies); // Changed u_texture
                // Global enhancements removed
                gl_FragColor = vec4(effectedColor, u_opacity);
            }
        `;
    }

    getDistortFragmentSource() {
        return this._getBaseFragmentPrelude() + `
            vec3 effect_distort(vec2 coord, sampler2D tex, float time, float audioEnergy) {
                float distortionAmount = 0.03 + audioEnergy * 0.02;
                vec2 distortedCoord = coord + sin(coord * 15.0 + time * 2.0) * distortionAmount;
                return texture2D(tex, distortedCoord).rgb;
            }

            void main() {
                vec3 effectedColor = effect_distort(v_texCoord, u_sourceTexture, u_time, u_audioEnergy); // Changed u_texture
                // Global enhancements removed
                gl_FragColor = vec4(effectedColor, u_opacity);
            }
        `;
    }

    getColorFragmentSource() { // Renamed from getColorCycleFragmentSource
        return this._getBaseFragmentPrelude() + `
            vec3 effect_color(vec3 sourceColor, float time, float bassLevel, float trebleLevel, vec3 audioFreq) { // Renamed
                return sourceColor * vec3(
                    1.0 + sin(time * 1.0 + bassLevel * 3.0) * 0.5,
                    1.0 + sin(time * 1.1 + audioFreq.y * 3.0) * 0.5, // audioFreq.y is mid
                    1.0 + sin(time * 1.2 + trebleLevel * 3.0) * 0.5
                );
            }

            void main() {
                vec3 sourceColor = texture2D(u_sourceTexture, v_texCoord).rgb; // Changed u_texture
                vec3 effectedColor = effect_color(sourceColor, u_time, u_bassLevel, u_trebleLevel, u_audioFrequencies);
                // Global enhancements removed
                gl_FragColor = vec4(effectedColor, u_opacity);
            }
        `;
    }

    getZoomFragmentSource() { // Renamed from getZoomPulseFragmentSource
        return this._getBaseFragmentPrelude() + `
            vec3 effect_zoom(vec2 coord, sampler2D tex, float time, float bassLevel, float trebleLevel, vec3 audioFreq, float audioEnergy) { // Renamed
                vec2 center = vec2(0.5, 0.5);

                float bZoom = 1.0 + bassLevel * 0.3;
                float mZoom = 1.0 + audioFreq.y * 0.2; // audioFreq.y is mid
                float tZoom = 1.0 + trebleLevel * 0.15;

                float combinedZoom = bZoom * mZoom * tZoom;
                combinedZoom *= (1.0 + sin(time * 3.0) * 0.1); // Pulsing
                combinedZoom = max(0.00001, combinedZoom);

                float invCombinedZoom = 1.0 / combinedZoom;
                vec2 uv = (coord - center) * invCombinedZoom + center;

                float rotation = audioEnergy * 0.1;
                float c = cos(rotation);
                float s = sin(rotation);
                mat2 rotMatrix = mat2(c, -s, s, c);
                uv = rotMatrix * (uv - center) + center;

                // Basic boundary check for zoomed UVs to avoid artifacts from CLAMP_TO_EDGE if uv goes far out
                if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
                    return vec3(0.0); // Or some background color
                }
                return texture2D(tex, uv).rgb;
            }

            void main() {
                vec3 effectedColor = effect_zoom(v_texCoord, u_sourceTexture, u_time, u_bassLevel, u_trebleLevel, u_audioFrequencies, u_audioEnergy); // Changed u_texture
                // Global enhancements removed
                gl_FragColor = vec4(effectedColor, u_opacity);
            }
        `;
    }

    getStrobeFragmentSource() {
        return this._getBaseFragmentPrelude() + `
            vec3 effect_strobe(vec2 coord, sampler2D tex, float time, float bassLevel, float trebleLevel, vec3 audioFreq) {
                vec3 sourceColor = texture2D(tex, coord).rgb;
                vec3 effectedColor = sourceColor;

                float bassStrobeFactor = step(0.7, sin(time * 20.0 + bassLevel * 30.0));
                effectedColor = mix(effectedColor, vec3(1.0, 0.2, 0.2), bassStrobeFactor * bassLevel * 0.8);

                float midStrobeFactor = step(0.6, sin(time * 35.0 + audioFreq.y * 40.0)); // audioFreq.y is mid
                effectedColor = mix(effectedColor, vec3(0.2, 1.0, 0.2), midStrobeFactor * audioFreq.y * 0.6);

                float trebleStrobeFactor = step(0.5, sin(time * 50.0 + trebleLevel * 60.0));
                effectedColor = mix(effectedColor, vec3(0.2, 0.2, 1.0), trebleStrobeFactor * trebleLevel * 0.7);

                return effectedColor;
            }

            void main() {
                vec3 effectedColor = effect_strobe(v_texCoord, u_sourceTexture, u_time, u_bassLevel, u_trebleLevel, u_audioFrequencies); // Changed u_texture
                // Global enhancements removed
                gl_FragColor = vec4(effectedColor, u_opacity);
            }
        `;
    }

    getGlitchFragmentSource() {
        // Extracted and adapted from the original advancedGlitchEffect
        return this._getBaseFragmentPrelude() + `
            vec3 effect_glitch(vec2 coord, sampler2D tex, float time, float beat, vec3 audioFreq, float audioEnergy, float bassLevel) {
                vec2 uv = coord;
                float glitchIntensity = beat * 2.0 + audioEnergy;

                if (audioFreq.x > 0.6) {
                    uv.x += sin(uv.y * 100.0 + time * 10.0) * 0.02 * glitchIntensity;
                }
                if (bassLevel > 0.7) {
                    uv.y += cos(uv.x * 80.0 + time * 8.0) * 0.015 * bassLevel;
                }

                float noiseLevel = noise(uv * 800.0 + time) * audioEnergy;
                vec3 color = texture2D(tex, uv).rgb;

                if (beat > 0.8) {
                    color.r += sin(time * 40.0 + audioFreq.x * 10.0) * 0.3;
                    color.g += cos(time * 35.0 + audioFreq.y * 8.0) * 0.2;
                    color.b += sin(time * 30.0 + audioFreq.z * 12.0) * 0.25;
                }
                color += vec3(noiseLevel * 0.1);
                return color;
            }

            void main() {
                vec3 effectedColor = effect_glitch(v_texCoord, u_sourceTexture, u_time, u_beat, u_audioFrequencies, u_audioEnergy, u_bassLevel); // Changed u_texture
                // Global enhancements removed
                gl_FragColor = vec4(effectedColor, u_opacity);
            }
        `;
    }

    getInvertFragmentSource() {
        return this._getBaseFragmentPrelude() + `
            vec3 effect_invert(vec2 coord, sampler2D tex, float beat, float audioEnergy) {
                vec3 sourceColor = texture2D(tex, coord).rgb;
                vec3 invertedColor = 1.0 - sourceColor;
                float invertStrength = 0.7 + beat * 0.3 + audioEnergy * 0.2;
                return mix(sourceColor, invertedColor, clamp(invertStrength, 0.0, 1.0));
            }

            void main() {
                vec3 effectedColor = effect_invert(v_texCoord, u_sourceTexture, u_beat, u_audioEnergy); // Changed u_texture
                // Global enhancements removed
                gl_FragColor = vec4(effectedColor, u_opacity);
            }
        `;
    }

    getKaleidoFragmentSource() {
        return this._getBaseFragmentPrelude() + `
            vec3 effect_kaleido(vec2 coord, sampler2D tex, float time, float beat, vec3 audioFreq, float bassLevel) {
                vec2 center = vec2(0.5, 0.5);
                vec2 uv = coord - center;

                float angle = atan(uv.y, uv.x) + time * (0.5 + beat);
                float radius = length(uv);

                float segments = 6.0 + audioFreq.x * 8.0 + bassLevel * 4.0;
                segments = max(1.0, segments);
                float segmentAngle = 6.28318 / segments; // 2*PI / segments
                angle = floor(angle / segmentAngle) * segmentAngle;

                float scaleX = 1.0 + audioFreq.y * 0.3;
                float scaleY = 1.0 + audioFreq.z * 0.3;
                float beatScale = 1.0 + beat * 0.4;

                uv = vec2(cos(angle), sin(angle)) * radius * beatScale;
                uv.x *= scaleX;
                uv.y *= scaleY;
                uv += center;

                return texture2D(tex, uv).rgb;
            }

            void main() {
                vec3 effectedColor = effect_kaleido(v_texCoord, u_sourceTexture, u_time, u_beat, u_audioFrequencies, u_bassLevel); // Changed u_texture
                // Global enhancements removed
                gl_FragColor = vec4(effectedColor, u_opacity);
            }
        `;
    }

    getPixelateFragmentSource() { // Re-adding here correctly
        return this._getBaseFragmentPrelude() + `
            vec3 effect_pixelate(vec2 coord, sampler2D tex, float beat, float audioEnergy) {
                float pixelSize = 0.02 + beat * 0.08 + audioEnergy * 0.05;
                pixelSize = max(0.001, pixelSize);
                vec2 grid = floor(coord / pixelSize) * pixelSize;
                return texture2D(tex, grid).rgb;
            }

            void main() {
                vec3 effectedColor = effect_pixelate(v_texCoord, u_sourceTexture, u_beat, u_audioEnergy); // Changed u_texture
                // Global enhancements removed
                gl_FragColor = vec4(effectedColor, u_opacity);
            }
        `;
    }

    getMirrorFragmentSource() {
        return this._getBaseFragmentPrelude() + `
            vec3 effect_mirror(vec2 coord, sampler2D tex) {
                vec2 uv = coord;
                if (uv.x > 0.5) uv.x = 1.0 - uv.x;
                return texture2D(tex, uv).rgb;
            }

            void main() {
                vec3 effectedColor = effect_mirror(v_texCoord, u_sourceTexture); // Changed u_texture
                // Global enhancements removed
                gl_FragColor = vec4(effectedColor, u_opacity);
            }
        `;
    }

    // Add other effect shader sources here following the same pattern...

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