# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Qué es esto

Casi todo el proyecto es un único archivo HTML autocontenido, `index.html` (~7.200 líneas, ~1 MB). La única excepción es la carpeta `i18n/`, con la traducción al inglés y al español (ver «Idiomas»). Es una aplicación de demostración para una agencia inmobiliaria suiza ficticia, Vauclair Immobilier SA, con sede en Lavaux (cantón de Vaud). La aplicación tiene dos modos que comparten un único almacén de datos:

- **Carte vivante**: un mapa 3D en vivo del pueblo, hecho con Three.js, que muestra los inmuebles y al personal a lo largo de su jornada.
- **Back-office**: el CRM/ERP de la agencia. Cubre inmuebles, mandatos, contactos, matching, visitas, ofertas y ventas, alquileres, administración de fincas (gérance), intervenciones técnicas, promociones y obras, facturación, agenda, gestión documental (GED) y configuración.

Los textos de la interfaz, los valores de los datos y los comentarios del código están en francés (`fr-CH`). El francés es el idioma de origen; el inglés y el español se aplican al mostrar la página. La aplicación sigue formatos y normas suizos:

- importes en CHF, con `’` como separador de miles
- IVA al 8,1 % y QR-facturas
- referencias legales y de construcción suizas: CO art. 257d, OBLF, CECB, PPE y códigos CFC

## Ejecución y herramientas

No hay paso de build, gestor de paquetes, tests ni linter. Abre `index.html` en un navegador o sirve el directorio con cualquier servidor estático. La aplicación necesita acceso a internet para Google Fonts y para `three@0.165.0`, que se carga desde jsDelivr mediante un `importmap`.

**Publicación:** el repositorio es `github.com/mynhar/agencia-inmobiliaria` (rama `main`) y se publica con GitHub Pages en https://mynhar.github.io/agencia-inmobiliaria/. Cada push a `main` actualiza la web en uno o dos minutos. GitHub Pages sirve `index.html` en la raíz, así que no cambies el nombre del archivo.

**Live Server** (extensión de VS Code) funciona con una condición: no escribas nunca `</body>` literal dentro de JavaScript; usa `<\/body>`, igual que ya se hace con `<\/script>`. Live Server inserta su script de recarga delante de *cada* `</body>` del archivo, pero solo ajusta `Content-Length` para una inserción. Con más de una, rompe los scripts afectados y el navegador recibe el archivo recortado por el final, justo donde está el mapa 3D, que entonces sale en blanco.

Útiles en la consola del navegador:

- `VX.S`: el estado completo
- `VX.reset()`: vuelve a generar los datos de demostración
- `APP.setMode('map'|'bo')`: cambia de modo
- `I18N.set('fr'|'en'|'es')`: cambia de idioma (recarga la página)
- `I18N.faltantes()`: textos franceses mostrados que no tienen traducción (ver «Idiomas»)
- `APP.open('<moduleId>', { id, tab })`: abre un módulo del back-office

## Ciclo de vida de los datos

- El estado se guarda en `localStorage['vauclair-demo-v1']`.
- `VX.load()` regenera los datos siempre que `S.v !== 1` o `S.created !== today()`. Por tanto, todas las modificaciones se pierden una vez al día.
- Las fechas de los datos semilla son relativas a hoy (`rel(days)`).
- Un cambio en `seed()` solo aparece tras un reinicio: Paramètres → Données → Réinitialiser, `VX.reset()`, o borrando la clave de localStorage.
- Los valores generados son deterministas por id, mediante `hash()` y `rng()` (mulberry32). Usa estas funciones en lugar de `Math.random()` para que la semilla siga siendo estable.
- Los planos (`plans()`, `apt()`) están en metros, con x hacia el este y z hacia el lago. Tanto el mapa 3D como los planos SVG del back-office (`BO.planSvg`) se dibujan a partir de ellos.

## Arquitectura

Los scripts se ejecutan en el orden del documento. Cada `<script>` clásico es una IIFE que publica una variable global.

0. **`window.I18N`**: la traducción. Se carga antes que todo lo demás desde `i18n/diccionario.js` e `i18n/i18n.js`. Si esos archivos no cargan, un stub en línea deja la aplicación en francés.
1. **`window.VX`**: la capa de datos compartida.
   - `VX.util`: utilidades de fechas, `chf`/`chfK`, `esc`, `uid`, `norm` y similares.
   - Tablas de referencia: `ROLES`, `STATUS`, `ROOM_TYPES`, `PORTALS`.
   - La semilla, el estado y el bus de eventos (`on`/`emit`).
   - Las acciones de negocio.
   - Indicadores: `occupancy`, `rentStats`, `pipeline`, `matchScore`/`matches`, `alerts`.
   - `dayPlan(e)`: construye la jornada de cada empleado como segmentos en minutos, que alimentan el mapa en vivo.
2. **`window.UI`**: iconos (`UI.icon(name, size)`, con la tabla de trazados en `UI.P`), logotipo, toasts, `UI.modal`, avatares, etiquetas de estado y visor de fotos.
3. **`window.APP`**: el armazón de la aplicación.
   - Cambio de modo, reflejado en el hash de la URL (`#map` o `#bo/<module>`).
   - El registro de módulos.
   - La búsqueda global ⌘K y la campana de alertas.
   - `APP.focus(target)`: consulta primero cada función de `APP.focusHandlers` (el mapa registra una). Si ninguna se encarga del objetivo, abre el módulo correspondiente del back-office.
   - La fototeca. El mapa aporta renders 3D mediante `setPhotos`; si no los hay, se dibuja un marcador de posición en canvas.
4. **`window.BO`**: el kit de herramientas del back-office.
   - Refresco en vivo y navegación delegada.
   - `BO.table`: tabla ordenable. La forma de su `cfg` está documentada en el comentario `TABLEAU TRIABLE`.
   - `BO.formHtml`, `BO.formRead`, `BO.formModal`: formularios. La especificación de `field` está documentada en el comentario `FORMULAIRES`.
   - También `BO.drawer`, `BO.confirm`, `BO.compose` (correos prerredactados), `BO.signature`, `BO.planSvg` y utilidades de CSV, descarga y formato.
5. **Módulos del back-office**: un script por módulo, entre `<!-- BO-MODULES:START -->` y `<!-- BO-MODULES:END -->`. Cada script termina con `APP.register({ id, label, icon, group, order, render(el, params), badge() })`.
6. **`<script>APP.boot();</script>`**
7. **`<script type="module">`**: el mapa 3D. Es la salida minificada de un bundler: una línea de ~140 KB más líneas de continuación de template literals. Su código fuente no está en este directorio, así que ahí solo conviene hacer correcciones pequeñas y puntuales. Se comunica con el resto de la aplicación únicamente a través de `VX` (lee `VX.S`, llama a acciones y escucha eventos) y de `APP` (`focusHandlers`, `onMode`, `open`, `setPhotos`).

Cada script empieza con un comentario de cabecera (`VAUCLAIR — …`) que indica qué cubre. Busca esas cabeceras para orientarte; los números de línea cambian.

### Cambios que afectan a ambos modos

- **Modifica los datos solo a través de una acción `VX.*`**, como `upsert`, `remove`, `addVisit`, `setOfferStatus`, `signLease`, `payRent` o `validateQuote`. Cada acción llama a `save()` y a `emit(evt)`.
  - `emit` dispara además `'change'` para cada evento. Esto es lo que mantiene sincronizados el mapa 3D y el back-office.
  - Si escribes directamente en `VX.S`, llama tú mismo a `VX.save()` y a `VX.emit(...)`. Si no, el otro modo queda desactualizado.
  - Registra el historial visible para el usuario con `VX.log(text, kind)`.
- Con cada `'change'`, el back-office vuelve a renderizar el módulo actual completo mediante `BO.schedule` → `APP.refresh`.
  - El refresco tiene debounce. También se pospone mientras un campo tiene el foco, hay un modal abierto o hay un arrastre en curso (`BO.busy`).
  - Por eso el `render` de un módulo debe ser idempotente y reconstruirse a partir de `VX.S` y `params`.
  - Guarda el estado de la interfaz (filtros, orden, pestaña activa) en variables del módulo, no en el DOM.
- La navegación usa atributos data, gestionados por un listener de clic en fase de captura dentro de `BO`:
  - `data-open="module:id:tab"`
  - `data-open-emp="empId"`
  - `data-map="type:id[:view]"`: cambia al mapa 3D y centra el objetivo.
- Los números de documento salen de `VX.nextNo(coll, prefix)` y tienen la forma `PREFIX-YYYY-NNN`.

## Idiomas (i18n)

La interfaz se muestra en francés, inglés o español. El español es **latinoamericano neutro**: departamento, auto, cotización, tasa, condominio, asamblea, administración de propiedades, programar, cancelar, comillas “ ”. Mantén ese vocabulario en las entradas nuevas y evita los términos de España (piso, coche, presupuesto por «devis», tipo por «taux», propiedad horizontal, junta, fincas, planificar, anular). El selector FR · EN · ES está en la barra superior. El idioma se elige así, por orden: `?lang=` en la URL, después `localStorage['vauclair-lang']`, después el idioma del navegador y, por último, el francés.

**El código sigue escribiendo en francés.** No hay llamadas a una función de traducción repartidas por el código. `i18n/i18n.js` traduce lo que se *muestra*:

- Un `MutationObserver` traduce nodos de texto y los atributos `title`, `placeholder`, `aria-label`, `alt`, `data-tip` y `label`.
- Se interceptan los textos de canvas (`fillText`/`strokeText`/`measureText`), usados por los letreros y planos del mapa 3D; `document.write`, usado por las ventanas de impresión; y `alert`/`confirm`/`prompt`.
- Los nodos dentro de `script`, `style`, `textarea`, `code`, `pre` y `kbd` se ignoran, igual que cualquier elemento con `translate="no"` o `.notranslate`.

Consecuencias al tocar el código:

- Los estados en francés (`'À vendre'`, `'Acceptée'`…) son a la vez claves de la lógica. No los traduzcas en el código: se traducen solos al mostrarse.
- Si el código *recorta* o *transforma* un texto antes de mostrarlo (por ejemplo `.slice(0, 7)`), tradúcelo primero con `I18N.tr(texto)`. Si no, el recorte ya no coincide con ninguna clave.
- Las fechas usan `I18N.locale` (`fr-CH`, `en-GB` o `es-419`, el código de español latinoamericano). Los importes y números siguen en `fr-CH` a propósito, con el formato suizo `CHF 1’234,50`.
- Las variables de las plantillas de documentos (`{bien.nom}`, `{montant}`…) no se traducen.

**Diccionario** (`i18n/diccionario.js`): un objeto `"texto francés": ["English", "Español"]`. Los huecos `{0}`, `{1}`… se rellenan con el valor real (números, nombres, fechas), que a su vez se intenta traducir. Para cada texto, el motor prueba por orden:

1. la coincidencia exacta
2. los números convertidos en `{n}`
3. los patrones largos con huecos
4. los trozos separados por ` · `, ` — ` o ` – `
5. los demás patrones
6. «fecha à 16:00»
7. un texto conocido pegado a un valor («brut CHF 389 k»)
8. sin signos de puntuación alrededor
9. sin distinguir mayúsculas
10. las listas separadas por comas

Las claves que empiezan o terminan con `·`, `:` o `—` también se registran sin ellos.

**Añadir o corregir traducciones:** edita `i18n/diccionario.js` directamente; la sección final reúne las entradas añadidas a mano. Para encontrar lo que falta, abre la aplicación con `?lang=en` o `?lang=es`, recorre las pantallas y ejecuta `I18N.faltantes()` en la consola. La lista incluye nombres propios (personas, calles, inmuebles), que se dejan en francés a propósito, y trozos intermedios que el motor probó antes de dar con la traducción completa. Lo que importa es el texto francés que sigue *visible*. Un texto nuevo en el código sin entrada en el diccionario simplemente se muestra en francés.

## Estilos

- El CSS está en línea, en seis bloques `<style>`, en este orden:
  1. tokens y componentes base
  2. back-office
  3. módulos comerciales
  4. alquiler y administración de fincas
  5. promoción, facturación, agenda, documentos y configuración
  6. el mapa en vivo
- Los tokens de diseño son variables CSS en `:root`: una paleta crema, lino, arena, roble y bronce, `--serif` (Cormorant Garamond) para los títulos y `--font` (Manrope) para la interfaz. Usa los tokens en lugar de colores literales.
- Los estilos de cada módulo llevan un prefijo de clase: `.mand-`, `.ct-`, `.mt-`, `.vis-`, `.off-`, `.loc-`, `.ger-`, `.int-`, `.lg-doc` (documentos imprimibles) y `.mx-` (mapa en vivo).

## Problema conocido: la impresión

Este archivo se ensambló a partir de un proyecto con varios archivos, y dos rutas de impresión todavía dan por hecho que existen archivos CSS separados:

- `printDoc`, en el módulo de facturación (`compta`), enlaza `css/base.css`, `css/bo.css` y `css/bo-orga.css`. Ninguno de esos archivos existe aquí.
- `BO.lgPrint`, que usan los módulos de alquiler y de gérance, solo copia las etiquetas `<link rel="stylesheet">`, que aquí son únicamente las de Google Fonts. No copia los bloques `<style>` en línea.

Como resultado, las facturas, los contratos de alquiler y los demás documentos impresos salen sin los estilos de la aplicación. Para arreglarlo hay que inyectar el CSS en línea correspondiente en la ventana de impresión.
