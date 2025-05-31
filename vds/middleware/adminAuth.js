// Advanced Admin Authentication Middleware
const config = require('../config');
const logger = require('../utils/logger');

// Başarısız giriş denemelerini takip et (memory'de basit implementation)
const failedAttempts = new Map();
const lockedIPs = new Map();

class AdminAuthManager {
  
  // IP bazlı rate limiting kontrolü
  static checkRateLimit(ip) {
    const now = Date.now();
    const attempts = failedAttempts.get(ip) || { count: 0, firstAttempt: now };
    const lockInfo = lockedIPs.get(ip);

    // Eğer IP locked ise
    if (lockInfo && now < lockInfo.unlockTime) {
      const remainingTime = Math.ceil((lockInfo.unlockTime - now) / 60000);
      return {
        allowed: false,
        reason: `IP locked for ${remainingTime} minutes`,
        remainingTime
      };
    }

    // Lock süresi dolmuşsa temizle
    if (lockInfo && now >= lockInfo.unlockTime) {
      lockedIPs.delete(ip);
      failedAttempts.delete(ip);
    }

    return { allowed: true };
  }

  // Başarısız girişi kaydet
  static recordFailedAttempt(ip) {
    const now = Date.now();
    const attempts = failedAttempts.get(ip) || { count: 0, firstAttempt: now };
    
    // 15 dakika geçmişse counter'ı sıfırla
    if (now - attempts.firstAttempt > config.admin.rateLimit.windowMs) {
      attempts.count = 1;
      attempts.firstAttempt = now;
    } else {
      attempts.count++;
    }

    failedAttempts.set(ip, attempts);

    // Limit aşıldıysa IP'yi kilitle
    if (attempts.count >= config.admin.rateLimit.failedAttempts) {
      lockedIPs.set(ip, {
        unlockTime: now + config.admin.rateLimit.lockoutTime,
        attempts: attempts.count
      });

      logger.warn('IP locked due to failed admin attempts', {
        ip,
        attempts: attempts.count,
        lockoutMinutes: config.admin.rateLimit.lockoutTime / 60000
      });
    }
  }

  // Başarılı girişte temizle
  static recordSuccessfulAttempt(ip) {
    failedAttempts.delete(ip);
    lockedIPs.delete(ip);
  }

  // IP whitelist kontrolü
  static checkIPWhitelist(ip) {
    if (config.admin.allowedIPs.length === 0) {
      return true; // Whitelist boşsa herkese izin ver
    }

    return config.admin.allowedIPs.includes(ip);
  }

  // Admin key doğrulama
  static validateAdminKey(providedKey) {
    return providedKey === config.admin.masterKey;
  }
}

// Admin panel sayfası için authentication middleware
const adminPageAuth = (req, res, next) => {
  try {
    const clientIP = req.ip || req.connection.remoteAddress;

    // IP whitelist kontrolü
    if (!AdminAuthManager.checkIPWhitelist(clientIP)) {
      logger.warn('Admin page access denied - IP not whitelisted', { ip: clientIP });
      return res.status(403).send(`
        <html>
          <head><title>Access Denied</title></head>
          <body style="font-family: Arial; text-align: center; margin-top: 100px;">
            <h1>🚫 Access Denied</h1>
            <p>Your IP address is not authorized to access this panel.</p>
            <p><small>IP: ${clientIP}</small></p>
          </body>
        </html>
      `);
    }

    // Rate limiting kontrolü
    const rateLimitCheck = AdminAuthManager.checkRateLimit(clientIP);
    if (!rateLimitCheck.allowed) {
      logger.warn('Admin page access denied - Rate limited', { 
        ip: clientIP, 
        reason: rateLimitCheck.reason 
      });
      
      return res.status(429).send(`
        <html>
          <head><title>Rate Limited</title></head>
          <body style="font-family: Arial; text-align: center; margin-top: 100px;">
            <h1>⏰ Rate Limited</h1>
            <p>${rateLimitCheck.reason}</p>
            <p><small>IP: ${clientIP}</small></p>
          </body>
        </html>
      `);
    }

    // Basic auth kontrolü (browser popup)
    const auth = req.headers.authorization;
    
    if (!auth || !auth.startsWith('Basic ')) {
      AdminAuthManager.recordFailedAttempt(clientIP);
      
      res.setHeader('WWW-Authenticate', 'Basic realm="KurGözlem Admin Panel"');
      return res.status(401).send(`
        <html>
          <head><title>Authentication Required</title></head>
          <body style="font-family: Arial; text-align: center; margin-top: 100px;">
            <h1>🔐 Authentication Required</h1>
            <p>Please provide admin credentials to access this panel.</p>
          </body>
        </html>
      `);
    }

    // Basic auth decode
    const credentials = Buffer.from(auth.split(' ')[1], 'base64').toString().split(':');
    const [username, password] = credentials;

    // Admin key kontrolü (username olarak admin, password olarak key)
    if (username !== 'admin' || !AdminAuthManager.validateAdminKey(password)) {
      AdminAuthManager.recordFailedAttempt(clientIP);
      
      logger.warn('Failed admin authentication', {
        ip: clientIP,
        username: username,
        userAgent: req.get('User-Agent')
      });

      res.setHeader('WWW-Authenticate', 'Basic realm="KurGözlem Admin Panel"');
      return res.status(401).send(`
        <html>
          <head><title>Authentication Failed</title></head>
          <body style="font-family: Arial; text-align: center; margin-top: 100px;">
            <h1>❌ Authentication Failed</h1>
            <p>Invalid credentials provided.</p>
          </body>
        </html>
      `);
    }

    // Başarılı authentication
    AdminAuthManager.recordSuccessfulAttempt(clientIP);
    
    logger.info('Successful admin panel access', {
      ip: clientIP,
      userAgent: req.get('User-Agent')
    });

    next();

  } catch (error) {
    logger.error('Admin page authentication error:', error);
    return res.status(500).send(`
      <html>
        <head><title>Server Error</title></head>
        <body style="font-family: Arial; text-align: center; margin-top: 100px;">
          <h1>⚠️ Server Error</h1>
          <p>An error occurred during authentication.</p>
        </body>
      </html>
    `);
  }
};

// API endpoint'leri için gelişmiş admin auth
const adminApiAuth = (req, res, next) => {
  try {
    const clientIP = req.ip || req.connection.remoteAddress;

    // IP whitelist kontrolü
    if (!AdminAuthManager.checkIPWhitelist(clientIP)) {
      logger.warn('Admin API access denied - IP not whitelisted', { ip: clientIP });
      return res.status(403).json({
        success: false,
        error: 'IP not authorized',
        message: 'Your IP address is not whitelisted for admin access'
      });
    }

    // Rate limiting kontrolü
    const rateLimitCheck = AdminAuthManager.checkRateLimit(clientIP);
    if (!rateLimitCheck.allowed) {
      return res.status(429).json({
        success: false,
        error: 'Rate limited',
        message: rateLimitCheck.reason,
        remainingTime: rateLimitCheck.remainingTime
      });
    }

    // Admin key kontrolü
    const adminKey = req.headers['x-admin-key'];
    if (!AdminAuthManager.validateAdminKey(adminKey)) {
      AdminAuthManager.recordFailedAttempt(clientIP);
      
      logger.warn('Failed admin API authentication', {
        ip: clientIP,
        providedKey: adminKey ? adminKey.substring(0, 8) + '...' : 'none',
        endpoint: req.originalUrl,
        userAgent: req.get('User-Agent')
      });

      return res.status(403).json({
        success: false,
        error: 'Invalid admin key',
        message: 'Admin authentication required'
      });
    }

    // Başarılı authentication
    AdminAuthManager.recordSuccessfulAttempt(clientIP);
    next();

  } catch (error) {
    logger.error('Admin API authentication error:', error);
    return res.status(500).json({
      success: false,
      error: 'Authentication error',
      message: 'An error occurred during authentication'
    });
  }
};

module.exports = {
  adminPageAuth,
  adminApiAuth,
  AdminAuthManager
}; 