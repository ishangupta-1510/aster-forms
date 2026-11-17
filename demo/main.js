import { FormBuilder, FormRunner } from "../src/index.js";
import { sampleForm } from "./sample.js";
let current = structuredClone(sampleForm),
  builder,
  runner;
const app = document.querySelector("#app"),
  response = document.querySelector("#response");
function showResponse(payload, context) {
  window.lastSubmission = payload;
  window.lastFiles = context.files;
  response.textContent = JSON.stringify(payload, null, 2);
  response.hidden = false;
}
function mountBuilder() {
  runner?.destroy();
  builder?.destroy();
  builder = new FormBuilder(app, {
    form: current,
    onChange: (form) => (current = form),
    onPreviewSubmit: showResponse,
  });
  window.builder = builder;
  document.querySelector("#back").hidden = true;
  document.querySelector("#standalone").hidden = false;
}
document.querySelector("#standalone").addEventListener("click", () => {
  current = builder.getDefinition();
  builder.destroy();
  runner = new FormRunner(app, current, {
    onSubmit: showResponse,
    successMessage:
      "Demo complete. The response below is local only; it was not sent to a server.",
  });
  window.runner = runner;
  document.querySelector("#back").hidden = false;
  document.querySelector("#standalone").hidden = true;
  response.hidden = true;
});
document.querySelector("#back").addEventListener("click", mountBuilder);
document.querySelector("#reset").addEventListener("click", () => {
  current = structuredClone(sampleForm);
  response.hidden = true;
  mountBuilder();
});
mountBuilder();
