// KurGözlem Veri Dağıtım Sistemi Konfigürasyonu
require('dotenv').config();
const crypto = require('crypto');

// Environment variable validation
function validateEnvironment() {
  const requiredVars = [];
  const warnings = [];

  // Production'da zorunlu environment variables
  if (process.env.NODE_ENV === 'production') {
    if (!process.env.ADMIN_MASTER_KEY) {
      requiredVars.push('ADMIN_MASTER_KEY');
    }
    if (!process.env.ADMIN_SESSION_SECRET) {
      requiredVars.push('ADMIN_SESSION_SECRET');
    }
    if (!process.env.REDIS_PASSWORD) {
      warnings.push('REDIS_PASSWORD önerilir');
    }
    if (!process.env.ALLOWED_ORIGINS) {
      warnings.push('ALLOWED_ORIGINS tanımlanmalı');
    }
  }

  if (requiredVars.length > 0) {
    console.error('❌ HATA: Gerekli environment variables eksik:', requiredVars);
    process.exit(1);
  }

  if (warnings.length > 0) {
    console.warn('⚠️  UYARI:', warnings);
  }
}

// Güçlü secret generator
function generateSecureSecret() {
  return crypto.randomBytes(64).toString('hex');
}

// Environment validation çalıştır
validateEnvironment();

const config = {
  // Server Ayarları
  server: {
    port: process.env.PORT || 3001,
    host: process.env.HOST || '0.0.0.0',
    environment: process.env.NODE_ENV || 'development'
  },

  // CORS Ayarları - Environment-based GÜVENLİK İYİLEŞTİRMESİ
  allowedOrigins: process.env.NODE_ENV === 'production' 
    ? (process.env.ALLOWED_ORIGINS ? 
        process.env.ALLOWED_ORIGINS.split(',') : 
        // ✅ Production default domains - Boş array sorunu çözüldü
        [
          'https://vds.kurgozlem.com',
          'https://vts.kurgozlem.com', 
          'https://kurgozlem.com',
          'https://www.kurgozlem.com'
        ]
      )
    : [
        'http://localhost:3000', 
        'http://127.0.0.1:3000', 
        'http://localhost:3001',
        'http://localhost:57017',
        'http://127.0.0.1:57017',
        'http://localhost:58320',
        'http://127.0.0.1:58320'
      ],

  // Log Ayarları
  log: {
    level: process.env.LOG_LEVEL || 'info',
    logRequests: process.env.LOG_REQUESTS === 'true' || true
  },

  // Anti-Cache Ayarları
  cache: {
    preventCaching: true,
    maxAge: 0,
    noStore: true,
    noCache: true,
    mustRevalidate: true,
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate, private, max-age=0',
      'Pragma': 'no-cache',
      'Expires': '0',
      'Last-Modified': new Date().toUTCString(),
      'ETag': false
    }
  },

  // Admin Güvenlik Ayarları - GÜÇLENDIRILMIŞ
  admin: {
    // Production'da environment variable zorunlu
    masterKey: process.env.ADMIN_MASTER_KEY || 
      (process.env.NODE_ENV === 'production' ? null : 'dev-admin-key-2025'),
    
    // Session ayarları - Güçlü secret
    session: {
      enabled: true,
      secret: process.env.ADMIN_SESSION_SECRET || 
        (process.env.NODE_ENV === 'production' ? null : generateSecureSecret()),
      maxAge: 24 * 60 * 60 * 1000, // 24 saat
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      sameSite: 'strict'
    },

    // IP whitelist
    allowedIPs: process.env.ADMIN_ALLOWED_IPS ? 
      process.env.ADMIN_ALLOWED_IPS.split(',') : [],
    
    // Rate limiting
    rateLimit: {
      windowMs: 15 * 60 * 1000, // 15 dakika
      max: 50,
      failedAttempts: 5,
      lockoutTime: 30 * 60 * 1000 // 30 dakika
    }
  },

  // Redis Ayarları
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
    retryDelayOnFailover: 100,
    maxRetriesPerRequest: 3
  }
};

module.exports = config; 