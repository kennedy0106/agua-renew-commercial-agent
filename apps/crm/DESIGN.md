---
name: "Agua ReNew · CRM comercial"
description: "Sala de control comercial clara, sobria y orientada a seguimiento."
colors:
  primary: "#0c5a63"
  primary-deep: "#073f47"
  ink: "#163038"
  muted: "#52696e"
  field: "#f3f7f6"
  paper: "#ffffff"
  line: "#dce7e4"
  mint: "#dff1eb"
  signal: "#b6d64b"
  danger: "#b94148"
  amber: "#b46c17"
  surface-muted: "#e8efed"
  surface-soft: "#edf2f1"
  surface-subtle: "#f8fbfa"
  drawer: "#f4f8f7"
  control-line: "#cbdad6"
  scroll-track: "#edf3f1"
  scroll-thumb: "#9eb9b3"
  text-on-dark: "#b4d0ce"
  text-on-dark-muted: "#8fb7b5"
  info-ink: "#315f77"
  info-bg: "#e4f0f6"
  success-ink: "#28624f"
  success: "#47a074"
  success-bg: "#e2f2eb"
  warning-ink: "#895816"
  warning-bg: "#f9ead7"
  warning-subtle: "#fffaf1"
  warning-line: "#ead9bd"
  danger-ink: "#8d3037"
  danger-bg: "#f8e7e9"
  disabled: "#a5b0b2"
  message-bg: "#e5f1ed"
  metric-blue-ink: "#346f85"
  metric-green-ink: "#23715a"
  metric-amber-ink: "#9c5f1a"
  metric-slate-ink: "#5c7075"
  metric-violet-ink: "#725f91"
  metric-violet-bg: "#eee9f5"
  selected-shadow: "rgba(20,62,64,.08)"
  stage-ink: "#385155"
  floating-shadow: "rgba(4,35,39,.16)"
  dialog-shadow: "rgba(4,35,39,.22)"
  outbound-line: "#c4ded6"
  current-line: "rgba(179, 224, 213, .15)"
  toast-bg: "#123e44"
  toast-shadow: "rgba(8,45,49,.22)"
  toast-error-line: "#e66d74"
  mobile-label: "#819396"
  bucket-ink: "#527074"
  observer-ink: "#426268"
  amber-strong: "#7b551c"
  lead-ink: "#36545a"
  priority-ink: "#78531d"
  whatsapp-ink: "#247c58"
  muted-strong: "#314e53"
  template-ink: "#315f5e"
  dashboard-bg: "#f7f8f7"
  dashboard-panel: "#edf1ee"
  dashboard-panel-strong: "#e7ece8"
  dashboard-ink: "#151716"
  dashboard-muted: "#59615c"
  dashboard-signal: "#e8ff67"
  dashboard-on-dark: "#f7faf8"
  dashboard-on-dark-muted: "#bdc6c0"
typography:
  display:
    fontFamily: "Geist Variable, Segoe UI, sans-serif"
    fontSize: "clamp(2.4375rem, 5vw, 4.375rem)"
    fontWeight: 800
    lineHeight: 0.99
    letterSpacing: "-0.06em"
  headline:
    fontFamily: "Geist Variable, Segoe UI, sans-serif"
    fontSize: "clamp(1.6875rem, 3vw, 2.375rem)"
    fontWeight: 800
    lineHeight: 1.08
    letterSpacing: "-0.045em"
  title:
    fontFamily: "Geist Variable, Segoe UI, sans-serif"
    fontSize: "1.0625rem"
    fontWeight: 700
    lineHeight: 1.2
  body:
    fontFamily: "Geist Variable, Segoe UI, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Geist Variable, Segoe UI, sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 700
    lineHeight: 1.4
  compact:
    fontFamily: "Geist Variable, Segoe UI, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.4
  login-lead:
    fontFamily: "Geist Variable, Segoe UI, sans-serif"
    fontSize: "clamp(15px, 1.5vw, 20px)"
    fontWeight: 400
    lineHeight: 1.55
  login-title:
    fontFamily: "Geist Variable, Segoe UI, sans-serif"
    fontSize: "24px"
    fontWeight: 700
  mobile-headline:
    fontFamily: "Geist Variable, Segoe UI, sans-serif"
    fontSize: "29px"
    fontWeight: 800
  mobile-metric:
    fontFamily: "Geist Variable, Segoe UI, sans-serif"
    fontSize: "23px"
    fontWeight: 800
  handoff-title:
    fontFamily: "Geist Variable, Segoe UI, sans-serif"
    fontSize: "21px"
    fontWeight: 700
  control-icon:
    fontFamily: "Geist Variable, Segoe UI, sans-serif"
    fontSize: "20px"
    fontWeight: 700
  mobile-display:
    fontFamily: "Geist Variable, Segoe UI, sans-serif"
    fontSize: "clamp(2rem, 12vw, 2.75rem)"
    fontWeight: 800
rounded:
  indicator: "4px"
  action: "10px"
  control: "9px"
  tight: "7px"
  pill: "999px"
spacing:
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "24px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.paper}"
    rounded: "{rounded.action}"
    padding: "0 17px"
    height: "44px"
  input:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "9px 11px"
    height: "44px"
  card:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    padding: "21px"
  chip:
    backgroundColor: "{colors.mint}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    padding: "0 9px"
    height: "26px"
---

# Design System: Agua ReNew · CRM comercial

## Overview

**Creative North Star: "La sala de control de agua"**

El CRM se siente como una herramienta comercial concentrada, no como una campaña. El verde petróleo profundo sostiene la navegación y la marca; un campo gris verdoso muy claro mantiene baja la fatiga y deja que los datos sean la figura. La densidad es deliberadamente operativa: títulos con carácter, controles compactos y tablas que priorizan nombre, etapa, responsable y próxima acción.

**Key Characteristics:**

- Sidebar oscura estable y lienzo de trabajo frío y luminoso.
- Superficies blancas planas con bordes suaves; sombra solo cuando una capa flota.
- Geist Variable unifica titulares, datos y controles con jerarquía por peso y tamaño.
- Verde lima señala actividad del sistema, nunca reemplaza una etiqueta.
- En móvil, la jerarquía se apila y la navegación se convierte en drawer.

## Colors

La paleta concentra la marca en verde petróleo y reserva los tonos auxiliares para significado operativo.

### Primary

- **Corriente ReNew:** acción principal, foco y navegación contextual.
- **Profundidad ReNew:** sidebar, acceso y estados de alto contraste.

### Secondary

- **Señal viva:** captación activa y contadores que deben encontrarse rápido.
- **Menta operativa:** chips, fondos informativos y zonas de conversación saliente.

### Neutral

- **Tinta profunda:** títulos, cifras y texto principal.
- **Agua quieta:** texto secundario y metadatos.
- **Campo frío:** fondo general.
- **Papel:** controles y superficies de datos.
- **Línea húmeda:** separación estructural de baja intensidad.

### Named Rules

**The Signal Is Rare Rule.** El lima se usa para indicar actividad o atención; nunca llena grandes superficies.

**The Text Names State Rule.** Ningún estado depende solo del color: etapa, rol, estado y vencimiento siempre tienen texto.

## Typography

**Display y Body Font:** Geist Variable con Segoe UI como respaldo.

**Character:** Geist aporta precisión compacta a cifras, títulos y controles sin mezclar voces tipográficas.

### Hierarchy

- **Display** (800, fluido, 0.99): mensaje de acceso.
- **Headline** (800, fluido, 1.08): encabezado principal de cada vista.
- **Title** (700, 17 px, 1.2): secciones y paneles.
- **Body** (400–700, 14 px, 1.5): datos, controles y explicaciones.
- **Compact** (500–700, 12 px): tablas, filtros y metadatos.
- **Label** (700, 11 px): solo contadores y etiquetas breves no críticas.

### Named Rules

**The One Voice Rule.** Geist resuelve toda la interfaz; peso, escala y espacio crean la jerarquía.

## Layout

En escritorio una sidebar fija de 254 px acompaña un lienzo central con ancho máximo de 1510 px. El ritmo principal usa 14–19 px entre unidades y 24–25 px dentro de paneles. Dashboard, listado y reportes comparten encabezado, acciones a la derecha y superficies alineadas.

La búsqueda global es un campo editable dentro del encabezado, no un botón ni un diálogo. A partir de dos caracteres muestra una lista anclada bajo el mismo control, agrupada por oportunidades, contactos y empresas; `/` enfoca el campo, las flechas recorren resultados, Enter abre el registro y Escape cierra la lista sin perder la consulta.

La Bandeja Meta usa una cola y un panel de revisión en paralelo. En móvil, los buckets pasan a un selector y la revisión sustituye temporalmente la cola con una acción explícita para volver.

Por debajo de 760 px la sidebar se oculta tras un botón fijo, el contenido pasa a una columna y las tablas de oportunidades se reexpresan como tarjetas etiquetadas. Por debajo de 430 px los KPI también pasan a una columna. No se exige desplazamiento horizontal para completar tareas móviles.

Cada vista funcional se carga bajo demanda y expone un estado de espera anunciado. El documento inicial conserva solo resumen, oportunidades y la estructura compartida para acelerar el primer uso.

## Elevation & Depth

El sistema es plano por defecto. Bordes fríos separan paneles; las sombras difusas aparecen solo en login, drawer, toast y capas que realmente flotan. La scrim del drawer puede desenfocar levemente el fondo para conservar foco.

### Named Rules

**The Earned Shadow Rule.** Una sombra implica una capa flotante o una transición de contexto; las tarjetas normales se separan con borde y tono.

## Shapes

Acciones y controles usan esquinas de 9–10 px. Los paneles grandes permanecen casi rectos para reforzar precisión. Círculos y píldoras se limitan a avatares, indicadores puntuales y chips de etapa.

## Components

### Buttons

- **Shape:** compacta, mínimo táctil de 44 px y radio de 10 px.
- **Primary:** verde petróleo con texto blanco y elevación mínima al hover.
- **Hover / Focus:** desplazamiento vertical de 1 px y anillo de foco visible.
- **Secondary / Ghost:** papel con borde frío; ghost pierde el borde para acciones contextuales.

### Chips

- **Style:** píldora pequeña con punto de color y texto de etapa.
- **State:** color variable con contraste sostenido por el nombre textual.

### Cards / Containers

- **Corner Style:** mayormente recto; las tarjetas no compiten con controles.
- **Background:** papel sobre campo frío.
- **Shadow Strategy:** plana en reposo.
- **Border:** línea fría de 1 px.

### Inputs / Fields

- **Style:** fondo blanco, borde frío, radio de 9 px y alto mínimo de 44 px.
- **Focus:** borde principal y anillo sólido de alto contraste.
- **Error / Disabled:** error con borde y fondo rojo suave; disabled reduce opacidad sin ocultar contexto.
- **Error global:** los fallos operativos permanecen como `alert` hasta que la persona los cierre e incluyen una acción segura para recargar la vista.

### Navigation

La sidebar usa iconos SVG lineales, texto visible y una superficie activa verde translúcida. En móvil se conserva completa dentro de un drawer con scrim y cierre accesible. Al cerrarse sale también del árbol de foco; al abrirse vuelve a estar disponible para teclado y tecnologías de asistencia.

Las vistas usan rutas hash estables (`#/vista`), admiten enlaces directos y permanecen sincronizadas con atrás/adelante. Una URL restringida conserva la ruta y muestra `PermissionState`, con una acción explícita para volver al Resumen.

### Bandeja Meta

Los buckets con contador usan ToggleGroup en escritorio y Select en móvil. La cola conserva datos válidos durante actualizaciones; el detalle usa panel paralelo en escritorio y Sheet Radix a pantalla completa en móvil. La automatización se presenta como información por confirmar; ownership, faltantes, consentimiento y estado de handoff permanecen visibles antes de habilitar WhatsApp.

### Opportunity Drawer

Es la capa de contexto principal: conserva persona y etapa en cabecera, separa conversación, gestión y cotizaciones por pestañas, y desplaza el trabajo sin navegar fuera del listado.

Todos los drawers comparten un contrato de diálogo modal: nombre accesible, foco inicial contenido, ciclo de Tab, cierre con Escape, bloqueo del scroll de fondo y restauración del foco al control de origen.

### Pipeline de oportunidades

El pipeline conserva las etapas abiertas en carriles horizontales y mantiene Ganado y Perdido visibles en la cabecera como destinos de cierre. Cada tarjeta alinea iniciales, contacto, producto y responsable; el asa independiente permite arrastrar con puntero o teclado sin convertir toda la tarjeta en un control ambiguo. Cada carril administra su carga incremental, pero oculta el scrollbar hasta la interacción para que la estructura de etapas sea la figura. En móvil se muestra una etapa a la vez mediante el selector anclado y se conservan los dos destinos de cierre antes del carril activo.

### Confirmation Dialog

Las acciones irreversibles usan un diálogo compartido centrado. El título nombra la consecuencia, el texto identifica el objeto afectado y el botón repite la acción exacta. Los motivos obligatorios se capturan dentro del diálogo con validación visible; nunca se delegan a confirmaciones nativas del navegador.

### Activación comercial

Cuando existe cartera pero todavía no hay equipo o agenda, el resumen muestra una secuencia contextual de tres acciones reales: crear asesores, revisar la bandeja Meta y asignar el primer seguimiento. No bloquea el CRM y desaparece conforme la operación alcanza esos hitos.

## Do's and Don'ts

### Do:

- **Do** mantener etapa, responsable y próxima acción en la misma vista.
- **Do** conservar texto visible junto a cualquier señal de color.
- **Do** transformar tablas en tarjetas etiquetadas en móvil.
- **Do** usar SVG lineal para iconografía de interfaz.
- **Do** indicar “Obligatorio” junto a los campos requeridos antes del envío.
- **Do** mostrar datos indeterminados como carga, nunca como un cero provisional.

### Don't:

- **Don't** introducir gradientes decorativos, texto con gradiente o efectos de vidrio en las tablas.
- **Don't** llenar grandes áreas con el lima de señal.
- **Don't** usar sombras duras o bordes laterales decorativos para fingir jerarquía.
- **Don't** escribir desde el CRM a Meta; la conversación permanece en modo lectura.
- **Don't** usar `window.confirm` o `window.prompt` para decisiones comerciales.

## Dashboard V2 · Dirección aprobada

La ruta `#/dashboard` y el shell global usan como única interfaz la composición aprobada de sala de control: lienzo neutro a pantalla completa, navegación negra fija y contraíble, paneles gris verdoso y señal lima reservada para avances listos para actuar. La versión anterior y su bandera de migración fueron retiradas.

- **Jerarquía:** saludo y acción primaria; oportunidades activas y listas para WhatsApp; oportunidad prioritaria; rendimiento comercial; rail operativo.
- **Datos:** administradores y supervisores priorizan revisión y asignación; asesores priorizan vencimientos y tareas. Los valores nulos o cero no se presentan como éxito.
- **Gráficos:** tendencia con cápsulas agrupadas para creadas, ganadas y perdidas, puntos de lectura, valores al foco y escala logarítmica señalizada cuando existen semanas atípicas; distribución del pipeline con barras horizontales, porcentajes y valor disponible. Ambos incluyen tabla semántica.
- **Sidebar:** ocupa una columna de 102 px contraída y 244 px expandida, con una cápsula interior flotante de 78/220 px y margen uniforme de 12 px. El botón blanco de marca es el único control de expansión. Hace reflujo desde 1281 px y se superpone sin alterar el contenido por debajo de ese ancho. El estado se persiste localmente.
- **Responsive:** el dashboard cabe en la primera pantalla de escritorio; tablet y móvil crecen verticalmente sin overflow de página. La visualización puede desplazarse dentro de su propio panel.
- **Movimiento:** transiciones de 150–460 ms con salida exponencial para navegación, tarjetas y gráficos; `prefers-reduced-motion` reduce todas a un estado prácticamente instantáneo.
- **Temas:** claro `#f7f8f7` y oscuro `#101311`; tinta `#151716`, panel claro `#edf1ee` y señal `#e8ff67`. La señal lima nunca sustituye texto de estado.

## Login V2 · Acceso a la sala de control

El acceso extiende el lenguaje aprobado sin mostrar todavía el shell: panel editorial negro inset, lienzo gris verdoso y una única superficie de papel para autenticarse. La composición explica de forma breve el recorrido Meta → contexto ordenado → WhatsApp y reserva el lima para continuidad, foco y confirmación.

- **Formulario:** correo inicialmente vacío y contraseña con visibilidad controlada; ambos usan Field e InputGroup, etiquetas persistentes, `autocomplete`, validación nativa y objetivos de 44 px o más.
- **Autenticación:** conserva el contrato `/api/crm/v1/auth/login`, la sesión individual, CSRF y el límite de intentos. El error se anuncia como alerta y no revela cuál credencial falló.
- **Tema:** respeta la preferencia persistida o la del sistema y permite alternarla desde el acceso. Claro y oscuro mantienen la misma jerarquía y contraste.
- **Responsive:** desde 821 px usa composición editorial en dos columnas; por debajo apila una cabecera negra compacta y el formulario. A 480 px reduce copy y espaciado sin ocultar controles ni provocar desbordamiento.
- **Movimiento:** una entrada de 250 ms con salida exponencial establece el cambio de contexto. Hover, foco y presión usan transiciones específicas de 130–180 ms; movimiento reducido elimina desplazamientos y conserva solo feedback inmediato.

## Ingresos V2 · Extensión aprobada

La ruta `#/revenue` extiende la sala de control del Dashboard V2 al trabajo documental y transaccional sin alterar sus contratos comerciales. La banda **Control comercial** reúne `Cotizaciones`, `Pedidos` y `Catálogo` en un único tablist; cada pestaña conserva su panel asociado, su foco por teclado y su estado de carga, error o vacío.

- **Composición:** la banda de control vive sobre panel gris verdoso (`#edf1ee`) y contiene una cápsula blanca de tres pestañas. En tema claro, la pestaña activa usa tinta sólida (`#151716`) con texto blanco; el lima queda para hover, foco, estados destacados y acciones recuperables, no como fondo dominante.
- **Libros y catálogo:** cotizaciones, pedidos y grupos de catálogo usan contenedores gris verdoso sin sombra. Encabezados, resúmenes, filas de tabla, grupos de producto, paginación y vacíos se recortan como unidades de papel blanco para sostener lectura y jerarquía por contraste tonal.
- **Datos y estados:** importes usan cifras tabulares; estados conservan etiqueta textual. Los resúmenes se nombran como valores de la página actual y no como totales globales. Carga, error con reintento y ausencia de registros ocupan estados explícitos dentro del mismo panel.
- **Selects anclados:** los cambios de preparación usan Select de Radix con contenido `popper` alineado al inicio, separado 8 px y del mismo ancho que el trigger. El menú no busca una posición alternativa; conserva objetivos de 44 px, foco visible y resaltado lima.
- **Responsive:** a 900 px la banda apila texto y pestañas; por debajo de 768 px los encabezados se apilan, el catálogo pasa a una columna y las tablas se reexpresan como tarjetas etiquetadas, sin scroll horizontal. Por debajo de 480 px las pestañas prescinden de iconos, los resúmenes se apilan y cada registro usa una sola columna.
- **Movimiento:** cambios de panel y entrada de filas duran 240–260 ms con salida breve; hover y presión se limitan a desplazamientos de 1 px o escala `0.97`. La navegación por teclado evita la animación del panel y `prefers-reduced-motion` elimina entradas y vuelve casi instantáneas las transiciones.

## Comunicaciones V2 · Extensión aprobada

La ruta `#/communications` aplica un patrón operativo reutilizable de tres niveles: banda de seguridad para explicar límites y trazabilidad, rail de plantillas para iniciar el trabajo y ledger para revisar el historial. Cada panel conserva sus propios estados de carga, error recuperable y vacío, evitando que un fallo se confunda con ausencia de datos.

- **Selects anclados:** los Select de Radix abren debajo del trigger, alineados al inicio, separados 8 px y con su mismo ancho; no cambian de lado por colisión. Mantienen foco visible, opciones de 44 px y resaltado lima.
- **Header responsive:** hasta 1280 px se compacta ocultando la búsqueda y la banda de seguridad reorganiza su encabezado; entre 768 y 960 px el encabezado principal pasa a dos filas. Por debajo de 768 px la banda, el rail y el ledger forman una sola columna; a 460 px las acciones también se apilan.
- **Canales seguros:** `INTERNAL` permanece dentro del CRM y nunca ofrece salida a un canal externo. WhatsApp exige entre 8 y 15 dígitos tanto en la validación de interfaz como en servidor antes de crear o entregar el borrador. El handoff solo prepara la continuidad manual; no envía el mensaje.
- **Tiempo operativo:** las fechas del ledger se formatean en español de Perú con la zona `America/Lima`, independientemente de la zona del dispositivo.
- **Movimiento:** filas y menús entran en 180–260 ms; hover desplaza como máximo 1 px y la presión usa escala `0.97`. `prefers-reduced-motion` elimina las entradas y vuelve casi instantáneas las transiciones.

## Automatizaciones V2 · Extensión aprobada

La ruta `#/automations` usa un patrón Operate de tres niveles: banda **Control preventivo** para explicar alcance y permisos, rail **Guardas SLA** para mantener visibles los principios de continuidad y ledger para operar reglas auditables. El lima se contiene en iconos, contadores y estados activos; paneles y registros conservan la jerarquía tonal de la sala de control.

- **Contrato de reglas:** solo se admiten `TASK_OVERDUE` y `OPPORTUNITY_IDLE`, ambos con `NOTIFY_OWNER`. El runner procesa únicamente reglas `active`; para inactividad respeta un entero `hours` entre 1 y 8760. Administradores y supervisores gestionan reglas, pero solo `ADMIN` puede ejecutar el runner manualmente.
- **Incertidumbre y estados:** carga, error recuperable y vacío viven dentro del ledger. Si una carga falla sin datos conservados, contadores y resumen muestran disponibilidad desconocida (`—`) en lugar de convertir la ausencia de respuesta en cero reglas activas.
- **Selects anclados:** los Select de Radix abren debajo del trigger, alineados al inicio, separados 8 px y con el mismo ancho; no cambian de lado por colisión. Conservan foco visible, opciones de 44 px y resaltado lima.
- **Responsive:** hasta 1280 px se oculta la búsqueda y se compactan banda y filas; entre 768 y 960 px el header pasa a dos filas. A 820 px el rail y el ledger forman una columna, y a 480 px cada regla se convierte en tarjeta de dos columnas con acción y estado apilados en su bloque de contenido.
- **Movimiento:** se limita a elementos interactivos y entradas de filas o menús entre 140 y 260 ms, con desplazamientos de 1 px o presión `0.97`. `prefers-reduced-motion` elimina las entradas y vuelve casi instantáneas las transiciones.

## Equipo comercial V2 · Extensión aprobada

La vista de equipo ordena la gestión de identidades en cinco estratos: header con acción principal, alta inline, resumen ejecutivo, directorio y rail **Alcance de roles**. Reutiliza el lienzo y panel gris verdoso (`var(--flow-bg)`, `var(--flow-panel)`), papel blanco (`var(--flow-paper)`), tinta `#151716` y lima (`var(--flow-acid)`) ya establecidos; el resumen oscuro concentra métricas y el lima se reserva para altas, conteos y estados activos.

- **Alta inline:** el formulario se expande bajo el header, mantiene nombre, correo, rol y contraseña temporal en contexto, marca los campos obligatorios y devuelve el foco al disparador tras crear. En escritorio los campos se distribuyen en dos columnas para conservar etiquetas, ayudas y controles legibles; durante `busy`, formulario, selector y acciones quedan deshabilitados y el botón comunica “Creando usuario…”.
- **Directorio semántico:** la tabla conserva encabezados de columna con `scope="col"` y alinea Persona, Correo, Rol y Estado en filas de papel blanco; cifras del resumen usan numerales tabulares y roles o estados nunca dependen solo del color. El rail explica el alcance de cada rol sin competir con el directorio.
- **Estados:** carga muestra skeleton con estado anunciado; error usa un `alert` persistente con reintento; vacío aparece solo cuando la respuesta está lista y confirma que no hay integrantes. Mientras la disponibilidad no está confirmada, resumen y contadores muestran texto explícito o `—`, no ceros provisionales.
- **Responsive:** en escritorio, alta de cuatro columnas, resumen bipartito y workspace directorio/rail. A 1280 px el formulario pasa a dos columnas; a 900 px header, resumen y workspace se apilan; a 700 px el alta pasa a una columna y la tabla semántica se presenta como tarjetas etiquetadas sin scroll horizontal. A 430 px las métricas y el header del directorio también se apilan.
- **Selector Radix:** el rol abre con `popper` debajo del trigger, alineado al inicio y separado 8 px, iguala el ancho del control y mantiene 12 px de margen de colisión. Sus opciones sostienen 44 px, foco lima y una superficie flotante que declara sus propios tokens claro/oscuro porque el portal vive fuera del shell.
- **Movimiento:** apertura del alta, menú, filas y controles usan 150–240 ms; la navegación por teclado omite la entrada del formulario y los estados activos se limitan a desplazamiento de 1 px o escala `0.97`. `prefers-reduced-motion` elimina entradas y vuelve casi instantáneas las transiciones.

## Superficies flotantes V2 · Contrato de tema

Los drawers de Comunicaciones y Automatizaciones, y cualquier menú portaledo, deben declarar el conjunto mínimo `--flow-bg`, `--flow-panel`, `--flow-paper`, `--flow-ink`, `--flow-muted`, `--flow-line`, `--flow-acid` y `--flow-ease`. Al montarse bajo `body` no pueden depender de la herencia de `.renew-shell-v2`. En escritorio, los drawers son paneles inset redondeados con encabezado, formulario y acción claramente separados; en móvil ocupan el viewport sin radios. Iconos sobre `var(--flow-paper)` usan `var(--flow-ink)` y solo conservan tinta oscura cuando el fondo es lima o blanco explícito.

## Reportes comerciales V2 · Retícula operativa

El reporte sigue una lectura vertical estable: filtros e indicadores, distribución por etapa, seguimiento junto a responsables y, por último, origen junto a motivos de pérdida. Las dos filas inferiores son agrupaciones explícitas y no dependen del auto-placement de CSS Grid; de ese modo un panel con pocos registros no estira ni desplaza los demás. En escritorio, Seguimiento ocupa dos tercios y Responsable uno; la fila contextual invierte esa proporción para dar prioridad a Motivos de pérdida. Hasta 1080 px ambas agrupaciones pasan a una columna. Los paneles mantienen alturas determinadas por su contenido, iconos con tinta semántica y el mismo contraste en tema claro y oscuro.
