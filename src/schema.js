import { assertForm, fieldsOf } from "./core.js";
function fieldSchema(field) {
  const v = field.validation ?? {};
  let schema;
  switch (field.type) {
    case "text":
      schema = { type: "string", minLength: Math.max(1, v.minLength ?? 0) };
      if (v.maxLength != null) schema.maxLength = v.maxLength;
      if (v.pattern) schema.pattern = v.pattern;
      break;
    case "number":
      schema = { type: v.integer ? "integer" : "number" };
      if (v.min != null) schema.minimum = v.min;
      if (v.max != null) schema.maximum = v.max;
      break;
    case "date":
      schema = {
        type: "string",
        format: "date",
        pattern: "^\\d{4}-\\d{2}-\\d{2}$",
      };
      break;
    case "select":
      schema = { type: "string", enum: field.options.map((o) => o.value) };
      break;
    case "multi-select":
      schema = {
        type: "array",
        items: { type: "string", enum: field.options.map((o) => o.value) },
        uniqueItems: true,
        minItems: Math.max(1, v.minItems ?? 0),
      };
      if (v.maxItems != null) schema.maxItems = v.maxItems;
      break;
    case "rating":
      schema = { type: "integer", minimum: 1, maximum: field.scale };
      break;
    case "matrix":
      schema = {
        type: "object",
        additionalProperties: false,
        minProperties: 1,
        properties: Object.fromEntries(
          field.rows.map((row) => [
            row.value,
            { type: "string", enum: field.columns.map((c) => c.value) },
          ]),
        ),
      };
      if (field.required) schema.required = field.rows.map((r) => r.value);
      break;
    case "file":
      schema = {
        type: "array",
        minItems: 1,
        maxItems: field.file.maxFiles,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["name", "size", "type"],
          properties: {
            name: {
              type: "string",
              minLength: 1,
              maxLength: 255,
              pattern: "^[^/\\\\]+$",
            },
            size: { type: "integer", minimum: 0, maximum: field.file.maxBytes },
            type: field.file.mimeTypes.length
              ? { type: "string", enum: field.file.mimeTypes }
              : { type: "string" },
          },
        },
      };
      break;
  }
  return { ...schema, title: field.label, description: field.help ?? "" };
}
/** Exports standard JSON Schema 2020-12 for answer objects, not layout JSON. */
export function toJSONSchema(
  form,
  { anonymous = form.settings.anonymous } = {},
) {
  assertForm(form);
  const fields = fieldsOf(form),
    index = new Map(fields.map((f) => [f.id, f]));
  function visible(id) {
    const f = index.get(id);
    if (anonymous && (f.personalData || f.type === "file")) return false;
    return f.visibleWhen ? condition(f.visibleWhen) : true;
  }
  function condition(rule) {
    if (rule.all) return { allOf: rule.all.map(condition) };
    if (rule.any) return { anyOf: rule.any.map(condition) };
    const target = index.get(rule.field);
    let match =
      rule.op === "includes"
        ? { type: "array", contains: { const: rule.value } }
        : rule.op === "ne"
          ? { not: { const: rule.value } }
          : { const: rule.value };
    return {
      allOf: [
        visible(target.id),
        {
          type: "object",
          required: [target.id],
          properties: { [target.id]: match },
        },
      ],
    };
  }
  const schema = {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    title: form.title,
    description: form.description ?? "",
    type: "object",
    additionalProperties: false,
    properties: {},
    required: [],
    allOf: [],
  };
  for (const field of fields) {
    schema.properties[field.id] = fieldSchema(field);
    const when = visible(field.id);
    if (when === true) {
      if (field.required) schema.required.push(field.id);
    } else if (when === false) {
      schema.properties[field.id] = false;
    } else
      schema.allOf.push({
        if: when,
        then: field.required ? { required: [field.id] } : true,
        else: { not: { required: [field.id] } },
      });
  }
  if (!schema.required.length) delete schema.required;
  if (!schema.allOf.length) delete schema.allOf;
  return schema;
}
export function submissionSchema(form, options = {}) {
  const anonymous = options.anonymous ?? form.settings.anonymous;
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    type: "object",
    additionalProperties: false,
    required: ["formId", "formVersion", "mode", "answers"],
    properties: {
      formId: { const: form.id },
      formVersion: { const: form.version },
      mode: { const: anonymous ? "anonymous" : "standard" },
      answers: toJSONSchema(form, { anonymous }),
    },
  };
}
