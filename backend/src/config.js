require('dotenv').config();

const config = {
  port: process.env.PORT || 4000,
  whatsappSessionPath: process.env.WHATSAPP_SESSION_PATH || './.wwebjs_session',
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  googleCalendarId: process.env.GOOGLE_CALENDAR_ID,
  googleClientEmail: process.env.GOOGLE_CLIENT_EMAIL,
  googlePrivateKey: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  maxMessagesPerDay: parseInt(process.env.MAX_MESSAGES_PER_DAY || '80', 10),
  adminToken: process.env.ADMIN_TOKEN,
  dashboardOrigin: process.env.DASHBOARD_ORIGIN,
  timezone: process.env.TZ || 'Europe/Madrid'
};

module.exports = config;

