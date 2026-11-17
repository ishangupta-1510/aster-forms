import { test } from "node:test";
import assert from "node:assert/strict";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import {
  createForm,
  createField,
  assertForm,
  FormDocument,
  fieldsOf,
  visibility,
  cleanAnswers,
  validateAnswers,
  createSubmission,
  toJSONSchema,
  submissionSchema,
} from "../src/index.js";
import { sampleForm } from "../demo/sample.js";
function compile(form, options) {
  const ajv = new Ajv2020({
    strict: true,
    strictRequired: false,
    allErrors: true,
  });
  addFormats(ajv);
  return ajv.compile(toJSONSchema(form, options));
}
function fixture() {
  const form = createForm();
  form.pages[0].sections[0].fields = [
    "text",
    "number",
    "date",
    "select",
    "multi-select",
    "rating",
    "file",
    "matrix",
  ].map((type, i) => ({ ...createField(type, `field_${i}`), required: true }));
  return form;
}
function valid() {
  return {
    field_0: "Hello",
    field_1: 42,
    field_2: "2024-02-29",
    field_3: "option_1",
    field_4: ["option_1"],
    field_5: 4,
    field_6: [{ name: "file.txt", size: 5, type: "text/plain" }],
    field_7: { quality: "good", support: "excellent" },
  };
}
test("all eight types validate identically in the engine and independent Ajv", () => {
  const form = fixture(),
    schema = compile(form),
    answers = valid();
  assert(validateAnswers(form, answers).valid);
  assert(schema(answers), JSON.stringify(schema.errors));
  for (const field of fieldsOf(form)) {
    const missing = { ...answers };
    delete missing[field.id];
    assert.equal(validateAnswers(form, missing).valid, false, field.type);
    assert.equal(schema(missing), false, field.type);
  }
});
test("type, enum, range, date, matrix and file errors agree with JSON Schema", () => {
  const form = fixture();
  form.pages[0].sections[0].fields[0].validation = {
    minLength: 2,
    maxLength: 8,
    pattern: "^[A-Z]",
  };
  form.pages[0].sections[0].fields[1].validation = {
    min: 1,
    max: 100,
    integer: true,
  };
  form.pages[0].sections[0].fields[4].validation = { minItems: 1, maxItems: 1 };
  form.pages[0].sections[0].fields[6].file = {
    maxFiles: 1,
    maxBytes: 10,
    mimeTypes: ["text/plain"],
  };
  const schema = compile(form);
  const cases = [
    ["field_0", "x"],
    ["field_0", "ABCDEFGHI"],
    ["field_1", "3"],
    ["field_1", 0],
    ["field_1", 1.5],
    ["field_1", 101],
    ["field_2", "2025-02-29"],
    ["field_2", "2024-13-01"],
    ["field_3", "other"],
    ["field_4", ["option_1", "option_1"]],
    ["field_4", ["option_1", "option_2"]],
    ["field_5", 0],
    ["field_5", 6],
    ["field_6", [{ name: "x", size: 11, type: "text/plain" }]],
    ["field_6", [{ name: "../x", size: 1, type: "text/plain" }]],
    ["field_6", [{ name: "x", size: 1, type: "image/png" }]],
    ["field_7", { quality: "good" }],
    ["field_7", { quality: "good", support: "invalid" }],
    ["field_7", { quality: "good", support: "good", extra: "good" }],
  ];
  for (const [id, value] of cases) {
    const data = { ...valid(), [id]: value };
    assert.equal(
      validateAnswers(form, data).valid,
      false,
      JSON.stringify([id, value]),
    );
    assert.equal(schema(data), false, JSON.stringify([id, value]));
  }
});
test("conditional required and hidden rejection handle absent, equal and unequal values", () => {
  const form = createForm(),
    fields = form.pages[0].sections[0].fields;
  fields.push(createField("select", "choice"), {
    ...createField("text", "detail"),
    required: true,
    visibleWhen: { field: "choice", op: "eq", value: "option_1" },
  });
  const schema = compile(form);
  for (const [data, expected] of [
    [{}, true],
    [{ choice: "option_1" }, false],
    [{ choice: "option_1", detail: "Yes" }, true],
    [{ choice: "option_2" }, true],
    [{ choice: "option_2", detail: "Forged" }, false],
    [{ detail: "Forged" }, false],
  ]) {
    assert.equal(validateAnswers(form, data).valid, expected);
    assert.equal(schema(data), expected, JSON.stringify(schema.errors));
  }
});
test("chained and compound conditions ignore hidden controllers", () => {
  const form = createForm(),
    fields = form.pages[0].sections[0].fields;
  fields.push(
    createField("select", "first"),
    {
      ...createField("text", "second"),
      visibleWhen: { field: "first", op: "eq", value: "option_1" },
    },
    {
      ...createField("text", "third"),
      required: true,
      visibleWhen: {
        all: [
          { field: "second", op: "eq", value: "yes" },
          { field: "first", op: "ne", value: "option_2" },
        ],
      },
    },
  );
  assert.equal(
    visibility(form, { first: "option_2", second: "yes" }).get("third"),
    false,
  );
  const data = { first: "option_1", second: "yes", third: "ok" };
  assert(validateAnswers(form, data).valid);
  assert(compile(form)(data));
  assert.deepEqual(
    cleanAnswers(form, { first: "option_2", second: "yes", third: "stale" }),
    { first: "option_2" },
  );
});
test("multi-select includes and any rules compile to equivalent schema", () => {
  const form = createForm(),
    fields = form.pages[0].sections[0].fields;
  fields.push(
    createField("multi-select", "choices"),
    createField("number", "amount"),
    {
      ...createField("text", "note"),
      required: true,
      visibleWhen: {
        any: [
          { field: "choices", op: "includes", value: "option_1" },
          { field: "amount", op: "eq", value: 0 },
        ],
      },
    },
  );
  const schema = compile(form);
  for (const data of [
    {},
    { choices: ["option_2"] },
    { amount: 0 },
    { choices: ["option_1"], note: "why" },
    { amount: 3, note: "hidden" },
  ])
    assert.equal(schema(data), validateAnswers(form, data).valid);
});
test("cycles, duplicate IDs, unknown dependencies and invalid validators reject atomically", () => {
  const doc = new FormDocument(),
    section = doc.form.pages[0].sections[0].id,
    a = doc.addField("text", section),
    b = doc.addField("text", section);
  doc.update(a, { visibleWhen: { field: b, op: "eq", value: "yes" } });
  const before = doc.getDefinition();
  assert.throws(
    () => doc.update(b, { visibleWhen: { field: a, op: "eq", value: "yes" } }),
    /cycles/,
  );
  assert.deepEqual(doc.getDefinition(), before);
  assert.throws(() => doc.update(a, { validation: { pattern: "[" } }));
  assert.throws(() =>
    doc.update(a, {
      visibleWhen: { field: "missing", op: "eq", value: "yes" },
    }),
  );
  const duplicate = doc.getDefinition();
  duplicate.pages[0].sections[0].fields[1].id = a;
  assert.throws(() => assertForm(duplicate));
});
test("anonymous mode suppresses personal data, file metadata and dependent fields", () => {
  const form = fixture();
  form.settings.anonymous = true;
  form.pages[0].sections[0].fields[0].personalData = true;
  form.pages[0].sections[0].fields[1].visibleWhen = {
    field: "field_0",
    op: "eq",
    value: "Hello",
  };
  const answers = cleanAnswers(form, valid());
  assert(!("field_0" in answers));
  assert(!("field_1" in answers));
  assert(!("field_6" in answers));
  assert(validateAnswers(form, answers).valid);
  assert(compile(form)(answers));
  assert.equal(compile(form)(valid()), false);
  const payload = createSubmission(form, valid());
  assert.deepEqual(Object.keys(payload), [
    "formId",
    "formVersion",
    "mode",
    "answers",
  ]);
  assert.equal(payload.mode, "anonymous");
});
test("submission schema locks form version and anonymity policy", () => {
  const ajv = new Ajv2020({ strict: true, strictRequired: false });
  addFormats(ajv);
  const validate = ajv.compile(submissionSchema(sampleForm)),
    payload = createSubmission(sampleForm, {
      relationship: "customer",
      recommendation: 4,
      scorecard: { ease: "good", quality: "good", support: "good" },
    });
  assert(validate(payload));
  assert.equal(validate({ ...payload, mode: "anonymous" }), false);
  assert.equal(validate({ ...payload, formVersion: 2 }), false);
  assert.equal(validate({ ...payload, userId: "tracking" }), false);
});
test("document move, undo, redo and imported snapshots are independent", () => {
  const doc = new FormDocument(),
    first = doc.form.pages[0].sections[0].id,
    a = doc.addField("text", first),
    b = doc.addField("number", first),
    section = doc.addSection(doc.form.pages[0].id);
  doc.move(a, section, 0);
  assert.equal(doc.locate(a).section.id, section);
  doc.undo();
  assert.equal(doc.locate(a).section.id, first);
  doc.redo();
  assert.equal(doc.locate(a).section.id, section);
  doc.move(b, section, 0);
  assert.deepEqual(
    doc.locate(a).list.map((f) => f.id),
    [b, a],
  );
  const saved = doc.getDefinition();
  saved.title = "Changed outside";
  assert.notEqual(doc.form.title, saved.title);
  const page = doc.addPage();
  doc.move(page, null, 0);
  assert.equal(doc.form.pages[0].id, page);
});
test("deleting fields clears dependent rules and undo restores both", () => {
  const doc = new FormDocument(),
    section = doc.form.pages[0].sections[0].id,
    a = doc.addField("text", section),
    b = doc.addField("text", section);
  doc.update(b, { visibleWhen: { field: a, op: "eq", value: "yes" } });
  doc.remove(a);
  assert.equal(doc.locate(b).item.visibleWhen, undefined);
  doc.undo();
  assert.equal(doc.locate(b).item.visibleWhen.field, a);
});
test("unknown answers, non-object input and prototype keys are rejected", () => {
  const form = createForm();
  assert.equal(validateAnswers(form, { other: 1 }).valid, false);
  assert.equal(validateAnswers(form, []).valid, false);
  assert.equal(
    validateAnswers(form, JSON.parse('{"__proto__":{"polluted":true}}')).valid,
    false,
  );
  const field = createField("text", "constructor");
  form.pages[0].sections[0].fields.push(field);
  assert.throws(() => assertForm(form));
  assert.equal({}.polluted, undefined);
});
test("Unicode lengths match JSON Schema code-point lengths and valid zero survives cleaning", () => {
  const form = createForm();
  form.pages[0].sections[0].fields = [
    { ...createField("text", "emoji"), validation: { maxLength: 1 } },
    createField("number", "zero"),
  ];
  const answers = { emoji: "🙂", zero: 0 };
  assert(validateAnswers(form, answers).valid);
  assert(compile(form)(answers));
  assert.deepEqual(cleanAnswers(form, answers), answers);
});
test("optional empty values are omitted; required submission rejects missing answers", () => {
  assert.deepEqual(
    cleanAnswers(sampleForm, {
      feedback: "",
      interests: [],
      scorecard: {},
      unknown: "x",
    }),
    {},
  );
  assert.throws(() => createSubmission(sampleForm, {}), /highlighted/);
});
