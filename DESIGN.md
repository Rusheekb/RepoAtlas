# RepoAtlas design notes

The interface follows the **Field atlas** direction, applied with the *unslop* method by Damir Sokolovsky ([@heydamir](https://x.com/heydamir), [heydamir/unslop](https://github.com/heydamir/unslop), CC BY 4.0).

## Direction

- **Product.** RepoAtlas turns any GitHub project into a map, guided tours and plain-English notes, so people who don't code can see how it works.
- **Character.** Patient, exact, a little warm.
- **World.** Printed atlases and field guides: map paper, survey ink, legends, contour lines.
- **Moments.** The project map itself, where each colour is a kind of code. On the home page, a coded preview of a real project's map with one part explained.
- **Signature.** A survey-red "you are here" pin with a dashed route line (`YouAreHerePin`, `RouteLine` in `src/components/ui/YouAreHere.tsx`). It marks the selected part on a map, the current learning-path step and the active tour step — and appears nowhere else.

## Rules

- **Colour.** One warm-grey paper ramp for every surface, border and text role (`canvas`, `surface`, `surface-2`, `surface-3`, `line`, `ink`, `ink-2`, `ink-3`). Primary actions are the ink itself (`bg-brand` = ink fill). The accent, survey red (`accent*`), is used rarely: the signature, the selected item and focus. The maps carry the colour (`--layer-*`), always with a label or legend. No hue gradients, glows, coloured shadows or tinted surfaces.
- **Type.** Instrument Sans for the interface, Newsreader for large headlines only (`text-hero`, `text-page-title`), JetBrains Mono for paths, counts and meta (`text-meta`). Weights 400 and 500, 600 rarely. Sentence case everywhere, no uppercase tracked labels, no italics for emphasis, tabular figures for numbers.
- **Icons.** lucide only, 16 or 18 px, stroke 1.5, in the colour of their text role (`src/components/ui/icons.tsx`: `ViewIcon`, `RoleIcon`, `KindIcon`, `ConceptIcon`). Categories that need colour get a `LayerDot`. No emoji in the interface, no sparkles for AI.
- **Spacing.** A 4 px grid. Equal things share one size; space inside a group is smaller than space between groups.
- **Radius.** Tags 4–6, controls 8–10, cards 12–16, panels 14–20. Nested radius = outer − padding.
- **Copy.** Plain, specific, no exclamation marks, no greetings, no hype. Headings, labels, buttons and captions have no trailing period; paragraphs keep theirs.
- **Motion.** One curve (`ease-atlas`), 120–220 ms for feedback. Name the transitioned properties. No looping motion on anything that isn't live, no hover scaling.
