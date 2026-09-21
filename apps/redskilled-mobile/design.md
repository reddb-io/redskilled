# Design — Redskilled Mobile

A locked design system for the Android-first Redskilled operator. Every screen
reads this file before visual changes are made. Extend this system when the
product grows; do not invent a theme per screen.

## Genre

Modern-minimal, with a technical and austere tone.

## Product job

An operator pairs trusted Hosts, dispatches one GitHub Issue to one Host, and
observes or stops the resulting Workers. Dispatch is the primary action. Hosts
and Workers are supporting operational surfaces.

## Macrostructure family

- App screens: **Workbench**. A compact header names the current job, the body
  exposes the real control or evidence, and persistent bottom navigation keeps
  the three destinations stable.
- Setup flows: **Focused task**. Pairing owns the Hosts screen while active;
  camera, manual invitation, permission and error states stay in one flow.
- Content pages: not applicable.

## Theme

Use the vendored RedDB Application Theme, dark Color Scheme and compact Density
stop. `src/design-system/tokens.ts` is the native adapter and the vendored CSS
is authoritative.

- Paper: `#12141b`
- Raised surface: `#1e222d`
- Sunken surface: `#07080a`
- Ink: `#f4f5f7`
- Muted ink: `#b3b8c4`
- Rule: `#333949`
- Strong rule: `#4a5162`
- Accent and focus: `#ff2056`
- Danger: `#ff6389`

Accent occupies at most a small fraction of each viewport. Use it for active
navigation, selection, focus and destructive feedback—not decorative fills.

## Typography

- Display and body: Space Grotesk, 400 / 500 / 700, roman.
- Operational data: JetBrains Mono, 400 / 700.
- Display tracking: tight, never italic.
- UI labels stay in sentence case. Mono uppercase is reserved for compact live
  state and identifiers, not section decoration.

## Spacing

Use the named four-point-derived scale in `tokens.ts` plus the vendored compact
density tokens. Screen padding, component insets and sibling gaps must reference
those tokens; raw spacing values are reserved for optical one-pixel rules.

## Motion

- Motion-cut by default.
- Press feedback: opacity plus a slight scale, 100–150 ms when the native
  platform supports it.
- Screen changes: instant. The selected navigation state supplies continuity.
- Functional activity indicators remain animated.
- Reduced-motion users receive no spatial decoration.

## Microinteractions stance

- Successful dispatch is visible as a pending Worker; no success toast.
- Failures stay adjacent to the action that failed and use text plus a glyph.
- Focus is immediate and visible. Touch targets are at least 44 px.
- Disabled controls retain their labels and expose accessibility state.
- Destructive `Stop` and `Unpair` actions remain explicit text actions.

## CTA voice

- Primary: high-contrast neutral fill, compact radius, concrete verb.
- Secondary: strong rule, transparent surface.
- Destructive: danger text and border only; never a large danger fill.

## Per-screen structure

- **Dispatch:** current target summary, one Issue URL field, parsed Issue proof,
  one dispatch action, and a short active-Worker context.
- **Workers:** live count and a full-width operational list. Empty state explains
  the missing evidence and points back to Dispatch.
- **Hosts:** fleet health and selection first; pairing is a dedicated task state.

## What screens MUST share

- RedDB inverse lockup, Application dark theme, Space Grotesk and JetBrains Mono.
- Persistent bottom navigation order: Dispatch → Workers → Hosts.
- Screen-header rhythm, control heights, border language and CTA voice.
- Honest status language derived from runtime evidence.

## What screens MAY differ on

- Body density: Dispatch is spacious; Workers and Hosts are denser lists.
- Empty-state depth and the presence of an inline primary action.
- Camera content inside the pairing task.

## Hallmark stamp

`Hallmark · P5 H5 E4 S5 R5 V4 · genre: modern-minimal · tone: technical-austere · macrostructure: Workbench · design-system: design.md · designed-as-app`

