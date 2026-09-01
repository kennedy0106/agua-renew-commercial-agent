# Guía maestra de diseño — Agua Renew

Versión 1.0 · Septiembre de 2026

Esta guía define cómo debe verse, sentirse y comportarse cualquier producto digital de Agua Renew: caja, inventario, pedidos, reparto, clientes, reportes, administración o futuros módulos internos.

Su objetivo no es clonar una pantalla. Es conservar una identidad coherente mientras cada sistema resuelve tareas distintas. Para la implementación actual, [`frontend/src/index.css`](frontend/src/index.css) es la fuente técnica vigente y [`DESIGN.md`](DESIGN.md) contiene los tokens portables. Cuando exista una discrepancia, se usa este orden de autoridad:

1. Accesibilidad, seguridad y claridad de la tarea.
2. Tokens y estilos que estén activos en producción.
3. Esta guía maestra.
4. Ejemplos visuales o prototipos antiguos.

---

## 1. Esencia del sistema

### Concepto rector

**Agua en operación.**

La interfaz combina la claridad del agua, la energía de Renew y la precisión de una herramienta de trabajo. El resultado debe sentirse luminoso, confiable, ágil y propio de la marca; nunca como una plantilla SaaS genérica.

### Principios

- **La tarea va primero.** La marca acompaña y orienta; no compite con el trabajo.
- **El agua es material, no adorno.** Aparece en transparencias, reflejos, profundidad y movimiento calmado.
- **El color tiene una función.** Azul dirige, verde confirma o representa entrada, rojo advierte o representa salida.
- **Los números se entienden de inmediato.** Montos, totales y variaciones tienen jerarquía y alineación consistente.
- **La interfaz habla como el equipo.** Español claro, directo y local; moneda S/ y fechas en zona horaria de Lima.
- **Todo estado tiene respuesta.** Carga, vacío, error, éxito, deshabilitado y falta de permisos se diseñan, no se improvisan.

### Señales de reconocimiento

Un sistema se reconoce como Agua Renew cuando reúne estas señales:

- Fondo claro de azul hielo con profundidad acuática suave.
- Superficies blancas translúcidas y legibles.
- Logo Renew visible en el acceso y en la navegación principal.
- Azul, verde y rojo usados de manera semántica.
- Tipografía Geist, cifras tabulares y radios contenidos.
- Movimiento fluido, breve y respetuoso de las preferencias del usuario.

No pertenecen al sistema: neumorfismo, sombras negras duras, tarjetas blancas opacas por toda la pantalla, degradados de texto, estética oscura como modo principal, botones tipo cápsula en exceso o una segunda tipografía decorativa.

---

## 2. Identidad y uso del logo

### Marca principal

Usar el wordmark oficial en SVG:

- **RE** en verde Renew.
- **NEW** en azul Agua.
- **AGUA** como descriptor integrado cuando la versión del recurso lo incluya.

Recursos actuales:

- `frontend/public/logo-renew.svg`: wordmark principal.
- `frontend/public/logo-gotita.svg`: isotipo de gota.
- `frontend/public/favicon.ico` y variantes: navegador y accesos directos.

### Tamaños recomendados

| Contexto | Ancho recomendado | Regla |
|---|---:|---|
| Sidebar desktop | 9.6rem | No competir con la navegación |
| Header móvil | 6.75rem | Alto máximo 2rem |
| Login / acceso | 10–11.5rem | Debe ser el ancla de marca |
| Isotipo de gota | 1–3rem | Loader, sello o apoyo visual |

### Área de protección

Mantener alrededor del logo un espacio mínimo equivalente a la altura de la letra **R**. No pegarlo a bordes, divisores, botones o títulos.

### Usos correctos

- Sobre superficies claras, usar el logo a color.
- Sobre superficies azules saturadas, usar la variante preparada para fondo oscuro.
- Mantener proporción y nitidez; preferir SVG.
- Usar la gota sola únicamente cuando el wordmark ya esté presente o el espacio sea extremadamente reducido.

### Usos prohibidos

- Cambiar el orden o los colores de RE/NEW.
- Aplicar sombras fuertes, contornos, bisel o resplandor al logo.
- Encerrarlo en un rectángulo blanco sin necesidad.
- Estirarlo, inclinarlo o animarlo en bucle.
- Usar la gota como reemplazo permanente del nombre en pantallas de acceso.

---

## 3. Color

### Paleta principal

| Token | Valor | Función |
|---|---|---|
| `--brand-blue` | `#0066CC` | CTA primario, navegación activa, enlaces y selección |
| `--brand-blue-bright` | `#007BFF` | Foco, iconografía activa y acento azul intenso |
| `--brand-blue-soft` | `#67C3F3` | Agua ambiental, halos, gráficas secundarias |
| `--brand-green` | `#00C853` | Marca, confirmación positiva y brillo ambiental |
| `--brand-green-deep` | `#00A047` | Ingreso, saldo sano y valores positivos |
| `--brand-ink` | `#154399` | Títulos y texto principal sobre vidrio |
| `--brand-muted` | `#3F5F86` | Ayuda, metadata, fechas y texto secundario |
| `--expense` | `#B42318` | Egreso, error, peligro y acción destructiva |

### Neutros y superficies

| Token | Valor | Función |
|---|---|---|
| `--ice-start` | `#E8F0FE` | Inicio del fondo |
| `--ice-mid` | `#D0E3FF` | Centro del fondo |
| `--ice-end` | `#C5E8F4` | Cierre del fondo |
| `--glass` | `rgba(255,255,255,.38)` | Panel estándar |
| `--glass-strong` | `rgba(255,255,255,.55)` | Panel de mayor contraste |
| `--glass-border` | `rgba(255,255,255,.22)` | Separación óptica sutil |
| `--field-fill` | `rgba(255,255,255,.72)` | Campos y controles |
| `--popover` | `rgba(255,255,255,.86)` | Menús, calendarios y overlays ligeros |

### Regla semántica

- **Azul:** acción, navegación, información neutra seleccionada.
- **Verde:** entrada de dinero, éxito, disponibilidad y marca.
- **Rojo:** salida de dinero, error, bloqueo, eliminación o anulación.
- **Azul suave:** ambiente y datos auxiliares; nunca texto pequeño.
- **Ink / muted:** contenido; no usar gris neutro ajeno a la paleta sobre superficies azules.

No usar únicamente el color para comunicar un estado. Acompañar con texto, icono, signo o posición. Por ejemplo: `− S/ 35.00 · Egreso`, no solo un monto rojo.

### Fondo base

```css
body {
  color: var(--brand-ink);
  background:
    radial-gradient(circle at 12% 8%,
      color-mix(in srgb, var(--brand-blue-soft) 38%, transparent),
      transparent 42%),
    radial-gradient(circle at 88% 18%,
      color-mix(in srgb, var(--brand-green) 16%, transparent),
      transparent 46%),
    linear-gradient(160deg, #e8f0fe 0%, #d0e3ff 52%, #c5e8f4 100%);
}
```

### Contraste

- Texto normal: mínimo 4.5:1.
- Texto grande: mínimo 3:1.
- Si el fondo acuático reduce la lectura, aumentar primero la opacidad del panel, no oscurecer todo el sistema.
- El placeholder debe seguir siendo legible; no puede ser la única etiqueta del campo.

---

## 4. Tipografía

### Familia

```css
font-family: "Geist Variable", "Segoe UI", "Trebuchet MS", sans-serif;
```

**Geist Variable** es la única familia de interfaz. No mezclar con Inter, Poppins, Montserrat ni una serif para “dar personalidad”. La identidad proviene de la composición, el color y el material.

### Escala tipográfica

| Rol | Tamaño | Peso | Interlineado | Tracking |
|---|---:|---:|---:|---:|
| Título de acceso | 2.3rem | 720 | 1.05 | −0.035em |
| Título de página | `clamp(1.85rem, 3vw, 2.4rem)` | 740 | 1.05 | −0.035em |
| Título de panel | 1.05–1.2rem | 700–740 | 1.2 | −0.025em |
| Título de formulario | 1.7rem | 720 | 1.12 | −0.03em |
| Cuerpo | 0.9rem | 400–650 | 1.45–1.55 | normal |
| Texto auxiliar | 0.72–0.8rem | 450–650 | 1.4 | normal |
| Label operativo | 0.7–0.72rem | 700–760 | 1.2 | 0.055–0.06em |
| Monto principal | `clamp(2.4rem, 5vw, 4.2rem)` | 760 | 0.98 | −0.04em máx. |

### Reglas de texto

- Máximo recomendado para lectura continua: 65–75 caracteres por línea.
- Títulos: frase natural, no todo en mayúsculas.
- Labels breves: mayúsculas permitidas para campos y KPI.
- Montos: `font-variant-numeric: tabular-nums`.
- Moneda: `S/ 1,250.00`, locale `es-PE`.
- Fechas: español, zona `America/Lima`.
- Truncar solo cuando el dato completo pueda consultarse por otro medio.

---

## 5. Espaciado, formas y profundidad

### Escala de espaciado

Usar múltiplos consistentes, no valores arbitrarios:

| Token | Valor | Uso frecuente |
|---|---:|---|
| `xs` | 0.45rem | Icono–texto, ayudas compactas |
| `sm` | 0.65rem | Controles relacionados |
| `md` | 0.85rem | Filas, tarjetas compactas |
| `lg` | 1.1rem | Grupos de formulario |
| `xl` | 1.5rem | Separación entre bloques |
| `2xl` | 1.75rem | Padding de workspace desktop |

Regla de ritmo: poco espacio dentro de un grupo, más espacio entre grupos y más espacio antes de un título que después de él.

### Radios

| Elemento | Radio |
|---|---:|
| Input y control compacto | 0.35–0.55rem |
| Botón principal | 0.5–0.7rem |
| Fila / tile | 0.65–0.75rem |
| Panel | 0.85–0.95rem |
| Avatar, gota o punto | 999px |

Las cápsulas se reservan para estados pequeños o elementos realmente circulares. No usar `rounded-full` en CTA, navegación o filtros grandes.

### Material glass

```css
.renew-panel {
  border: 1px solid rgba(255, 255, 255, 0.22);
  border-radius: 0.85rem;
  background: rgba(255, 255, 255, 0.47);
  backdrop-filter: blur(28px) saturate(165%);
  box-shadow:
    0 16px 32px -27px rgba(0, 102, 204, 0.5),
    inset 0 1px 0 rgba(255, 255, 255, 0.75);
}
```

El vidrio siempre tiene una razón: separar información sin perder el ambiente acuático. Evitar panel dentro de panel cuando bastan espaciado o un divisor.

### Fallback de rendimiento

En móvil o punteros gruesos, se permite retirar `backdrop-filter` y reemplazarlo por un degradado opaco claro. La identidad debe sobrevivir sin depender del blur.

---

## 6. Iconografía e imágenes

### Iconos

- Usar una sola familia de iconos lineales, actualmente Lucide.
- Stroke recomendado: 1.7–1.9.
- Tamaño común: 16–20px; acciones táctiles mantienen un área mínima de 44×44px.
- El icono acompaña al texto; no sustituye etiquetas críticas.
- No usar emoji ni caracteres Unicode como iconos de producto.

### Fotografía y producto

- Productos: `object-fit: contain` sobre fondo blanco.
- Mantener relación 1:1 para catálogo.
- No recortar bidones, botellas ni accesorios con `cover`.
- Las imágenes deben tener fondo limpio, resolución suficiente y color consistente.
- Vouchers y comprobantes usan vista previa completa; abrir en lightbox para inspección.

### Agua ambiental

Usar una fotografía o textura real cuando el agua sea protagonista, especialmente en login. Para el resto del producto, preferir gradientes, transparencias y reflejos abstractos que no interfieran con datos.

---

## 7. Estructura de la aplicación

### Shell autenticado

#### Desktop, desde 1024px

- Sidebar fija de **13.5rem**.
- Workspace con `margin-left: 13.5rem`.
- Logo a 9.6rem.
- Navegación compacta y perfil al pie.
- Contenido con padding de 1.75rem.
- Ancho de cada pantalla según tarea; dashboard hasta 92–94rem.

#### Tablet y móvil

- Header superior compacto.
- Sidebar como drawer de `min(18rem, 86vw)`.
- Transición del drawer: 220ms.
- Cerrar con scrim, botón explícito, tecla Escape y navegación.
- Bloquear scroll de fondo mientras el drawer esté abierto.
- Respetar `env(safe-area-inset-bottom)` en acciones fijas.

### Navegación

- Alto mínimo de enlace: 2.5–2.85rem.
- Icono + etiqueta siempre visible en desktop.
- Activo: vidrio más fuerte, azul de marca y peso 700.
- Hover solo en dispositivos con puntero fino.
- Mostrar rutas por rol; no enseñar acciones que el usuario nunca podrá ejecutar.
- “Salir” es destructivo y vive separado al final del perfil.

### Encabezado de página

Cada pantalla tiene:

1. Título claro y específico.
2. Una línea de contexto opcional.
3. Una acción primaria como máximo.
4. Acento corto verde→azul bajo el encabezado cuando corresponda.

Evitar encabezados con buscador, campana, avatar y métricas si la tarea no los necesita.

---

## 8. Recetas de layout

### Resumen / dashboard

Orden recomendado:

1. Encabezado y acción principal.
2. Entidades operativas más importantes: cuentas, pedidos, rutas o inventario.
3. KPI del periodo.
4. Análisis y desglose.
5. Actividad reciente.

Breakpoints orientativos:

- Más de 1180px: composición completa.
- 861–1180px: grillas a dos columnas.
- Hasta 860px: análisis apilado.
- Hasta 640px: entidades en una columna; KPI pueden conservar dos si siguen legibles.
- Hasta 390px: una sola columna.

### Crear o editar

Desktop:

```text
┌──────────────────────── formulario ───────────────────────┬── resumen 20rem ──┐
│ campos principales, catálogo, voucher y observaciones     │ monto + CTA        │
└────────────────────────────────────────────────────────────┴───────────────────┘
```

- El resumen es sticky en desktop.
- En tablet/móvil, todo pasa a una columna.
- En móvil, la acción final puede ir en una barra inferior glass si no cubre contenido.
- Un flujo debe poder recuperarse: conservar borrador y explicar cómo reanudarlo cuando aplique.

### Listado

- Filtros primero, tabla o lista después.
- Filtros comunes en una fila cuando haya espacio.
- Montos alineados a la derecha.
- Acciones secundarias al final de la fila.
- En móvil, priorizar los datos esenciales; convertir en lista estructurada si la tabla deja de ser legible.

### Detalle

- Identidad y estado arriba.
- Monto o dato principal destacado con semántica.
- Atributos agrupados por significado, no por disponibilidad técnica.
- Historial y auditoría al final.
- Acciones peligrosas separadas y confirmadas.

---

## 9. Componentes

### Botón primario

- Fondo `#0066CC` o degradado sutil `#1A8CFF → #0066CC`.
- Texto blanco, peso 650–700.
- Alto estándar 2.75rem; login 3.125rem.
- Radio 0.5–0.7rem.
- Hover: `translateY(-1px)` y sheen de una pasada.
- Active: `scale(.97)` solo si no afecta estabilidad.
- Disabled: menor opacidad, cursor `not-allowed`, sin animación.
- Loading: conserva ancho, muestra gota o spinner y cambia el texto si ayuda.

Una vista tiene una sola acción primaria. Las demás son outline, ghost o destructivas según la función.

### Botón secundario

- Fondo blanco translúcido.
- Borde azul muy suave.
- Texto azul o ink.
- No debe competir en saturación con el CTA.

### Acción destructiva

- Rojo `#B42318`.
- Requiere verbo específico: “Anular movimiento”, “Eliminar usuario”.
- Confirmación con consecuencia y recuperación cuando exista.
- Nunca usar “Aceptar” como etiqueta destructiva.

### Campos

- Alto mínimo 2.75rem; login 3.65rem.
- Fondo blanco al 72% o blanco sólido sobre login.
- Radio 0.35–0.55rem; login 0.75rem.
- Label persistente arriba.
- Help y error debajo sin mover abruptamente el resto del formulario.
- Foco visible de 2px; no depender de placeholder.
- `aria-invalid` y mensaje asociado en errores.

### Chips

Para opciones cortas y mutuamente excluyentes:

- Alto mínimo 2.55–2.75rem.
- Seleccionado: relleno sólido y texto blanco.
- Azul para elección neutra, verde para ingreso, rojo para egreso.
- Estado seleccionado también debe identificarse mediante `aria-checked` o `aria-pressed`.

### Select y autocompletado

- Trigger con la misma altura y material de un campo.
- Menú en `--popover`, blur 22–28px y radio 0.75–1rem.
- Apertura: fade + escala desde 0.98 en 180–200ms.
- Navegación completa con teclado.
- Usar búsqueda cuando existan más de 8–10 opciones o nombres similares.

### Fecha

- Locale `es-PE`; semana `Lu Ma Mi Ju Vi Sá Do`.
- Zona `America/Lima`.
- Día elegido: azul sólido.
- Hoy: anillo interior.
- Fechas fuera del rango: deshabilitadas y explicables.
- Para operaciones, no permitir fechas futuras si el negocio no las admite.

### Tarjetas

- La tarjeta representa una entidad o decisión, no sirve como relleno visual.
- Radio 0.7–0.95rem.
- Hover máximo −1 o −2px.
- Evitar tarjetas anidadas; usar filas o separadores internos.
- Las tarjetas clicables deben ser accesibles por teclado y tener un único destino claro.

### Tabla

- Header con fondo translúcido suave.
- Sin zebra agresiva.
- Hover de fila discreto.
- Números tabulares y alineados.
- Header sticky solo cuando aporta orientación real.
- Loading con skeleton que conserva columnas.
- Vacío con explicación y acción útil.

### Estados y badges

- Verde: activo, aprobado, completado.
- Azul: pendiente neutro, informativo o en proceso.
- Rojo: rechazado, anulado, error.
- Incluir texto; no mostrar únicamente un punto de color.
- Las cápsulas sí se permiten aquí por ser elementos pequeños.

### Diálogos

Usar modal solo si la tarea necesita interrupción o foco protegido: confirmar anulación, revisar un cambio sensible, inspeccionar un voucher. No trasladar formularios largos a un modal.

### Toasts

- Éxito: indicar qué se guardó.
- Error: explicar qué falló y qué hacer.
- No reemplazar errores de campo con un toast.
- Evitar mensajes vagos como “Ocurrió un error”.

---

## 10. Login y autenticación

El acceso es la presentación de marca más expresiva del sistema, pero debe seguir siendo rápido y sobrio.

### Composición

#### Desktop, desde 1024px

- Contenedor máximo: 63rem.
- Dos columnas iguales con gap de 1.5rem.
- Altura de referencia: 39.5rem.
- Izquierda: relato de marca y beneficios operativos.
- Derecha: formulario de acceso.

#### Móvil y tablet

- Ocultar el panel narrativo.
- Mantener el formulario centrado, con márgenes de 1rem como mínimo.
- Conservar el fondo acuático con menor opacidad y sin animación costosa en equipos limitados.

### Panel de marca

- Fondo `rgba(247,252,255,.52)`.
- Blur 26px, saturación 165%.
- Radio 0.95rem.
- Título corto, una explicación y hasta tres beneficios reales.
- Usar iconos lineales: operación, hora Lima, seguridad o almacenamiento.
- Cerrar con el mensaje de marca aprobado; no inventar claims comerciales.

### Tarjeta de acceso

- Fondo `rgba(255,255,255,.90)`.
- Blur 28px, saturación 160%.
- Radio 0.95rem.
- Título “Iniciar sesión”.
- Campos de usuario y contraseña con autocomplete correcto.
- Botón “Ingresar al sistema”.
- Control mostrar/ocultar contraseña con etiqueta accesible dinámica.
- Mensaje de error dentro del formulario, cerca de los campos.

### Estados de autenticación

- **Enviando:** bloquear doble envío, conservar el texto o mostrar “Ingresando…”.
- **Credenciales inválidas:** “Usuario o contraseña incorrectos. Revisa los datos e inténtalo nuevamente.”
- **Sin conexión:** indicar que no se pudo contactar el servicio y permitir reintentar.
- **Sesión expirada:** explicar que debe volver a ingresar; conservar el destino solicitado cuando sea seguro.
- **Cuenta bloqueada o sin permiso:** no sugerir que la contraseña está mal; derivar al administrador.

### Seguridad y UX

- `autocomplete="username"` y `autocomplete="current-password"`.
- Nunca deshabilitar pegar en contraseña.
- No revelar si un usuario específico existe.
- No guardar credenciales en almacenamiento inseguro.
- El foco inicial puede ir al usuario; tras error, mover el foco al resumen del error si mejora la recuperación.

---

## 11. Movimiento y microinteracciones

### Personalidad

El movimiento de Renew se siente como agua contenida: suave, continuo y con poca amplitud. Nunca rebota, parpadea ni distrae de una operación.

### Curvas

```css
--ease-out: cubic-bezier(.23, 1, .32, 1);
--ease-in-out: cubic-bezier(.65, 0, .35, 1);
--ease-drawer: cubic-bezier(.32, .72, 0, 1);
```

### Tabla de motion

| Elemento | Duración | Comportamiento |
|---|---:|---|
| Hover de campo/chip | 160ms | Borde, fondo y color |
| Fila enlazable | 160–180ms | `translateX(2px)` |
| Panel o tarjeta | 180–300ms | `translateY(-1px/-2px)` |
| Select / popover | 180–200ms | Fade + escala 0.98→1 |
| Reveal condicional | 180–200ms | Opacidad y desplazamiento corto |
| Drawer móvil | 220ms | Entrada lateral |
| Entrada de página | 520ms máx. | 4px hacia arriba; una vez |
| Login | 420–560ms | Subida suave y enfoque |
| Sheen de CTA | 900ms, una vez por hover | Barrido horizontal |
| Orbes de fondo | 8s / 12s / 10s | Opacidad .45→.70 y escala 1.03 |
| Cáustico | 18s | Deriva mínima |
| Agua de login | 32s | Escala 1→1.07 y desplazamiento leve |

### Reglas

- Animar solo propiedades que refuercen estado, continuidad o material.
- Hover únicamente con `@media (hover: hover) and (pointer: fine)`.
- No usar `scale` mayor a 1.06 en controles.
- Sheen de botones: una pasada, nunca loop.
- No aplicar la misma entrada a cada bloque de una pantalla.
- Loading largo: usar skeleton o gota; no animaciones arcoíris.

### Movimiento reducido

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    scroll-behavior: auto !important;
  }

  .water-orbs__blob,
  .login-scene__water,
  .login-scene__caustic,
  .login-bubble,
  .water-action::before {
    animation: none !important;
  }
}
```

Además, retirar transformaciones de hover y conservar como máximo cambios breves de opacidad.

---

## 12. Datos, dinero y visualización

### Dinero

- Siempre mostrar `S/`.
- Usar dos decimales en transacciones y totales contables.
- Alinear importes a la derecha en tablas.
- Ingreso: signo positivo opcional + verde profundo.
- Egreso: signo menos + rojo.
- Total o saldo neutro: ink o azul; rojo si es negativo.
- Evitar abreviar importes sensibles sin ofrecer el valor completo.

### KPI

- Etiqueta breve.
- Valor protagonista.
- Contexto temporal visible: “hoy”, “últimos 7 días”, etc.
- Comparación solo si existe una base real y entendible.
- No usar un KPI como decoración si no ayuda a decidir o actuar.

### Gráficos

- Ingresos: verde profundo.
- Egresos: rojo.
- Neto o serie principal: azul.
- Datos secundarios: azul suave o muted.
- Leyenda y unidad visibles.
- Tooltip con fecha Lima y monto completo.
- Ofrecer resumen textual o tabla equivalente cuando la gráfica sea esencial.
- No usar 3D, sombras fuertes, doughnuts decorativos ni colores fuera de la paleta.

---

## 13. Estados de interfaz

### Loading

- Skeleton con la misma geometría del contenido final.
- Mantener estable el layout.
- Para una acción puntual, loader dentro del botón sin cambiar su ancho.
- Para una operación de más de unos segundos, explicar qué está ocurriendo.

### Vacío

Debe responder:

1. Qué falta.
2. Por qué importa.
3. Qué puede hacer el usuario ahora.

Ejemplo: “Aún no hay movimientos hoy. Registra el primer ingreso o egreso para comenzar el resumen.”

No usar borde dashed por defecto ni ilustraciones genéricas.

### Error

- Nombrar el problema.
- Indicar si los datos visibles pueden estar desactualizados.
- Ofrecer reintento cuando tenga sentido.
- No borrar información válida por un error parcial.
- Registrar detalles técnicos fuera de la UI, no mostrarlos al cajero.

### Éxito

- Confirmar el objeto y la acción: “Movimiento registrado”.
- Mantener el contexto o llevar al detalle útil.
- Evitar celebraciones exageradas para tareas frecuentes.

### Sin permiso

- Ocultar acciones imposibles cuando no aporten orientación.
- Si el usuario llega por URL, explicar que su rol no permite la acción.
- Ofrecer volver a un lugar útil; no mostrar una pantalla vacía.

---

## 14. Lenguaje y contenido

### Voz

Clara, directa, operativa y respetuosa. El sistema ayuda al equipo; no habla como un banco ni como una campaña publicitaria.

### Reglas

- Usar verbos concretos: “Registrar movimiento”, “Guardar cambios”, “Anular movimiento”.
- Preferir “Resumen” a “Dashboard”; “Cuentas” a “Funds”; “Comprobante” o “voucher” según el vocabulario del equipo.
- Evitar tecnicismos: token, endpoint, request, payload.
- La fecha y periodo deben estar explícitos.
- Confirmaciones describen impacto: “El saldo de la cuenta se actualizará”.
- Mantener consistencia: si se elige “Egreso”, no alternar con “Salida” sin una razón de dominio.

### Mensajes modelo

| Caso | Mensaje recomendado |
|---|---|
| Guardado | “Movimiento registrado correctamente.” |
| Error de campo | “Ingresa un monto mayor que S/ 0.00.” |
| Error de red | “No pudimos conectar con el sistema. Revisa tu conexión y vuelve a intentar.” |
| Sin resultados | “No encontramos movimientos con estos filtros.” |
| Acción sensible | “¿Anular este movimiento? El saldo de la cuenta será recalculado.” |

---

## 15. Accesibilidad

Todos los sistemas Agua Renew deben cumplir, como mínimo:

- Contraste WCAG AA.
- Navegación completa por teclado.
- Foco visible de 2px y `outline-offset` de 2px.
- Área táctil mínima de 44×44px para acciones.
- Labels asociados a sus campos.
- Errores vinculados con `aria-describedby` y `aria-invalid`.
- Diálogos con foco atrapado, Escape y retorno de foco.
- Iconos decorativos con `aria-hidden`.
- Botones de solo icono con `aria-label`.
- Tablas con headers semánticos.
- Movimiento reducido respetado.
- Zoom al 200% sin pérdida de funciones.
- No bloquear orientación ni tamaño de texto.

La accesibilidad tiene prioridad sobre la fidelidad visual. Si el vidrio o el movimiento perjudican lectura o rendimiento, se simplifican.

---

## 16. Responsive y rendimiento

### Breakpoints base

| Rango | Comportamiento |
|---|---|
| `< 390px` | Una columna, máxima simplificación |
| `390–639px` | Móvil, controles full-width cuando convenga |
| `640–860px` | Tablet pequeña, grillas de 2 columnas selectivas |
| `861–1023px` | Tablet, drawer y formularios apilados |
| `≥ 1024px` | Sidebar fija y layouts de trabajo |
| `≥ 1180px` | Dashboard y análisis completos |

### Reglas de rendimiento

- En móvil, ocultar orbes y desactivar blur continuo cuando el costo sea alto.
- Comprimir imágenes a WebP/AVIF cuando corresponda.
- Reservar dimensiones para evitar layout shift.
- No animar filtros grandes ni múltiples capas simultáneas.
- Usar skeletons acotados, no una animación distinta por elemento.
- Verificar con contenido real y listas largas.

---

## 17. Tokens de inicio

Este bloque sirve como base para un sistema nuevo. Luego debe centralizarse en el tema propio del proyecto.

```css
:root {
  --brand-blue: #0066cc;
  --brand-blue-bright: #007bff;
  --brand-blue-soft: #67c3f3;
  --brand-green: #00c853;
  --brand-green-deep: #00a047;
  --brand-ink: #154399;
  --brand-muted: #3f5f86;
  --expense: #b42318;
  --income: #00a047;

  --ice-start: #e8f0fe;
  --ice-mid: #d0e3ff;
  --ice-end: #c5e8f4;
  --glass: rgba(255, 255, 255, 0.38);
  --glass-strong: rgba(255, 255, 255, 0.55);
  --glass-border: rgba(255, 255, 255, 0.22);
  --field-fill: rgba(255, 255, 255, 0.72);
  --popover: rgba(255, 255, 255, 0.86);

  --radius-control: 0.35rem;
  --radius-button: 0.5rem;
  --radius-tile: 0.7rem;
  --radius-panel: 0.85rem;
  --radius-feature: 0.95rem;

  --space-xs: 0.45rem;
  --space-sm: 0.65rem;
  --space-md: 0.85rem;
  --space-lg: 1.1rem;
  --space-xl: 1.5rem;
  --space-2xl: 1.75rem;

  --ease-out: cubic-bezier(0.23, 1, 0.32, 1);
  --ease-in-out: cubic-bezier(0.65, 0, 0.35, 1);
  --ease-drawer: cubic-bezier(0.32, 0.72, 0, 1);

  font-family: "Geist Variable", "Segoe UI", "Trebuchet MS", sans-serif;
  color: var(--brand-ink);
}
```

---

## 18. Patrones que no deben copiarse

- Cards idénticas de icono + título + descripción como estructura de toda la página.
- Cards dentro de cards para cada grupo pequeño.
- Botones `rounded-full` como estilo predeterminado.
- Inputs sin label persistente.
- Select o date nativo con apariencia ajena al sistema cuando sea una interacción central.
- FAB que cubre filas, tablas o el CTA real.
- Dos o más CTA primarios en la misma vista.
- Inglés visible en navegación o estados.
- Texto en degradado.
- Sombras negras duras o halos sin profundidad.
- Animaciones en bucle sobre botones.
- Dark mode construido solo por invertir colores.
- Datos ficticios presentados como reales.
- Emoji como iconografía.
- Modales para formularios largos.
- Ocultar errores importantes únicamente en toast.

---

## 19. Checklist para un sistema nuevo

### Fundamentos

- [ ] Geist Variable cargada y fallback definido.
- [ ] Tokens de marca centralizados.
- [ ] Logo SVG correcto y favicon configurado.
- [ ] Fondo acuático claro y fallback sin blur.
- [ ] Moneda S/ y zona America/Lima.

### Shell

- [ ] Sidebar desktop de 13.5rem.
- [ ] Header y drawer móvil accesibles.
- [ ] Navegación filtrada por rol.
- [ ] Perfil y salida separados de la navegación.
- [ ] Una acción primaria por vista.

### Componentes

- [ ] Botones, campos, selects, chips y calendarios siguen la misma geometría.
- [ ] Estados hover, focus, active, disabled y loading.
- [ ] Errores de campo específicos y accesibles.
- [ ] Tablas y listas responden bien en móvil.
- [ ] Montos usan números tabulares y color semántico.

### Experiencia

- [ ] Loading, vacío, error, éxito y falta de permiso diseñados.
- [ ] Copy en español operativo.
- [ ] Teclado, foco y lector de pantalla verificados.
- [ ] `prefers-reduced-motion` verificado.
- [ ] Contraste AA verificado sobre el fondo real.
- [ ] Contenido largo, montos grandes y nombres reales probados.

### Calidad visual

- [ ] El vidrio mejora la jerarquía y no reduce la lectura.
- [ ] No hay cards anidadas innecesarias.
- [ ] El color cumple su función semántica.
- [ ] Las animaciones son breves, suaves y justificadas.
- [ ] La pantalla se reconoce como Agua Renew sin depender del logo.

---

## 20. Relación con la documentación del proyecto

| Archivo | Responsabilidad |
|---|---|
| `GUIA-DISENO.md` | Norma de marca y experiencia para cualquier sistema Agua Renew |
| `DESIGN.md` | Tokens portables y decisiones del producto actual |
| `.impeccable/design.json` | Detalles técnicos adicionales del sistema visual |
| `PRODUCT.md` | Usuarios, propósito, capacidades y principios de producto |
| `frontend/src/index.css` | Implementación viva del frontend actual |

Al iniciar un nuevo sistema, esta guía define el ADN común. Cuando ese sistema madure, debe generar su propio `DESIGN.md` desde su implementación real. Se comparten tokens, principios y recetas; no se copian nombres de clases ni estructuras específicas de otro módulo.

---

## Resumen ejecutivo

Si una decisión no está documentada, aplicar este criterio:

1. Hacer la tarea evidente.
2. Mantener el contenido legible sobre una superficie acuática clara.
3. Usar azul para dirigir, verde para confirmar/ingresar y rojo para alertar/egresar.
4. Usar Geist, números tabulares y radios contenidos.
5. Añadir movimiento solo cuando explique estado o material.
6. Simplificar en móvil y para movimiento reducido.
7. Verificar accesibilidad antes de considerar terminada la pantalla.

El resultado debe sentirse como Agua Renew incluso sin mirar el logo: claro como el agua, preciso para operar y consistente en cada pantalla.
