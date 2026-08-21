# Automatización comercial Agua ReNew

Simulador local de atención comercial para Agua ReNew con persistencia en PostgreSQL e IA opcional (DeepSeek).

```text
UI local → ConversationEngine → Repository → PostgreSQL
                         └→ CommercialService → knowledge/agua_renew_commercial_data.json
```

No integra WhatsApp, n8n, OVH ni otros servicios externos de producción. La única integración opcional de esta fase es DeepSeek para interpretar lenguaje natural. `CommercialService` conserva la autoridad exclusiva sobre precios, escalas, mínimos, delivery, ambigüedades y derivaciones.

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

2. Edite `.env` y complete solo lo que necesite. Para modo determinístico (sin IA), deje `AI_ENABLED=false` y `DEEPSEEK_API_KEY` vacío. Para activar IA:

```bash
AI_ENABLED=true
AI_PROVIDER=deepseek
DEEPSEEK_API_KEY=su_clave_real
DEEPSEEK_MODEL=deepseek-v4-flash
```

`.env` está excluido de Git: nunca lo versionee.

## Levantar PostgreSQL local (Docker)

```bash
docker compose up -d
```

Crea el contenedor `agua-renew-postgres` (PostgreSQL 16) con la base `agua_renew`. El volumen de datos vive dentro de Docker, no en el repositorio.

La aplicación se conecta **únicamente** con `DATABASE_URL` (no hay fallback en código). Para desarrollo local, el valor documentado en `.env.example` es `postgres://agua_renew:agua_renew_local@localhost:5432/agua_renew`, consistente con `docker-compose.yml` (donde `POSTGRES_PASSWORD` es sobreescribible con `POSTGRES_PASSWORD`).

## Aplicar migraciones

```bash
pnpm migrate
```

Las migraciones están en `database/migrations/` (orden `001_…` a `008_…`) y son idempotentes: una base nueva se reconstruye desde cero con este comando.

## Iniciar el simulador

```bash
pnpm start:simulator
```

Abrir `http://localhost:3000`.

## Pruebas

```bash
pnpm test
```

Para incluir la prueba de integración real contra PostgreSQL (requiere el contenedor arriba):

```bash
# PowerShell
$env:RUN_POSTGRES_TESTS='1'; node --test
# bash / Linux
RUN_POSTGRES_TESTS=1 node --test
```

La prueba real de DeepSeek está desactivada por defecto para no consumir créditos. Con `.env` configurado, ejecútela explícitamente:

```bash
# PowerShell
$env:RUN_DEEPSEEK_TESTS='1'; node --test test/deepseek.integration.test.mjs
# bash / Linux
RUN_DEEPSEEK_TESTS=1 node --test test/deepseek.integration.test.mjs
```

## Capas

- `apps/simulator/`: servidor local y UI.
- `src/conversation/`: máquina de estados persistente; no contiene precios ni SQL.
- `src/commercial/`: consultas y bloqueos comerciales.
- `src/ai/`: proveedor DeepSeek, intérprete validado y compositor seguro.
- `src/repository/`: interfaz de persistencia y adaptadores de PostgreSQL/memoria.
- `database/migrations/`: migraciones SQL reproducibles.
- `knowledge/`: fuente estructurada de datos comerciales (autoridad del runtime).

Si `CommercialService` devuelve una condición bloqueada o requiere cotización, `ConversationEngine` persiste el handoff y muestra la derivación a un asesor. La UI solo presenta eventos, estados y datos recibidos.

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

- **Perfiles de generación** (`GENERATION_PROFILES` en el agente; `complete()` del provider acepta `temperature`/`maxTokens` por llamada con defaults retrocompatibles): decisión/herramientas a `temperature 0` (maxTokens 1200) y redacción final a `0.3` (maxTokens 400). La temperatura nunca gobierna hechos comerciales: precios, totales, mínimos y condiciones se componen determinísticamente.
- **Registro:** tratamiento comercial predeterminado **“usted”** (habla desde Agua ReNew como “nosotros”, cercano y no burocrático); `CommercialAdvisorVoice` y las plantillas determinísticas del engine quedaron en “usted”.
- **Conversación continua:** `conversationHasStarted` se deriva del historial; en turnos posteriores no se repiten saludos ni la presentación de Agua ReNew.
- **Perfil de la plataforma:** el nombre visible nunca se usa automáticamente (solo si la persona se presenta o está confirmado en memoria).
- **Emojis moderados** (1–2 en el primer mensaje si ayudan; 0 en seguimientos) y **brevedad** (respuesta normal de 40–90 palabras, con diagnostics `wordCount`/`responseDetailLevel`).
- **Canal:** el agente recibe `channel` (local/instagram/messenger/whatsapp); en Instagram/Messenger continúa en el mismo canal sin pedir WhatsApp.
- **Métricas:** `channel`, `generation_profile`, `temperature_used` y `max_tokens_used` en diagnostics (sin contenido de razonamiento).
