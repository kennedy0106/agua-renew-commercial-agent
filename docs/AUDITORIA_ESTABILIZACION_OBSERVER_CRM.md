# Auditoría de estabilización del observer y CRM

## Base y alcance

- Base real: `4f8b926d7fbd7b782ddc9dc7142b630532be1e6b` (`main`, igual a `origin/main`).
- Cambio local ajeno preservado: `apps/crm/src/styles.css`.
- Runtime Meta: observador estricto; no se habilitó escritura a Meta ni WhatsApp.

## Hallazgos y correcciones

Todos los hallazgos principales fueron reproducidos: calificación sin ownership atómico, arranque productivo permisivo, clasificación dominada por campos extraídos, espejo que sobreescribía correcciones, equivalencias de estados, herencia DeepSeek y microtask no persistente.

- Autorización: `qualifyOpportunity()` bloquea la fila, valida organización, estado, owner y versión antes de escribir. `claimOpportunity()`, `updateOpportunity()` y `prepareWhatsAppHandoff()` ya tenían condiciones/locks de ownership; no se ampliaron permisos.
- Arranque: validación central previa a `main`; producción exige base, firma, token explícito, autenticación y TLS. No existe fallback a memoria ante fallo productivo.
- Clasificación: intención y extracción son señales independientes; teléfono aislado no crea lead comercial; proveedor/empleo/reclamo/cliente existente prevalecen. `625 ml` exige contexto de presentación.
- Precedencia: las correcciones CRM quedan marcadas en `field_provenance`. Campos humanos son canónicos; datos automáticos actualizan solo campos no bloqueados. Contradicciones se insertan de forma idempotente en `crm_data_conflicts`. La ausencia nunca borra.
- Estados: datos completos conservan intención `INTERESTED`; abrir enlace queda listo, no contactado. `HANDED_OFF` representa preparación/derivación; `CONTACTED_MANUALLY` requiere la acción humana existente.
- IA: determinística por defecto; solo `AI_*`, con allowlist de destino en producción. `DEEPSEEK_*` no llega al observador.
- Recuperación: `lead_analysis_jobs` versiona pendientes, usa `FOR UPDATE SKIP LOCKED`, lease de 120 s, backoff 5–300 s, máximo cinco intentos y estado `EXHAUSTED`. El poll predeterminado es 30 s y un resultado viejo no completa una versión nueva.

## Migración

`022_observer_stabilization.sql`: añade procedencia, conflictos y cola de análisis. No se ejecutó en producción. Orden: respaldar/verificar, ejecutar migraciones hasta 022 con URL directa autorizada, publicar runtime, comprobar readiness.

## Evidencia y límites

- Fixtures exclusivamente sintéticos.
- PostgreSQL se validó en una base efímera local creada y eliminada por la suite.
- No hubo backfill productivo. La tabla de conflictos permite simular/revisar contradicciones antes de decidir cualquier reconciliación histórica.
- No se verificó despliegue Square Cloud ni se afirma que la configuración esté activa allí.
- Verificación final:
  - `pnpm run test`: 416 aprobadas, 0 fallidas, 7 omitidas (las de PostgreSQL se ejecutaron aparte).
  - `pnpm --filter @agua-renew/crm test`: 61/61.
  - `pnpm run build:crm`: correcto.
  - `pnpm run test:postgres`: 5/5 sobre base efímera local, luego eliminada.
  - `pnpm run eval:dry`: 81/81 escenarios, sin API real, score del provider scripted 91.3/100.
  - `node --check` sobre módulos modificados: correcto.
  - CI: workflow añadido; no ejecutado todavía en GitHub al redactar este informe.
