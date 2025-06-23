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
            console.warn('Attempted to add key assignment without valid keyCode or element.');
            return;
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
            console.warn('Attempted to add MIDI assignment without valid midiMessage or element.');
            return;
        }

        const assignment = this.createAssignment(element);
        this.midiAssignments.get(key).push(assignment);
        element.classList.add('has-assignment');
        
        // Show success feedback
        this.showAssignmentFeedback(element, `MIDI ${midiMessage.type} ${midiMessage.data1}`);
        
        console.log(`Assigned MIDI ${key} to`, assignment);
    }
    
    createAssignment(element) {
        if (!element || !element.dataset) {
            console.warn('Attempted to create assignment from invalid element:', element);
 return {}; // Return an empty object to indicate failure or missing data
        }

        const assignment = { element: element };

        // Validate and parse data- attributes
 if (typeof element.dataset.action === 'string') {
 assignment.action = element.dataset.action;
 } else {
 console.warn('Invalid or missing action dataset for element:', element);
 }
        if (element.dataset.layer) {
            const layer = parseInt(element.dataset.layer);
            if (!isNaN(layer)) assignment.layer = layer;
 else console.warn('Invalid layer dataset for element:', element);
        } else {
 console.warn('Missing layer dataset for element:', element);
 }
 if (typeof element.dataset.effect === 'string') {
 assignment.effect = element.dataset.effect;
 } else {
 // Effect dataset might be optional for some actions
 if (element.dataset.effect !== undefined) {
 console.warn('Invalid effect dataset for element:', element);
 }
        }
        if (element.dataset.cue) {
            const cue = parseInt(element.dataset.cue);
            if (!isNaN(cue)) assignment.cue = cue;
 else console.warn('Invalid cue dataset for element:', element);
        } else {
 // Cue dataset might be optional for some actions
 if (element.dataset.cue !== undefined) {
 console.warn('Missing cue dataset for element:', element);
 }
        }
 if (element.dataset.step !== undefined) { // step can be 0
            const step = parseInt(element.dataset.step);
            if (!isNaN(step)) assignment.step = step;
 else console.warn('Invalid step dataset for element:', element);
        }
        return assignment;
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
        if (!assignment || !assignment.element || typeof assignment.action !== 'string') {
            console.warn('Attempted to execute invalid assignment:', assignment);
            return;
        }

        const { action, layer, effect, cue, element } = assignment; // step is not used in executeAssignment switch
 console.log('Executing assignment:', assignment, 'Pressed:', pressed);
        if (window.vjMixer) {
            const vjMixer = window.vjMixer;
            switch (action) {
                case 'opacity':
                    if (element.type === 'range') {
                        // For sliders, set opacity to max when pressed, restore when released
                        if (pressed) {
                            element.dataset.originalValue = element.value;
                            element.value = 1;
                            // Validate layer before calling layerManager
                            if (vjMixer.layerManager && typeof layer === 'number' && !isNaN(layer)) {
                                vjMixer.layerManager.setLayerOpacity(layer, 1);
                            }
                        } else {
                            const originalValue = parseFloat(element.dataset.originalValue || 0);
                            element.value = originalValue;
                            // Validate layer before calling layerManager
                            if (vjMixer.layerManager && typeof layer === 'number' && !isNaN(layer)) {
                                vjMixer.layerManager.setLayerOpacity(layer, originalValue);
                            }
                        }
                    }
                    break;
                case 'solo':
                    // Validate layer before calling layerManager
                    if (pressed && vjMixer.layerManager && typeof layer === 'number' && !isNaN(layer)) {
 vjMixer.layerManager.soloLayer(layer);
                    }
                    break;
                case 'hot-cue':
                    // Validate layer and cue before calling layerManager
                    if (pressed && vjMixer.layerManager && typeof layer === 'number' && !isNaN(layer) && typeof cue === 'number' && !isNaN(cue)) {
 vjMixer.layerManager.triggerHotCue(layer, cue);
                    }
                    break;
 case 'effect': // Assuming action 'effect' for toggling effects
                    // Validate effect before calling start/stopEffect
                    if (effect && typeof effect === 'string') {
 if (pressed) {
 // Check if startEffect is a function
 if (typeof vjMixer.startEffect === 'function') {
 vjMixer.startEffect(effect);
 } else {
 console.warn('vjMixer.startEffect is not a function.');
 }
 } else {
 // Check if stopEffect is a function
 if (typeof vjMixer.stopEffect === 'function') {
 vjMixer.stopEffect(effect);
 } else console.warn('vjMixer.stopEffect is not a function.');
 }
                    }
 break;
        }
    }
    
    executeMIDIAssignment(assignment, value) {
        if (!assignment || !assignment.element || typeof assignment.action !== 'string') {
            console.warn('Attempted to execute invalid MIDI assignment:', assignment);
            return;
        }

        const { action, layer, element } = assignment; // value is passed as argument

 console.log('Executing MIDI assignment:', assignment, 'Value:', value);
        switch (action) {
            case 'opacity':
                // Validate layer and value before calling layerManager
                if (window.vjMixer && window.vjMixer.layerManager && typeof layer === 'number' && !isNaN(layer) && typeof value === 'number' && !isNaN(value)) {
 window.vjMixer.layerManager.setLayerOpacity(layer, value);
                } else {
 console.warn('Invalid data for MIDI opacity assignment:', assignment, value);
 }
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
        // Validate MIDI message structure
        if (!message || !Array.isArray(message.data) || message.data.length < 2) {
 console.warn('AssignmentManager: Received unexpected MIDI message format:', message);
            return;
        }

        // Further validate essential properties
        if (typeof message.channel !== 'number' || typeof message.type !== 'string' || typeof message.data1 !== 'number') {
 console.warn('Received MIDI message with invalid essential properties:', message);
            return;
        }

        const key = `${message.channel}-${message.type}-${message.data1}`; // Use validated properties
        const assignments = this.midiAssignments.get(key);

        if (assignments) {
            assignments.forEach(assignment => {
                // For CC messages, use the value
                // Validate data2 for CC messages
                if (!assignment || typeof assignment.action !== 'string' || !assignment.element) {
 console.warn('AssignmentManager: Skipping execution of invalid MIDI assignment:', assignment);
 return;
                }

                if (message.type === 'cc' && typeof message.data2 === 'number') {
                    this.executeMIDIAssignment(assignment, message.data2 / 127);
                } else {
                    // For note messages, use pressed/released
                    this.executeAssignment(assignment, message.data2 > 0);
                }
            });
 }
    } // Corrected handleMIDI closing brace

    
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