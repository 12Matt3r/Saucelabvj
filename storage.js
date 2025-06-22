class VJStorage {
    constructor() {
        this.storageKey = 'vj_mixer_settings';
    }
    
    save(data) {
        try {
            const serializedData = JSON.stringify(data, this.replacer);
            localStorage.setItem(this.storageKey, serializedData);
            console.log('Settings saved');
        } catch (error) {
            console.error('Failed to save settings:', error);
        }
    }
    
    load() {
        try {
            const serializedData = localStorage.getItem(this.storageKey);
            if (serializedData) {
                return JSON.parse(serializedData, this.reviver);
            }
        } catch (error) {
            console.error('Failed to load settings:', error);
        }
        return null;
    }
    
    clear() {
        localStorage.removeItem(this.storageKey);
        console.log('Settings cleared');
    }
    
    // Custom JSON serialization to handle Maps
    replacer(key, value) {
        if (value instanceof Map) {
            return {
                dataType: 'Map',
                value: Array.from(value.entries())
            };
        }
        return value;
    }
    
    // Custom JSON deserialization to handle Maps
    reviver(key, value) {
        if (typeof value === 'object' && value !== null) {
            if (value.dataType === 'Map') {
                return new Map(value.value);
            }
        }
        return value;
    }
    
    // Auto-save functionality
    setupAutoSave(saveFunction, interval = 30000) {
        setInterval(() => {
            saveFunction();
        }, interval);
    }
}

