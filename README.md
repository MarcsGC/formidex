# Formidex

App para registrar hormigas en un mapa y, más adelante, llevar fichas de cría. Funciona en el móvil y en el
ordenador como una web instalable (PWA) y guarda los datos en tu propio Google Drive.

## Qué hace (fase 1)

- **Mapa** con tus registros. Botón para ir a tu ubicación actual y opción de crear un registro en cualquier punto
  manteniendo pulsado el mapa (clic derecho en el ordenador).
- **Registro** con fotos, ubicación, fecha, notas y una identificación opcional: puedes dejarla vacía, poner solo el
  género o género y especie, y completarla después.
  - Si la foto guarda el GPS y la fecha (EXIF), se rellenan solos. Sirve para registrar desde casa fotos hechas en
    el campo.
  - La ubicación también se puede elegir tocando el mapa, arrastrando el marcador, con «Mi ubicación» o pegando
    coordenadas (`40.4168, -3.7038`).
  - Sugerencias de géneros y especies: los que ya has usado, una lista de géneros frecuentes y, con conexión, el
    catálogo de [GBIF](https://www.gbif.org) filtrado a Formicidae.
- **Lista** de registros con buscador y recuento de géneros y especies.
- **Sin conexión**: todo se guarda primero en el dispositivo y se sube a Drive cuando hay conexión.

## Cómo se guardan los datos

Cada dispositivo tiene una copia local (IndexedDB) y se sincroniza con la carpeta `Formidex` de tu Google Drive:

```
Formidex/
  registros/   un archivo registro-<id>.json por registro
  fotos/       <id>.jpg (hasta 2560 px) y <id>-mini.jpg (miniatura)
```

La app usa el permiso `drive.file`, así que solo puede ver los archivos que ella misma crea, no el resto de tu Drive.
Se sincroniza al abrirla, tras cada cambio, al recuperar la conexión, al volver a la app y cada 5 minutos. Si el mismo
registro se cambia en dos dispositivos, se queda el cambio más reciente.

En iPhone conviene **añadir la app a la pantalla de inicio**: Safari puede borrar los datos de una web que no visitas en
una semana, pero no los de una app instalada. Lo que ya está en Drive no se pierde en ningún caso.

## Configurar Google Drive (una sola vez)

1. Entra en [Google Cloud Console](https://console.cloud.google.com/) y crea un proyecto (por ejemplo, «Formidex»).
2. En **APIs y servicios → Biblioteca**, activa **Google Drive API**.
3. En **Google Auth Platform** (pantalla de consentimiento), crea la configuración: nombre «Formidex», tu correo y
   público **Externo**. En **Público**, añade tu cuenta de Google como usuario de prueba.
4. En **Clientes**, crea un cliente de tipo **Aplicación web** con estos **Orígenes de JavaScript autorizados**:
   - `https://marcsgc.github.io`
   - `http://localhost:5173` (solo para desarrollo)
5. Copia el **ID de cliente** (termina en `.apps.googleusercontent.com`) y ponlo en `.env.production`:
   `VITE_GOOGLE_CLIENT_ID=...`. Mientras tanto también se puede pegar en **Ajustes → Configuración avanzada** de la app.

## Publicar en GitHub Pages

Cada cambio en `main` se publica solo con el workflow `.github/workflows/deploy.yml` en
`https://marcsgc.github.io/formidex/`. Hace falta activarlo una vez en **Settings → Pages → Source: GitHub Actions**.
GitHub Pages es gratis en repositorios públicos; en uno privado necesita GitHub Pro. En el repositorio no hay datos
personales: los registros y las fotos viven en tu Drive.

## Desarrollo

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # pruebas del motor de sincronización con un Drive simulado
npm run lint
npm run build
```

Tecnologías: React + TypeScript + Vite, Leaflet con OpenStreetMap, Dexie (IndexedDB), exifr para leer el EXIF,
Google Identity Services y la API REST de Google Drive v3.

## Próximas fases

- **Fichas de cría** por género, especie y colonia (las de colonia heredan de la especie, y esta del género):
  diapausa, carbohidratos y proteínas preferidos, capacidad de escape, tamaño…
- Diario de cada colonia, exportar a CSV y más filtros en el mapa.
