# Garbinet — publicación y actualización

El programa utiliza jueves y domingos.

## Actualización en GitHub

Descomprime el ZIP y carga en la raíz del repositorio index.html, app.js,
styles.css, config.js y favicon.svg. Confirma con Commit changes.
La carpeta assets ya no es necesaria. La carpeta supabase contiene los archivos
para configurar el servidor; no es necesaria para mostrar la página.

Si ya conectaste config.js a tu proyecto, conserva esa URL antes de sustituirlo.
El ZIP contiene una URL de ejemplo porque todavía no se ha facilitado la real.

## Supabase desde el navegador

1. Crea un proyecto y activa Data API.
2. En SQL Editor ejecuta supabase/schema.sql si es una instalación nueva.
3. En Edge Functions crea garbinet-api mediante Via Editor y pega el contenido
   de supabase/functions/garbinet-api/index.ts. Publica la función.
4. Desactiva Verify JWT para esta función: utiliza su propia verificación de sesión.
5. En Edge Functions → Secrets configura VIEWER_PASSWORD_HASH y
   ADMIN_PASSWORD_HASH con los hashes SHA-256 hexadecimales de las contraseñas
   acordadas, y SESSION_SECRET con un valor aleatorio seguro de al menos 32 caracteres.
   No publiques contraseñas, hashes o claves de servidor en GitHub.
6. En config.js cambia TU-PROYECTO por el identificador de tu proyecto.
7. Activa GitHub Pages: Settings → Pages → Deploy from a branch → main → / (root).

Si la tabla ya existe con el calendario anterior, ejecuta una vez:

```sql
alter table public.assignments drop constraint if exists meeting_day_only;
alter table public.assignments add constraint meeting_day_only
check (extract(dow from service_date) in (0, 4));
```

Si ya has corregido SQL y publicado la función para jueves y domingos,
no hace falta repetir esos pasos.

## Estado del proyecto

Las sesiones duran 12 horas. El calendario requiere conexión al servidor.
Este paquete no incorpora todavía una PWA ni un modo sin conexión.
