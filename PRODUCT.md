# Agua ReNew · CRM comercial

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Administradores, supervisores y asesores de Agua ReNew que gestionan prospectos provenientes de Facebook Messenger e Instagram y los continúan por WhatsApp.

## Product Purpose

Convertir la captación social existente en un proceso comercial trazable, con el CRM como centro de control entre la observación de Meta, la revisión humana y el contacto manual por WhatsApp.

## Positioning

Une captación social, pipeline, trabajo del equipo, reglas comerciales y reportes dentro de un CRM propio adaptado al flujo real de Agua ReNew.

## Operating Context

Uso diario en escritorio y móvil. El equipo prioriza oportunidades desde la Bandeja Meta, valida la clasificación automática, asigna responsables, programa seguimientos, registra notas, genera cotizaciones y mide conversión.

## Capabilities and Constraints

- Mantener el panel administrativo histórico y su exportación completa como superficie de compatibilidad.
- CRM React compilado por Vite y servido por el mismo proceso Node.js bajo `/crm`.
- Autenticación individual persistente, CSRF, limitación de intentos, roles ADMIN/SUPERVISOR/ADVISOR y auditoría.
- Contactos, empresas preparadas en modelo, oportunidades, pipeline, tareas, notas, actividades y notificaciones.
- Bandeja Meta organizada en Por revisar, Listos, Faltan datos, Sin asignar, Mis leads y Derivados.
- Flujo de intervención humana: asumir la oportunidad, confirmar su clasificación, confirmar consentimiento, registrar el handoff y abrir WhatsApp manualmente.
- RBAC por ownership: ADVISOR ve oportunidades sin asignar y propias, y solo modifica o deriva las propias; ADMIN y SUPERVISOR gestionan el conjunto y sus responsables.
- La migración 016 incorpora estados de calificación `UNREVIEWED`/`NEEDS_DATA`/`READY`/`CLAIMED`/`HANDED_OFF`, intención `EXPLORING`/`INTERESTED`/`QUALIFIED`/`READY_TO_BUY`, calidad `INSUFFICIENT`/`PARTIAL`/`COMPLETE` y origen de clasificación `IMPORTED`/`AUTOMATION`/`HUMAN`, además de marcas de clasificación, asignación, handoff y última actividad de Meta.
- Catálogo comercial conectado a las reglas de precios vigentes.
- Cotizaciones multiproducto con descuentos por línea, PDF generado por backend y conversión automática a pedido al aceptar.
- Gestión de pedidos y registro de pagos sobre cotizaciones aceptadas.
- Calendario mensual en escritorio y agenda móvil por día para eventos y tareas.
- Automatizaciones y seguimiento de SLA sujetos a RBAC; ADMIN y SUPERVISOR gestionan reglas y la ejecución manual queda reservada a ADMIN.
- Comunicaciones preparadas como plantillas y borradores auditables, con handoff manual al canal externo; Meta permanece estrictamente en observación y el CRM no escribe en ese canal.
- Reportes avanzados por periodo sobre ingresos, cotizaciones, ciclo y primera respuesta, conversión por etapa, responsables, origen, SLA y motivos de pérdida.
- Paginación, búsqueda y filtros son de servidor; CSV y PDF son generados por backend.
- Los precios de cotización proceden exclusivamente de `CommercialService`.
- Copy operativo en español, fechas en hora Lima y datos procedentes del backend actual.
- No inventar métricas, usuarios, permisos ni capacidades que el backend no expone.

## Brand Commitments

- Nombre Agua ReNew y recursos oficiales en `logo/`.
- La guía maestra `GUIA-DISENO.md` y el sistema de caja de Agua ReNew son referencias vinculantes.
- Identidad clara y acuática: azul dirige, verde confirma y rojo alerta.
- La experiencia debe sentirse parte del mismo producto que caja sin copiar su contenido financiero.

## Evidence on Hand

- Panel actual: `apps/meta-server/public/`.
- Guía maestra: `GUIA-DISENO.md`.
- Referencia visual secundaria: `diseño_liquid/screen.png`.
- Recursos oficiales: `logo/logo700_color.svg` y `logo/logo_gotita.svg`.
- No hay testimonios, claims comerciales ni datos demostrativos autorizados para inventar.

## Product Principles

- Hacer evidente qué prospectos requieren atención.
- Mantener la conversación y el siguiente paso en el mismo contexto.
- Comunicar estados con texto además de color.
- Conservar legibilidad y acciones esenciales en móvil.
- Proteger acciones sensibles y explicar errores recuperables.

## Accessibility & Inclusion

WCAG AA como mínimo, navegación completa por teclado, foco visible, objetivos táctiles de 44 px, movimiento reducido y zoom sin pérdida de funciones.
