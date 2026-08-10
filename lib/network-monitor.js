const axios = require('axios');
const { execSync } = require('child_process');
const EventEmitter = require('eventemitter3');
const logger = require('./logger');

class NetworkMonitor extends EventEmitter {
  constructor() {
    super();
    this.isMonitoring = false;
    this.interval = null;
    this.history = [];
    this.maxHistory = 1000;
    this.lastIP = null;
    this.connectionLost = false;
  }

  start(interval = 30000) {
    if (this.isMonitoring) {
      logger.warn('Network monitoring already active');
      return;
    }

    this.isMonitoring = true;
    this.interval = setInterval(() => this.check(), interval);
    logger.info('Network monitoring started (interval: ' + interval + 'ms)');
    this.emit('started');
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    this.isMonitoring = false;
    logger.info('Network monitoring stopped');
    this.emit('stopped');
  }

  async check() {
    const timestamp = Date.now();
    
    try {
      const startTime = Date.now();
      const response = await axios.get('https://api.ipify.org?format=json', { timeout: 10000 });
      const latency = Date.now() - startTime;
      const ip = response.data.ip;
      
      // Check if IP changed
      if (this.lastIP && this.lastIP !== ip) {
        logger.info('IP changed: ' + this.lastIP + ' -> ' + ip);
        this.emit('ipChanged', { oldIP: this.lastIP, newIP: ip });
      }
      
      this.lastIP = ip;
      
      // Detect connection loss
      if (this.connectionLost) {
        logger.success('Connection restored');
        this.emit('connectionRestored');
        this.connectionLost = false;
      }

      const data = {
        timestamp,
        ip,
        latency,
        status: 'online'
      };

      this.history.push(data);
      
      // Keep history within limit
      if (this.history.length > this.maxHistory) {
        this.history = this.history.slice(-this.maxHistory);
      }

      this.emit('check', data);
      return data;

    } catch (error) {
      logger.error('Network check failed: ' + error.message);
      
      if (!this.connectionLost) {
        this.connectionLost = true;
        this.emit('connectionLost');
      }

      const data = {
        timestamp,
        ip: null,
        latency: null,
        status: 'offline',
        error: error.message
      };

      this.history.push(data);
      this.emit('check', data);
      return data;
    }
  }

  async ping(host = '8.8.8.8', count = 4) {
    return new Promise((resolve) => {
      try {
        const result = execSync(`ping -n ${count} ${host}`, { encoding: 'utf8', timeout: 10000 });
        
        const avgMatch = result.match(/Average\s*=\s*(\d+)ms/);
        const avgLatency = avgMatch ? parseInt(avgMatch[1]) : null;
        
        const lossMatch = result.match(/(\d+)% loss/);
        const packetLoss = lossMatch ? parseInt(lossMatch[1]) : 100;

        resolve({
          host,
          avgLatency,
          packetLoss,
          reachable: packetLoss < 100
        });
      } catch (error) {
        resolve({
          host,
          avgLatency: null,
          packetLoss: 100,
          reachable: false
        });
      }
    });
  }

  async traceroute(host = '8.8.8.8') {
    return new Promise((resolve) => {
      try {
        const result = execSync(`tracert -d ${host}`, { encoding: 'utf8', timeout: 30000 });
        const hops = result.split('\n')
          .filter(line => line.match(/^\s*\d+/))
          .map(line => {
            const match = line.match(/(\d+)\s+(\S+)/);
            return match ? { hop: parseInt(match[1]), ip: match[2] } : null;
          })
          .filter(Boolean);

        resolve({ host, hops });
      } catch (error) {
        resolve({ host, hops: [], error: error.message });
      }
    });
  }

  async getDNSServers() {
    try {
      const result = execSync('ipconfig /all', { encoding: 'utf8' });
      const servers = [];
      const lines = result.split('\n');
      
      for (const line of lines) {
        const match = line.match(/DNS Servers\s*:\s*(.+)/i);
        if (match) {
          servers.push(match[1].trim());
        }
      }
      
      return servers;
    } catch (error) {
      return [];
    }
  }

  async checkDNSResolution(domain = 'google.com') {
    try {
      const result = execSync(`nslookup ${domain}`, { encoding: 'utf8', timeout: 5000 });
      const resolved = result.includes('Address:');
      return { domain, resolved, server: result.split('Server:')[1]?.trim() };
    } catch (error) {
      return { domain, resolved: false, error: error.message };
    }
  }

  getHistory(limit = 100) {
    return this.history.slice(-limit);
  }

  getStats() {
    const total = this.history.length;
    const online = this.history.filter(h => h.status === 'online').length;
    const offline = this.history.filter(h => h.status === 'offline').length;
    const latencies = this.history
      .filter(h => h.latency !== null)
      .map(h => h.latency);
    
    const avgLatency = latencies.length > 0
      ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
      : 0;
    
    const minLatency = latencies.length > 0 ? Math.min(...latencies) : 0;
    const maxLatency = latencies.length > 0 ? Math.max(...latencies) : 0;

    return {
      totalChecks: total,
      online,
      offline,
      uptime: total > 0 ? Math.round((online / total) * 100) : 100,
      avgLatency,
      minLatency,
      maxLatency,
      currentIP: this.lastIP,
      isMonitoring: this.isMonitoring
    };
  }

  clearHistory() {
    this.history = [];
    logger.info('Network history cleared');
  }
}

module.exports = new NetworkMonitor();
