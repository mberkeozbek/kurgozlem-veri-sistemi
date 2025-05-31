// KurGözlem Veri Dağıtım Sistemi (VDS) - Ana Server
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const config = require('./config');
const logger = require('./utils/logger');
const apiRoutes = require('./routes/api');
const cleanupService = require('./services/cleanupService');
const redisApiKeyManager = require('./data/redisApiKeys');
const { adminPageAuth } = require('./middleware/adminAuth');
const compression = require('compression');

class VeriDagitimSistemi {
  constructor() {
    this.app = express();
    this.server = null;
    this.lastDataUpdateTime = null; // Gerçek veri güncelleme zamanı
  }

  // Veri güncelleme zamanını güncelle
  updateDataTimestamp() {
    this.lastDataUpdateTime = new Date().toISOString();
  }

  // Middleware'leri kur
  setupMiddleware() {
    // Security headers
    this.app.use(helmet());
    this.app.use(compression());

    // CORS
    this.app.use(cors({
      origin: config.allowedOrigins,
      credentials: true
    }));

    // JSON parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // IP ve timing için proxy güveni
    this.app.set('trust proxy', 1);

    // Request logging middleware
    this.app.use((req, res, next) => {
      const startTime = Date.now();
      
      res.on('finish', () => {
        const responseTime = Date.now() - startTime;
        logger.request(req, res, responseTime);
      });
      
      next();
    });

    // GEÇICI OLARAK RATE LIMITING DEVRE DIŞI (Redis uyumsuzluk sorunu)
    /* 
    // API key bazlı rate limiting için Redis store
    const RedisStore = require('rate-limit-redis');
    const redis = require('redis');
    
    // Redis client oluştur (rate limiting için)
    const redisClient = redis.createClient({
      host: process.env.REDIS_HOST || 'localhost',
      port: process.env.REDIS_PORT || 6379,
      password: process.env.REDIS_PASSWORD || undefined
    });

    // Veri çekme API'si için API key bazlı rate limiting
    const dataApiLimiter = rateLimit({
      store: new RedisStore({
        client: redisClient,
        prefix: 'vds_data_limit:'
      }),
      windowMs: 1 * 60 * 1000, // 1 dakika
      max: 100, // Her API key için dakikada 100 istek
      keyGenerator: (req) => {
        // API key bazlı limit (her API key için ayrı sayaç)
        return req.apiKey || req.ip;
      },
      message: {
        error: 'API key için çok fazla istek gönderildi. Lütfen 1 dakika sonra tekrar deneyin.',
        code: 'API_RATE_LIMIT_EXCEEDED'
      },
      standardHeaders: true,
      legacyHeaders: false,
      skip: (req) => {
        return !req.path.startsWith('/api/data');
      }
    });

    // Genel API'ler için IP bazlı rate limiting (daha esnek)
    const generalApiLimiter = rateLimit({
      store: new RedisStore({
        client: redisClient,
        prefix: 'vds_general_limit:'
      }),
      windowMs: 1 * 60 * 1000, // 1 dakika
      max: 50, // IP başına dakikada 50 istek
      keyGenerator: (req) => req.ip,
      message: {
        error: 'IP için çok fazla istek gönderildi. Lütfen 1 dakika sonra tekrar deneyin.',
        code: 'IP_RATE_LIMIT_EXCEEDED'
      },
      standardHeaders: true,
      legacyHeaders: false
    });

    // Rate limiting'i uygula
    this.app.use('/api/data', dataApiLimiter); // API key bazlı limit
    this.app.use('/api', generalApiLimiter); // IP bazlı limit
    */
  }

  // Route'ları kur
  setupRoutes() {
    // Static files (admin panel için)
    this.app.use(express.static(path.join(__dirname, 'views')));
    
    // Admin panel - Artık Korumalı!
    this.app.get('/admin', adminPageAuth, (req, res) => {
      res.sendFile(path.join(__dirname, 'views', 'admin.html'));
    });

    // Health check with system status (ÖNCE TANIMLA - admin auth gerektirmesin)
    this.app.get('/api/health', (req, res) => {
      const memoryUsage = process.memoryUsage();
      const uptime = Math.floor(process.uptime());
      const os = require('os');
      
      // Sistem sağlığını değerlendir
      const memoryMB = Math.round(memoryUsage.heapUsed / 1024 / 1024);
      let healthStatus = 'healthy';
      
      if (memoryMB > 512) {
        healthStatus = 'warning';
      } else if (memoryMB > 1024) {
        healthStatus = 'critical';
      }

      // Sistem kaynak bilgileri
      const loadAverage = os.loadavg();
      const totalMemory = Math.round(os.totalmem() / 1024 / 1024);
      const freeMemory = Math.round(os.freemem() / 1024 / 1024);
      const usedMemory = totalMemory - freeMemory;
      const memoryUsagePercent = Math.round((usedMemory / totalMemory) * 100);

      // Cross-platform disk usage hesaplama
      let diskUsage = 'N/A';
      try {
        const { execSync } = require('child_process');
        const platform = os.platform();
        
        if (platform === 'darwin' || platform === 'linux') {
          // Unix-like sistemler için
          const dfOutput = execSync('df -h / | tail -1', { 
            encoding: 'utf8',
            timeout: 5000 
          });
          const parts = dfOutput.trim().split(/\s+/);
          if (parts.length >= 5) {
            const used = parts[2];
            const total = parts[1];
            const usagePercent = parts[4];
            diskUsage = `${used} / ${total} (${usagePercent})`;
          }
        } else if (platform === 'win32') {
          // Windows için
          const wmicOutput = execSync('wmic logicaldisk where size!=0 get size,freespace,caption', {
            encoding: 'utf8',
            timeout: 5000
          });
          // Windows disk usage parsing (basitleştirilmiş)
          diskUsage = 'Windows disk bilgisi';
        }
      } catch (error) {
        diskUsage = 'Hesaplanamadı';
      }

      // Network I/O hesaplama (cross-platform)
      let networkIO = 'N/A';
      try {
        const platform = os.platform();
        const { execSync } = require('child_process');
        
        if (platform === 'darwin') {
          const netstatOutput = execSync('netstat -ibn | grep -E "en[0-9]" | head -1', { 
            encoding: 'utf8',
            timeout: 5000 
          });
          const parts = netstatOutput.split(/\s+/);
          if (parts.length >= 10) {
            const rxBytes = parseInt(parts[6]) || 0;
            const txBytes = parseInt(parts[9]) || 0;
            const rxMB = Math.round(rxBytes / 1024 / 1024);
            const txMB = Math.round(txBytes / 1024 / 1024);
            networkIO = `↓${rxMB}MB ↑${txMB}MB`;
          }
        } else if (platform === 'linux') {
          // Linux için network stats
          networkIO = 'Linux network bilgisi';
        }
      } catch (error) {
        networkIO = 'Hesaplanamadı';
      }

      // Memory cleanup trigger (kritik durumlarda)
      if (memoryMB > 1024) {
        if (global.gc) {
          global.gc();
        }
      }

      const healthData = {
        success: true,
        status: 'online',
        health: {
          status: healthStatus,
          memory: `${memoryMB}MB`,
          uptime: `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m`
        },
        activeConnections: req.app.locals.activeConnections || 0,
        lastDataUpdate: this.lastDataUpdateTime,
        systemResources: {
          vdsMemory: `${memoryMB}MB`,
          systemMemory: `${usedMemory}MB / ${totalMemory}MB (${memoryUsagePercent}%)`,
          loadAverage: loadAverage[0].toFixed(2),
          cpuCount: os.cpus().length,
          platform: os.platform(),
          arch: os.arch(),
          diskUsage: diskUsage,
          networkIO: networkIO
        },
        timestamp: new Date().toISOString()
      };

      res.json(healthData);
    });

    // API routes (diğer tüm /api/* endpoint'leri)
    this.app.use('/api', apiRoutes);

    // Root endpoint
    this.app.get('/', (req, res) => {
      res.json({
        success: true,
        service: 'KurGözlem Veri Dağıtım Sistemi',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        endpoints: {
          data: '/api/kur/:apiKey',
          status: '/api/status',
          admin: '/api/admin/*'
        }
      });
    });

    // Legacy health check
    this.app.get('/health', (req, res) => {
      res.json({
        success: true,
        status: 'healthy',
        uptime: Math.floor(process.uptime()),
        memory: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + 'MB',
        timestamp: new Date().toISOString()
      });
    });

    // 404 handler
    this.app.use('*', (req, res) => {
      res.status(404).json({
        success: false,
        error: 'Endpoint bulunamadı',
        message: `${req.method} ${req.originalUrl} bulunamadı`
      });
    });

    // Error handler
    this.app.use((error, req, res, next) => {
      logger.error('Express error handler:', error);
      
      res.status(500).json({
        success: false,
        error: 'Sunucu hatası',
        message: config.server.environment === 'development' ? error.message : 'Bilinmeyen hata'
      });
    });
  }

  // Serveri başlat
  async start() {
    try {
      // Redis bağlantısını başlat
      await redisApiKeyManager.connect();
      
      // Middleware ve route'ları kur
      this.setupMiddleware();
      this.setupRoutes();

      // Serveri başlat
      this.server = this.app.listen(config.server.port, config.server.host, () => {
        logger.info('VDS başlatıldı', {
          host: config.server.host,
          port: config.server.port,
          environment: config.server.environment,
          pid: process.pid
        });
      });

      // Cleanup service'i başlat
      cleanupService.setApiKeyManager(redisApiKeyManager);
      cleanupService.start();

      // Graceful shutdown setup
      this.setupGracefulShutdown();

    } catch (error) {
      logger.error('VDS başlatma hatası:', error);
      process.exit(1);
    }
  }

  // Graceful shutdown
  setupGracefulShutdown() {
    ['SIGTERM', 'SIGINT'].forEach(signal => {
      process.on(signal, () => {
        logger.info(`${signal} sinyali alındı, server kapatılıyor...`);
        
        if (this.server) {
          this.server.close(() => {
            logger.info('Server kapatıldı');
            process.exit(0);
          });
        } else {
          process.exit(0);
        }
      });
    });

    // Uncaught exception handler
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught Exception:', error);
      process.exit(1);
    });

    // Unhandled rejection handler
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled Rejection:', { reason, promise });
      process.exit(1);
    });
  }
}

// Sistemi başlat
const vds = new VeriDagitimSistemi();

// Global instance erişimi için
global.vdsInstance = vds;

vds.start().catch(error => {
  logger.error('VDS başlatılamadı:', error);
  process.exit(1);
}); 