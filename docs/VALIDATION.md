# Validation record

Validated on November 17, 2026 with Node.js 22.23.2 on Windows.

- **13 headless tests passed.** Tests cover every field type; required, enum, number, date, file and matrix constraints; independent Ajv equivalence; compound/chained visibility; missing-controller semantics; anonymous exclusions; form/version/mode envelope constraints; atomic rejected edits; reorder/history; deletion of condition dependencies; prototype-key rejection; Unicode lengths; zero/empty handling.
- **Browser integration passed in Playwright Chromium.** Actual UI properties, adding fields, undo, keyboard reorder controls, native drag/drop within and between sections, page/section creation, conditional editor, JSON Schema download, runner input for all eight types, required validation, live hiding and clearing, actual in-memory File objects, multipart assembly, standard and anonymous submissions, submit callback failure/retry, duplicate-submit prevention, missing restored file detection, mobile overflow and destruction were exercised.
- **Strict TypeScript consumer check passed.** The public definitions compile with a builder, runner and headless consumer.
- **Server example passed.** Ajv 2020-12 plus ajv-formats compiled the exported submission schema and accepted the valid sample payload.
- **Desktop and mobile screenshots visually inspected.** The demo's outer layout was scoped to avoid affecting the embedded builder canvas. The browser test checks no document-width overflow at 390 pixels.
- **npm install reported zero known vulnerabilities** in the installed development tools at the time of the run. The library has zero runtime package dependencies.

The browser harness requires Chromium installed with `npx playwright install chromium`. `node scripts/browser-check.mjs` starts a localhost demo server if needed, runs the browser test, and stops only the server it started. By default artifacts go to `test-results/`; `ASTER_TEST_OUTPUT` overrides the directory.

## Remaining test limits

This is not a formal accessibility, privacy or production-security certification. Firefox, Safari, real touch dragging, screen readers, OS clipboard permission dialogs, very large forms, pathological regular expressions and long-running high-concurrency workloads have not been comprehensively tested. Server examples validate JSON, not storage or upload content. Anonymous-mode tests verify payload policy and lack of local storage; they cannot certify the surrounding application's network/logging behavior.
