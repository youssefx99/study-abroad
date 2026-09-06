/**
 * The demo engine.
 *
 * When no API key is configured, every stage still returns output that matches
 * the prompt's own JSON schema, is shaped by the real prompt text, and is
 * clearly marked as generated. This exists so the platform can be opened,
 * explored, and demonstrated end to end before anyone spends a token — and so
 * a broken key never leaves the interface showing empty panels.
 *
 * Nothing here pretends to be research. Every string it produces says so.
 */

const DEMO_NOTICE = 'Demo output — no external research was performed.';

/**
 * Deterministic string hash, so the same target always yields the same demo
 * text. Re-running a demo pipeline should not shuffle the results.
 * @param {string} value
 * @returns {number}
 */
function hash(value) {
  let h = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

/**
 * @param {string} seed
 */
function makePicker(seed) {
  let counter = hash(seed || 'flow');
  return (list) => {
    counter = Math.imul(counter ^ 0x9e3779b9, 2654435761) >>> 0;
    return list[counter % list.length];
  };
}

/**
 * Resolves the names demo output should use.
 *
 * The caller passes them explicitly. Parsing them back out of the rendered
 * prompt is unreliable: the applicant block and the target block both contain
 * a "Name:" line, and a naive match greets the applicant in their own email.
 *
 * @param {string} prompt
 * @param {{ targetName?: string, organization?: string, applicantName?: string, focus?: string }} hints
 */
function readContext(prompt, hints = {}) {
  const text = String(prompt ?? '');
  const grab = (label) => {
    const match = text.match(new RegExp(`^\\s*${label}\\s*:\\s*(.+)$`, 'im'));
    return match ? match[1].trim().slice(0, 160) : '';
  };

  const focus = Array.isArray(hints.focus) ? hints.focus.join(', ') : hints.focus;

  return {
    targetName: hints.targetName?.trim() || grab('Organisation') || 'the target',
    organization: hints.organization?.trim() || grab('Organisation') || grab('Organization') || '',
    country: grab('Location') || grab('Country') || '',
    focus: focus?.trim() || grab('Stated focus areas') || 'the stated research area',
    applicant: hints.applicantName?.trim() || '',
  };
}

const THEME_WORDS = [
  'measurement and evaluation methodology',
  'systems that stay reliable under real-world load',
  'data-efficient modelling',
  'reproducibility and open benchmarks',
  'applied work with external partners',
  'cross-disciplinary collaboration',
];

const VENUES = ['a leading field conference', 'a peer-reviewed journal', 'a workshop at a major venue'];

/**
 * Produces a plausible value for one schema property, guided by its name.
 * Field names carry meaning ("email_body", "year", "titles"), and using them
 * is what makes demo output look like the real thing rather than lorem ipsum.
 *
 * @param {string} key
 * @param {any} spec
 * @param {ReturnType<typeof readContext>} ctx
 * @param {(list: any[]) => any} pick
 * @param {number} depth
 * @returns {unknown}
 */
function valueFor(key, spec, ctx, pick, depth = 0) {
  const name = key.toLowerCase();
  const type = spec?.type ?? 'string';

  if (Array.isArray(spec?.enum) && spec.enum.length) return pick(spec.enum);

  if (type === 'number' || type === 'integer') {
    if (name.includes('year')) return 2025 + (hash(key + ctx.targetName) % 2);
    if (name.includes('score') || name.includes('rating')) return 70 + (hash(key) % 26);
    if (name.includes('count')) return 2 + (hash(key) % 4);
    return hash(key) % 100;
  }

  if (type === 'boolean') return hash(key + ctx.targetName) % 2 === 0;

  if (type === 'array' && (spec.items?.type ?? 'string') === 'string' && !spec.items?.enum) {
    // Short lists read better as distinct phrases than as the same sentence
    // repeated, which is what a naive per-item fill produces.
    const seeds = name.includes('talking') || name.includes('point')
      ? [`Their work on ${ctx.focus}`, 'Overlap with the field experience in the profile', 'A concrete question about method']
      : name.includes('concern') || name.includes('risk') || name.includes('gap')
        ? ['Demo mode did not verify anything about this target', 'The applicant profile may be missing detail a real draft would use']
        : name.includes('claim')
          ? ['No verifiable claims were made in demo mode']
          : [`${ctx.focus}`, 'Related methodology', 'Applied context'];

    const wanted = Math.max(1, Math.min(spec.maxItems ?? 3, spec.minItems ?? 2));
    return seeds.slice(0, wanted).map((line) => `${line} (demo)`);
  }

  if (type === 'array') {
    const itemSpec = spec.items ?? { type: 'string' };
    const min = Math.max(spec.minItems ?? 2, 1);
    const max = Math.min(spec.maxItems ?? min + 1, min + 2);
    const count = depth > 2 ? 1 : min + (hash(key) % Math.max(1, max - min + 1));

    return Array.from({ length: count }, (_, index) =>
      valueFor(`${key}_${index}`, itemSpec, ctx, pick, depth + 1),
    );
  }

  if (type === 'object') {
    return buildObject(spec, ctx, pick, depth + 1);
  }

  // Strings: match the field's intent.
  if (name.includes('subject')) {
    return `Enquiry about research supervision (demo draft)`;
  }

  if (name.includes('body') || name.includes('message') || name.includes('letter') || name.includes('email')) {
    return [
      `Dear ${ctx.targetName},`,
      '',
      `I am writing about supervision and funding opportunities${ctx.organization ? ` at ${ctx.organization}` : ''}. My background sits close to ${ctx.focus}, and I would value the chance to discuss whether there is a fit.`,
      '',
      `This paragraph is where the live system quotes specific recent work and connects it to the applicant's own projects. In demo mode there is nothing real to quote, so it stays generic on purpose.`,
      '',
      'I would be glad to send a full CV and transcripts, and I am happy to arrange a short call at your convenience.',
      '',
      'With thanks for your time,',
      ctx.applicant || '[Applicant name]',
      '',
      `— ${DEMO_NOTICE} Add an API key under Settings to generate a real draft.`,
    ].join('\n');
  }

  if (name.includes('title')) {
    return `Representative recent work on ${pick(THEME_WORDS)} (demo placeholder)`;
  }
  if (name.includes('venue')) return pick(VENUES);
  if (name.includes('url') || name.includes('link')) return '';
  if (name.includes('summary') || name.includes('overview') || name.includes('profile')) {
    return `${ctx.targetName}${ctx.organization ? ` at ${ctx.organization}` : ''} works in areas connected to ${ctx.focus}, with visible emphasis on ${pick(THEME_WORDS)}. ${DEMO_NOTICE}`;
  }
  if (name.includes('why') || name.includes('match') || name.includes('fit') || name.includes('align')) {
    return `The overlap runs through ${pick(THEME_WORDS)}: the applicant has hands-on experience there, and it is a recurring thread in this target's work. ${DEMO_NOTICE}`;
  }
  if (name.includes('problem') || name.includes('question')) {
    return `How to make progress on ${ctx.focus} without the usual resource assumptions. ${DEMO_NOTICE}`;
  }
  if (name.includes('method') || name.includes('approach')) {
    return `A staged approach combining established baselines with a targeted evaluation protocol. ${DEMO_NOTICE}`;
  }
  if (name.includes('contribution') || name.includes('result') || name.includes('finding')) {
    return `Reported gains over the stated baseline, with the evaluation setup described in full. ${DEMO_NOTICE}`;
  }
  if (name.includes('dataset')) return 'Dataset not specified in demo mode.';
  if (name.includes('metric')) return 'Metrics not specified in demo mode.';
  if (name.includes('risk') || name.includes('concern') || name.includes('gap')) {
    return `The profile is missing detail that a real draft would need. ${DEMO_NOTICE}`;
  }
  if (name.includes('question')) {
    return `What would a realistic first-year project look like in this group?`;
  }
  if (name.includes('name')) return ctx.targetName;

  return `${DEMO_NOTICE} Field "${key}" is filled from the schema so downstream steps have something to read.`;
}

/**
 * @param {any} spec
 * @param {ReturnType<typeof readContext>} ctx
 * @param {(list: any[]) => any} pick
 * @param {number} depth
 */
function buildObject(spec, ctx, pick, depth) {
  /** @type {Record<string, unknown>} */
  const result = {};
  const properties = spec?.properties ?? {};

  for (const [key, propertySpec] of Object.entries(properties)) {
    result[key] = valueFor(key, propertySpec, ctx, pick, depth);
  }

  return result;
}

/**
 * Builds demo output for a prompt.
 *
 * @param {{
 *   outputSchema: Record<string, any> | null,
 *   systemPrompt?: string,
 *   userPrompt: string,
 *   seed?: string,
 *   hints?: { targetName?: string, organization?: string, applicantName?: string, focus?: string }
 * }} args
 * @returns {unknown}
 */
export function generateDemoOutput({ outputSchema, userPrompt, seed = '', hints = {} }) {
  const ctx = readContext(userPrompt, hints);
  const pick = makePicker(seed || ctx.targetName);

  if (!outputSchema || typeof outputSchema !== 'object') {
    return `${DEMO_NOTICE}\n\nThis step has no output schema, so the live system would return free text here.`;
  }

  return buildObject(outputSchema, ctx, pick, 0);
}
