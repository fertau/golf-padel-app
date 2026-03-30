# Design System — Padel App

## Product Context
- **What this is:** PWA para organizar partidos de pádel entre amigos, reservar canchas y gestionar asistencia
- **Who it's for:** Grupos de amigos que juegan pádel regularmente y se organizan por WhatsApp
- **Space/industry:** Sports booking, social coordination (pádel/racket sports)
- **Project type:** Mobile-first PWA (dark-only, no light mode)

## Aesthetic Direction
- **Direction:** Dark Premium + Glassmorphism
- **Decoration level:** Intentional — grain overlay sutil, vidrio esmerilado en paneles, gradientes solo en fondos. Sin blobs, sin círculos decorativos.
- **Mood:** "Noche de pádel con los pibes". Nocturno, eléctrico, premium pero accesible. No es un marketplace de canchas — es la app de tu grupo.
- **Differentiation:** Toda la competencia (Playtomic, Anolla, OpenCourt) usa interfaces claras/blancas genéricas. Dark-only con acento verde lima es deliberadamente distinto.

## Typography
- **Display/Hero:** Sora (weight 700-800) — Geométrica, moderna, grit deportivo sin ser "sporty" genérica
- **Body:** Manrope (weight 400-700) — Legible, personalidad sin ser genérica, excelente en dark mode
- **UI/Labels:** Manrope (weight 600-700, uppercase para labels pequeños)
- **Data/Tables:** Manrope con font-variant-numeric: tabular-nums
- **Code:** JetBrains Mono (si aplica)
- **Loading:** Google Fonts CDN — `https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=Sora:wght@600;700;800&display=swap`
- **Scale:**
  - Hero: 2.5rem (40px) / Sora 800
  - H2: 1.5rem (24px) / Sora 700
  - H3: 1.1rem (17.6px) / Sora 600
  - Body: 1rem (16px) / Manrope 400
  - Small: 0.85rem (13.6px) / Manrope 500
  - Caption: 0.75rem (12px) / Manrope 600
  - Micro: 0.65rem (10.4px) / Manrope 700

> **IMPORTANT:** Never use Inter, Roboto, or system sans-serif as primary font. Body MUST be Manrope. The CSS `font-family` declaration should be `'Manrope', -apple-system, sans-serif` (system fonts as fallback only).

## Color
- **Approach:** Restrained — one accent + neutrals. Color is rare and meaningful.
- **Accent:** `#a8ff3d` — Verde lima fresco. Único acento. Se usa para CTAs, badges activos, headings de sección, indicadores de estado positivo.
- **Accent soft:** `rgba(168, 255, 61, 0.12)` — Para fondos sutiles de elementos con acento
- **Accent light:** `rgba(168, 255, 61, 0.3)` — Para bordes y hovers

### Base palette
| Token | Hex | Usage |
|-------|-----|-------|
| `--blue-950` | `#010614` | Background principal |
| `--blue-900` | `#020c24` | Background secundario, cards |
| `--blue-800` | `#041a4a` | Bordes activos, separadores |
| `--blue-700` | `#052a75` | Hover states |
| `--blue-600` | `#0070f3` | Links, acciones secundarias |
| `--blue-500` | `#0088ff` | Focus rings |
| `--accent` | `#a8ff3d` | Acento primario |

### Text colors
| Token | Hex | Usage |
|-------|-----|-------|
| `--text` | `#ffffff` | Texto principal |
| `--text-dim` | `#94b2e6` | Texto secundario, metadata |
| `--text-muted` | `#5a7baa` | Texto terciario, placeholders |

### Semantic colors
| Token | Hex | Usage |
|-------|-----|-------|
| `--success` | `#34d399` | Confirmado, éxito |
| `--danger` | `#f87171` | Cancelado, error, acciones destructivas |
| `--warning` | `#fbbf24` | Quizás, advertencia |
| `--info` | `#60a5fa` | Informativo, recordatorios |

### Glass tokens
| Token | Value | Usage |
|-------|-------|-------|
| `--glass-bg` | `rgba(255,255,255,0.04)` | Fondo de paneles glass |
| `--glass-border` | `rgba(255,255,255,0.08)` | Borde de paneles |
| `--glass-stroke` | `rgba(255,255,255,0.1)` | Borde de inputs, separadores |

> **Dark mode only.** No existe light mode. El dark mode ES la identidad del producto.

## Spacing
- **Base unit:** 8px
- **Density:** Comfortable
- **Scale:**

| Token | Value | Usage |
|-------|-------|-------|
| `2xs` | 4px | Gaps mínimos entre inline elements |
| `xs` | 8px | Padding interno de chips, gap entre avatares |
| `sm` | 12px | Padding de alertas, gap entre items de lista |
| `md` | 16px | Padding de inputs, margin entre elementos |
| `lg` | 24px | Padding de cards, gap entre secciones |
| `xl` | 32px | Margin entre secciones principales |
| `2xl` | 48px | Separación entre bloques de página |
| `3xl` | 64px | Solo para hero spacing |

## Layout
- **Approach:** Grid disciplinado — mobile-first PWA
- **Max content width:** 480px (centrado)
- **Grid:** Single column, cards apiladas. Sin sidebars.
- **Border radius:**

| Token | Value | Usage |
|-------|-------|-------|
| `--radius-sm` | 12px | Botones, inputs, chips, alertas |
| `--radius-md` | 18px | Cards pequeñas, modals |
| `--radius-lg` | 24px | Cards principales, paneles glass |
| `--radius-full` | 9999px | Avatares, badges circulares |

## Motion
- **Approach:** Intentional — transiciones que ayudan a entender el estado, no decorativas
- **Easing:**
  - Enter: `cubic-bezier(0.23, 1, 0.32, 1)` — decelerate natural
  - Exit: `ease-in`
  - Move: `ease-in-out`
- **Duration:**
  - Micro: 50-100ms (hover, toggle)
  - Short: 150-250ms (button press, input focus)
  - Medium: 250-400ms (card expand, tab switch)
  - Long: 400-700ms (page transition, splash)
- **Rules:**
  - Sin bounce ni spring exagerado
  - Sin animaciones decorativas (blobs, partículas)
  - `transition-elite: all 0.4s cubic-bezier(0.23, 1, 0.32, 1)` como default para paneles

## Component Patterns

### Match Card
- Glass background con border sutil
- Header: título (Sora 700) + badge de conteo (acento)
- Metadata: fecha, cancha, duración (Manrope, text-dim)
- Player avatars: círculos con iniciales, borde por estado (success/warning/dashed)
- Action chips: Juego (acento), Quizás (warning bg), No puedo (danger bg)

### Notification Card
- Glass background con borde izquierdo coloreado por tipo
- Título bold + body dim + timestamp muted
- Colores de borde: acento (default), danger (urgente), success (positivo)

### Bottom Nav
- Fixed, blur background, 3 items
- Active: color acento
- Inactive: text-muted

### Buttons
- Primary: fondo acento, texto blue-950 (dark on light)
- Secondary: transparente, borde glass-stroke, texto blanco
- Ghost: sin fondo ni borde, texto acento

## Anti-patterns (NO hacer)
- ❌ Gradientes violeta/púrpura como acento
- ❌ Grillas de 3 columnas con íconos en círculos de color
- ❌ Centrar todo con spacing uniforme
- ❌ Border-radius uniforme en todos los elementos
- ❌ Botones con gradiente como CTA principal
- ❌ Hero sections genéricas con stock photos
- ❌ Light mode
- ❌ Inter, Roboto, o sans-serif genéricas como font principal
- ❌ Bounce/spring animations
- ❌ Blobs o formas decorativas flotantes

## Decisions Log
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-03-30 | Initial design system created | Created by /design-consultation. Documented existing visual identity + corrected inconsistencies (Inter→Manrope, unused Sora→assigned to headings). |
| 2026-03-30 | Accent color changed from #e8ff3d to #a8ff3d | Original was too yellow against blue-950 background. #a8ff3d is greener, integrates better with the dark palette while maintaining energy. |
| 2026-03-30 | Dark-only decision | Deliberate differentiation from competitors (Playtomic, Anolla, OpenCourt all use light themes). Coherent with "noche de pádel" identity. |
