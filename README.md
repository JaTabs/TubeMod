# TubeMod

## Cambios de esta versión

Este fork mantiene el motor de filtrado original de [Pedro-Gregorio/TubeMod](https://github.com/Pedro-Gregorio/TubeMod), añade el diagnóstico F3 y corrige la importación y exportación de configuraciones:

- La importación se abre en una pestaña propia, para no depender del popup que puede cerrarse al abrir el selector de archivos.
- Valida el JSON, conserva las preferencias de archivos antiguos y confirma el guardado antes de recargar YouTube.
- Muestra errores de lectura, validación, conexión y almacenamiento.
- Corrige la limpieza del enlace de exportación.

Los cambios se comparten entre Brave, Chromium y Firefox. Las versiones de las tiendas enlazadas abajo pertenecen al proyecto original; para usar este fork, carga esta copia como extensión de desarrollo.

### Motor de filtrado

Las optimizaciones se han revertido. `scripts/content.js` vuelve a la copia anterior a la optimización (`f9555c4`): filtros XPath, estilos inline y el observador original con debounce de 100 ms. Conserva las reparaciones de importación/exportación del fork. No hay un motor alternativo optimizado.

El diagnóstico está en un script separado y solo instrumenta el motor mientras está activado. Ocultar contenido no impide que YouTube lo descargue ni garantiza que libere su memoria.

## Diagnóstico de rendimiento

Activa **Diagnóstico de rendimiento (F3)** en el popup de la extensión, o pulsa **F3** en YouTube. Está apagado por defecto. Cerrar el panel desactiva la instrumentación, cancela el muestreo, restaura los métodos originales y libera sus registros. El ajuste se comparte entre las pestañas de YouTube de ese paquete.

El panel muestra tiempos de JavaScript de aplicaciones completas y lotes de cambios, media y percentil 95 de las últimas operaciones, consultas XPath globales o por rama, coincidencias acumuladas y estado del observador. Incluye tres gráficas con valores al pasar el ratón o usar las flechas, una tabla de muestras, registros recientes y exportación JSON. Puedes pausar, reiniciar, cambiar la ventana de 30/60/120 segundos y pulsar **Medir filtros** para provocar una aplicación completa.

### Cómo interpretar los datos

- **Tiempo JS:** ejecución síncrona de los métodos instrumentados, sin contar dos veces las llamadas anidadas. Excluye esperas de almacenamiento, trabajo CSS nativo, layout y pintura. No es el tiempo total hasta que la página termina de verse filtrada.
- **Ocupación JS:** tiempo medido dividido por el intervalo. No es el uso real de CPU del proceso ni de toda la extensión.
- **Heap JS:** `performance.memory.usedJSHeapSize`, si el navegador lo expone. Es orientativo y puede incluir otros contextos; no mide RAM de TubeMod ni toda la pestaña. En Firefox normalmente aparece **N/D**.
- **Tareas largas:** trabajo de más de 50 ms que informa el navegador sobre la página, sin atribuirlo a TubeMod. También aparece N/D si la API no está disponible.
- **Refresco del panel:** coste JS del último refresco de sus datos y gráficas. El diagnóstico añade trabajo: utiliza el mismo ajuste al comparar ambos paquetes y desactívalo durante el uso normal.

Para observar CPU y memoria de procesos, usa además el gestor de tareas del navegador: Shift+Esc en Chromium/Brave o `about:processes` en Firefox. La extensión no solicita permisos adicionales para acceder a esos datos.

Los registros permanecen en la pestaña: máximo 120 muestras, 100 registros y 300 tiempos. No hay telemetría ni envío a servidores. Los JSON exportados no incluyen URL de la página, títulos ni búsquedas.

## Paquetes para Chromium y Firefox

El clon y los paquetes utilizan el mismo motor original, con F3 y las reparaciones de importación/exportación. Para generarlos, con Python 3 y su biblioteca estándar:

```bash
python3 -I tools/package.py
```

Se crea una carpeta nueva en `dist/<fecha-hora>/`, con dos carpetas cargables y sus ZIP: `tubemod-chromium-original` y `tubemod-firefox-original`. Ya no se generan variantes optimizadas.

En Chromium/Brave carga la carpeta correspondiente con **Load unpacked**; el ZIP sirve para transportarla, no como instalación firmada. En Firefox carga el `manifest.json` de la carpeta correspondiente como complemento temporal. El paquete de Firefox no está firmado y el complemento temporal desaparece al cerrar el navegador.

**Activa solo una copia de TubeMod.** Si cargabas una carpeta optimizada de un empaquetado anterior, cambiar el repo no la actualiza: desactívala y carga la carpeta nueva, o carga directamente la raíz del clon en Chromium. Recarga la extensión y todas las pestañas de YouTube para retirar los scripts antiguos. Exporta tus preferencias antes de cambiar de instalación e impórtalas después.

## What is it?

TubeMod is a Browser Extension that allows users to hide specific YouTube elements, giving them more control over their viewing experience. Rather than permanently removing elements, TubeMod provides simple toggles to hide parts of YouTube’s UI, making it a lightweight and customizable solution. It is planned, for a future release, allowing users to completely remove elements, instead of simply hiding them.

## How to Use

After installing the extension:

1. Click on the TubeMod icon in your browser toolbar.
2. Toggle the YouTube elements you want to hide via the popup interface.
3. Changes will be applied instantly. Enjoy your customized YouTube experience!

## How to Install

### From the Chrome Web Store

1. Go to the [TubeMod Extension Page on Chrome Web Store](https://chromewebstore.google.com/detail/tubemod/mhhalndcidpfcemnlidabgieccknndei).
2. Click 'Add to _Your Browser_' and follow the prompts.

### From the FireFox Add-Ons

1. Go to the [TubeMod Extension Page on Firefox Add Ons](https://addons.mozilla.org/en-GB/firefox/addon/tubemod/).
2. Click 'Add to Firefox' and follow the prompts.

## How to set up Dev

1. Clone the repository

```
git clone https://github.com/JaTabs/TubeMod.git
cd TubeMod
```

If the clone command doesn't work just download the repository as a ZIP file and extract it to your desired location.

Depending on your browser you will have to take different routes:

### For Chromium based browsers:

2.  Go to `chrome://extensions`. The "chrome" part might be changed to the name of the browser.
3.  Enable the developer mode toggle.
4.  Click on "Load unpacked".
5.  Select the folder where the repository is (it should contain the manifest.json)
6.  Every time you make a change either reload the extension or remove it an add it again. The latter works better when dealing with js parts of the code.

### Firefox

Firefox utiliza `manifest_firefox.json`, que declara `background.scripts` en lugar del service worker de Chromium. Los scripts del panel, la página de importación y el content script son los mismos; no requieren una implementación separada.

Para mantener el clon de Brave intacto, prepara una carpeta independiente. Ejecuta desde la raíz del repo:

```bash
mkdir ../TubeMod-firefox &&
cp -r public scripts icons ../TubeMod-firefox/ &&
cp manifest_firefox.json ../TubeMod-firefox/manifest.json
```

El comando se detiene si `../TubeMod-firefox` ya existe, para no sobrescribir otra copia.

1. Abre `about:debugging#/runtime/this-firefox` en Firefox.
2. Pulsa **Cargar complemento temporal** y selecciona `manifest.json` dentro de `TubeMod-firefox`.
3. Abre YouTube y prueba Import Settings. Debe abrir una pestaña propia de TubeMod, igual que en Brave.
4. Tras modificar el código, actualiza la copia de los scripts y pulsa **Recargar** en el complemento; recarga también YouTube.

El complemento temporal se elimina al cerrar Firefox. La instalación permanente en Firefox estándar requiere un complemento firmado por Mozilla; publicar el código en GitHub no lo firma.

Mozilla documenta la compatibilidad con callbacks bajo `chrome.*` en su [guía de portabilidad](https://extensionworkshop.com/documentation/develop/porting-a-google-chrome-extension/).

Before pushing to GitHub, please update [the release notes](./documentation/ReleaseNotes.md) with the feature you're adding.

Some things to consider:

- Keep your commit messages clean by starting with `Add`, `Change`, `Fix` or `Remove`, depending on what you're doing.
- If possible, add evidences, of what you're working on, to the PR message.

## Pruebas

Con Node.js 18 o posterior, sin instalar dependencias:

```bash
node --test tests/*.test.cjs
```

Las pruebas de configuraciones ejecutan los scripts reales con almacenamiento y eventos del navegador simulados. Cubren el ciclo exportar/importar, configuraciones antiguas, archivos inválidos y errores de lectura o guardado.

Se conserva una única prueba de integración del filtrado y el diagnóstico: `tests/filtering.test.cjs`. Ejecuta el motor original con el menú F3 en Chromium y Firefox headless, con perfiles temporales y DOM real servido en localhost. Comprueba el filtrado, la restauración, el procesamiento pendiente al cambiar una opción y la activación, medición y desactivación del panel. No instala dependencias ni usa tu perfil personal. Si un navegador no está instalado, se indica que no se ha ejecutado; si no hay ninguno, la prueba se marca como omitida. Para elegir los navegadores que se ejecutan:

```bash
TUBEMOD_BROWSERS=chromium node --test tests/filtering.test.cjs
TUBEMOD_BROWSERS=firefox node --test tests/filtering.test.cjs
```

Estas pruebas usan fixtures y simulan el almacenamiento de la extensión; no sustituyen comprobar los selectores con la versión actual de YouTube ni cargar la extensión completa.

Para comprobarlo en Chromium o Firefox, carga el repositorio como extensión de desarrollo siguiendo los pasos anteriores:

1. Abre YouTube, activa varias opciones y exporta la configuración.
2. Cambia esas opciones y pulsa Import Settings. Se abrirá una pestaña de TubeMod; selecciona allí el archivo exportado y mantén abierta la pestaña original de YouTube.
3. Comprueba que aparece la confirmación en la página de importación, que YouTube se recarga y que se restauran las opciones en el panel y en la página.
4. Importa un JSON inválido: debe aparecer un error y la configuración anterior debe mantenerse.
5. Selecciona otra vez el mismo archivo válido: debe importarse de nuevo. Si YouTube no recibe el mensaje, la página debe indicar que recargues YouTube y vuelvas a abrir la importación.

## Features and Future Plans

Check all the available and planned features [here](./documentation/Features.md).

## How can I support the project?

The extension will always remain free to use. While contributions are not required, any support is greatly appreciated! If you'd like to contribute, you can:

- Buy me a coffee on [Ko-Fi](https://ko-fi.com/pedrogregorio).
- Share the extension with others or leave a review.
- Submit feedback, report bugs, or suggest new features via the Issues section on GitHub or via [email](mailto:pedro-gregorio@outlook.pt).

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
