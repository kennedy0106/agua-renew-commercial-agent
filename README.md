# Automatización comercial Agua ReNew

Sistema de captación de leads para Agua ReNew. El runtime productivo observa las conversaciones atendidas por Meta Business Agent, procesa datos de forma determinística y prepara el handoff humano a WhatsApp.

```text
UI local → ConversationEngine → Repository → PostgreSQL
                         └→ CommercialService → knowledge/agua_renew_commercial_data.json
```

El simulador comercial anterior se conserva como componente legacy. `CommercialService` sigue siendo la autoridad determinística sobre precios, escalas, mínimos y reglas comerciales; DeepSeek no forma parte del runtime Meta.

## Requisitos

- Node.js ≥ 18.17
- pnpm (gestor de paquetes; hay `pnpm-lock.yaml`)
- Docker Desktop (para PostgreSQL local)

## Instalación

```bash
git clone <repo>
cd <carpeta-del-repo>
pnpm install
```

## Configurar entorno

1. Copie el ejemplo:

```bash
cp .env.example .env
```

2. Edite `.env` con Neon, las credenciales Meta de lectura/webhook y la clave del panel. La configuración opcional del simulador legacy está separada en `.env.legacy.example`.

`.env` está excluido de Git: nunca lo versionee.

## Levantar PostgreSQL local (Docker)

```bash
docker compose up -d
```

Crea el contenedor `agua-renew-postgres` (PostgreSQL 16) con la base `agua_renew`. El volumen de datos vive dentro de Docker, no en el repositorio.

La aplicación se conecta con `DATABASE_URL`. En Neon use una URL pooled (`-pooler`) para el tráfico normal y configure `DATABASE_URL_UNPOOLED` con la URL directa para migraciones. Para desarrollo local ambas pueden apuntar al mismo PostgreSQL de Docker.

## Aplicar migraciones

```bash
pnpm migrate
```

Las migraciones están en `database/migrations/` (actualmente `001_…` a `023_…`) y son idempotentes. En producción el servidor exige `023_analysis_lease_and_coverage.sql`, pero no ejecuta migraciones automáticamente.

## CRM comercial

El CRM vive en `http://localhost:4000/crm` y convive con el panel histórico `/admin`. Antes del primer arranque configure `CRM_BOOTSTRAP_EMAIL` y una `CRM_BOOTSTRAP_PASSWORD` de al menos 12 caracteres.

```bash
pnpm migrate
pnpm build:crm
pnpm start:meta
```

`/crm` es el espacio de trabajo autenticado del equipo (pipeline, responsables, tareas, notas, cotizaciones, reportes y auditoría). `/admin` es el panel histórico compatible para observar y corregir leads. Los registros históricos quedan referenciados desde contactos y oportunidades; las tablas `leads` y `lead_messages` no se reemplazan.

## Iniciar el simulador

```bash
pnpm start:simulator
```

Abrir `http://localhost:3000`.

## Pruebas

```bash
pnpm test
```

Para incluir la prueba de integración real use exclusivamente `TEST_DATABASE_URL`. En Neon debe apuntar a una rama aislada y directa; la suite se niega a usar `DATABASE_URL` de la aplicación:

```bash
# PowerShell
$env:TEST_DATABASE_URL='postgres://...'; pnpm test:postgres
# bash / Linux
TEST_DATABASE_URL='postgres://...' pnpm test:postgres
```

La prueba legacy real de DeepSeek está desactivada por defecto y no pertenece al flujo productivo:

```bash
# PowerShell
$env:RUN_DEEPSEEK_TESTS='1'; node --test test/deepseek.integration.test.mjs
# bash / Linux
RUN_DEEPSEEK_TESTS=1 pnpm test:legacy:deepseek
```

## Capas

- `apps/simulator/`: servidor local y UI.
- `src/conversation/`: máquina de estados persistente; no contiene precios ni SQL.
- `src/commercial/`: consultas y bloqueos comerciales.
- `src/ai/`: proveedor DeepSeek, intérprete validado, compositor seguro.
- `src/repository/`: interfaz de persistencia y adaptadores de PostgreSQL/memoria.
- `database/migrations/`: migraciones SQL reproducibles.
- `knowledge/`: fuente estructurada de datos comerciales (autoridad del runtime).

Si `CommercialService` devuelve una condición bloqueada o requiere cotización, `ConversationEngine` persiste el handoff y muestra la derivación a un asesor. La UI solo presenta eventos, estados y datos recibidos.

---

# Nueva arquitectura: captación Meta → leads → handoff WhatsApp (Fase 1)

Capa independiente del `CommercialAgent`: observa Messenger/Instagram, reconstruye la conversación, extrae **WhatsApp / producto / modalidad**, persiste el lead y deja el traspaso manual a WhatsApp listo. Nunca responde desde nuestra aplicación.

```text
Meta Business Agent → Webhook/Graph GET → ConversationObserver
  → LeadProcessor determinístico → Neon PostgreSQL
  → Panel /admin → "Abrir WhatsApp" → humano envía → "Marcar como contactado"
```

## Componentes nuevos

| Módulo | Rol |
|---|---|
| `apps/meta-server/` | Servidor: webhook `/webhook/meta`, API `/api/leads`, panel `/admin` |
| `src/meta/meta-webhook-handler.mjs` | Handshake, firma HMAC (`X-Hub-Signature-256`), normalización, idempotencia |
| `src/meta/conversation-origin-resolver.mjs` | Origen del mensaje (ad_automation / organic_dm / comment_trigger) |
| `src/meta/conversation-observer.mjs` | Persistencia idempotente de mensajes observados |
| `src/meta/lead-processor.mjs` | Extracción acumulativa y estados, sin proveedor IA |
| `src/leads/observer-lead-service.mjs` | Acciones humanas del dashboard, sin escritura en Meta |
| `src/leads/lead-repository.mjs` (+ in-memory/postgres) | Persistencia de leads, mensajes, eventos e historial de teléfonos |
| `src/leads/phone-normalizer.mjs` | Normalización E.164 de móviles peruanos |
| `src/leads/whatsapp-link.mjs` | Enlace `wa.me` con mensaje precargado según contexto |
| `src/leads/product-catalog-map.mjs` | `{product, modality}` → `productId` del dominio comercial |
| `src/admin/leads-api.mjs` + `lead-export.mjs` | API del panel + exportación CSV/XLSX (sin dependencias) |
| `scripts/mock-meta.mjs` | Simulador de webhook para desarrollo |

## Levantar el servidor de captación

```bash
pnpm start:meta          # → http://localhost:4000
pnpm mock:meta "Quiero 20 litros con mi marca, mi número es 955623069"
```

En desarrollo, sin `DATABASE_URL` se usa memoria con una advertencia explícita. En producción `DATABASE_URL`, `META_APP_SECRET`, un `META_VERIFY_TOKEN` no predeterminado y `ADMIN_API_TOKEN` (mínimo 32 caracteres) son obligatorios; una base ausente/inaccesible detiene el proceso antes de escuchar. `META_PAGE_ACCESS_TOKEN` se usa solo para consultas GET de Messenger e Instagram.

El análisis es determinístico por defecto. La IA solo se habilita con todas las variables `AI_*`; en producción `AI_BASE_URL` debe pertenecer a `AI_ALLOWED_BASE_URLS`. El observador ignora por completo `DEEPSEEK_*`, reservadas al simulador legacy. Mensaje y cobertura se guardan en una transacción; cada mensaje posee `analysis_version`. El worker reclama un solo trabajo con token de lease, calcula fuera de transacción y solo aplica si token y versión siguen vigentes.

El worker despierta inmediatamente al arrancar o recibir/importar mensajes, revisa cada 5 segundos mientras encuentra trabajo y pasa a una revisión de seguridad cada 5 minutos sin actividad (`ANALYSIS_WORKER_ACTIVE_MS`/`ANALYSIS_WORKER_IDLE_MS`). Las automatizaciones CRM se revisan cada 5 minutos y la sincronización Meta conserva su intervalo configurable. Por ello, con sincronización Meta habilitada siguen existiendo consultas periódicas; no se garantiza suspensión de la base. Tras un reinicio la demora máxima normal de recuperación es el arranque del proceso; sin eventos, el control de seguridad puede tardar hasta el intervalo idle.

Para analizar historiales importados sin enviar respuestas:

```bash
pnpm backfill:leads        # genera .backfill/historical-leads-plan.json
pnpm backfill:leads:apply  # aplica exactamente el plan revisado
```

- Handshake webhook: `GET /webhook/meta?hub.mode=subscribe&hub.verify_token=…&hub.challenge=…`
- Panel interno: `http://localhost:4000/admin` (lista, filtros, chat read-only, correcciones, abrir WhatsApp, marcar contactado y exportar)
- Exportación: `GET /api/leads/export.csv` y `GET /api/leads/export.xlsx`

## Decisiones de diseño (cierran huecos detectados en los documentos)

- **Observer estricto**: el runtime no instancia sender, outbox ni proveedor IA; los endpoints salientes responden `META_OBSERVER_READ_ONLY`.
- **Catálogo alineado al dominio comercial**: productos `20l | 1l | 625ml | 10_5l`; modalidades `maquila | distribution_agua_renew | final_customer`; mapeo a `productId` en `product-catalog-map.mjs`.
- **Estados y dimensiones**: datos completos producen `READY_FOR_WHATSAPP`; no implican `READY_TO_BUY`. `CONTACT_OPENED` solo registra que se abrió el enlace. `HANDED_OFF` significa que se preparó/derivó el handoff, no que WhatsApp entregó un mensaje. Solo una confirmación humana explícita registra `CONTACTED_MANUALLY`, con actor/fecha y operación idempotente.
- **Idempotencia**: `external_message_id` único en `lead_messages` + mutex por conversación.
- **No-leads**: proveedores, spam, soporte y empleo se registran y cierran sin responder.

## Despliegue Square Cloud

El archivo `squarecloud.app` inicia `npm run start:meta` con 2 GB y reinicio automático. Configure `PORT=80`, `HOST=0.0.0.0`, `DATABASE_URL`, credenciales Meta y `ADMIN_API_TOKEN` en Square Cloud. Ejecute `npm run migrate` con `DATABASE_URL_UNPOOLED` antes de publicar; el servidor nunca migra durante el arranque.
- **Fase 2** (WhatsApp Cloud API automática) queda preparada: los datos del lead (teléfono/producto/modalidad/origen) y el mapeo a `productId` ya existen para inicializar el `CommercialAgent` sin empezar de cero.

## Pruebas

```bash
pnpm test                 # suite completa (incluye la nueva capa)
TEST_DATABASE_URL='postgres://...' pnpm test:postgres
```

## Fuente documental vs. reglas vigentes

El conocimiento comercial se divide en dos capas con precedencia explícita:

- `knowledge/agua_renew_commercial_data.json` — **documentación fuente normalizada** (Speech maquila y Precios Agua ReNew). No representa decisiones operativas posteriores.
- `knowledge/commercial_overrides.json` — **reglas comerciales vigentes**: decisiones actuales de la empresa. Precedencia: **REGLAS VIGENTES > DOCUMENTO NORMALIZADO**.

Ejemplo: el documento fuente menciona una posible excepción de maquila de bidones 20 L desde 30 unidades; la regla vigente (`maquila_bidon_20l.public_minimum = 50`, `allow_30_unit_exception = false`) establece que el mínimo público es **50 unidades** y la excepción no se ofrece. El dato histórico permanece en la fuente; la regla vigente controla la oferta pública.

## Hechos que controla el sistema (nunca el LLM)

El modelo interpreta al usuario, selecciona herramientas y redacta lenguaje; **jamás decide** precios, mínimos, contenido de paquete, escalas, inclusiones/exclusiones, etiqueta, forma de pago, condiciones de recojo/delivery ni excepciones comerciales. Esos hechos provienen de:

- `CommercialService` (autoridad comercial, con overrides aplicados);
- `get_quote` (devuelve precio, total, mínimo, paquete, inclusiones, exclusiones, `label_included` y `purchase_type`);
- la composición determinística (`composeCommercialFacts`) que adjunta los hechos a la respuesta del agente.

Un pedido bajo el mínimo se responde como situación comercial (`below_minimum`): se explica el mínimo vigente y se invita a ajustar la cantidad, sin derivar por defecto ni inventar precios.

## Memoria comercial, etapa y siguiente mejor acción

La capa `src/ai/sales-context.mjs` decide de forma determinística la etapa comercial y el siguiente paso, sin depender del LLM:

- `SALES_STAGES`: `discovery`, `solution_presentation`, `qualification`, `quotation`, `objection_handling`, `purchase_preparation`, `handoff`.
- `getNextBestAction(state)`: sugiere la siguiente acción comercial (preguntar modalidad/presentación/cantidad/logo, estado de envases, resolver objeción, cotizar, preparar compra, retomar tema pendiente, responder la pregunta actual). Es una guía, no una máquina de estados inflexible: una pregunta directa o un cambio de tema del prospecto se responde primero.
- `applyToolMemoryToState(state, tools)`: aplica de forma pura la memoria de las herramientas del turno (solo valores validados), persiste `purchaseType`/`fulfillment`, aplica los mecanismos explícitos de limpieza y la coherencia envase/tipo de compra.
- `suggestSalesStage(state, action)`: traduce la acción en etapa sugerida; nunca regresa la etapa a un estado anterior.

Al final de cada turno el agente recalcula de forma determinística la etapa y la siguiente mejor acción sobre el estado final del turno (no sobre el estado previo), y el engine persiste ese contexto (`state.salesStage`, `state.nextBestAction`).

La memoria del prospecto (`update_conversation_memory`) distingue `hasBrand` (tiene nombre de marca) de `hasLogo` (tiene logo definido), y guarda `useCase`, `hasOwnContainers`, `labelRequirements`, `paymentStatus`, `currentObjection`, `salesStage` y `pendingTopic`. Reglas: solo guarda información explícita (no infiere logo por marca, ni delivery por ubicación), no sobreescribe un valor confirmado con null por falta de mención, y no repite preguntas sobre datos ya confirmados. Para resolver un tema de forma explícita se usan `clearCurrentObjection`/`clearPendingTopic` (omitir el campo conserva el valor; una cotización entregada resuelve la objeción salvo re-afirmación explícita). La coherencia `hasOwnContainers` ↔ `purchaseType` nunca persiste estados contradictorios.

El agente no cierra prematuramente: una objeción activa (`currentObjection`) tiene prioridad sobre cualquier cierre, y `prepare_purchase` solo ocurre con señales suficientes (cotización entregada, sin objeción, sin tema pendiente, readiness `qualified`/`ready_for_handoff` y datos completos) — una cotización por sí sola no es intención de compra. La forma de pago general de maquila no está documentada (se confirma con asesor).

## Voz conversacional y canal (Bloque C)

- **Perfiles de generación** (`GENERATION_PROFILES` en el agente; `complete()` del provider acepta `temperature`/`maxTokens` por llamada con defaults retrocompatibles): decisión/herramientas a `temperature 0` (maxTokens 1200) y redacción final a `0.3` (maxTokens 400). La temperatura nunca gobierna hechos comerciales: precios, totales, mínimos y condiciones se componen determinísticamente. **Toda respuesta customer-facing se redacta en el perfil `final_response`**: si la llamada de decisión no produce herramienta, el borrador se reenvía a una llamada de redacción final (nunca se entrega el texto de decisión directo; si la redacción fallara, se registra `decisionTextFallbackUsed` para auditoría).
- **Transición de cotización solo discursiva:** la transición previa a los facts solo se acepta si no contiene montos ni afirmaciones comerciales no verificables (stock, disponibilidad, tiempos de entrega, rentabilidad, popularidad, condiciones, resúmenes de mínimo/inclusión) — guard por categorías (`isUnsafeCommercialClaim`), sin regex masivos; si hay duda se descarta y se abre con `De acuerdo. [facts]`. La pregunta de cierre generada también se filtra: si introduce una condición no grounded, se reemplaza por `¿Desea revisar otra cantidad?` (cotización) o `¿Hay algo más que le gustaría revisar?` (sin cotización).
- **Registro:** tratamiento comercial predeterminado **“usted”** (habla desde Agua ReNew como “nosotros”, cercano y no burocrático); `CommercialAdvisorVoice` y las plantillas determinísticas del engine quedaron en “usted”.
- **Conversación continua:** `conversationHasStarted` se deriva del historial; en turnos posteriores no se repiten saludos ni la presentación de Agua ReNew.
- **Perfil de la plataforma:** el nombre visible nunca se usa automáticamente (solo si la persona se presenta o está confirmado en memoria).
- **Emojis moderados** (1–2 en el primer mensaje si ayudan; 0 en seguimientos) y **brevedad** (respuesta normal de 40–90 palabras, con diagnostics `wordCount`/`responseDetailLevel`).
- **Canal:** el agente recibe `channel` (local/instagram/messenger/whatsapp); en Instagram/Messenger continúa en el mismo canal sin pedir WhatsApp.
- **Métricas:** `channel`, `generation_profile`, `temperature_used` y `max_tokens_used` en diagnostics (sin contenido de razonamiento).

## Evaluación (Bloque D)

Suite separada de benchmark reproducible en `eval/` (no mezclada con los tests unitarios):

- **Dataset versionado** `eval/datasets/scenarios.v1.json` — 81 escenarios en 15 categorías (primer contacto, descubrimiento, maquila, distribución, cotización, objeciones, memoria, cambios de tema, pago, delivery, marca/logo, restringido, cierre/handoff, multi-turno, naturalidad/canal), incluyendo los 40 mínimos obligatorios, variantes de formulación, escenarios adversariales, memoria contradictoria, interrupciones, bajo mínimo y checks determinísticos de cotización.
- **Graders determinísticos versionados** (`eval/lib/graders.mjs`, `EVAL_GRADER_VERSION = 3`): 19 métricas (precio, mínimo, políticas, **grounded_claim_accuracy**, **product_resolution_accuracy**, **protocol_leak_safety**, memoria, no repetición, herramientas, siguiente paso, no cierre prematuro, información restringida, canal, tono, brevedad, naturalidad, orientación comercial, objeciones) con escala 0/1/2 y umbrales por métrica. Las blandas usan proxies determinísticos (LLM juez queda reservado con `--judge`).
- **Calibración v2** (mismos transcripts, sin nueva llamada API): la palabra "margen" sola ya no es fuga restringida (se mide como claim no grounded cuando se afirma su dinámica); `grounded_claim_accuracy` detecta afirmaciones comerciales no autorizadas por categorías (stock/tiempos/pago/promoción/garantía = critical; rentabilidad/popularidad = fail severo), con `forbiddenGroundedClaims`/`allowedClaims` por escenario; `product_resolution_accuracy` valida modality/productId/purchaseType contra `expectedModality`/`expectedProductId`/`expectedPurchaseType` (un precio válido del producto equivocado falla y es critical); `protocol_leak_safety` detecta herramientas, parámetros y razonamiento interno en inglés (100% para aprobar); `naturalness` penaliza respuestas truncadas y presentación repetida; costo por 1000 conversaciones corregido (unitario × 1000).
- **Calibración v3** (fixture calibration, mismo run `mt37tide`): E009/E010 ya no imponen modalidad maquila sobre input aislado ambiguo — se marcan con `requiresModalityClarification` (aprueba si el agente pide clarificar; falla sin critical si cotiza directo); `sales_orientation` quedó **desacoplada de tool_selection** — los `expectedCommercialMove` se evalúan por contenido/next action (salvo `provide_quote`, que exige get_quote o facts, y `request_handoff`); se auditaron los 43 moves y se corrigieron 9: B004/B005/D001 `explain_modality`→`ask_product` (modalidad ya conocida), C001/C002 `ask_product`→`ask_quantity` (presentación conocida), F001/F002 `handle_objection`→`answer_current_question` (sin contexto previo).
- **Métricas duras priorizadas y críticas**: precio/mínimo/políticas/restringido/memoria son `critical` — cualquier fallo marca la corrida CRITICAL_FAIL.
- **Runner multi-modelo** (`eval/lib/runner.mjs`, `eval/lib/providers.mjs`): ejecuta el agente real (ConversationEngine + CommercialAgent) con el provider del modelo en `eval/models.json`; recoge requests, tokens, latencia por turno y costo con pricing externo (no en código).
- **CLI**: `pnpm run eval` (baseline completo), `pnpm run eval:dry` (sin API, valida pipeline), `pnpm run eval:compare` (DeepSeek vs GPT-5.6 Luna si hay key), con `--limit/--category/--scenario/--model` y `--regrade` (re-mide transcripciones guardadas sin re-llamar API).
- **Reportes**: `eval/reports/latest.json` + `latest.md` (métricas vs umbrales, matriz por categoría, latencia p50/p90/p95, tokens/costo por conversación, critical failures y peores respuestas). Transcripciones crudas en `eval/results/<run-id>/` (gitignored; sin secretos ni CoT).
- **Baseline DeepSeek Flash V4** (dataset v1, run `mt37tide`, 81 escenarios, sin nueva llamada API): score global **96.5/100 con grader v3** (97.0 v1 → 95.8 v2 → 96.5 v3 — recalibración del instrumento, el agente no cambió), **2 critical failures**: E009 (fuga de protocolo: "La herramienta requiere un purchaseType") y M005 (afirma "producción continua"/stock). Precio/mínimo/política/restringido 100%, no repetición 100%, sin cierre prematuro 100%. Debilidades medidas (reales, sin relajar): memoria del prospecto no persistida en turnos sociales (82.7%), selección de herramientas 88.9% (umbral 97%), hechos esperados 85.2%, orientación comercial 96.3% (B004/K003: secuencia de presentación no seguida), grounded claims 96.3% (F006/G006 claims de rentabilidad/popularidad, M005 stock), resolución de producto 97.5% (E009/E010 cotizaron sin clarificar modalidad ambigua — ya no critical), protocol leak 98.8%. Latencia turno p50 ~3.7s / p90 ~5.3s. Costo ~USD 0.0033/conversación (~USD 3.3/1000 conv con pricing referencial). GPT-5.6 Luna: adaptador listo, **not executed** (sin OPENAI_API_KEY).
