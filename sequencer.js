class Sequencer {
    constructor() {
        this.bpm = 120;
        this.isPlaying = false;
        this.currentStep = 0;
        this.steps = new Array(8).fill(null);
        this.intervalId = null;
        this.tapTimes = [];
        this.onStepChange = null;
        this.startTime = 0;
    }
    
    setBPM(bpm) {
        this.bpm = Math.max(60, Math.min(200, bpm));
        
        if (this.isPlaying) {
            this.stop();
            this.play();
        }
    }
    
    play() {
        if (this.isPlaying) return;
        
        this.isPlaying = true;
        this.currentStep = 0;
        this.startTime = performance.now();
        
        const stepDuration = (60 / this.bpm / 4) * 1000; // 16th notes
        
        this.intervalId = setInterval(() => {
            this.triggerStep(this.currentStep);
            this.currentStep = (this.currentStep + 1) % 8;
        }, stepDuration);
        
        console.log(`Sequencer started at ${this.bpm} BPM`);
    }
    
    stop() {
        if (!this.isPlaying) return;
        
        this.isPlaying = false;
        
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
        
        this.currentStep = 0;
        
        console.log('Sequencer stopped');
    }
    
    triggerStep(step) {
        const stepData = this.steps[step];
        
        if (this.onStepChange) {
            this.onStepChange(step, stepData);
        }
    }
    
    setStep(step, data) {
        if (step >= 0 && step < 8) {
            this.steps[step] = data;
        }
    }
    
    clearStep(step) {
        if (step >= 0 && step < 8) {
            this.steps[step] = null;
        }
    }
    
    tapTempo() {
        const now = performance.now();
        this.tapTimes.push(now);
        
        // Keep only the last 4 taps
        if (this.tapTimes.length > 4) {
            this.tapTimes.shift();
        }
        
        // Calculate BPM from intervals
        if (this.tapTimes.length >= 2) {
            const intervals = [];
            
            for (let i = 1; i < this.tapTimes.length; i++) {
                intervals.push(this.tapTimes[i] - this.tapTimes[i - 1]);
            }
            
            const averageInterval = intervals.reduce((a, b) => a + b) / intervals.length;
            const bpm = 60000 / averageInterval; // Convert ms to BPM
            
            if (bpm >= 60 && bpm <= 200) {
                this.setBPM(Math.round(bpm));
                return this.bpm;
            }
        }
        
        return null;
    }
    
    reset() {
        this.stop();
        this.steps.fill(null);
        this.tapTimes = [];
    }
}