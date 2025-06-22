class MIDIController {
    constructor() {
        this.midiAccess = null;
        this.inputs = new Map();
        this.outputs = new Map();
        this.lastMIDIMessage = null;
        this.onMIDIMessage = null;
    }
    
    async init() {
        try {
            this.midiAccess = await navigator.requestMIDIAccess();
            this.setupMIDI();
            console.log('MIDI Controller initialized');
        } catch (error) {
            console.warn('MIDI not available:', error);
        }
    }
    
    setupMIDI() {
        if (!this.midiAccess) return;
        
        // Setup inputs
        for (const input of this.midiAccess.inputs.values()) {
            this.inputs.set(input.id, input);
            input.onmidimessage = this.handleMIDIMessage.bind(this);
            console.log(`MIDI Input connected: ${input.name}`);
        }
        
        // Setup outputs
        for (const output of this.midiAccess.outputs.values()) {
            this.outputs.set(output.id, output);
            console.log(`MIDI Output connected: ${output.name}`);
        }
        
        // Listen for device changes
        this.midiAccess.onstatechange = this.handleStateChange.bind(this);
    }
    
    handleMIDIMessage(event) {
        const [status, data1, data2] = event.data;
        
        // Parse MIDI message
        const channel = (status & 0x0F) + 1;
        const messageType = status & 0xF0;
        
        let type;
        switch (messageType) {
            case 0x80: // Note Off
                type = 'noteoff';
                break;
            case 0x90: // Note On
                type = data2 > 0 ? 'noteon' : 'noteoff';
                break;
            case 0xB0: // Control Change
                type = 'cc';
                break;
            default:
                return; // Ignore other message types
        }
        
        const message = {
            type,
            channel,
            data1,
            data2,
            timestamp: event.timeStamp
        };
        
        this.lastMIDIMessage = message;
        
        if (this.onMIDIMessage) {
            this.onMIDIMessage(message);
        }
        
        console.log('MIDI:', message);
    }
    
    handleStateChange(event) {
        const port = event.port;
        
        if (port.type === 'input') {
            if (port.state === 'connected') {
                this.inputs.set(port.id, port);
                port.onmidimessage = this.handleMIDIMessage.bind(this);
                console.log(`MIDI Input connected: ${port.name}`);
            } else {
                this.inputs.delete(port.id);
                console.log(`MIDI Input disconnected: ${port.name}`);
            }
        } else if (port.type === 'output') {
            if (port.state === 'connected') {
                this.outputs.set(port.id, port);
                console.log(`MIDI Output connected: ${port.name}`);
            } else {
                this.outputs.delete(port.id);
                console.log(`MIDI Output disconnected: ${port.name}`);
            }
        }
    }
    
    sendMIDI(data) {
        for (const output of this.outputs.values()) {
            output.send(data);
        }
    }
    
    getInputs() {
        return Array.from(this.inputs.values());
    }
    
    getOutputs() {
        return Array.from(this.outputs.values());
    }
}