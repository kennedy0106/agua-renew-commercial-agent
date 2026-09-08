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
- Recuperación: `lead_analysis_jobs` versiona pendientes, usa `FOR UPDATE SKIP LOCKED`, token de lease de 120 s, backoff 5–300 s, máximo cinco intentos y estado `EXHAUSTED`. El worker despierta con eventos, consulta cada 5 s mientras hay actividad y cada 5 min en reposo; un resultado viejo no escribe ni completa una versión nueva.

## Migración

`022_observer_stabilization.sql`: añade procedencia, conflictos y cola de análisis. `023_analysis_lease_and_coverage.sql`: añade cobertura por mensaje, tokens de lease y preservación conservadora de evidencia humana legacy. No se ejecutaron en producción. Orden: respaldar/verificar, ejecutar 022 y luego 023 con URL directa autorizada, publicar runtime, comprobar readiness.

## Evidencia y límites

- Fixtures exclusivamente sintéticos.
- PostgreSQL se validó en una base efímera local creada y eliminada por la suite.
- No hubo backfill productivo. La tabla de conflictos permite simular/revisar contradicciones antes de decidir cualquier reconciliación histórica.
- No se verificó despliegue Square Cloud ni se afirma que la configuración esté activa allí.
- Verificación final:
  - `pnpm run test`: 419 aprobadas, 0 fallidas, 12 omitidas (las de PostgreSQL se ejecutaron aparte).
  - `pnpm --filter @agua-renew/crm test`: 61/61.
  - `pnpm run build:crm`: correcto.
  - `pnpm run test:postgres`: 10/10 sobre una base efímera local creada desde cero, luego eliminada.
  - `pnpm run eval:dry`: 81/81 escenarios, sin API real, score del provider scripted 91.3/100.
  - `node --check` sobre módulos modificados: correcto.
  - CI: workflow añadido; no ejecutado todavía en GitHub al redactar este informe.

## Revisión de cierre

| Hallazgo | Reproducido | Corrección | Prueba | Resultado | Pendiente |
|---|---|---|---|---|---|
| Mensaje y job en consultas separadas | Sí, revisión estática y fallo inyectado | Transacción con una conexión; `analysis_version` recupera cobertura ausente sin incrementar duplicados cubiertos | PostgreSQL `analysis-queue-postgres.integration` | Aprobada | CI remoto |
| Lease liberado y resultado antiguo aplicable | Sí, revisión estática | Token de lease, un claim por capacidad, no solapamiento local y commit condicionado en PostgreSQL | PostgreSQL con expiración/segundo worker/mensaje concurrente | Aprobada | CI remoto |
| Calificación sin `field_provenance` | Sí, revisión estática | Calificación, procedencia y auditoría en la misma transacción; evidencia humana legacy se protege sin inventar actor | PostgreSQL `crm-provenance.integration` | Aprobada | Revisión humana de conflictos antes de producción |
| Verbos generales y teléfono agrupado | Sí, prueba unitaria | Intención direccional; extracción sobre texto sin segmentos telefónicos; 625 exige presentación | Unitarias de clasificador y reconstrucción acumulativa | Aprobada | CI remoto |

Webhook y sincronización usan exclusivamente la cola persistente. El cálculo ocurre fuera de transacción; solo el propietario vigente puede aplicar resultado, historial y evento junto con completar el job. Si aparece una versión nueva, el resultado anterior no se aplica y la nueva queda pendiente.

En inactividad, el análisis consulta cada 5 minutos; con trabajo, cada 5 segundos y además despierta por eventos. Automatizaciones CRM: 5 minutos. La sincronización Meta mantiene `META_SYNC_INTERVAL_MS` cuando está configurada, por lo que no se afirma que Neon pueda suspenderse. No se evaluaron tarifas ni límites comerciales de Neon.

La migración 023 protege oportunidades con `classification_source=HUMAN` y contactos con auditoría previa usando `LEGACY_HUMAN_EVIDENCE`; conserva fecha disponible y deliberadamente no inventa actor. No ejecuta reconciliación ni backfill productivo.
