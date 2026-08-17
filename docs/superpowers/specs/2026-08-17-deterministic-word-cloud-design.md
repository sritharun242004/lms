# Deterministic Frequency Word Cloud Design

## Goal

Replace the custom word-cloud positioning code with the React 19-compatible
`@cp949/react-wordcloud` package while preserving the existing live word-cloud
workflow. The rendered cloud must follow the supplied visual references:

- the most repeated word occupies the visual core;
- the second and third frequency tiers sit progressively farther from the core;
- the least repeated words fill the outer area;
- frequency changes create a clearly visible, but controlled, size difference;
- every word is horizontal, readable, and separated from its neighbours;
- the same data and container size produce the same arrangement.

This change is limited to word-cloud rendering. Submission limits, moderation,
locking, socket updates, colors, themes, and backend data remain unchanged.

## Package Choice

Use `@cp949/react-wordcloud`, the maintained API-compatible fork of
`react-wordcloud`. The original `react-wordcloud@1.2.7` declares React 16 as its
only supported peer version, while this application uses React 19. The selected
fork declares support for React 18 and React 19 and exposes the same word-cloud
configuration model shown in the referenced package documentation.

The component will load client-side through Next.js dynamic import. This avoids
server rendering browser-dependent SVG, measurement, and tooltip code.

## Data Adapter

Add a small, independently tested adapter between CMS word-cloud entries and
the package:

1. Sort entries by descending `count`, with normalized text and ID as stable
   tie-breakers.
2. Convert each entry to `{ text, value }`, retaining its ID, count, and color
   metadata for keys, accessible labels, colors, and tooltips.
3. Map counts through a mildly amplified frequency weight. Repeated words must
   become noticeably larger, without allowing one word to consume the canvas.
4. Keep the adapter pure so identical entries always generate identical input.

The library receives high-frequency words first. Its deterministic
Archimedean packing therefore claims the central region for the largest words
and fills outward with progressively smaller words, matching the concentric
frequency model in the first reference and the dense organic cloud in the
second.

## Rendering Configuration

The package configuration will be memoized and use:

- `deterministic: true` and a constant `randomSeed`;
- `rotations: 1` and `rotationAngles: [0, 0]`;
- `fontStyle: "normal"`;
- the application font stack and semibold weight;
- `scale: "linear"` for a clearer repeated-word difference;
- `spiral: "archimedean"` for center-out packing;
- sufficient padding to prevent touching or overlapping words;
- tooltips that show the original count;
- existing light/dark theme colors through the current hue mapping;
- responsive font ranges derived from the container width, with conservative
  mobile maximums so all words remain visible.

The cloud container retains its current height and responsive behavior. Empty
cloud messaging and accessible `role`/label behavior remain present.

## Live Updates and Motion

Input and configuration objects will be memoized. The fixed seed makes the
layout repeatable instead of selecting a new random arrangement on every React
render. When counts change, the library recalculates sizes and packs the new
frequency order. Transition duration will stay short and respect reduced-motion
preferences. No word will be intentionally tilted or assigned a random angle.

## Failure Handling

- Render nothing until the client component and non-zero container dimensions
  are available.
- Preserve the empty-state message when there are no entries.
- Use bounded responsive font sizes and padding to reduce library layout retry
  warnings on small screens.
- Keep a stable loading placeholder with the same minimum height so chat content
  does not jump while the client-only component loads.

## Code Changes

- Add `@cp949/react-wordcloud` to the web workspace dependencies and lockfile.
- Replace the custom SVG placement in
  `apps/web/src/components/chat/word-cloud-canvas.tsx` with the package wrapper.
- Add a pure adapter/configuration module under
  `apps/web/src/lib/word-cloud/`.
- Remove the no-longer-used custom layout hook and layout implementation only
  after all consumers are migrated.
- Replace custom layout tests with adapter/configuration tests that encode the
  deterministic, horizontal, sorted, and frequency-size requirements.

## Verification

Automated checks will cover:

- descending and deterministic frequency ordering;
- stable tie-breaking;
- stronger values for repeated words;
- horizontal-only rotation configuration;
- deterministic seed and center-out spiral configuration;
- responsive font bounds;
- preservation of entry metadata and theme color mapping;
- empty input behavior.

Run the complete web test suite, TypeScript typecheck, targeted ESLint, and a
production build. Then inspect representative desktop and mobile clouds with
single, repeated, long, tied, and maximum-entry datasets to confirm dense
packing, readable spacing, horizontal text, and visual center-to-edge frequency
ordering.
