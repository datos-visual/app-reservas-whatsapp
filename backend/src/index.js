const express = require('express');
const cors = require('cors');
const config = require('./config');
const { startClient, getStatus } = require('./whatsappClient');
const { getAppointmentsByDate, getRecentMessages } = require('./db');

const app = express();

const allowedOrigin = config.dashboardOrigin || 'http://localhost:3000';

app.use(
  cors({
    origin: allowedOrigin,
    credentials: true
  })
);
app.use(express.json());

function authMiddleware(req, res, next) {
  const isProduction = process.env.NODE_ENV === 'production';
  const adminToken = config.adminToken;

  if (!isProduction && !adminToken) {
    return next();
  }

  if (isProduction && !adminToken) {
    console.error('[Auth] ADMIN_TOKEN no configurado en producción');
    return res.status(500).json({ error: 'Configuración de seguridad incompleta' });
  }

  const headerToken = req.header('x-admin-token');
  const authHeader = req.header('authorization') || '';
  const bearerToken = authHeader.toLowerCase().startsWith('bearer ')
    ? authHeader.slice(7)
    : null;

  const providedToken = headerToken || bearerToken;

  if (!providedToken || providedToken !== adminToken) {
    return res.status(401).json({ error: 'No autorizado' });
  }

  return next();
}

app.get('/health', (req, res) => {
  res.json({ ok: true });
});

app.use('/api', authMiddleware);

app.get('/api/whatsapp/status', (req, res) => {
  const status = getStatus();
  res.json(status);
});

app.get('/api/appointments', async (req, res) => {
  try {
    const { date } = req.query;
    const target = date || new Date().toISOString();
    const appointments = await getAppointmentsByDate(target);
    res.json(appointments);
  } catch (err) {
    console.error('[API] Error en /api/appointments', err);
    res.status(500).json({ error: 'Error obteniendo citas' });
  }
});

app.get('/api/messages', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit || '50', 10);
    const messages = await getRecentMessages(limit);
    res.json(messages);
  } catch (err) {
    console.error('[API] Error en /api/messages', err);
    res.status(500).json({ error: 'Error obteniendo mensajes' });
  }
});

app.listen(config.port, () => {
  console.log(`[API] Servidor escuchando en puerto ${config.port}`);
});

startClient().catch((err) => {
  console.error('[WhatsApp] Error inicializando cliente', err);
});

