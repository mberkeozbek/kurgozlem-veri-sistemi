// VDS API Routes
const express = require('express');
const router = express.Router();
const config = require('../config');
const dataStorage = require('../data/dataStorage');
const redisApiKeyManager = require('../data/redisApiKeys');
const { authenticateApiKey, apiKeyRateLimit } = require('../middleware/apiKeyAuth');
const { adminApiAuth } = require('../middleware/adminAuth');
const logger = require('../utils/logger');

// Anti-cache headers middleware - Config bazlı güçlendirilmiş
const antiCacheHeaders = (req, res, next) => {
  // Config'ten anti-cache headers'ı uygula
  res.set(config.cache.headers);
  
  // Her response için benzersiz ETag
  res.set('ETag', `"${Date.now()}-${Math.random().toString(36).substring(7)}"`);
  
  next();
};

// VTS'den veri güncellemesi almak için endpoint - GÜVENLİK İYİLEŞTİRMESİ
router.post('/update-data', (req, res) => {
  try {
    // ✅ VTS Authentication eklendi
    const vtsApiKey = req.headers['x-vts-api-key'] || req.headers['authorization'];
    const expectedVtsKey = process.env.VTS_API_KEY || 'VTS-INTERNAL-SECRET-2025';
    
    if (!vtsApiKey || vtsApiKey !== expectedVtsKey) {
      logger.warn('VTS authentication başarısız', {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        providedKey: vtsApiKey ? vtsApiKey.substring(0, 8) + '...' : 'YOK'
      });
      
      return res.status(401).json({
        success: false,
        error: 'Yetkisiz erişim',
        code: 'VTS_AUTH_REQUIRED'
      });
    }

    const newData = req.body;
    
    if (!newData || typeof newData !== 'object') {
      return res.status(400).json({
        success: false,
        error: 'Geçersiz veri formatı'
      });
    }

    const success = dataStorage.updateData(newData);
    
    if (success) {
      // Gerçek veri güncelleme zamanını kaydet
      if (global.vdsInstance) {
        global.vdsInstance.updateDataTimestamp();
      }
      
      logger.info('VTS\'den veri güncellendi');
      return res.json({
        success: true,
        message: 'Veri başarıyla güncellendi',
        timestamp: new Date().toISOString()
      });
    } else {
      return res.status(500).json({
        success: false,
        error: 'Veri güncellenemedi'
      });
    }

  } catch (error) {
    logger.error('Veri güncelleme endpoint hatası:', error);
    return res.status(500).json({
      success: false,
      error: 'Sunucu hatası'
    });
  }
});

// KurGözlem uygulamaları için ana veri endpoint'i
router.get('/kur/:apiKey', antiCacheHeaders, authenticateApiKey, apiKeyRateLimit, (req, res) => {
  try {
    const currentData = dataStorage.getCurrentData();
    
    if (!currentData) {
      logger.warn('Veri bulunamadı', {
        storeTitle: req.apiKeyData.storeTitle,
        customerName: req.apiKeyData.customerName,
        apiKey: req.params.apiKey.substring(0, 8) + '...'
      });
      
      return res.status(503).json({
        success: false,
        error: 'Veri mevcut değil',
        message: 'Henüz veri güncellenmedi, lütfen birkaç saniye sonra tekrar deneyin'
      });
    }

    // Başarılı veri dönüşü
    logger.info('Veri servisi', {
      storeTitle: req.apiKeyData.storeTitle,
      customerName: req.apiKeyData.customerName,
      dataAge: currentData.dataAge + ' saniye'
    });

    return res.json({
      success: true,
      data: currentData,
      meta: {
        apiVersion: '1.0',
        storeTitle: req.apiKeyData.storeTitle,
        customerName: req.apiKeyData.customerName,
        subscriptionEnd: req.apiKeyData.subscriptionEnd,
        dailyRequests: req.apiKeyData.dailyRequests,
        monthlyRequests: req.apiKeyData.monthlyRequests
      }
    });

  } catch (error) {
    logger.error('Veri servisi endpoint hatası:', error);
    return res.status(500).json({
      success: false,
      error: 'Sunucu hatası',
      message: 'Veri servisi sırasında bir hata oluştu'
    });
  }
});

// Veri durumu kontrolü (authentication yok - health check)
router.get('/status', antiCacheHeaders, (req, res) => {
  try {
    const dataStatus = dataStorage.getDataStatus();
    const systemInfo = {
      uptime: Math.floor(process.uptime()),
      memory: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      timestamp: new Date().toISOString()
    };

    return res.json({
      success: true,
      system: systemInfo,
      data: dataStatus
    });

  } catch (error) {
    logger.error('Status endpoint hatası:', error);
    return res.status(500).json({
      success: false,
      error: 'Status kontrolü başarısız'
    });
  }
});

// Admin: API key listesi - Gelişmiş güvenlik ile korumalı
router.get('/admin/api-keys', adminApiAuth, async (req, res) => {
  try {
    const apiKeys = await redisApiKeyManager.listApiKeys();
    
    return res.json({
      success: true,
      data: apiKeys,
      count: apiKeys.length
    });

  } catch (error) {
    logger.error('Admin API keys endpoint hatası:', error);
    return res.status(500).json({
      success: false,
      error: 'Sunucu hatası'
    });
  }
});

// Admin: Yeni API key oluştur - Gelişmiş güvenlik ile korumalı
router.post('/admin/api-keys', adminApiAuth, async (req, res) => {
  try {
    const customerData = req.body;
    
    if (!customerData.storeTitle || !customerData.customerName) {
      return res.status(400).json({
        success: false,
        error: 'Mağaza adı ve müşteri adı gerekli'
      });
    }

    const newApiKey = await redisApiKeyManager.createApiKey(customerData);
    
    return res.json({
      success: true,
      apiKey: newApiKey,
      storeTitle: customerData.storeTitle,
      customerName: customerData.customerName
    });

  } catch (error) {
    logger.error('API key oluşturma endpoint hatası:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'API key oluşturulamadı'
    });
  }
});

// Admin: API key deaktive et - Gelişmiş güvenlik ile korumalı
router.patch('/admin/api-keys/:apiKey/deactivate', adminApiAuth, async (req, res) => {
  try {
    const apiKey = req.params.apiKey;
    const success = await redisApiKeyManager.deactivateApiKey(apiKey);
    
    if (success) {
      return res.json({
        success: true,
        message: 'API key deaktive edildi'
      });
    } else {
      return res.status(404).json({
        success: false,
        error: 'API key bulunamadı'
      });
    }

  } catch (error) {
    logger.error('API key deaktive etme endpoint hatası:', error);
    return res.status(500).json({
      success: false,
      error: 'İşlem başarısız'
    });
  }
});

// Admin: API key aktive et - Gelişmiş güvenlik ile korumalı
router.patch('/admin/api-keys/:apiKey/activate', adminApiAuth, async (req, res) => {
  try {
    const apiKey = req.params.apiKey;
    const success = await redisApiKeyManager.activateApiKey(apiKey);
    
    if (success) {
      return res.json({
        success: true,
        message: 'API key aktive edildi'
      });
    } else {
      return res.status(404).json({
        success: false,
        error: 'API key bulunamadı'
      });
    }

  } catch (error) {
    logger.error('API key aktive etme endpoint hatası:', error);
    return res.status(500).json({
      success: false,
      error: 'İşlem başarısız'
    });
  }
});

// Admin: Tek API key detayını getir - Gelişmiş güvenlik ile korumalı
router.get('/admin/api-keys/:apiKey', adminApiAuth, async (req, res) => {
  try {
    const apiKey = req.params.apiKey;
    const customerData = await redisApiKeyManager.getApiKeyDetails(apiKey);
    
    if (!customerData) {
      return res.status(404).json({
        success: false,
        error: 'API key bulunamadı'
      });
    }

    return res.json({
      success: true,
      data: customerData
    });

  } catch (error) {
    logger.error('API key detay endpoint hatası:', error);
    return res.status(500).json({
      success: false,
      error: 'Sunucu hatası'
    });
  }
});

// Admin: API key güncelle - Gelişmiş güvenlik ile korumalı
router.put('/admin/api-keys/:apiKey', adminApiAuth, async (req, res) => {
  try {
    const apiKey = req.params.apiKey;
    const updateData = req.body;
    
    if (!updateData.storeTitle || !updateData.customerName) {
      return res.status(400).json({
        success: false,
        error: 'Mağaza adı ve müşteri adı gerekli'
      });
    }

    const success = await redisApiKeyManager.updateApiKey(apiKey, updateData);
    
    if (!success) {
      return res.status(404).json({
        success: false,
        error: 'API key bulunamadı veya güncellenemedi'
      });
    }

    return res.json({
      success: true,
      message: 'Müşteri bilgileri güncellendi',
      storeTitle: updateData.storeTitle,
      customerName: updateData.customerName
    });

  } catch (error) {
    logger.error('API key güncelleme endpoint hatası:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Güncelleme başarısız'
    });
  }
});

module.exports = router; 