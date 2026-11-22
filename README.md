# Claude Account Switcher

Extensión de Chrome (Manifest V3) para alternar entre varias cuentas de `claude.ai` en la misma ventana, sin perfiles ni navegadores adicionales.

## Cómo funciona

Cada cuenta es una "foto" (snapshot) de las cookies de `claude.ai` guardada en `chrome.storage.local`. Al cambiar de cuenta, la extensión:

1. Actualiza la foto de la cuenta activa (conserva tokens rotados).
2. Borra las cookies de `claude.ai`.
3. Restaura las cookies de la cuenta destino.
4. Recarga las pestañas abiertas de `claude.ai`.

## Instalación

1. Descomprime el ZIP.
2. Abre `chrome://extensions` y activa el **Modo de desarrollador**.
3. Pulsa **Cargar descomprimida** y elige la carpeta `claude-account-switcher`.
4. Fija la extensión en la barra con el ícono de rompecabezas.

## Uso

1. **Primera cuenta:** inicia sesión en `claude.ai`, abre la extensión, escribe un nombre y pulsa **Guardar sesión actual**.
2. **Cuenta adicional:** pulsa **Añadir otra cuenta…** (deja `claude.ai` sin sesión), inicia sesión con la otra cuenta y guárdala con otro nombre.
3. **Alternar:** abre la extensión y haz clic en la cuenta, o usa el atajo `Alt+Shift+A` para rotar entre cuentas (configurable en `chrome://extensions/shortcuts`).
4. La insignia del ícono muestra las 2 primeras letras de la cuenta activa.

## Reglas importantes

- **No uses "Cerrar sesión" dentro de claude.ai.** Invalida la sesión en el servidor y la foto guardada dejaría de funcionar. Para salir de una cuenta, cambia a otra desde la extensión.
- Si la sesión de una cuenta expira, vuelve a iniciar sesión en ella y elimínala/guárdala de nuevo.

## Seguridad

- Las cookies de sesión se guardan **sin cifrar** en el almacenamiento local de la extensión. Quien tenga acceso a tu perfil de Chrome puede usarlas. Úsala solo en tu equipo personal.
- Permisos mínimos: `cookies` y `storage`, limitados a `https://claude.ai/*`. No hay llamadas de red ni código remoto.

## Limitaciones

- Solo cookies: el `localStorage` de `claude.ai` no se aísla por cuenta.
- La detección de sesión busca una cookie cuyo nombre contenga `session` (`SESSION_COOKIE_REGEX` en `background.js`). Si Anthropic cambia el nombre, ajusta esa constante.
- Cada cuenta es una sola sesión a la vez: no puedes ver dos cuentas simultáneamente en pestañas distintas.

## Estructura

```
claude-account-switcher/
├── manifest.json   # Manifest V3, permisos y atajo de teclado
├── background.js   # Service worker: snapshots, cambio de cookies, cola serial
├── popup.html      # Interfaz
├── popup.css       # Estilos (claro/oscuro)
├── popup.js        # Lógica de interfaz (sin acceso directo a cookies)
└── icons/          # Íconos 16/48/128 px
```
