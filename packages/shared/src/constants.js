/**
 * Vocabulary shared by every service and the web app.
 *
 * Design rule for this file: nothing here may assume a country, a discipline,
 * a grading system, or a degree structure. Anywhere a fixed list would exclude
 * someone, the schema accepts free text and these lists act only as
 * suggestions in the UI.
 */

/** What an applicant is aiming for. `other` keeps the list open. */
export const DEGREE_LEVELS = [
  { value: 'bachelors', label: "Bachelor's" },
  { value: 'masters', label: "Master's" },
  { value: 'phd', label: 'PhD / doctorate' },
  { value: 'postdoc', label: 'Postdoc' },
  { value: 'exchange', label: 'Exchange semester' },
  { value: 'research-internship', label: 'Research internship' },
  { value: 'foundation', label: 'Foundation / pathway' },
  { value: 'diploma', label: 'Diploma / certificate' },
  { value: 'other', label: 'Other' },
];

/** Who or what the applicant is writing to. */
export const TARGET_KINDS = [
  { value: 'professor', label: 'Professor', hint: 'A specific academic you want to work with' },
  { value: 'program', label: 'Program', hint: 'A named degree program at an institution' },
  { value: 'university', label: 'University', hint: 'An institution-level contact or admissions office' },
  { value: 'scholarship', label: 'Scholarship', hint: 'A funding body, grant, or sponsor' },
  { value: 'lab', label: 'Lab / research group', hint: 'A group rather than one individual' },
  { value: 'company', label: 'Company / industry', hint: 'Industrial PhD, R&D placement, or internship' },
  { value: 'other', label: 'Other', hint: 'Anything that does not fit the list' },
];

/** Where a target sits in the outreach process. */
export const TARGET_STATUSES = [
  { value: 'new', label: 'New', tone: 'neutral' },
  { value: 'researching', label: 'Researching', tone: 'progress' },
  { value: 'ready', label: 'Ready to send', tone: 'accent' },
  { value: 'contacted', label: 'Contacted', tone: 'accent' },
  { value: 'replied', label: 'Replied', tone: 'positive' },
  { value: 'interviewing', label: 'Interviewing', tone: 'positive' },
  { value: 'offer', label: 'Offer', tone: 'positive' },
  { value: 'declined', label: 'Declined', tone: 'negative' },
  { value: 'archived', label: 'Archived', tone: 'muted' },
];

export const FUNDING_NEEDS = [
  { value: 'full', label: 'Full funding required' },
  { value: 'partial', label: 'Partial funding helps' },
  { value: 'self', label: 'Self-funded' },
  { value: 'unspecified', label: 'Not decided yet' },
];

/**
 * Outreach languages. The list is a convenience; the schema accepts any
 * BCP-47 tag, so an applicant writing in Amharic or Vietnamese is never
 * blocked by the dropdown.
 */
export const OUTREACH_LANGUAGES = [
  { value: 'en', label: 'English' },
  { value: 'de', label: 'German' },
  { value: 'fr', label: 'French' },
  { value: 'es', label: 'Spanish' },
  { value: 'it', label: 'Italian' },
  { value: 'pt', label: 'Portuguese' },
  { value: 'nl', label: 'Dutch' },
  { value: 'sv', label: 'Swedish' },
  { value: 'tr', label: 'Turkish' },
  { value: 'ar', label: 'Arabic' },
  { value: 'zh', label: 'Chinese' },
  { value: 'ja', label: 'Japanese' },
  { value: 'ko', label: 'Korean' },
  { value: 'ru', label: 'Russian' },
];

export const OUTREACH_TONES = [
  { value: 'formal', label: 'Formal', hint: 'Common in Germany, Japan, and much of continental Europe' },
  { value: 'professional', label: 'Professional', hint: 'A safe default almost anywhere' },
  { value: 'warm', label: 'Warm', hint: 'Slightly personal; suits UK, US, and Australian faculty' },
  { value: 'direct', label: 'Direct', hint: 'Short and to the point; suits Nordic and Dutch faculty' },
];

/**
 * Grading systems differ everywhere, so a grade is stored as a value plus a
 * free-text scale. These are autocomplete suggestions only.
 */
export const GRADE_SCALE_SUGGESTIONS = [
  '4.0 GPA',
  '5.0 GPA',
  '10.0 CGPA',
  'Percentage (%)',
  'ECTS grade',
  'UK classification',
  'German 1.0-5.0',
  'French /20',
  'Chinese /100',
  'Japanese GPA /4',
  'Other',
];

/** Test names are free text; these cover the common ones. */
export const TEST_SUGGESTIONS = [
  'IELTS',
  'TOEFL iBT',
  'Duolingo English Test',
  'PTE Academic',
  'Cambridge C1/C2',
  'GRE General',
  'GRE Subject',
  'GMAT',
  'TestDaF',
  'DSH',
  'Goethe-Zertifikat',
  'DELF/DALF',
  'DELE',
  'JLPT',
  'TOPIK',
  'HSK',
  'SAT',
  'ACT',
];

export const LANGUAGE_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'Native'];

/** Pipeline stages map one-to-one onto the executor services. */
export const STAGES = [
  { value: 'research', label: 'Research', service: 'research', description: 'Gather verifiable facts about the target' },
  { value: 'analysis', label: 'Analysis', service: 'analysis', description: 'Judge fit between applicant and target' },
  { value: 'outreach', label: 'Outreach', service: 'outreach', description: 'Draft the message that gets sent' },
  { value: 'custom', label: 'Custom', service: 'analysis', description: 'Any extra step you define yourself' },
];

export const RUN_STATUSES = ['queued', 'running', 'completed', 'partial', 'failed', 'cancelled'];
export const STEP_STATUSES = ['pending', 'running', 'succeeded', 'failed', 'skipped'];

/**
 * Rough per-million-token pricing used only to show an estimate in the UI.
 * Unknown models fall back to `default`, and the UI labels the figure as an
 * estimate so nobody mistakes it for a bill.
 */
/** The model every prompt uses. Not surfaced in the UI — there is no choice to make. */
export const DEFAULT_MODEL = 'gpt-5.4-mini-2026-03-17';

export const MODEL_PRICING = {
  'gpt-5.1': { input: 1.25, output: 10 },
  'gpt-5': { input: 1.25, output: 10 },
  'gpt-5-mini': { input: 0.25, output: 2 },
  'gpt-5-nano': { input: 0.05, output: 0.4 },
  'o3-deep-research': { input: 10, output: 40 },
  'gpt-5.4-mini-2026-03-17': { input: 0.25, output: 2 },
  default: { input: 1, output: 4 },
};

export const MODEL_SUGGESTIONS = [
  { value: 'gpt-5.1', label: 'gpt-5.1', hint: 'Best writing quality; use for outreach' },
  { value: 'gpt-5', label: 'gpt-5', hint: 'Balanced reasoning and cost' },
  { value: 'gpt-5-mini', label: 'gpt-5-mini', hint: 'Fast and cheap; good for research and analysis' },
  { value: 'gpt-5-nano', label: 'gpt-5-nano', hint: 'Cheapest; short structured tasks only' },
  { value: 'o3-deep-research', label: 'o3-deep-research', hint: 'Deepest web research; slow and expensive' },
];

export const REASONING_EFFORTS = ['minimal', 'low', 'medium', 'high'];

export const SERVICE_REGISTRY = {
  gateway: { port: 4000, env: 'GATEWAY_PORT', label: 'Gateway' },
  profiles: { port: 4001, env: 'PROFILES_PORT', label: 'Applicants' },
  targets: { port: 4002, env: 'TARGETS_PORT', label: 'Targets' },
  prompts: { port: 4003, env: 'PROMPTS_PORT', label: 'Prompts' },
  research: { port: 4004, env: 'RESEARCH_PORT', label: 'Research' },
  analysis: { port: 4005, env: 'ANALYSIS_PORT', label: 'Analysis' },
  outreach: { port: 4006, env: 'OUTREACH_PORT', label: 'Outreach' },
  orchestrator: { port: 4007, env: 'ORCHESTRATOR_PORT', label: 'Orchestrator' },
};

/**
 * Resolves a service base URL, honouring per-service env overrides so the same
 * code runs under `npm run dev`, Docker Compose, or split hosts.
 * @param {string} name
 * @returns {string}
 */
export function serviceUrl(name) {
  const entry = SERVICE_REGISTRY[name];
  if (!entry) throw new Error(`Unknown service "${name}"`);

  const explicit = process.env[`${name.toUpperCase()}_URL`];
  if (explicit) return explicit.replace(/\/+$/, '');

  const port = process.env[entry.env] ?? entry.port;
  const host = process.env.FLOW_SERVICE_HOST ?? 'localhost';
  return `http://${host}:${port}`;
}
