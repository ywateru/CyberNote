# Presentation owner boundary

`model.ts` owns strict PresentationV1 validation and legacy projection. Parsing
absent settings migrates in memory only. `presentationPatch` is for persistence
adapters with current authority; UI admission must keep unrelated and legacy
patches partial. Rust Store implements the same merge atomically.

`resolver.ts` is the only place that chooses mobile interaction, navigation,
collection, density, columns, effective widths and toolbar policy. Platform
identity is stable; window/IME space is input, never a persisted preference.
Existing `interfaceMetrics` is a geometry helper, not a second layout owner.

App publishes the result through PresentationContext. Editor node views and
portals consume the shared interaction identity; standalone surfaces delegate
to the same resolver. ConfirmedSettings is the existing persistence queue.
Navigation owns temporary focus; saved focus lives only in PresentationV1.

PreferencesPresentation sends complete explicit objects for deliberate edits.
Legacy view/sidebar callers send partial intents, merged by the current stored
authority. Neither this module nor the shells own EditorSession, SaveQueue,
recording, access, or the note/attachment route.
