const axios = require('axios');
const logger = require('./logger');
const EventEmitter = require('eventemitter3');

class ProxyManager extends EventEmitter {
  constructor() {
    super();
    this.proxies = [];
    this.currentIndex = 0;
    this.currentProxy = null;
    this.failures = new Map();
  }

  loadProxies(proxyList) {
    this.proxies = proxyList.map(p => {
      const url = new URL(p);
      return {
        url: p,
        protocol: url.protocol.replace(':', ''),
        host: url.hostname,
        port: parseInt(url.port),
        username: url.username || null,
        password: url.password || null,
        alive: true,
        latency: 0,
        lastUsed: null,
        failures: 0
      };
    });
    
    logger.info('Loaded ' + this.proxies.length + ' proxies');
    this.emit('loaded', this.proxies.length);
  }

  async test(proxy, timeout = 10000) {
    const start = Date.now();
    
    try {
      const config = { timeout };
      
      if (proxy.startsWith('socks')) {
        const { SocksProxyAgent } = require('socks-proxy-agent');
        config.httpsAgent = new SocksProxyAgent(proxy);
        config.httpAgent = new SocksProxyAgent(proxy);
      } else {
        const { HttpProxyAgent } = require('http-proxy-agent');
        config.httpsAgent = new HttpProxyAgent(proxy);
        config.httpAgent = new HttpProxyAgent(proxy);
      }

      const response = await axios.get('https://api.ipify.org?format=json', config);
      const latency = Date.now() - start;
      
      const proxyObj = this.proxies.find(p => p.url === proxy);
      if (proxyObj) {
        proxyObj.alive = true;
        proxyObj.latency = latency;
        proxyObj.failures = 0;
      }

      return {
        ip: response.data.ip,
        latency,
        alive: true
      };
    } catch (error) {
      const proxyObj = this.proxies.find(p => p.url === proxy);
      if (proxyObj) {
        proxyObj.alive = false;
        proxyObj.failures++;
      }

      throw new Error('Proxy test failed: ' + error.message);
    }
  }

  async testAll(timeout = 10000) {
    const results = [];
    
    for (const proxy of this.proxies) {
      try {
        const result = await this.test(proxy.url, timeout);
        results.push({ proxy: proxy.url, ...result });
      } catch (error) {
        results.push({ proxy: proxy.url, alive: false, error: error.message });
      }
    }
    
    return results;
  }

  async rotate() {
    if (this.proxies.length === 0) {
      throw new Error('No proxies configured');
    }

    // Find next alive proxy
    let attempts = 0;
    while (attempts < this.proxies.length) {
      this.currentIndex = (this.currentIndex + 1) % this.proxies.length;
      const proxy = this.proxies[this.currentIndex];
      
      if (proxy.alive && proxy.failures < 3) {
        this.currentProxy = proxy.url;
        proxy.lastUsed = Date.now();
        
        const axios = require('axios');
        const config = { timeout: 10000 };
        
        if (proxy.protocol.startsWith('socks')) {
          const { SocksProxyAgent } = require('socks-proxy-agent');
          config.httpsAgent = new SocksProxyAgent(proxy.url);
          config.httpAgent = new SocksProxyAgent(proxy.url);
        } else {
          const { HttpProxyAgent } = require('http-proxy-agent');
          config.httpsAgent = new HttpProxyAgent(proxy.url);
          config.httpAgent = new HttpProxyAgent(proxy.url);
        }

        const response = await axios.get('https://api.ipify.org?format=json', config);
        
        logger.info('Rotated to proxy: ' + proxy.host + ' -> IP: ' + response.data.ip);
        this.emit('rotated', { proxy: proxy.url, ip: response.data.ip });
        
        return {
          ip: response.data.ip,
          proxy: proxy.url
        };
      }
      
      attempts++;
    }

    // Reset failures if all proxies failed
    if (attempts >= this.proxies.length) {
      this.proxies.forEach(p => {
        p.failures = 0;
        p.alive = true;
      });
      throw new Error('All proxies failed, reset failure counts');
    }
  }

  async rotateToProxy(proxyUrl) {
    const proxy = this.proxies.find(p => p.url === proxyUrl);
    
    if (!proxy) {
      throw new Error('Proxy not found in pool');
    }

    if (!proxy.alive) {
      throw new Error('Proxy is marked as dead');
    }

    const axios = require('axios');
    const config = { timeout: 10000 };
    
    if (proxy.protocol.startsWith('socks')) {
      const { SocksProxyAgent } = require('socks-proxy-agent');
      config.httpsAgent = new SocksProxyAgent(proxy.url);
      config.httpAgent = new SocksProxyAgent(proxy.url);
    } else {
      const { HttpProxyAgent } = require('http-proxy-agent');
      config.httpsAgent = new HttpProxyAgent(proxy.url);
      config.httpAgent = new HttpProxyAgent(proxy.url);
    }

    const response = await axios.get('https://api.ipify.org?format=json', config);
    
    this.currentProxy = proxy.url;
    proxy.lastUsed = Date.now();
    
    return {
      ip: response.data.ip,
      proxy: proxy.url
    };
  }

  getCurrent() {
    return this.currentProxy;
  }

  getAlive() {
    return this.proxies.filter(p => p.alive);
  }

  getStats() {
    const alive = this.proxies.filter(p => p.alive).length;
    const dead = this.proxies.filter(p => !p.alive).length;
    const avgLatency = this.proxies
      .filter(p => p.latency > 0)
      .reduce((sum, p) => sum + p.latency, 0) / (this.proxies.filter(p => p.latency > 0).length || 1);

    return {
      total: this.proxies.length,
      alive,
      dead,
      avgLatency: Math.round(avgLatency),
      current: this.currentProxy
    };
  }

  remove(proxyUrl) {
    const index = this.proxies.findIndex(p => p.url === proxyUrl);
    if (index > -1) {
      this.proxies.splice(index, 1);
      if (this.currentProxy === proxyUrl) {
        this.currentProxy = null;
      }
      return true;
    }
    return false;
  }

  add(proxyUrl) {
    if (this.proxies.find(p => p.url === proxyUrl)) {
      return false;
    }

    const url = new URL(proxyUrl);
    this.proxies.push({
      url: proxyUrl,
      protocol: url.protocol.replace(':', ''),
      host: url.hostname,
      port: parseInt(url.port),
      username: url.username || null,
      password: url.password || null,
      alive: true,
      latency: 0,
      lastUsed: null,
      failures: 0
    });

    return true;
  }

  clear() {
    this.proxies = [];
    this.currentProxy = null;
    this.currentIndex = 0;
  }
}

module.exports = new ProxyManager();
