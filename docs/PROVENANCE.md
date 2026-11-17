# Design and dependencies

Aster Forms organizes definitions as pages, sections, and fields. A headless document model manages validated edits and history; separate builder and runner components provide the editing and response interfaces. The condition evaluator and schema exporter express the same visibility policy for browser and server validation.

The library has no runtime package dependencies. Its implementation includes the form model, DOM components, validation functions, condition representation, JSON Schema exporter, and responsive styles.

## Standards

- [JSON Schema conditional validation](https://json-schema.org/understanding-json-schema/reference/conditionals)
- [Ajv JSON Schema support](https://ajv.js.org/json-schema.html)

## Development tools

Ajv and ajv-formats validate exported schemas in tests and server examples. Playwright exercises browser interactions. TypeScript checks the public API definitions, and Prettier formats the source.

The project's code is released under the [MIT license](../LICENSE). Development dependencies retain their respective licenses.
