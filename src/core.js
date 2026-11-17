/** Aster Forms' original data model, condition evaluator and answer validator. */
export const FIELD_TYPES = [
  "text",
  "number",
  "date",
  "select",
  "multi-select",
  "rating",
  "file",
  "matrix",
];
const own = (value, key) => Object.hasOwn(value, key);
const object = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const copy = (value) => structuredClone(value);
const idPattern = /^[a-z][a-z0-9_]{0,63}$/;
const forbidden = new Set(["constructor", "prototype", "__proto__"]);
export const fieldsOf = (form) =>
  form.pages.flatMap((page) =>
    page.sections.flatMap((section) => section.fields),
  );
export function createForm(title = "Untitled form") {
  return {
    id: "new_form",
    version: 1,
    title,
    description: "",
    settings: { anonymous: false },
    pages: [
      {
        id: "page_1",
        title: "Page 1",
        sections: [
          {
            id: "section_1",
            title: "Your questions",
            description: "",
            fields: [],
          },
        ],
      },
    ],
  };
}
export function createField(type, id) {
  if (!FIELD_TYPES.includes(type)) throw new Error("Unknown field type");
  const field = {
    id,
    type,
    label: {
      text: "Short answer",
      number: "Number",
      date: "Date",
      select: "Choose one",
      "multi-select": "Choose all that apply",
      rating: "How would you rate it?",
      file: "Upload a file",
      matrix: "Rate each item",
    }[type],
    help: "",
    required: false,
    personalData: false,
    validation: {},
  };
  if (type === "select" || type === "multi-select")
    field.options = [
      { value: "option_1", label: "Option 1" },
      { value: "option_2", label: "Option 2" },
    ];
  if (type === "rating") field.scale = 5;
  if (type === "file")
    field.file = { maxFiles: 1, maxBytes: 5 * 1024 * 1024, mimeTypes: [] };
  if (type === "matrix") {
    field.rows = [
      { value: "quality", label: "Quality" },
      { value: "support", label: "Support" },
    ];
    field.columns = [
      { value: "poor", label: "Poor" },
      { value: "good", label: "Good" },
      { value: "excellent", label: "Excellent" },
    ];
  }
  return field;
}
function conditionRefs(condition) {
  if (!condition) return [];
  return condition.all
    ? condition.all.flatMap(conditionRefs)
    : condition.any
      ? condition.any.flatMap(conditionRefs)
      : [condition.field];
}
function checkOptions(options, label) {
  if (!Array.isArray(options) || !options.length || options.length > 100)
    throw new Error(`${label} needs 1–100 choices`);
  const values = new Set();
  for (const item of options) {
    if (
      !object(item) ||
      typeof item.value !== "string" ||
      !item.value ||
      item.value.length > 100 ||
      forbidden.has(item.value) ||
      typeof item.label !== "string" ||
      !item.label.trim() ||
      values.has(item.value)
    )
      throw new Error(`${label} has invalid or duplicate choices`);
    values.add(item.value);
  }
}
export function assertForm(form) {
  if (
    !object(form) ||
    typeof form.title !== "string" ||
    !form.title.trim() ||
    typeof form.id !== "string" ||
    !idPattern.test(form.id) ||
    forbidden.has(form.id) ||
    !Number.isInteger(form.version) ||
    form.version < 1
  )
    throw new Error(
      "A form needs a valid id, title and positive integer version",
    );
  if (
    !Array.isArray(form.pages) ||
    !form.pages.length ||
    form.pages.length > 50
  )
    throw new Error("A form needs 1–50 pages");
  if (!object(form.settings) || typeof form.settings.anonymous !== "boolean")
    throw new Error("settings.anonymous must be a boolean");
  const ids = new Set();
  const identify = (item, label) => {
    if (
      !object(item) ||
      !idPattern.test(item.id) ||
      forbidden.has(item.id) ||
      ids.has(item.id)
    )
      throw new Error(`${label} needs a unique safe ID`);
    ids.add(item.id);
  };
  for (const page of form.pages) {
    identify(page, "Page");
    if (
      typeof page.title !== "string" ||
      !page.title.trim() ||
      !Array.isArray(page.sections) ||
      !page.sections.length ||
      page.sections.length > 100
    )
      throw new Error("Pages need a title and 1–100 sections");
    for (const section of page.sections) {
      identify(section, "Section");
      if (typeof section.title !== "string" || !Array.isArray(section.fields))
        throw new Error("Invalid section");
      for (const field of section.fields) {
        identify(field, "Field");
        if (
          !FIELD_TYPES.includes(field.type) ||
          typeof field.label !== "string" ||
          !field.label.trim() ||
          typeof field.required !== "boolean" ||
          typeof field.personalData !== "boolean"
        )
          throw new Error("Invalid field type, label or flags");
        const v = field.validation ?? {};
        if (!object(v)) throw new Error("Invalid validation settings");
        const keys = {
          text: ["minLength", "maxLength", "pattern"],
          number: ["min", "max", "integer"],
          date: [],
          select: [],
          "multi-select": ["minItems", "maxItems"],
          rating: [],
          file: [],
          matrix: [],
        }[field.type];
        for (const [key, value] of Object.entries(v)) {
          if (!keys.includes(key))
            throw new Error(`Unsupported ${field.type} validation: ${key}`);
          if (key === "pattern") {
            if (typeof value !== "string" || value.length > 256)
              throw new Error("Pattern must be at most 256 characters");
            try {
              new RegExp(value, "u");
            } catch {
              throw new Error("Invalid regular expression");
            }
          } else if (key === "integer") {
            if (typeof value !== "boolean")
              throw new Error("integer must be boolean");
          } else if (
            typeof value !== "number" ||
            !Number.isFinite(value) ||
            (key !== "min" &&
              key !== "max" &&
              (!Number.isInteger(value) || value < 0))
          )
            throw new Error(`Invalid ${key}`);
        }
        for (const [lo, hi] of [
          ["min", "max"],
          ["minLength", "maxLength"],
          ["minItems", "maxItems"],
        ])
          if (v[lo] != null && v[hi] != null && v[lo] > v[hi])
            throw new Error(`${lo} must not exceed ${hi}`);
        if (["select", "multi-select"].includes(field.type))
          checkOptions(field.options, field.label);
        if (field.type === "multi-select" && v.minItems > field.options.length)
          throw new Error("Minimum selections exceeds available choices");
        if (
          field.type === "rating" &&
          (!Number.isInteger(field.scale) ||
            field.scale < 2 ||
            field.scale > 10)
        )
          throw new Error("Rating scale must be 2–10");
        if (field.type === "matrix") {
          checkOptions(field.rows, "Matrix rows");
          checkOptions(field.columns, "Matrix columns");
        }
        if (field.type === "file") {
          const f = field.file;
          if (
            !object(f) ||
            !Number.isInteger(f.maxFiles) ||
            f.maxFiles < 1 ||
            f.maxFiles > 20 ||
            !Number.isInteger(f.maxBytes) ||
            f.maxBytes < 1 ||
            f.maxBytes > 100 * 1024 * 1024 ||
            !Array.isArray(f.mimeTypes) ||
            f.mimeTypes.some(
              (m) => typeof m !== "string" || !/^[-\w.+]+\/[-\w.+]+$/.test(m),
            )
          )
            throw new Error("Invalid file limits or exact MIME types");
        }
      }
    }
  }
  const fields = fieldsOf(form);
  if (fields.length > 500) throw new Error("Maximum 500 fields");
  const index = new Map(fields.map((f) => [f.id, f]));
  function checkCondition(condition, depth = 0) {
    if (!condition) return;
    if (!object(condition) || depth > 12)
      throw new Error("Invalid or overly deep condition");
    if (condition.all || condition.any) {
      const rules = condition.all ?? condition.any;
      if (
        !Array.isArray(rules) ||
        !rules.length ||
        rules.length > 20 ||
        ("all" in condition && "any" in condition)
      )
        throw new Error("Invalid condition group");
      rules.forEach((c) => checkCondition(c, depth + 1));
      return;
    }
    const target = index.get(condition.field);
    if (!target || !["eq", "ne", "includes"].includes(condition.op))
      throw new Error("Condition references an unknown field or operation");
    if (["file", "matrix"].includes(target.type))
      throw new Error("Conditions cannot compare file or matrix fields");
    if (condition.op === "includes") {
      if (
        target.type !== "multi-select" ||
        typeof condition.value !== "string" ||
        !target.options.some((o) => o.value === condition.value)
      )
        throw new Error("includes needs a multi-select choice");
    } else {
      if (target.type === "multi-select")
        throw new Error("Use includes with multi-select fields");
      if (["number", "rating"].includes(target.type)) {
        if (
          typeof condition.value !== "number" ||
          !Number.isFinite(condition.value)
        )
          throw new Error("Numeric condition value required");
      } else if (typeof condition.value !== "string")
        throw new Error("Text condition value required");
    }
  }
  fields.forEach((f) => checkCondition(f.visibleWhen));
  const visiting = new Set(),
    visited = new Set();
  function visit(id) {
    if (visiting.has(id))
      throw new Error("Visibility conditions cannot contain cycles");
    if (visited.has(id)) return;
    visiting.add(id);
    conditionRefs(index.get(id).visibleWhen).forEach(visit);
    visiting.delete(id);
    visited.add(id);
  }
  fields.forEach((f) => visit(f.id));
  return form;
}
export function visibility(
  form,
  answers,
  { anonymous = form.settings.anonymous } = {},
) {
  const index = new Map(fieldsOf(form).map((f) => [f.id, f])),
    result = new Map(),
    active = new Set();
  function test(condition) {
    if (!condition) return true;
    if (condition.all) return condition.all.every(test);
    if (condition.any) return condition.any.some(test);
    if (!visible(condition.field) || !own(answers, condition.field))
      return false;
    const value = answers[condition.field];
    return condition.op === "includes"
      ? Array.isArray(value) && value.includes(condition.value)
      : condition.op === "ne"
        ? !Object.is(value, condition.value)
        : Object.is(value, condition.value);
  }
  function visible(id) {
    if (result.has(id)) return result.get(id);
    if (active.has(id)) throw new Error("Cyclic condition");
    const field = index.get(id);
    if (!field) return false;
    active.add(id);
    const value =
      !(anonymous && (field.personalData || field.type === "file")) &&
      test(field.visibleWhen);
    active.delete(id);
    result.set(id, value);
    return value;
  }
  index.forEach((_, id) => visible(id));
  return result;
}
function empty(value) {
  return (
    value == null ||
    value === "" ||
    (Array.isArray(value) && !value.length) ||
    (object(value) && !Object.keys(value).length)
  );
}
export function cleanAnswers(form, answers, options = {}) {
  const visible = visibility(form, answers, options),
    result = {};
  for (const field of fieldsOf(form))
    if (
      visible.get(field.id) &&
      own(answers, field.id) &&
      !empty(answers[field.id])
    )
      result[field.id] = copy(answers[field.id]);
  return result;
}
function isDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return false;
  const [year, month, day] = value.split("-").map(Number);
  return (
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= new Date(Date.UTC(year === 0 ? 400 : year, month, 0)).getUTCDate()
  );
}
function fieldErrors(field, value) {
  const errors = [],
    v = field.validation ?? {},
    fail = (message) => errors.push(message),
    allowed = (items) => items.map((o) => o.value);
  if (field.type === "text") {
    if (typeof value !== "string") fail("Enter text.");
    else {
      const length = Array.from(value).length;
      if (length < Math.max(1, v.minLength ?? 0))
        fail(`Use at least ${Math.max(1, v.minLength ?? 0)} characters.`);
      if (v.maxLength != null && length > v.maxLength)
        fail(`Use no more than ${v.maxLength} characters.`);
      if (v.pattern && !new RegExp(v.pattern, "u").test(value))
        fail("Match the required format.");
    }
  }
  if (field.type === "number" || field.type === "rating") {
    if (typeof value !== "number" || !Number.isFinite(value))
      fail("Enter a valid number.");
    else {
      if ((v.integer || field.type === "rating") && !Number.isInteger(value))
        fail("Enter a whole number.");
      const min = field.type === "rating" ? 1 : v.min,
        max = field.type === "rating" ? field.scale : v.max;
      if (min != null && value < min) fail(`Minimum is ${min}.`);
      if (max != null && value > max) fail(`Maximum is ${max}.`);
    }
  }
  if (field.type === "date" && !isDate(value))
    fail("Enter a valid date (YYYY-MM-DD).");
  if (field.type === "select" && !allowed(field.options).includes(value))
    fail("Choose a listed option.");
  if (field.type === "multi-select") {
    if (!Array.isArray(value)) fail("Choose one or more options.");
    else {
      if (value.length < Math.max(1, v.minItems ?? 0))
        fail(`Choose at least ${Math.max(1, v.minItems ?? 0)} options.`);
      if (v.maxItems != null && value.length > v.maxItems)
        fail(`Choose no more than ${v.maxItems} options.`);
      if (
        new Set(value).size !== value.length ||
        value.some((x) => !allowed(field.options).includes(x))
      )
        fail("Selections must be unique listed options.");
    }
  }
  if (field.type === "matrix") {
    if (!object(value)) fail("Complete the matrix.");
    else {
      if (!Object.keys(value).length)
        fail("Choose at least one matrix answer.");
      if (
        Object.keys(value).some((k) => !allowed(field.rows).includes(k)) ||
        Object.values(value).some((x) => !allowed(field.columns).includes(x))
      )
        fail("Choose only listed matrix answers.");
      if (field.required && field.rows.some((row) => !own(value, row.value)))
        fail("Answer every matrix row.");
    }
  }
  if (field.type === "file") {
    if (
      !Array.isArray(value) ||
      value.length < 1 ||
      value.length > field.file.maxFiles
    )
      fail(`Choose 1–${field.file.maxFiles} files.`);
    else
      for (const file of value) {
        if (
          !object(file) ||
          Object.keys(file).some(
            (k) => !["name", "size", "type"].includes(k),
          ) ||
          typeof file.name !== "string" ||
          !file.name.length ||
          Array.from(file.name).length > 255 ||
          /[\/\\]/.test(file.name) ||
          !Number.isInteger(file.size) ||
          file.size < 0 ||
          file.size > field.file.maxBytes ||
          typeof file.type !== "string" ||
          (field.file.mimeTypes.length &&
            !field.file.mimeTypes.includes(file.type))
        )
          fail(
            `Files must match the accepted type and ${field.file.maxBytes}-byte limit.`,
          );
      }
  }
  return errors;
}
export function validateAnswers(form, answers, options = {}) {
  assertForm(form);
  const errors = [];
  if (!object(answers))
    return {
      valid: false,
      errors: [{ field: null, message: "Answers must be an object." }],
    };
  const fields = fieldsOf(form),
    index = new Set(fields.map((f) => f.id)),
    visible = visibility(form, answers, options);
  for (const key of Object.keys(answers))
    if (!index.has(key))
      errors.push({ field: key, message: "Unknown answer field." });
  for (const field of fields) {
    const present = own(answers, field.id);
    if (!visible.get(field.id)) {
      if (present)
        errors.push({
          field: field.id,
          message: "Hidden fields must not be submitted.",
        });
      continue;
    }
    if (!present) {
      if (field.required)
        errors.push({ field: field.id, message: "This answer is required." });
      continue;
    }
    for (const message of fieldErrors(field, answers[field.id]))
      errors.push({ field: field.id, message });
  }
  return { valid: !errors.length, errors };
}
export function createSubmission(form, answers, options = {}) {
  const anonymous = options.anonymous ?? form.settings.anonymous,
    clean = cleanAnswers(form, answers, { anonymous }),
    validation = validateAnswers(form, clean, { anonymous });
  if (!validation.valid) {
    const error = new Error("Please correct the highlighted answers.");
    error.errors = validation.errors;
    throw error;
  }
  return {
    formId: form.id,
    formVersion: form.version,
    mode: anonymous ? "anonymous" : "standard",
    answers: clean,
  };
}
export class FormDocument {
  constructor(form = createForm()) {
    assertForm(form);
    this.form = copy(form);
    this.past = [];
    this.future = [];
    this.listeners = new Set();
  }
  getDefinition() {
    return copy(this.form);
  }
  onChange(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  emit() {
    this.listeners.forEach((fn) => fn(this.getDefinition()));
  }
  change(fn) {
    const next = copy(this.form);
    fn(next);
    assertForm(next);
    this.past.push(this.form);
    if (this.past.length > 100) this.past.shift();
    this.form = next;
    this.future = [];
    this.emit();
  }
  replace(form) {
    this.change((next) => {
      for (const key of Object.keys(next)) delete next[key];
      Object.assign(next, copy(form));
    });
  }
  undo() {
    if (!this.past.length) return;
    this.future.push(this.form);
    this.form = this.past.pop();
    this.emit();
  }
  redo() {
    if (!this.future.length) return;
    this.past.push(this.form);
    this.form = this.future.pop();
    this.emit();
  }
  nextId(prefix) {
    const used = new Set(
      this.form.pages.flatMap((p) => [
        p.id,
        ...p.sections.flatMap((s) => [s.id, ...s.fields.map((f) => f.id)]),
      ]),
    );
    let n = 1;
    while (used.has(`${prefix}_${n}`)) n++;
    return `${prefix}_${n}`;
  }
  locate(id, form = this.form) {
    for (const page of form.pages) {
      if (page.id === id)
        return { item: page, list: form.pages, kind: "page", page };
      for (const section of page.sections) {
        if (section.id === id)
          return {
            item: section,
            list: page.sections,
            kind: "section",
            page,
            section,
          };
        for (const field of section.fields)
          if (field.id === id)
            return {
              item: field,
              list: section.fields,
              kind: "field",
              page,
              section,
            };
      }
    }
    throw new Error("Item not found");
  }
  update(id, patch) {
    this.change((form) => {
      const { item } = this.locate(id, form);
      if ("id" in patch && patch.id !== id)
        throw new Error("IDs are stable; create a new field to change its ID");
      Object.assign(item, copy(patch));
    });
  }
  updateForm(patch) {
    this.change((form) => Object.assign(form, copy(patch)));
  }
  addField(type, sectionId) {
    const field = createField(type, this.nextId(type.replaceAll("-", "_")));
    this.change((form) => {
      const target = this.locate(sectionId, form);
      if (target.kind !== "section")
        throw new Error("Target must be a section");
      target.item.fields.push(field);
    });
    return field.id;
  }
  addSection(pageId) {
    const id = this.nextId("section");
    this.change((form) => {
      const page = this.locate(pageId, form);
      if (page.kind !== "page") throw new Error("Target must be a page");
      page.item.sections.push({
        id,
        title: "New section",
        description: "",
        fields: [],
      });
    });
    return id;
  }
  addPage() {
    const id = this.nextId("page"),
      sectionId = this.nextId("section");
    this.change((form) =>
      form.pages.push({
        id,
        title: "New page",
        sections: [
          {
            id: sectionId,
            title: "Your questions",
            description: "",
            fields: [],
          },
        ],
      }),
    );
    return id;
  }
  remove(id) {
    this.change((form) => {
      const found = this.locate(id, form);
      if (found.kind !== "field" && found.list.length === 1)
        throw new Error(`Keep at least one ${found.kind} in this container`);
      const removed = new Set(
        found.kind === "field"
          ? [id]
          : found.kind === "section"
            ? found.item.fields.map((f) => f.id)
            : found.item.sections.flatMap((s) => s.fields.map((f) => f.id)),
      );
      found.list.splice(found.list.indexOf(found.item), 1);
      fieldsOf(form).forEach((f) => {
        if (conditionRefs(f.visibleWhen).some((ref) => removed.has(ref)))
          delete f.visibleWhen;
      });
    });
  }
  move(id, targetId, index) {
    this.change((form) => {
      const source = this.locate(id, form);
      let target;
      if (source.kind === "page") {
        if (targetId !== null) throw new Error("Page target must be null");
        target = form.pages;
      } else {
        const destination = this.locate(targetId, form);
        if (source.kind === "field" && destination.kind === "section")
          target = destination.item.fields;
        else if (source.kind === "section" && destination.kind === "page")
          target = destination.item.sections;
        else throw new Error("Invalid move target");
      }
      if (
        source.kind === "section" &&
        source.list !== target &&
        source.list.length === 1
      )
        throw new Error("Keep at least one section per page");
      source.list.splice(source.list.indexOf(source.item), 1);
      const at =
        index == null
          ? target.length
          : Math.max(0, Math.min(target.length, index));
      target.splice(at, 0, source.item);
    });
  }
}
