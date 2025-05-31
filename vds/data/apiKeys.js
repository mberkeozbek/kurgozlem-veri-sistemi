// API Key Yönetimi - Basit JSON tabanlı sistem
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');
const validation = require('../utils/validation');

class ApiKeyManager {
  constructor() {
    // Basit in-memory API key storage
    // Production'da bu Redis veya veritabanı olabilir
    this.apiKeys = new Map();
    
    // Örnek API key'ler oluştur
    this.initializeApiKeys();
  }

  // Başlangıç API key'lerini oluştur
  initializeApiKeys() {
    // Test API key'i
    const testApiKey = {
      key: 'test-lotus-kuyumculuk-2025',
      clientName: 'Lotus Kuyumculuk (Test)',
      isActive: true,
      createdAt: new Date().toISOString(),
      expiryDate: '2025-12-31T23:59:59.999Z',
      lastAccess: null,
      requestCount: 0
    };

    // Production API key'i
    const prodApiKey = {
      key: 'prod-' + uuidv4(),
      clientName: 'Lotus Kuyumculuk (Production)',
      isActive: true,
      createdAt: new Date().toISOString(),
      expiryDate: '2025-12-31T23:59:59.999Z',
      lastAccess: null,
      requestCount: 0
    };

    this.apiKeys.set(testApiKey.key, testApiKey);
    this.apiKeys.set(prodApiKey.key, prodApiKey);

    logger.info('API Keyleri başlatıldı', {
      testKey: testApiKey.key,
      prodKey: prodApiKey.key
    });
  }

  // API key'i doğrula
  validateApiKey(apiKey) {
    try {
      const keyData = this.apiKeys.get(apiKey);
      
      if (!keyData) {
        return { valid: false, reason: 'Geçersiz API key' };
      }

      if (!keyData.isActive) {
        return { valid: false, reason: 'Deaktif API key' };
      }

      // Bitiş tarihi kontrolü
      const now = new Date();
      const expiryDate = new Date(keyData.expiryDate);
      
      if (now > expiryDate) {
        return { valid: false, reason: 'Süresi dolmuş API key' };
      }

      // Başarılı doğrulama - istatistikleri güncelle
      keyData.lastAccess = new Date().toISOString();
      keyData.requestCount++;

      return { 
        valid: true, 
        keyData: {
          clientName: keyData.clientName,
          requestCount: keyData.requestCount,
          lastAccess: keyData.lastAccess
        }
      };

    } catch (error) {
      logger.error('API key doğrulama hatası:', error);
      return { valid: false, reason: 'Doğrulama hatası' };
    }
  }

  // Yeni API key oluştur
  createApiKey(clientName, subscriptionStart = null, subscriptionEnd = null) {
    try {
      // Tarih validation
      const now = new Date();
      const startDate = subscriptionStart ? new Date(subscriptionStart) : now;
      const defaultExpiry = new Date();
      defaultExpiry.setFullYear(defaultExpiry.getFullYear() + 1); // 1 yıl
      const endDate = subscriptionEnd ? new Date(subscriptionEnd) : defaultExpiry;

      const dateValidation = validation.validateSubscriptionDates(
        startDate.toISOString(),
        endDate.toISOString()
      );

      if (!dateValidation.valid) {
        throw new Error(`Tarih hatası: ${dateValidation.error}`);
      }

      const newKey = uuidv4();

      const keyData = {
        key: newKey,
        clientName: clientName,
        isActive: true,
        createdAt: new Date().toISOString(),
        subscriptionStart: startDate.toISOString(),
        subscriptionEnd: endDate.toISOString(),
        expiryDate: endDate.toISOString(), // Backward compatibility
        lastAccess: null,
        requestCount: 0
      };

      this.apiKeys.set(newKey, keyData);
      
      logger.info('Yeni API key oluşturuldu', {
        key: newKey,
        clientName: clientName,
        subscriptionStart: keyData.subscriptionStart,
        subscriptionEnd: keyData.subscriptionEnd
      });

      return newKey;

    } catch (error) {
      logger.error('API key oluşturma hatası:', error);
      throw error;
    }
  }

  // API key'i deaktive et
  deactivateApiKey(apiKey) {
    try {
      const keyData = this.apiKeys.get(apiKey);
      
      if (keyData) {
        keyData.isActive = false;
        logger.info('API key deaktive edildi', { key: apiKey });
        return true;
      }
      
      return false;

    } catch (error) {
      logger.error('API key deaktive etme hatası:', error);
      return false;
    }
  }

  // API key'i aktive et
  activateApiKey(apiKey) {
    try {
      const keyData = this.apiKeys.get(apiKey);
      
      if (keyData) {
        keyData.isActive = true;
        logger.info('API key aktive edildi', { key: apiKey });
        return true;
      }
      
      return false;

    } catch (error) {
      logger.error('API key aktive etme hatası:', error);
      return false;
    }
  }

  // Tüm API key'leri listele (admin)
  listApiKeys() {
    try {
      const keyList = [];
      
      for (const [key, data] of this.apiKeys) {
        keyList.push({
          key: key.substring(0, 8) + '...', // Güvenlik için kısalt
          clientName: data.clientName,
          isActive: data.isActive,
          requestCount: data.requestCount,
          lastAccess: data.lastAccess,
          expiryDate: data.expiryDate
        });
      }

      return keyList;

    } catch (error) {
      logger.error('API key listeleme hatası:', error);
      return [];
    }
  }
}

module.exports = new ApiKeyManager(); 