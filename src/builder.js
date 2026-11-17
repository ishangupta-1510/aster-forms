import { FormDocument, createForm, fieldsOf, FIELD_TYPES } from "./core.js";
import { toJSONSchema, submissionSchema } from "./schema.js";
import { FormRunner } from "./runner.js";
import {
  el,
  button,
  option,
  downloadJSON,
  fieldNames,
  fieldIcons,
} from "./dom.js";
export class FormBuilder {
  constructor(container, options = {}) {
    this.options = options;
    this.document = new FormDocument(options.form ?? createForm());
    this.mode = "build";
    this.selection = null;
    this.pageId = this.document.form.pages[0].id;
    this.schemaKind = "answers";
    this.root = el("section", "af-builder");
    container.replaceChildren(this.root);
    this.unsubscribe = this.document.onChange((form) => {
      this.render();
      options.onChange?.(form);
    });
    this.render();
  }
  attempt(action) {
    try {
      const result = action();
      if (result?.catch) result.catch((e) => this.error(e));
      return result;
    } catch (error) {
      this.error(error);
    }
  }
  error(error) {
    this.notice.hidden = false;
    this.notice.replaceChildren(
      el("span", "", error.message ?? String(error)),
      button("Dismiss", () => (this.notice.hidden = true), "af-text-button"),
    );
    this.options.onError?.(error);
  }
  getDefinition() {
    return this.document.getDefinition();
  }
  getJSONSchema() {
    return toJSONSchema(this.document.form);
  }
  setDefinition(form) {
    this.document.replace(form);
  }
  select(id) {
    this.selection = id;
    if (id) {
      const found = this.document.locate(id);
      this.pageId = found.page.id;
    }
    this.render();
  }
  activePage() {
    return (
      this.document.form.pages.find((p) => p.id === this.pageId) ??
      this.document.form.pages[0]
    );
  }
  activeSection() {
    if (this.selection) {
      try {
        const found = this.document.locate(this.selection);
        if (found.section) return found.section;
      } catch {}
    }
    return this.activePage().sections[0];
  }
  render() {
    this.runner?.destroy();
    this.runner = null;
    this.root.replaceChildren();
    const form = this.document.form;
    if (this.selection) {
      try {
        this.document.locate(this.selection);
      } catch {
        this.selection = null;
      }
    }
    const toolbar = el("div", "af-builder-toolbar"),
      brand = el("div", "af-brand");
    brand.append(
      el("span", "af-brand-icon", "✳"),
      el("strong", "", "aster"),
      el("span", "af-brand-suffix", "/ forms"),
    );
    const tabs = el("div", "af-tabs");
    for (const [key, title] of [
      ["build", "Build"],
      ["preview", "Preview"],
      ["schema", "JSON Schema"],
    ]) {
      const b = button(title, () => {
        this.mode = key;
        this.render();
      });
      b.setAttribute("aria-pressed", String(this.mode === key));
      tabs.append(b);
    }
    const actions = el("div", "af-toolbar-actions");
    actions.append(
      button("Undo", () => this.document.undo(), "af-icon-button"),
      button("Redo", () => this.document.redo(), "af-icon-button"),
      button("Import", () => this.importFile.click(), "af-button"),
      button(
        "Export form",
        () => downloadJSON(this.getDefinition(), `${form.id}.form.json`),
        "af-button af-primary",
      ),
    );
    this.importFile = el("input");
    this.importFile.type = "file";
    this.importFile.accept = ".json,application/json";
    this.importFile.hidden = true;
    this.importFile.setAttribute("aria-label", "Import form JSON");
    this.importFile.addEventListener("change", () =>
      this.attempt(async () => {
        const file = this.importFile.files[0];
        if (!file) return;
        if (file.size > 1024 * 1024)
          throw new Error("Definition must be under 1 MiB");
        const data = JSON.parse(await file.text());
        this.mode = "build";
        this.selection = null;
        this.pageId = data.pages?.[0]?.id;
        this.document.replace(data);
      }),
    );
    toolbar.append(brand, tabs, actions, this.importFile);
    this.notice = el("div", "af-notice");
    this.notice.setAttribute("role", "alert");
    this.notice.hidden = true;
    this.root.append(toolbar, this.notice);
    const info = el("div", "af-form-bar");
    info.append(
      el(
        "div",
        "",
        `${form.title}  /  ${form.pages.length} page${form.pages.length === 1 ? "" : "s"} · ${fieldsOf(form).length} fields`,
      ),
    );
    const settings = button(
      form.settings.anonymous ? "◉ Anonymous survey" : "○ Standard form",
      () => {
        this.mode = "build";
        this.selection = null;
        this.render();
      },
      "af-mode-badge",
    );
    info.append(settings);
    this.root.append(info);
    if (this.mode === "preview") {
      const area = el("div", "af-preview-area");
      this.root.append(area);
      this.runner = new FormRunner(area, form, {
        onSubmit: async (payload, context) => {
          await this.options.onPreviewSubmit?.(payload, context);
        },
        successMessage:
          "Preview complete. This builder does not send or store responses.",
      });
      return;
    }
    if (this.mode === "schema") {
      this.renderSchema();
      return;
    }
    const layout = el("div", "af-builder-layout");
    this.left = el("aside", "af-toolbox");
    this.canvas = el("main", "af-design-canvas");
    this.panel = el("aside", "af-properties");
    this.panel.setAttribute("aria-label", "Properties panel");
    layout.append(this.left, this.canvas, this.panel);
    this.root.append(layout);
    this.renderToolbox();
    this.renderCanvas();
    this.renderProperties();
  }
  renderToolbox() {
    this.left.append(
      el("h3", "af-eyebrow", "ADD A FIELD"),
      el("p", "af-small af-muted", "Click to add, or drag onto a section."),
    );
    const tools = el("div", "af-tools");
    for (const type of FIELD_TYPES) {
      const b = button(
        "",
        () => {
          const id = this.attempt(() =>
            this.document.addField(type, this.activeSection().id),
          );
          if (id) this.select(id);
        },
        "af-tool",
      );
      b.append(
        el("span", "af-tool-icon", fieldIcons[type]),
        el("span", "", fieldNames[type]),
      );
      b.setAttribute("aria-label", `Add ${fieldNames[type]} field`);
      b.draggable = true;
      b.addEventListener("dragstart", (e) => {
        e.dataTransfer.setData(
          "application/x-aster-form",
          JSON.stringify({ type }),
        );
        e.dataTransfer.effectAllowed = "copy";
      });
      tools.append(b);
    }
    this.left.append(tools);
    const pageTitle = el("div", "af-outline-heading");
    pageTitle.append(
      el("h3", "af-eyebrow", "FORM PAGES"),
      button(
        "+",
        () => {
          const id = this.document.addPage();
          this.select(id);
        },
        "af-icon-button",
      ),
    );
    this.left.append(pageTitle);
    for (const page of this.document.form.pages) {
      const row = el("div", "af-page-item");
      if (page.id === this.activePage().id) row.classList.add("af-page-active");
      const choose = button(
        page.title,
        () => this.select(page.id),
        "af-page-link",
      );
      choose.draggable = true;
      choose.addEventListener("dragstart", (e) => this.drag(e, page.id));
      row.append(choose);
      this.addMoveButtons(row, page.id);
      this.bindDrop(row, (data) => {
        if (!data.id) return;
        const source = this.document.locate(data.id);
        if (source.kind === "page")
          this.document.move(
            data.id,
            null,
            this.document.form.pages.indexOf(page),
          );
        else if (source.kind === "section")
          this.document.move(data.id, page.id);
      });
      this.left.append(row);
    }
    this.left.append(
      button(
        "+ Add page",
        () => {
          const id = this.document.addPage();
          this.select(id);
        },
        "af-button af-wide",
      ),
      el(
        "p",
        "af-small af-muted",
        "Drag fields between sections. Use arrow controls for keyboard-friendly reordering.",
      ),
    );
  }
  drag(event, id) {
    event.stopPropagation();
    event.dataTransfer.setData(
      "application/x-aster-form",
      JSON.stringify({ id }),
    );
    event.dataTransfer.effectAllowed = "move";
  }
  bindDrop(target, action) {
    target.addEventListener("dragover", (e) => {
      if ([...e.dataTransfer.types].includes("application/x-aster-form")) {
        e.preventDefault();
        e.stopPropagation();
        target.classList.add("af-drop-target");
      }
    });
    target.addEventListener("dragleave", () =>
      target.classList.remove("af-drop-target"),
    );
    target.addEventListener("drop", (e) => {
      e.preventDefault();
      e.stopPropagation();
      target.classList.remove("af-drop-target");
      this.attempt(() => {
        const raw = e.dataTransfer.getData("application/x-aster-form");
        if (raw) action(JSON.parse(raw), e);
      });
    });
  }
  addMoveButtons(container, id) {
    for (const [label, delta] of [
      ["↑", -1],
      ["↓", 1],
    ]) {
      const b = button(
        label,
        (e) => {
          e.stopPropagation();
          this.attempt(() => {
            const found = this.document.locate(id),
              index = found.list.indexOf(found.item);
            this.document.move(
              id,
              found.kind === "page"
                ? null
                : found.kind === "section"
                  ? found.page.id
                  : found.section.id,
              index + delta,
            );
          });
        },
        "af-order-button",
      );
      b.setAttribute("aria-label", `Move ${id} ${delta < 0 ? "up" : "down"}`);
      const found = this.document.locate(id),
        i = found.list.indexOf(found.item);
      b.disabled = delta < 0 ? i === 0 : i === found.list.length - 1;
      container.append(b);
    }
  }
  renderCanvas() {
    this.canvas.addEventListener(
      "dragover",
      (event) => {
        const rect = this.canvas.getBoundingClientRect();
        if (event.clientY < rect.top + 50) this.canvas.scrollTop -= 24;
        else if (event.clientY > rect.bottom - 50) this.canvas.scrollTop += 24;
      },
      true,
    );
    const page = this.activePage(),
      heading = el("div", "af-canvas-heading");
    heading.append(
      el(
        "div",
        "",
        `${String(this.document.form.pages.indexOf(page) + 1).padStart(2, "0")} / PAGE`,
      ),
      button("Page settings", () => this.select(page.id), "af-text-button"),
    );
    this.canvas.append(
      heading,
      el("h1", "af-design-title", page.title),
      el(
        "p",
        "af-muted af-design-note",
        "Build a thoughtful conversation, one question at a time.",
      ),
    );
    for (const section of page.sections) {
      const block = el("section", "af-design-section");
      block.dataset.section = section.id;
      const header = el("div", "af-section-heading"),
        drag = button("⠿", () => this.select(section.id), "af-drag-handle");
      drag.draggable = true;
      drag.setAttribute("aria-label", `Drag section ${section.id}`);
      drag.addEventListener("dragstart", (e) => this.drag(e, section.id));
      header.append(
        drag,
        button(
          section.title || "Untitled section",
          () => this.select(section.id),
          "af-section-title",
        ),
      );
      this.addMoveButtons(header, section.id);
      block.append(header);
      if (section.description)
        block.append(el("p", "af-muted", section.description));
      section.fields.forEach((field) => {
        const card = el("article", "af-field-card");
        card.dataset.field = field.id;
        card.tabIndex = 0;
        card.setAttribute("aria-label", `Edit ${field.label}`);
        if (this.selection === field.id) card.classList.add("af-selected");
        card.addEventListener("click", () => this.select(field.id));
        card.addEventListener("keydown", (e) => {
          if (e.target === card && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            this.select(field.id);
          }
        });
        const top = el("div", "af-card-heading"),
          handle = button(
            "⠿",
            (e) => {
              e.stopPropagation();
              this.select(field.id);
            },
            "af-drag-handle",
          );
        handle.draggable = true;
        handle.setAttribute("aria-label", `Drag ${field.id}`);
        handle.addEventListener("dragstart", (e) => this.drag(e, field.id));
        top.append(
          handle,
          el("span", "af-field-type", fieldNames[field.type]),
          el("span", "af-card-spacer"),
        );
        if (field.visibleWhen)
          top.append(el("span", "af-logic-badge", "Conditional"));
        if (field.personalData || field.type === "file")
          top.append(
            el(
              "span",
              "af-sensitive-badge",
              this.document.form.settings.anonymous
                ? "Excluded in anonymous"
                : "Personal / file",
            ),
          );
        this.addMoveButtons(top, field.id);
        top.append(
          button(
            "×",
            (e) => {
              e.stopPropagation();
              this.attempt(() => this.document.remove(field.id));
            },
            "af-icon-button",
          ),
        );
        card.append(
          top,
          el("h3", "af-card-label", field.label + (field.required ? " *" : "")),
        );
        if (field.help) card.append(el("p", "af-help", field.help));
        card.append(this.previewField(field));
        this.bindDrop(card, (data, e) => {
          let index =
            section.fields.indexOf(field) +
            (e.clientY >
            card.getBoundingClientRect().top +
              card.getBoundingClientRect().height / 2
              ? 1
              : 0);
          if (data.type) {
            const id = this.document.addField(data.type, section.id);
            this.document.move(id, section.id, index);
            this.select(id);
          } else if (data.id) {
            const source = this.document.locate(data.id);
            if (source.kind !== "field") return;
            if (
              source.section.id === section.id &&
              source.list.indexOf(source.item) < index
            )
              index--;
            this.document.move(data.id, section.id, index);
          }
        });
        block.append(card);
      });
      const drop = el("div", "af-section-drop", "+ Drop a field here");
      this.bindDrop(drop, (data) => {
        if (data.type) {
          const id = this.document.addField(data.type, section.id);
          this.select(id);
        } else if (data.id) this.document.move(data.id, section.id);
      });
      block.append(drop);
      this.canvas.append(block);
    }
    this.canvas.append(
      button(
        "+ Add section",
        () => {
          const id = this.document.addSection(page.id);
          this.select(id);
        },
        "af-add-section",
      ),
    );
  }
  previewField(field) {
    const box = el("div", "af-field-preview");
    box.setAttribute("aria-hidden", "true");
    if (["text", "number", "date", "select"].includes(field.type))
      box.append(
        el(
          "div",
          "af-preview-input",
          {
            text: "Type your answer…",
            number: "0",
            date: "dd / mm / yyyy",
            select: "Choose an option  ▾",
          }[field.type],
        ),
      );
    if (field.type === "multi-select")
      field.options
        .slice(0, 4)
        .forEach((o) =>
          box.append(el("div", "af-preview-option", `□  ${o.label}`)),
        );
    if (field.type === "rating") {
      const ratings = el("div", "af-preview-ratings");
      for (let i = 1; i <= field.scale; i++) ratings.append(el("span", "", i));
      box.append(ratings);
    }
    if (field.type === "file")
      box.append(el("div", "af-preview-upload", "↥  Choose a file to upload"));
    if (field.type === "matrix") {
      const table = el("table", "af-preview-matrix"),
        tr = el("tr");
      tr.append(el("th"));
      field.columns
        .slice(0, 5)
        .forEach((c) => tr.append(el("th", "", c.label)));
      table.append(tr);
      field.rows.slice(0, 3).forEach((r) => {
        const row = el("tr");
        row.append(el("th", "", r.label));
        field.columns.slice(0, 5).forEach(() => row.append(el("td", "", "○")));
        table.append(row);
      });
      box.append(table);
    }
    return box;
  }
  property(
    label,
    value,
    update,
    { type = "text", textarea = false, options, help } = {},
  ) {
    const wrap = el("label", "af-property"),
      caption = el("span", "af-property-label", label);
    let control;
    if (options) {
      control = el("select", "af-input");
      options.forEach((o) => control.append(option(o.value, o.label)));
    } else control = el(textarea ? "textarea" : "input", "af-input");
    if (!textarea && !options) control.type = type;
    if (type === "checkbox") {
      control.checked = !!value;
      wrap.classList.add("af-toggle-property");
    } else control.value = value ?? "";
    control.setAttribute("aria-label", label);
    control.addEventListener("change", () =>
      this.attempt(() =>
        update(
          type === "checkbox"
            ? control.checked
            : type === "number"
              ? control.value === ""
                ? undefined
                : Number(control.value)
              : control.value,
        ),
      ),
    );
    wrap.append(caption, control);
    if (help) wrap.append(el("small", "af-muted", help));
    this.panel.append(wrap);
    return control;
  }
  renderProperties() {
    this.panel.append(el("h2", "af-panel-title", "Properties"));
    if (!this.selection) {
      const form = this.document.form;
      this.panel.append(
        el(
          "p",
          "af-small af-muted",
          "Form settings · select any question to edit its properties.",
        ),
      );
      this.property("Form title", form.title, (title) =>
        this.document.updateForm({ title }),
      );
      this.property(
        "Description",
        form.description,
        (description) => this.document.updateForm({ description }),
        { textarea: true },
      );
      this.property(
        "Form ID",
        form.id,
        (id) => this.document.updateForm({ id }),
        { help: "Stable server lookup key." },
      );
      this.property(
        "Version",
        form.version,
        (version) => this.document.updateForm({ version }),
        { type: "number" },
      );
      this.property(
        "Anonymous mode",
        form.settings.anonymous,
        (anonymous) =>
          this.document.updateForm({
            settings: { ...form.settings, anonymous },
          }),
        {
          type: "checkbox",
          help: "Excludes personal-data fields and uploads. No automatic IDs, storage, or tracking.",
        },
      );
      return;
    }
    const found = this.document.locate(this.selection),
      item = found.item,
      update = (patch) => this.document.update(item.id, patch);
    this.panel.append(
      el(
        "div",
        "af-property-kind",
        found.kind === "field"
          ? `${fieldNames[item.type]} / ${item.id}`
          : `${found.kind} / ${item.id}`,
      ),
    );
    if (found.kind !== "field") {
      this.property("Title", item.title, (title) => update({ title }));
      if (found.kind === "section")
        this.property(
          "Section description",
          item.description,
          (description) => update({ description }),
          { textarea: true },
        );
      this.panel.append(
        button(
          `Delete ${found.kind}`,
          () => this.attempt(() => this.document.remove(item.id)),
          "af-button af-danger",
        ),
      );
      return;
    }
    this.property("Label", item.label, (label) => update({ label }));
    this.property("Help text", item.help, (help) => update({ help }), {
      textarea: true,
    });
    this.property(
      "Required",
      item.required,
      (required) => update({ required }),
      { type: "checkbox" },
    );
    this.property(
      "Personal data",
      item.personalData,
      (personalData) => update({ personalData }),
      { type: "checkbox", help: "Excluded in anonymous surveys." },
    );
    const choices = (label, items, key) =>
      this.property(
        label,
        items.map((o) => `${o.value} | ${o.label}`).join("\n"),
        (value) =>
          update({
            [key]: value
              .split("\n")
              .filter((x) => x.trim())
              .map((line) => {
                const [value, ...rest] = line.split("|");
                return {
                  value: value.trim(),
                  label: (rest.length ? rest.join("|") : value).trim(),
                };
              }),
          }),
        {
          textarea: true,
          help: "One “value | label” per line. Values must be unique.",
        },
      );
    if (item.options) choices("Options", item.options, "options");
    if (item.type === "matrix") {
      choices("Matrix rows", item.rows, "rows");
      choices("Matrix columns", item.columns, "columns");
    }
    if (item.type === "rating")
      this.property("Rating scale", item.scale, (scale) => update({ scale }), {
        type: "number",
      });
    this.panel.append(el("h3", "af-panel-heading", "Validation"));
    const v = item.validation ?? {},
      validation = (key, value) => {
        const next = { ...v };
        if (value === undefined || value === "") delete next[key];
        else next[key] = value;
        update({ validation: next });
      };
    if (item.type === "text") {
      this.property(
        "Minimum length",
        v.minLength,
        (value) => validation("minLength", value),
        { type: "number" },
      );
      this.property(
        "Maximum length",
        v.maxLength,
        (value) => validation("maxLength", value),
        { type: "number" },
      );
      this.property(
        "Pattern",
        v.pattern,
        (value) => validation("pattern", value),
        {
          help: "JavaScript / JSON Schema regular expression. Trusted form authors only.",
        },
      );
    }
    if (item.type === "number") {
      this.property("Minimum", v.min, (value) => validation("min", value), {
        type: "number",
      });
      this.property("Maximum", v.max, (value) => validation("max", value), {
        type: "number",
      });
      this.property(
        "Whole numbers only",
        v.integer ?? false,
        (value) => validation("integer", value),
        { type: "checkbox" },
      );
    }
    if (item.type === "multi-select") {
      this.property(
        "Minimum selections",
        v.minItems,
        (value) => validation("minItems", value),
        { type: "number" },
      );
      this.property(
        "Maximum selections",
        v.maxItems,
        (value) => validation("maxItems", value),
        { type: "number" },
      );
    }
    if (item.type === "file") {
      this.property(
        "Maximum files",
        item.file.maxFiles,
        (maxFiles) => update({ file: { ...item.file, maxFiles } }),
        { type: "number" },
      );
      this.property(
        "Maximum bytes per file",
        item.file.maxBytes,
        (maxBytes) => update({ file: { ...item.file, maxBytes } }),
        { type: "number" },
      );
      this.property(
        "Accepted MIME types",
        item.file.mimeTypes.join(", "),
        (value) =>
          update({
            file: {
              ...item.file,
              mimeTypes: value
                .split(",")
                .map((x) => x.trim())
                .filter(Boolean),
            },
          }),
        {
          help: "Exact types, e.g. image/png, application/pdf. Blank accepts any type.",
        },
      );
    }
    if (["date", "select", "rating", "matrix"].includes(item.type))
      this.panel.append(
        el(
          "p",
          "af-small af-muted",
          {
            date: "Requires a real calendar date.",
            select: "Accepts only the configured options.",
            rating: `Accepts whole numbers from 1 to ${item.scale}.`,
            matrix:
              "Only configured row and column values are accepted. Required matrices need every row.",
          }[item.type],
        ),
      );
    this.renderLogic(item);
    this.panel.append(
      button(
        "Delete field",
        () => this.attempt(() => this.document.remove(item.id)),
        "af-button af-danger",
      ),
    );
  }
  renderLogic(item) {
    this.panel.append(el("h3", "af-panel-heading", "Show this field when"));
    const candidates = fieldsOf(this.document.form).filter(
      (f) => f.id !== item.id && !["file", "matrix"].includes(f.type),
    );
    const current = item.visibleWhen?.field ? item.visibleWhen : null;
    const field = el("select", "af-input");
    field.setAttribute("aria-label", "Condition field");
    field.append(option("", "Always visible"));
    candidates.forEach((f) => field.append(option(f.id, f.label)));
    field.value = current?.field ?? "";
    const operator = el("select", "af-input");
    operator.setAttribute("aria-label", "Condition operator");
    operator.append(
      option("eq", "equals"),
      option("ne", "does not equal"),
      option("includes", "includes"),
    );
    operator.value = current?.op ?? "eq";
    const value = el("input", "af-input");
    value.setAttribute("aria-label", "Condition value");
    value.placeholder = "Value";
    value.value = current?.value ?? "";
    field.addEventListener("change", () => {
      const target = candidates.find((f) => f.id === field.value);
      operator.value = target?.type === "multi-select" ? "includes" : "eq";
      value.type = ["number", "rating"].includes(target?.type)
        ? "number"
        : "text";
    });
    this.panel.append(
      field,
      operator,
      value,
      button(
        "Apply condition",
        () =>
          this.attempt(() => {
            const target = candidates.find((f) => f.id === field.value);
            this.document.update(item.id, {
              visibleWhen: target
                ? {
                    field: target.id,
                    op: operator.value,
                    value: ["number", "rating"].includes(target.type)
                      ? Number(value.value)
                      : value.value,
                  }
                : null,
            });
          }),
        "af-button",
      ),
    );
    if (item.visibleWhen && !current)
      this.panel.append(
        el(
          "p",
          "af-small af-muted",
          "This field has a compound rule. Applying a condition here replaces it; edit compound rules in the definition JSON.",
        ),
      );
    this.panel.append(
      el(
        "p",
        "af-small af-muted",
        "Use an option’s stored value, not its label. Hidden answers are excluded from submission.",
      ),
    );
  }
  renderSchema() {
    const area = el("div", "af-schema-area"),
      bar = el("div", "af-schema-toolbar"),
      choose = el("select", "af-input");
    choose.setAttribute("aria-label", "JSON export format");
    choose.append(
      option("answers", "Answer JSON Schema"),
      option("submission", "Submission JSON Schema"),
      option("definition", "Form definition"),
    );
    choose.value = this.schemaKind;
    choose.addEventListener("change", () => {
      this.schemaKind = choose.value;
      this.render();
    });
    const data =
      this.schemaKind === "answers"
        ? toJSONSchema(this.document.form)
        : this.schemaKind === "submission"
          ? submissionSchema(this.document.form)
          : this.getDefinition();
    bar.append(
      choose,
      button(
        "Download JSON",
        () =>
          downloadJSON(
            data,
            `${this.document.form.id}.${this.schemaKind}.json`,
          ),
        "af-button af-primary",
      ),
      button(
        "Copy JSON",
        () =>
          this.attempt(() =>
            navigator.clipboard.writeText(JSON.stringify(data, null, 2)),
          ),
        "af-button",
      ),
    );
    const pre = el("pre", "af-json", JSON.stringify(data, null, 2));
    pre.tabIndex = 0;
    area.append(
      bar,
      el(
        "p",
        "af-muted",
        "Draft 2020-12 schemas validate answers on your server. The form definition contains layout and editing metadata.",
      ),
      pre,
    );
    this.root.append(area);
  }
  destroy() {
    this.unsubscribe();
    this.runner?.destroy();
    this.root.remove();
  }
}
