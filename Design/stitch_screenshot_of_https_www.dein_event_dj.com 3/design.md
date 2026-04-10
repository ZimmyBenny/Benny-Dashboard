# Design System Strategy: The Electric Noir

This design system is engineered to capture the high-octane energy of a premium nightlife experience while maintaining the sophisticated precision of a high-end luxury brand. We are moving away from the "standard DJ template" of cluttered layouts and neon glows. Instead, we are building a "Digital Stage"—a space defined by deep atmospheric depth, cinematic typography, and high-contrast focal points.

## 1. Overview & Creative North Star
**The Creative North Star: "The Sonic Architect"**
The interface should feel like a high-end audio mixer or a luxury lounge: dark, immersive, and tactile. We break the "template" look through **Intentional Asymmetry**. Rather than perfectly centered grids, use overlapping photography and offset typography to create a sense of rhythm and motion. Elements should feel like they are floating in a void, held together by gravitational pull rather than rigid boxes.

## 2. Colors & Atmospheric Depth
Our palette is rooted in the `background` (`#060e20`), a void-like navy-charcoal that provides the canvas for our high-energy accents.

*   **Primary Accent (`primary` - #cc97ff):** Use this for high-energy moments—pulsing UI elements or critical CTAs.
*   **Secondary Accent (`secondary` - #34b5fa):** Use this to provide a "cool" counterpoint to the purple, mimicking the interplay of stage lights.
*   **The "No-Line" Rule:** Under no circumstances should 1px solid borders be used to separate sections. Boundaries are defined strictly by background shifts. For example, transition from `surface` to `surface-container-low` to signal a new content block.
*   **Surface Hierarchy & Nesting:** Treat the UI as layers of "Sonic Glass." 
    *   **Base:** `surface` (#060e20)
    *   **Mid-Layer:** `surface-container` (#0f1930)
    *   **Interactive/Top-Layer:** `surface-container-high` (#141f38)
*   **The "Glass & Gradient" Rule:** All floating cards must utilize Glassmorphism. Use `surface-variant` at 40% opacity with a `20px` backdrop-blur. Apply a subtle linear gradient (from `primary` to `primary-container` at 15% opacity) as a background fill to give the glass a "charged" feel.

## 3. Typography: The Editorial Edge
We pair the geometric authority of **Epilogue** for displays with the hyper-legibility of **Inter** for functional data.

*   **Display Scale (`display-lg` to `display-sm`):** These are your "Headliners." Use `display-lg` (3.5rem) with tight letter-spacing (-0.04em) for hero headlines. Epilogue’s weight provides a brutalist, premium feel.
*   **Headline & Title:** Used for storytelling. `headline-lg` should be reserved for section intros to maintain a cinematic pace.
*   **Body & Labels:** `body-md` (Inter) is our workhorse. Ensure a high contrast against the dark background by using `on-surface` (#dee5ff). Never use pure white for long-form body text to reduce eye strain; keep it slightly tinted.

## 4. Elevation & Depth: Tonal Layering
Traditional drop shadows are forbidden. We use "Ambient Glows" and "Tonal Stacking."

*   **The Layering Principle:** To lift a card, do not add a shadow. Instead, move it from `surface-container-low` to `surface-container-highest`. The shift in luminosity creates a natural sense of proximity to the user.
*   **Ambient Shadows:** For "Floating" elements (like a music player or booking modal), use an ultra-diffused shadow: `0px 24px 48px rgba(0, 0, 0, 0.5)` mixed with a secondary glow: `0px 0px 12px rgba(52, 181, 250, 0.1)`.
*   **The "Ghost Border" Fallback:** If a button or input needs definition against a complex photo background, use `outline-variant` at 20% opacity. It should be felt, not seen.
*   **Glassmorphism:** Use `surface-bright` for the "rim light" (a 1px top-stroke on glass cards) to simulate a physical edge catching a stage light.

## 5. Components & Primitive Styling

### Buttons: The Interaction Points
*   **Primary:** Full rounded (`9999px`). Background: Gradient from `primary` (#cc97ff) to `primary-dim` (#9c48ea). Text: `on-primary-fixed` (Black).
*   **Secondary:** Glass-style. `outline-variant` border at 30%, backdrop-blur `12px`.
*   **Interaction:** On hover, primary buttons should "glow" using a `primary` box-shadow with a `20px` spread at 30% opacity.

### Cards & Event Lists
*   **No Dividers:** Lists should never use horizontal lines. Use the `Spacing Scale (6)` (2rem) to create clear breathing room between items. 
*   **High-Quality Photography:** Every card must lead with a full-bleed image. Use a `surface-container-lowest` overlay gradient on the bottom 30% of images to ensure typography remains legible.

### Input Fields
*   **Stateful Design:** Default state is `surface-container-low`. On focus, the border shifts to `secondary` (#34b5fa) with a subtle outer glow. Label text should use `label-md` in `on-surface-variant`.

### Signature Component: The "Live Pulse"
*   A specialized chip or indicator using `error` (#ff6e84) for "Live Now" or "Booking Fast" status. This provides the "Electric" high-contrast pop against the cool blues and purples.

## 6. Do's and Don'ts

### Do:
*   **Do** use asymmetrical layouts where text overlaps the edges of photos.
*   **Do** use large amounts of `spacing-20` (7rem) between major sections to let the design breathe.
*   **Do** use `primary` and `secondary` colors for "light-leak" effects in the background corners.

### Don't:
*   **Don't** use 100% opaque, solid white boxes. It breaks the "Sonic Glass" immersion.
*   **Don't** use standard "drop shadows" (black, high-opacity, small blur).
*   **Don't** use more than one "Display" font weight per screen. Keep the hierarchy lean and mean.
*   **Don't** use dividers. If you feel the need for a line, increase the vertical whitespace instead.