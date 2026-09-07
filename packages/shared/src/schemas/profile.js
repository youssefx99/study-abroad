import { z } from 'zod';

/**
 * Applicant profile.
 *
 * Everything except a name is optional, and every list carries a `customFields`
 * escape hatch. A student in Cairo applying for a German master's, and a
 * postdoc in Santiago applying to a Japanese lab, describe themselves with the
 * same shape. That is the point: the platform automates the process, it does
 * not prescribe the biography.
 */

const trimmed = z.string().trim();
const optionalText = trimmed.max(20000).optional().default('');
const shortText = trimmed.max(300).optional().default('');

export const customFieldSchema = z.object({
  id: trimmed.min(1),
  label: trimmed.min(1).max(120),
  value: trimmed.max(4000).default(''),
});

export const linkSchema = z.object({
  id: trimmed.min(1),
  /** Free text: "Google Scholar", "ORCID", "Portfolio", "WeChat", anything. */
  label: trimmed.min(1).max(80),
  url: trimmed.max(2000).default(''),
});

export const educationSchema = z.object({
  id: trimmed.min(1),
  degree: shortText,
  field: shortText,
  institution: shortText,
  country: shortText,
  startYear: shortText,
  endYear: shortText,
  /** Grade is split into value + scale so any national system fits. */
  gradeValue: shortText,
  gradeScale: shortText,
  thesisTitle: shortText,
  notes: optionalText,
});

export const testScoreSchema = z.object({
  id: trimmed.min(1),
  /** Free text so JLPT, TestDaF, or a national exam all fit. */
  name: trimmed.min(1).max(120),
  score: shortText,
  maxScore: shortText,
  takenOn: shortText,
  expiresOn: shortText,
  notes: shortText,
});

export const languageSchema = z.object({
  id: trimmed.min(1),
  language: trimmed.min(1).max(80),
  /** CEFR level or any local descriptor. */
  level: shortText,
});

export const publicationSchema = z.object({
  id: trimmed.min(1),
  title: trimmed.min(1).max(500),
  venue: shortText,
  year: shortText,
  url: shortText,
  /** "First author", "Co-author", "Under review" — free text on purpose. */
  role: shortText,
  summary: optionalText,
});

export const experienceSchema = z.object({
  id: trimmed.min(1),
  role: shortText,
  organization: shortText,
  country: shortText,
  startDate: shortText,
  endDate: shortText,
  summary: optionalText,
});

export const documentSchema = z.object({
  id: trimmed.min(1),
  label: trimmed.min(1).max(160),
  /** cv | transcript | sop | recommendation | portfolio | other */
  kind: shortText,
  url: shortText,
  /**
   * Extracted plain text. Prompts read this, so pasting a CV here is enough —
   * no file storage service is required to get full personalisation.
   */
  text: optionalText,
});

export const profileSchema = z.object({
  id: trimmed.min(1),
  createdAt: trimmed,
  updatedAt: trimmed,

  fullName: trimmed.min(1, 'Add the applicant name').max(200),
  email: trimmed.max(320).default(''),
  phone: shortText,
  nationality: shortText,
  countryOfResidence: shortText,
  city: shortText,
  timezone: shortText,

  headline: trimmed.max(300).default(''),
  summary: optionalText,

  targetDegree: trimmed.max(60).default('phd'),
  targetIntake: shortText,
  targetCountries: z.array(trimmed.max(120)).default([]),
  fundingNeed: trimmed.max(40).default('unspecified'),

  education: z.array(educationSchema).default([]),
  tests: z.array(testScoreSchema).default([]),
  languages: z.array(languageSchema).default([]),
  publications: z.array(publicationSchema).default([]),
  experience: z.array(experienceSchema).default([]),

  researchInterests: z.array(trimmed.max(200)).default([]),
  skills: z.array(trimmed.max(120)).default([]),
  researchStatement: optionalText,

  links: z.array(linkSchema).default([]),
  documents: z.array(documentSchema).default([]),
  customFields: z.array(customFieldSchema).default([]),
  tags: z.array(trimmed.max(60)).default([]),
});

/** Fields a client may send when creating a profile. */
export const profileInputSchema = profileSchema
  .omit({ id: true, createdAt: true, updatedAt: true })
  .partial()
  .extend({ fullName: trimmed.min(1, 'Add the applicant name').max(200) });

/** Every field optional — used by PATCH. */
export const profilePatchSchema = profileSchema
  .omit({ id: true, createdAt: true, updatedAt: true })
  .partial();

/**
 * Condenses a profile into the block that prompts interpolate. Keeping this in
 * shared code means research, analysis, and outreach all describe the applicant
 * identically, so the model never sees contradictory framing between stages.
 * @param {z.infer<typeof profileSchema>} profile
 * @returns {string}
 */
export function profileToPromptBlock(profile) {
  const lines = [];
  const push = (label, value) => {
    if (value === undefined || value === null) return;
    const text = String(value).trim();
    if (text) lines.push(`${label}: ${text}`);
  };

  push('Name', profile.fullName);
  push('Nationality', profile.nationality);
  push('Currently based in', [profile.city, profile.countryOfResidence].filter(Boolean).join(', '));
  push('Headline', profile.headline);
  push('Applying for', profile.targetDegree);
  push('Intended intake', profile.targetIntake);
  push('Preferred destinations', profile.targetCountries.join(', '));
  push('Funding need', profile.fundingNeed);
  push('Summary', profile.summary);

  if (profile.education.length) {
    lines.push('', 'Education:');
    for (const item of profile.education) {
      const grade = [item.gradeValue, item.gradeScale].filter(Boolean).join(' ');
      const period = [item.startYear, item.endYear].filter(Boolean).join('-');
      const parts = [
        [item.degree, item.field].filter(Boolean).join(' in '),
        [item.institution, item.country].filter(Boolean).join(', '),
        period,
        grade && `grade ${grade}`,
        item.thesisTitle && `thesis "${item.thesisTitle}"`,
      ].filter(Boolean);
      if (parts.length) lines.push(`- ${parts.join(' | ')}`);
    }
  }

  if (profile.tests.length) {
    lines.push('', 'Test scores:');
    for (const t of profile.tests) {
      const score = [t.score, t.maxScore && `of ${t.maxScore}`].filter(Boolean).join(' ');
      lines.push(`- ${t.name}${score ? `: ${score}` : ''}${t.takenOn ? ` (${t.takenOn})` : ''}`);
    }
  }

  if (profile.languages.length) {
    lines.push('', `Languages: ${profile.languages.map((l) => `${l.language}${l.level ? ` (${l.level})` : ''}`).join(', ')}`);
  }

  if (profile.researchInterests.length) {
    lines.push('', `Research interests: ${profile.researchInterests.join(', ')}`);
  }

  if (profile.researchStatement.trim()) {
    lines.push('', 'Research statement:', profile.researchStatement.trim());
  }

  if (profile.publications.length) {
    lines.push('', 'Publications and submissions:');
    for (const p of profile.publications) {
      const meta = [p.venue, p.year, p.role].filter(Boolean).join(', ');
      lines.push(`- "${p.title}"${meta ? ` (${meta})` : ''}${p.summary ? ` — ${p.summary}` : ''}`);
    }
  }

  if (profile.experience.length) {
    lines.push('', 'Experience:');
    for (const e of profile.experience) {
      const where = [e.organization, e.country].filter(Boolean).join(', ');
      const when = [e.startDate, e.endDate].filter(Boolean).join(' to ');
      lines.push(`- ${[e.role, where, when].filter(Boolean).join(' | ')}${e.summary ? `: ${e.summary}` : ''}`);
    }
  }

  if (profile.skills.length) lines.push('', `Skills: ${profile.skills.join(', ')}`);

  const usableLinks = profile.links.filter((l) => l.url.trim());
  if (usableLinks.length) {
    lines.push('', `Links: ${usableLinks.map((l) => `${l.label} ${l.url}`).join(' | ')}`);
  }

  const docsWithText = profile.documents.filter((d) => d.text.trim());
  if (docsWithText.length) {
    lines.push('', 'Attached document text:');
    for (const d of docsWithText) {
      lines.push(`--- ${d.label} ---`, d.text.trim().slice(0, 8000));
    }
  }

  const filledCustom = profile.customFields.filter((f) => f.value.trim());
  if (filledCustom.length) {
    lines.push('', 'Additional details:');
    for (const f of filledCustom) lines.push(`- ${f.label}: ${f.value}`);
  }

  return lines.join('\n').trim();
}

/**
 * Percentage of the profile that is filled in, weighted toward the fields that
 * measurably improve generated outreach. Shown in the UI so an applicant knows
 * what to fix before spending tokens.
 * @param {z.infer<typeof profileSchema>} profile
 */
export function scoreProfileCompleteness(profile) {
  /** @type {{ key: string, label: string, weight: number, done: boolean, hint: string }[]} */
  const checks = [
    { key: 'name', label: 'Name', weight: 5, done: Boolean(profile.fullName.trim()), hint: 'Used in the signature' },
    { key: 'headline', label: 'Headline', weight: 8, done: Boolean(profile.headline.trim()), hint: 'One line on who you are' },
    { key: 'summary', label: 'Summary', weight: 10, done: profile.summary.trim().length > 80, hint: 'A short paragraph of background' },
    { key: 'degree', label: 'Target degree', weight: 5, done: Boolean(profile.targetDegree.trim()), hint: 'What you are applying for' },
    { key: 'intake', label: 'Intake', weight: 5, done: Boolean(profile.targetIntake.trim()), hint: 'Faculty need the start term' },
    { key: 'education', label: 'Education', weight: 15, done: profile.education.length > 0, hint: 'At least one degree' },
    { key: 'interests', label: 'Research interests', weight: 12, done: profile.researchInterests.length > 0, hint: 'Drives the fit analysis' },
    { key: 'statement', label: 'Research statement', weight: 10, done: profile.researchStatement.trim().length > 120, hint: 'The strongest personalisation signal' },
    { key: 'experience', label: 'Experience', weight: 10, done: profile.experience.length > 0, hint: 'Roles, labs, or internships' },
    { key: 'publications', label: 'Publications', weight: 8, done: profile.publications.length > 0, hint: 'Optional, but very persuasive' },
    { key: 'documents', label: 'CV text', weight: 7, done: profile.documents.some((d) => d.text.trim().length > 200), hint: 'Import your CV so drafts can quote it' },
  ];
  // Links are not scored: there is no longer a screen to add them on. They
  // arrive from an imported CV or not at all, so counting them would mark a
  // profile incomplete for something nobody can act on.

  const earned = checks.reduce((sum, c) => (c.done ? sum + c.weight : sum), 0);
  const total = checks.reduce((sum, c) => sum + c.weight, 0);

  return {
    percent: Math.round((earned / total) * 100),
    checks,
    missing: checks.filter((c) => !c.done),
  };
}
