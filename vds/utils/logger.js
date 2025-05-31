// Production-Ready Winston Logger
const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const path = require('path');

// Log formatları
const logFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss'
  }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// Console format (development için)
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({
    format: 'HH:mm:ss'
  }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    let msg = `${timestamp} [${level}] ${message}`;
    if (Object.keys(meta).length > 0) {
      msg += ` ${JSON.stringify(meta)}`;
    }
    return msg;
  })
);

// Log directory oluştur
const logDir = path.join(__dirname, '../logs');
require('fs').mkdirSync(logDir, { recursive: true });

// Transport'lar
const transports = [];

// Console transport (development)
if (process.env.NODE_ENV !== 'production') {
  transports.push(
    new winston.transports.Console({
      format: consoleFormat,
      level: 'debug'
    })
  );
}

// File transports (production)
transports.push(
  // Error logs
  new DailyRotateFile({
    filename: path.join(logDir, 'error-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    level: 'error',
    format: logFormat,
    maxSize: '20m',
    maxFiles: '14d',
    zippedArchive: true
  }),
  
  // Combined logs
  new DailyRotateFile({
    filename: path.join(logDir, 'combined-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    format: logFormat,
    maxSize: '20m',
    maxFiles: '7d',
    zippedArchive: true
  }),

  // Access logs (requests)
  new DailyRotateFile({
    filename: path.join(logDir, 'access-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    format: logFormat,
    maxSize: '50m',
    maxFiles: '30d',
    zippedArchive: true,
    level: 'info'
  })
);

// Winston logger oluştur
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat,
  transports: transports,
  exitOnError: false,
  
  // Exception handling
  exceptionHandlers: [
    new DailyRotateFile({
      filename: path.join(logDir, 'exceptions-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '14d'
    })
  ],
  
  // Rejection handling
  rejectionHandlers: [
    new DailyRotateFile({
      filename: path.join(logDir, 'rejections-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '14d'
    })
  ]
});

// Performance monitoring
const performanceLogger = {
  startTime: Date.now(),
  requestCount: 0,
  errorCount: 0,
  
  incrementRequest() {
    this.requestCount++;
  },
  
  incrementError() {
    this.errorCount++;
  },
  
  getStats() {
    const uptime = Date.now() - this.startTime;
    return {
      uptime: Math.floor(uptime / 1000),
      requestCount: this.requestCount,
      errorCount: this.errorCount,
      requestsPerSecond: this.requestCount / (uptime / 1000)
    };
  }
};

// Helper functions
const loggerHelpers = {
  // Request logging
  request(req, res, responseTime) {
    performanceLogger.incrementRequest();
    
    const logData = {
      method: req.method,
      url: req.originalUrl,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      statusCode: res.statusCode,
      responseTime: `${responseTime}ms`,
      contentLength: res.get('Content-Length') || 0
    };

    // API key varsa (güvenli şekilde log et)
    if (req.apiKey) {
      logData.apiKey = req.apiKey.substring(0, 8) + '...';
    }

    // Error status codes için error level
    if (res.statusCode >= 400) {
      performanceLogger.incrementError();
      logger.error('HTTP Request Error', logData);
    } else {
      logger.info('HTTP Request', logData);
    }
  },

  // API key işlemleri
  apiKey(action, data) {
    logger.info('API Key Operation', {
      action,
      ...data,
      timestamp: new Date().toISOString()
    });
  },

  // Sistem olayları
  system(event, data) {
    logger.info('System Event', {
      event,
      ...data,
      timestamp: new Date().toISOString()
    });
  },

  // Performance metrikleri
  performance() {
    const stats = performanceLogger.getStats();
    logger.info('Performance Stats', stats);
    return stats;
  }
};

// Logger'ı extend et
Object.assign(logger, loggerHelpers);

module.exports = logger; 