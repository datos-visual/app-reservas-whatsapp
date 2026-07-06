# Guía de Desarrollo y Deployment

## 🏗️ Estructura del Proyecto

```
reservas-whatsapp-web/
├── src/
│   ├── app/              # Next.js App Router páginas
│   ├── components/       # Componentes React reutilizables
│   └── data/            # Configuración y datos (future)
├── public/              # Assets estáticos
├── package.json
├── tsconfig.json
├── tailwind.config.js
└── next.config.ts
```

## 🎯 Stack de Tecnologías

| Layer | Tecnología | Version |
|-------|-----------|---------|
| Frontend | Next.js | 15.2.0+ |
| Styling | Tailwind CSS | 3.4.1+ |
| Language | TypeScript | 5.7+ |
| UI Icons | Lucide React | 0.408+ |
| Runtime | Node.js | 18+ |
| PM | npm | 10+ |

## 🚀 Deploy en Render

### Opción 1: Autodeployactualmente (Recomendado)

1. **Conectar GitHub**:
   - Ve a [Render](https://render.com)
   - Nuevo → Web Service
   - Conecta tu repo de GitHub

2. **Configurar**:
   - **Environment**: Node
   - **Region**: Elige la más cercana
   - **Plan**: Starter (gratis)

3. **Build & Start**:
   - Build: `npm install --legacy-peer-deps && npm run build`
   - Start: `npm start`

4. **Deploy**:
   - Click "Deploy"
   - Render desplegará automáticamente

### Opción 2: Vercel (Alternativa más rápida)

```bash
npm i -g vercel
vercel
```

Vercel autodetecta Next.js. Solo necesitas:
1. Conectar tu repo
2. Click "Deploy"
3. ¡Listo!

### Opción 3: Desplegar por CLI en Render

```bash
# 1. Instalar CLI
npm i -g render-cli

# 2. Authenticate
render login

# 3. Deploy
render deploy
```

## 📋 Pasos para Producción

### Pre-deployment Checklist

- [ ] URL es válida para Meta WhatsApp (DNS, SSL compatible)
- [ ] Variables de entorno configuradas en Render
- [ ] README.md actualizado
- [ ] No hay dependencias faltantes
- [ ] Sitio es responsive (/contacto prueba en mobile)
- [ ] Links internos funcionan
- [ ] SEO metadata sin placeholders

### Después del Deploy

1. **Test en navegador**:
   ```
   https://tu-app.onrender.com
   ```

2. **Verificar en Meta**:
   - Ir a Meta for Developers
   - Agregar URL en "Website"
   - Verificar dominio si lo requeries

3. **Monitorear logs**:
   ```bash
   render logs
   ```

## 🔄 CI/CD Automático

Render automáticamente:
- Detecta cambios en main
- Ejecuta build
- Deploya si todo es OK
- Rollback automático si falla

Configuración típica:
```yaml
# render.yaml (ya incluido)
services:
  - type: web
    name: reservas-wa-web
    runtime: node
    buildCommand: npm run build
    startCommand: npm start
    envVars:
      - key: NODE_ENV
        value: production
```

## 🛠️ Desarrollo Local

```bash
# Instalación
npm install --legacy-peer-deps

# Dev server (hot reload)
npm run dev
# Abre http://localhost:3000

# Build
npm run build

# Start production
npm start

# Lint
npm run lint
```

## 📝 Variables de Entorno Importantes

Crear `.env.local`:

```env
# Supabase (cuando esté listo)
# NEXT_PUBLIC_SUPABASE_URL=...
# NEXT_PUBLIC_SUPABASE_ANON_KEY=...

# Google OAuth (cuando esté listo)
# NEXT_PUBLIC_GOOGLE_CLIENT_ID=...
```

En Render, agregarlas en Dashboard → Settings → Environment Variables.

## 🐛 Troubleshooting

### "npm ERR! code EPERM"
```bash
# Solución
rm -rf node_modules package-lock.json
npm install --legacy-peer-deps
```

### Build falls en Render
- Revisa logs: `render logs`
- Verifica dependencies en package.json
- Intenta `npm ci` en lugar de `npm install`

### Sitio muy lento
- Render Starter tiene recursos limitados
- Considera upgrade a "Standard" plan
- Monitorea Performance en DevTools

## 🔐 Seguridad

- ✅ No guardes secrets en código
- ✅ Usa Environment Variables en Render
- ✅ Revisa logs regularmente
- ✅ Mantén dependencias actualizadas

```bash
# Revisar vulnerabilidades
npm audit
npm audit fix
```

## 📊 Próximas Fases

### Fase 2: Autenticación
- [ ] Supabase Auth (sign up, login)
- [ ] Dashboard privado
- [ ] Proteger rutas

### Fase 3: Backend Real
- [ ] Node.js + Express
- [ ] API endpoints /api/...
- [ ] Database schema
- [ ] Webhooks de WhatsApp

### Fase 4: Integraciones
- [ ] WhatsApp Cloud API
- [ ] Google Calendar OAuth
- [ ] Email service
- [ ] CRM fallback

## 🆘 Soporte y Recursos

- **Render Docs**: https://render.com/docs/deploy-nextjs
- **Next.js Docs**: https://nextjs.org/docs
- **Tailwind**: https://tailwindcss.com/docs
- **WhatsApp API**: https://developers.facebook.com/docs/whatsapp
- **GitHub**: Issues y Discussions

---

**Última actualización**: Abril 2026
**Owner**: Reservas WA Team
