const express = require('express');
const path = require('path');
const open = require('open');
const logger = require('./logger');
const ipManager = require('./ip-manager');
const macManager = require('./mac-manager');
const proxyManager = require('./proxy-manager');
const networkMonitor = require('./network-monitor');

class Dashboard {
  constructor(configGetter, stateGetter, stateSetter) {
    this.app = express();
    this.configGetter = configGetter;
    this.stateGetter = stateGetter;
    this.stateSetter = stateSetter;
    this.server = null;
    this.setupRoutes();
  }

  setupRoutes() {
    this.app.use(express.json());
    this.app.use(express.static(path.join(__dirname, '..', 'public')));

    // API endpoints
    this.app.get('/api/status', async (req, res) => {
      try {
        const config = this.configGetter();
        const state = this.stateGetter();
        const networkStats = networkMonitor.getStats();
        const proxyStats = proxyManager.getStats();

        res.json({
          ip: state.currentIP || networkStats.currentIP || 'Unknown',
          mode: config.mode,
          isRunning: state.isRunning,
          rotations: state.rotations,
          network: networkStats,
          proxies: proxyStats,
          uptime: state.startTime ? Math.floor((Date.now() - state.startTime) / 1000) : 0
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get('/api/history', (req, res) => {
      const state = this.stateGetter();
      res.json(state.history || []);
    });

    this.app.get('/api/network', (req, res) => {
      res.json(networkMonitor.getHistory(100));
    });

    this.app.get('/api/config', (req, res) => {
      res.json(this.configGetter());
    });

    this.app.post('/api/config', (req, res) => {
      try {
        const config = this.configGetter();
        Object.assign(config, req.body);
        this.stateSetter(config, 'config');
        res.json({ success: true });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/api/rotate', async (req, res) => {
      try {
        const config = this.configGetter();
        let result;

        if (config.mode === 'tor') {
          result = await ipManager.rotateTor();
        } else if (config.mode === 'proxy') {
          result = await proxyManager.rotate();
        } else if (config.mode === 'vpn') {
          result = await ipManager.rotateVPN();
        }

        const state = this.stateGetter();
        state.rotations++;
        state.currentIP = result.ip || result;
        state.history.push({
          timestamp: Date.now(),
          ip: state.currentIP,
          type: config.mode
        });
        this.stateSetter(state);

        res.json({ success: true, ip: state.currentIP });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/api/mac/randomize', async (req, res) => {
      try {
        const mac = await macManager.randomize(req.body.interface);
        res.json({ success: true, mac });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get('/api/mac', async (req, res) => {
      try {
        const mac = await macManager.getCurrentMAC(req.query.interface);
        res.json(mac || { error: 'No MAC found' });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get('/api/interfaces', async (req, res) => {
      try {
        const interfaces = await macManager.getInterfaces();
        res.json(interfaces);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get('/api/logs', (req, res) => {
      const lines = parseInt(req.query.lines) || 100;
      res.json(logger.getLogs(lines));
    });

    this.app.post('/api/logs/clear', (req, res) => {
      logger.clearLogs();
      res.json({ success: true });
    });

    this.app.get('/api/proxy', (req, res) => {
      res.json(proxyManager.getStats());
    });

    this.app.post('/api/proxy/test', async (req, res) => {
      try {
        const result = await proxyManager.test(req.body.proxy);
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });
  }

  start(port = 8080) {
    this.server = this.app.listen(port, () => {
      logger.success('Dashboard running at http://localhost:' + port);
      open('http://localhost:' + port);
    });
  }

  stop() {
    if (this.server) {
      this.server.close();
      this.server = null;
    }
  }
}

module.exports = Dashboard;
