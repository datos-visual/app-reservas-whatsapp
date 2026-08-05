# Contrato de Encargado del Tratamiento

**Anexo al contrato de prestación del servicio CanalAgenda**
*(art. 28 del Reglamento (UE) 2016/679 — RGPD)*

> **Antes de usarlo:** rellena lo que va entre corchetes `[ ]` y **pásalo por un
> abogado**. Este contrato refleja con exactitud cómo funciona el sistema hoy
> (qué datos entran, dónde se alojan y a qué subencargados se ceden), pero la
> redacción jurídica debe validarla un profesional. Un contrato de encargo mal
> hecho no te protege: te expone.

---

## Reunidos

De una parte, **[Nombre del salón]**, con NIF **[NIF]** y domicilio en
**[dirección]**, representada por **[nombre del representante]** con DNI
**[DNI]**, en adelante el **RESPONSABLE**.

De otra parte, **[tu razón social]**, con NIF **[NIF]** y domicilio en
**[dirección]**, representada por **[tu nombre]** con DNI **[DNI]**, titular del
servicio **CanalAgenda**, en adelante el **ENCARGADO**.

Ambas partes se reconocen capacidad suficiente y acuerdan lo siguiente.

---

## 1. Objeto

El ENCARGADO trata datos personales por cuenta del RESPONSABLE con la única
finalidad de prestarle el servicio CanalAgenda: gestión de citas por WhatsApp,
agenda del negocio, recordatorios y, en su caso, los módulos adicionales
contratados.

El ENCARGADO **no tratará los datos para fines propios**, no los cederá a
terceros salvo lo previsto en la cláusula 6, y no los usará para entrenar
sistemas de inteligencia artificial ni para elaborar productos derivados.

## 2. Datos y personas afectadas

**Categorías de interesados:** clientes y clientas del RESPONSABLE, y personas
que contacten con él por WhatsApp o por teléfono.

**Categorías de datos:**

- Identificativos: nombre y número de teléfono.
- Contenido de los mensajes intercambiados con el asistente.
- Datos de las citas: fecha, hora, servicio, profesional asignada y estado.
- Metadatos técnicos: identificadores de mensaje, marcas de tiempo, registros de
  actividad.

**No se tratan** categorías especiales de datos (art. 9 RGPD). El RESPONSABLE se
compromete a no introducirlos en el sistema y a advertir a sus clientas de que
no los incluyan en los mensajes.

## 3. Duración

Este contrato estará vigente mientras dure la prestación del servicio. A su
finalización se aplicará lo previsto en la cláusula 9.

## 4. Obligaciones del ENCARGADO

1. Tratar los datos **siguiendo únicamente las instrucciones documentadas** del
   RESPONSABLE. Si considerase que una instrucción infringe la normativa, se lo
   comunicará de inmediato.
2. Guardar **secreto** sobre los datos, también después de terminar el contrato,
   y garantizar que quien tenga acceso asuma el mismo compromiso por escrito.
3. Mantener las **medidas de seguridad** de la cláusula 5.
4. **No comunicar los datos a terceros** salvo autorización o cuando lo exija la
   ley, en cuyo caso lo notificará previamente al RESPONSABLE si le está
   permitido.
5. **Asistir al RESPONSABLE** en la atención de los derechos de los interesados.
   Si una clienta ejerce un derecho ante el ENCARGADO, este se lo trasladará en
   un plazo máximo de **[3] días hábiles**.
6. **Notificar toda violación de seguridad** sin dilación indebida y, en todo
   caso, **antes de 24 horas** desde que tenga constancia, con la información
   necesaria para que el RESPONSABLE pueda notificar a la AEPD en las 72 horas
   que exige el art. 33 RGPD.
7. Ayudar al RESPONSABLE en las evaluaciones de impacto y consultas previas que
   procedan.
8. Poner a su disposición la información necesaria para acreditar el
   cumplimiento y **permitir auditorías**, con preaviso razonable y sin
   comprometer la seguridad de otros clientes.
9. Llevar un **registro de actividades de tratamiento** por cuenta del
   RESPONSABLE (art. 30.2 RGPD).

## 5. Medidas de seguridad (art. 32 RGPD)

El ENCARGADO aplica, como mínimo:

- **Cifrado en tránsito** (HTTPS/TLS) en todas las comunicaciones, y cifrado en
  reposo en la base de datos y las copias de seguridad.
- **Aislamiento entre clientes:** cada negocio tiene su identificador propio y
  toda consulta va filtrada por él. Ningún negocio puede ver datos de otro.
- **Control de acceso:** autenticación con contraseña para el panel del negocio,
  credenciales separadas para la administración, y principio de mínimo
  privilegio.
- **Verificación de origen** de los mensajes entrantes mediante firma
  criptográfica, para impedir peticiones suplantadas.
- **Credenciales y secretos** guardados exclusivamente en variables de entorno
  del servidor, nunca en el código ni en el navegador.
- **Registro de actividad** con trazas fechadas de las operaciones relevantes.
- **Copias de seguridad** gestionadas por el proveedor de base de datos, con
  posibilidad de restauración a un punto anterior.
- **Revisión periódica** de las medidas y del listado de subencargados.

## 6. Subencargados

El RESPONSABLE **autoriza expresamente** al ENCARGADO a servirse de los
siguientes subencargados, todos ellos vinculados por contrato con obligaciones
equivalentes a las de este documento:

| Subencargado | Servicio | Ubicación del tratamiento |
|---|---|---|
| Meta Platforms Ireland Ltd. | WhatsApp Business API (envío y recepción de mensajes) | Irlanda / EE. UU. |
| Supabase Inc. | Base de datos y autenticación | [región del proyecto] |
| Render Services Inc. | Alojamiento de la aplicación | [región] |
| Google Ireland Ltd. | Google Calendar; modelo Gemini para interpretar mensajes | Irlanda / EE. UU. |
| Mistral AI SAS | Modelo de lenguaje de respaldo | Francia |
| Twilio Ireland Ltd. | Telefonía del módulo de llamadas perdidas | Irlanda / EE. UU. |

El ENCARGADO informará al RESPONSABLE de cualquier alta o baja de subencargados
con una antelación mínima de **[30] días**, plazo durante el cual el RESPONSABLE
podrá oponerse por motivos razonables; si lo hiciera y no fuera posible una
alternativa, cualquiera de las partes podrá resolver el contrato sin penalización.

**Sobre el uso de inteligencia artificial:** el sistema envía el texto de los
mensajes a un modelo de lenguaje con la única finalidad de interpretar la
intención de la persona. El modelo **no decide ni responde por sí mismo**: su
salida se valida y es el sistema, con reglas deterministas, quien actúa. Los
proveedores utilizados no emplean estos datos para entrenar sus modelos según sus
condiciones de uso de API vigentes a la fecha de firma.

## 7. Transferencias internacionales

Cuando algún subencargado trate datos fuera del Espacio Económico Europeo, la
transferencia se ampara en las **Cláusulas Contractuales Tipo** aprobadas por la
Comisión Europea (Decisión 2021/914) y, cuando resulte aplicable, en el **Marco
de Privacidad de Datos UE-EE. UU.** El ENCARGADO mantiene a disposición del
RESPONSABLE la documentación acreditativa.

## 8. Obligaciones del RESPONSABLE

1. Entregar al ENCARGADO únicamente los datos necesarios para el servicio.
2. Informar a sus clientas del tratamiento y **publicar un aviso de privacidad**,
   así como recabar el consentimiento cuando la finalidad lo exija (por ejemplo,
   comunicaciones comerciales o promocionales).
3. **No utilizar los módulos promocionales** del servicio para enviar mensajes a
   quien no lo haya consentido.
4. Velar por el cumplimiento de la normativa **con carácter previo y durante**
   todo el tratamiento.
5. Custodiar sus credenciales de acceso y comunicar de inmediato cualquier
   sospecha de acceso no autorizado.

## 9. Al terminar el contrato

A elección del RESPONSABLE, comunicada por escrito en los **[30] días**
siguientes a la finalización, el ENCARGADO:

- **le devolverá** los datos en formato estructurado y de uso común (CSV o
  JSON), o
- **los suprimirá**, incluidas las copias existentes.

Transcurrido ese plazo sin indicación, se procederá a la **supresión**. El
ENCARGADO podrá conservar los datos que una norma le obligue a guardar,
debidamente bloqueados, durante el plazo legal.

## 10. Responsabilidad

Cada parte responderá de los daños que cause por incumplimiento de sus propias
obligaciones, conforme al art. 82 RGPD. [Cláusula de limitación de
responsabilidad — a redactar con tu abogado y coherente con el contrato
principal.]

## 11. Ley aplicable y jurisdicción

Este contrato se rige por la legislación española y por el RGPD. Para cualquier
controversia, las partes se someten a los Juzgados y Tribunales de **[ciudad]**,
con renuncia a cualquier otro fuero que pudiera corresponderles.

---

Y en prueba de conformidad, firman por duplicado en **[lugar]**, a **[fecha]**.

<br>

| Por el RESPONSABLE | Por el ENCARGADO |
|---|---|
| <br><br>Fdo.: [nombre] | <br><br>Fdo.: [tu nombre] |
| [Nombre del salón] | [tu razón social] |
