# TubeMod

## Cambios de esta versión

Esta versión conserva el proyecto original de [Pedro-Gregorio/TubeMod](https://github.com/Pedro-Gregorio/TubeMod) y corrige la importación y exportación de configuraciones:

- La importación se abre en una pestaña propia, para no depender del popup que puede cerrarse al abrir el selector de archivos.
- Valida el JSON, conserva las preferencias de archivos antiguos y confirma el guardado antes de recargar YouTube.
- Muestra errores de lectura, validación, conexión y almacenamiento.
- Corrige la limpieza del enlace de exportación.

Los cambios se comparten entre Brave, Chromium y Firefox. Las versiones de las tiendas enlazadas abajo pertenecen al proyecto original; para usar esta reparación, carga esta copia como extensión de desarrollo.

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
git clone https://github.com/Pedro-Gregorio/TubeMod.git
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

## Pruebas de importación y exportación

Con Node.js 18 o posterior, sin instalar dependencias:

```bash
node --test tests/*.test.cjs
```

Las pruebas ejecutan los scripts reales con almacenamiento y eventos del navegador simulados. Cubren el ciclo exportar/importar, configuraciones antiguas, archivos inválidos y errores de lectura o guardado.

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
