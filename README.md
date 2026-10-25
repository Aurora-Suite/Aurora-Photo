# Aurora Photo

Editor de fotos de la suite **Aurora** (junto a Aurora Studio). Electron + React + WebGL2, Windows y macOS.

## Funciones

- **Revelado tipo Lightroom** (no destructivo, por capa): exposición, contraste, altas luces, sombras, blancos, negros,
  temperatura, matiz, intensidad, saturación, blanco y negro, claridad, nitidez, viñeta, grano, desenfoque, desvanecer,
  curvas RGB, ruedas de color, HSL selectivo y LUT `.cube`. 16 looks con miniatura en vivo. «Antes» con la tecla `\`.
- **Capas tipo Photoshop**: imagen, pintura, texto y forma; opacidad, 16 modos de fusión, visibilidad, bloqueo,
  reordenar arrastrando, duplicar, máscaras de capa.
- **Herramientas**: mover/escalar/rotar (V), recortar con proporciones (C), pincel (B), borrador sobre máscara (E, Alt restaura),
  texto (T), formas (U), cuentagotas (I), mano (H / Espacio) y zoom (Z).
- **Documentos**: plantillas (miniatura de YouTube, Instagram, story, 4K, A4…), girar/voltear lienzo, redimensionar, tamaño de lienzo.
- **Exportar** a JPG, PNG o WebP con calidad, escala (10–400 %) y estimación de peso. Proyectos `.auphoto` y autoguardado.
- Pegar imágenes (Ctrl+V) y arrastrar archivos al lienzo.

El revelado se hornea en una LUT 3D y se aplica en GPU; la vista previa y la exportación usan el mismo camino.

## Desarrollo

```bash
npm install
node node_modules/electron/install.js   # si Electron no se descargó al instalar
npm run dev        # Vite + Electron
npm start          # compila y abre
npm run icon       # regenera el logo (build/ y src/assets/logo.svg)
npm run dist:win   # release/Aurora Photo Setup.exe y versión portable
```

Pruebas automatizadas: `AURORA_TEST=1 AURORA_PROFILE=<carpeta>` expone el estado en `window.__aurora` (solo en ese modo).
