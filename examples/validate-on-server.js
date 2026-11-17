// Run after npm install. The definition is trusted server configuration.
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { submissionSchema } from "../src/index.js";
import { sampleForm } from "../demo/sample.js";

const ajv = new Ajv2020({
  allErrors: true,
  strict: true,
  strictRequired: false,
});
addFormats(ajv);
export const schema = submissionSchema(sampleForm);
export const validateSubmission = ajv.compile(schema);

// Never accept the schema or anonymous-mode flag from the respondent as authority.
// Retrieve the form/version/mode from your database, compile once, validate often.
// JSON Schema validates file descriptors, not bytes or actual MIME signatures.
// Verify uploaded bytes against the descriptors before saving a response.
if (process.argv[1]?.endsWith("validate-on-server.js")) {
  const response = {
    formId: "product_pulse",
    formVersion: 1,
    mode: "standard",
    answers: {
      relationship: "customer",
      recommendation: 5,
      scorecard: { ease: "great", quality: "good", support: "good" },
    },
  };
  console.log(
    validateSubmission(response)
      ? "Server validation passed"
      : validateSubmission.errors,
  );
}
