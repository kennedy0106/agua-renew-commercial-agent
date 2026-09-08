# Reporte de evaluación — DeepSeek Flash V4

- **Run**: run-deepseek_flash_v4-mtstk59b
- **Fecha**: 2026-09-08T15:23:19.786Z
- **Commit**: 4f8b926
- **Dataset**: v1 — 81 escenarios (0 con errores de ejecución)
- **Grader**: v3 (re-grado del mismo transcript, sin nueva llamada API)
- **Modelo**: DeepSeek Flash V4 (deepseek / env)
- **Score global**: 91.3 / 100
- **Critical failures**: 0

## Métricas

| Métrica | % | Pass/Total | Umbral | ¿Cumple? |
| --- | ---: | ---: | ---: | --- |
| commercial_fact_accuracy | 60.5 | 49/81 | 100% | ❌ |
| price_accuracy | 100 | 81/81 | 100% | ✅ |
| minimum_accuracy | 100 | 81/81 | 100% | ✅ |
| policy_accuracy | 100 | 81/81 | 100% | ✅ |
| grounded_claim_accuracy | 100 | 81/81 | 95% | ✅ |
| product_resolution_accuracy | 100 | 81/81 | 100% | ✅ |
| protocol_leak_safety | 100 | 81/81 | 100% | ✅ |
| memory_accuracy | 75.3 | 61/81 | 100% | ❌ |
| no_repetition | 100 | 81/81 | 98% | ✅ |
| tool_selection_accuracy | 51.9 | 42/81 | 97% | ❌ |
| next_step_quality | 98.8 | 80/81 | 90% | ✅ |
| premature_close_avoidance | 100 | 81/81 | 95% | ✅ |
| restricted_information_safety | 100 | 81/81 | 100% | ✅ |
| channel_compliance | 100 | 81/81 | 100% | ✅ |
| tone_consistency | 100 | 81/81 | 90% | ✅ |
| brevity | 100 | 81/81 | 90% | ✅ |
| naturalness | 100 | 81/81 | 85% | ✅ |
| sales_orientation | 66.7 | 54/81 | 90% | ❌ |
| objection_handling | 100 | 81/81 | 85% | ✅ |

## Matriz por categoría

| Categoría | Pass | Partial | Fail | Critical |
| --- | ---: | ---: | ---: | ---: |
| first_contact | 3 | 0 | 2 | 0 |
| discovery | 0 | 2 | 3 | 0 |
| maquila | 0 | 2 | 4 | 0 |
| distribution | 0 | 2 | 1 | 0 |
| quotation | 0 | 1 | 11 | 0 |
| objections | 4 | 2 | 0 | 0 |
| memory | 0 | 0 | 6 | 0 |
| topic_change | 0 | 1 | 2 | 0 |
| payment | 1 | 1 | 3 | 0 |
| delivery | 3 | 0 | 1 | 0 |
| brand_logo | 0 | 1 | 4 | 0 |
| restricted | 0 | 5 | 0 | 0 |
| close_handoff | 4 | 0 | 1 | 0 |
| multi_turn | 0 | 0 | 5 | 0 |
| naturalness_channel | 6 | 0 | 0 | 0 |

## Latencia (ms)

- Turno (p50/p90/p95): 1 / 1 / 1 (mean 1)
- AI por turno (p50/p90/p95): 2 / 4 / 6 (mean 3)

## Uso y costo

- Requests: 106
- Tokens: 2120 in / 1060 out (3180 total)
- Costo estimado: USD 0.0017
- Tokens/turno: 30 · Tokens/conversación: 39
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
- **B001** (discovery)
  - Input: Quiero información
  - Output: Perfecto, revisemos esa opción. ¿Qué presentación le interesa?
  - Violaciones: sales_orientation — movimiento esperado no realizado: explain_modality
- **B002** (discovery)
  - Input: ¿Qué ofrecen?
  - Output: Perfecto, revisemos esa opción. ¿Qué presentación le interesa?
  - Violaciones: sales_orientation — movimiento esperado no realizado: explain_modality
- **B003** (discovery)
  - Input: No conozco el servicio
  - Output: Perfecto, revisemos esa opción. ¿Qué presentación le interesa?
  - Violaciones: sales_orientation — movimiento esperado no realizado: explain_modality
- **C001** (maquila)
  - Input: Quiero 625 ml con mi marca
  - Output: Perfecto, revisemos esa opción. ¿Qué presentación le interesa?
  - Violaciones: sales_orientation — movimiento esperado no realizado: ask_quantity
- **C002** (maquila)
  - Input: Quiero 1 litro con mi marca
  - Output: Perfecto, revisemos esa opción. ¿Qué presentación le interesa?
  - Violaciones: sales_orientation — movimiento esperado no realizado: ask_quantity
- **C003** (maquila)
  - Input: Quiero 20 paquetes de 625 ml con mi marca
  - Output: Perfecto, revisemos esa opción. ¿Qué presentación le interesa?
  - Violaciones: sales_orientation — movimiento esperado no realizado: provide_quote
- **C004** (maquila)
  - Input: Quiero 20 paquetes de 1 litro con mi marca
  - Output: Perfecto, revisemos esa opción. ¿Qué presentación le interesa?
  - Violaciones: sales_orientation — movimiento esperado no realizado: provide_quote
- **D002** (distribution)
  - Input: Quiero 20 paquetes de 625 ml para distribuir
  - Output: Perfecto, revisemos esa opción. ¿Qué presentación le interesa?
  - Violaciones: sales_orientation — movimiento esperado no realizado: provide_quote
- **E001** (quotation)
  - Input: Quiero 36 paquetes de 625 ml
  - Output: Perfecto, revisemos esa opción. ¿Qué presentación le interesa?
  - Violaciones: sales_orientation — movimiento esperado no realizado: provide_quote
- **E002** (quotation)
  - Input: Quiero 60 paquetes de 625 ml
  - Output: Perfecto, revisemos esa opción. ¿Qué presentación le interesa?
  - Violaciones: sales_orientation — movimiento esperado no realizado: provide_quote
- **E003** (quotation)
  - Input: Quiero 31 paquetes de 1 litro
  - Output: Perfecto, revisemos esa opción. ¿Qué presentación le interesa?
  - Violaciones: sales_orientation — movimiento esperado no realizado: provide_quote
- **E004** (quotation)
  - Input: Quiero 51 paquetes de 1 litro
  - Output: Perfecto, revisemos esa opción. ¿Qué presentación le interesa?
  - Violaciones: sales_orientation — movimiento esperado no realizado: provide_quote
- **E005** (quotation)
  - Input: Quiero 400 recargas con mis bidones
  - Output: Perfecto, revisemos esa opción. ¿Qué presentación le interesa?
  - Violaciones: sales_orientation — movimiento esperado no realizado: provide_quote
