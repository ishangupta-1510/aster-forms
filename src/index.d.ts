export type FieldType =
  | "text"
  | "number"
  | "date"
  | "select"
  | "multi-select"
  | "rating"
  | "file"
  | "matrix";
export interface Choice {
  value: string;
  label: string;
}
export type Condition =
  | { field: string; op: "eq" | "ne"; value: string | number }
  | { field: string; op: "includes"; value: string }
  | { all: Condition[] }
  | { any: Condition[] };
export interface Validation {
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  min?: number;
  max?: number;
  integer?: boolean;
  minItems?: number;
  maxItems?: number;
}
export interface Field {
  id: string;
  type: FieldType;
  label: string;
  help?: string;
  placeholder?: string;
  required: boolean;
  personalData: boolean;
  validation?: Validation;
  visibleWhen?: Condition | null;
  options?: Choice[];
  scale?: number;
  rows?: Choice[];
  columns?: Choice[];
  file?: { maxFiles: number; maxBytes: number; mimeTypes: string[] };
}
export interface Section {
  id: string;
  title: string;
  description?: string;
  fields: Field[];
}
export interface Page {
  id: string;
  title: string;
  sections: Section[];
}
export interface FormDefinition {
  id: string;
  version: number;
  title: string;
  description?: string;
  settings: { anonymous: boolean };
  pages: Page[];
}
export interface FileDescriptor {
  name: string;
  size: number;
  type: string;
}
export type Answer =
  string | number | string[] | FileDescriptor[] | Record<string, string>;
export type Answers = Record<string, Answer>;
export interface ValidationError {
  field: string | null;
  message: string;
}
export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}
export interface Submission {
  formId: string;
  formVersion: number;
  mode: "anonymous" | "standard";
  answers: Answers;
}
export interface ModeOptions {
  anonymous?: boolean;
}
export const FIELD_TYPES: FieldType[];
export function createForm(title?: string): FormDefinition;
export function createField(type: FieldType, id: string): Field;
export function fieldsOf(form: FormDefinition): Field[];
export function assertForm(form: unknown): FormDefinition;
export function visibility(
  form: FormDefinition,
  answers: Answers,
  options?: ModeOptions,
): Map<string, boolean>;
export function cleanAnswers(
  form: FormDefinition,
  answers: Answers,
  options?: ModeOptions,
): Answers;
export function validateAnswers(
  form: FormDefinition,
  answers: unknown,
  options?: ModeOptions,
): ValidationResult;
export function createSubmission(
  form: FormDefinition,
  answers: Answers,
  options?: ModeOptions,
): Submission;
export function toJSONSchema(
  form: FormDefinition,
  options?: ModeOptions,
): Record<string, any>;
export function submissionSchema(
  form: FormDefinition,
  options?: ModeOptions,
): Record<string, any>;
export class FormDocument {
  constructor(form?: FormDefinition);
  readonly form: FormDefinition;
  getDefinition(): FormDefinition;
  onChange(fn: (form: FormDefinition) => void): () => void;
  change(fn: (form: FormDefinition) => void): void;
  replace(form: FormDefinition): void;
  undo(): void;
  redo(): void;
  update(
    id: string,
    patch: Partial<Field> | Partial<Section> | Partial<Page>,
  ): void;
  updateForm(patch: Partial<FormDefinition>): void;
  addField(type: FieldType, sectionId: string): string;
  addSection(pageId: string): string;
  addPage(): string;
  remove(id: string): void;
  move(id: string, targetId: string | null, index?: number): void;
}
export interface SubmissionContext {
  files: Record<string, File[]>;
}
export interface RunnerOptions extends ModeOptions {
  answers?: Answers;
  submitLabel?: string;
  successMessage?: string;
  onChange?: (answers: Answers) => void;
  onSubmit?: (
    payload: Submission,
    context: SubmissionContext,
  ) => void | Promise<void>;
}
export class FormRunner {
  constructor(
    container: HTMLElement,
    form: FormDefinition,
    options?: RunnerOptions,
  );
  root: HTMLFormElement;
  getAnswers(): Answers;
  getFiles(): Record<string, File[]>;
  setAnswer(id: string, value: Answer | null | undefined): void;
  submit(): Promise<Submission | null>;
  createFormData(): FormData;
  destroy(): void;
}
export interface BuilderOptions {
  form?: FormDefinition;
  onChange?: (form: FormDefinition) => void;
  onError?: (error: Error) => void;
  onPreviewSubmit?: (
    payload: Submission,
    context: SubmissionContext,
  ) => void | Promise<void>;
}
export class FormBuilder {
  constructor(container: HTMLElement, options?: BuilderOptions);
  document: FormDocument;
  root: HTMLElement;
  getDefinition(): FormDefinition;
  getJSONSchema(): Record<string, any>;
  setDefinition(form: FormDefinition): void;
  destroy(): void;
}
