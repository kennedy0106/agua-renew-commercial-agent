---
name: "Agua ReNew · Captación de leads"
description: "Agua en operación: un panel comercial acuático, legible y sereno para llevar prospectos de Meta a WhatsApp."
colors:
  brand-blue: "#0066cc"
  brand-blue-bright: "#007bff"
  brand-blue-soft: "#67c3f3"
  brand-green: "#00c853"
  brand-green-deep: "#008f3e"
  brand-ink: "#154399"
  brand-muted: "#3f5f86"
  danger: "#b42318"
  ice-start: "#edf7ff"
  ice-mid: "#dceeff"
  ice-end: "#d1e9fb"
  glass: "rgba(255,255,255,.48)"
  glass-strong: "rgba(255,255,255,.68)"
  glass-border: "rgba(255,255,255,.58)"
  field-fill: "rgba(255,255,255,.76)"
  popover: "rgba(250,253,255,.94)"
typography:
  display:
    fontFamily: "Geist, Geist Variable, Segoe UI, sans-serif"
    fontSize: "clamp(2.7rem, 5vw, 4.1rem)"
    fontWeight: 780
    lineHeight: 0.96
    letterSpacing: "-0.04em"
  headline:
    fontFamily: "Geist, Geist Variable, Segoe UI, sans-serif"
    fontSize: "clamp(1.85rem, 3vw, 2.4rem)"
    fontWeight: 760
    lineHeight: 1.05
    letterSpacing: "-0.035em"
  title:
    fontFamily: "Geist, Geist Variable, Segoe UI, sans-serif"
    fontSize: "1.08rem"
    fontWeight: 720
    lineHeight: 1.2
    letterSpacing: "-0.02em"
  body:
    fontFamily: "Geist, Geist Variable, Segoe UI, sans-serif"
    fontSize: "0.86rem"
    fontWeight: 400
    lineHeight: 1.55
  label:
    fontFamily: "Geist, Geist Variable, Segoe UI, sans-serif"
    fontSize: "0.68rem"
    fontWeight: 700
    lineHeight: 1.4
    letterSpacing: "0.055em"
rounded:
  action: "0.58rem"
  control: "0.65rem"
  tile: "0.72rem"
  panel: "0.9rem"
  shell: "0.95rem"
  pill: "999px"
spacing:
  xs: "0.45rem"
  sm: "0.65rem"
  md: "0.85rem"
  lg: "1.2rem"
  xl: "1.75rem"
  2xl: "3rem"
components:
  button-primary:
    backgroundColor: "{colors.brand-blue}"
    textColor: "#ffffff"
    typography: "{typography.body}"
    rounded: "{rounded.action}"
    padding: "0.72rem 0.9rem"
    height: "2.75rem"
  button-secondary:
    backgroundColor: "{colors.glass-strong}"
    textColor: "{colors.brand-ink}"
    typography: "{typography.body}"
    rounded: "{rounded.action}"
    padding: "0.72rem 0.9rem"
    height: "2.55rem"
  input:
    backgroundColor: "{colors.field-fill}"
    textColor: "{colors.brand-ink}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "0.7rem 0.78rem"
    height: "2.65rem"
  nav-active:
    backgroundColor: "{colors.brand-blue}"
    textColor: "#ffffff"
    typography: "{typography.body}"
    rounded: "{rounded.tile}"
    padding: "0.72rem 0.86rem"
    height: "2.75rem"
  card:
    backgroundColor: "{colors.glass}"
    textColor: "{colors.brand-ink}"
    rounded: "{rounded.panel}"
    padding: "1rem"
  chip:
    backgroundColor: "{colors.glass-strong}"
    textColor: "{colors.brand-muted}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "0.25rem 0.625rem"
---

# Design System: Agua ReNew · Captación de leads

## Overview

**Creative North Star: "Agua en operación"**

El sistema lleva la identidad acuática de Agua ReNew a una herramienta de trabajo diario: un ambiente azul hielo sereno, con capas translúcidas que organizan sin volver etérea la información. Los reflejos suaves y el movimiento lento sugieren agua; la jerarquía, el contraste y la densidad siguen siendo los de un panel operativo.

La marca oficial abre la experiencia y orienta la navegación. Geist mantiene una voz única, moderna y directa. Azul conduce la acción, verde confirma progreso y rojo reserva su intensidad para riesgo o destrucción. En escritorio, el vidrio crea continuidad entre sidebar, indicadores, bandeja y conversación; en móvil, la estructura se recompone en objetivos táctiles y tarjetas legibles.

**Key Characteristics:**

- Fondo azul hielo con iluminación radial, nunca blanco plano como mundo completo.
- Vidrio legible: translucidez moderada, borde luminoso e interior suficientemente opaco.
- Azul para dirección, verde para confirmación y rojo para peligro.
- Geist en toda la jerarquía, con titulares compactos y cifras tabulares.
- Movimiento acuático discreto, breve en la interfaz y anulable con reducción de movimiento.
- Logo y gota oficiales como anclas de marca; iconografía lineal de apoyo.

## Colors

La paleta combina azules de marca saturados con un campo de hielo claro y vidrio blanco; verde y rojo conservan una función semántica estricta.

### Primary

- **Azul ReNew:** La voz de acción principal, navegación activa, selección y enlaces que avanzan el flujo.
- **Azul Flujo:** Refuerza foco, acciones prioritarias y el extremo luminoso de gradientes de CTA.
- **Azul Agua Clara:** Aparece en ondas, reflejos, estados ambientales y acentos de profundidad.

### Secondary

- **Verde Confirmación:** Comunica sistema activo, avance correcto y estados comerciales positivos.
- **Verde Confirmación Profunda:** Sostiene texto semántico verde y estados que necesitan contraste adicional.

### Neutral

- **Tinta ReNew:** Color de titulares, cifras clave y texto de máxima jerarquía.
- **Azul Muted:** Texto secundario, ayudas y metadatos operativos.
- **Hielo Inicial, Medio y Profundo:** Construyen el degradado ambiental y separan zonas sin cortes duros.
- **Vidrio y Vidrio Fuerte:** Capas translúcidas para controles, paneles y superficies que deben conservar el contexto acuático.
- **Borde de Vidrio:** Trazo luminoso interior; no funciona como una rejilla oscura.
- **Relleno de Campo:** Base casi opaca para entradas y filtros, donde la lectura prima sobre el efecto.
- **Popover:** Capa de alta opacidad para menús flotantes.
- **Rojo Riesgo:** Exclusivo para errores, cierre y eliminación.

### Named Rules

**The Semantic Current Rule.** Azul dirige, verde confirma y rojo alerta; ningún estado depende solo del color y siempre conserva una etiqueta textual.

**The Ice Field Rule.** El mundo visual completo permanece azul hielo; el blanco aparece como material translúcido dentro de ese campo, no como fondo general desconectado.

## Typography

**Display Font:** Geist (con Geist Variable, Segoe UI y sans-serif como respaldo)  
**Body Font:** Geist (con Geist Variable, Segoe UI y sans-serif como respaldo)

**Character:** Una sola familia sostiene marca y operación. Los pesos altos, la compresión óptica y el espaciado negativo dan autoridad a titulares y métricas; cuerpo y metadatos permanecen tranquilos y compactos.

### Hierarchy

- **Display** (780, `clamp(2.7rem, 5vw, 4.1rem)`, 0.96): reservado al mensaje de acceso y expresiones de marca de primera vista.
- **Headline** (760, `clamp(1.85rem, 3vw, 2.4rem)`, 1.05): título principal de cada superficie operativa.
- **Title** (720, `1.08rem`, 1.2): encabezados de bandeja, panel y grupos de controles.
- **Body** (400–600, `0.86rem`, 1.55): copy funcional, valores de tabla, ayudas y acciones; el texto explicativo se mantiene alrededor de 60 caracteres por línea.
- **Label** (700, `0.68rem`, `0.055em`, mayúsculas): indicadores, encabezados de tabla y metadatos breves.

### Named Rules

**The One Geist Rule.** No se introduce una segunda familia tipográfica para dramatizar una pantalla; la jerarquía nace de peso, tamaño, espaciado y color.

**The Operational Label Rule.** Las mayúsculas se reservan para etiquetas cortas y escaneables, nunca para párrafos, instrucciones o acciones completas.

## Layout

La aplicación opera sobre una retícula flexible con sidebar fija de `13.5rem` a partir de 1024 px y un lienzo central de hasta `94rem`. El ritmo recurrente usa separaciones compactas de `0.85rem`; paneles y controles se agrupan antes de añadir espacio exterior. La primera vista sigue una secuencia estable: contexto y sincronización, cuatro indicadores, control operativo y superficie principal de prospectos con conversación contextual.

Los indicadores pasan de cuatro a dos columnas a 1180 px. Por debajo de 1024 px, la sidebar se convierte en drawer y aparece un header móvil. A 700 px, los controles alcanzan al menos 44 px, las métricas se mantienen en dos columnas y el ledger se transforma en tarjetas de dos columnas con etiquetas visibles. A 430 px se activa la composición compacta —encabezado, acciones, métricas, filtros y tarjetas reducen aire sin perder jerarquía—; a 350 px, acciones y filtros se apilan en una sola columna como fallback. La información no depende de desplazamiento horizontal en móvil.

**The Context Stays Close Rule.** La acción siguiente, el estado y la conversación permanecen en el mismo espacio de trabajo; los paneles se redistribuyen antes de ocultar contexto esencial.

**The Mobile Card Rule.** Una tabla operativa se reexpresa como tarjetas etiquetadas en móvil; no se reduce hasta volverla ilegible ni se delega su uso a scroll horizontal.

## Elevation & Depth

La profundidad es híbrida: gradientes tonales establecen el ambiente y sombras azules muy difusas separan las superficies. El vidrio combina blur, saturación, un borde interior blanco y un reflejo superior. Una caústica ambiental recorre el campo en 14 s y las mareas internas de los KPI respiran en 7 s; ambas son lentas, decorativas y prescindibles. Los popovers reciben una elevación más marcada; controles en reposo usan solo luz interior. Cuando `backdrop-filter` no está disponible, las superficies cambian a un hielo casi opaco.

### Shadow Vocabulary

- **Panel acuático** (`0 24px 46px -34px rgba(0,80,164,.56), inset 0 0 0 1px rgba(255,255,255,.64), inset 0 1px 0 rgba(255,255,255,.96)`): tarjetas, indicadores y panel de conversación.
- **Control tranquilo** (`0 12px 24px -22px rgba(0,80,164,.48), inset 0 1px 0 rgba(255,255,255,.72)`): controles y superficies de menor jerarquía.
- **Acción azul** (`0 12px 24px -14px rgba(0,102,204,.7), inset 0 1px rgba(255,255,255,.22)`): CTA primario y navegación activa.
- **Popover** (`0 18px 38px -22px rgba(0,70,145,.45), inset 0 1px #fff`): listas flotantes y menús.

### Named Rules

**The Legible Glass Rule.** El vidrio nunca sacrifica contraste: campos y popovers aumentan opacidad, y toda superficie con blur tiene un fallback casi opaco.

**The Soft Reflection Rule.** La elevación se lee como luz húmeda y difusa; no usa sombras negras duras ni desplazamientos rígidos.

## Shapes

La forma es redondeada pero contenida. Acciones compactas usan esquinas de `0.58rem`, controles `0.65rem`, tarjetas internas `0.72rem` y paneles `0.9rem`; círculos y píldoras se reservan para la gota, indicadores puntuales, avatares y estados. Los bordes son claros y de baja opacidad. Ondas amplias y elípticas aparecen como reflejos internos, nunca como contenedores caprichosos para datos.

**The Nested Radius Rule.** El radio crece con la escala del contenedor: control, tile y panel forman una progresión visible y consistente.

## Components

### Buttons

- **Shape:** Compacta y suavemente redondeada; mínimo táctil de 44 px en móvil.
- **Primary:** Gradiente azul horizontal, texto blanco, peso semibold y sombra azul ambiental. La acción que hace avanzar el flujo recibe esta jerarquía.
- **Hover / Focus:** En dispositivos precisos, las acciones suben 2 px durante 140–160 ms, refuerzan sombra y desplazan su icono según la acción; la primaria conserva un reflejo acuático único de 550 ms. El foco permanece azul y visible; al activar, la respuesta es breve y física.
- **Secondary / Ghost / Danger:** El secundario usa vidrio fuerte; ghost pierde borde; danger conserva rojo con fondo sutil hasta la confirmación armada.

### Chips

- **Style:** Píldoras pequeñas con relleno tonal y texto semibold; canal usa hielo neutro, teléfono usa azul y bloqueo usa rojo.
- **State:** Los estados positivos usan verde con texto de alto contraste; cada chip conserva un nombre legible.

### Cards / Containers

- **Corner Style:** Panel suavemente curvo (`0.9rem`) y tiles internos (`0.72rem`).
- **Background:** Vidrio con gradiente blanco-azul, reflejo radial en la esquina superior y opacidad ajustada a la densidad del contenido.
- **Shadow Strategy:** Panel acuático para superficies principales; luz interior para controles agrupados.
- **Border:** Borde exterior mínimo o inexistente; el contorno nace del inset blanco y del contraste tonal.
- **Internal Padding:** `1rem` en tablas e indicadores; más aire en acceso y shells de formulario.
- **Motion:** La entrada general dura 180 ms. En la primera carga, una única gota central muestra llenado y onda concéntrica antes de revelar el panel; los KPI combinan una entrada de 280 ms con conteo numérico de 260 ms. Con puntero preciso, la card se eleva 1 px, la franja líquida inferior sube y cambia de inclinación durante 280 ms, y un reflejo radial la atraviesa con una transición de 240–280 ms; una onda de 240 ms nace en el punto de entrada. No existe marea continua en reposo y el movimiento reducido conserva solo el cambio de opacidad.

### Inputs / Fields

- **Style:** Relleno de campo casi opaco, trazo azul grisáceo y radio de control (`0.65rem`).
- **Focus:** Borde Azul Flujo y halo translúcido de 3–4 px; placeholder secundario pero legible.
- **Error / Disabled:** Error textual rojo junto al campo; disabled reduce opacidad sin retirar la etiqueta ni el contexto.

### Navigation

La sidebar usa logo oficial, enlaces de 44 px y una única opción activa con gradiente azul. Burbujas delineadas ascienden lentamente en el espacio libre como firma ambiental de la caja, sin cruzar controles. El contexto de captación y un dock de sesión cierran la columna. El dock organiza identidad y presencia en su primer nivel —avatar, rol, equipo y estado conectado— y reserva un segundo nivel completo para cerrar sesión, sin comprimir la acción junto al nombre. Bajo 1024 px, la navegación entra como drawer de 220 ms sobre un scrim azul desenfocado; el botón de menú y el estado del sistema permanecen en el header.

### Data Table and Mobile Lead Cards

El ledger usa cinco columnas estables —Prospecto, Entrada, Oportunidad, Avance y Acciones— con encabezados compactos en mayúsculas y cifras tabulares. Prospecto agrupa avatar, nombre y canal; Oportunidad reúne producto, modalidad y solo muestra el tipo cuando es excepcional; Avance combina estado y disponibilidad de WhatsApp para evitar duplicar información. La lista muestra 12 registros por bloque en escritorio dentro de una superficie de altura acotada y conserva el encabezado sticky. En móvil inicia con 8 registros, ofrece ordenamiento visible y carga progresiva; cada fila pasa a una tarjeta de dos columnas con cabecera compacta, avance horizontal y acciones de 44 px colocadas lado a lado. Los valores vacíos no consumen espacio ni generan una banda adicional.

### Conversation Panel

El panel contextual comparte el material de vidrio, usa mensajes entrantes claros y salientes en gradiente azul, y mantiene acciones, compositor, ficha y eventos en una columna. Su apertura ensancha el contexto sin abandonar la bandeja en escritorio y se apila debajo de ella en móvil.

## Do's and Don'ts

### Do:

- **Do** mantener el campo azul hielo visible entre superficies para que el sistema se sienta continuo y acuático.
- **Do** usar vidrio más opaco en tablas, campos, menús y cualquier zona de lectura densa.
- **Do** acompañar color semántico con texto, etiqueta o estado explícito.
- **Do** preservar objetivos táctiles de al menos 44 px, foco visible y navegación por teclado.
- **Do** transformar el ledger en tarjetas etiquetadas antes de introducir desplazamiento horizontal móvil.
- **Do** desactivar caústica, burbujas, gota de carga, mareas, conteos, entradas escalonadas, giro de sincronización, skeletons y reflejos cuando se solicita reducción de movimiento.

### Don't:

- **Don't** usar blanco plano como mundo completo ni paneles grises ajenos al campo de hielo.
- **Don't** acumular reflejos animados: un solo sheen breve pertenece a la acción primaria; los orbes ambientales se mueven lentamente.
- **Don't** aplicar verde a acciones neutrales o rojo a decoración; su rareza conserva el significado.
- **Don't** usar sombras negras duras, bordes oscuros o blur con transparencia insuficiente.
- **Don't** sustituir el logo oficial por texto recreado, monogramas o iconos genéricos.
- **Don't** introducir otra familia tipográfica, titulares editoriales serif ni mayúsculas extensas.
