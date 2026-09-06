/**
 * Types mirroring the service contracts.
 *
 * The web app deliberately does not import from the service packages: it is a
 * client of an HTTP API, and keeping the boundary explicit means a service can
 * change language or move host without the UI noticing. When a contract
 * changes, this file changes with it.
 */

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  details?: { issues?: { field: string; message: string }[]; [key: string]: unknown };
  meta?: Record<string, unknown>;
}

export interface CustomField {
  id: string;
  label: string;
  value: string;
}

export interface Link {
  id: string;
  label: string;
  url: string;
}

export interface Education {
  id: string;
  degree: string;
  field: string;
  institution: string;
  country: string;
  startYear: string;
  endYear: string;
  gradeValue: string;
  gradeScale: string;
  thesisTitle: string;
  notes: string;
}

export interface TestScore {
  id: string;
  name: string;
  score: string;
  maxScore: string;
  takenOn: string;
  expiresOn: string;
  notes: string;
}

export interface LanguageSkill {
  id: string;
  language: string;
  level: string;
}

export interface Publication {
  id: string;
  title: string;
  venue: string;
  year: string;
  url: string;
  role: string;
  summary: string;
}

export interface Experience {
  id: string;
  role: string;
  organization: string;
  country: string;
  startDate: string;
  endDate: string;
  summary: string;
}

export interface ProfileDocument {
  id: string;
  label: string;
  kind: string;
  url: string;
  text: string;
}

export interface CompletenessCheck {
  key: string;
  label: string;
  weight: number;
  done: boolean;
  hint: string;
}

export interface Completeness {
  percent: number;
  checks: CompletenessCheck[];
  missing: CompletenessCheck[];
}

export interface Profile {
  id: string;
  createdAt: string;
  updatedAt: string;
  fullName: string;
  email: string;
  phone: string;
  nationality: string;
  countryOfResidence: string;
  city: string;
  timezone: string;
  headline: string;
  summary: string;
  targetDegree: string;
  targetIntake: string;
  targetCountries: string[];
  fundingNeed: string;
  education: Education[];
  tests: TestScore[];
  languages: LanguageSkill[];
  publications: Publication[];
  experience: Experience[];
  researchInterests: string[];
  skills: string[];
  researchStatement: string;
  links: Link[];
  documents: ProfileDocument[];
  customFields: CustomField[];
  tags: string[];
  completeness?: Completeness;
  promptBlock?: string;
}

export type ProfileSummary = Pick<
  Profile,
  | 'id'
  | 'fullName'
  | 'headline'
  | 'email'
  | 'nationality'
  | 'countryOfResidence'
  | 'targetDegree'
  | 'targetIntake'
  | 'researchInterests'
  | 'tags'
  | 'updatedAt'
> & { completeness: Completeness };

export interface Target {
  id: string;
  createdAt: string;
  updatedAt: string;
  kind: string;
  name: string;
  organization: string;
  department: string;
  role: string;
  country: string;
  city: string;
  email: string;
  links: Link[];
  focusAreas: string[];
  deadline: string;
  language: string;
  status: string;
  priority: number;
  notes: string;
  tags: string[];
  customFields: CustomField[];
  lastRunId: string;
  lastRunAt: string;
  promptBlock?: string;
}

export interface Facet {
  value: string;
  count: number;
}

export interface TargetFacets {
  kinds: Facet[];
  statuses: Facet[];
  countries: Facet[];
  tags: Facet[];
}

export interface ModelConfig {
  model: string;
  temperature: number | null;
  reasoningEffort: 'minimal' | 'low' | 'medium' | 'high' | null;
  maxOutputTokens: number | null;
  webSearch: boolean;
}

export interface PromptVersion {
  version: number;
  createdAt: string;
  note: string;
  systemPrompt: string;
  userPrompt: string;
  config: ModelConfig;
  outputSchema: Record<string, unknown> | null;
  variables: { name: string; description: string; example: string; required: boolean }[];
}

export interface Prompt {
  id: string;
  createdAt: string;
  updatedAt: string;
  key: string;
  name: string;
  description: string;
  stage: string;
  activeVersion: number;
  versions: PromptVersion[];
  isBuiltIn: boolean;
  tags: string[];
  active: PromptVersion;
  detectedVariables: string[];
  schemaIssues: string[];
}

export interface PromptSummary {
  id: string;
  key: string;
  name: string;
  description: string;
  stage: string;
  isBuiltIn: boolean;
  tags: string[];
  updatedAt: string;
  activeVersion: number;
  versionCount: number;
  model: string;
  webSearch: boolean;
  hasSchema: boolean;
  variableCount: number;
}

export interface PipelineStep {
  id: string;
  key: string;
  title: string;
  description: string;
  promptKey: string;
  service: string;
  enabled: boolean;
  optional: boolean;
  prompt?: {
    id: string;
    key: string;
    name: string;
    stage: string;
    model: string;
    webSearch: boolean;
    version: number;
  } | null;
}

export interface PipelineIssue {
  level: 'error' | 'warning';
  message: string;
}

export interface Pipeline {
  id: string;
  createdAt: string;
  updatedAt: string;
  name: string;
  description: string;
  steps: PipelineStep[];
  isBuiltIn: boolean;
  tags: string[];
  stepCount?: number;
  issues?: PipelineIssue[];
}

export type StepStatus = 'pending' | 'running' | 'succeeded' | 'failed' | 'skipped';
export type RunStatus = 'queued' | 'running' | 'completed' | 'partial' | 'failed' | 'cancelled';

export interface Usage {
  promptTokens: number;
  completionTokens: number;
  reasoningTokens: number;
  totalTokens: number;
  model: string;
}

export interface RunStep {
  key: string;
  title: string;
  service: string;
  promptKey: string;
  promptVersion: number | null;
  status: StepStatus;
  startedAt: string | null;
  finishedAt: string | null;
  durationMs: number | null;
  usage: Usage | null;
  output: unknown;
  missingVariables: string[];
  error: string | null;
}

export interface RunItem {
  targetId: string;
  targetName: string;
  status: StepStatus;
  startedAt: string | null;
  finishedAt: string | null;
  durationMs: number | null;
  steps: RunStep[];
  error: string | null;
}

export interface RunEvent {
  at: string;
  level: 'info' | 'success' | 'warning' | 'error';
  type: string;
  message: string;
  targetId: string | null;
  stepKey: string | null;
}

export interface RunOptions {
  concurrency: number;
  language: string;
  tone: string;
  wordCount: number;
  extraInstructions: string;
  demoMode: boolean;
  stopAfterFailures: number;
}

export interface RunSummary {
  targets: number;
  succeeded: number;
  failed: number;
  running: number;
  pending: number;
  percent: number;
  promptTokens: number;
  completionTokens: number;
  reasoningTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  durationMs: number | null;
}

export interface Run {
  id: string;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  label: string;
  profileId: string;
  profileName: string;
  pipelineId: string;
  pipelineName: string;
  targetIds: string[];
  status: RunStatus;
  options: RunOptions;
  items: RunItem[];
  events: RunEvent[];
  error: string | null;
  summary: RunSummary;
  live?: boolean;
}

export type RunListEntry = Pick<
  Run,
  'id' | 'label' | 'status' | 'createdAt' | 'startedAt' | 'finishedAt' | 'profileId' | 'profileName' | 'pipelineName' | 'options' | 'summary'
>;

export interface ApiKeyState {
  present: boolean;
  source: 'environment' | 'settings' | 'none';
  hint: string;
  editable: boolean;
}

export interface Settings {
  updatedAt: string;
  researchModel: string;
  analysisModel: string;
  outreachModel: string;
  defaultLanguage: string;
  defaultTone: string;
  defaultWordCount: number;
  defaultConcurrency: number;
  demoMode: boolean;
  customModels: string[];
  apiKey: ApiKeyState;
  demoModeActive: boolean;
  dataDir: string;
}

export interface Overview {
  totals: { runs: number; drafts: number; failed: number; tokens: number; estimatedCostUsd: number };
  recentRuns: (Pick<Run, 'id' | 'label' | 'status' | 'createdAt' | 'profileName' | 'pipelineName'> & { summary: RunSummary })[];
  activeRuns: string[];
  demoModeActive: boolean;
  apiKey: ApiKeyState;
}

export interface ServiceHealth {
  service: string;
  label: string;
  status: 'ok' | 'degraded' | 'down';
  latencyMs: number;
  url?: string;
  error?: string;
}

export interface HealthReport {
  status: 'ok' | 'degraded' | 'down';
  gateway: ServiceHealth;
  services: ServiceHealth[];
  checkedAt: string;
}

export interface Option {
  value: string;
  label: string;
  hint?: string;
  tone?: string;
  description?: string;
  service?: string;
}

export interface Meta {
  degreeLevels: Option[];
  targetKinds: Option[];
  targetStatuses: Option[];
  fundingNeeds: Option[];
  languages: Option[];
  tones: Option[];
  gradeScales: string[];
  tests: string[];
  languageLevels: string[];
  stages: Option[];
  models: Option[];
  reasoningEfforts: string[];
}

/** Live-stream payloads from the orchestrator, relayed by the gateway. */
export type RunStreamMessage =
  | { kind: 'snapshot'; run: Run }
  | { kind: 'event'; event: RunEvent }
  | { kind: 'item'; item: RunItem; summary: RunSummary }
  | { kind: 'status'; status: RunStatus; summary?: RunSummary }
  | { kind: 'done' };
