# Control de Proveedores

Página web (GitHub Pages) para controlar el stock que la empresa tiene en poder
de sus **proveedores de servicios** (cromado, niquelado, zincado, etc.).

Flujo:

1. **El admin** entra al panel, sube el Excel mensual y elige un proveedor
   (ej. **Pedernera**). La app extrae la **Descripción Parte** y el **Stock
   Online** (cajones + kg) de esa hoja.
2. Genera un **link único** por proveedor.
3. **El proveedor** abre el link (sin usuario/contraseña) y, pieza por pieza,
   marca **Correcto** o **Incorrecto**. Si es **Incorrecto**, carga cuánto tiene
   realmente, separado en **sin procesar** (crudo) y **procesado**, en cajones y kg.
4. **El admin** ve los resultados, las diferencias y **exporta un CSV**.

## Arquitectura

- **Frontend estático** (React + Vite), hosteado en **GitHub Pages**.
- **Backend = Supabase** (Postgres) del proyecto *Control Partes Talleristas*.
- El Excel se lee **en el navegador** (SheetJS); no se sube a ningún servidor.
- Datos en **tablas aisladas con prefijo `cp_`** (`cp_sessions`, `cp_items`,
  `cp_config`). **No tocan ninguna otra tabla** de la base.
- Todo el acceso pasa por **funciones RPC `cp_*`** (`SECURITY DEFINER`). Las
  tablas tienen RLS activada y **sin políticas**, así que la clave pública del
  frontend no puede leerlas directamente: el proveedor solo accede con su
  **token** y el admin con una **clave** que se valida del lado de la base.

## Publicar en GitHub Pages

1. En GitHub: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
2. Cada push a la rama del proyecto (o a `main`) dispara el workflow
   `.github/workflows/deploy.yml`, que compila y publica.
3. La app queda en:
   **https://loekemeyer.github.io/Contrlol-Proveedores/**

> Si cambia el nombre del repo, actualizá `base` en `vite.config.js`
> (debe ser `/<nombre-del-repo>/`).

## Acceso admin

La clave del admin se guarda en Supabase (tabla `cp_config`, key `admin_secret`).
Para cambiarla:

```sql
update public.cp_config set value = 'NUEVA_CLAVE' where key = 'admin_secret';
```

## Desarrollo local

```bash
npm install
npm run dev       # http://localhost:5173/Contrlol-Proveedores/
```

La configuración de Supabase (URL + clave pública) está en
`client/src/config.js`. La clave *publishable* es pública por diseño; la
seguridad la dan RLS + las funciones RPC.

## Base de datos (resumen del esquema aislado)

- `cp_sessions` — un conteo por proveedor (con `token` y `status`).
- `cp_items` — items del conteo (descripción, stock online) + respuesta del
  proveedor (`estado`, `sp_*` sin procesar, `pr_*` procesado, `comentario`).
- `cp_config` — configuración (`admin_secret`).
- Funciones: `cp_admin_login`, `cp_admin_create_session`,
  `cp_admin_list_sessions`, `cp_admin_get_session`, `cp_admin_delete_session`,
  `cp_get`, `cp_save`, `cp_submit`.

La migración completa está en `supabase/migrations/`.

## Rutas (HashRouter)

- `#/admin` — panel: login, subir Excel, generar conteos, ver la lista.
- `#/admin/resultados/:id` — detalle de un conteo + exportar CSV.
- `#/c/:token` — pantalla del proveedor (link que se comparte).
