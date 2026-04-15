# Project Overview

## Producto
SaaS multi-tienda de reservas por WhatsApp para comercios físicos y ecommerce.

## Objetivo de Fase 1
Tener una primera versión operativa en producción con:
- recepción de mensajes por WhatsApp
- consulta de disponibilidad
- confirmación de citas
- creación de eventos en Google Calendar
- persistencia en Supabase
- arquitectura multi-tenant real

## Stack
- Backend: Node.js + Express
- DB: Supabase (Postgres)
- WhatsApp: Meta WhatsApp Cloud API
- Calendar: Google Calendar API
- Deploy: Render
- Frontend: Next.js + Tailwind

## Decisiones cerradas
- Google Calendar por service account compartida
- WhatsApp semimanual
- Auth con Supabase Auth
- Fuente de verdad: Supabase
- Sin Redis en Fase 1