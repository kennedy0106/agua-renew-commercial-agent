# Fase 1 — Captación Automática en Meta + Registro de Leads + Handoff Manual a WhatsApp

## Documento técnico para implementación en Codex

---

# 1. Propósito

Implementar una primera fase de automatización comercial para Agua ReNew centrada exclusivamente en Facebook e Instagram.

El objetivo de esta fase es automatizar la parte repetitiva de la atención inicial en Meta Business hasta obtener los datos mínimos del prospecto, guardarlos de forma estructurada en una base de datos y dejar el lead listo para que una persona continúe manualmente por WhatsApp.

Esta fase NO debe automatizar todavía el envío real mediante WhatsApp Cloud API ni la conversación comercial completa dentro de WhatsApp.

La meta es resolver primero:

```text
Facebook / Instagram
        ↓
clasificación del mensaje
        ↓
captura de datos
        ↓
persistencia
        ↓
lead listo
        ↓
humano abre WhatsApp con mensaje precargado
        ↓
humano envía
        ↓
sistema confirma en Meta
```

---

# 2. Alcance de esta fase

Esta fase debe incluir:

1. Recepción de mensajes de Facebook e Instagram mediante APIs oficiales de Meta.
2. Identificación del origen del mensaje.
3. Clasificación de la conversación.
4. Detección de si es un prospecto comercial real.
5. Saludo automático según horario de Lima.
6. Envío del mensaje inicial de captación.
7. Extracción incremental de:
   - número de WhatsApp;
   - producto;
   - modalidad comercial.
8. Persistencia de leads y mensajes en Neon PostgreSQL.
9. Panel interno de leads.
10. Exportación de leads a Excel o CSV.
11. Generación de enlace para abrir WhatsApp con mensaje precargado.
12. Confirmación manual de que el WhatsApp fue enviado.
13. Respuesta automática en Meta después de la confirmación humana.
14. Estados de control para evitar duplicados.
15. Capacidad de intervención humana.
16. Logs y trazabilidad.

Esta fase NO incluye:

- WhatsApp Cloud API automática;
- plantillas de WhatsApp;
- bot comercial completo en WhatsApp;
- CRM completo;
- analítica avanzada;
- scoring avanzado;
- automatización de cierre;
- seguimiento automático multicanal;
- pagos;
- cotizaciones automáticas dentro de WhatsApp.

---

# 3. Arquitectura general

```text
Meta Ads / Organic Messages
        ↓
Facebook / Instagram
        ↓
Meta Webhook
        ↓
Conversation Origin Resolver
        ↓
Inbound Conversation Router
        ↓
┌──────────────────────────────┐
│ ¿Qué tipo de conversación es?│
└───────────────┬──────────────┘
                ↓
 ┌──────────────┼────────────────────┐
 ↓              ↓                    ↓
Lead        Proveedor / spam     Soporte / otro
 ↓
Social Lead Intake
 ↓
Captura incremental
 ↓
WhatsApp + producto + modalidad
 ↓
Neon PostgreSQL
 ↓
READY_FOR_WHATSAPP
 ↓
Panel interno
 ↓
"Abrir WhatsApp"
 ↓
WhatsApp Business / Web
 ↓
Humano pulsa enviar
 ↓
"Marcar como contactado"
 ↓
Sistema responde en Meta
 ↓
CONTACTED_MANUALLY
```

---

# 4. Principio de diseño

El `CommercialAgent` no debe intervenir todavía en esta etapa como asesor comercial completo.

Esta fase es una capa previa especializada.

Responsabilidades:

```text
SocialLeadIntake
→ captar
→ clasificar
→ recordar
→ organizar
→ preparar handoff
```

El agente comercial futuro se encargará de:

```text
CommercialAgent
→ explicar
→ cotizar
→ manejar objeciones
→ recomendar
→ cerrar
```

No mezclar ambas responsabilidades.

---

# 5. Tecnologías propuestas

## Backend

Node.js.

Debe mantenerse compatible con la arquitectura existente del proyecto.

## Hosting

Square Cloud.

Objetivo:

- webhook permanente;
- backend 24/7;
- workers;
- API interna;
- panel;
- despliegue sencillo;
- logs;
- auto-restart.

## Base de datos

Neon PostgreSQL Free durante la primera etapa.

La base debe ser la fuente de verdad.

No utilizar Excel como base principal.

## Inteligencia artificial

DeepSeek.

Usar principalmente para:

- clasificación semántica;
- extracción de información;
- interpretación de lenguaje libre.

No usar IA para controlar estados determinísticos.

## Frontend / panel

Puede utilizarse la tecnología web que mejor encaje con el repositorio actual.

Debe priorizar:

- simplicidad;
- carga rápida;
- uso interno;
- responsive;
- facilidad de despliegue.

---

# 6. Fuentes de mensajes

Diferenciar como mínimo:

```text
instagram
facebook_messenger
```

Y origen:

```text
ad_automation
comment_trigger
organic_dm
manual_contact
unknown
```

Debe persistirse el canal y el origen.

---

# 7. Mensajes automáticos originados por anuncios

Importante:

Un mensaje generado automáticamente por Meta después de que una persona comenta determinada palabra NO debe interpretarse como un mensaje escrito libremente por el usuario.

Ejemplo:

> ¿Podrían darme más información del negocio?

Puede provenir del anuncio.

Por lo tanto:

```text
automation_triggered = true
```

no implica automáticamente:

```text
conversation_type = commercial_lead
```

El sistema debe esperar/interpetar la siguiente interacción real del usuario.

---

# 8. Clasificación de conversación

Crear un componente similar a:

```text
InboundConversationRouter
```

Categorías mínimas:

```text
commercial_lead
service_provider
existing_customer
support_or_complaint
employment_or_job
spam_or_irrelevant
unclear
```

---

# 9. Ejemplos de clasificación

## Prospecto real

Mensaje:

> Quiero vender agua con mi marca.

Resultado:

```json
{
  "conversation_type": "commercial_lead",
  "confidence": 0.99
}
```

## Proveedor

Mensaje:

> Somos una agencia de marketing y queremos ofrecerles manejo de redes.

Resultado:

```json
{
  "conversation_type": "service_provider",
  "confidence": 0.99
}
```

## Caso que NO debe confundirse

Mensaje:

> Tengo una agencia de marketing y quiero botellas con nuestro logo.

Resultado correcto:

```json
{
  "conversation_type": "commercial_lead",
  "confidence": 0.99,
  "offering_services_to_renew": false
}
```

No utilizar reglas triviales como:

```javascript
if (text.includes("marketing")) {
  return "service_provider";
}
```

---

# 10. Salida estructurada de DeepSeek

La clasificación debe solicitar salida JSON.

Ejemplo:

```json
{
  "conversation_type": "commercial_lead",
  "confidence": 0.96,
  "commercial_intent": true,
  "offering_services_to_renew": false,
  "reason_code": "asks_about_private_label_water"
}
```

Temperatura:

```text
0
```

---

# 11. Thresholds iniciales

Propuesta inicial:

```text
confidence >= 0.85
→ automatizar

0.60 <= confidence < 0.85
→ unclear / aclaración / revisión

confidence < 0.60
→ revisión humana
```

Los thresholds deben ser configurables.

---

# 12. Control humano

Toda conversación debe tener:

```text
control_mode
```

Valores:

```text
AUTO
HUMAN
PAUSED
```

## AUTO

La automatización puede responder.

## HUMAN

Una persona está atendiendo.

El bot no debe responder.

## PAUSED

Atención automática temporalmente suspendida.

---

# 13. Primer mensaje de Agua ReNew

El primer mensaje debe incluir saludo según horario local de Lima.

Zona horaria:

```text
America/Lima
```

Rangos sugeridos:

```text
05:00–11:59 → Buenos días
12:00–18:59 → Buenas tardes
19:00–04:59 → Buenas noches
```

Ejemplo:

> Buenos días. Gracias por escribir a Agua ReNew 💧  
> Para cotizarle, por favor indíquenos:
>
> 📱 Su número de WhatsApp.
>
> 💧 El producto de su interés:
> • Bidón de 20 L  
> • Botella de 1 L  
> • Botella de 625 ml
>
> 🏷️ ¿Cómo desea comercializarlo?  
> ✅ Con su propia marca (Maquila)  
> ✅ Con la marca Agua ReNew (Distribución)

---

# 14. Evitar repetición del mensaje inicial

Guardar:

```text
initial_social_message_sent = true
```

Nunca volver a enviar el bloque completo si ya fue enviado.

---

# 15. Datos mínimos a capturar

Campos principales:

```text
phone
product
modality
```

## product

Valores canónicos:

```text
20l
1l
625ml
null
```

## modality

Valores:

```text
maquila
distribution
null
```

---

# 16. Captura incremental

Los datos pueden llegar en cualquier orden.

Ejemplo:

Mensaje 1:

> 20 litros

Estado:

```json
{
  "product": "20l",
  "phone": null,
  "modality": null
}
```

Mensaje 2:

> con mi marca

Estado:

```json
{
  "product": "20l",
  "phone": null,
  "modality": "maquila"
}
```

Mensaje 3:

> 999999999

Estado:

```json
{
  "product": "20l",
  "phone": "999999999",
  "modality": "maquila"
}
```

---

# 17. No repetir preguntas ya contestadas

El sistema siempre debe consultar el estado persistido antes de responder.

## Producto conocido

Usuario:

> 625 ml

Respuesta:

> Perfecto. Bríndeme su número de WhatsApp para enviarle la información, por favor.

No preguntar nuevamente:

> ¿Qué producto desea?

## Modalidad conocida

Usuario:

> Con mi propia marca.

Respuesta:

> De acuerdo. Bríndeme su número de WhatsApp para enviarle la información, por favor.

No volver a preguntar modalidad.

---

# 18. WhatsApp como dato prioritario

La captación no debe convertirse en un formulario largo.

Cuando se obtiene un teléfono válido:

```text
status = READY_FOR_WHATSAPP
```

aunque falte producto o modalidad.

Los datos faltantes pueden completarse manualmente por WhatsApp.

---

# 19. Validación de teléfono

Normalizar teléfonos peruanos.

Ejemplo:

```text
955 623 069
955-623-069
+51 955623069
51955623069
```

Todos deberían convertirse a un formato canónico.

Ejemplo sugerido:

```text
+51955623069
```

Guardar también el valor original si es útil para auditoría.

---

# 20. No asumir que todo número pertenece a Perú

En primera versión se puede priorizar Perú.

Pero la lógica debe permitir:

```text
country_code
phone_e164
```

No hardcodear la estructura de forma irreversible.

---

# 21. Esquema de base de datos

## Tabla leads

Propuesta:

```sql
CREATE TABLE leads (
  id UUID PRIMARY KEY,

  source_channel TEXT NOT NULL,
  source_origin TEXT,
  source_ad_id TEXT,
  source_conversation_id TEXT,

  meta_user_id TEXT,
  meta_username TEXT,

  conversation_type TEXT,
  classification_confidence NUMERIC,

  phone_raw TEXT,
  phone_e164 TEXT,

  product TEXT,
  modality TEXT,

  status TEXT NOT NULL,
  control_mode TEXT NOT NULL DEFAULT 'AUTO',

  initial_social_message_sent BOOLEAN NOT NULL DEFAULT FALSE,

  whatsapp_opened_at TIMESTAMPTZ,
  contacted_at TIMESTAMPTZ,
  meta_confirmation_sent_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

Adaptar tipos y constraints a los estándares existentes del proyecto.

---

# 22. Tabla de mensajes

```sql
CREATE TABLE lead_messages (
  id UUID PRIMARY KEY,

  lead_id UUID NOT NULL REFERENCES leads(id),

  channel TEXT NOT NULL,
  direction TEXT NOT NULL,

  actor_type TEXT,
  actor_id TEXT,

  external_message_id TEXT,

  content TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

# 23. Idempotencia

`external_message_id` debe ser único cuando corresponda.

Objetivo:

Si Meta entrega dos veces el mismo webhook:

```text
evento A
evento A repetido
```

el sistema procesa solamente una vez.

---

# 24. Estados de lead para Fase 1

Usar:

```text
NEW
COLLECTING
WAITING_PHONE
READY_FOR_WHATSAPP
CONTACT_OPENED
CONTACTED_MANUALLY
CLOSED
```

No crear todavía estados de WhatsApp Cloud API.

---

# 25. Semántica de los estados

## NEW

Lead recién detectado.

## COLLECTING

Se están obteniendo datos.

## WAITING_PHONE

Falta WhatsApp.

## READY_FOR_WHATSAPP

Ya existe teléfono válido.

## CONTACT_OPENED

Una persona pulsó "Abrir WhatsApp".

No significa que haya enviado el mensaje.

## CONTACTED_MANUALLY

La persona confirmó que realmente contactó al lead.

## CLOSED

Proceso de captación terminado.

---

# 26. Panel interno de leads

Crear una vista administrativa.

Ruta conceptual:

```text
/admin/leads
```

No necesariamente debe ser pública.

---

# 27. Tabla principal del panel

Mostrar:

```text
Fecha
Canal
Usuario
Teléfono
Producto
Modalidad
Tipo
Estado
Acciones
```

Ejemplo:

| Fecha | Canal | Usuario | WhatsApp | Producto | Modalidad | Estado | Acción |
|---|---|---|---|---|---|---|---|
| 24/08 | Instagram | @usuario | 955... | 20 L | Maquila | Listo | Abrir WhatsApp |
| 24/08 | Facebook | Nombre | 987... | 625 ml | — | Listo | Abrir WhatsApp |
| 24/08 | Instagram | @otro | — | 1 L | Distribución | Falta WhatsApp | — |

---

# 28. Filtros del panel

Como mínimo:

```text
Hoy
Últimos 7 días
Mes actual
Todos
```

Por estado:

```text
Pendientes
Listos para WhatsApp
Contactados
Cerrados
```

Por canal:

```text
Instagram
Facebook
Todos
```

Por tipo:

```text
commercial_lead
service_provider
support
etc.
```

---

# 29. Indicadores simples

No construir un dashboard avanzado.

Mostrar solamente:

```text
Leads hoy
Listos para WhatsApp
Pendientes
Contactados
```

Opcional:

```text
% que deja WhatsApp
```

---

# 30. Botón "Abrir WhatsApp"

Cuando el lead tenga teléfono válido:

```text
READY_FOR_WHATSAPP
```

mostrar:

```text
Abrir WhatsApp
```

---

# 31. Generación del enlace

Construir un enlace compatible con WhatsApp.

Conceptualmente:

```text
https://wa.me/<numero>?text=<mensaje_codificado>
```

El backend debe generar el mensaje.

No generar el enlace en base a texto ingresado manualmente cada vez.

---

# 32. Mensaje precargado

El contenido depende del contexto conocido.

## Producto + modalidad conocidos

Ejemplo:

```text
product = 625ml
modality = maquila
```

Mensaje:

> Buenas tardes. Gracias por comunicarse con Agua ReNew a través de Instagram. Nos indicó que está interesado en botellas de 625 ml con su propia marca. Le escribimos por este medio para continuar con la información y atención.

---

# 33. Solo producto

```text
product = 20l
modality = null
```

Mensaje:

> Buenas tardes. Gracias por comunicarse con Agua ReNew a través de Instagram. Nos indicó que está interesado en bidones de 20 L. Por este medio podemos continuar brindándole la información.

---

# 34. Solo modalidad

```text
product = null
modality = maquila
```

Mensaje:

> Buenas tardes. Gracias por comunicarse con Agua ReNew a través de Instagram. Nos indicó que está interesado en trabajar con su propia marca. Por este medio podemos continuar brindándole la información sobre nuestro servicio de maquila.

---

# 35. Solo teléfono

Si no conocemos producto ni modalidad:

> Buenas tardes. Gracias por comunicarse con Agua ReNew a través de Instagram. Le escribimos por este medio para continuar con la información solicitada.

Nunca inventar producto o modalidad.

---

# 36. Saludo del enlace de WhatsApp

El saludo debe calcularse al momento de generar/abrir el enlace.

Usar:

```text
America/Lima
```

No reutilizar necesariamente el saludo que se usó horas antes en Meta.

---

# 37. Acción al pulsar "Abrir WhatsApp"

Cuando el usuario interno pulsa el botón:

1. registrar:
   ```text
   whatsapp_opened_at
   ```
2. cambiar estado:
   ```text
   CONTACT_OPENED
   ```
3. abrir WhatsApp en nueva pestaña/app.

NO marcar como contactado todavía.

---

# 38. Confirmación humana

Agregar botón:

```text
Marcar como contactado
```

El operador solo lo pulsa después de enviar realmente el WhatsApp.

Al pulsarlo:

```text
status = CONTACTED_MANUALLY
contacted_at = now()
```

---

# 39. Confirmación automática en Meta

Después de:

```text
CONTACTED_MANUALLY
```

el backend envía automáticamente por Meta:

> Ya le enviamos la información por WhatsApp. Podemos continuar la atención por ese medio.

Guardar:

```text
meta_confirmation_sent_at
```

---

# 40. No confirmar si no hubo envío

Si el operador solamente abre WhatsApp pero no pulsa:

```text
Marcar como contactado
```

NO enviar confirmación en Meta.

---

# 41. Evitar doble confirmación

Si:

```text
meta_confirmation_sent_at != null
```

no volver a enviar la confirmación.

---

# 42. Manejo de corrección de teléfono

Si el prospecto escribe:

> Mi número correcto es 999999999.

Actualizar:

```text
phone_raw
phone_e164
```

Si estaba:

```text
CONTACT_OPENED
```

puede volver a:

```text
READY_FOR_WHATSAPP
```

si todavía no fue confirmado como contactado.

Guardar evento del cambio.

---

# 43. Tabla de eventos opcional pero recomendada

```sql
CREATE TABLE lead_events (
  id UUID PRIMARY KEY,
  lead_id UUID NOT NULL REFERENCES leads(id),
  event_type TEXT NOT NULL,
  payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

Ejemplos:

```text
LEAD_CREATED
CLASSIFIED
PHONE_CAPTURED
PRODUCT_CAPTURED
MODALITY_CAPTURED
WHATSAPP_OPENED
CONTACT_CONFIRMED
META_CONFIRMATION_SENT
CONTROL_CHANGED
```

---

# 44. Exportación de leads

Añadir botón:

```text
Exportar
```

Formatos:

```text
.xlsx
.csv
```

Prioridad:

```text
.xlsx
```

---

# 45. Columnas del Excel

Como mínimo:

```text
ID
Fecha de creación
Canal
Origen
Usuario Meta
Tipo de conversación
Confianza clasificación
WhatsApp
Producto
Modalidad
Estado
Modo de control
Fecha apertura WhatsApp
Fecha de contacto
Fecha confirmación Meta
```

---

# 46. Filtros de exportación

Exportar según filtros activos.

Ejemplos:

```text
Hoy
Últimos 7 días
Mes actual
Rango personalizado
```

También:

```text
Todos
Solo leads comerciales
Solo listos
Solo contactados
```

---

# 47. No almacenar Excel como fuente de verdad

La estructura debe ser:

```text
Neon PostgreSQL
      ↓
consulta
      ↓
generación dinámica Excel
```

Nunca:

```text
Excel
↓
base del sistema
```

---

# 48. Modo de intervención humana

Desde el panel debe permitirse:

```text
Tomar control
```

Esto cambia:

```text
control_mode = HUMAN
```

Mientras:

```text
control_mode = HUMAN
```

la automatización no responde.

También:

```text
Devolver a automático
```

cambia:

```text
control_mode = AUTO
```

---

# 49. DeepSeek en esta fase

DeepSeek debe utilizarse únicamente cuando aporta valor.

Usos:

```text
clasificación
extracción semántica
normalización de intención
```

No usar DeepSeek para:

```text
decidir estados
validar teléfono
marcar contactado
exportar Excel
decidir si enviar confirmación
```

---

# 50. Extracción semántica

Ejemplo:

Usuario:

> quiero poner mi logo en las botellitas pequeñas

Resultado esperado:

```json
{
  "modality": "maquila",
  "product": null,
  "phone": null
}
```

No asumir 625 ml si "botellitas pequeñas" no es suficientemente específico.

---

# 51. Extracción de múltiples datos

Usuario:

> 625 ml con mi marca, mi número es 955623069

Resultado:

```json
{
  "product": "625ml",
  "modality": "maquila",
  "phone": "+51955623069"
}
```

---

# 52. Priorizar extracción determinística cuando corresponda

Teléfono:

regex/normalización determinística.

Producto explícito:

```text
20 L
1 L
625 ml
```

puede resolverse deterministicamente.

DeepSeek debe ayudar principalmente con lenguaje ambiguo.

---

# 53. Meta Webhook

Debe:

1. verificar webhook;
2. validar evento;
3. identificar canal;
4. obtener external message ID;
5. verificar idempotencia;
6. guardar mensaje;
7. determinar lead;
8. ejecutar clasificación/extracción;
9. decidir respuesta;
10. enviar respuesta mediante API oficial.

---

# 54. Seguridad

Nunca guardar:

- access tokens en código;
- secretos en repositorio;
- credenciales Neon hardcodeadas.

Usar variables de entorno.

Ejemplo:

```text
META_APP_SECRET
META_VERIFY_TOKEN
META_PAGE_ACCESS_TOKEN
DATABASE_URL
DEEPSEEK_API_KEY
```

---

# 55. Logs

Registrar como mínimo:

```text
webhook_received
message_saved
classification_completed
lead_updated
meta_reply_sent
whatsapp_link_generated
contact_confirmed
export_generated
error
```

No escribir tokens ni secretos en logs.

---

# 56. Errores de DeepSeek

Si DeepSeek falla:

- no perder el mensaje;
- no marcarlo como procesado erróneamente;
- registrar error;
- utilizar fallback conservador.

Fallback sugerido:

```text
conversation_type = unclear
```

si no existe suficiente seguridad.

---

# 57. Errores de Meta

Si enviar respuesta falla:

- registrar error;
- mantener mensaje;
- permitir reintento;
- evitar duplicados.

---

# 58. Métricas mínimas

Guardar suficientes datos para calcular:

```text
conversaciones recibidas
commercial_leads
service_providers
unclear
leads con teléfono
leads listos para WhatsApp
leads contactados
```

---

# 59. Embudo futuro

Los datos deben permitir:

```text
Meta conversations
↓
commercial leads
↓
phone captured
↓
contacted manually
↓
future WhatsApp sales
```

No implementar todavía conversiones posteriores.

---

# 60. Estructura conceptual de módulos

Adaptar a la estructura existente.

Ejemplo:

```text
src/
  meta/
    webhook-handler
    meta-client
    origin-resolver
    inbound-router
    social-lead-intake

  leads/
    lead-service
    lead-repository
    lead-state
    lead-export

  ai/
    intake-classifier
    intake-extractor

  admin/
    leads-api
    leads-ui

  shared/
    phone-normalizer
    timezone
    idempotency
```

---

# 61. Flujo completo — Caso 1

Meta:

> ¿Podrían darme más información del negocio?

Sistema reconoce:

```text
source_origin = ad_automation
```

Envía:

> Buenas tardes. Gracias por escribir a Agua ReNew 💧  
> Para cotizarle...

Usuario:

> 20 litros

Sistema guarda:

```text
product = 20l
status = WAITING_PHONE
```

Respuesta:

> Perfecto. Bríndeme su número de WhatsApp para enviarle la información, por favor.

Usuario:

> 955623069

Sistema:

```text
phone = +51955623069
status = READY_FOR_WHATSAPP
```

Panel:

```text
[Abrir WhatsApp]
```

Humano pulsa.

WhatsApp:

> Buenas tardes. Gracias por comunicarse con Agua ReNew a través de Instagram. Nos indicó que está interesado en bidones de 20 L. Por este medio podemos continuar brindándole la información.

Humano envía.

Panel:

```text
[Marcar como contactado]
```

Humano confirma.

Sistema:

```text
status = CONTACTED_MANUALLY
```

Meta:

> Ya le enviamos la información por WhatsApp. Podemos continuar la atención por ese medio.

---

# 62. Flujo completo — Caso 2

Usuario:

> Mi número es 999999999, quiero con mi marca.

Extracción:

```text
phone = +51999999999
modality = maquila
product = null
```

Estado:

```text
READY_FOR_WHATSAPP
```

Panel genera:

> Buenas tardes. Gracias por comunicarse con Agua ReNew a través de Instagram. Nos indicó que está interesado en trabajar con su propia marca. Por este medio podemos continuar brindándole la información sobre nuestro servicio de maquila.

No preguntar nuevamente la modalidad.

---

# 63. Flujo completo — Caso proveedor

Usuario:

> Somos una empresa de publicidad y ofrecemos administración de redes.

DeepSeek:

```text
conversation_type = service_provider
```

No entrar a SocialLeadIntake.

No pedir:

```text
WhatsApp
producto
modalidad
```

Puede:

- dejar para revisión humana;
- etiquetar;
- usar una respuesta institucional posteriormente.

---

# 64. Flujo completo — Caso ambiguo

Usuario:

> Somos una agencia.

No asumir.

Resultado:

```text
conversation_type = unclear
```

Esperar contexto o solicitar aclaración.

---

# 65. Flujo completo — Caso cambio a humano

Mientras el bot está captando:

Usuario interno pulsa:

```text
Tomar control
```

Estado:

```text
control_mode = HUMAN
```

A partir de ahí:

```text
webhook recibe mensajes
↓
los guarda
↓
NO responde automáticamente
```

---

# 66. UX del panel

Debe ser simple.

Objetivo operativo:

Un usuario interno debe poder ver rápidamente:

```text
quién está listo
qué pidió
qué modalidad indicó
qué número dejó
si ya fue contactado
```

No construir una interfaz sobrecargada.

---

# 67. Colores y badges

Usar estados visuales.

Ejemplo conceptual:

```text
WAITING_PHONE      → Falta WhatsApp
READY_FOR_WHATSAPP → Listo
CONTACT_OPENED     → WhatsApp abierto
CONTACTED_MANUALLY → Contactado
```

No depender solo de colores; mostrar texto.

---

# 68. Detalle de lead

Al abrir un lead:

Mostrar:

```text
Datos
Historial de mensajes
Canal
Origen
Clasificación
Producto
Modalidad
WhatsApp
Estado
Control
```

Acciones:

```text
Abrir WhatsApp
Marcar como contactado
Tomar control
Editar teléfono
Cerrar
```

---

# 69. Edición manual

Permitir corregir:

```text
phone
product
modality
conversation_type
```

Toda edición debe quedar registrada en `lead_events`.

---

# 70. Exportación Excel

Implementar de forma segura y eficiente.

No cargar toda la base a memoria si el volumen crece.

Para la primera versión, con volumen bajo, puede generarse en backend.

Nombre sugerido:

```text
leads_agua_renew_2026-08-24.xlsx
```

---

# 71. Square Cloud

La aplicación debe estar preparada para ejecutarse en Square Cloud.

Evitar dependencias que requieran:

- navegador gráfico;
- Chrome;
- procesos manuales;
- almacenamiento local persistente como fuente principal.

Todos los datos importantes deben quedar en Neon.

---

# 72. Neon Free

Diseñar respetando que la base puede suspender compute cuando no está activa.

Por eso:

- conexiones resilientes;
- pool adecuado;
- reintentos controlados;
- no asumir conexión eterna.

---

# 73. No utilizar Redis inicialmente

Para esta fase no es obligatorio.

No existe todavía una cola de WhatsApp automática.

Por tanto:

```text
Square Cloud
+
Neon Free
```

es suficiente.

---

# 74. Costos esperados de esta fase

Infraestructura aproximada:

```text
Square Cloud → costo fijo bajo
Neon Free    → US$0
Meta IG/FB API → sin cobro por cada mensaje de API
DeepSeek     → costo muy bajo por clasificación/extracción
WhatsApp API → US$0 en esta fase
```

El operador sigue realizando manualmente el primer envío de WhatsApp.

---

# 75. Preparación para Fase 2

Aunque no se implemente WhatsApp API todavía, preparar los datos para que en el futuro sea posible.

Campos futuros:

```text
whatsapp_handoff_type
whatsapp_api_message_id
whatsapp_status
commercial_agent_state
```

No es necesario agregarlos todos ahora si no se utilizan.

---

# 76. Integración futura con CommercialAgent

Cuando llegue la Fase 2:

```text
Lead
↓
phone
product
modality
source
↓
CommercialAgent
```

El agente debe heredar esos datos.

Nunca empezar desde cero.

---

# 77. Reglas importantes

1. No asumir que todo mensaje es un lead.
2. No clasificar mensajes automáticos de anuncios como intención humana.
3. No repetir el mensaje inicial.
4. No repetir preguntas ya contestadas.
5. No inventar producto/modalidad.
6. No responder automáticamente cuando `control_mode = HUMAN`.
7. No marcar contacto solamente porque se abrió WhatsApp.
8. No confirmar por Meta antes de confirmación humana.
9. No guardar secretos en código.
10. No usar Excel como base principal.
11. No usar automatización de navegador.
12. Usar APIs oficiales de Meta.
13. Mantener toda la lógica comercial profunda fuera de esta fase.
14. Mantener DeepSeek como apoyo semántico, no como máquina de estados.

---

# 78. Tests mínimos

Crear tests para:

## Clasificación

- lead real;
- proveedor;
- spam;
- empleo;
- ambiguo;
- negocio de marketing que sí compra.

## Captura

- solo teléfono;
- solo producto;
- solo modalidad;
- teléfono + producto;
- teléfono + modalidad;
- producto + modalidad;
- los tres datos;
- datos en mensajes separados.

## Memoria

- no perder producto anterior;
- no perder modalidad anterior;
- actualización de teléfono;
- no repetir pregunta conocida.

## Estados

- NEW → COLLECTING;
- COLLECTING → WAITING_PHONE;
- WAITING_PHONE → READY_FOR_WHATSAPP;
- READY → CONTACT_OPENED;
- CONTACT_OPENED → CONTACTED_MANUALLY.

## Idempotencia

- webhook duplicado;
- mensaje duplicado;
- confirmación Meta duplicada.

## Control humano

- AUTO responde;
- HUMAN no responde;
- PAUSED no responde.

## WhatsApp link

- teléfono normalizado;
- texto codificado;
- producto/modalidad correctos;
- no inventar datos.

## Exportación

- XLSX válido;
- filtros;
- columnas;
- Unicode;
- fechas.

---

# 79. Criterios de aceptación

La fase se considera funcional cuando:

- llegan mensajes reales/simulados desde Meta;
- cada mensaje se guarda;
- el sistema diferencia prospectos de proveedores;
- el saludo usa hora Lima;
- el mensaje inicial se manda una sola vez;
- los datos pueden llegar en cualquier orden;
- el estado se conserva;
- al obtener teléfono aparece en el panel;
- se genera correctamente el enlace de WhatsApp;
- el operador puede abrirlo;
- el sistema NO marca automáticamente como enviado;
- el operador confirma manualmente;
- después de la confirmación Meta recibe el mensaje final;
- el lead puede exportarse a Excel;
- un humano puede tomar control;
- no existen respuestas dobles por webhooks repetidos.

---

# 80. Entregables de Codex

Al completar esta fase, Codex debe entregar:

1. Código implementado.
2. Migraciones SQL.
3. Variables de entorno documentadas.
4. Tests.
5. README actualizado.
6. Instrucciones para ejecutar localmente.
7. Instrucciones para conectar Meta.
8. Instrucciones para desplegar en Square Cloud.
9. Instrucciones para crear/conectar Neon.
10. Panel funcional.
11. Exportación XLSX/CSV.
12. Evidencia de tests.
13. Lista de decisiones pendientes.
14. Lista de supuestos realizados.

---

# 81. Forma de trabajo recomendada

No implementar todo de una sola vez.

Orden recomendado:

```text
Bloque 1
DB + modelos + estados

Bloque 2
Webhook Meta + persistencia

Bloque 3
Clasificación + extracción

Bloque 4
Social Lead Intake

Bloque 5
Panel

Bloque 6
WhatsApp link + confirmación manual

Bloque 7
Exportación Excel

Bloque 8
Hardening + tests + deploy
```

Después de cada bloque:

- ejecutar tests;
- revisar cambios;
- evitar tocar módulos comerciales existentes innecesariamente;
- documentar.

---

# 82. Restricción importante respecto al proyecto comercial existente

No romper ni refactorizar el `CommercialAgent` actual sin necesidad.

Esta fase debe desarrollarse como una capa previa y desacoplada.

La interfaz futura debe permitir:

```text
LeadContext
→ CommercialAgent
```

pero todavía no ejecutar esa automatización de WhatsApp.

---

# 83. Resultado esperado para el equipo de Agua ReNew

Antes:

```text
llega mensaje
↓
persona revisa
↓
persona pregunta WhatsApp/producto/modalidad
↓
persona copia teléfono
↓
persona abre WhatsApp
↓
persona escribe mensaje
↓
persona vuelve a Meta
↓
persona confirma
```

Después de Fase 1:

```text
llega mensaje
↓
sistema clasifica
↓
sistema pregunta automáticamente
↓
sistema guarda datos
↓
lead aparece listo
↓
persona pulsa "Abrir WhatsApp"
↓
mensaje ya está escrito
↓
persona pulsa Enviar
↓
persona pulsa "Marcar como contactado"
↓
Meta confirma automáticamente
```

El objetivo es eliminar casi toda la parte repetitiva, conservando control humano donde todavía resulta conveniente.

---

# 84. Objetivo operativo final de Fase 1

El sistema debe lograr que un operador pueda revisar una cola de prospectos listos y realizar el traspaso a WhatsApp con el mínimo de acciones posibles.

La experiencia interna ideal es:

```text
1. Ve "Nuevo lead listo".
2. Revisa producto/modalidad.
3. Pulsa "Abrir WhatsApp".
4. Pulsa "Enviar" en WhatsApp.
5. Pulsa "Marcar como contactado".
```

Nada más.

---

# 85. Próxima fase futura

La Fase 2 podrá reemplazar:

```text
humano pulsa Enviar
```

por:

```text
WhatsApp Cloud API
```

y conectar posteriormente:

```text
CommercialAgent + DeepSeek
```

Pero esa automatización debe desarrollarse solamente después de validar la Fase 1 con tráfico real.

