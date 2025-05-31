// KurGözlem Veri Toplama Sistemi Konfigürasyonu
require('dotenv').config();

// Environment variable validation
function validateEnvironment() {
  const requiredVars = [];

  // Production'da zorunlu environment variables
  if (process.env.NODE_ENV === 'production') {
    if (!process.env.NOSY_API_KEY) {
      requiredVars.push('NOSY_API_KEY');
    }
    if (!process.env.VDS_BASE_URL) {
      requiredVars.push('VDS_BASE_URL');
    }
  }

  if (requiredVars.length > 0) {
    console.error('❌ HATA: Gerekli environment variables eksik:', requiredVars);
    process.exit(1);
  }
}

// Environment validation çalıştır
validateEnvironment();

const config = {
  // NosyAPI Bilgileri - GÜVENLİK İYİLEŞTİRMESİ
  nosyApi: {
    baseUrl: process.env.NOSY_API_BASE_URL || 'https://www.nosyapi.com/apiv2/service',
    // ❌ Hardcode API key kaldırıldı - Production'da environment variable zorunlu
    apiKey: process.env.NOSY_API_KEY || 
      (process.env.NODE_ENV === 'production' ? null : 'development-fallback-key'),
    endpoints: {
      liveRates: 'economy/live-exchange-rates',
      ratesList: 'economy/live-exchange-rates/list'
    }
  },

  // Veri Dağıtım Sistemi Bilgileri - PRODUCTION DOMAIN DESTEĞİ
  vds: {
    // ✅ Production domain desteği eklendi
    baseUrl: process.env.VDS_BASE_URL || 
      (process.env.NODE_ENV === 'production' ? 'https://vds.kurgozlem.com' : 'http://localhost:3001'),
    endpoint: process.env.VDS_ENDPOINT || '/api/update-data'
  },

  // Sistem Ayarları
  system: {
    fetchIntervalSeconds: parseInt(process.env.FETCH_INTERVAL_SECONDS) || 30,
    logLevel: process.env.LOG_LEVEL || 'info',
    environment: process.env.NODE_ENV || 'development'
  },

  // Çekilecek Kur Kodları (NosyAPI'dan)
  requiredCurrencies: [
    '22AYAR',        // 22 Ayar Gram
    'gramaltin',     // 24 Ayar Gram  
    'onstry',        // ONS/USD (actually ONS/TRY but we'll handle this)
    'USDTRY',        // USD/TRY
    'EURTRY',        // EUR/TRY
    'EURUSD',        // EUR/USD
    'altintry'       // HAS Altın
  ],

  // Hesaplama Katsayıları
  calculations: {
    gram22Multiplier: 1.00668316832,    // 22 Ayar düzeltme çarpanı
    ceyrekMultiplier: 1.77090092338,    // Çeyrek = 22 Ayar * 1.77090092338
    cumhuriyetMultiplier: 1.02941072875  // Cumhuriyet = Tam * 1.02941072875
  }
};

module.exports = config; 