# Cómo activar el desvío de llamadas perdidas (guía para el negocio)

> Documento para entregar al cliente final durante la instalación del módulo
> "Llamada perdida → WhatsApp" de CanalAgenda. Lenguaje no técnico a propósito.

## Qué vamos a hacer

Tu número de teléfono **no cambia**: tus clientes siguen llamando al de
siempre. Solo vamos a decirle a tu compañía que, **únicamente cuando no
puedas contestar** (estás ocupado, comunicando o sin cobertura), la llamada
se pase a nuestro sistema. Ahí el cliente oye un mensaje breve y recibe al
momento un WhatsApp tuyo para reservar cita. Las llamadas que sí contestas
funcionan exactamente igual que siempre.

## Activación desde un MÓVIL (Movistar, Vodafone, Orange, Digi y OMVs)

Los códigos son estándar en todas las operadoras móviles españolas.
Marca estos tres códigos en el teclado de llamada (como si llamaras) y pulsa
llamar tras cada uno. Sustituye `NUMERO` por el número que te daremos
(con +34, ejemplo: +34911234567):

| Situación | Código a marcar |
|---|---|
| Si no contestas | `**61*NUMERO#` |
| Si estás comunicando | `**67*NUMERO#` |
| Si estás apagado o sin cobertura | `**62*NUMERO#` |

Tras marcar cada código, la pantalla mostrará una confirmación
("Desvío de llamadas activado" o similar).

**Ajustar cuántos segundos suena antes de desviar** (opcional, solo para el
caso "no contestas"; por defecto suelen ser 15 segundos):

```
**61*NUMERO**25#      ← ejemplo con 25 segundos (válidos: 5 a 30, de 5 en 5)
```

**Comprobar que está activo:** marca `*#61#`, `*#67#` y `*#62#`.

**Desactivarlo todo** (si algún día quieres quitarlo): marca `##002#`.
Para desactivar solo uno: `##61#`, `##67#` o `##62#`.

## Activación en un TELÉFONO FIJO

En fijo los códigos varían según la compañía y el tipo de línea (tradicional
o fibra/VoIP). Lo más fiable: llama a tu compañía (Movistar 1004,
Vodafone 22123, Orange 1470, Digi 1200) y pídelo con esta frase exacta:

> "Quiero activar el **desvío de llamadas por no contestación y por línea
> ocupada** hacia el número +34XXXXXXXXX."

En muchos routers de fibra también puede activarse desde el portal web de la
compañía (área de cliente → fijo → desvíos). Si tienes dudas, lo hacemos
juntos en la llamada de instalación.

## Preguntas frecuentes

**¿Cuánto cuesta el desvío?** El tramo desviado lo tarifica tu compañía como
una llamada saliente tuya. Con las tarifas planas actuales (la práctica
totalidad) está incluido y cuesta 0 €. Si tienes una tarifa antigua por
consumo, confírmalo con tu operadora.

**¿El cliente nota algo raro?** Oye los tonos normales y, si no contestas,
un mensaje breve: "Ahora no podemos atenderte; te escribimos por WhatsApp
ahora mismo". Y cuelga. El WhatsApp le llega en segundos.

**¿Y si el cliente llama con número oculto?** No se le puede escribir; la
llamada queda registrada en tu panel de todas formas.

**¿Recibirá WhatsApp cada vez que llame?** No: como máximo un mensaje al día
por cliente, nunca de noche (21:00-09:00, se envía a la mañana siguiente), y
si responde "No, gracias" no volvemos a escribirle nunca.

**¿Puedo probarlo?** Sí: llama a tu propio negocio desde tu móvil personal y
no contestes. Debe llegarte el WhatsApp en menos de un minuto.
