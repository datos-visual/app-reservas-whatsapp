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
  timezone: process.env.TZ || 'Europe/Madrid',
  // Módulo missed-call (voz). Solo backend, nunca en frontend.
  twilioAccountSid: process.env.TWILIO_ACCOUNT_SID || null,
  twilioAuthToken: process.env.TWILIO_AUTH_TOKEN || null,
  // URL pública exacta del backend (https://...onrender.com), necesaria para
  // validar la firma de Twilio detrás del proxy de Render.
  publicBaseUrl: process.env.PUBLIC_BASE_URL || null,
  // Token del cron externo que invoca /internal/missed-calls/dispatch
  internalCronToken: process.env.INTERNAL_CRON_TOKEN || null,
  // NLU (la IA solo interpreta, nunca decide): cascada "titular,suplente"
  nluProviders: process.env.NLU_PROVIDERS || 'gemini,mistral',
  geminiApiKey: process.env.GEMINI_API_KEY || null,
  geminiModel: process.env.GEMINI_MODEL || 'gemini-flash-lite-latest',
  mistralApiKey: process.env.MISTRAL_API_KEY || null,
  mistralModel: process.env.MISTRAL_MODEL || 'mistral-small-latest'
};

module.exports = config;

