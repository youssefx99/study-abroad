/**
 * The prompt library shipped with Flow.
 *
 * These are starting points, not fixtures. Every one is editable in the Prompt
 * studio, versioned, and restorable. The important property is that none of
 * them names a country, a discipline, a degree system, or a specific person —
 * all of that arrives through `{{applicant.*}}` and `{{target.*}}` at render
 * time, which is what lets one library serve a law applicant in Nairobi and a
 * physics applicant in Seoul.
 */

const RESEARCH_SCHEMA = {
  type: 'object',
  properties: {
    target_name: { type: 'string', description: 'The target as verified, or the name given if nothing could be verified' },
    verified: { type: 'boolean', description: 'True only if public sources confirmed the target' },
    profile: {
      type: 'object',
      properties: {
        primary_focus: { type: 'array', items: { type: 'string' }, description: 'Main areas of work, in their own words where possible' },
        secondary_focus: { type: 'array', items: { type: 'string' }, description: 'Adjacent or emerging directions' },
        group_or_context: { type: 'string', description: 'Lab, group, department, or programme context' },
        current_activity: { type: 'string', description: 'Active projects, grants, cohorts, or calls' },
        intake_signals: { type: 'string', description: 'Any public signal about accepting applicants, funding, or deadlines' },
        recent_shift: { type: 'string', description: 'How the work has moved recently, if visible' },
      },
      required: ['primary_focus', 'secondary_focus', 'group_or_context', 'current_activity', 'intake_signals', 'recent_shift'],
      additionalProperties: false,
    },
    recent_work: {
      type: 'array',
      description: 'Up to three concrete, recent, citable items',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          year: { type: 'number' },
          venue: { type: 'string' },
          problem: { type: 'string' },
          method: { type: 'string' },
          contribution: { type: 'string' },
          why_it_matters: { type: 'string' },
          source_url: { type: 'string', description: 'Where this was found, or empty if not verifiable' },
        },
        required: ['title', 'year', 'venue', 'problem', 'method', 'contribution', 'why_it_matters', 'source_url'],
        additionalProperties: false,
      },
    },
    requirements: {
      type: 'object',
      properties: {
        stated_requirements: { type: 'string', description: 'Entry requirements, documents, or eligibility if published' },
        deadlines: { type: 'string' },
        contact_route: { type: 'string', description: 'How this target prefers to be contacted, if stated' },
      },
      required: ['stated_requirements', 'deadlines', 'contact_route'],
      additionalProperties: false,
    },
    gaps: { type: 'array', items: { type: 'string' }, description: 'What could not be verified, stated plainly' },
  },
  required: ['target_name', 'verified', 'profile', 'recent_work', 'requirements', 'gaps'],
  additionalProperties: false,
};

const ANALYSIS_SCHEMA = {
  type: 'object',
  properties: {
    fit_score: { type: 'number', description: 'Honest 0-100 fit score. Below 40 means do not send.' },
    fit_verdict: { type: 'string', enum: ['strong', 'promising', 'weak', 'mismatch'], description: 'Honest overall verdict' },
    target_summary: { type: 'string', description: 'What this target actually works on, in three sentences' },
    why_match: { type: 'string', description: 'The specific, evidence-based overlap' },
    talking_points: { type: 'array', items: { type: 'string' }, description: 'Concrete things the message should mention' },
    concerns: { type: 'array', items: { type: 'string' }, description: 'Weaknesses in the fit, stated honestly' },
    profile_gaps: { type: 'array', items: { type: 'string' }, description: 'What the applicant should add to their profile to strengthen this' },
    suggested_angle: { type: 'string', description: 'The single strongest framing for the opening paragraph' },
  },
  required: ['fit_score', 'fit_verdict', 'target_summary', 'why_match', 'talking_points', 'concerns', 'profile_gaps', 'suggested_angle'],
  additionalProperties: false,
};

const OUTREACH_SCHEMA = {
  type: 'object',
  properties: {
    subject: { type: 'string' },
    body: { type: 'string' },
    word_count: { type: 'number' },
    claims_used: { type: 'array', items: { type: 'string' }, description: 'Every factual claim made about the target, so it can be checked' },
    followup_note: { type: 'string', description: 'A one-line reminder of when and how to follow up' },
  },
  required: ['subject', 'body', 'word_count', 'claims_used', 'followup_note'],
  additionalProperties: false,
};

const REVIEW_SCHEMA = {
  type: 'object',
  properties: {
    subject: { type: 'string' },
    body: { type: 'string' },
    changes_made: { type: 'array', items: { type: 'string' } },
    remaining_risks: { type: 'array', items: { type: 'string' }, description: 'Anything the applicant should verify before sending' },
  },
  required: ['subject', 'body', 'changes_made', 'remaining_risks'],
  additionalProperties: false,
};

/**
 * @param {string} createdAt
 * @param {(prefix: string) => string} makeId
 */
export function buildDefaultPrompts(createdAt, makeId) {
  /**
   * @param {object} spec
   */
  const prompt = (spec) => ({
    id: makeId('prm'),
    createdAt,
    updatedAt: createdAt,
    key: spec.key,
    name: spec.name,
    description: spec.description,
    stage: spec.stage,
    activeVersion: 1,
    isBuiltIn: true,
    tags: spec.tags ?? [],
    versions: [
      {
        version: 1,
        createdAt,
        note: 'Shipped with Flow',
        systemPrompt: spec.systemPrompt,
        userPrompt: spec.userPrompt,
        config: {
          model: spec.model,
          temperature: spec.temperature ?? null,
          reasoningEffort: spec.reasoningEffort ?? null,
          maxOutputTokens: spec.maxOutputTokens ?? null,
          webSearch: spec.webSearch ?? false,
        },
        outputSchema: spec.outputSchema ?? null,
        variables: spec.variables ?? [],
      },
    ],
  });

  return [
    prompt({
      key: 'research.target_profile',
      name: 'Research the target',
      description:
        'Reads public sources and returns verifiable facts about any target — a professor, a programme, a lab, or a funding body. Refuses to invent anything.',
      stage: 'research',
      tags: ['built-in', 'web search'],
      model: 'gpt-5-mini',
      temperature: 0.2,
      webSearch: true,
      outputSchema: RESEARCH_SCHEMA,
      systemPrompt: `You are a research analyst who gathers verifiable facts about academic and funding targets.

You work for applicants from every country and every discipline. You never assume a field, a national system, or a degree structure — you report what the sources actually say.

Rules you never break:
- Do not invent titles, dates, venues, numbers, or quotes.
- If something cannot be verified, say so in "gaps" and leave the field describing it honest and empty-handed.
- Prefer the target's own pages over aggregators.
- Recency matters more than volume. Two confirmed recent items beat six unconfirmed ones.
- Write plainly. No praise, no marketing language.`,
      userPrompt: `Research this target and return the structured result.

TARGET
{{target.block}}

WHAT THE APPLICANT IS ASKING FOR
Degree or opportunity sought: {{applicant.targetDegree}}
Intended intake: {{applicant.targetIntake}}
Applicant's own field and interests: {{applicant.researchInterests}}

TODAY
{{today}}

WHAT TO DO
1. Confirm the target exists and is who the links suggest. Set "verified" accordingly.
2. Describe what they actually work on, using their own framing.
3. Find up to three recent, concrete items of work — papers, projects, calls, or programme changes. Give a source URL for each, or leave the URL empty rather than guessing.
4. Record any published requirements, deadlines, and preferred contact route. These differ by country and institution, so report only what is stated.
5. List in "gaps" everything you could not confirm.

Do not evaluate fit. Do not write any message. Another step does that.`,
    }),

    prompt({
      key: 'analysis.fit_assessment',
      name: 'Assess the fit',
      description:
        'Compares the applicant against what research found and returns an honest fit score, talking points, and the gaps worth fixing before sending.',
      stage: 'analysis',
      tags: ['built-in'],
      model: 'gpt-5-mini',
      temperature: 0.3,
      outputSchema: ANALYSIS_SCHEMA,
      systemPrompt: `You assess whether an applicant and a target are a genuine match.

You are an analyst, not an advocate. An honest "weak" saves the applicant from sending a message that damages their reputation, so score accordingly. Applicants come from every discipline and every education system: read the profile on its own terms and never penalise a background for being unfamiliar or for using a grading scale you do not recognise.

Rules:
- Base every claim on the research output and the applicant profile provided. Nothing else.
- Where the research reported a gap, treat that as unknown, not as absent.
- Name specific overlaps, not general enthusiasm.
- "concerns" and "profile_gaps" must be filled in honestly even when the fit is strong.`,
      userPrompt: `APPLICANT
{{applicant.block}}

TARGET
{{target.block}}

RESEARCH FINDINGS
{{steps.research}}

TASK
Judge the fit and return the structured result.

1. fit_score: 0-100, honest. Reserve 80+ for a genuine overlap in substance, not topic adjacency.
2. fit_verdict: strong | promising | weak | mismatch
3. target_summary: three sentences on what this target actually does.
4. why_match: the specific overlap, citing the applicant's own work and the target's own work.
5. talking_points: two to four concrete things a message should mention. Each must be checkable against the research above.
6. concerns: where the fit is thin. Always give at least one.
7. profile_gaps: what this applicant should add to their profile to make a stronger case here.
8. suggested_angle: the single strongest opening framing.`,
    }),

    prompt({
      key: 'outreach.first_contact',
      name: 'Draft the first message',
      description:
        'Writes the opening message in the applicant’s chosen language and tone, using only facts the earlier steps verified.',
      stage: 'outreach',
      tags: ['built-in'],
      model: 'gpt-5.1',
      temperature: 0.5,
      outputSchema: OUTREACH_SCHEMA,
      systemPrompt: `You write first-contact messages from applicants to academics, programmes, and funding bodies.

You write in whatever language you are asked for, and you adjust to local convention: some cultures expect formality and titles, others expect brevity. Follow the requested tone rather than a single house style.

Hard rules:
- Every factual claim about the target must come from the research provided. If it is not there, it does not go in the message.
- Every claim about the applicant must come from their profile. Do not upgrade a coursework project into a publication.
- No flattery, no "I was deeply impressed", no manufactured enthusiasm.
- No em dashes. No "etc.". No bracketed placeholders in the final text.
- Vary sentence length. Symmetrical, evenly-weighted paragraphs read as machine-written.
- List every factual claim you made about the target in "claims_used" so the applicant can verify before sending.`,
      userPrompt: `Write the first-contact message.

APPLICANT
{{applicant.block}}

TARGET
{{target.block}}

RESEARCH FINDINGS
{{steps.research}}

FIT ANALYSIS
{{steps.analysis}}

MESSAGE SETTINGS
Language: {{options.language}}
Tone: {{options.tone}}
Target length: about {{options.wordCount}} words
Extra instructions from the applicant: {{options.extraInstructions}}

STRUCTURE
1. Address the recipient correctly for their context and title.
2. One sentence saying who the applicant is and what they are asking about.
3. Two or three sentences of substance: reference one specific piece of the target's work, and connect it to something the applicant has actually done. Use the talking points from the fit analysis.
4. One sentence on what the applicant would bring.
5. A clear, single ask: supervision, a place, funding, or a short conversation. Match the ask to what the target actually is.
6. A short close offering to send documents, and a signature using the applicant's real name and links.

Write it. Then count the words and report the count honestly.`,
    }),

    prompt({
      key: 'outreach.review',
      name: 'Review and tighten',
      description:
        'A second pass that removes filler and unverifiable claims, checks the ask is clear, and reports anything left to verify before sending.',
      stage: 'outreach',
      tags: ['built-in'],
      model: 'gpt-5.1',
      temperature: 0.4,
      outputSchema: REVIEW_SCHEMA,
      systemPrompt: `You are an editor. You improve a draft message without inventing anything new.

You cut filler, fix awkward phrasing, and make sure the ask is unmistakable. You never add a fact that is not already in the draft or in the research provided. If the draft contains a claim you cannot trace, you remove it and note that in "changes_made".

Keep the applicant's voice. An over-polished message reads as machine-written and gets ignored.`,
      userPrompt: `Review and tighten this draft.

DRAFT SUBJECT
{{steps.draft.subject}}

DRAFT BODY
{{steps.draft.body}}

CLAIMS THE DRAFT MADE ABOUT THE TARGET
{{steps.draft.claims_used}}

RESEARCH FINDINGS FOR VERIFICATION
{{steps.research}}

SETTINGS
Language: {{options.language}}
Tone: {{options.tone}}
Target length: about {{options.wordCount}} words

CHECKLIST
- Is every claim about the target traceable to the research? Remove any that is not.
- Is the ask stated in one clear sentence?
- Are there placeholders, em dashes, or filler phrases left? Remove them.
- Does it read like a person wrote it in one sitting?
- Is it close to the target length?

Return the improved subject and body, what you changed, and anything the applicant still needs to verify themselves.`,
    }),

    prompt({
      key: 'research.requirements',
      name: 'Extract admission requirements',
      description:
        'Pulls published entry requirements, documents, fees, and deadlines for a programme, scholarship, or institution.',
      stage: 'research',
      tags: ['built-in', 'web search', 'programmes'],
      model: 'gpt-5-mini',
      temperature: 0.2,
      webSearch: true,
      outputSchema: {
        type: 'object',
        properties: {
          programme_name: { type: 'string' },
          institution: { type: 'string' },
          eligibility: { type: 'array', items: { type: 'string' } },
          required_documents: { type: 'array', items: { type: 'string' } },
          language_requirements: { type: 'string' },
          tuition_and_funding: { type: 'string' },
          key_dates: { type: 'array', items: { type: 'string' } },
          application_route: { type: 'string' },
          unverified: { type: 'array', items: { type: 'string' }, description: 'Anything that could not be confirmed from public sources' },
        },
        required: [
          'programme_name',
          'institution',
          'eligibility',
          'required_documents',
          'language_requirements',
          'tuition_and_funding',
          'key_dates',
          'application_route',
          'unverified',
        ],
        additionalProperties: false,
      },
      systemPrompt: `You extract published admission requirements exactly as stated.

Requirements vary enormously between countries and institutions. Never normalise them into a system you find familiar, never convert grades, and never assume a document is required because it usually is elsewhere. Report the source's own wording.

Anything you cannot confirm goes in "unverified". An applicant acting on an invented deadline misses the real one.`,
      userPrompt: `Find the published requirements for this target.

TARGET
{{target.block}}

APPLICANT CONTEXT (for relevance only, do not tailor the facts)
Nationality: {{applicant.nationality}}
Currently based in: {{applicant.countryOfResidence}}
Seeking: {{applicant.targetDegree}} for {{applicant.targetIntake}}

TODAY
{{today}}

Report eligibility, required documents, language requirements, tuition and funding, key dates, and the application route. Put everything unconfirmed in "unverified".`,
    }),
  ];
}

/**
 * Pipelines wire prompts into an order. Each is a starting point the applicant
 * can duplicate and rearrange.
 * @param {string} createdAt
 * @param {(prefix: string) => string} makeId
 */
export function buildDefaultPipelines(createdAt, makeId) {
  const step = (spec) => ({
    id: makeId('stp'),
    key: spec.key,
    title: spec.title,
    description: spec.description,
    promptKey: spec.promptKey,
    service: spec.service,
    enabled: spec.enabled ?? true,
    optional: spec.optional ?? false,
  });

  return [
    {
      id: makeId('ppl'),
      createdAt,
      updatedAt: createdAt,
      name: 'Faculty outreach',
      description:
        'The full four-step process for contacting an academic: research them, judge the fit, draft the message, then tighten it.',
      isBuiltIn: true,
      tags: ['built-in', 'professor'],
      steps: [
        step({
          key: 'research',
          title: 'Research the target',
          description: 'Gather verifiable public facts',
          promptKey: 'research.target_profile',
          service: 'research',
        }),
        step({
          key: 'analysis',
          title: 'Assess the fit',
          description: 'Score the match and pull out talking points',
          promptKey: 'analysis.fit_assessment',
          service: 'analysis',
        }),
        step({
          key: 'draft',
          title: 'Draft the message',
          description: 'Write the first-contact email',
          promptKey: 'outreach.first_contact',
          service: 'outreach',
        }),
        step({
          key: 'final',
          title: 'Review and tighten',
          description: 'Remove filler and unverifiable claims',
          promptKey: 'outreach.review',
          service: 'outreach',
          optional: true,
        }),
      ],
    },
    {
      id: makeId('ppl'),
      createdAt,
      updatedAt: createdAt,
      name: 'Programme and scholarship enquiry',
      description:
        'For programmes, admissions offices, and funding bodies: pull the published requirements first, then write an enquiry that asks only what is not already answered.',
      isBuiltIn: true,
      tags: ['built-in', 'programme', 'scholarship'],
      steps: [
        step({
          key: 'research',
          title: 'Extract requirements',
          description: 'Published eligibility, documents, and dates',
          promptKey: 'research.requirements',
          service: 'research',
        }),
        step({
          key: 'analysis',
          title: 'Assess eligibility fit',
          description: 'Where the applicant meets and misses the bar',
          promptKey: 'analysis.fit_assessment',
          service: 'analysis',
        }),
        step({
          key: 'draft',
          title: 'Draft the enquiry',
          description: 'Ask only what the published material does not answer',
          promptKey: 'outreach.first_contact',
          service: 'outreach',
        }),
      ],
    },
    {
      id: makeId('ppl'),
      createdAt,
      updatedAt: createdAt,
      name: 'Quick draft (no web search)',
      description:
        'Skips research and writes straight from the applicant profile and whatever notes are on the target. Fast and cheap; use when you already know the target.',
      isBuiltIn: true,
      tags: ['built-in', 'fast'],
      steps: [
        step({
          key: 'analysis',
          title: 'Assess the fit',
          description: 'Uses your notes on the target instead of live research',
          promptKey: 'analysis.fit_assessment',
          service: 'analysis',
        }),
        step({
          key: 'draft',
          title: 'Draft the message',
          description: 'Write the first-contact email',
          promptKey: 'outreach.first_contact',
          service: 'outreach',
        }),
      ],
    },
  ];
}
