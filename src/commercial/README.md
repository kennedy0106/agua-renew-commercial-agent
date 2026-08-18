# Capa de dominio comercial

`CommercialService` lee exclusivamente `knowledge/agua_renew_commercial_data.json`. No consume los archivos Word originales y no llama a ningún proveedor de IA.

## Métodos

- `get_product(productId, options)`
- `list_products({ modality })`
- `get_purchase_price(request)`
- `get_delivery_information({ modality, district, requireExactLocation })`
- `get_additional_service(serviceName, { topic })`
- `get_commercial_modality(modality)`
- `check_ambiguities(context)`
- `request_human_handoff(payload)`

Las respuestas usan `status: "ok"`, `"partial"`, `"blocked"`, `"not_found"`, `"input_required"`, `"fulfillment_confirmation_required"`, `"invalid_input"` o `"not_available"`. Una respuesta con `status: "blocked"` incluye las ambigüedades documentadas o una condición publicada que exige cotización, junto con `handoff_required: true`; un futuro agente debe derivar, no seleccionar ni calcular una condición.

`list_suggested_resale_prices()` es una consulta separada para precios referenciales de reventa. Para una consulta sin producto devuelve `partial`: expone solo los productos inequívocos y bloquea los que tienen rangos contradictorios. `get_purchase_price()` nunca la utiliza.

## Pruebas

Ejecutar desde la raíz:

```powershell
& 'C:\Users\HP\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' --test
```
