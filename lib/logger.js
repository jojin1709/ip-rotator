const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(__dirname, '..', 'logs');
const LOG_FILE = path.join(LOG_DIR, 'rotator.log');

// Ensure log directory exists
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

class Logger {
  constructor() {
    this.levels = {
      error: 0,
      warn: 1,
      info: 2,
      debug: 3
    };
    this.level = this.levels[process.env.LOG_LEVEL || 'info'];
  }

  formatMessage(level, message, data = null) {
    const timestamp = new Date().toISOString();
    let logEntry = `[${timestamp}] [${level.toUpperCase()}] ${message}`;
    
    if (data) {
      logEntry += ' ' + JSON.stringify(data);
    }
    
    return logEntry;
  }

  writeToFile(entry) {
    fs.appendFileSync(LOG_FILE, entry + '\n');
  }

  error(message, data = null) {
    const entry = this.formatMessage('error', message, data);
    console.error('\x1b[31m%s\x1b[0m', entry);
    this.writeToFile(entry);
  }

  warn(message, data = null) {
    const entry = this.formatMessage('warn', message, data);
    console.warn('\x1b[33m%s\x1b[0m', entry);
    this.writeToFile(entry);
  }

  info(message, data = null) {
    const entry = this.formatMessage('info', message, data);
    console.log('\x1b[36m%s\x1b[0m', entry);
    this.writeToFile(entry);
  }

  debug(message, data = null) {
    if (this.level >= this.levels.debug) {
      const entry = this.formatMessage('debug', message, data);
      console.log('\x1b[90m%s\x1b[0m', entry);
      this.writeToFile(entry);
    }
  }

  success(message, data = null) {
    const entry = this.formatMessage('info', '✓ ' + message, data);
    console.log('\x1b[32m%s\x1b[0m', entry);
    this.writeToFile(entry);
  }

  getLogs(lines = 100) {
    if (!fs.existsSync(LOG_FILE)) {
      return [];
    }
    
    const content = fs.readFileSync(LOG_FILE, 'utf8');
    const allLines = content.split('\n').filter(line => line.trim());
    return allLines.slice(-lines);
  }

  clearLogs() {
    if (fs.existsSync(LOG_FILE)) {
      fs.writeFileSync(LOG_FILE, '');
    }
  }
}

module.exports = new Logger();
