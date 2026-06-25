---
version: 1.0
name: Daily-AI-Brief-design
description: A monochrome, typography-first news reader built mobile-first. There is no brand accent color — emphasis is carried entirely by contrast (ink #1d1d1f on parchment #f5f5f7, inverting to near-white on black in dark mode). Pretendard Variable unifies Korean and Latin in a single self-hosted font. Cards are hairline-bordered with an 18px radius and zero shadows; chips and badges are full pills. The chrome is a slim frosted header on desktop and a top bar + bottom tab bar on mobile, with safe-area-aware floating CTAs. Light and dark themes are first-class, toggled by next-themes via a `.dark` class.

colors:
  # Light theme (:root)
  background: "#f5f5f7"
  foreground: "#1d1d1f"
  card: "#ffffff"
  card-foreground: "#1d1d1f"
  popover: "#ffffff"
  popover-foreground: "#1d1d1f"
  primary: "#1d1d1f"
  primary-foreground: "#ffffff"
  secondary: "#f5f5f7"
  secondary-foreground: "#1d1d1f"
  muted: "#f5f5f7"
  muted-foreground: "#7a7a7a"
  accent: "#f5f5f7"
  accent-foreground: "#1d1d1f"
  destructive: "#d70015"
  destructive-foreground: "#ffffff"
  border: "#e0e0e0"
  input: "#e0e0e0"
  ring: "#1d1d1f"
  # Dark theme (.dark)
  background-dark: "#000000"
  foreground-dark: "#ffffff"
  card-dark: "#1d1d1f"
  card-foreground-dark: "#ffffff"
  popover-dark: "#1d1d1f"
  popover-foreground-dark: "#ffffff"
  primary-dark: "#f5f5f7"
  primary-foreground-dark: "#1d1d1f"
  secondary-dark: "#1d1d1f"
  muted-dark: "#1d1d1f"
  muted-foreground-dark: "#cccccc"
  accent-dark: "#1d1d1f"
  destructive-dark: "#ff453a"
  border-dark: "#333333"
  input-dark: "#333333"
  ring-dark: "#f5f5f7"
  # Alias tokens (@theme inline — fixed across themes)
  canvas: "#ffffff"
  parchment: "#f5f5f7"
  hairline: "#e0e0e0"
  ink: "#1d1d1f"

typography:
  fontFamily: "var(--font-pretendard), Pretendard Variable, Pretendard, -apple-system, BlinkMacSystemFont, Segoe UI, system-ui, sans-serif"
  display-md:
    fontSize: 34px
    lineHeight: 1.47
    fontWeight: 600
    letterSpacing: tight
    note: "Page hero (h1); shrinks to 28px at ≤419px"
  body:
    fontSize: 17px
    lineHeight: 1.47
    fontWeight: 400
    note: "Default reading size; card titles use weight 600"
  caption:
    fontSize: 14px
    lineHeight: 1.43
    fontWeight: 400
    note: "Meta, summaries, labels, chips"
  label-13:
    fontSize: 13px
    note: "Filter-chip text"
  label-12:
    fontSize: 12px
    note: "Footer copyright"
  label-11:
    fontSize: 11px
    note: "Bottom tab labels, count badges"

rounded:
  none: 0px
  sm: 8px
  md: 12px
  lg: 18px
  xl: 24px
  sheet: 16px
  pill: 9999px
  full: 9999px

spacing:
  xxs: 4px
  xs: 8px
  sm: 12px
  md: 16px
  lg: 24px
  xl: 32px
  xxl: 48px
  header-h: 52px
  tabbar-h: 56px

components:
  article-card:
    backgroundColor: "{colors.card}"
    borderColor: "{colors.border}"
    borderColor-hover: "{colors.foreground}"
    typography: "{typography.body}"
    rounded: "{rounded.lg}"
    padding: 16px
    padding-desktop: 24px
    shadow: none
  category-badge:
    borderColor: "{colors.primary}"
    textColor: "{colors.primary}"
    typography: "{typography.caption}"
    rounded: "{rounded.pill}"
    padding: 2px 10px
    fontWeight: 600
  tag-chip:
    borderColor: "{colors.border}"
    textColor: "{colors.muted-foreground}"
    typography: "{typography.caption}"
    rounded: "{rounded.pill}"
    padding: 2px 8px
  filter-chip:
    borderColor: "{colors.border}"
    textColor: "{colors.muted-foreground}"
    borderColor-hover: "{colors.foreground}"
    typography: "{typography.label-13}"
    rounded: "{rounded.pill}"
    minHeight: 44px
    minHeight-desktop: auto
    padding: 8px 12px
  filter-chip-selected:
    backgroundColor: "{colors.foreground}"
    textColor: "{colors.background}"
    borderColor: "{colors.foreground}"
    rounded: "{rounded.pill}"
    fontWeight: 600
  search-input:
    backgroundColor: transparent
    borderColor: "{colors.input}"
    textColor: "{colors.foreground}"
    typography: "{typography.body}"
    rounded: "{rounded.lg}"
    height: 44px
    height-desktop: 36px
    shadow: none
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.md}"
    height: 44px
    height-desktop: 36px
    padding: 8px 16px
    fontWeight: 600
  button-outline:
    backgroundColor: "{colors.background}"
    borderColor: "{colors.input}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.md}"
  button-ghost:
    backgroundColor: transparent
    textColor: "{colors.foreground}"
    rounded: "{rounded.md}"
  button-destructive:
    backgroundColor: "{colors.destructive}"
    textColor: "{colors.destructive-foreground}"
    rounded: "{rounded.md}"
  site-header:
    backgroundColor: "{colors.background} @ 80% + backdrop-blur"
    borderColor: "{colors.border}"
    height: 52px
    note: "sticky top, z-50, desktop only (hidden on mobile)"
  mobile-top-bar:
    backgroundColor: "{colors.background} @ 80% + backdrop-blur"
    borderColor: "{colors.border}"
    height: 52px
    note: "sticky top, z-50, mobile only"
  bottom-tab-bar:
    backgroundColor: "{colors.background} @ 80% + backdrop-blur"
    borderColor: "{colors.border}"
    height: 56px
    textColor: "{colors.muted-foreground}"
    textColor-active: "{colors.primary}"
    typography: "{typography.label-11}"
    note: "fixed bottom, z-50, mobile only, safe-area padded"
  filter-sheet:
    backgroundColor: "{colors.background} @ 95% + backdrop-blur"
    overlay: "rgba(0,0,0,0.40)"
    rounded: "{rounded.sheet} (top only)"
    maxHeight: 80vh
    note: "mobile bottom sheet, z-60"
  floating-cta-bar:
    backgroundColor: "{colors.background} @ 80% + backdrop-blur"
    borderColor: "{colors.border}"
    note: "fixed bottom, z-40, mobile only, safe-area padded (article detail)"
  kpi-card:
    backgroundColor: "{colors.card}"
    borderColor: "{colors.border}"
    typography: "{typography.body}"
    rounded: "{rounded.lg}"
    padding: 16px
    note: "numbers use tabular-nums; pass=primary, fail=destructive"
  footer:
    backgroundColor: "{colors.muted}"
    textColor: "{colors.muted-foreground}"
    borderColor: "{colors.border}"
    typography: "{typography.caption}"
    padding: 48px 24px
---

## Overview

Daily AI Brief is a **monochrome, typography-first news reader** built mobile-first. It is the inverse of a photography-led marketing site: there are no product tiles, no hero imagery, and — most importantly — **no brand accent color**. Emphasis is carried entirely by **contrast**. On light surfaces that means near-black ink (`{colors.ink}` — #1d1d1f) on parchment (`{colors.parchment}` — #f5f5f7); in dark mode it inverts to near-white on true black. Active and selected states fill with the foreground color and flip the text — they never introduce a hue.

The page is a **card-grid feed**. Each article is a hairline-bordered card at `{rounded.lg}` (18px) with **zero shadow**; chips and badges are full `{rounded.pill}` capsules. Typography does the hierarchy work: a 34px hero, 17px body, 14px caption — set in **Pretendard Variable**, a single self-hosted font that unifies Korean and Latin so there is never a mixed-script seam.

The chrome is an **app shell** that adapts by viewport. On desktop a slim 52px frosted header sticks to the top. On mobile that becomes a top bar plus a fixed bottom tab bar (56px), with filters living in a bottom sheet and primary actions in safe-area-aware floating bars. Light and dark themes are first-class, toggled by `next-themes` through a `.dark` class on `<html>`.

**Key Characteristics:**

- Monochrome system — emphasis is **contrast, not color**. No Action Blue, no second accent. The only chromatic token is `{colors.destructive}` (red), reserved for destructive/alert states in the Admin console.
- Single self-hosted font: **Pretendard Variable** (weight 45–920) for both Korean and Latin.
- Light + dark themes are equal citizens, defined as paired `:root` / `.dark` token sets and switched via a class.
- Card-grid feed (1 → 2 → 3 columns) instead of full-bleed tiles.
- **No shadows anywhere.** Layering is expressed with hairline borders (`{colors.border}`) and `backdrop-blur` frosted bars only.
- Two radius grammars: `{rounded.lg}` (18px) for cards/inputs, `{rounded.pill}` for chips/badges. `{rounded.md}` (12px) for buttons, `{rounded.sheet}` (16px) top-corners for the mobile sheet.
- Mobile-first app shell: frosted sticky header (52px) ↔ mobile top bar + bottom tab bar (56px), with `env(safe-area-inset-*)` handling for notches.
- Tailwind v4: tokens live in `@theme inline` inside [src/app/globals.css](src/app/globals.css). There is no `tailwind.config` file.

## Colors

> **Source of truth:** [src/app/globals.css](src/app/globals.css) `:root` (light) and `.dark` (dark). The shadcn variable **names** are preserved; only the **values** are mapped to this system, so all shadcn primitives stay compatible.

### Token Map (Light ↔ Dark)

| Token                       | Light (`:root`) | Dark (`.dark`) | Use                                            |
| --------------------------- | --------------- | -------------- | ---------------------------------------------- |
| `{colors.background}`       | `#f5f5f7`       | `#000000`      | Page canvas (parchment ↔ black)                |
| `{colors.foreground}`       | `#1d1d1f`       | `#ffffff`      | Body / heading text                            |
| `{colors.card}`             | `#ffffff`       | `#1d1d1f`      | Card & popover surface                         |
| `{colors.card-foreground}`  | `#1d1d1f`       | `#ffffff`      | Text on cards                                  |
| `{colors.primary}`          | `#1d1d1f`       | `#f5f5f7`      | Emphasis fill (ink ↔ near-white) — **not a brand hue** |
| `{colors.primary-foreground}` | `#ffffff`     | `#1d1d1f`      | Text on primary fill                           |
| `{colors.secondary}` / `{colors.muted}` / `{colors.accent}` | `#f5f5f7` | `#1d1d1f` | Secondary surfaces           |
| `{colors.muted-foreground}` | `#7a7a7a`       | `#cccccc`      | Dimmed meta / captions                         |
| `{colors.destructive}`      | `#d70015`       | `#ff453a`      | Destructive / alert (Admin only)               |
| `{colors.destructive-foreground}` | `#ffffff` | `#ffffff`      | Text on destructive                            |
| `{colors.border}` / `{colors.input}` | `#e0e0e0` | `#333333`    | Hairline borders, input outlines               |
| `{colors.ring}`             | `#1d1d1f`       | `#f5f5f7`      | Focus ring                                     |

### Alias Tokens

Fixed across both themes (defined in `@theme inline`), used as raw Tailwind utilities (`bg-canvas`, `bg-parchment`, `border-hairline`, `text-ink`):

- `{colors.canvas}` — #ffffff
- `{colors.parchment}` — #f5f5f7
- `{colors.hairline}` — #e0e0e0
- `{colors.ink}` — #1d1d1f

### Browser Chrome

`themeColor` switches the mobile browser UI by scheme: light `#f5f5f7`, dark `#000000`. The viewport uses `viewportFit: "cover"` so content can extend under notches/safe areas.

### Principles

- **Emphasis is contrast, not color.** Selected/active = fill with `{colors.foreground}` and invert the text (`bg-foreground text-background`). Hover = darken a hairline border toward `{colors.foreground}`. No hue is ever introduced for emphasis.
- **No brand accent.** There is no Action Blue or any second brand color. The only chromatic value in the system is `{colors.destructive}`, and it appears solely in the Admin console for destructive actions and threshold breaches.
- **No gradients.** Surfaces are flat. Depth comes from the light/dark surface step and frosted (`backdrop-blur`) bars.

## Typography

### Font Family

- **Pretendard Variable** — a single self-hosted variable font (`public/fonts/PretendardVariable.woff2`, weight range **45–920**, `display: swap`), loaded via `next/font/local` and exposed as `--font-pretendard`.
- **Korean font = Pretendard.** This is the deliberate, primary choice: Pretendard covers both Hangul and Latin glyphs, so Korean and English render in one consistent face with no mixed-script seam. There is no separate Korean/Latin font pairing.
- **Stack** (from `--font-sans`): `var(--font-pretendard), "Pretendard Variable", Pretendard, -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif`. The system fallbacks only apply before the self-hosted woff2 loads.

### Scale

| Token                      | Size            | Line Height | Use                                                       |
| -------------------------- | --------------- | ----------- | --------------------------------------------------------- |
| `{typography.display-md}`  | 34px (28px ≤419px) | 1.47     | Page hero `h1` — the only display size                    |
| `{typography.body}`        | 17px            | 1.47        | Body copy, card titles (at weight 600), inputs            |
| `{typography.caption}`     | 14px            | 1.43        | Meta, summaries, labels, chips, footer body               |
| `{typography.label-13}`    | 13px            | —           | Filter-chip / filter-sheet trigger text                   |
| `{typography.label-12}`    | 12px            | —           | Footer copyright                                          |
| `{typography.label-11}`    | 11px            | —           | Bottom tab labels, active-count badges                    |

### Principles

- **Weight via Tailwind, not tokens.** The CSS exposes no weight tokens; components apply `font-semibold` (600) for emphasis — card titles, active chips, KPI values — and `font-normal` (400) for body and secondary text. The mid-tones in between are unused.
- **`tracking-tight` on headings.** Hero and card titles tighten letter-spacing slightly; body and caption keep default tracking.
- **Body at 17px.** Reading size is 17px with a generous 1.47 line-height — a "reading, not scanning" pace.
- **One responsive type step.** Only the hero responds to width (34px → 28px at ≤419px); everything else holds its size and reflows via container width.

### Why Pretendard

Pretendard is the open-source face closest to the Apple-system look while shipping full, high-quality Hangul. Self-hosting one variable woff2 (rather than SF Pro + a separate Korean font) guarantees identical rendering across OSes and removes any Latin/Hangul metric mismatch. The full 45–920 weight axis means every weight the UI needs comes from a single file.

## Layout

### Containers

| Surface                  | Max width            |
| ------------------------ | -------------------- |
| Feed `/`, Search, Admin  | `1440px`             |
| Article detail           | `max-w-2xl` (672px)  |
| Login                    | `max-w-sm` (384px)   |

All are centered with `mx-auto` and padded `px-4 py-6` on mobile, `md:px-6 md:py-12` on desktop. Major sections stack with `gap-8`.

### Feed Grid

`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3` with `gap-4` — one column on phones, two at `sm` (640px), three at `lg` (1024px).

### App Shell Structure

The root layout ([src/app/layout.tsx](src/app/layout.tsx)) composes, in order: `Header` (desktop), `MobileTopBar` (mobile), the `flex-1` content area, `Footer`, and `BottomTabBar` (mobile). The `<body>` reserves bottom space for the tab bar with `pb-[calc(3.5rem+env(safe-area-inset-bottom))]`, dropped to `pb-0` at `md`.

### Whitespace

Card internals breathe at `p-4` (mobile) → `p-6` (desktop). Filter rows use `gap-2` between chips and `gap-3` between rows; article-grid cards use `gap-4`; page sections use `gap-8`. The footer is the densest area, intentionally compact to expose the full nav at a glance.

## Elevation & Depth

| Level        | Treatment                                  | Use                                                       |
| ------------ | ------------------------------------------ | --------------------------------------------------------- |
| Flat         | No shadow, no border                       | Page canvas, content areas                                |
| Hairline     | 1px `{colors.border}`                       | Cards, inputs, tables, KPI panels, sheet edges            |
| Surface step | Card (`{colors.card}`) over canvas          | Light/dark surface change provides separation             |
| Frosted      | `bg-background/80` + `backdrop-blur`        | Header, mobile top bar, bottom tab bar, floating CTA bars |

**Shadow philosophy — there are no shadows.** The codebase forbids them outright (`shadow-none` is applied where shadcn would otherwise add one). Depth is communicated by (a) the hairline border, (b) the card-vs-canvas surface step, and (c) `backdrop-blur` on the floating chrome. This is the single most important deviation from a typical shadcn build.

## Shapes

### Border Radius Scale

| Token            | Value   | Use                                                          |
| ---------------- | ------- | ------------------------------------------------------------ |
| `{rounded.none}` | 0px     | Full-width bars                                              |
| `{rounded.sm}`   | 8px     | (available)                                                  |
| `{rounded.md}`   | 12px    | Buttons (shadcn default), small selects                      |
| `{rounded.lg}`   | 18px    | Cards, inputs, tables, KPI panels — the default card radius (`--radius`) |
| `{rounded.xl}`   | 24px    | (available)                                                  |
| `{rounded.sheet}`| 16px    | Mobile bottom sheet, top corners only (`rounded-t-2xl`)      |
| `{rounded.pill}` | 9999px  | Category badges, tag chips, filter chips — the chip grammar  |

Custom usages (`SearchInput`, Admin buttons/inputs) override the shadcn button default of `{rounded.md}` up to `{rounded.lg}` for visual consistency with cards.

## Components

### Chrome

**`site-header`** — Desktop-only (`hidden md:block`), sticky top, `z-50`. Background `{colors.background}` at 80% with `backdrop-blur` (frosted), 1px bottom `{colors.border}`, height 52px (`h-13`), container max `1440px`. Left: wordmark "Daily AI Brief" in `{colors.primary}`, 18px / 600 / tight. Right: ghost icon buttons (Search, theme toggle), `gap-1`.

**`mobile-top-bar`** — Mobile-only (`flex md:hidden`), identical frosted treatment and height to the header; full-width with `px-4` padding.

**`bottom-tab-bar`** — Mobile-only (`md:hidden`), `fixed inset-x-0 bottom-0`, `z-50`, frosted, 1px top border, height 56px (`h-14`), safe-area padded. Each tab is `flex-1`, vertically stacked icon (`size-5`) + 11px label. Active = `{colors.primary}` / 600; inactive = `{colors.muted-foreground}` / 400 — **no hover hue, only the active step**. Hidden on `/article/*` and `/admin/login` for an immersive view; swaps to Admin tabs on `/admin/*`.

**`footer`** — Background `{colors.muted}`, text `{colors.muted-foreground}`, 1px top border, padding `py-12 px-6`, container max `1440px`. Wordmark + description in `{typography.caption}`; nav links flex-wrap with `hover:text-primary`; copyright at 12px.

### Cards & Feed

**`article-card`** — `bg-card`, 1px `{colors.border}`, `{rounded.lg}` (18px), padding 16px → 24px (`md:p-6`), `flex flex-col gap-3`, `transition-colors`. **No shadow.** Hover darkens the border to `{colors.foreground}` (the entire card is a `Link`). Composition: meta row (source · `category-badge` · date) → title `{typography.body}` / 600 / tight → summary `{typography.caption}` muted, `line-clamp-3`, relaxed leading → `tag-chip` row (max 3) → optional trending marker `{typography.caption}` / `{colors.primary}` / 600.

**`category-badge`** — `inline-flex w-fit`, 1px `{colors.primary}` border, `{colors.primary}` text, `{rounded.pill}`, `{typography.caption}` / 600, padding `2px 10px`.

**`tag-chip`** — 1px `{colors.border}`, `{colors.muted-foreground}` text, `{rounded.pill}`, `{typography.caption}`, padding `2px 8px`. An overflow "+N" chip drops the border (transparent).

**`kpi-card`** (Admin) — `bg-card`, 1px `{colors.border}`, `{rounded.lg}`, padding 16px, `flex flex-col gap-1`, laid out `grid grid-cols-2 sm:grid-cols-4 gap-3`. Values use `tabular-nums` / 600; pass = `{colors.primary}`, fail = `{colors.destructive}`. Admin tables tint breached rows with `bg-destructive/5`.

### Filters

**`filter-chip`** — `{rounded.pill}`, 1px border, `{typography.label-13}` (13px), `transition-colors`, `min-h-11` (44px touch target) on mobile → `md:min-h-0` on desktop, padding `px-3 py-2` → `md:py-1`.
- Off: `border-border text-muted-foreground hover:border-foreground`.
- **`filter-chip-selected`**: `border-foreground bg-foreground text-background font-semibold` (inverted fill).

**`filter-sheet`** (mobile) — A pill trigger ("필터" + an active-count badge: `bg-foreground text-background rounded-full size-5`, 11px / 600) opens a bottom sheet: overlay `bg-black/40`, panel `bg-background/95` + `backdrop-blur`, `rounded-t-2xl`, `max-h-[80vh]`, `z-[60]` (above the tab bar). Sticky header with close button; a full-width "결과 보기" submit at the bottom. Desktop shows the `FilterBar` inline instead.

### Buttons & Inputs

**`button-primary`** (shadcn default) — `bg-primary text-primary-foreground`, hover `bg-primary/90`, `{rounded.md}`, `{typography.body}`-ish at `text-sm` / 600. Default size `h-11 px-4 py-2` (44px mobile) → `md:h-9` (36px desktop). Focus = `ring-1 ring-ring`. **No press transform** — interaction is opacity/contrast only. Variants: `button-outline` (`border-input`, hover `bg-accent`), `button-ghost` (hover `bg-accent`), `button-destructive` (`bg-destructive`), `link` (`text-primary` underline). Admin call-sites override radius to `{rounded.lg}`.

**`search-input`** / Input — `bg-transparent` (dark: `dark:bg-input/30`), 1px `{colors.input}`, `{rounded.lg}`, `{typography.body}` (17px), `h-11` → `md:h-9`, **`shadow-none`**. Focus = `border-ring` + `ring-[3px] ring-ring/50`; error = `aria-invalid:border-destructive`. Live search debounces ~300ms before updating the URL.

**`floating-cta-bar`** (article detail, mobile) — `fixed inset-x-0 bottom-0`, `z-40`, 1px top border, `bg-background/80` + `backdrop-blur`, `md:hidden`, padding bottom `calc(0.75rem + env(safe-area-inset-bottom))`. Holds the primary "원문 보기" action; desktop shows it inline in the content flow instead.

## Light / Dark Theme

- **Mechanism.** `next-themes` ([src/components/ThemeProvider.tsx](src/components/ThemeProvider.tsx)) runs `attribute="class"`, `defaultTheme="light"`, `enableSystem`, `disableTransitionOnChange`. It toggles a `.dark` class on `<html>`; every color resolves through the CSS variables, so no component needs theme-specific markup.
- **Token pairing.** Each color is defined twice — `:root` (light) and `.dark` — under the same variable name. See the Colors token map above for every pair.
- **Surface inversion.** Light: parchment canvas, white cards, ink text. Dark: black canvas, `#1d1d1f` cards, white text. Emphasis (`{colors.primary}`) flips from ink to near-white so "filled/active" reads correctly on either canvas.
- **Browser chrome.** `themeColor` and `viewportFit: "cover"` keep the native browser UI in sync with the active theme.

## Responsive Behavior

### Key Breakpoint

The shell pivots at **`md` (768px)**: above it, desktop header + inline filters + multi-column grid; below it, mobile top bar + bottom tab bar + filter sheet + floating CTAs.

| Width   | Layout                                                                 |
| ------- | --------------------------------------------------------------------- |
| ≤419px  | Hero type drops 34px → 28px; single-column feed                        |
| <640px  | 1-column feed; mobile shell (top bar, bottom tabs, filter sheet)       |
| ≥640px  | `sm`: 2-column feed; Admin/source forms go 2-column                    |
| ≥768px  | `md`: desktop header replaces mobile bars; inline FilterBar; `h-9` controls |
| ≥1024px | `lg`: 3-column feed                                                    |
| ≥1440px | Content locks at 1440px; margins absorb extra width                    |

### Touch Targets

Interactive elements meet 44px on mobile via `h-11` (buttons, inputs) and `min-h-11` (filter chips, sheet trigger, Admin text actions), relaxing to `h-9` / `min-h-0` at `md`. The bottom tab bar is 56px tall with full-width `flex-1` tap zones.

### Safe Areas

`env(safe-area-inset-bottom)` is honored by the body bottom padding, the bottom tab bar, the filter sheet, and the article floating CTA bar, so nothing hides under a notch or home indicator.

### Reduced Motion

`@media (prefers-reduced-motion: reduce)` neutralizes all `transition`/`animation` durations — safe because every transition in the system is decorative (color/contrast), never load-bearing.

## Do's and Don'ts

### Do

- Carry emphasis with **contrast** — fill with `{colors.foreground}` and invert text (`bg-foreground text-background`) for selected/active; darken a hairline border on hover.
- Keep every surface monochrome. The only chromatic token is `{colors.destructive}`, and only in the Admin console.
- Use **Pretendard** for all text, Korean and Latin alike — it's the single intended font.
- Bound surfaces with the 1px `{colors.border}` hairline and, for floating chrome, `backdrop-blur` — never a shadow.
- Use `{rounded.lg}` (18px) for cards/inputs and `{rounded.pill}` for chips/badges; keep these two grammars distinct.
- Define new colors as a `:root` / `.dark` pair under one variable name so theming stays automatic.
- Hold body copy at `{typography.body}` (17px) and apply weight with `font-semibold` (600) / `font-normal` (400) only.
- Give mobile controls a 44px target (`h-11` / `min-h-11`) and respect `env(safe-area-inset-*)`.

### Don't

- Don't add a brand accent color or reintroduce Action Blue — emphasis is never a hue.
- Don't add shadows to cards, buttons, inputs, or bars; the system is `shadow-none` by rule.
- Don't use gradients as decoration.
- Don't reach for mid weights (500) — the ladder used is 400 / 600.
- Don't hardcode hex in components; consume the tokens (`bg-card`, `border-border`, `text-muted-foreground`, …) so light/dark resolves automatically.
- Don't use `{colors.destructive}` outside destructive/alert contexts (it's the lone chromatic exception, Admin-only).
- Don't mix radius grammars — chips are pills, cards are `{rounded.lg}`; avoid in-between values.
- Don't let mobile chrome overlap content — reserve space for the 56px tab bar and safe areas.

## Iteration Guide

1. Edit tokens in [src/app/globals.css](src/app/globals.css) (`:root` / `.dark` / `@theme inline`) — this file is the SSOT; this document mirrors it.
2. Always define a color as a light/dark pair under the same variable name.
3. Reference `{token}` refs and Tailwind token utilities — never inline hex.
4. Document Default and Active/Selected states only; hover is a contrast nudge, not a documented state.
5. The font is Pretendard for both scripts — don't introduce a second face.
6. There is no shadow in the system; reach for hairline borders, the surface step, or `backdrop-blur` instead.
7. When adding chrome, decide the `md` pivot first: desktop header vs. mobile top bar + bottom tab bar.

## Known Gaps

- The `@theme inline` typography tokens cover `caption` / `body` / `display-md`; the 11–13px label sizes are applied ad-hoc via `text-[11px]` / `text-[13px]` rather than named tokens.
- Form validation styling is limited to the shadcn `aria-invalid:border-destructive` state plus inline `{colors.destructive}` error text (Admin/login); richer validation states are not yet defined.
- `backdrop-blur` strength uses Tailwind's default; no explicit blur-radius token is formalized.
- `{rounded.sm}` (8px) and `{rounded.xl}` (24px) are defined but currently unused in the UI.
- Dark-mode values are fully tokenized, but a few one-off opacity tints (`bg-destructive/5`, `bg-black/40`) are literals rather than tokens.
