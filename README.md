# Octágono

Web app instalable (PWA) para escanear productos del súper y ver:

- Los **sellos de advertencia** calculados con los criterios de la fase 3 de la NOM-051.
- **Aditivos de riesgo** (colorantes azoicos, nitritos, edulcorantes, etc.).
- Una **calificación de 0 a 100** y **mejores opciones parecidas**.
- Un **comparador** de dos productos.

## Cómo funciona

1. **Escaneo en vivo** con la cámara del teléfono. Usa el lector nativo `BarcodeDetector` donde existe (Chrome en Android) y ZXing en los demás (iPhone).
2. Busca el código en este orden:
   1. tu historial (IndexedDB, en el teléfono);
   2. la base incluida de Open Food Facts México (`db/`, ~17 mil productos, funciona sin conexión);
   3. la API en vivo de Open Food Facts.
3. Si no lo encuentra, puedes tomar fotos de la etiqueta y la **API de Claude** (con tu propia clave, guardada solo en el teléfono) lee la tabla nutrimental. También puedes capturar los datos a mano.

## Publicar gratis

Es un sitio estático: no necesita servidor ni compilación. Sube la carpeta completa a cualquiera de estas opciones:

- **GitHub Pages:** sube el repositorio a GitHub y luego ve a Settings → Pages → Deploy from branch → `main` / root.
- **Netlify Drop:** arrastra la carpeta (o el `.zip`) a https://app.netlify.com/drop.
- **Cloudflare Pages:** Workers & Pages → Create → Pages → Upload assets.

La cámara necesita HTTPS, y las tres opciones lo dan automáticamente.

## Instalar en el teléfono

- **iPhone:** abre el enlace en Safari → Compartir → Agregar a inicio.
- **Android:** abre el enlace en Chrome → menú ⋮ → Instalar app.

## Actualizar la base de productos

```bash
curl -sSL https://static.openfoodfacts.org/data/en.openfoodfacts.org.products.csv.gz | gunzip | python3 tools/off_from_dump.py > tools/off_raw.jsonl
```

```bash
node tools/build_db.mjs
```

Después sube `VERSION` en `sw.js` para que los teléfonos descarguen la base nueva.

## Pruebas

```bash
python3 -m http.server 8765 --bind 127.0.0.1
```

```bash
node tools/e2e_test.cjs
```

## Créditos y licencias

- Datos de productos: [Open Food Facts](https://world.openfoodfacts.org), licencia ODbL.
- Lector de códigos: [ZXing-js](https://github.com/zxing-js/library), Apache 2.0 (`vendor/zxing-LICENSE`).
- Fuentes: Anton y Work Sans, SIL Open Font License.
- La calificación es propia y orientativa; no es un dictamen oficial ni consejo médico.
