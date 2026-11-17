import {
  FormBuilder,
  FormRunner,
  FormDocument,
  createForm,
  createField,
  toJSONSchema,
  validateAnswers,
  type Submission,
} from "../src/index.js";
const form = createForm("Typed consumer");
form.pages[0].sections[0].fields.push({
  ...createField("number", "headcount"),
  required: true,
  validation: { min: 1, integer: true },
});
const doc = new FormDocument(form);
doc.update("headcount", { label: "Team size" });
doc.onChange((definition) => toJSONSchema(definition));
const builder = new FormBuilder(document.createElement("div"), {
  form,
  onChange: (definition) => console.log(definition.id),
});
const runner = new FormRunner(document.createElement("div"), form, {
  onSubmit: async (payload: Submission, { files }) => {
    validateAnswers(form, payload.answers);
    console.log(files);
  },
});
runner.setAnswer("headcount", 5);
runner.getAnswers();
runner.createFormData();
runner.destroy();
builder.destroy();
