const crypto = require('crypto');

const email = value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const strong = value => typeof value === 'string' && value.length >= 16 && /[A-Z]/.test(value) && /[a-z]/.test(value) && /\d/.test(value) && /[^A-Za-z0-9]/.test(value);

function getConfig() {
  const production = process.env.NODE_ENV === 'production';
    return { production, port: Number(process.env.PORT || 3000), jwtSecret: process.env.JWT_SECRET || (production ? '' : 'dev-only-secret-change-me'), adminEmail: process.env.ADMIN_EMAIL || (production ? '' : 'admin@auragems.test'), adminPassword: process.env.ADMIN_PASSWORD || (production ? '' : 'ChangeMe123!'), databaseUrl: process.env.DATABASE_URL || '', flutterwaveSecretKey: process.env.FLUTTERWAVE_SECRET_KEY || '', flutterwaveWebhookSecret: process.env.FLUTTERWAVE_WEBHOOK_SECRET || '', paymentConfigured: Boolean(process.env.FLUTTERWAVE_SECRET_KEY && process.env.FLUTTERWAVE_WEBHOOK_SECRET), cloudinaryCloudName: process.env.CLOUDINARY_CLOUD_NAME || '', cloudinaryApiKey: process.env.CLOUDINARY_API_KEY || '', cloudinaryApiSecret: process.env.CLOUDINARY_API_SECRET || '', rateLimit: Number(process.env.RATE_LIMIT_PER_MINUTE || 120), sessionNonce: crypto.randomBytes(8).toString('hex') };
}

function assertProductionConfig(config) {
  if (!config.production) return;
  const missing = [];
  if (!strong(config.jwtSecret)) missing.push('JWT_SECRET');
  if (!email(config.adminEmail)) missing.push('ADMIN_EMAIL');
  if (!strong(config.adminPassword)) missing.push('ADMIN_PASSWORD');
  if (!config.databaseUrl) missing.push('DATABASE_URL');
  if (!config.paymentConfigured) missing.push('FLUTTERWAVE_SECRET_KEY and FLUTTERWAVE_WEBHOOK_SECRET');
  if (missing.length) throw new Error(`Production configuration invalid or missing: ${missing.join(', ')}`);
}

module.exports = { getConfig, assertProductionConfig, strong };