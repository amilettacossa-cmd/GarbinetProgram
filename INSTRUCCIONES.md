# Instrucciones de publicación

## 1. Crear el proyecto Supabase

1. Entra en [supabase.com](https://supabase.com), crea una cuenta y un proyecto gratuito.
2. Abre **SQL Editor**, pega todo el contenido de `supabase/schema.sql` y pulsa **Run**.
3. Instala Supabase CLI en el ordenador y accede:

   ```bash
   npm install -g supabase
   supabase login
   ```

4. Desde la carpeta principal del proyecto, vincúlalo sustituyendo el identificador:

   ```bash
   supabase link --project-ref IDENTIFICADOR_DEL_PROYECTO
   ```

5. Configura los hashes de las dos contraseñas. Estos comandos las solicitan de forma oculta y evitan guardarlas en el repositorio o en el historial de la terminal:

   ```bash
   read -s -p "Contraseña general: " viewer_password; echo
   viewer_hash=$(printf %s "$viewer_password" | shasum -a 256 | cut -d' ' -f1)
   supabase secrets set VIEWER_PASSWORD_HASH="$viewer_hash"

   read -s -p "Contraseña de programación: " admin_password; echo
   admin_hash=$(printf %s "$admin_password" | shasum -a 256 | cut -d' ' -f1)
   supabase secrets set ADMIN_PASSWORD_HASH="$admin_hash"

   session_secret=$(openssl rand -hex 32)
   supabase secrets set SESSION_SECRET="$session_secret"
   unset viewer_password viewer_hash admin_password admin_hash session_secret
   ```

6. Publica la función sin verificación JWT propia de Supabase, ya que utiliza su sesión privada firmada:

   ```bash
   supabase functions deploy garbinet-api --no-verify-jwt
   ```

## 2. Conectar el sitio

1. En Supabase abre **Project Settings → Data API** y copia la URL del proyecto.
2. Abre `config.js` y sustituye `https://TU-PROYECTO.supabase.co` por la URL copiada. Conserva `/functions/v1/garbinet-api` al final.

Ejemplo:

```js
window.GARBINET_CONFIG = {
  apiUrl: "https://abcdefgh.supabase.co/functions/v1/garbinet-api"
};
```

## 3. Publicar en GitHub Pages

1. Crea un repositorio nuevo en GitHub, por ejemplo `garbinet-programa`.
2. Sube el contenido de esta carpeta a la raíz del repositorio.
3. En el repositorio abre **Settings → Pages**.
4. En **Build and deployment**, selecciona **Deploy from a branch**.
5. Selecciona la rama `main`, carpeta `/ (root)`, y pulsa **Save**.
6. GitHub mostrará la dirección pública después de unos minutos.

## Seguridad

- GitHub no contiene las contraseñas en texto legible ni sus hashes.
- La tabla no concede acceso público directo.
- Las sesiones caducan después de 12 horas y se guardan solo durante la sesión del navegador.
- Para cambiar una contraseña, calcula su SHA-256 y cambia el secreto correspondiente en Supabase.
- El enlace puede ser público, pero sin contraseña no se puede consultar el programa.

## Nota de identidad

La interfaz usa un lenguaje gráfico sobrio inspirado en jw.org, sin copiar el logotipo ni presentarse como sitio oficial. El pie lo declara expresamente.
