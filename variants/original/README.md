# Motor original de referencia

`content.js` es una copia exacta de `scripts/content.js` del commit `f9555c4`, anterior a la optimización de filtrado. Conserva las 100 opciones, los estilos inline, el barrido XPath y el debounce de 100 ms del motor original, además de las reparaciones de importación/exportación de ese commit.

No se carga desde los manifiestos de la raíz. `tools/package.py` lo coloca como content script en los paquetes `original`; el popup, el diagnóstico y el resto de archivos se comparten con los paquetes optimizados.

Esta fuente queda congelada para poder comparar. No hay que sincronizarla automáticamente con el motor optimizado ni cambiarla para que pase pruebas de comportamiento exclusivas del motor nuevo. La licencia MIT del proyecto original se conserva en cada paquete.
