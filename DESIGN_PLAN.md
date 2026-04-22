# Stark — Design & Motion Overhaul Plan

## Context

Stark is a native control center for the Hermes agent. The current build has a coherent palette, distinctive typography (Instrument Serif + Geist Sans + JetBrains Mono), and a recognisable pixel-art mascot. But the longer you use it the more the shell feels *static*: routes swap as jump-cuts, dialogs vanish rather than closing, buttons disable without showing they are working, and a dozen tiny inconsistencies — five radius tokens, three bespoke tab strips, missing focus rings — dilute the product's confident feel.

This plan captures every concrete issue found in an audit of the full renderer (every pane + shared shell) and lays out a fix order. The goal is not a visual overhaul — the aesthetic is right — but a systems pass that makes the existing design read as intentional, animated, and accessible in every corner.

**Success criteria.** When we are done:

1. Every route change animates. Every dialog opens *and closes* with motion. Every async call has visible feedback.
2. One `TabStrip`, one `Skeleton`, one set of motion tokens — used everywhere.
3. Keyboard users can see where focus is on every interactive element.
4. No user sees a "jump-cut" or an invisible loading state anywhere in the app.

---

## Guiding principles

- **Motion is a system, not decoration.** All durations, easings, and delays come from CSS variables. If a value is not in the token set, it does not ship.
- **Enter *and* exit.** Any element that animates in must animate out. No unmount cuts.
- **State is visible.** Loading = skeleton or inline spinner. Saving = spinner in the button. Success = transient toast. Error = persistent toast + inline message.
- **Keyboard parity.** Every button, toggle, tab, and list row has a visible `:focus-visible` treatment identical to its hover/active state or stronger.
- **Stark's house is the signature.** Keep the big creative swings in the fullscreen Home mode. Everywhere else, restraint.

---

## Phase 0 — Motion tokens + primitives

Foundation. Everything else depends on this.

### 0.1 Motion tokens in `apps/renderer/src/styles.css`

Add under `@theme` alongside the existing radius tokens:

```css
--motion-dur-xs: 120ms;
--motion-dur-sm: 180ms;
--motion-dur-md: 240ms;
--motion-dur-lg: 360ms;
--motion-dur-xl: 560ms;

--motion-ease-out:   cubic-bezier(0.22, 0.8, 0.2, 1);   /* existing app default */
--motion-ease-inout: cubic-bezier(0.65, 0, 0.35, 1);
--motion-ease-in:    cubic-bezier(0.55, 0, 1, 0.55);
--motion-ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1); /* snappy overshoot */

--motion-stagger: 45ms;
```

Replace every hand-rolled duration and easing in the codebase with these. That includes `transition-all duration-150` sprinkled in [Sidebar.tsx:47](apps/renderer/src/components/Sidebar.tsx:47), `transition 1.4s ...` in [StarkHouse.tsx:216](apps/renderer/src/components/StarkHouse.tsx:216), and the ad-hoc times in `HomeDock`, `CommandPalette`, etc.

### 0.2 Fix `.stagger` to scale past 8 children

Current rule at [styles.css:294-323](apps/renderer/src/styles.css:294) caps delays at `nth-child(n+9)` = 0.4s flat, which flattens large lists (Skills grid, Threads list, Marketplace). Replace with a single rule:

```css
.stagger > * {
  animation: stark-in var(--motion-dur-lg) var(--motion-ease-out) both;
  animation-delay: calc(var(--motion-stagger) * var(--i, 0));
}
```

Apply `style={{ '--i': index }}` inline when rendering. Cap at `--i: 12` in JS to avoid 20+ item reveals feeling long.

### 0.3 Exit keyframes

```css
@keyframes stark-out       { to { opacity: 0; transform: translateY(6px); } }
@keyframes stark-out-scale { to { opacity: 0; transform: scale(0.96); } }
```

Paired helper classes `.anim-out`, `.anim-out-scale`.

### 0.4 New primitives

Create four tiny components. All live in `apps/renderer/src/components/ui/`.

- **`Skeleton.tsx`** — a div with a gradient shimmer (reuse the existing `stark-shimmer` keyframe at [styles.css:235](apps/renderer/src/styles.css:235)). Props: `width`, `height`, `rounded`.
- **`TabStrip.tsx`** — shared underlined-tab component with a motion-driven active-indicator (see 0.5). Replaces the bespoke tabs in `SettingsPane`, `SkillsPane`, `GatewaysPane`.
- **`RouteTransition.tsx`** — wraps route children in [app.tsx:145-154](apps/renderer/src/app.tsx:145). On `route` change, cross-fade old → new with `anim-in` (240ms, `--motion-ease-out`) + a 6px upward translate. Key the child on `route`.
- **`Presence.tsx`** — tiny helper for mount/unmount transitions. Wraps a conditionally-rendered child, delays unmount by the exit duration, applies `.anim-out-scale` during that window. Used by `Dialog`, `CommandPalette`, `Toast`, `ProfilePicker` dropdown, `HomeDock` collapse.

### 0.5 Radius token consolidation

Currently in use: `--radius-xs` 6, `--radius-sm` 10, `--radius-md` 12, `--radius-lg` 18, `--radius-xl` 24, plus hand-rolled `rounded-full`. That is five values + an unlimited one. Audit every `rounded-*` in the codebase and fold to three roles:

- **Chip / badge / pill** → `--radius-xs` or `rounded-full` (keep both, document which is for which).
- **Control / card / input** → `--radius-md`.
- **Big surfaces / modal** → `--radius-lg` or `--radius-xl`.

Remove `--radius-sm` from new code (keep the variable alive for back-compat; stop using it in edits).

---

## Phase 1 — Shared shell

Changes the user sees on every screen.

### 1.1 `app.tsx` — route transitions

Wrap the nine route conditionals at [app.tsx:146-154](apps/renderer/src/app.tsx:146) in `<RouteTransition route={route}>`. Every pane becomes a keyed child. Result: every `⌘1-8` hotkey swap is a 240ms fade + translate instead of a jump-cut.

### 1.2 `TitleBar.tsx`

- [line 40-49](apps/renderer/src/components/TitleBar.tsx:40) Palette trigger: add `focus-visible:[box-shadow:var(--ring-focus)]` and a border-color transition so hover is not only a color change.
- [line 86-99](apps/renderer/src/components/TitleBar.tsx:86) Theme picker: each button needs a visible focus ring. The active button should animate its background via `transition-colors duration-[var(--motion-dur-sm)]`. Consider sliding a single `<span>` "puck" under the three icons instead of per-button background — cleaner motion.
- Home-mode toggle (already a switch after the last PR): swap its hand-tuned `duration-200` to `var(--motion-dur-sm) var(--motion-ease-spring)` for a snappier feel.

### 1.3 `Sidebar.tsx`

- [line 54-57](apps/renderer/src/components/Sidebar.tsx:54) Active accent bar: animate with `scaleY` + `translateX` from –4px on route change. Makes the active indicator *travel* between items instead of teleporting.
- [line 66-68](apps/renderer/src/components/Sidebar.tsx:66) Hotkey `<Kbd>` hint: add `transition-opacity` so it fades in on hover rather than popping.
- Each nav item needs `focus-visible` styling identical to its hover.
- Wrap `items.map` in a `.stagger` container so the sidebar reveals on initial app load.

### 1.4 `StatusBar.tsx`

- Replace the flat monospace line with three visual groups: `mode · safety`, `provider · profile`, `bridge status`. Use `<span class="hairline"/>` (already exists) as a vertical separator for rhythm.
- Apply a pulsing `Dot` when `sidecar.state !== 'ready'` (the `Dot` atom supports `pulse` — just pass it).
- Animate value changes via `key={value}` + `anim-in` so the status text *slides* when it changes state.

### 1.5 `CommandPalette.tsx`

- Backdrop + dialog currently both animate in at `t=0`. Delay the dialog by 60ms so the backdrop lands first.
- Add `transition-colors var(--motion-dur-xs)` to each command row so the cursor highlight follows smoothly instead of snapping.
- Wrap in `Presence` so closing the palette animates out (120ms scale + fade).

---

## Phase 2 — UI primitives

### 2.1 `Button.tsx`

- Press feedback on every variant, not just primary. Add `active:translate-y-[0.5px] active:scale-[0.98]` to `ghost`, `secondary`, and `signal`.
- Focus ring needs more contrast on dark surfaces. Increase `--ring-focus` spread from 3px → 4px, or use `outline` instead of `box-shadow`.
- Loading variant: show an inline spinner *and* keep the label (currently the spinner replaces the content on some usages). Add `leading-spinner` slot.

### 2.2 `Dialog.tsx`

- Stagger backdrop + panel: backdrop `anim-in` at 0ms, panel `anim-in-scale` at +60ms.
- Wrap in `Presence` so close animates out. Today the dialog simply unmounts (see [Dialog.tsx:37-40](apps/renderer/src/components/ui/Dialog.tsx:37)).
- Trap focus (first focusable on open, return focus to trigger on close). Close on `Escape`.

### 2.3 `Toast.tsx`

- Enter is slide-up + fade. Exit is slide-down + fade over 320ms. Use `Presence`.
- Dismiss `×` button needs hover + focus-visible styles.
- Auto-dismiss schedule: visible 4000ms, fade-out 360ms, remove at 4360ms.

### 2.4 `Input.tsx`

- Wrap `<input>` border change in `transition-colors var(--motion-dur-sm)`.
- Leading icon: on focus, animate `color` from `--fg-dim` → `--primary`.
- Introduce an error state style (red border + helper text) — no pane currently has a consistent error presentation for validation failures.

### 2.5 `Card.tsx`

- When `glow` toggles true, the glow should fade in over 400ms — today it snaps.
- `interactive` cards need a `:focus-visible` treatment identical to `:hover`.

### 2.6 Atoms (`Atoms.tsx`)

- Add a `loading` prop to `EmptyState` that renders 3 `Skeleton` rows instead of the icon/title/description block.
- Normalise `Badge` radius to `rounded-full` for chips and `var(--radius-xs)` for status tags — pick one per semantic.

---

## Phase 3 — Per-route fixes

### 3.1 `HomePane`

- **Loading states.** `/threads`, `/approvals`, `/jobs`, `/suggestions` currently render `EmptyState` while the first fetch is inflight — indistinguishable from a real empty state. Use a `loading` flag and render `<EmptyState loading />` until the first response lands.
- **Feature dock** (added last PR): add `--i` stagger indices so the 8 tiles cascade in.
- Hero prompt textarea wrapper needs `transition-[box-shadow,border-color] var(--motion-dur-sm)` so focus transitions feel smooth.
- Approval/job/recent cards in the grid should animate in with `.stagger`.

### 3.2 `HomeDock`

- Collapse/expand: today the dock swaps between a button and the panel with no transition. Wrap each in `Presence`.
- Drag: when drag ends, animate to rest with `spring` easing (use `--motion-ease-spring`). Add a subtle `scale(1.02)` during drag to sell the "lift".
- Message bubbles: stagger new messages with `--i` = message index modulo a small number so conversation history does not re-stagger on every render.
- Typing dots are fine; keep them.

### 3.3 `ThreadsPane`

- Slash-menu: `Presence` wrapper so it fades in/out.
- Session loading: show a full-width `Skeleton` list in the thread area while `loadingSession` is true.
- Scroll-to-bottom on stream: already uses `behavior: 'auto'` during stream (correct) and `smooth` on settle (correct). Keep as is.
- Stream cursor: add a blinking "▌" glyph at the end of the streaming assistant message using the existing `stark-blink` keyframe.

### 3.4 `ToolsPane`

- Tab panel cross-fade (after `TabStrip` ships). Currently switching installed ↔ marketplace is a cut.
- Toggle saving state: render a spinner *inside* the toggle (shrink the thumb, show 8px spinner) rather than just opacity-70.
- Feature tiles fade in with stagger.

### 3.5 `SkillsPane`

- Replace the bespoke tab strip at [SkillsPane.tsx:183-199](apps/renderer/src/features/skills/SkillsPane.tsx:183) with the shared `TabStrip`.
- Marketplace grid: replace `EmptyState` during load with a 6-card `Skeleton` grid.
- Install button: spinner stays in the button, not a separate loading state.
- Inspect dialog: use the upgraded `Dialog` with exit animation. Code preview should fade in after the dialog finishes opening so the text does not reflow during the scale animation.

### 3.6 `AutomationsPane`

- Stagger task list.
- Empty state fades in (currently snaps).
- When a task flips from paused → running (or the reverse), animate its status badge with a quick scale pulse.

### 3.7 `MemoryPane`

- Filtered search results should fade items out/in rather than re-render flat. Use a simple `Presence`-per-row approach with FLIP-like animation, or a conservative `stagger` reset keyed on the search string.
- Loading skeletons for sessions + notes.

### 3.8 `GatewaysPane`

- Panel swap (daemon ↔ items ↔ configuring) → `RouteTransition`-style wrapper inside the pane.
- Spinner in Start/Stop buttons while the gateway flips state.
- Status pill per gateway: pulse when state is `starting`.

### 3.9 `ActivityPane`

- Stagger both columns (jobs + approvals).
- When a job completes, animate it out with `anim-out` before removing from the list (wrap in `Presence`).
- Live tail: when a new row arrives, slide from the top with a 200ms animation and a 1-second subtle background highlight in `--primary-wash`.

### 3.10 `SettingsPane`

- Replace custom tab strip at [SettingsPane.tsx:47-80](apps/renderer/src/features/settings/SettingsPane.tsx:47) with `TabStrip`. The animated underline becomes free.
- Each sub-pane wrapped in `RouteTransition` keyed on `tab`.
- Doctor: spinner on "Run checks" button; results list staggers in.
- Providers/Backends/MCP: "Test" buttons go through the same in-button spinner pattern.

### 3.11 `Onboarding`

- Step-to-step transitions: current step exits left, next step enters from right. Use `Presence` + horizontal translate.
- Progress bar: animate `width` transitions smoothly via `transition-[width] var(--motion-dur-lg) var(--motion-ease-out)`.
- Final "All set" step gets a Mascot `accessory: 'wings'` with a subtle bob animation as a reward moment.

### 3.12 `StarkHouse`

Visual is strong; motion is sparse. Targeted additions only:

- When Stark walks between stations, apply a small `translateX(sign)` lean via CSS custom property during the 1.4s walk window.
- Lamp (Study room): add a 4-second breathing animation on the warm glow (`box-shadow` opacity cycling 0.4 ↔ 0.6).
- Coffee-machine steam: already drawn as static dots — animate their `translateY` upward with fade using `stark-ember-rise` (the keyframe already exists at [styles.css:245](apps/renderer/src/styles.css:245)).
- Status pills at the top of the house: `Presence` wrapper so they slide in/out as approvals/jobs change, with stagger between multiple pills.

### 3.13 `ProfilePicker`

- Unify caret + border transitions under `var(--motion-dur-sm)`.
- Dropdown: keyboard focus for rows (currently no visible focus state when tab-cycling).
- Refresh button: spinner-in-button pattern.

---

## Phase 4 — Accessibility pass

One focused sweep after the motion/primitive work lands.

- Every interactive element has a `:focus-visible` style with contrast against both light and dark themes.
- Every `<button>` that triggers navigation has `aria-label` if icon-only.
- Every dialog traps focus and restores it on close.
- Every toggle has `role="switch"` and `aria-checked`.
- Respect `prefers-reduced-motion` — the rule at [styles.css:326-334](apps/renderer/src/styles.css:326) already kills animations; verify that skeleton shimmer also respects it (it does, via the global rule, but double-check after the refactor).

---

## Phase 5 — Consolidation

After all of the above, one cleanup commit:

- Delete `--radius-sm` usages where folded into `--radius-md`.
- Delete every hand-rolled tab strip (`SettingsPane`, `SkillsPane` installed/marketplace toggle).
- Delete every bespoke spinner import where `Button loading` now covers it.
- Remove any remaining `transition-all` in favour of targeted `transition-colors` / `transition-transform`.

---

## Rollout order (suggested PRs)

1. **Motion tokens + `Presence` + `Skeleton` + `TabStrip` + `RouteTransition`** — infra only, no visual change beyond `app.tsx` wiring.
2. **Shell polish** — `TitleBar`, `Sidebar`, `StatusBar`, `CommandPalette`.
3. **UI primitives** — `Button`, `Dialog`, `Toast`, `Input`, `Card`, `EmptyState`.
4. **Home + HomeDock + Threads**.
5. **Tools + Skills + Automations + Memory + Gateways + Activity**.
6. **Settings + Onboarding + StarkHouse polish**.
7. **Accessibility pass**.
8. **Consolidation + radius cleanup**.

Each PR is small enough to review and verify visually. None of the later PRs depend on specifics of earlier ones beyond the primitives.

---

## Critical files

- [apps/renderer/src/styles.css](apps/renderer/src/styles.css) — motion tokens, stagger fix, exit keyframes
- [apps/renderer/src/app.tsx](apps/renderer/src/app.tsx) — route transitions
- [apps/renderer/src/components/ui/](apps/renderer/src/components/ui/) — `Skeleton`, `TabStrip`, `RouteTransition`, `Presence` (new); `Button`, `Dialog`, `Toast`, `Input`, `Card`, `Atoms` (updated)
- [apps/renderer/src/components/TitleBar.tsx](apps/renderer/src/components/TitleBar.tsx)
- [apps/renderer/src/components/Sidebar.tsx](apps/renderer/src/components/Sidebar.tsx)
- [apps/renderer/src/components/StatusBar.tsx](apps/renderer/src/components/StatusBar.tsx)
- [apps/renderer/src/components/CommandPalette.tsx](apps/renderer/src/components/CommandPalette.tsx)
- [apps/renderer/src/components/StarkHouse.tsx](apps/renderer/src/components/StarkHouse.tsx)
- [apps/renderer/src/components/ProfilePicker.tsx](apps/renderer/src/components/ProfilePicker.tsx)
- All nine panes under [apps/renderer/src/features/*/*Pane.tsx](apps/renderer/src/features/)

---

## Verification

Per-phase quick checks:

- **Phase 0**: visually identical to main. `npm run typecheck && npm run build` green.
- **Phase 1**: every `⌘1-8` swap animates. Sidebar accent bar *travels* between routes. StatusBar dot pulses while sidecar is starting.
- **Phase 2**: opening/closing a dialog or toast has clear enter + exit motion. Tab through any form — focus is visible on every control.
- **Phase 3**: every pane that fetches data shows a skeleton on first load. No list appears as a jump-cut after navigation.
- **Phase 4**: run through keyboard-only navigation; DevTools Accessibility panel shows `aria-*` on all interactive custom controls.
- **Phase 5**: grep for `transition-all` → 0 hits; grep for `--radius-sm` → only in styles.css fallback.

Final gate: record a 30-second screencapture clicking through every route, opening a dialog, triggering a toast, and toggling Home mode. Every interaction should have motion; no hard cuts.
