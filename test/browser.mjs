import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
const output = process.env.ASTER_TEST_OUTPUT ?? "test-results";
await mkdir(output, { recursive: true });
const browser = await chromium.launch(),
  page = await browser.newPage({ viewport: { width: 1480, height: 1120 } }),
  errors = [];
page.on("pageerror", (error) => errors.push(error.message));
async function drag(source, target) {
  // Start the native drag before scrolling to a potentially offscreen destination.
  await source.scrollIntoViewIfNeeded();
  const from = await source.boundingBox();
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    from.x + from.width / 2 + 12,
    from.y + from.height / 2 + 12,
    { steps: 4 },
  );
  await target.scrollIntoViewIfNeeded();
  const to = await target.boundingBox();
  await page.mouse.move(to.x + 50, to.y + 8, { steps: 6 });
  await page.mouse.move(to.x + 52, to.y + 10);
  await page.mouse.up();
}
try {
  await page.goto("http://127.0.0.1:4174");
  await page.locator(".af-field-card").first().waitFor();
  assert.equal(await page.locator(".af-tool").count(), 8);
  await page.locator('.af-field-card[data-field="recommendation"]').click();
  await page.screenshot({
    path: join(output, "aster-forms-builder.png"),
    fullPage: true,
  });
  await page
    .getByLabel("Label", { exact: true })
    .fill("How useful is the product?");
  await page.getByLabel("Label", { exact: true }).press("Tab");
  assert.equal(
    await page.evaluate(
      () => builder.document.locate("recommendation").item.label,
    ),
    "How useful is the product?",
  );
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  assert.equal(
    await page.evaluate(
      () => builder.document.locate("recommendation").item.label,
    ),
    "How has your experience been?",
  );
  await page
    .getByRole("button", { name: "Add Number field", exact: true })
    .click();
  const newId = await page.evaluate(() => builder.selection);
  await page.getByLabel("Label", { exact: true }).fill("Budget");
  await page.getByLabel("Label", { exact: true }).press("Tab");
  await page.getByLabel("Minimum", { exact: true }).fill("1");
  await page.getByLabel("Minimum", { exact: true }).press("Tab");
  assert.equal(
    await page.evaluate(
      (id) => builder.document.locate(id).item.validation.min,
      newId,
    ),
    1,
  );
  await page
    .getByRole("button", { name: `Move ${newId} up`, exact: true })
    .click();
  assert.equal(
    await page.evaluate((id) => builder.document.locate(id).list[3].id, newId),
    newId,
  );
  // Real browser drag/drop, not only direct model mutation.
  await drag(
    page.getByRole("button", { name: `Drag ${newId}`, exact: true }),
    page.locator('.af-field-card[data-field="relationship"]'),
  );
  assert.equal(
    await page.evaluate(
      () => builder.document.form.pages[0].sections[0].fields[0].id,
    ),
    newId,
  );
  await page.getByRole("button", { name: "Add section", exact: false }).click();
  const secondSection = await page.evaluate(() => builder.selection);
  await drag(
    page.getByRole("button", { name: `Drag ${newId}`, exact: true }),
    page.locator(`[data-section="${secondSection}"] .af-section-drop`),
  );
  assert.equal(
    await page.evaluate((id) => builder.document.locate(id).section.id, newId),
    secondSection,
  );
  await page.locator(`[data-field="${newId}"]`).click();
  await page
    .getByLabel("Condition field", { exact: true })
    .selectOption("relationship");
  await page.getByLabel("Condition value", { exact: true }).fill("partner");
  await page
    .getByRole("button", { name: "Apply condition", exact: true })
    .click();
  assert.equal(
    await page.evaluate(
      (id) => builder.document.locate(id).item.visibleWhen.value,
      newId,
    ),
    "partner",
  );
  await page.getByRole("button", { name: "Add page", exact: false }).click();
  assert.equal(
    await page.evaluate(() => builder.document.form.pages.length),
    3,
  );
  await page.getByRole("button", { name: "JSON Schema", exact: true }).click();
  assert.match(await page.locator(".af-json").textContent(), /2020-12/);
  const downloaded = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download JSON", exact: true })
    .click();
  await (await downloaded).saveAs(join(output, "aster-form.schema.json"));
  await page
    .getByRole("button", { name: "Reset example", exact: true })
    .click();
  await page.getByRole("button", { name: "Open runner", exact: true }).click();
  await page.getByRole("button", { name: "Continue", exact: false }).click();
  assert(await page.locator(".af-error-summary").isVisible());
  await page
    .getByLabel("What brings you here?", { exact: true })
    .selectOption("partner");
  assert(
    await page
      .getByLabel("Which organization do you represent?", { exact: true })
      .isVisible(),
  );
  await page
    .getByLabel("Which organization do you represent?", { exact: true })
    .fill("Acorn");
  await page
    .getByLabel("What brings you here?", { exact: true })
    .selectOption("customer");
  assert.equal(
    await page
      .getByLabel("Which organization do you represent?", { exact: true })
      .isVisible(),
    false,
  );
  assert.equal(
    await page.evaluate(() => runner.getAnswers().company),
    undefined,
  );
  await page
    .getByLabel("What brings you here?", { exact: true })
    .selectOption("partner");
  assert.equal(
    await page
      .getByLabel("Which organization do you represent?", { exact: true })
      .inputValue(),
    "",
  );
  await page
    .getByLabel("What brings you here?", { exact: true })
    .selectOption("customer");
  await page.getByRole("radio", { name: "4", exact: true }).check();
  await page
    .getByRole("checkbox", { name: "Thoughtful design", exact: true })
    .check();
  await page.getByRole("button", { name: "Continue", exact: false }).click();
  await page
    .getByLabel("How many people are on your team?", { exact: true })
    .fill("12");
  await page
    .getByLabel("When did you start using the product?", { exact: true })
    .fill("2026-01-15");
  await page
    .getByLabel("Anything you’d like to show us?", { exact: true })
    .setInputFiles({
      name: "note.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("test file bytes"),
    });
  for (const label of ["Ease of use: Good", "Quality: Great", "Support: Good"])
    await page.getByRole("radio", { name: label, exact: true }).check();
  await page
    .getByLabel("One thing we could do better?", { exact: true })
    .fill("More examples.");
  await page.screenshot({
    path: join(output, "aster-forms-runner.png"),
    fullPage: true,
  });
  const body = await page.evaluate(() => {
    const form = runner.createFormData();
    return {
      keys: [...form.keys()],
      filename: form.get("file:attachment").name,
    };
  });
  assert.deepEqual(body, {
    keys: ["submission", "file:attachment"],
    filename: "note.pdf",
  });
  await page
    .getByRole("button", { name: "Submit response", exact: true })
    .click();
  await page.locator(".af-success").waitFor();
  const payload = await page.evaluate(() => window.lastSubmission);
  assert.equal(payload.answers.team_size, 12);
  assert.equal(payload.answers.attachment[0].size, 15);
  assert.equal(payload.answers.feedback, "More examples.");
  assert.equal(
    await page.evaluate(() => window.lastFiles.attachment[0].name),
    "note.pdf",
  );
  const retries = await page.evaluate(async () => {
    const { FormRunner, createForm, createField } =
      await import("/src/index.js");
    runner.destroy();
    const form = createForm("Retry test");
    form.pages[0].sections[0].fields = [
      { ...createField("text", "answer"), required: true },
    ];
    let calls = 0;
    const retry = new FormRunner(document.querySelector("#app"), form, {
      onSubmit: async () => {
        calls++;
        if (calls === 1) throw new Error("Try again");
      },
    });
    retry.setAnswer("answer", "yes");
    const first = await retry.submit();
    const enabled = !retry.send.disabled;
    const second = await retry.submit();
    const third = await retry.submit();
    retry.destroy();
    return { calls, first, enabled, second: !!second, third };
  });
  assert.deepEqual(retries, {
    calls: 2,
    first: null,
    enabled: true,
    second: true,
    third: null,
  });
  const restoredFiles = await page.evaluate(async () => {
    const { FormRunner, createForm, createField } =
      await import("/src/index.js");
    const form = createForm();
    form.pages[0].sections[0].fields = [createField("file", "attachment")];
    const r = new FormRunner(document.querySelector("#app"), form, {
      answers: {
        attachment: [{ name: "missing.txt", size: 2, type: "text/plain" }],
      },
    });
    const result = await r.submit();
    const message = r.errors[0]?.message;
    r.destroy();
    return { result, message };
  });
  assert.equal(restoredFiles.result, null);
  assert.match(restoredFiles.message, /Choose the files again/);
  await page
    .getByRole("button", { name: "Reset example", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Standard form", exact: false })
    .click();
  await page.getByLabel("Anonymous mode", { exact: true }).check();
  await page.getByRole("button", { name: "Open runner", exact: true }).click();
  await page
    .getByLabel("What brings you here?", { exact: true })
    .selectOption("partner");
  assert.equal(
    await page
      .getByLabel("Which organization do you represent?", { exact: true })
      .isVisible(),
    false,
  );
  await page.getByRole("radio", { name: "5", exact: true }).check();
  await page.getByRole("button", { name: "Continue", exact: false }).click();
  assert.equal(
    await page
      .getByLabel("Anything you’d like to show us?", { exact: true })
      .isVisible(),
    false,
  );
  for (const label of [
    "Ease of use: Great",
    "Quality: Great",
    "Support: Great",
  ])
    await page.getByRole("radio", { name: label, exact: true }).check();
  await page
    .getByRole("button", { name: "Submit response", exact: true })
    .click();
  await page.locator(".af-success").waitFor();
  assert.equal(
    await page.evaluate(() => window.lastSubmission.mode),
    "anonymous",
  );
  assert.deepEqual(
    await page.evaluate(() => Object.keys(window.lastFiles)),
    [],
  );
  assert.equal(await page.evaluate(() => localStorage.length), 0);
  await page
    .getByRole("button", { name: "Reset example", exact: true })
    .click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: join(output, "aster-forms-mobile.png"),
    fullPage: true,
  });
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  );
  await page.evaluate(() => builder.destroy());
  assert.equal(await page.locator(".af-builder").count(), 0);
  assert.deepEqual(errors, []);
  console.log(
    "Browser checks passed: builder, properties, undo, actual drag/drop, sections/pages, conditions, schema download, all field inputs, validation, file bytes, runner submission, anonymous mode, responsive layout, cleanup.",
  );
} finally {
  await browser.close();
}
