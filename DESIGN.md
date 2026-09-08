---
name: Agua ReNew CRM comercial
buildPath: apps/crm/dist
locale: es-PE
currency: PEN
timezone: America/Lima
system: shadcn-nova
status: production-spec
---

# Sistema de diseño del CRM Agua ReNew

## Dirección

El CRM es una mesa de trabajo operativa premium: compacta, sobria y orientada a la siguiente acción. Conserva el wordmark blanco y los verdes de Agua ReNew, pero no replica la composición del diseño anterior. La interfaz muestra exclusivamente datos y acciones reales, respeta RBAC y mantiene hash routing, PEN y hora de Lima.

## Base técnica

- React 19, Vite, JavaScript y Tailwind CSS v4.
- shadcn con base Radix, preset Nova, alias `@/*` y Lucide.
- Primitivas instaladas: Sidebar, Button, Card, Badge, Avatar, Table, Pagination, Input, InputGroup, Field, Select, Checkbox, Tabs, ToggleGroup, Command, Popover, DropdownMenu, Tooltip, Sheet, Dialog, AlertDialog, ScrollArea, Separator, Skeleton, Spinner, Empty, Progress, Alert y Sonner.
- El selector de tema parte de `@magicui/animated-theme-toggler`, adaptado a JSX, tokens de marca y movimiento reducido.
- Los gráficos continúan como SVG propios, responsivos y con alternativa semántica; no existe dependencia gráfica adicional.

## Tokens

Los tokens se declaran en `apps/crm/src/styles.css` y usan la convención shadcn: `background`, `foreground`, `card`, `popover`, `primary`, `secondary`, `muted`, `accent`, `destructive`, `border`, `input`, `ring` y familia `sidebar-*`.

### Tema claro

- Canvas verde-marfil: `#f4f7f2`.
- Superficie cálida: `#fffefa`.
- Acción primaria: `#0c5a63`.
- Navegación: `#093f47`.
- Texto: verde-negro de alto contraste.
- Acento vivo reservado para selección, progreso y éxito.

### Tema oscuro

- Canvas verde-negro.
- Paneles elevados en verde petróleo.
- Sidebar siempre más oscura que el contenido.
- Bordes visibles sin halos, texto AA y estados con nombre además de color.

La preferencia inicial sigue al sistema, se aplica antes del primer render y una elección manual se conserva en `localStorage` bajo `agua-renew-crm-theme`.

## Tipografía y forma

- UI, datos y encabezados: Geist Variable, servido localmente con `font-display: swap`.
- Números comerciales: cifras tabulares.
- Radio estándar de panel: `14px`; controles: `10–11px`; badges: radio completo.
- Borde de `1px`; sombras suaves solo para elevación real.
- Objetivos táctiles principales: mínimo `44×44px`.

## AppShell

- Sidebar shadcn de `264px` expandida y `72px` en modo icono.
- Se abre por defecto desde `1280px`, se inicia colapsada entre `768px` y `1279px` y usa Sheet móvil bajo `768px`.
- El estado del escritorio se conserva. El atajo estándar del componente (`Ctrl/Cmd+B`) alterna la barra.
- El wordmark blanco aparece expandido; `logo_gotita.svg` blanco aparece colapsado.
- Los tooltips identifican iconos; la navegación conserva las doce rutas y se filtra por rol.
- El scroll pertenece al contenido de navegación y no expone una barra intrusiva.

La cabecera compartida contiene contexto, búsqueda Command, comunicaciones, notificaciones, tema, perfil y CTA autorizado. Es sticky con fondo translúcido; nunca cubre contenido.

## Jerarquía del dashboard

1. Resumen accionable y CTA.
2. KPI de oportunidades activas, pipeline PEN, vencidos y conversión real.
3. Oportunidad prioritaria, recientes y resumen operativo.
4. Agenda y notificaciones.
5. Embudo activo y tendencia temporal como soporte analítico.

Embudo y tendencia incluyen título, leyenda, etiquetas, tooltip accesible y tabla semántica. Los ceros son datos reales; la ausencia de datos se expresa explícitamente.

## Patrones de producto

- `PageHeader` unifica título, descripción y acciones.
- Las vistas de datos usan FilterBar, filtros removibles, Table/Pagination y cards móviles.
- Lista/Pipeline usa Tabs/ToggleGroup y mantiene drag-and-drop.
- Bandeja Meta y Comunicaciones son interfaces de dos paneles; el detalle móvil ocupa un Sheet.
- Edición contextual extensa usa Sheet; tareas breves usan Dialog; acciones irreversibles usan AlertDialog.
- Formularios preservan valores tras un error y muestran validación junto al Field.
- Badge normaliza etapa, prioridad y estado.
- `ViewLoadingState` reserva desde el primer render la cabecera, herramientas y área principal de cada ruta lazy. `DataState` compone Skeleton/Spinner/Empty/Alert para carga, vacío y error; listas y tablas conservan sus datos durante actualizaciones y anuncian `aria-busy` en vez de desaparecer. `PermissionState` explica una URL restringida sin debilitar RBAC. `ResponsiveDataView` y `EntitySheet` normalizan el cambio tabla/cola-detalle hacia superficies móviles con foco Radix.
- Sonner comunica resultados breves y ofrece recuperación en errores persistentes.

## Motion

- Feedback, hover y selección: `120–180ms`.
- Tabs, sidebar y overlays: `180–220ms`.
- Cambio de tema e icono: `240ms`.
- Gráficos: `280–320ms`, solo en primera representación o cambio de período.
- Se prefieren `opacity`, `transform` y color; el ancho solo cambia en la sidebar controlada.
- `prefers-reduced-motion: reduce` lleva todas las transiciones a estado instantáneo.

## Accesibilidad

- Objetivo WCAG 2.2 AA, foco visible y orden de teclado igual al visual.
- Command soporta flechas, Enter y Escape; la búsqueda inicia desde dos caracteres y usa debounce.
- Radix contiene el foco en menús, diálogos y Sheets y lo devuelve al disparador.
- Iconos interactivos tienen nombre accesible; color nunca es el único significado.
- Tablas y gráficos tienen equivalentes semánticos.
- Zoom al 200%, textos largos y montos grandes no ocultan acciones.

## Responsive

- `≥1280px`: sidebar expandida y grillas de alta densidad.
- `768–1279px`: sidebar en modo icono; paneles se redistribuyen.
- `<768px`: navegación Sheet y cabecera apilada.
- `390px`: una columna, tablas como cards y edición contextual a pantalla completa.
- Ningún breakpoint admite scroll horizontal de página.

## Verificación

- `pnpm --filter @agua-renew/crm test` cubre tema, registro de rutas, filtrado por rol, skip link, estados compartidos, Dashboard y apertura de Bandeja Meta; las pruebas de dominio existentes siguen siendo obligatorias.
- `npm run build:crm` produce `apps/crm/dist` sin modificar endpoints ni esquemas.
- La aceptación requiere las doce rutas, RBAC, CSV, búsqueda, drawers, formularios, pipeline, calendario y notificaciones funcionales en claro y oscuro.
- No se admiten datos demo, botones inertes, regresiones de foco ni animaciones obligatorias.
