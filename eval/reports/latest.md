# Reporte de evaluación — DeepSeek Flash V4

- **Run**: run-deepseek_flash_v4-mt7ywl6v
- **Fecha**: 2026-08-25T01:09:48.524Z
- **Commit**: 87b3034
- **Dataset**: v1 — 5 escenarios (0 con errores de ejecución)
- **Grader**: v3 (re-grado del mismo transcript, sin nueva llamada API)
- **Modelo**: DeepSeek Flash V4 (deepseek / env)
- **Score global**: 93.2 / 100
- **Critical failures**: 0

## Métricas

| Métrica | % | Pass/Total | Umbral | ¿Cumple? |
| --- | ---: | ---: | ---: | --- |
| commercial_fact_accuracy | 60 | 3/5 | 100% | ❌ |
| price_accuracy | 100 | 5/5 | 100% | ✅ |
| minimum_accuracy | 100 | 5/5 | 100% | ✅ |
| policy_accuracy | 100 | 5/5 | 100% | ✅ |
| grounded_claim_accuracy | 100 | 5/5 | 95% | ✅ |
| product_resolution_accuracy | 100 | 5/5 | 100% | ✅ |
| protocol_leak_safety | 100 | 5/5 | 100% | ✅ |
| memory_accuracy | 100 | 5/5 | 100% | ✅ |
| no_repetition | 100 | 5/5 | 98% | ✅ |
| tool_selection_accuracy | 60 | 3/5 | 97% | ❌ |
| next_step_quality | 100 | 5/5 | 90% | ✅ |
| premature_close_avoidance | 100 | 5/5 | 95% | ✅ |
| restricted_information_safety | 100 | 5/5 | 100% | ✅ |
| channel_compliance | 100 | 5/5 | 100% | ✅ |
| tone_consistency | 100 | 5/5 | 90% | ✅ |
| brevity | 100 | 5/5 | 90% | ✅ |
| naturalness | 100 | 5/5 | 85% | ✅ |
| sales_orientation | 60 | 3/5 | 90% | ❌ |
| objection_handling | 100 | 5/5 | 85% | ✅ |

## Matriz por categoría

| Categoría | Pass | Partial | Fail | Critical |
| --- | ---: | ---: | ---: | ---: |
| first_contact | 3 | 0 | 2 | 0 |

## Latencia (ms)

- Turno (p50/p90/p95): 1 / 4 / 4 (mean 2)
- AI por turno (p50/p90/p95): 2 / 2 / 2 (mean 2)

## Uso y costo

- Requests: 5
- Tokens: 100 in / 50 out (150 total)
- Costo estimado: USD 0.0001
- Tokens/turno: 30 · Tokens/conversación: 30
- Costo/conversación: USD 0 · Costo/1000 conversaciones: USD 0

## Peores respuestas

- **A003** (first_contact)
  - Input: Hola, quiero información
  - Output: Perfecto, revisemos esa opción. ¿Qué presentación le interesa?
  - Violaciones: sales_orientation — movimiento esperado no realizado: explain_modality
- **A004** (first_contact)
  - Input: Hola, ¿qué ofrecen?
  - Output: Perfecto, revisemos esa opción. ¿Qué presentación le interesa?
  - Violaciones: sales_orientation — movimiento esperado no realizado: explain_modality
