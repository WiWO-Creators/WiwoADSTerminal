# Wiwo Thinking Orb — Kit de portabilidad

Documento para copiar/pegar el **Thinking Orb** en otro proyecto. Incluye tokens de color, animaciones, HTML, CSS y componente React.

---

## 1. Resumen

El Thinking Orb tiene **dos variantes**:

| Variante | Tamaños | Uso |
|----------|---------|-----|
| **inline** | `xs` (12px), `sm` (16px), `md` (24px) | Botones, filas de tabla, indicadores junto a texto |
| **stage** (volumétrico) | `lg` (112px), `xl` (208px) | Paneles de carga, transiciones de ruta, presencia de IA |

**Estados:** `idle` · `listening` · `thinking` (default) · `generating` · `routing` · `success` · `error` · `retry`

Cada estado cambia color, ritmo de animación y efectos (scan, trails, anillos, bloom, notch).

---

## 2. Tokens de color (obligatorios)

Pega esto en `:root` de tu CSS global:

```css
:root {
  /* Marca Wiwo Neo */
  --wiwo-blue: #4242ff;
  --wiwo-blue-deep: #2e2ee6;
  --wiwo-purple: #8d7cff;
  --wiwo-green: #3bff00;
  --wiwo-cyan: #00c2ff;
  --wiwo-ink: #292929;
  --wiwo-beige: #f8fad7;
  --wiwo-gradient-primary: linear-gradient(103deg, #3bff00 0%, #4242ff 100%);

  /* Motion */
  --ease-out: cubic-bezier(0.22, 1, 0.36, 1);
  --ease-in-out: cubic-bezier(0.65, 0, 0.35, 1);
  --ease-spring: cubic-bezier(0.34, 1.4, 0.64, 1);
  --ease-expressive: cubic-bezier(0.2, 0, 0, 1);

  /* Solo si usás wiwo-orb-aura en light mode */
  --background: #f8fad7;
}
```

Colores del orbe volumétrico (se definen en el stage, no hace falta en `:root`):

```css
--orb-light-blue: rgba(66, 66, 255, .84);
--orb-light-lime: rgba(59, 255, 0, .78);
--orb-light-milk: rgba(248, 250, 215, .72);
```

---

## 3. Componente React

Archivo: `thinking-orb.tsx`

```tsx
import type { CSSProperties } from "react";

const SIZE_PX = { xs: 12, sm: 16, md: 24, lg: 40, xl: 72 } as const;
const STAGE_PX = { md: 84, lg: 112, xl: 208 } as const;
const ORB_CANVAS = 600;

const SPARKS = [
  { sx: "70%", sy: "18%", size: 18, color: "rgba(248, 250, 215, .92)", speed: "5600ms", delay: "-900ms" },
  { sx: "25%", sy: "72%", size: 13, color: "rgba(66, 66, 255, .92)", speed: "6800ms", delay: "-2400ms" },
  { sx: "79%", sy: "68%", size: 22, color: "rgba(59, 255, 0, .9)", speed: "6200ms", delay: "-1800ms" },
  { sx: "34%", sy: "24%", size: 11, color: "rgba(248, 250, 215, .72)", speed: "7400ms", delay: "-3100ms" },
] as const;

export type OrbState =
  | "idle"
  | "listening"
  | "thinking"
  | "generating"
  | "routing"
  | "success"
  | "error"
  | "retry";

const STATE_LABEL: Record<OrbState, string> = {
  idle: "En espera",
  listening: "Escuchando",
  thinking: "Pensando",
  generating: "Generando",
  routing: "Coordinando",
  success: "Listo",
  error: "Error",
  retry: "Reintentando",
};

export function ThinkingOrb({
  size = "md",
  state = "thinking",
  variant = "auto",
  bare = false,
  className,
  label,
}: {
  size?: keyof typeof SIZE_PX;
  state?: OrbState;
  variant?: "auto" | "inline" | "stage";
  bare?: boolean;
  className?: string;
  label?: string;
}) {
  const a11yLabel = label ?? STATE_LABEL[state];
  const useStage =
    variant === "stage" || (variant === "auto" && (size === "lg" || size === "xl"));

  if (useStage) {
    const px = STAGE_PX[size === "lg" || size === "xl" ? size : "md"];
    return (
      <span
        role={a11yLabel ? "status" : undefined}
        aria-label={a11yLabel || undefined}
        aria-hidden={a11yLabel ? undefined : "true"}
        data-thinking-state={state}
        className={`wiwo-orb-stage ${bare ? "wiwo-orb-stage--bare" : ""} ${className ?? ""}`}
        style={{ width: px, height: px, "--orb-fit": px / ORB_CANVAS } as CSSProperties}
      >
        <span className="wiwo-orb-canvas" aria-hidden="true">
          <span className="orb-state-field">
            <span className="orb-state-ring" />
            <span className="orb-state-ring alt" />
            <span className="orb-scan-line" />
            <span className="orb-output-trail one" />
            <span className="orb-output-trail two" />
            <span className="orb-output-trail three" />
            <span className="orb-success-burst" />
            <span className="orb-retry-notch" />
          </span>
          <span className="wiwo-thinking-orb">
            <span className="orb-pulse" />
            <span className="orb-pulse" />
            <span className="orb-pulse" />
            <span className="orb-liquid-veil" />
            <span className="orb-caustic" />
            <span className="orb-light-field" />
            <span className="orb-aurora orb-aurora-one" />
            <span className="orb-aurora orb-aurora-two" />
            <span className="orb-aurora orb-aurora-three" />
            <span className="orb-core" />
            <span className="orb-glint" />
          </span>
          <span className="orb-particle" />
          <span className="orb-particle" />
          <span className="orb-particle" />
          {SPARKS.map((s) => (
            <span
              key={`${s.sx}-${s.sy}`}
              className="orb-spark"
              style={
                {
                  "--sx": s.sx,
                  "--sy": s.sy,
                  "--spark-size": `${s.size}px`,
                  "--spark-color": s.color,
                  "--spark-speed": s.speed,
                  "--spark-delay": s.delay,
                } as CSSProperties
              }
            />
          ))}
        </span>
      </span>
    );
  }

  const px = SIZE_PX[size];
  const stateClass = state === "thinking" ? "" : `wiwo-orb--${state}`;
  return (
    <span
      role={a11yLabel ? "status" : undefined}
      aria-label={a11yLabel || undefined}
      aria-hidden={a11yLabel ? undefined : "true"}
      className={`wiwo-orb ${stateClass} ${className ?? ""}`}
      style={{ width: px, height: px }}
    />
  );
}
```

### Uso React

```tsx
// Botón / inline pequeño
<ThinkingOrb size="xs" state="generating" label="" />

// Panel de carga grande
<ThinkingOrb size="xl" state="thinking" label="" bare />

// Forzar variante
<ThinkingOrb size="md" variant="inline" state="generating" />
<ThinkingOrb size="lg" variant="stage" state="generating" />
```

---

## 4. HTML plano (sin React)

### 4a. Orb inline (botón / indicador)

```html
<!-- thinking (default) -->
<span class="wiwo-orb" style="width:16px;height:16px" role="status" aria-label="Generando"></span>

<!-- generating -->
<span class="wiwo-orb wiwo-orb--generating" style="width:16px;height:16px" role="status" aria-label="Generando"></span>

<!-- idle -->
<span class="wiwo-orb wiwo-orb--idle" style="width:16px;height:16px"></span>
```

Tamaños inline: `xs=12`, `sm=16`, `md=24`.

### 4b. Orb volumétrico (stage)

Copiá este bloque y cambiá `data-thinking-state` + `--orb-fit` + width/height del contenedor:

```html
<span
  class="wiwo-orb-stage"
  data-thinking-state="thinking"
  style="width:208px;height:208px;--orb-fit:0.3467"
  role="status"
  aria-label="Pensando"
>
  <span class="wiwo-orb-canvas" aria-hidden="true">
    <span class="orb-state-field">
      <span class="orb-state-ring"></span>
      <span class="orb-state-ring alt"></span>
      <span class="orb-scan-line"></span>
      <span class="orb-output-trail one"></span>
      <span class="orb-output-trail two"></span>
      <span class="orb-output-trail three"></span>
      <span class="orb-success-burst"></span>
      <span class="orb-retry-notch"></span>
    </span>
    <span class="wiwo-thinking-orb">
      <span class="orb-pulse"></span>
      <span class="orb-pulse"></span>
      <span class="orb-pulse"></span>
      <span class="orb-liquid-veil"></span>
      <span class="orb-caustic"></span>
      <span class="orb-light-field"></span>
      <span class="orb-aurora orb-aurora-one"></span>
      <span class="orb-aurora orb-aurora-two"></span>
      <span class="orb-aurora orb-aurora-three"></span>
      <span class="orb-core"></span>
      <span class="orb-glint"></span>
    </span>
    <span class="orb-particle"></span>
    <span class="orb-particle"></span>
    <span class="orb-particle"></span>
    <span class="orb-spark" style="--sx:70%;--sy:18%;--spark-size:18px;--spark-color:rgba(248,250,215,.92);--spark-speed:5600ms;--spark-delay:-900ms"></span>
    <span class="orb-spark" style="--sx:25%;--sy:72%;--spark-size:13px;--spark-color:rgba(66,66,255,.92);--spark-speed:6800ms;--spark-delay:-2400ms"></span>
    <span class="orb-spark" style="--sx:79%;--sy:68%;--spark-size:22px;--spark-color:rgba(59,255,0,.9);--spark-speed:6200ms;--spark-delay:-1800ms"></span>
    <span class="orb-spark" style="--sx:34%;--sy:24%;--spark-size:11px;--spark-color:rgba(248,250,215,.72);--spark-speed:7400ms;--spark-delay:-3100ms"></span>
  </span>
</span>
```

**Fórmula de escala:** `--orb-fit = tamañoEnPx / 600`  
Ejemplos: `lg 112px → 0.1867` · `xl 208px → 0.3467`

**Variante bare** (sin caja oscura propia, para panel ya oscuro):

```html
<span class="wiwo-orb-stage wiwo-orb-stage--bare" ...>
```

---

## 5. Contenedores opcionales

### Panel oscuro de IA (`wiwo-orb-panel`)

```html
<div class="wiwo-orb-panel" style="display:flex;align-items:center;gap:1rem;border-radius:1rem;padding:1rem 1.25rem">
  <span class="wiwo-orb-stage wiwo-orb-stage--bare" data-thinking-state="thinking" style="width:112px;height:112px;--orb-fit:0.1867"></span>
  <!-- ...canvas interno igual que arriba... -->
  <div>
    <p style="color:#f8fad7;font-weight:600">Analizando datos…</p>
    <p style="color:rgba(248,250,215,.65);font-size:.75rem">La IA está trabajando…</p>
  </div>
</div>
```

### Aura para fondo claro (`wiwo-orb-aura`)

Envuelve el orbe `bare` xl cuando el fondo de la página es claro. Crea un pozo oscuro difuminado para que el `mix-blend-mode: screen` funcione:

```html
<div class="wiwo-orb-aura" style="width:280px;height:280px">
  <span class="wiwo-orb-stage wiwo-orb-stage--bare" data-thinking-state="thinking" style="width:208px;height:208px;--orb-fit:0.3467">
    <!-- canvas -->
  </span>
</div>
```

---

## 6. CSS completo

Copiá el bloque entero en tu hoja de estilos. **No depende de Tailwind.**

Ver archivo adjunto en el repo: [`docs/thinking-orb.css`](./thinking-orb.css) — contiene todos los `@keyframes` y clases.

Resumen de secciones del CSS:

| Sección | Clases / keyframes |
|---------|-------------------|
| Inline | `.wiwo-orb`, `.wiwo-orb--{estado}`, `wiwo-orb-breathe`, `wiwo-orb-morph`, `wiwo-orb-spin`, etc. |
| Stage | `.wiwo-orb-stage`, `.wiwo-orb-canvas`, `.wiwo-thinking-orb`, `.orb-*` |
| Estados stage | `[data-thinking-state="idle"]` … `[data-thinking-state="retry"]` |
| Wrappers | `.wiwo-orb-panel`, `.wiwo-orb-aura`, `.wiwo-orb-stage--bare` |
| Accesibilidad | `@media (prefers-reduced-motion: reduce)` |

---

## 7. Tabla de estados

### Inline (`.wiwo-orb--*`)

| Estado | Clase extra | Comportamiento visual |
|--------|-------------|----------------------|
| thinking | *(ninguna)* | Gradiente verde→azul, respira + morph |
| idle | `wiwo-orb--idle` | Gris, pulso lento |
| listening | `wiwo-orb--listening` | Morado, rebote + ribbon |
| generating | `wiwo-orb--generating` | Más brillante, emanación |
| routing | `wiwo-orb--routing` | Highlight segmentado rápido |
| success | `wiwo-orb--success` | Lima sólido + bloom |
| error / retry | `wiwo-orb--error` / `--retry` | Naranja-rojo, contracción |

### Stage (`data-thinking-state`)

| Estado | FX activos |
|--------|-----------|
| idle | Pulso muy bajo, auroras apagadas |
| listening | Scan vertical + pulso |
| thinking | Anillos orbitando tenues |
| generating | Trails de output saliendo |
| routing | Anillos + haz diagonal |
| success | Bloom celebratorio |
| error / retry | Notch de fricción, colores fríos |

---

## 8. Notas de implementación

1. **El orbe volumétrico necesita fondo oscuro.** Usá `.wiwo-orb-stage` (trae su propio fondo), `.wiwo-orb-panel`, o `.wiwo-orb-aura` + `bare` sobre superficie clara.

2. **`mix-blend-mode: screen`** es clave. El contenedor debe tener `isolation: isolate` (ya incluido en stage/panel/aura).

3. **Canvas fijo 600px:** todo el stage se diseña a 600×600 y escala con `--orb-fit`. No cambies medidas internas; solo el contenedor externo.

4. **`prefers-reduced-motion`:** las animaciones se congelan; el orbe queda como campo de luz estático.

5. **Sin dependencias npm** para el orb en sí. Solo React si usás el componente TSX.

6. **Accesibilidad:** pasá `label=""` para decorativo (`aria-hidden`). Por defecto usa el texto del estado.

---

## 9. Ejemplo HTML mínimo funcional

```html
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <link rel="stylesheet" href="thinking-orb.css" />
</head>
<body style="background:#f8fad7;padding:2rem;font-family:sans-serif">
  <p>Inline: <span class="wiwo-orb wiwo-orb--generating" style="width:16px;height:16px;vertical-align:middle"></span> Generando…</p>

  <div class="wiwo-orb-panel" style="margin-top:2rem;display:flex;align-items:center;gap:1rem;border-radius:1rem;padding:1rem 1.25rem;max-width:420px">
    <!-- pegar aquí el bloque stage bare de la sección 4b -->
  </div>
</body>
</html>
```

---

*Generado desde WiwoMetrics — `components/ui/thinking-orb.tsx` + `app/globals.css`*
