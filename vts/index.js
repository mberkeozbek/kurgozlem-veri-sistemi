// KurGözlem Veri Toplama Sistemi (VTS) - Ana Dosya
const cron = require('node-cron');
const axios = require('axios');
const express = require('express');
const config = require('./config');
const logger = require('./utils/logger');
const nosyApiService = require('./services/nosyApiService');
const dataProcessor = require('./services/dataProcessor');

class VeriToplamaSistemi {
  constructor() {
    this.isRunning = false;
    this.lastSuccessfulFetch = null;
    this.fetchCount = 0;
    this.errorCount = 0;
    this.app = express();
    this.startTime = new Date();
  }

  // Health check serveri başlat
  setupHealthServer() {
    this.app.use(express.json());
    
    // CORS ekleme
    this.app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Content-Type');
      next();
    });

    // Health check endpoint
    this.app.get('/health', (req, res) => {
      const uptime = Math.floor(process.uptime());
      const memoryUsage = process.memoryUsage();
      const memoryMB = Math.round(memoryUsage.heapUsed / 1024 / 1024);
      const os = require('os');
      const fs = require('fs');
      
      let healthStatus = 'healthy';
      if (this.errorCount > 5) {
        healthStatus = 'warning';
      } else if (this.errorCount > 10) {
        healthStatus = 'critical';
      }

      // Sistem kaynak bilgileri
      const loadAverage = os.loadavg();
      const totalMemory = Math.round(os.totalmem() / 1024 / 1024);
      const freeMemory = Math.round(os.freemem() / 1024 / 1024);
      const usedMemory = totalMemory - freeMemory;

      // Disk usage hesapla
      let diskUsage = 'N/A';
      try {
        const exec = require('child_process').execSync;
        const dfOutput = exec('df -h / | tail -1', { encoding: 'utf8' });
        const parts = dfOutput.split(/\s+/);
        if (parts.length >= 5) {
          const used = parts[2];
          const total = parts[1];
          const usagePercent = parts[4];
          diskUsage = `${used} / ${total} (${usagePercent})`;
        }
      } catch (error) {
        diskUsage = 'Hesaplanamadı';
      }

      // Network I/O hesapla
      let networkIO = 'N/A';
      try {
        if (os.platform() === 'darwin') {
          const exec = require('child_process').execSync;
          const netstatOutput = exec('netstat -ibn | grep -E "en[0-9]" | head -1', { encoding: 'utf8' });
          const parts = netstatOutput.split(/\s+/);
          if (parts.length >= 10) {
            const rxBytes = parseInt(parts[6]) || 0;
            const txBytes = parseInt(parts[9]) || 0;
            const rxMB = Math.round(rxBytes / 1024 / 1024);
            const txMB = Math.round(txBytes / 1024 / 1024);
            networkIO = `↓${rxMB}MB ↑${txMB}MB`;
          }
        }
      } catch (error) {
        networkIO = 'Hesaplanamadı';
      }

      res.json({
        success: true,
        status: 'online',
        service: 'VTS',
        health: {
          status: healthStatus,
          memory: `${memoryMB}MB`,
          uptime: `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m`
        },
        statistics: {
          fetchCount: this.fetchCount,
          errorCount: this.errorCount,
          lastSuccessfulFetch: this.lastSuccessfulFetch ? this.lastSuccessfulFetch.toISOString() : null,
          isCurrentlyRunning: this.isRunning
        },
        systemResources: {
          vtsMemory: `${memoryMB}MB`,
          systemLoad: loadAverage[0].toFixed(2),
          memoryUsage: `${usedMemory}MB / ${totalMemory}MB`,
          cpuCount: os.cpus().length,
          diskUsage: diskUsage,
          networkIO: networkIO
        },
        startTime: this.startTime.toISOString(),
        timestamp: new Date().toISOString()
      });
    });

    // Status endpoint (detaylı bilgi)
    this.app.get('/status', (req, res) => {
      res.json({
        success: true,
        system: 'VTS',
        version: '1.0.0',
        uptime: Math.floor(process.uptime()),
        memory: process.memoryUsage(),
        fetchStats: {
          total: this.fetchCount,
          errors: this.errorCount,
          successRate: this.fetchCount > 0 ? ((this.fetchCount - this.errorCount) / this.fetchCount * 100).toFixed(2) + '%' : '0%'
        },
        lastFetch: this.lastSuccessfulFetch,
        isRunning: this.isRunning,
        timestamp: new Date().toISOString()
      });
    });

    // 3002 portunda başlat (3001 VDS için ayrılmış)
    this.app.listen(3002, () => {
      logger.info('VTS Health Check Server started on port 3002');
    });
  }

  // Sistemi başlat
  async start() {
    try {
      logger.info('KurGözlem Veri Toplama Sistemi başlatılıyor...');
      
      // Health check serverını başlat
      this.setupHealthServer();
      
      // NosyAPI bağlantısını test et - PRODUCTION'DA DEVRE DIŞI
      /*
      const connectionOk = await nosyApiService.testConnection();
      if (!connectionOk) {
        throw new Error('NosyAPI bağlantı testi başarısız');
      }
      */

      // İlk veri çekme işlemini hemen yap
      await this.fetchAndProcessData();

      // Cron job başlat (her 30 saniyede bir)
      const cronExpression = `*/${config.system.fetchIntervalSeconds} * * * * *`;
      
      cron.schedule(cronExpression, async () => {
        if (!this.isRunning) {
          await this.fetchAndProcessData();
        }
      });

      logger.info(`VTS başlatıldı - ${config.system.fetchIntervalSeconds} saniye aralıklarla çalışacak`);
      
      // Sistem durumu logları için ayrı cron (her dakika)
      cron.schedule('0 * * * * *', () => {
        this.logSystemStatus();
      });

    } catch (error) {
      logger.error('VTS başlatma hatası:', error);
      process.exit(1);
    }
  }

  // Ana veri çekme ve işleme fonksiyonu
  async fetchAndProcessData() {
    if (this.isRunning) {
      logger.warn('Önceki işlem hala devam ediyor, atlanıyor...');
      return;
    }

    this.isRunning = true;
    
    try {
      logger.info('Veri çekme işlemi başlatıldı');
      
      // 1. NosyAPI'dan ham veriyi çek
      const rawRates = await nosyApiService.fetchLiveRates();
      
      // 2. Ham veriyi işle ve formatla
      const processedData = dataProcessor.processRawData(rawRates);
      
      // 3. VDS'e gönder
      await this.sendToVDS(processedData);
      
      // Başarı sayacını güncelle
      this.fetchCount++;
      this.lastSuccessfulFetch = new Date();
      
      logger.info('Veri çekme işlemi tamamlandı', {
        fetchCount: this.fetchCount,
        timestamp: this.lastSuccessfulFetch.toISOString()
      });

    } catch (error) {
      this.errorCount++;
      logger.error('Veri çekme işlemi hatası:', error);
      
      // Hata çok fazlaysa sistem durdurulamaya başlayabilir
      if (this.errorCount >= 10) {
        logger.error('Çok fazla hata! Sistem durduruluyor...');
        process.exit(1);
      }
      
    } finally {
      this.isRunning = false;
    }
  }

  // İşlenmiş veriyi VDS'e gönder - GÜVENLİK İYİLEŞTİRMESİ
  async sendToVDS(processedData) {
    try {
      const vdsUrl = `${config.vds.baseUrl}${config.vds.endpoint}`;
      
      // ✅ VTS Authentication header eklendi
      const vtsApiKey = process.env.VTS_API_KEY || 'VTS-INTERNAL-SECRET-2025';
      
      logger.info('VDS\'e veri gönderiliyor...', { url: vdsUrl });
      
      const response = await axios.post(vdsUrl, processedData, {
        timeout: 5000,
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'KurGozlem-VTS/1.0',
          'X-VTS-API-KEY': vtsApiKey  // ✅ Authentication header
        }
      });

      if (response.status === 200) {
        logger.info('VDS\'e veri gönderildi', { 
          status: response.status,
          responseData: response.data 
        });
      } else {
        throw new Error(`VDS yanıt hatası: ${response.status}`);
      }

    } catch (error) {
      logger.error('VDS\'e veri gönderme hatası:', error);
      // VDS hatası fatal değil, sadece logla
    }
  }

  // Sistem durumunu logla
  logSystemStatus() {
    const uptime = process.uptime();
    const memoryUsage = process.memoryUsage();
    
    logger.info('Sistem Durumu', {
      uptime: `${Math.floor(uptime / 60)} dakika`,
      fetchCount: this.fetchCount,
      errorCount: this.errorCount,
      lastFetch: this.lastSuccessfulFetch ? this.lastSuccessfulFetch.toISOString() : 'Henüz yok',
      memoryMB: Math.round(memoryUsage.heapUsed / 1024 / 1024),
      isRunning: this.isRunning
    });
  }

  // Graceful shutdown
  setupGracefulShutdown() {
    ['SIGTERM', 'SIGINT'].forEach(signal => {
      process.on(signal, () => {
        logger.info(`${signal} sinyali alındı, sistem kapatılıyor...`);
        process.exit(0);
      });
    });
  }
}

// Sistemi başlat
const vts = new VeriToplamaSistemi();
vts.setupGracefulShutdown();
vts.start().catch(error => {
  logger.error('VTS başlatma hatası:', error);
  process.exit(1);
}); 