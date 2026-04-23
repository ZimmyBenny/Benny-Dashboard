# Design System Document: The Kinetic Pulse

## 1. Overview & Creative North Star
**Creative North Star: "The Synthetic Conductor"**

This design system is built to bridge the gap between high-energy performance and clinical financial precision. It rejects the static, "boxed-in" layout of traditional dashboards in favor of a fluid, editorial experience. By utilizing intentional asymmetry, deep layering, and high-contrast typography, we create a UI that feels like a live instrument—responsive, deep, and authoritative.

The "Synthetic Conductor" aesthetic moves away from flat UI by treating the screen as a dark, pressurized chamber where light (data) glows from within. We prioritize "Breathing Room" over "Information Density," ensuring that even the most complex data visualizations feel elegant rather than overwhelming.

---

## 2. Colors & Surface Philosophy
The palette is rooted in a deep-sea midnight (`background: #060e20`), allowing our "Neon Logic" colors to pop with maximum vibrance.

*   **Primary (Electric Blue):** Use `primary: #94aaff` and `primary_dim: #3367ff` for high-action focal points. This represents the "DJ vibe"—energy and rhythm.
*   **Secondary (Emerald Green):** Use `secondary: #5cfd80` for financial growth and success metrics. It is a "Success Glow," never to be used for decorative elements unless they imply positive trajectory.
*   **Tertiary (Deep Violet):** `tertiary: #a68cff` acts as the "Midnight Accent," used for secondary data streams or softening the transition between blue and green.

### The "No-Line" Rule
**Strict Mandate:** Designers are prohibited from using 1px solid borders for sectioning. Boundaries must be defined solely through background color shifts.
*   Use `surface_container_low` for the main content area.
*   Use `surface_container_high` for nested cards.
*   The transition between these two tokens is the "line." A border is a failure of tonal hierarchy.

### The "Glass & Gradient" Rule
To achieve the premium "DJ Booth" aesthetic, floating elements (modals, dropdowns, hovered cards) must use Glassmorphism:
*   **Fill:** `surface_variant` at 40% opacity.
*   **Effect:** 20px - 40px Backdrop Blur.
*   **Gradient:** Apply a subtle linear gradient from `primary` (10% opacity) to `transparent` at a 45-degree angle to give the glass a "sheen."

---

## 3. Typography
We use a dual-font strategy to balance editorial flair with functional clarity.

*   **Display & Headlines (Manrope):** Chosen for its geometric, modern structure. Use `display-lg` (3.5rem) and `headline-lg` (2rem) to create massive scale differences. Headlines should feel like magazine titles—bold and unapologetic.
*   **Body & Labels (Inter):** Chosen for its extreme legibility at small sizes. 
    *   **Data Points:** Use `title-lg` (1.375rem) with `primary` coloring for key metrics.
    *   **Context:** Use `body-sm` (0.75rem) with `on_surface_variant` for metadata.

**Hierarchy Note:** Always pair a `headline-sm` with a `label-md` in all-caps (tracking: 0.05em) to create an "Architectural" feel.

---

## 4. Elevation & Depth
Depth in this system is a product of **Tonal Layering**, not structural shadows.

*   **The Layering Principle:** 
    *   Base Layer: `surface` (#060e20).
    *   Section Layer: `surface_container_low` (#091328).
    *   Card Layer: `surface_container_highest` (#192540).
*   **Ambient Shadows:** For floating elements only (e.g., active DJ faders, pop-overs). Use a blur of 32px, 0px offset, and 8% opacity of `surface_container_lowest`. It should feel like a soft glow, not a drop shadow.
*   **The "Ghost Border" Fallback:** If accessibility requires a container definition (e.g., high-glare environments), use `outline_variant` at **15% opacity**. This creates a suggestion of a boundary without breaking the "No-Line" rule.

---

## 5. Components

### Cards & Data Visualization
*   **The Kinetic Card:** No dividers. Separate headers from content using a `10` (2.25rem) spacing block.
*   **Charts:** Use `secondary` (Emerald) for "Actuals" and `primary` (Electric Blue) for "Projections." Chart fills should be gradients: `primary_container` (40% opacity) fading to `transparent`.
*   **Radius:** Cards must use `xl` (0.75rem) for a modern, handheld-device feel.

### Buttons
*   **Primary:** Fill with `primary_container`. Text: `on_primary_container`. No border.
*   **Secondary (Success):** Fill with `secondary_container`. Use for "Withdraw" or "Confirm Sale."
*   **Ghost Action:** No background. `title-sm` typography in `primary`. Hover state: `surface_bright` background shift.

### Navigation Icons
*   Icons should be 24px, using a "Duotone" style. 
*   **Active State:** `primary` color with a 4px `primary_dim` outer glow.
*   **Inactive State:** `outline` color at 60% opacity.

### Input Fields
*   **Style:** Minimalist. No box. Only a `surface_container_highest` background with a `sm` (0.125rem) bottom-accent bar in `primary` that grows to 2px on focus.

---

## 6. Do's and Don'ts

### Do
*   **DO** use negative space as a functional tool. If two elements feel cluttered, add a `16` (3.5rem) spacing gap.
*   **DO** use `tertiary_fixed` for tooltips to provide a distinct "system" color that doesn't conflict with data colors.
*   **DO** use the `full` roundedness scale for selection chips to make them feel like "pills."

### Don't
*   **DON'T** use `0.5` or `1` spacing for layout. These are for micro-adjustments within components only.
*   **DON'T** use pure white `#FFFFFF` for text. Always use `on_surface` or `on_background` to prevent eye strain in dark mode.
*   **DON'T** use "Success Green" for navigation. That color is reserved strictly for financial growth and positive data trends.
*   **DON'T** use standard 1px dividers. If you feel the need for a line, use a background color shift instead.