# Design System — Padel App

## Product Context
- **What this is:** PWA mobile-first para organizar partidos de padel y gestionar reservas entre amigos
- **Who it's for:** Jugadores casuales de padel en Argentina coordinando partidos semanales via WhatsApp
- **Space/industry:** Sports social / booking (competidores: Playtomic, Spond, Padel Mates)
- **Project type:** Mobile-first web app (PWA)

## Aesthetic Direction
- **Direction:** Athletic / Bold
- **Decoration level:** Minimal — sin glass-morphism, sin backdrop-blur, sin gradientes decorativos. Cards solidos, informacion clara.
- **Mood:** Ropa deportiva premium. Nike Run Club meets tarjeta deportiva. Limpio, directo, con personalidad. La informacion es la decoracion.
- **Anti-patterns:**
  - NO glass-morphism (backdrop-filter, blur)
  - NO gradientes en botones
  - NO sombras pesadas decorativas
  - NO border-radius uniformes en todo
  - NO purple/violet accents
  - NO 3-column icon grids

## Typography
- **Display/Hero:** Sora 800 — titulos, horarios grandes, brand
- **Body:** Sora 600/700 — venue names, labels, nav
- **UI/Labels:** Sora 400/600 — metadata, secondary text
- **Scale:**
  - Hero time: 28px (en cards)
  - Card date: 18px bold
  - Section labels: 11px uppercase tracking 0.2em
  - Body: 14px
  - Small/meta: 11-12px
- **Loading:** Google Fonts `family=Sora:wght@400;600;700;800`

## Color
- **Approach:** Restrained — 1 accent + neutrals. El verde es raro y significativo.
- **Background:** `--blue-950: #010614`
- **Surface/Cards:** `--panel: rgba(255,255,255,0.03)` con `--stroke: rgba(255,255,255,0.06)`
- **Accent:** `--accent: #a8ff3d` — solo en CTAs primarios, chips HOY, badges activos, nav active
- **Text:**
  - Primary: `--text: #ffffff`
  - Secondary: `--text-dim: #94b2e6` (rgba 255,255,255,0.55 equivalent)
  - Muted: `--text-muted: #5a7baa` (rgba 255,255,255,0.3 equivalent)
- **Semantic:**
  - `--success: #34d399` — confirmado, completo
  - `--danger: #f87171` — cancelado, error
  - `--warning: #fbbf24` — quizas, faltan jugadores
  - `--info: #60a5fa` — chip MANANA, informativo

## Spacing
- **Base unit:** 4px
- **Density:** Comfortable
- **Scale:** 4 / 8 / 12 / 16 / 20 / 24 / 32 / 48 / 64
- **Card padding:** 18-20px
- **Card margin:** 16px horizontal, 12px between cards
- **Section label padding:** 24px top, 10px bottom

## Layout
- **Approach:** Grid-disciplined, card-based
- **Card anatomy (match card):**
  - Top row: fecha (left) + hora (right)
  - Fecha: chip contextual (HOY/MANANA/ESTA SEMANA) + dia completo ("Lunes 31")
  - Hora: 28px bold, right-aligned
  - Middle: venue + cancha
  - Bottom: player avatars + action buttons OR status badge
- **Border radius:**
  - Cards: 16px
  - Buttons: 12px
  - Avatars: 10px (squared-rounded, not circles)
  - Chips/badges: 6-8px
  - Pills (nav): 999px
- **Max content width:** 100% (mobile-first, no max-width constraint)

## Components

### Date Chips
- HOY: `background: #a8ff3d; color: #010614`
- MANANA: `background: rgba(96,165,250,0.15); color: #60a5fa`
- ESTA SEMANA / default: `background: rgba(255,255,255,0.06); color: rgba(255,255,255,0.4)`

### Player Avatars (32x32, border-radius 10px)
- Confirmed: `bg rgba(52,211,153,0.12); color #34d399; border 1px solid rgba(52,211,153,0.25)`
- Maybe: `bg rgba(251,191,36,0.12); color #fbbf24; border 1px solid rgba(251,191,36,0.25)`
- Empty: `bg rgba(255,255,255,0.03); color rgba(255,255,255,0.15); border 1px dashed rgba(255,255,255,0.12)`

### Buttons
- Primary CTA: `background: #a8ff3d; color: #010614; font-weight: 800; uppercase; letter-spacing: 0.1em`
- Outline: `background: transparent; border: 1px solid rgba(255,255,255,0.12); color: rgba(255,255,255,0.5)`
- No gradients. No shadows. Flat and bold.

### Status Badges
- Complete: `bg rgba(52,211,153,0.1); color #34d399`
- Waiting: `bg rgba(251,191,36,0.1); color #fbbf24`
- Font: 11px uppercase tracking 0.08em

### Bottom Nav
- SVG stroke icons (stroke-width: 1.8, stroke-linecap: round)
- Active: `color: #a8ff3d`
- Inactive: `color: rgba(255,255,255,0.3)`
- Labels: 10px, font-weight 600

### Pending Card
- `border-left: 3px solid #a8ff3d`
- `background: rgba(168,255,61,0.02)` (barely tinted)

## Motion
- **Approach:** Minimal-functional
- **Easing:** `cubic-bezier(0.23, 1, 0.32, 1)` for enters, ease-out for exits
- **Duration:** micro 100ms, short 200ms, medium 350ms
- **Splash:** Cinematic entrance (court -> racket slide-up -> logo scale-in), exit with scale-up 1.06
- **Page transitions:** None (instant tab switches)
- **Hover/tap:** translateY(-2px) on cards, no scale

## Decisions Log
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-03-31 | Athletic/Bold direction chosen | User wanted less "dashboard tech", more sporty. Researched Playtomic, Spond, Court Quest. |
| 2026-03-31 | Date > Time hierarchy | User feedback: date as protagonist (left), time secondary (right). Full day names. |
| 2026-03-31 | HOY/MANANA chips | Contextual time chips give instant recognition without reading the date. |
| 2026-03-31 | Squared-rounded avatars (10px) | Differentiates from generic circle avatars. More athletic/modern. |
| 2026-03-31 | No glass-morphism | Explicit departure from previous design. Solid cards, no blur, no backdrop-filter. |
| 2026-03-31 | Keep palette #010614 + #a8ff3d | User explicitly liked the color system. Only the design language changes. |
