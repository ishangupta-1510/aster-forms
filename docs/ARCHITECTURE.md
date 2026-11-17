# Architecture

`core.js` owns definition validation, the headless document model, visibility, cleaning and answer validation. Definitions are JSON-compatible objects and are cloned on import and snapshot access. A document edit stages a clone, validates it, then appends the previous definition to bounded history. Rejected edits leave both the definition and history intact.

Visibility rules form a directed acyclic graph. A field's rule can depend on other fields only if those controllers are visible and answered. The evaluator memoizes visibility for each field and applies anonymous suppression before evaluating conditions. The runner clears values of newly hidden fields, including their browser File objects. The schema exporter recursively composes the same dependency structure using standard JSON Schema conditionals and required-property guards.

`schema.js` creates schemas for answer objects and submission envelopes. Type-specific schemas encode scalar types, enums, limits, file descriptors and matrix rows. At the root, additional properties are rejected. Required unconditional fields are listed in `required`; conditional fields use `if`/`then`/`else` to enforce presence only when shown and forbid hidden values. Anonymous-excluded properties have the boolean schema `false`. A server should load the trusted form definition and compile once per version/mode.

`runner.js` renders all page controls once per instance. Switching steps and conditional changes toggle visibility while retaining mounted inputs. Values of hidden controls are actively cleared, so stale values cannot resurface. File objects stay in a separate in-memory map; JSON contains only descriptors. Submitting validates all visible answers, selects the first failing page, and provides linked error summaries. Successful submission calls the application callback and emits `aster-submit`. Callback rejection leaves the runner available for retry. The library never makes a network request itself.

`builder.js` wraps the headless document with a toolbox, page outline, canvas, properties panel, preview and schema viewer. Native drag/drop carries an Aster-specific payload. The canvas scrolls near drag edges; arrow controls implement the same model operations. Drop indices are converted to final-list positions after removal. The properties panel validates through the document model and displays errors without committing bad edits. Preview is a separate runner instance that is destroyed on tab changes.

`dom.js` provides small text-safe DOM helpers. All user-authored labels, options and JSON previews use `textContent`, not HTML insertion. `style.css` contains the original responsive UI and CSS variables.

## Deliberate limits

- Definition authors are trusted, especially for regular expressions. The validator does not impose execution timeouts on regex evaluation.
- Runtime errors and schema parity are tested for supported inputs; no universal arbitrary JSON Schema validator is implemented inside the library.
- The runner's file descriptors do not replace server-side byte/content verification.
- The builder re-renders after committed property changes; this favors a small implementation over large-editor reconciliation performance.
- History stores whole definition snapshots. Large allowed forms can consume significant memory; there is no collaborative merge model.
- No persistent storage, authentication, backend transport, response ID generation or analytics exists in the library.
- Built-in labels are English. The UI is keyboard-operable in its tested paths, but not formally WCAG-certified.
