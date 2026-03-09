require('dotenv').config();

const config = {
  port: process.env.PORT || 4000,
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  metaAppSecret: process.env.META_APP_SECRET || process.env.WHATSAPP_APP_SECRET || process.env.APP_SECRET || null,
  metaGraphApiVersion: process.env.META_GRAPH_API_VERSION || 'v22.0',
  googleClientEmail: process.env.GOOGLE_CLIENT_EMAIL,
  googlePrivateKey: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  maxMessagesPerDay: parseInt(process.env.MAX_MESSAGES_PER_DAY || '80', 10),
  adminToken: process.env.ADMIN_TOKEN,
  dashboardOrigin: process.env.DASHBOARD_ORIGIN,
  globalWebhookVerifyToken:
    process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || process.env.GLOBAL_WEBHOOK_VERIFY_TOKEN,
  appSecret: process.env.META_APP_SECRET || process.env.WHATSAPP_APP_SECRET || process.env.APP_SECRET || null,
  timezone: process.env.TZ || 'Europe/Madrid'
};

module.exports = config;

