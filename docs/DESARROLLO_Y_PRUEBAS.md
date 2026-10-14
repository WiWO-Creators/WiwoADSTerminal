# Desarrollo local y pruebas

Cómo levantar WiWO.ADS en tu máquina, cómo probarlo sin tocar nada real y qué hace cada comando. Para el servidor de
producción ver [`DESPLIEGUE_VPS.md`](DESPLIEGUE_VPS.md); para las variables, [`VARIABLES_DE_ENTORNO.md`](VARIABLES_DE_ENTORNO.md).

## 1. Requisitos

- **Node 22.13 o superior** (los tests cargan archivos `.ts` directamente con Node).
- **Git Bash o WSL en Windows**: los scripts `scripts/*.sh` están pensados para Linux.
- Un archivo **`.dev.vars`** en la raíz con las credenciales de desarrollo (nunca se versiona, está en `.gitignore`).
  Sin él, la app arranca pero Windsor, Meta, Google y LinkedIn fallan al llamarlos.

## 2. Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | Vite + Miniflare (D1 y R2 emulados en `.wrangler/state`). Puerto por defecto **5173**; se puede forzar con `npx vite --port 3055`. |
| `npm run db:migrate:local` | Crea o actualiza el esquema local. Hace falta la primera vez o tras limpiar `.wrangler/state`. |
| `npm run lint` | ESLint. |
| `npx tsc --noEmit` | Comprobación de tipos. |
| `node --test tests/*.test.mjs` | Todas las pruebas (sin compilar). |
| `npm test` | Compila primero (`npm run build`) y luego corre las pruebas. Exige Git Bash o Linux. |
| `npm run build` | Compilación verificada (`vinext build`, con límite de 3 minutos). |
| `npm run test:ui` | Prueba de humo de la interfaz con Playwright (ver §5). |

Antes de cualquier commit, la batería es: `npm run lint`, `npx tsc --noEmit`, `node --test tests/*.test.mjs` y
`npx vinext build`.

## 3. Entrar en local

La identidad sale de las cabeceras de ChatGPT Sites en local y de Google OAuth (con cookie firmada) en el VPS.

- **Cabecera de desarrollo:** `scripts/open-in-chrome.py [puerto]` abre Chrome real con Playwright inyectando
  `oai-authenticated-user-email`. Por defecto entra como `techlab@mgcglobalgroup.com` (administrador local).
- **Para probar otro rol**, manda esa cabecera con el correo de otra persona del equipo. Hay que existir en la
  tabla `users`; si no, aparece «no estás en el equipo».
- **Google en `/acceso`** funciona en local, pero exige `SESSION_SECRET` u `OAUTH_TOKEN_KEY`.
- **En el VPS** las cabeceras `oai-authenticated-user-*` se ignoran a propósito.

## 4. Pruebas automáticas

- Hay **79 archivos** `tests/*.test.mjs`. Cada uno empieza con `import "./_alias.mjs"`, que resuelve el alias `@/…`
  y los imports sin extensión.
- La convención clave es el sufijo **`-pura`**: los módulos `lib/*-pura.ts` no usan red ni entorno, así que se
  prueban directo y no necesitan credenciales. No hay mocks de Google, Meta ni LinkedIn: lo que se prueba es lógica
  pura (traducción de objetivos, validaciones, constructores de peticiones, reglas, firmas de sesión…).
- `tests/ui-components.test.mjs` levanta Vite en modo middleware y lee `dist/`, así que necesita un build previo.
- Un módulo nuevo que arme peticiones a una plataforma debería nacer como `-pura` con su prueba, igual que
  `lib/linkedin-nativo-pura.ts` o `lib/tiktok-nativo-pura.ts`.

## 5. Prueba de humo de la interfaz

`scripts/prueba_ui.py` recorre las pantallas principales con un servidor abierto y falla si alguna da error de
página o pierde un elemento clave. **Solo lee; no escribe en ninguna plataforma.**

```
py -3.12 scripts/prueba_ui.py
URL=http://localhost:5195 CLIENTE=Colbún EMAIL=tgalvez@mgcglobalgroup.com py -3.12 scripts/prueba_ui.py
```

Requiere `pip install playwright` y Chrome instalado.

## 6. Probar sin tocar nada real (simulación aislada)

Cuando haya que ejercitar flujos de equipo (solicitar, aprobar, rechazar, permisos por rol) **sin** que queden
registros en la auditoría real ni se llame a ninguna plataforma, se trabaja en una **copia desechable**:

1. Copia el proyecto a una **ruta corta** (por ejemplo `C:\Users\<tú>\wsim`), **sin** `.dev.vars`, `.git`, `dist`
   ni `outputs`. Incluye `.wrangler` para tener una base propia.
2. Enlaza `node_modules` con una *junction* al del proyecto real (no lo copies).
3. Levanta `npx vite --port 3056` desde la copia. Sin credenciales, cualquier llamada a una plataforma falla; eso
   es lo buscado.
4. Entra con la cabecera `oai-authenticated-user-email` de cada rol que quieras (admin, supervisor, analista).
5. **Al terminar**, apaga el servidor y borra la copia. Todo lo registrado en ella desaparece con ella.

Reglas aprendidas, para no repetir errores:

- **Nunca renombres ni muevas el `.dev.vars` real** para «pausar» las credenciales. Aísla con una copia sin ese
  archivo.
- **Usa una ruta corta.** Con rutas largas, Miniflare no abre la base de datos y toda ruta responde 500.
- **No uses `--force` en Vite si `node_modules` es compartido.** La caché de dependencias vive en
  `node_modules/.vite`; si dos copias comparten `node_modules`, comparten caché y una puede romper a la otra.
- **No leas ni copies valores de secretos** al probar. Para revisar qué variables hay, mira solo los nombres.
- Con los puertos: usa uno distinto del de tu servidor real y apaga el de simulación al acabar.

## 7. Convenciones del repo

- **Identificadores y comentarios en español.** Los comentarios explican el porqué (decisiones, bugs reales,
  límites de una plataforma), no lo que hace la línea.
- **Sufijo `-pura`** para lógica sin red ni entorno.
- **Fin de línea mezclado.** El repo usa `core.autocrlf=true` y no tiene `.gitattributes`: unos 220 archivos están
  en CRLF y unos 320 en LF en el árbol de trabajo. Al editar con scripts, normaliza `\r\n` y no asumas el formato.
  Un `.sh` en CRLF puede romper bash.
- **Next ignora carpetas que empiezan con `_`** dentro de `app/`: no pongas rutas ahí. Los helpers de pruebas
  `tests/_alias*.mjs` usan ese prefijo para quedar fuera del patrón `*.test.mjs`.
- `components/ui/` es shadcn en bruto (reglas de lint relajadas).
- **Commits:** los hace quien administra el repo; el flujo es acumular en la rama de trabajo y abrir un PR a `main`
  (ver el despliegue).

## 8. Archivos que no se versionan

`/node_modules`, `.env*`, `.dev.vars`, `.mcp.json`, `/dist/`, `/.wrangler/`, `/.sites-runtime/`, `/outputs/`,
`/work/`, `/datos/`, `*.tsbuildinfo`, `*.pem`. En el árbol de trabajo puede haber cosas sin versionar a propósito
(por ejemplo `public/deck/` o `scripts/prueba_ui.py`): no las agregues a un commit sin preguntar.
