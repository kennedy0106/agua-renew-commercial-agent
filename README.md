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
