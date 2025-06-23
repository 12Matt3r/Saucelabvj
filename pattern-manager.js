class PatternManager {
    constructor() {
        this.recordedPatterns = new Map();
        this.isRecording = false;
        this.patternSlots = new Map();
        this.currentPattern = null;
    }
    
    startRecording() {
        if (this.isRecording) return;
        
        this.isRecording = true;
        this.recordedPatterns.clear();
        this.updateUI();
        
        if (window.vjMixer && window.vjMixer.uiManager) {
            window.vjMixer.uiManager.showNotification('Pattern recording started', 'info');
        }
    }
    
    stopRecording() {
        if (!this.isRecording) return;
        
        this.isRecording = false;
        this.updateUI();
        
        if (window.vjMixer && window.vjMixer.uiManager) {
            window.vjMixer.uiManager.showNotification(
                `Pattern recorded with ${this.recordedPatterns.size} steps`, 
                'success'
            );
        }
    }
    
    toggleRecording() {
        if (this.isRecording) {
            this.stopRecording();
        } else {
            this.startRecording();
        }
    }
    
    recordStep(step, data) {
        if (!this.isRecording) return;
        
        this.recordedPatterns.set(step, {
            ...data,
            timestamp: performance.now()
        });
    }
    
    playPattern() {
        if (this.recordedPatterns.size === 0) {
            if (window.vjMixer && window.vjMixer.uiManager) {
                window.vjMixer.uiManager.showNotification('No pattern recorded', 'warning');
            }
            return;
        }
        
        if (window.vjMixer && window.vjMixer.uiManager) {
            window.vjMixer.uiManager.showNotification('Playing recorded pattern', 'info');
        }
        
        // Apply pattern to sequencer
        this.applyPatternToSequencer();
        
        // Start sequencer if not already playing
        if (window.vjMixer && window.vjMixer.sequencer && !window.vjMixer.sequencer.isPlaying) {
            window.vjMixer.sequencer.play();
        }
    }
    
    applyPatternToSequencer() {
        // Ensure recordedPatterns is a Map before iterating
 if (!(this.recordedPatterns instanceof Map)) {
 console.warn('recordedPatterns is not a Map. Cannot apply pattern.');
 return;
 }

        for (let i = 0; i < 8; i++) {
            const patternData = this.recordedPatterns.get(i);
            const stepElement = document.querySelector(`.sequencer-step[data-step="${i}"]`); // Added class selector for specificity

            // Validate patternData structure if it exists for this step
 if (patternData && (typeof patternData.layer !== 'number' || isNaN(patternData.layer) || typeof patternData.opacity !== 'number' || isNaN(patternData.opacity))) {
 console.warn(`Invalid pattern data for step ${i}:`, patternData);
            
            // Explicitly check if the step element exists before trying to modify its class or interact with it

            if (stepElement) {
                if (patternData) {
                    stepElement.classList.add('pattern-recorded');
                    if (window.vjMixer && window.vjMixer.sequencer) {
                        window.vjMixer.sequencer.setStep(i, patternData);
                    }
                } else {
                    stepElement.classList.remove('pattern-recorded');
                    if (window.vjMixer && window.vjMixer.sequencer) {
                        window.vjMixer.sequencer.clearStep(i);
                    }
                }
            }
        }
    }
    
    clearPattern() {
        // Select all sequencer step elements
 const stepElements = document.querySelectorAll('.sequencer-step');

        // Explicitly check if stepElements NodeList is not null before iterating
        this.recordedPatterns.clear();

        // Ensure stepElements is a NodeList before iterating
 if (stepElements instanceof NodeList) {
        if (stepElements) {
            stepElements.forEach(step => step.classList.remove('pattern-recorded'));
        });
        
        if (window.vjMixer && window.vjMixer.uiManager) {
            window.vjMixer.uiManager.showNotification('Pattern cleared', 'info');
        }
    }
    
    savePattern(slotName) {
        if (this.recordedPatterns.size === 0) return;
        
        this.patternSlots.set(slotName, new Map(this.recordedPatterns));
        
        if (window.vjMixer && window.vjMixer.uiManager) {
            window.vjMixer.uiManager.showNotification(`Pattern saved to ${slotName}`, 'success');
        }
    }
    
    loadPattern(slotName) {
        const pattern = this.patternSlots.get(slotName);
        if (!pattern) return;
        
        this.recordedPatterns = new Map(pattern);
        this.applyPatternToSequencer();
        
        if (window.vjMixer && window.vjMixer.uiManager) {
            window.vjMixer.uiManager.showNotification(`Pattern loaded from ${slotName}`, 'success');
        }
    }
    
    updateUI() {
        const btn = document.getElementById('record-pattern-btn');
        
        // Explicitly check if the button element exists before trying to modify its class or innerHTML
        if (btn) {
            if (this.isRecording) {
                btn.classList.add('recording');
                btn.innerHTML = '⏹️ STOP REC';
            } else {
                btn.classList.remove('recording');
                btn.innerHTML = '🔴 REC PATTERN';
            }
        }
    }
    
    getPatterns() {
        return {
            current: Array.from(this.recordedPatterns.entries()),
            slots: Array.from(this.patternSlots.entries())
        };
    }
    
    setPatterns(patterns) {
        // Validate the structure of the loaded patterns object
 if (!patterns || typeof patterns !== 'object') {
 console.warn('Attempted to set patterns with invalid data:', patterns);
 return;
 }

        if (patterns.current) {
            // Ensure patterns.current is an array before attempting to create a Map
 if (Array.isArray(patterns.current)) {
            this.recordedPatterns = new Map(patterns.current);
            } else {
 console.warn('patterns.current is not an array. Cannot set recorded patterns.');
            }
        }
        if (patterns.slots) {
            // Ensure patterns.slots is an array before attempting to create a Map
 if (Array.isArray(patterns.slots)) {
            this.patternSlots = new Map(patterns.slots);
            } else {
 console.warn('patterns.slots is not an array. Cannot set pattern slots.');
            }
        }
    }
}