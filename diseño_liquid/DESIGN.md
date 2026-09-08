---
name: AquaGlass Modern
colors:
  surface: '#f5fafc'
  surface-dim: '#d6dbdd'
  surface-bright: '#f5fafc'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#eff4f6'
  surface-container: '#eaeff1'
  surface-container-high: '#e4e9eb'
  surface-container-highest: '#dee3e5'
  on-surface: '#171c1e'
  on-surface-variant: '#3f484c'
  inverse-surface: '#2c3133'
  inverse-on-surface: '#ecf2f4'
  outline: '#6f797c'
  outline-variant: '#bec8cc'
  surface-tint: '#01677d'
  primary: '#004d5f'
  on-primary: '#ffffff'
  primary-container: '#00677d'
  on-primary-container: '#98e3fc'
  inverse-primary: '#86d1ea'
  secondary: '#00677d'
  on-secondary: '#ffffff'
  secondary-container: '#50d9fe'
  on-secondary-container: '#005c70'
  tertiary: '#004e58'
  on-tertiary: '#ffffff'
  tertiary-container: '#006875'
  on-tertiary-container: '#95e5f4'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#b3ebff'
  primary-fixed-dim: '#86d1ea'
  on-primary-fixed: '#001f27'
  on-primary-fixed-variant: '#004e5f'
  secondary-fixed: '#b3ebff'
  secondary-fixed-dim: '#4cd6fb'
  on-secondary-fixed: '#001f27'
  on-secondary-fixed-variant: '#004e5f'
  tertiary-fixed: '#9feffe'
  tertiary-fixed-dim: '#83d3e1'
  on-tertiary-fixed: '#001f24'
  on-tertiary-fixed-variant: '#004f59'
  background: '#f5fafc'
  on-background: '#171c1e'
  surface-variant: '#dee3e5'
  success-emerald: '#10b981'
  error-ruby: '#ba1a1a'
  glass-border: rgba(255, 255, 255, 0.4)
  glass-bg: rgba(255, 255, 255, 0.3)
typography:
  headline-xl:
    fontFamily: Inter
    fontSize: 48px
    fontWeight: '700'
    lineHeight: 56px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
    letterSpacing: -0.01em
  headline-lg-mobile:
    fontFamily: Inter
    fontSize: 28px
    fontWeight: '600'
    lineHeight: 36px
  title-md:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  body-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  label-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 20px
    letterSpacing: 0.01em
  label-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.03em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  unit: 8px
  gutter: 24px
  glass-padding: 24px
  container-padding-mobile: 20px
  container-padding-desktop: 40px
  sidebar-width: 288px
---

## Brand & Style
The brand identity is centered around the concept of "Renewal" and "Purity," reflecting a water utility or management service. The UI adopts a **Glassmorphic Modern** style, characterized by high-transparency layers, vibrant backdrop blurs, and a serene "aquatic" color palette.

The personality is professional yet approachable, utilizing soft gradients and light-refractive borders to create a sense of depth and cleanliness. The goal is to make complex operational data feel lightweight, organized, and "fluid." Use translucent surfaces to maintain a connection with the atmospheric background gradient, ensuring the interface feels integrated rather than monolithic.

## Colors
The palette is a sophisticated range of teals and cyans. The **Primary** (#00677d) provides grounding and authority, while the **Secondary** (#00b4d8) acts as the high-energy "water" accent for buttons and active states.

Backgrounds are not solid; they use a linear gradient from `#f5fafc` to `#e3f2fd`. Functional colors like Emerald (#10b981) are used for positive financial movements, while Ruby (#ba1a1a) identifies critical states like an unopened register. Glass components use white overlays with low opacity (30-40%) to achieve the frosted effect.

## Typography
**Inter** is used exclusively to maintain a clean, systematic, and highly legible interface. The type hierarchy relies on font weight and subtle letter spacing rather than extreme scale changes.

- **Headlines:** Use a tighter tracking (up to -0.02em) and heavier weights (600-700) to feel impactful.
- **Labels:** Small labels utilize uppercase styling and wider tracking (0.03em) for a "technical" or "metadata" feel.
- **Body:** Standardized at 16px for optimal reading against translucent backgrounds.

## Layout & Spacing
The layout follows a **Fixed Sidebar + Fluid Content** model. The sidebar is fixed at 288px (72 units). The main content area utilizes a 12-column grid in spirit, but focuses on modular card clusters separated by a 24px gutter.

Reflow rules:
- **Desktop:** 40px horizontal margins, 24px vertical gutters.
- **Mobile:** Side margins collapse to 20px; grid columns stack vertically.
- **Glass Padding:** Internal padding within glass cards should be a consistent 24px to ensure content doesn't crowd the translucent edges.

## Elevation & Depth
Depth is created through **Glassmorphism and Tonal Blur** rather than traditional black shadows.

1.  **Backdrop Filter:** All primary cards and sidebars must use `backdrop-filter: blur(20px to 32px)`.
2.  **Shadows:** Use tinted shadows (e.g., `rgba(0, 180, 216, 0.1)`) to make elements feel like they are floating over a light source.
3.  **Borders:** Use semi-transparent white borders (`1px solid rgba(255, 255, 255, 0.4)`) on the top and left edges to simulate light hitting the edge of glass.
4.  **Isolate Layers:** Active states (like selected nav items) use a "glow" shadow rather than a physical lift.

## Shapes
The shape language is "Soft-Rounded."
- **Standard Cards/Sections:** 16px (1rem) corner radius.
- **Buttons and Nav Items:** 12px (0.75rem) to strike a balance between friendly and professional.
- **Status Chips:** Full "pill" rounding (9999px).
- **Icons:** Enclosed in 12px rounded-xl containers for consistency with the component language.

## Components
- **Buttons:** Primary buttons use a linear gradient (`from-primary to-primary-container`) with a top-edge highlight and a cyan glow shadow. Hover states should include a vertical "slide-up" glass overlay effect.
- **Glass Cards:** Must include a subtle internal gradient and a white 1px border. For "Hero" sections, add a blur-background flare (cyan/teal) behind the card to increase focus.
- **Navigation:** Active links use the `primary-container` color with high-contrast text and an `active-link-shadow` (cyan tint). Hover states use a subtle `white/40` tint.
- **Status Indicators:** Use a pulse animation for "Live" or "Critical" states. Combine a pill-shaped background with a 2px solid dot indicator.
- **Data Tables:** Remove heavy borders. Use thin, low-opacity horizontal lines (`outline-variant/10`) and subtle row-hover highlights (`white/40`).
- **Progress Bars:** Use a high-contrast track (`surface-container`) and a rounded primary-color fill.
