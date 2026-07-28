# 11 — Guion de alta de un cliente (piloto asistido)

> **Para quién:** José Manuel (el admin). Este es el guion que sigues TÚ para
> dejar funcionando a una peluquería, acompañando al cliente por videollamada.
> **No es autoservicio y no pasa nada:** la estrategia de Fase 1 es
> "instalación asistida — te lo dejamos funcionando en una llamada". El
> autoservicio real llega con *Embedded Signup* de Meta (Fase 2).
>
> **Duración realista:** 50-70 min de llamada + 24-72 h de espera de Meta.

---

## 0. Antes de la llamada — lo que pides al cliente (por WhatsApp, 2 días antes)

Mensaje tipo para enviarle:

> Para dejarte el sistema funcionando necesito que tengas a mano:
> 1. **Un número de móvil para el asistente.** Importante: ese número no podrá
>    seguir usando la app normal de WhatsApp. Lo ideal es una tarjeta nueva o
>    un número que no uses para hablar con clientes a mano.
> 2. **La cuenta de Google del negocio** (para la agenda).
> 3. **Tu lista de servicios** con precio y cuánto dura cada uno.
> 4. **Tu horario** de apertura y cierre, y los días que libras.
> 5. Si tienes página de Facebook o Instagram del negocio, tenerla a mano.

⚠️ **El punto 1 es el que rompe altas.** Si el cliente quiere usar el número
que ya usa con sus clientas, avísale de que perderá el WhatsApp normal en ese
número. Alternativa recomendada: número nuevo (tarjeta prepago) que luego
publicita como "el WhatsApp de citas".

---

## 1. La llamada, bloque a bloque

### Bloque 1 — Crear su cuenta (3 min)
1. Comparte pantalla. Ve a `https://app-whatsapp-frontend.onrender.com/register`.
2. Que el cliente ponga **su** email y una contraseña (que la anote él).
3. Entra directo: no hay confirmación por correo en esta fase.

### Bloque 2 — Su negocio y su sector (5 min)
1. Pantalla "Crea tu negocio": nombre comercial, zona horaria, duración de
   cita por defecto.
2. Pantalla "¿Cuál es tu sector?": elige **Peluquería**. Con eso se le cargan
   7 servicios típicos ya editables.

### Bloque 3 — Su catálogo real (10 min) ← *el cliente se engancha aquí*
1. Panel → botón **Catálogo**.
2. Ajustad juntos precios y duraciones reales. Borrar (desmarcar "visible")
   lo que no ofrezca y añadir lo que falte.
3. **Truco comercial:** deja que sea él quien escriba los precios. En cuanto
   ve su propio catálogo dentro del sistema, deja de ser "una app" y pasa a
   ser "su" agenda.

### Bloque 4 — Google Calendar (10 min)
1. En Google Calendar del cliente: crear un calendario nuevo llamado, por
   ejemplo, "Citas WhatsApp" (o usar el que ya use en el negocio).
2. Ese calendario → Configuración → **Compartir con determinadas personas** →
   Añadir personas → pegar:
   `calendar-reservas@whatsapp-reservas-489313.iam.gserviceaccount.com`
   → permiso **"Hacer cambios en los eventos"** → Enviar.
3. En la misma pantalla, más abajo: **Integrar calendario → ID del calendario**
   → copiar.
4. En el panel, pantalla de Calendar: pegar el ID → **Probar conexión** →
   debe salir OK. Si falla, el 95% de las veces es que faltó el permiso de
   "hacer cambios" o se compartió otro calendario.

### Bloque 5 — WhatsApp en Meta (15-20 min) ← *el bloque duro*
1. `business.facebook.com` con la cuenta del cliente (o crear el Business
   Manager si no lo tiene: nombre del negocio, su email).
2. Crear/entrar en **WhatsApp Manager** → añadir el número del bloque 0 →
   verificarlo por SMS o llamada.
3. Anotar el **identificador del número de teléfono** (`phone_number_id`) y
   el identificador de la cuenta (WABA id).
4. Generar un **token de acceso** para ese número (lo ideal es un token
   permanente de usuario del sistema; si generas uno temporal, apúntalo en el
   panel con su fecha de caducidad y el sistema te avisará antes de que expire).
5. Panel → pantalla WhatsApp → pegar `phone_number_id` + token →
   **Probar conexión** → OK.

⚠️ Añade también tu propia app de Meta como destino del webhook si el número
está en una WABA nueva: sin webhook, el bot recibe cero mensajes. Verifícalo
con la prueba del bloque 8 antes de colgar.

### Bloque 6 — Las plantillas, EL MISMO DÍA (10 min)
Las plantillas tardan **24-72 h** en aprobarse. Si no las mandas hoy, no hay
recordatorios esta semana. En WhatsApp Manager → Plantillas de mensajes →
Crear, con estos nombres exactos (el código los busca así):

| Nombre | Categoría | Para qué |
|---|---|---|
| `canalagenda_reminder_v1` | Servicio → Predeterminado | Recordatorio 24 h y 2 h |
| `canalagenda_waitlist_v1` | Marketing (Meta lo fuerza) | Aviso de hueco liberado |
| `canalagenda_missed_call_v2` | Servicio → Predeterminado | Solo si va a usar llamadas perdidas |

Los textos exactos están en `docs/09` y en el historial; **nunca** elijas la
categoría "Solicitud de permisos de llamada" (genera plantillas inservibles).

### Bloque 7 — Horario (5 min)
Por defecto queda L-V 9:00-19:00, fin de semana cerrado. Si su horario es
distinto, ajústalo tú (hoy se toca en base de datos; pasa a estar en el panel
en cuanto se implemente "horarios editables").

### Bloque 8 — La prueba en vivo (5 min) ← *no cuelgues sin esto*
Con el cliente delante, desde el móvil de él:
1. Escribe **"hola"** al número del bot → debe salir el menú con botones.
2. **[Reservar cita]** → su catálogo → un día → una hora → Confirmar.
3. Abrid Google Calendar: **el evento tiene que estar ahí**.
4. Escribe **"mis citas"** → aparece → cancélala con los botones.

Ese minuto es el que vende el producto. Si algo falla aquí, mira
`docs/runbook-incidencias.md` sin colgar la llamada.

---

## 2. Después de la llamada (tú solo, 2 min)

Cuando Meta apruebe las plantillas (te llega email, 24-72 h):

1. Entra en **`/admin`** con tu ADMIN_TOKEN.
2. En la tarjeta de esa tienda, sección "Módulos con plantilla de Meta":
   pulsa **[Plantilla aprobada ✓]** y luego **[Activado]** en Recordatorios.
3. Comprueba que la tarjeta no muestra incidencias en rojo.

**Ya no hace falta SQL para dar de alta a nadie.** (Las tiendas creadas antes
de julio-2026 pueden necesitar una reparación puntual: `POST /api/admin/reparar-fichas`.)

---

## 3. Checklist de "alta terminada"

- [ ] En `/admin`, la tienda sale con **WhatsApp OK** y **Calendar OK**, sin incidencias.
- [ ] Tiene su catálogo real (no los 7 de ejemplo sin tocar).
- [ ] Su horario es el suyo.
- [ ] Reserva de prueba hecha y visible en Google Calendar.
- [ ] Plantillas enviadas a Meta el mismo día.
- [ ] El cliente sabe entrar a su panel (URL + usuario) y ha visto el Catálogo.
- [ ] Le has dicho qué hacer si algo va mal (llamarte a ti).

---

## 4. Qué NO prometas todavía (fase julio-2026)

- **Llamadas perdidas → WhatsApp:** listo en código, pero necesita un número
  de voz español de Twilio (pendiente). No lo vendas como disponible ya.
- **Varias profesionales a la vez:** hoy la agenda es de una cita simultánea
  (bloque B5, en desarrollo). Si la peluquería tiene 3 sillas, avisa: de
  momento el bot ofrecerá una cita por franja.
- **Horarios y vacaciones desde el panel:** todavía los tocas tú.
- **Cobro online / pagos:** no existe y no está previsto en Fase 1.

Prometer de menos y cumplir es lo que convierte un piloto en cliente de pago.
