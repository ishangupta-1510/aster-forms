import {
  assertForm,
  fieldsOf,
  visibility,
  cleanAnswers,
  validateAnswers,
  createSubmission,
} from "./core.js";
import { el, button, option } from "./dom.js";
let sequence = 0;
export class FormRunner {
  constructor(container, form, options = {}) {
    assertForm(form);
    this.form = structuredClone(form);
    this.options = options;
    this.anonymous = options.anonymous ?? form.settings.anonymous;
    this.answers = cleanAnswers(form, options.answers ?? {}, {
      anonymous: this.anonymous,
    });
    this.files = {};
    this.errors = [];
    this.pageIndex = 0;
    this.id = `af-runner-${++sequence}`;
    this.busy = false;
    this.destroyed = false;
    this.controls = new Map();
    this.root = el("form", "af-runner");
    this.root.noValidate = true;
    this.root.autocomplete = this.anonymous ? "off" : "on";
    this.root.addEventListener("submit", (e) => {
      e.preventDefault();
      this.submit();
    });
    container.replaceChildren(this.root);
    this.render();
  }
  getAnswers() {
    return cleanAnswers(this.form, this.answers, { anonymous: this.anonymous });
  }
  getFiles() {
    const visible = visibility(this.form, this.answers, {
      anonymous: this.anonymous,
    });
    return Object.fromEntries(
      Object.entries(this.files)
        .filter(([id]) => visible.get(id))
        .map(([id, files]) => [id, [...files]]),
    );
  }
  validationErrors() {
    const answers = this.getAnswers(),
      errors = validateAnswers(this.form, answers, {
        anonymous: this.anonymous,
      }).errors;
    for (const field of fieldsOf(this.form)) {
      if (field.type !== "file" || !answers[field.id]) continue;
      const actual = this.files[field.id] ?? [],
        descriptors = answers[field.id];
      if (
        !Array.isArray(descriptors) ||
        descriptors.length !== actual.length ||
        descriptors.some(
          (value, i) =>
            value.name !== actual[i]?.name ||
            value.size !== actual[i]?.size ||
            value.type !== actual[i]?.type,
        )
      )
        errors.push({
          field: field.id,
          message:
            "Choose the files again; saved metadata cannot restore file contents.",
        });
    }
    return errors;
  }
  setAnswer(id, value) {
    if (!fieldsOf(this.form).some((f) => f.id === id))
      throw new Error("Unknown field");
    if (
      value == null ||
      value === "" ||
      (Array.isArray(value) && !value.length)
    )
      delete this.answers[id];
    else this.answers[id] = structuredClone(value);
    this.reconcile();
  }
  reconcile() {
    const visible = visibility(this.form, this.answers, {
      anonymous: this.anonymous,
    });
    for (const field of fieldsOf(this.form))
      if (!visible.get(field.id)) {
        delete this.answers[field.id];
        delete this.files[field.id];
      }
    this.errors = this.errors.filter((error) => visible.get(error.field));
    this.syncControls();
    this.updateVisibility();
    this.options.onChange?.(this.getAnswers());
  }
  syncControls() {
    for (const [id, { primary, field }] of this.controls) {
      const value = this.answers[id];
      if (["text", "number", "date", "select"].includes(field.type)) {
        if (primary.value !== String(value ?? "")) primary.value = value ?? "";
      } else if (field.type === "multi-select")
        primary
          .querySelectorAll("input")
          .forEach(
            (input) =>
              (input.checked =
                Array.isArray(value) && value.includes(input.value)),
          );
      else if (field.type === "rating")
        primary
          .querySelectorAll("input")
          .forEach((input) => (input.checked = value === Number(input.value)));
      else if (field.type === "matrix")
        primary
          .querySelectorAll("input")
          .forEach(
            (input) =>
              (input.checked =
                value?.[input.dataset.matrixRow] === input.value),
          );
      else if (field.type === "file" && !value) {
        primary.value = "";
        const names = primary.parentElement.querySelector(".af-help");
        if (names) names.textContent = "";
      }
    }
  }
  visiblePages() {
    const visible = visibility(this.form, this.answers, {
      anonymous: this.anonymous,
    });
    return this.form.pages.filter((page) =>
      page.sections.some((s) => s.fields.some((f) => visible.get(f.id))),
    );
  }
  render() {
    if (this.destroyed) return;
    this.root.replaceChildren();
    this.controls.clear();
    const header = el("header", "af-runner-header");
    header.append(
      el(
        "span",
        "af-eyebrow",
        this.anonymous ? "ANONYMOUS SURVEY" : "YOUR RESPONSE",
      ),
      el("h1", "", this.form.title),
      el("p", "af-muted", this.form.description),
    );
    if (this.anonymous)
      header.append(
        el(
          "p",
          "af-anonymous",
          "Anonymous mode · no automatic identity or response tracking. Avoid identifying details in free text.",
        ),
      );
    this.progress = el("div", "af-progress");
    this.progress.setAttribute("aria-label", "Form progress");
    this.summary = el("div", "af-error-summary");
    this.summary.setAttribute("role", "alert");
    this.summary.tabIndex = -1;
    this.body = el("div", "af-runner-body");
    this.root.append(header, this.progress, this.summary, this.body);
    for (const page of this.form.pages) {
      const pageEl = el("div", "af-runner-page");
      pageEl.dataset.page = page.id;
      pageEl.append(el("h2", "af-page-title", page.title));
      for (const section of page.sections) {
        const sectionEl = el("section", "af-runner-section");
        sectionEl.dataset.section = section.id;
        if (section.title) sectionEl.append(el("h3", "", section.title));
        if (section.description)
          sectionEl.append(el("p", "af-muted", section.description));
        for (const field of section.fields)
          sectionEl.append(this.renderField(field));
        pageEl.append(sectionEl);
      }
      this.body.append(pageEl);
    }
    this.nav = el("div", "af-runner-nav");
    this.previous = button(
      "← Back",
      () => {
        this.pageIndex = Math.max(0, this.pageIndex - 1);
        this.errors = [];
        this.updateVisibility();
        this.focusPage();
      },
      "af-button",
    );
    this.next = button(
      "Continue →",
      () => this.advance(),
      "af-button af-primary",
    );
    this.send = el(
      "button",
      "af-button af-primary",
      this.options.submitLabel ?? "Submit response",
    );
    this.send.type = "submit";
    this.nav.append(this.previous, this.next, this.send);
    this.root.append(
      this.nav,
      el(
        "p",
        "af-runner-footnote",
        "Built with Aster Forms · Your answers stay in this page until you submit.",
      ),
    );
    this.updateVisibility();
  }
  renderField(field) {
    const wrap = el("div", "af-question");
    wrap.dataset.field = field.id;
    const inputId = `${this.id}-${field.id}`,
      label = el(
        "label",
        "af-question-label",
        field.label + (field.required ? " *" : ""),
      );
    label.htmlFor = inputId;
    wrap.append(label);
    const help = el("p", "af-help", field.help ?? "");
    help.id = `input-help-${inputId}`;
    if (field.help) wrap.append(help);
    const content = el("div", "af-answer");
    const val = this.answers[field.id];
    let primary;
    const connect = (input, read) => {
      input.addEventListener("change", () => this.setAnswer(field.id, read()));
      return input;
    };
    if (["text", "number", "date"].includes(field.type)) {
      primary = el("input", "af-input");
      primary.type = field.type === "text" ? "text" : field.type;
      primary.value = val ?? "";
      if (field.type === "text")
        primary.placeholder = field.placeholder ?? "Your answer";
      if (field.type === "number") {
        primary.step = field.validation?.integer ? "1" : "any";
        if (field.validation?.min != null) primary.min = field.validation.min;
        if (field.validation?.max != null) primary.max = field.validation.max;
      }
      primary.addEventListener("input", () => {
        const value = primary.value;
        this.setAnswer(
          field.id,
          field.type === "number" && value !== "" ? Number(value) : value,
        );
      });
      content.append(primary);
    } else if (field.type === "select") {
      primary = el("select", "af-input");
      primary.append(option("", "Select an option"));
      field.options.forEach((o) => primary.append(option(o.value, o.label)));
      primary.value = val ?? "";
      connect(primary, () => primary.value);
      content.append(primary);
    } else if (field.type === "multi-select") {
      primary = el("div", "af-choice-list");
      primary.setAttribute("role", "group");
      field.options.forEach((o) => {
        const choice = el("label", "af-choice"),
          input = el("input");
        input.type = "checkbox";
        input.value = o.value;
        input.checked = Array.isArray(val) && val.includes(o.value);
        input.setAttribute("aria-label", o.label);
        connect(input, () =>
          [...primary.querySelectorAll("input:checked")].map((i) => i.value),
        );
        choice.append(input, el("span", "", o.label));
        primary.append(choice);
      });
      content.append(primary);
    } else if (field.type === "rating") {
      primary = el("div", "af-rating");
      primary.setAttribute("role", "radiogroup");
      for (let i = 1; i <= field.scale; i++) {
        const choice = el("label", "af-rating-choice"),
          input = el("input");
        input.type = "radio";
        input.name = inputId;
        input.value = i;
        input.checked = val === i;
        input.setAttribute("aria-label", String(i));
        connect(input, () => i);
        choice.append(input, el("span", "", i));
        primary.append(choice);
      }
      content.append(
        primary,
        el(
          "div",
          "af-rating-labels",
          "Lowest                                                         Highest",
        ),
      );
    } else if (field.type === "file") {
      primary = el("input", "af-input af-file");
      primary.type = "file";
      primary.multiple = field.file.maxFiles > 1;
      primary.accept = field.file.mimeTypes.join(",");
      const names = el("p", "af-help");
      names.textContent = (val ?? []).map((f) => f.name).join(", ");
      primary.addEventListener("change", () => {
        const files = [...primary.files];
        this.files[field.id] = files;
        this.setAnswer(
          field.id,
          files.map((file) => ({
            name: file.name,
            size: file.size,
            type: file.type,
          })),
        );
        names.textContent = files.map((f) => f.name).join(", ");
      });
      content.append(
        primary,
        names,
        button(
          "Clear files",
          () => {
            primary.value = "";
            delete this.files[field.id];
            this.setAnswer(field.id, undefined);
            names.textContent = "";
          },
          "af-text-button",
        ),
      );
    } else if (field.type === "matrix") {
      primary = el("div", "af-matrix-wrap");
      primary.setAttribute("role", "group");
      const table = el("table", "af-matrix"),
        head = el("tr");
      head.append(el("th", "", "Item"));
      field.columns.forEach((c) => head.append(el("th", "", c.label)));
      const thead = el("thead");
      thead.append(head);
      table.append(thead);
      const tbody = el("tbody");
      for (const row of field.rows) {
        const tr = el("tr");
        const th = el("th", "", row.label);
        th.scope = "row";
        tr.append(th);
        for (const col of field.columns) {
          const td = el("td"),
            input = el("input");
          input.type = "radio";
          input.name = `${inputId}-${row.value}`;
          input.dataset.matrixRow = row.value;
          input.value = col.value;
          input.checked = val?.[row.value] === col.value;
          input.setAttribute("aria-label", `${row.label}: ${col.label}`);
          connect(input, () => ({
            ...this.answers[field.id],
            [row.value]: col.value,
          }));
          td.append(input);
          tr.append(td);
        }
        tbody.append(tr);
      }
      table.append(tbody);
      primary.append(table);
      content.append(primary);
    }
    primary.id = inputId;
    primary.setAttribute("aria-label", field.label);
    primary.setAttribute("aria-describedby", `${help.id} ${inputId}-error`);
    if (field.required) primary.setAttribute("aria-required", "true");
    if (["DIV"].includes(primary.tagName)) {
      primary.tabIndex = -1;
      label.addEventListener("click", () =>
        primary.querySelector("input")?.focus(),
      );
    }
    const error = el("p", "af-field-error");
    error.id = `${inputId}-error`;
    wrap.append(content, error);
    this.controls.set(field.id, { wrap, primary, error, field });
    return wrap;
  }
  updateVisibility() {
    if (this.destroyed) return;
    const visible = visibility(this.form, this.answers, {
      anonymous: this.anonymous,
    });
    const pages = this.visiblePages();
    this.pageIndex = Math.min(this.pageIndex, Math.max(0, pages.length - 1));
    const current = pages[this.pageIndex];
    for (const [id, control] of this.controls) {
      control.wrap.hidden = !visible.get(id);
      const messages = this.errors
        .filter((e) => e.field === id)
        .map((e) => e.message);
      control.error.textContent = messages.join(" ");
      control.primary.setAttribute("aria-invalid", String(!!messages.length));
      control.wrap
        .querySelectorAll("input,select,button")
        .forEach((input) => (input.disabled = this.busy));
    }
    for (const page of this.form.pages) {
      const pageEl = this.body.querySelector(`[data-page="${page.id}"]`);
      pageEl.hidden = page.id !== current?.id;
      for (const section of page.sections)
        pageEl.querySelector(`[data-section="${section.id}"]`).hidden =
          !section.fields.some((f) => visible.get(f.id));
    }
    this.progress.textContent = pages.length
      ? `Step ${this.pageIndex + 1} of ${pages.length}`
      : "No questions to answer";
    this.previous.hidden = this.pageIndex === 0;
    this.next.hidden = this.pageIndex >= pages.length - 1;
    this.send.hidden = !this.next.hidden;
    this.send.disabled = this.busy;
    this.next.disabled = this.busy;
    this.previous.disabled = this.busy;
    this.send.textContent = this.busy
      ? "Submitting…"
      : (this.options.submitLabel ?? "Submit response");
    this.summary.hidden = !this.errors.length;
    this.summary.replaceChildren();
    if (this.errors.length) {
      this.summary.append(
        el(
          "strong",
          "",
          `Please review ${this.errors.length} issue${this.errors.length === 1 ? "" : "s"}.`,
        ),
      );
      for (const error of this.errors) {
        const link = button(
          error.message,
          () => {
            const control = this.controls.get(error.field);
            if (control) {
              const page = pages.findIndex((p) =>
                p.sections.some((s) =>
                  s.fields.some((f) => f.id === error.field),
                ),
              );
              if (page >= 0) this.pageIndex = page;
              this.updateVisibility();
              control.primary.focus();
            }
          },
          "af-error-link",
        );
        this.summary.append(link);
      }
    }
  }
  focusPage() {
    this.body
      .querySelector(
        ".af-runner-page:not([hidden]) input, .af-runner-page:not([hidden]) select",
      )
      ?.focus();
  }
  advance() {
    const current = this.visiblePages()[this.pageIndex],
      ids = new Set(
        current?.sections.flatMap((s) => s.fields.map((f) => f.id)),
      );
    this.errors = this.validationErrors().filter((e) => ids.has(e.field));
    if (!this.errors.length) this.pageIndex++;
    this.updateVisibility();
    this.errors.length ? this.summary.focus() : this.focusPage();
  }
  async submit() {
    if (this.busy || this.destroyed || this.completed) return null;
    this.errors = this.validationErrors();
    if (this.errors.length) {
      const first = this.errors[0].field,
        index = this.visiblePages().findIndex((p) =>
          p.sections.some((s) => s.fields.some((f) => f.id === first)),
        );
      if (index >= 0) this.pageIndex = index;
      this.updateVisibility();
      this.summary.focus();
      return null;
    }
    const payload = createSubmission(this.form, this.answers, {
      anonymous: this.anonymous,
    });
    this.busy = true;
    this.updateVisibility();
    try {
      await this.options.onSubmit?.(payload, { files: this.getFiles() });
      if (this.destroyed) return payload;
      this.completed = true;
      this.root.dispatchEvent(
        new CustomEvent("aster-submit", { detail: payload, bubbles: true }),
      );
      this.root.replaceChildren(
        el("div", "af-success", "✓ Response complete"),
        el("h2", "", "Thank you for sharing."),
        el(
          "p",
          "af-muted",
          this.options.successMessage ??
            "Your response has been passed to the application.",
        ),
      );
      return payload;
    } catch (error) {
      if (!this.destroyed) {
        this.errors = [
          {
            field: null,
            message: error.message ?? "Submission failed. Please try again.",
          },
        ];
        this.updateVisibility();
        this.summary.focus();
      }
      return null;
    } finally {
      this.busy = false;
      if (this.send?.isConnected) this.updateVisibility();
    }
  }
  createFormData() {
    const errors = this.validationErrors();
    if (errors.length) {
      const error = new Error(
        "Please correct the answers or reselect missing files.",
      );
      error.errors = errors;
      throw error;
    }
    const payload = createSubmission(this.form, this.answers, {
        anonymous: this.anonymous,
      }),
      body = new FormData();
    body.set("submission", JSON.stringify(payload));
    for (const [id, files] of Object.entries(this.getFiles()))
      for (const file of files) body.append(`file:${id}`, file, file.name);
    return body;
  }
  destroy() {
    this.destroyed = true;
    this.files = {};
    this.answers = {};
    this.controls.clear();
    this.root.remove();
  }
}
