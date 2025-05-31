// Basit Logger Utility - Sadece console logging
const config = require('../config');

class Logger {
  constructor() {
    this.level = config.system.logLevel;
  }

  info(message, data = null) {
    if (this.shouldLog('info')) {
      console.log(`[${new Date().toISOString()}] INFO: ${message}`, data ? JSON.stringify(data, null, 2) : '');
    }
  }

  error(message, error = null) {
    if (this.shouldLog('error')) {
      console.error(`[${new Date().toISOString()}] ERROR: ${message}`, error ? error.stack || error : '');
    }
  }

  warn(message, data = null) {
    if (this.shouldLog('warn')) {
      console.warn(`[${new Date().toISOString()}] WARN: ${message}`, data ? JSON.stringify(data, null, 2) : '');
    }
  }

  debug(message, data = null) {
    if (this.shouldLog('debug')) {
      console.log(`[${new Date().toISOString()}] DEBUG: ${message}`, data ? JSON.stringify(data, null, 2) : '');
    }
  }

  shouldLog(level) {
    const levels = { error: 0, warn: 1, info: 2, debug: 3 };
    return levels[level] <= levels[this.level];
  }
}

module.exports = new Logger(); 