# Control de Proveedores

App web para controlar el stock que la empresa tiene en poder de sus **proveedores
de servicios** (cromado, niquelado, zincado, etc.).

El flujo es:

1. **El admin** sube el Excel mensual (ej. `Control_Partes_Prov_de_Servicios_JULIO.xlsx`).
2. La app detecta las hojas de cada proveedor y extrae, para el que elijas
   (ej. **Pedernera**), la **Descripción Parte** y el **Stock Online** (cajones + kg)
   que la empresa cree que ese proveedor tiene.
3. Se genera un **link único** por proveedor.
4. **El proveedor** entra al link (sin usuario/contraseña) y, pieza por pieza,
   marca **Correcto** o **Incorrecto**. Si es **Incorrecto**, carga cuánto tiene
   realmente, separado en **sin procesar** (crudo) y **procesado**, en cajones y kg.
5. **El admin** ve los resultados, las diferencias y **exporta un CSV**.

## Tecnología

- Backend: **Node.js + Express + SQLite** (`better-sqlite3`).
- Lectura de Excel: **SheetJS (`xlsx`)** en el servidor.
- Frontend: **React** (Vite), servido por el mismo servidor.
- Un solo proceso: fácil de hostear (Railway, Render, Fly.io, VPS, etc.).

## Correr localmente

```bash
npm install
cp .env.example .env      # editá ADMIN_PASSWORD
npm run build             # compila el frontend a server/public
npm start                 # servidor en http://localhost:3000
```

Abrí <http://localhost:3000/admin>, ingresá con `ADMIN_PASSWORD` y subí el Excel.

### Desarrollo (con recarga)

En dos terminales:

```bash
npm run dev:server        # API en :3000
npm run dev:client        # Vite en :5173 (proxy /api -> :3000)
```

## Variables de entorno

| Variable          | Descripción                                             | Default                  |
| ----------------- | ------------------------------------------------------- | ------------------------ |
| `PORT`            | Puerto del servidor                                     | `3000`                   |
| `ADMIN_PASSWORD`  | Contraseña del panel de administración                  | `admin` (¡cambiala!)     |
| `DB_PATH`         | Ruta del archivo SQLite                                 | `./data/control.sqlite`  |

## Deploy (como página web)

1. Subí el repo a un servicio con Node (Railway / Render / Fly.io / VPS).
2. Configurá `ADMIN_PASSWORD` (y un disco persistente para `DB_PATH` si el
   servicio usa filesystem efímero).
3. Build command: `npm install && npm run build`. Start command: `npm start`.
4. Los links de proveedor usan el dominio desde el que se abre el panel, así que
   funcionan automáticamente en producción.

## Cómo lee el Excel

Cada proveedor tiene su hoja. La app detecta automáticamente:

- La fila de encabezado que contiene **`Descripción Parte`** (puede variar entre
  hojas; ej. fila 3 en Pedernera, fila 4 en Guazzaroni).
- Las columnas de stock online: la que empieza con **`Cajon <Proveedor>`** y la de
  **`KG <Proveedor>`** que está pegada a la derecha.

Las hojas utilitarias (`Conteo SP`, `Conteo SC`, `Stock OnLine Gral`, `Est LK`,
etc.) se ignoran.

## Rutas

- `/admin` — panel: login, subir Excel, generar conteos, ver la lista.
- `/admin/resultados/:id` — detalle de un conteo + exportar CSV.
- `/c/:token` — pantalla del proveedor (link que se le comparte).

## Datos

La base es un archivo SQLite (`data/control.sqlite`). Para hacer backup, copiá ese
archivo. Para empezar de cero, borralo (se recrea solo).
