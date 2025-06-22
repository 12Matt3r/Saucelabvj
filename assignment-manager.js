class AssignmentManager {
    constructor() {
        this.assignmentMode = null; // 'keyboard' or 'midi'
        this.keyAssignments = new Map();
        this.midiAssignments = new Map();
        this.currentAssignmentKey = null;
    }
    
    toggleAssignmentMode(mode) {
        if (this.assignmentMode === mode) {
            this.exitAssignmentMode();
        } else {
            this.enterAssignmentMode(mode);
        }
    }
    
    enterAssignmentMode(mode) {
        this.assignmentMode = mode;
        
        // Update UI
        document.getElementById(`${mode}-assignment-btn`).classList.add('active');
        document.getElementById('assignment-overlay').classList.remove('hidden');
        document.getElementById('assignment-title').textContent = 
            mode === 'keyboard' ? 'Keyboard Assignment Mode' : 'MIDI Assignment Mode';
        
        // Add visual indicators
        document.querySelectorAll('.assignable').forEach(el => {
            el.classList.add('assignment-mode');
        });
        
        console.log(`Entered ${mode} assignment mode`);
    }
    
    exitAssignmentMode() {
        const previousMode = this.assignmentMode;
        this.assignmentMode = null;
        
        // Update UI
        if (previousMode) {
            document.getElementById(`${previousMode}-assignment-btn`).classList.remove('active');
        }
        document.getElementById('assignment-overlay').classList.add('hidden');
        
        // Remove visual indicators
        document.querySelectorAll('.assignable').forEach(el => {
            el.classList.remove('assignment-mode');
        });
        
        console.log('Exited assignment mode');
    }
    
    assignControl(element, midiMessage = null) {
        if (this.assignmentMode === 'keyboard' && this.currentAssignmentKey) {
            this.addKeyAssignment(this.currentAssignmentKey, element);
            this.currentAssignmentKey = null;
        } else if (this.assignmentMode === 'midi' && midiMessage) {
            this.addMIDIAssignment(midiMessage, element);
        }
    }
    
    addKeyAssignment(keyCode, element) {
        if (!this.keyAssignments.has(keyCode)) {
            this.keyAssignments.set(keyCode, []);
        }
        
        const assignment = this.createAssignment(element);
        this.keyAssignments.get(keyCode).push(assignment);
        element.classList.add('has-assignment');
        
        // Show success feedback
        this.showAssignmentFeedback(element, `Assigned to ${keyCode.replace('Key', '').replace('Digit', '')}`);
        
        console.log(`Assigned key ${keyCode} to`, assignment);
    }
    
    addMIDIAssignment(midiMessage, element) {
        const key = `${midiMessage.channel}-${midiMessage.type}-${midiMessage.data1}`;
        
        if (!this.midiAssignments.has(key)) {
            this.midiAssignments.set(key, []);
        }
        
        const assignment = this.createAssignment(element);
        this.midiAssignments.get(key).push(assignment);
        element.classList.add('has-assignment');
        
        // Show success feedback
        this.showAssignmentFeedback(element, `MIDI ${midiMessage.type} ${midiMessage.data1}`);
        
        console.log(`Assigned MIDI ${key} to`, assignment);
    }
    
    createAssignment(element) {
        return {
            element: element,
            action: element.dataset.action,
            layer: element.dataset.layer ? parseInt(element.dataset.layer) : null,
            effect: element.dataset.effect,
            cue: element.dataset.cue ? parseInt(element.dataset.cue) : null,
            step: element.dataset.step ? parseInt(element.dataset.step) : null
        };
    }
    
    removeAssignment(element) {
        // Remove from key assignments
        for (const [key, assignments] of this.keyAssignments.entries()) {
            const filtered = assignments.filter(a => a.element !== element);
            if (filtered.length !== assignments.length) {
                this.keyAssignments.set(key, filtered);
                if (filtered.length === 0) {
                    this.keyAssignments.delete(key);
                }
            }
        }
        
        // Remove from MIDI assignments
        for (const [key, assignments] of this.midiAssignments.entries()) {
            const filtered = assignments.filter(a => a.element !== element);
            if (filtered.length !== assignments.length) {
                this.midiAssignments.set(key, filtered);
                if (filtered.length === 0) {
                    this.midiAssignments.delete(key);
                }
            }
        }
        
        element.classList.remove('has-assignment');
        console.log('Removed assignment from element');
    }
    
    executeAssignment(assignment, pressed) {
        const { action, layer, effect, cue, step, element } = assignment;
        
        switch (action) {
            case 'opacity':
                if (element.type === 'range') {
                    // For sliders, set opacity to max when pressed, restore when released
                    if (pressed) {
                        element.dataset.originalValue = element.value;
                        element.value = 1;
                        // Need reference to layer manager
                        window.vjMixer.layerManager.setLayerOpacity(layer, 1);
                    } else {
                        const originalValue = parseFloat(element.dataset.originalValue || 0);
                        element.value = originalValue;
                        window.vjMixer.layerManager.setLayerOpacity(layer, originalValue);
                    }
                }
                break;
            case 'solo':
                if (pressed) window.vjMixer.layerManager.soloLayer(layer);
                break;
            case 'hot-cue':
                if (pressed) window.vjMixer.layerManager.triggerHotCue(layer, cue);
                break;
            default:
                // Handle effects
                if (effect) {
                    if (pressed) {
                        window.vjMixer.startEffect(effect);
                    } else {
                        window.vjMixer.stopEffect(effect);
                    }
                }
                break;
        }
    }
    
    executeMIDIAssignment(assignment, value) {
        const { action, layer, element } = assignment;
        
        switch (action) {
            case 'opacity':
                window.vjMixer.layerManager.setLayerOpacity(layer, value);
                if (element.type === 'range') {
                    element.value = value;
                }
                break;
            // Add more MIDI-specific handling as needed
        }
    }
    
    handleKeyDown(keyCode) {
        if (this.assignmentMode === 'keyboard') {
            this.currentAssignmentKey = keyCode;
            return;
        }
        
        // Execute key assignments
        const assignments = this.keyAssignments.get(keyCode);
        if (assignments) {
            assignments.forEach(assignment => {
                this.executeAssignment(assignment, true);
            });
        }
    }
    
    handleKeyUp(keyCode) {
        // Handle key release for assignments
        const assignments = this.keyAssignments.get(keyCode);
        if (assignments) {
            assignments.forEach(assignment => {
                this.executeAssignment(assignment, false);
            });
        }
    }
    
    handleMIDI(message) {
        const key = `${message.channel}-${message.type}-${message.data1}`;
        const assignments = this.midiAssignments.get(key);
        
        if (assignments) {
            assignments.forEach(assignment => {
                // For CC messages, use the value
                if (message.type === 'cc') {
                    this.executeMIDIAssignment(assignment, message.data2 / 127);
                } else {
                    // For note messages, use pressed/released
                    this.executeAssignment(assignment, message.data2 > 0);
                }
            });
        }
    }
    
    showAssignmentFeedback(element, message) {
        // Enhanced feedback with better positioning
        const existingFeedback = element.querySelector('.assignment-feedback');
        if (existingFeedback) {
            existingFeedback.remove();
        }
        
        const feedback = document.createElement('div');
        feedback.className = 'assignment-feedback enhanced';
        feedback.innerHTML = `
            <div class="feedback-content">
                <div class="feedback-icon">✓</div>
                <div class="feedback-text">${message}</div>
            </div>
        `;
        
        element.style.position = 'relative';
        element.appendChild(feedback);
        
        // Enhanced animation
        setTimeout(() => feedback.classList.add('show'), 10);
        
        setTimeout(() => {
            if (feedback.parentNode) {
                feedback.classList.add('hide');
                setTimeout(() => feedback.remove(), 300);
            }
        }, 2500);
    }
    
    getAssignments() {
        return {
            keyAssignments: Array.from(this.keyAssignments.entries()),
            midiAssignments: Array.from(this.midiAssignments.entries())
        };
    }
    
    setAssignments(assignments) {
        if (assignments.keyAssignments) {
            this.keyAssignments = new Map(assignments.keyAssignments);
        }
        
        if (assignments.midiAssignments) {
            this.midiAssignments = new Map(assignments.midiAssignments);
        }
    }
    
    clear() {
        this.keyAssignments.clear();
        this.midiAssignments.clear();
        
        document.querySelectorAll('.has-assignment').forEach(el => {
            el.classList.remove('has-assignment');
        });
    }
    
    isInAssignmentMode() {
        return this.assignmentMode !== null;
    }
}