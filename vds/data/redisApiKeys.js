// Redis-based API Key Manager
const redis = require('redis');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');
const validation = require('../utils/validation');

class RedisApiKeyManager {
  constructor() {
    this.client = null;
    this.isConnected = false;
  }

  // Redis'e bağlan
  async connect() {
    try {
      this.client = redis.createClient({
        socket: {
          host: process.env.REDIS_HOST || 'localhost',
          port: process.env.REDIS_PORT || 6379
        },
        password: process.env.REDIS_PASSWORD || undefined,
        database: 0,
        retry_strategy: (options) => {
          if (options.error && options.error.code === 'ECONNREFUSED') {
            logger.error('Redis server refused connection');
            return new Error('Redis server refused connection');
          }
          if (options.total_retry_time > 1000 * 60 * 60) {
            logger.error('Redis retry time exceeded');
            return new Error('Retry time exhausted');
          }
          if (options.attempt > 10) {
            logger.error('Redis connection attempts exceeded');
            return undefined;
          }
          return Math.min(options.attempt * 100, 3000);
        }
      });

      this.client.on('error', (err) => {
        logger.error('Redis Client Error:', err);
        this.isConnected = false;
      });

      this.client.on('connect', () => {
        logger.info('Redis Client bağlantısı kuruldu');
        this.isConnected = true;
      });

      this.client.on('ready', () => {
        logger.info('Redis Client hazır');
        this.isConnected = true;
      });

      await this.client.connect();
      
      // Test connection
      await this.client.ping();
      logger.info('Redis bağlantısı başarılı');

      // Initialize default keys if needed
      await this.initializeDefaultKeys();

    } catch (error) {
      logger.error('Redis bağlantı hatası:', error);
      throw error;
    }
  }

  // Default API key'leri oluştur (ilk kurulumda)
  async initializeDefaultKeys() {
    try {
      const existingKeys = await this.listApiKeys();
      
      if (existingKeys.length === 0) {
        logger.info('Default API key\'ler oluşturuluyor...');

        // Test key
        await this.createApiKey({
          storeTitle: 'Lotus Kuyumculuk (Test)',
          customerName: 'Test Kullanıcı',
          customerPhone: '+90 532 123 45 67',
          billingInfo: {
            companyName: 'Lotus Kuyumculuk Ltd. Şti.',
            contactName: 'Ahmet Yılmaz',
            taxOffice: 'Kadıköy',
            taxNumber: '1234567890',
            address: 'İstanbul, Kadıköy',
            email: 'info@lotus.com'
          }
        }, 'test-lotus-kuyumculuk-2025');

        logger.info('Default API key\'ler oluşturuldu');
      }

    } catch (error) {
      logger.error('Default key oluşturma hatası:', error);
    }
  }

  // Redis key pattern'leri
  getKeyPattern(type, id = '*') {
    const patterns = {
      customer: `kurgozlem:customer:${id}`,
      apiKey: `kurgozlem:apikey:${id}`,
      index: 'kurgozlem:index:customers',
      stats: `kurgozlem:stats:${id}`
    };
    return patterns[type];
  }

  // Yeni müşteri ve API key oluştur
  async createApiKey(customerData, customApiKey = null) {
    try {
      // Veri validation
      const customerValidation = validation.validateCustomerData(customerData);
      if (!customerValidation.valid) {
        throw new Error(`Müşteri veri hatası: ${customerValidation.errors.join(', ')}`);
      }

      // API key oluştur
      const apiKey = customApiKey || uuidv4();

      // Abonelik tarihleri
      const subscriptionStart = customerData.subscriptionStart || new Date().toISOString();
      const subscriptionEnd = customerData.subscriptionEnd || 
        validation.getSubscriptionEndDate('1_year').toISOString();

      // Tarih validation
      const dateValidation = validation.validateSubscriptionDates(subscriptionStart, subscriptionEnd);
      if (!dateValidation.valid) {
        throw new Error(`Tarih hatası: ${dateValidation.error}`);
      }

      // Müşteri objesi
      const customer = {
        // Temel Bilgiler
        storeTitle: customerData.storeTitle,
        customerName: customerData.customerName,
        customerPhone: customerData.customerPhone,
        billingInfo: customerData.billingInfo,
        
        // API Management
        apiKey: apiKey,
        isActive: true,
        
        // Abonelik
        subscriptionStart: subscriptionStart,
        subscriptionEnd: subscriptionEnd,
        
        // Analytics
        lastAccess: null,
        dailyRequests: 0,
        monthlyRequests: 0,
        requestHistory: {},
        
        // Meta
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      // Redis'e kaydet
      const customerKey = this.getKeyPattern('customer', apiKey);
      const apiKeyIndex = this.getKeyPattern('apiKey', apiKey);
      
      // Transaction ile atomic operation
      const multi = this.client.multi();
      
      // Müşteri verisini kaydet
      multi.set(customerKey, JSON.stringify(customer));
      
      // API key index'i kaydet (hızlı lookup için)
      multi.set(apiKeyIndex, apiKey);
      
      // Customer list'e ekle
      multi.sAdd(this.getKeyPattern('index'), apiKey);
      
      // TTL set et (subscription end + 30 gün)
      const ttlSeconds = Math.floor((new Date(subscriptionEnd).getTime() - Date.now()) / 1000) + (30 * 24 * 60 * 60);
      multi.expire(customerKey, ttlSeconds);
      
      await multi.exec();

      logger.info('Yeni müşteri oluşturuldu', {
        apiKey: apiKey,
        storeTitle: customer.storeTitle,
        customerName: customer.customerName,
        subscriptionEnd: customer.subscriptionEnd
      });

      return apiKey;

    } catch (error) {
      logger.error('API key oluşturma hatası:', error);
      throw error;
    }
  }

  // API key validation
  async validateApiKey(apiKey) {
    try {
      const customerKey = this.getKeyPattern('customer', apiKey);
      const customerData = await this.client.get(customerKey);

      if (!customerData) {
        return { valid: false, reason: 'Geçersiz API key' };
      }

      const customer = JSON.parse(customerData);

      if (!customer.isActive) {
        return { valid: false, reason: 'Deaktif API key' };
      }

      // Subscription kontrolü
      const now = new Date();
      const subscriptionEnd = new Date(customer.subscriptionEnd);

      if (now > subscriptionEnd) {
        return { valid: false, reason: 'Abonelik süresi dolmuş' };
      }

      // İstatistikleri güncelle
      await this.updateRequestStats(apiKey);

      return {
        valid: true,
        customerData: {
          storeTitle: customer.storeTitle,
          customerName: customer.customerName,
          subscriptionEnd: customer.subscriptionEnd,
          dailyRequests: customer.dailyRequests + 1,
          monthlyRequests: customer.monthlyRequests + 1,
          lastAccess: new Date().toISOString()
        }
      };

    } catch (error) {
      logger.error('API key validation hatası:', error);
      return { valid: false, reason: 'Validation hatası' };
    }
  }

  // Request istatistiklerini güncelle
  async updateRequestStats(apiKey) {
    try {
      const customerKey = this.getKeyPattern('customer', apiKey);
      const customerData = await this.client.get(customerKey);

      if (!customerData) return;

      const customer = JSON.parse(customerData);
      const today = new Date().toISOString().split('T')[0];

      // Günlük request sayısını güncelle
      if (!customer.requestHistory[today]) {
        customer.requestHistory[today] = 0;
      }
      customer.requestHistory[today]++;

      // Son erişim ve günlük sayıları güncelle
      customer.lastAccess = new Date().toISOString();
      customer.dailyRequests = customer.requestHistory[today];
      
      // Aylık toplam hesapla (son 30 gün)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      customer.monthlyRequests = Object.entries(customer.requestHistory)
        .filter(([date]) => new Date(date) >= thirtyDaysAgo)
        .reduce((sum, [, count]) => sum + count, 0);

      // Eski verileri temizle (90 günden eski)
      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
      
      Object.keys(customer.requestHistory).forEach(date => {
        if (new Date(date) < ninetyDaysAgo) {
          delete customer.requestHistory[date];
        }
      });

      customer.updatedAt = new Date().toISOString();

      // Redis'e geri kaydet
      await this.client.set(customerKey, JSON.stringify(customer));

    } catch (error) {
      logger.error('Request stats güncelleme hatası:', error);
    }
  }

  // Tüm müşterileri listele
  async listApiKeys() {
    try {
      const customerIds = await this.client.sMembers(this.getKeyPattern('index'));
      const customers = [];

      for (const apiKey of customerIds) {
        const customerKey = this.getKeyPattern('customer', apiKey);
        const customerData = await this.client.get(customerKey);
        
        if (customerData) {
          const customer = JSON.parse(customerData);
          customers.push({
            key: apiKey.substring(0, 8) + '...', // Security
            fullKey: apiKey, // Admin için
            storeTitle: customer.storeTitle,
            customerName: customer.customerName,
            customerPhone: customer.customerPhone,
            isActive: customer.isActive,
            subscriptionStart: customer.subscriptionStart,
            subscriptionEnd: customer.subscriptionEnd,
            lastAccess: customer.lastAccess,
            dailyRequests: customer.dailyRequests || 0,
            monthlyRequests: customer.monthlyRequests || 0,
            createdAt: customer.createdAt
          });
        }
      }

      return customers;

    } catch (error) {
      logger.error('API key listeleme hatası:', error);
      return [];
    }
  }

  // API key deaktive et
  async deactivateApiKey(apiKey) {
    try {
      const customerKey = this.getKeyPattern('customer', apiKey);
      const customerData = await this.client.get(customerKey);

      if (!customerData) {
        return false;
      }

      const customer = JSON.parse(customerData);
      customer.isActive = false;
      customer.updatedAt = new Date().toISOString();

      await this.client.set(customerKey, JSON.stringify(customer));

      logger.info('API key deaktive edildi', { apiKey: apiKey.substring(0, 8) + '...' });
      return true;

    } catch (error) {
      logger.error('API key deaktive etme hatası:', error);
      return false;
    }
  }

  // API key aktive et
  async activateApiKey(apiKey) {
    try {
      const customerKey = this.getKeyPattern('customer', apiKey);
      const customerData = await this.client.get(customerKey);

      if (!customerData) {
        return false;
      }

      const customer = JSON.parse(customerData);
      customer.isActive = true;
      customer.updatedAt = new Date().toISOString();

      await this.client.set(customerKey, JSON.stringify(customer));

      logger.info('API key aktive edildi', { apiKey: apiKey.substring(0, 8) + '...' });
      return true;

    } catch (error) {
      logger.error('API key aktive etme hatası:', error);
      return false;
    }
  }

  // API key detaylarını getir (view için)
  async getApiKeyDetails(apiKey) {
    try {
      const customerKey = this.getKeyPattern('customer', apiKey);
      const customerDataStr = await this.client.get(customerKey);
      
      if (!customerDataStr) {
        return null;
      }

      const customer = JSON.parse(customerDataStr);
      
      // View için full data return et
      return {
        fullKey: customer.apiKey,
        key: customer.apiKey.substring(0, 12) + '...', // Short version
        storeTitle: customer.storeTitle,
        customerName: customer.customerName,
        customerPhone: customer.customerPhone,
        billingInfo: customer.billingInfo,
        isActive: customer.isActive,
        subscriptionStart: customer.subscriptionStart,
        subscriptionEnd: customer.subscriptionEnd,
        lastAccess: customer.lastAccess,
        dailyRequests: customer.dailyRequests || 0,
        monthlyRequests: customer.monthlyRequests || 0,
        requestCount: customer.dailyRequests + customer.monthlyRequests || 0,
        createdAt: customer.createdAt,
        updatedAt: customer.updatedAt
      };

    } catch (error) {
      logger.error('API key detay alma hatası:', error);
      throw error;
    }
  }

  // API key güncelle
  async updateApiKey(apiKey, updateData) {
    try {
      const customerKey = this.getKeyPattern('customer', apiKey);
      const customerDataStr = await this.client.get(customerKey);
      
      if (!customerDataStr) {
        return false;
      }

      const customer = JSON.parse(customerDataStr);
      
      // Update fields (API key hariç)
      if (updateData.storeTitle) customer.storeTitle = updateData.storeTitle;
      if (updateData.customerName) customer.customerName = updateData.customerName;
      if (updateData.customerPhone !== undefined) customer.customerPhone = updateData.customerPhone;
      
      // Billing info update
      if (updateData.billingInfo) {
        customer.billingInfo = customer.billingInfo || {};
        Object.keys(updateData.billingInfo).forEach(key => {
          if (updateData.billingInfo[key] !== undefined) {
            customer.billingInfo[key] = updateData.billingInfo[key];
          }
        });
      }
      
      // Subscription dates
      if (updateData.subscriptionStart) customer.subscriptionStart = updateData.subscriptionStart;
      if (updateData.subscriptionEnd) customer.subscriptionEnd = updateData.subscriptionEnd;
      
      // Update timestamp
      customer.updatedAt = new Date().toISOString();

      // Save back to Redis
      await this.client.set(customerKey, JSON.stringify(customer));

      logger.info('Müşteri güncellendi', {
        apiKey: apiKey,
        storeTitle: customer.storeTitle,
        customerName: customer.customerName
      });

      return true;

    } catch (error) {
      logger.error('API key güncelleme hatası:', error);
      throw error;
    }
  }

  // Bağlantıyı kapat
  async disconnect() {
    try {
      if (this.client) {
        await this.client.quit();
        logger.info('Redis bağlantısı kapatıldı');
      }
    } catch (error) {
      logger.error('Redis disconnect hatası:', error);
    }
  }
}

module.exports = new RedisApiKeyManager(); 