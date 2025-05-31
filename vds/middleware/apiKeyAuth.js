// API Key Authentication Middleware
const redisApiKeyManager = require('../data/redisApiKeys');
const logger = require('../utils/logger');

// API Key doğrulama middleware'i
const authenticateApiKey = async (req, res, next) => {
  try {
    // API key'i farklı yerlerden al
    let apiKey = req.headers['x-api-key'] || 
                 req.headers['authorization']?.replace('Bearer ', '') ||
                 req.query.apiKey ||
                 req.params.apiKey;

    if (!apiKey) {
      return res.status(401).json({
        success: false,
        error: 'API key gerekli',
        message: 'Lütfen geçerli bir API key sağlayın'
      });
    }

    // API key'i doğrula
    const validation = await redisApiKeyManager.validateApiKey(apiKey);

    if (!validation.valid) {
      logger.warn('Geçersiz API key denemesi', {
        apiKey: apiKey.substring(0, 8) + '...',
        reason: validation.reason,
        ip: req.ip,
        userAgent: req.get('User-Agent')
      });

      return res.status(403).json({
        success: false,
        error: 'Geçersiz API key',
        message: validation.reason
      });
    }

    // Başarılı doğrulama - request'e key bilgilerini ekle
    req.apiKeyData = validation.customerData;
    req.apiKey = apiKey;

    logger.debug('API key doğrulandı', {
      storeTitle: validation.customerData.storeTitle,
      customerName: validation.customerData.customerName,
      dailyRequests: validation.customerData.dailyRequests
    });

    next();

  } catch (error) {
    logger.error('API key doğrulama middleware hatası:', error);
    
    return res.status(500).json({
      success: false,
      error: 'Doğrulama hatası',
      message: 'API key doğrulama sırasında bir hata oluştu'
    });
  }
};

// Rate limiting için API key bazlı kontrol
const apiKeyRateLimit = (req, res, next) => {
  try {
    // Bu örnekte basit bir rate limiting
    // Gerçek production'da Redis ile yapılabilir
    
    const apiKey = req.apiKey;
    const keyData = req.apiKeyData;
    
    // Eğer request count çok yüksekse uyar (ama engelleme)
    if (keyData.requestCount > 10000) {
      logger.warn('Yüksek request count', {
        clientName: keyData.clientName,
        requestCount: keyData.requestCount
      });
    }

    next();

  } catch (error) {
    logger.error('API key rate limit hatası:', error);
    next(); // Rate limit hatası sistem durdurmak için kritik değil
  }
};

module.exports = {
  authenticateApiKey,
  apiKeyRateLimit
};