# Reservas WA - Web Pública

Una plataforma SaaS para recibir y gestionar reservas por WhatsApp.

## 🚀 Stack Técnico

- **Frontend**: Next.js 15+ + TypeScript + Tailwind CSS
- **Base de datos**: Supabase (próximamente integraciones)
- **Deploy**: Render, Vercel o similar
- **Autenticación**: Preparado para implementar (placeholder actual)

## 📋 Requisitos previos

- Node.js 18+
- npm, yarn o pnpm

## 🛠️ Instalación local

### 1. Clonar el repositorio

```bash
git clone <tu-repo>
cd frontend-app-whatsapp
```

### 2. Instalar dependencias

```bash
npm install
```

### 3. Crear archivo de variables de entorno

```bash
cp .env.example .env.local
```

### 4. Ejecutar en desarrollo

```bash
npm run dev
```

La página estará disponible en `http://localhost:3000`

## 📦 Build para producción

```bash
npm run build
npm start
```

## 📍 Estructura del proyecto

```
src/
├── app/
│   ├── layout.tsx              # Layout raíz
│   ├── globals.css             # Estilos globales
│   ├── page.tsx                # Home
│   ├── como-funciona/page.tsx  # Página explicativa
│   ├── precios/page.tsx        # Pricing
│   ├── registro/page.tsx       # Formulario de registro
│   ├── contacto/page.tsx       # Contacto
│   ├── privacidad/page.tsx     # Política privacidad
│   └── terminos/page.tsx       # Términos de servicio
├── components/
│   ├── Navbar.tsx              # Barra de navegación
│   ├── Footer.tsx              # Pie de página
│   ├── HeroSection.tsx         # Sección hero
│   ├── FeatureCard.tsx         # Tarjetas de características
│   ├── PricingCard.tsx         # Tarjetas de pricing
│   ├── Section.tsx             # Wrapper de sección reutilizable
│   ├── FAQ.tsx                 # Componente FAQ
│   └── RegistrationForm.tsx    # Formulario de registro
└── data/                        # Datos y configuración
```

## 🎨 Diseño y Responsive

- Diseño mobile-first
- Responsive en todos los breakpoints
- Tailwind CSS para estilos
- Componentes reutilizables

## 📱 Páginas disponibles

- **/** - Home con hero, beneficios, FAQs
- **/como-funciona** - Explicación del flujo y pasos
- **/precios** - Planes y pricing
- **/registro** - Formulario de registro/solicitud
- **/contacto** - Formulario de contacto
- **/privacidad** - Política de privacidad
- **/terminos** - Términos de servicio

## 🔧 Variables de entorno

Consulta `.env.example` para ver las variables disponibles. Actualmente el proyecto se ejecuta sin variables externas obligatorias, pero está preparado para:

- Supabase (próximas fases)
- Google OAuth (próximas fases)
- Email sending (próximas fases)

## 🚀 Deploy en Render

### 1. Conectar repositorio a Render

1. Ve a [render.com](https://render.com)
2. Crea una nueva aplicación web ("New" → "Web Service")
3. Conecta tu repositorio de GitHub
4. Selecciona el branch a deployer (ej: main)

### 2. Configurar el servicio

- **Name**: reservas-whatsapp-web (o similar)
- **Environment**: Node
- **Build Command**: `npm install && npm run build`
- **Start Command**: `npm start`
- **Instance Type**: Starter (gratis)

### 3. Variables de entorno

Añade en Render → Environment:

```
NODE_ENV=production
```

### 4. Deploy

Render desplegará automáticamente cada vez que hagas push a main.

El sitio estará disponible en: `https://reservas-whatsapp-web.onrender.com` (o similar)

## 📝 Notas de implementación

### Formularios

El formulario de registro está implementado con:
- Validación del lado del cliente
- UI controlada con feedback visual
- Mensaje de éxito al enviar

Está preparado para integrarse con:
- Supabase (tabla `lead_requests`)
- Email service
- CRM externo

### Placeholders

Elementos que son placeholders y requieren evolución:

1. **Autenticación**: Actualmente no hay login. Las páginas de panel están protegidas.
2. **Backend**: No hay conectado backend Node.js/Express aún.
3. **Supabase**: Preparado pero no configurado.
4. **WhatsApp API**: Links y documentación incluidos, pero no integrados.
5. **Google Calendar**: OAuth preparado, no configurado.

### Próximas fases

- [ ] Conectar autenticación con Supabase Auth
- [ ] Crear panel de administración
- [ ] Integrar WhatsApp Cloud API
- [ ] Conectar Google Calendar
- [ ] Implementar backend real
- [ ] Sistema de webhooks
- [ ] Reportes y analítica

## 🤝 Contribuir

Este es un proyecto activo. Para contribuir:

1. Fork el repositorio
2. Crea una rama (`git checkout -b feature/MiFeature`)
3. Commit cambios (`git commit -m 'Add MiFeature'`)
4. Push a la rama (`git push origin feature/MiFeature`)
5. Abre un Pull Request

## 📄 Licencia

Reservado todos los derechos. © 2026 Reservas WA.

## 📞 Soporte

- Email: hola@reservaswa.com
- Issues: Usar GitHub Issues para bugs
- Roadmap: Consultar tablero de proyectos

---

**Versión**: 0.1.0 (MVP Público)
**Estado**: En desarrollo activo
**Última actualización**: Abril 2026
