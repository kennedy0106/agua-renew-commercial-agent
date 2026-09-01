# Arquitectura de Captación desde Meta y Traspaso a WhatsApp — Agua ReNew

## 1. Objetivo

Diseñar y automatizar la etapa previa al asesor comercial de Agua ReNew para los prospectos que llegan desde anuncios de Facebook e Instagram.

La finalidad de esta capa no es vender ni cotizar en profundidad. Su función es:

1. Detectar si la conversación corresponde realmente a un prospecto comercial.
2. Diferenciar prospectos de proveedores, agencias, spam, soporte u otros contactos.
3. Recopilar de forma incremental los datos que el prospecto entregue desde Meta.
4. Obtener principalmente su número de WhatsApp.
5. Guardar el contexto capturado en una base de datos.
6. Esperar unos minutos antes del contacto para que el seguimiento tenga una cadencia natural.
7. Contactar al prospecto por WhatsApp utilizando el contexto recogido en Meta.
8. Confirmar en Meta que la información ya fue enviada por WhatsApp.
9. Entregar posteriormente la conversación al asesor comercial basado en DeepSeek.

Esta arquitectura debe funcionar como una capa anterior al `CommercialAgent`.

---

# 2. Problema actual

Agua ReNew publica anuncios en Facebook, Instagram u otras plataformas de Meta.

Cuando una persona comenta determinada palabra o interactúa con una campaña, Meta puede generar automáticamente un mensaje de inicio de conversación. Por ejemplo:

> ¿Podrían darme más información del negocio?

Ese texto no necesariamente fue redactado manualmente por la persona. Puede ser parte del mecanismo automatizado de la campaña.

Después de esa interacción, actualmente se envía manualmente un mensaje como:

> ¡Gracias por escribir a Agua ReNew! 💧  
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

Este flujo coincide con el speech definido para redes sociales de Agua ReNew.

El problema es que los usuarios responden de formas muy distintas:

- solo con el número de WhatsApp;
- solo con el producto;
- solo con la modalidad;
- producto + modalidad;
- WhatsApp + modalidad;
- producto + WhatsApp;
- los tres datos;
- mensajes libres;
- empresas de marketing ofreciendo sus servicios;
- personas buscando trabajo;
- spam;
- soporte;
- consultas no comerciales.

Por eso no se puede asumir que todo mensaje recibido es un prospecto comercial.

---

# 3. Principio arquitectónico

El `CommercialAgent` no debe recibir directamente todo lo que llegue de Facebook o Instagram.

Antes debe existir una capa especializada:

```text
Meta Ads
   ↓
Facebook / Instagram
   ↓
Meta Webhook
   ↓
Conversation Origin Resolver
   ↓
Inbound Conversation Router
   ↓
Social Lead Intake
   ↓
PostgreSQL
   ↓
WhatsApp Handoff
   ↓
CommercialAgent
   ↓
DeepSeek
```

La responsabilidad queda dividida de esta manera:

## Capa 1 — Captación

Responsable de:

- recibir eventos de Meta;
- identificar el origen;
- clasificar el interlocutor;
- recopilar WhatsApp/producto/modalidad;
- guardar el lead;
- preparar el traspaso.

## Capa 2 — Asesor comercial

Responsable de:

- explicar servicios;
- presentar maquila o distribución;
- cotizar;
- manejar objeciones;
- recordar datos del negocio;
- continuar la venta;
- conducir progresivamente al cierre.

---

# 4. No automatizar el navegador

No se recomienda utilizar Selenium, Playwright o automatización del navegador de Meta Business Suite como arquitectura de producción.

Aunque técnicamente sea posible hacer clic automáticamente en conversaciones y enviar mensajes, tendría problemas importantes:

- sesiones de Facebook que caducan;
- cambios frecuentes en la interfaz;
- selectores que dejan de funcionar;
- autenticación de dos factores;
- pestañas cerradas;
- computadora apagada;
- ventanas emergentes;
- riesgo de respuestas duplicadas;
- interferencia entre humanos y automatización;
- mayor dificultad para controlar estados;
- menor trazabilidad;
- menor robustez.

La solución correcta es utilizar las APIs oficiales de Meta y un servidor permanentemente disponible.

---

# 5. Entorno de ejecución

## Desarrollo

Durante el desarrollo puede funcionar localmente:

```text
Laptop de desarrollo
   ↓
Node.js
   ↓
Aplicación Agua ReNew
   ↓
Webhook mediante túnel temporal
   ↓
Meta
```

Esto permite probar:

- recepción de webhooks;
- clasificación;
- respuestas;
- persistencia;
- simulación del handoff.

## Producción

En producción debe ejecutarse en un servidor siempre encendido:

```text
Meta
   ↓
Webhook
   ↓
VPS
   ↓
Aplicación Node.js
   ↓
PostgreSQL
   ↓
DeepSeek
```

El VPS es más apropiado que depender de una laptop o navegador abierto.

---

# 6. Primer problema a resolver: reconocer el tipo de conversación

No todo contacto debe entrar al flujo comercial.

Se necesita un `InboundConversationRouter` o clasificador equivalente.

Categorías iniciales sugeridas:

```text
commercial_lead
service_provider
existing_customer
support_or_complaint
employment_or_job
spam_or_irrelevant
unclear
```

## commercial_lead

Persona interesada en:

- comprar agua;
- distribuir Agua ReNew;
- trabajar con marca propia;
- solicitar precios;
- desarrollar una marca;
- contratar maquila.

## service_provider

Empresas o personas intentando venderle un servicio a Agua ReNew:

- marketing;
- publicidad;
- software;
- diseño;
- consultoría;
- proveedores externos.

Ejemplo:

> Somos una agencia y podemos manejar sus campañas publicitarias.

Debe clasificarse como:

```json
{
  "conversation_type": "service_provider"
}
```

Pero:

> Tengo una agencia de marketing y quiero botellas con nuestro logo para entregar a clientes.

Debe clasificarse como:

```json
{
  "conversation_type": "commercial_lead"
}
```

Por eso no conviene clasificar únicamente mediante palabras clave.

---

# 7. Uso de DeepSeek en el clasificador

DeepSeek puede utilizarse con temperatura 0 para clasificación estructurada.

Ejemplo conceptual:

```json
{
  "conversation_type": "commercial_lead",
  "confidence": 0.97,
  "commercial_intent": true,
  "offering_services_to_renew": false,
  "reason_code": "asks_about_private_label_water"
}
```

El clasificador debe utilizar contexto, no únicamente el último mensaje.

También debe entender que mencionar el negocio del usuario no significa que esté ofreciéndole ese negocio a Agua ReNew.

---

# 8. Confianza del clasificador

Puede trabajarse con thresholds.

Ejemplo:

```text
confidence >= 0.85
→ ruta automática

confidence 0.60–0.84
→ respuesta neutral / aclaración

confidence < 0.60
→ unclear / revisión humana
```

Los valores definitivos deberán calibrarse con conversaciones reales.

---

# 9. Origen del mensaje

Debe diferenciarse el origen de la conversación.

Ejemplos:

```text
ad_automation
comment_trigger
organic_dm
manual_contact
```

El mensaje automático generado por un anuncio no debe tratarse como evidencia suficiente de intención comercial.

Se registra que hubo interacción con una campaña, pero la clasificación real comienza con los mensajes posteriores del usuario.

---

# 10. Saludo automático según horario

El primer mensaje real de Agua ReNew puede iniciar con un saludo según la hora local de Lima.

Usar el timestamp del mensaje y la zona horaria:

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

El saludo debe utilizarse solamente al inicio de la atención, no repetirse en cada turno.

---

# 11. Mensaje inicial de redes

El mensaje inicial de captación puede mantenerse cercano al speech oficial:

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

El sistema debe registrar:

```text
initial_social_message_sent = true
```

para evitar repetir todo el bloque inicial.

---

# 12. Captura incremental

El sistema no debe exigir que el prospecto entregue todo en una sola respuesta.

Debe guardar cada dato que aparezca.

Campos principales:

```text
phone
product
modality
```

Ejemplo:

Usuario:

> 20 litros

Estado:

```json
{
  "product": "20l",
  "phone": null,
  "modality": null
}
```

Luego:

> 967309516

Estado:

```json
{
  "product": "20l",
  "phone": "967309516",
  "modality": null
}
```

No se debe perder el producto anterior.

---

# 13. No repetir información ya obtenida

El sistema debe preguntar únicamente lo necesario.

## Producto conocido, WhatsApp faltante

Usuario:

> 20 litros

Respuesta:

> Perfecto. Bríndeme su número de WhatsApp para enviarle la información, por favor.

No preguntar nuevamente el producto.

## Modalidad conocida, WhatsApp faltante

Usuario:

> Con mi propia marca

Respuesta:

> De acuerdo. Bríndeme su número de WhatsApp para enviarle la información, por favor.

## Producto + modalidad conocidos

Usuario:

> 625 ml con mi marca

Respuesta:

> De acuerdo. Bríndeme su número de WhatsApp para enviarle la información correspondiente, por favor.

---

# 14. Prioridad del WhatsApp

En esta etapa inicial, el dato prioritario es obtener el número de WhatsApp.

Aunque falte producto o modalidad, una vez obtenido el teléfono puede prepararse el handoff.

Los datos faltantes pueden completarse después por WhatsApp.

Esto evita convertir Instagram en un formulario largo.

---

# 15. Base de datos

Toda esta información debe persistirse en PostgreSQL.

No se recomienda crear otra base separada si el proyecto ya utiliza PostgreSQL.

Se necesita una entidad de prospecto o lead.

Ejemplo conceptual:

```text
lead
────────────────────────
id
phone

source_channel
source_ad_id
source_conversation_id
instagram_user_id
facebook_user_id

conversation_type

product
modality

intake_status

created_at
updated_at
```

---

# 16. Conversation type

Posibles valores:

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

# 17. Intake status

No crear un estado diferente para cada combinación de campos.

Mantener pocos estados generales:

```text
NEW
COLLECTING
WAITING_PHONE
READY_FOR_WHATSAPP
WHATSAPP_SCHEDULED
WHATSAPP_SENDING
WHATSAPP_SENT
META_CONFIRMATION_SENT
WAITING_FOR_WHATSAPP_REPLY
COMMERCIAL_AGENT_ACTIVE
WHATSAPP_SEND_FAILED
```

Los detalles faltantes se determinan a partir de los campos.

---

# 18. Guardar mensajes

También se deben conservar los mensajes de la conversación.

Conceptualmente:

```text
lead_messages
────────────────────────
id
lead_id
channel
direction
sender_type
content
external_message_id
created_at
```

Esto sirve para:

- reconstruir contexto;
- auditoría;
- debugging;
- evitar duplicados;
- estadísticas;
- trazabilidad.

---

# 19. Handoff entre Meta y WhatsApp

Cuando se recibe un número válido:

```text
conversation_type = commercial_lead
AND phone válido
AND status != whatsapp_contacted
```

el lead se vuelve candidato al handoff.

Estado:

```text
READY_FOR_WHATSAPP
```

---

# 20. Espera antes del WhatsApp

No enviar el WhatsApp instantáneamente.

Se desea que la transición tenga una cadencia natural.

Ventana sugerida:

```text
2–5 minutos
```

No siempre el mismo tiempo exacto.

Después:

```text
READY_FOR_WHATSAPP
↓
WHATSAPP_SCHEDULED
↓
espera
↓
WHATSAPP_SENDING
```

El tiempo exacto puede seleccionarse dentro de una ventana configurada.

---

# 21. Importante sobre la espera

La espera no debe implementarse con:

```javascript
setTimeout(...)
```

si se necesita fiabilidad de producción.

Debe existir una cola o scheduler persistente para que:

- reiniciar el servidor no pierda el envío;
- no se dupliquen mensajes;
- puedan reintentarse fallos;
- pueda auditarse el estado.

---

# 22. Primer mensaje de WhatsApp

Debe aprovechar el contexto recibido en Meta.

## Si conocemos modalidad

Ejemplo:

- modalidad = maquila
- producto desconocido

Mensaje:

> Buenas tardes. Gracias por comunicarse con Agua ReNew a través de Instagram. Nos indicó que está interesado en trabajar con su propia marca. Por este medio podemos continuar brindándole la información sobre nuestro servicio de maquila.

Después el `CommercialAgent` continúa.

## Si conocemos producto y modalidad

Ejemplo:

```text
product = 625ml
modality = maquila
```

Mensaje:

> Buenas tardes. Gracias por comunicarse con Agua ReNew a través de Instagram. Nos indicó que está interesado en botellas de 625 ml con su propia marca. Por este medio podemos continuar con la información y cotización.

## Si solo conocemos producto

Ejemplo:

```text
product = 20l
modality = null
```

El mensaje puede reconocer el producto y el agente deberá aclarar posteriormente la modalidad.

Nunca inventar datos faltantes.

---

# 23. No repetir preguntas en WhatsApp

Cuando el `CommercialAgent` se active, debe recibir el contexto de Meta.

Ejemplo:

```json
{
  "source": "instagram",
  "product": "625ml",
  "modality": "maquila",
  "phone": "..."
}
```

Por tanto:

Instagram:

> 625 ml  
> Marca propia

WhatsApp NO debe volver a preguntar:

> ¿Qué presentación desea?  
> ¿Maquila o distribución?

La continuidad entre canales debe sentirse real.

---

# 24. Identificación del mismo lead

La principal llave de correlación para el handoff será el teléfono.

Al iniciar WhatsApp:

```text
phone entrante
↓
buscar lead
↓
recuperar contexto
↓
inicializar CommercialAgent
```

También deben conservarse IDs internos y externos para evitar confusiones.

---

# 25. Confirmación posterior en Meta

Una vez que el primer WhatsApp fue enviado exitosamente:

```text
WHATSAPP_SENT
```

se envía una confirmación en Meta.

No hacerlo antes de confirmar que el WhatsApp realmente salió.

Mensaje sugerido:

> Ya le enviamos la información por WhatsApp. Podemos continuar la atención por ese medio.

También puede utilizarse:

> Le hemos enviado la información por WhatsApp. Puede continuar la atención por ese medio.

No utilizar una frase excesivamente técnica como:

> Se envió información por WhatsApp.

La respuesta debe sonar natural.

---

# 26. Tiempo entre WhatsApp y confirmación Meta

Después de confirmar el envío del WhatsApp puede esperarse unos segundos antes del mensaje de Meta.

Ventana sugerida:

```text
10–30 segundos
```

Flujo:

```text
WhatsApp enviado
↓
confirmación técnica
↓
esperar 10–30 segundos
↓
mensaje de Meta
```

---

# 27. Error de envío

Si el envío por WhatsApp falla:

```text
WHATSAPP_SEND_FAILED
```

NO enviar en Meta:

> Ya le enviamos la información.

Se debe:

- registrar error;
- intentar reenvío según política;
- permitir intervención humana;
- no mentir al prospecto.

---

# 28. Si el usuario vuelve a escribir por Meta

Una vez enviado el WhatsApp, la conversación de Meta no desaparece.

Se necesita comportamiento contextual.

## Usuario:

> No me llegó.

El sistema debe saber que:

```text
handoff_status = whatsapp_sent
```

y responder con una acción de verificación, no volver al mensaje inicial.

## Usuario:

> Mi número correcto es 999999999.

Debe:

1. actualizar teléfono;
2. invalidar o registrar el teléfono anterior;
3. reprogramar/reintentar WhatsApp;
4. no repetir todo el intake.

## Usuario:

> Mejor hablemos por aquí.

Debe permitir continuar por Meta.

No obligar a usar WhatsApp.

---

# 29. Automatización y humano

Desde el inicio debe existir control de conversación.

Estados sugeridos:

```text
AUTO
HUMAN
PAUSED
```

## AUTO

Automatización controla la conversación.

## HUMAN

Un miembro de Agua ReNew tomó el control.

El bot no debe responder automáticamente mientras el humano esté escribiendo.

## PAUSED

Automatización temporalmente suspendida.

Esto evita que el bot interfiera con Kennedy u otro asesor.

---

# 30. Registro de quién respondió

Internamente debe guardarse:

```json
{
  "actor_type": "automation",
  "actor": "social_lead_intake"
}
```

o:

```json
{
  "actor_type": "human",
  "actor": "kennedy"
}
```

Esto permitirá:

- auditoría;
- métricas;
- saber cuándo intervino un humano;
- evitar respuestas simultáneas.

---

# 31. Apariencia en Meta Business Suite

No se debe intentar falsificar mediante navegador que una respuesta automatizada fue escrita manualmente por una persona específica.

Las respuestas deben enviarse mediante la integración oficial de Meta.

Meta Business Suite puede mostrar información propia sobre el origen o actor de los mensajes según las capacidades de la plataforma.

La aplicación debe controlar internamente quién respondió, pero no construir la arquitectura alrededor de “parecer que Kennedy hizo clic”.

---

# 32. DeepSeek no debe controlar todo este flujo

La mayoría de esta etapa debe ser determinística.

DeepSeek se utiliza para:

- clasificación semántica;
- interpretar mensajes libres;
- identificar producto/modalidad implícitos;
- diferenciar proveedor vs prospecto;
- entender respuestas ambiguas.

El código controla:

- estados;
- persistencia;
- validación de teléfono;
- qué dato falta;
- cuándo se agenda WhatsApp;
- reintentos;
- confirmación Meta;
- handoff al agente comercial.

---

# 33. Ejemplo completo A

Usuario activa anuncio.

Meta inicia conversación.

Sistema:

> Buenas tardes. Gracias por escribir a Agua ReNew 💧  
> Para cotizarle, por favor indíquenos su número de WhatsApp, producto y cómo desea comercializarlo.

Usuario:

> 20 litros

BD:

```text
product = 20l
phone = null
modality = null
```

Sistema:

> Perfecto. Bríndeme su número de WhatsApp para enviarle la información, por favor.

Usuario:

> 967309516

BD:

```text
product = 20l
phone = 967309516
modality = null
status = READY_FOR_WHATSAPP
```

Esperar 2–5 minutos.

WhatsApp:

> Buenas tardes. Gracias por comunicarse con Agua ReNew a través de Instagram. Nos indicó que está interesado en bidones de 20 L. Por este medio podemos continuar brindándole la información.

Después entra el asesor comercial para aclarar modalidad.

Confirmado el envío:

Meta:

> Ya le enviamos la información por WhatsApp. Podemos continuar la atención por ese medio.

---

# 34. Ejemplo completo B

Usuario:

> 955623069  
> Marca propia

BD:

```text
phone = 955623069
modality = maquila
product = null
status = READY_FOR_WHATSAPP
```

Esperar 2–5 minutos.

WhatsApp:

> Buenos días. Gracias por comunicarse con Agua ReNew a través de Instagram. Nos indicó que está interesado en trabajar con su propia marca. Por este medio podemos continuar brindándole la información sobre nuestro servicio de maquila.

CommercialAgent:

- ya sabe `modality = maquila`;
- no vuelve a preguntar modalidad;
- pregunta presentación cuando corresponda.

Meta:

> Ya le enviamos la información por WhatsApp. Podemos continuar la atención por ese medio.

---

# 35. Ejemplo completo C — proveedor

Usuario:

> Hola, somos una agencia de marketing y podemos manejar sus redes sociales.

Clasificador:

```json
{
  "conversation_type": "service_provider",
  "confidence": 0.99
}
```

No entra a `SocialLeadIntake`.

No pedir:

- producto;
- WhatsApp para cotización;
- modalidad.

Puede utilizarse un flujo separado o revisión humana.

---

# 36. Ejemplo completo D — negocio de marketing que sí compra

Usuario:

> Tengo una agencia de marketing y quiero botellas con nuestro logo para entregar a clientes.

Clasificador:

```json
{
  "conversation_type": "commercial_lead",
  "commercial_intent": true,
  "offering_services_to_renew": false
}
```

Extracción:

```text
business_type = agencia_marketing
modality = maquila
```

Luego continúa el intake normalmente.

---

# 37. Presupuesto y WhatsApp

La arquitectura cambia el presupuesto respecto a un bot que únicamente responde conversaciones iniciadas dentro de WhatsApp.

El motivo es que en este flujo Agua ReNew obtiene el número en Instagram/Facebook y posteriormente inicia el contacto por WhatsApp.

Por ello, la integración debe diseñarse considerando las políticas y tarifas vigentes de WhatsApp Business Platform para conversaciones iniciadas por la empresa.

Los costos deben mantenerse configurables y no hardcodearse en el código.

La parte de costos y plantillas debe revisarse nuevamente al implementar la integración oficial de WhatsApp, porque puede cambiar con las políticas de Meta.

---

# 38. No usar enlace como flujo principal

Se evaluó la posibilidad de enviar un enlace para que el prospecto abra WhatsApp.

No se utilizará como flujo principal.

Motivos:

- desconfianza frente a enlaces;
- riesgo percibido de phishing;
- fricción adicional;
- obliga al prospecto a cambiar de aplicación y realizar otra acción;
- mayor posibilidad de perder el lead.

Se mantiene como enfoque principal:

```text
prospecto entrega número
↓
Agua ReNew realiza seguimiento
```

---

# 39. Cola de salida

Debe existir una cola o scheduler para los contactos por WhatsApp.

Ejemplo conceptual:

```text
outbound_jobs
────────────────────────
id
lead_id
channel
scheduled_at
status
attempt_count
last_error
sent_at
created_at
```

Estados:

```text
pending
processing
sent
failed
cancelled
```

Esto permite:

- esperar 2–5 minutos;
- reintentar;
- sobrevivir a reinicios;
- evitar duplicados.

---

# 40. Idempotencia

Los webhooks de Meta pueden repetirse.

El sistema debe almacenar:

```text
external_message_id
```

y evitar procesar dos veces el mismo evento.

También se debe impedir que dos workers envíen dos WhatsApp al mismo lead.

---

# 41. Flujo general definitivo de esta fase

```text
META ADS
   ↓
INTERACCIÓN / COMMENT TRIGGER
   ↓
META DM
   ↓
Webhook
   ↓
Origin Resolver
   ↓
Inbound Conversation Router
   ↓
¿PROSPECTO?
   ├─ NO
   │    ├─ service_provider
   │    ├─ support
   │    ├─ spam
   │    └─ revisión
   │
   └─ SÍ
        ↓
   Social Lead Intake
        ↓
   saludo según hora
        ↓
   captura incremental
        ↓
   phone / product / modality
        ↓
   PostgreSQL
        ↓
   ¿hay WhatsApp?
      ├─ NO
      │   ↓
      │ pedir WhatsApp
      │
      └─ SÍ
          ↓
     READY_FOR_WHATSAPP
          ↓
       Scheduler
          ↓
      esperar 2–5 min
          ↓
      WhatsApp outbound
          ↓
     ¿envío exitoso?
       ├─ NO
       │   ↓
       │ FAILED / retry / humano
       │
       └─ SÍ
           ↓
      WHATSAPP_SENT
           ↓
      esperar 10–30 s
           ↓
      confirmación en Meta
           ↓
      WAITING_FOR_REPLY
           ↓
      cliente responde
           ↓
      CommercialAgent
           ↓
         DeepSeek
```

---

# 42. Componentes sugeridos

```text
src/
  meta/
    meta-webhook-handler
    conversation-origin-resolver
    inbound-conversation-router
    social-lead-intake
    meta-message-sender

  leads/
    lead-service
    lead-repository
    lead-state-machine

  whatsapp/
    whatsapp-handoff-service
    whatsapp-message-sender
    whatsapp-webhook-handler

  queue/
    outbound-job-worker

  ai/
    commercial-agent
    ...
```

Los nombres son conceptuales. Deben adaptarse a la arquitectura existente antes de implementarse.

---

# 43. Datos mínimos del lead

```text
id
conversation_type
source_channel
source_conversation_id
source_ad_id

phone
product
modality

intake_status
control_mode

whatsapp_scheduled_at
whatsapp_sent_at
meta_confirmation_sent_at

created_at
updated_at
```

---

# 44. Datos futuros que pueden añadirse

Cuando se una con el asesor comercial:

```text
businessType
customerGoal
useCase
brandName
hasLogo
hasOwnContainers
purchaseType
quantity
district
deliveryPreference
salesStage
purchaseReadiness
currentObjection
```

No es necesario que el Social Lead Intake los obtenga todos.

Solo debe conservar cualquier dato que el prospecto espontáneamente proporcione.

---

# 45. Principio de UX

El prospecto no debe percibir:

- un formulario repetitivo;
- que nadie recuerda sus respuestas;
- que Meta y WhatsApp son dos equipos desconectados;
- respuestas técnicas;
- procesos internos.

Debe percibir:

```text
"Escribí por Instagram,
dejé mi número,
me contactaron por WhatsApp,
y ya sabían lo que estaba buscando."
```

Ese es el objetivo principal de esta arquitectura.

---

# 46. Alcance recomendado para la primera implementación

La primera versión debe centrarse únicamente en:

1. webhook de Meta;
2. identificación del origen;
3. clasificación lead / no lead;
4. saludo inicial;
5. captura incremental de:
   - WhatsApp;
   - producto;
   - modalidad;
6. persistencia PostgreSQL;
7. estados del lead;
8. scheduler de handoff;
9. simulación o integración controlada de envío WhatsApp;
10. confirmación posterior en Meta;
11. handoff de contexto al `CommercialAgent`.

No añadir todavía:

- CRM completo;
- dashboard avanzado;
- campañas;
- marketing automation complejo;
- scoring de leads;
- múltiples agentes especializados;
- automatización masiva;
- analítica avanzada.

Primero hacer este flujo extremadamente confiable.

---

# 47. Criterios de éxito

La primera fase estará correctamente implementada cuando:

- un proveedor de marketing no entre al flujo de cotización;
- un interesado real sí sea reconocido;
- el saludo corresponda a la hora de Lima;
- el mensaje inicial solo se envíe una vez;
- producto/modalidad/teléfono puedan llegar en cualquier orden;
- nunca se vuelva a preguntar un dato ya recibido;
- el teléfono quede persistido;
- el contexto sobreviva entre Meta y WhatsApp;
- el WhatsApp se programe 2–5 minutos después;
- Meta solo confirme después de un envío exitoso;
- un error de WhatsApp no genere una confirmación falsa;
- el `CommercialAgent` no repita producto/modalidad ya conocidos;
- un humano pueda tomar el control;
- no se dupliquen mensajes ante webhooks repetidos.

---

# 48. Decisiones ya tomadas

- Se utilizará API oficial de Meta, no automatización del navegador.
- Desarrollo inicialmente local.
- Producción posteriormente en VPS.
- PostgreSQL como almacenamiento persistente.
- Se crea una capa previa al `CommercialAgent`.
- No todo mensaje recibido se considera prospecto.
- DeepSeek se usa para clasificación e interpretación semántica.
- Estados y workflow se controlan en código.
- El WhatsApp es el objetivo principal de captación.
- Agua ReNew realizará el seguimiento al número proporcionado.
- No se utilizará un enlace de WhatsApp como flujo principal.
- El contacto por WhatsApp no será instantáneo.
- Ventana inicial sugerida de 2–5 minutos.
- Después de enviar WhatsApp correctamente, se confirmará en Meta.
- Ventana sugerida de 10–30 segundos para esa confirmación.
- Si el envío de WhatsApp falla, no se dirá que fue enviado.
- El contexto de Meta debe llegar al asesor comercial.
- El bot debe poder ceder control a una persona.
- Por ahora el modelo comercial seguirá siendo DeepSeek.

---

# 49. Próximo paso

Antes de implementar directamente la integración real con Meta y WhatsApp, conviene convertir esta arquitectura en un bloque técnico de desarrollo con:

- esquema SQL;
- contratos de eventos;
- estados;
- servicios;
- interfaces;
- mocks de Meta;
- tests;
- simulación local de handoff;
- criterios de idempotencia;
- estrategia de reintentos.

Posteriormente se integrarán las credenciales y APIs reales.

