# Formidex

App para registrar hormigas en un mapa y llevar fichas de cría de tus colonias. Funciona en el móvil y en el
ordenador como una web instalable (PWA) y guarda los datos en tu propio Google Drive.

## Qué hace

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
- **Fichas de cría** en la pestaña Cría, en tres niveles: **género**, **especie** y **colonia**. La colonia hereda de la
  ficha de su especie y esta de la del género, así que en cada nivel solo apuntas lo que cambia. Lo heredado se ve en
  gris con su procedencia («de Messor») y se puede tocar para ir a esa ficha.
  - Cada ficha guarda la diapausa (del día y mes de inicio al de fin, y a qué temperatura, o «no necesita»), los
    carbohidratos y las proteínas con cuánto les gustan (nada, poco o mucho), la capacidad de escape, la temperatura,
    la humedad, el nido, el tamaño de la reina y de las obreras, el tipo de fundación, el número de reinas, notas y
    fotos. Las colonias llevan además nombre, desde cuándo las tienes y su origen, y se archivan cuando ya no las tienes.
  - Los alimentos se combinan uno a uno: si el género dice «Miel: poco» y la especie «Miel: nada», la colonia ve
    «nada», y el resto de alimentos del género le siguen llegando.
  - Avisa de la diapausa en la lista y en la ficha: «Diapausa en 26 días», «En diapausa hasta el 15 de febrero».
  - Si cambias el género o la especie de una ficha, sus colonias cambian con ella.
- **Botón «atrás»**: cada pantalla tiene su dirección (por ejemplo `#/cria/<id>`), así que «atrás» en el móvil vuelve a
  la pantalla anterior y se puede guardar el enlace a una ficha.
- **Sin conexión**: todo se guarda primero en el dispositivo y se sube a Drive cuando hay conexión.

## Cómo se guardan los datos

Cada dispositivo tiene una copia local (IndexedDB) y se sincroniza con la carpeta `Formidex` de tu Google Drive:

```
Formidex/
  registros/   un archivo registro-<id>.json por registro
  fichas/      un archivo ficha-<id>.json por ficha de cría (de género, de especie o de colonia)
  fotos/       <id>.jpg (hasta 2560 px) y <id>-mini.jpg (miniatura)
```

La app usa el permiso `drive.file`, así que solo puede ver los archivos que ella misma crea, no el resto de tu Drive.
Se sincroniza al abrirla, tras cada cambio, al recuperar la conexión, al volver a la app y cada 5 minutos. Si el mismo
registro o la misma ficha se cambia en dos dispositivos, se queda el cambio más reciente.

En iPhone conviene **añadir la app a la pantalla de inicio**: Safari puede borrar los datos de una web que no visitas en
una semana, pero no los de una app instalada. Lo que ya está en Drive no se pierde en ningún caso.

## Google Drive

La app usa su propio cliente OAuth de Google Cloud, cuyo ID está en `.env.production`. Si hubiera que crear otro, por
ejemplo para publicarla en otra dirección:

1. Entra en [Google Cloud Console](https://console.cloud.google.com/) y crea un proyecto (por ejemplo, «Formidex»).
2. En **APIs y servicios → Biblioteca**, activa **Google Drive API**.
3. En **Google Auth Platform** (pantalla de consentimiento), crea la configuración: nombre «Formidex», tu correo y
   público **Externo**. En **Público**, añade tu cuenta de Google como usuario de prueba.
4. En **Clientes**, crea un cliente de tipo **Aplicación web** con estos **Orígenes de JavaScript autorizados**:
   - `https://marcsgc.github.io` (o la dirección donde se publique)
   - `http://localhost:5173` (solo para desarrollo)
5. Copia el **ID de cliente** (termina en `.apps.googleusercontent.com`) y ponlo en `.env.production`:
   `VITE_GOOGLE_CLIENT_ID=...`. En un dispositivo también se puede pegar otro en **Ajustes → Configuración avanzada**,
   que tiene prioridad sobre el de la app. En desarrollo (`npm run dev`) no se lee `.env.production`, así que el ID se
   pega ahí.

## Publicar en GitHub Pages

Cada cambio en `main` se publica solo con el workflow `.github/workflows/deploy.yml` en
`https://marcsgc.github.io/formidex/`. Hace falta activarlo una vez en **Settings → Pages → Source: GitHub Actions**.
GitHub Pages es gratis en repositorios públicos; en uno privado necesita GitHub Pro. En el repositorio no hay datos
personales: los registros, las fichas y las fotos viven en tu Drive.

## Desarrollo

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # sincronización con un Drive simulado y herencia de las fichas
npm run lint
npm run build
```

Tecnologías: React + TypeScript + Vite, Leaflet con OpenStreetMap, Dexie (IndexedDB), exifr para leer el EXIF,
Google Identity Services y la API REST de Google Drive v3.

## Próximas fases

- Diario de cada colonia, exportar a CSV y más filtros en el mapa.
