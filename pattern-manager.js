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
        for (let i = 0; i < 8; i++) {
            const stepElement = document.querySelector(`[data-step="${i}"]`);
            const patternData = this.recordedPatterns.get(i);
            
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
        this.recordedPatterns.clear();
        document.querySelectorAll('.sequencer-step').forEach(step => {
            step.classList.remove('pattern-recorded');
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
        if (patterns.current) {
            this.recordedPatterns = new Map(patterns.current);
        }
        if (patterns.slots) {
            this.patternSlots = new Map(patterns.slots);
        }
    }
}