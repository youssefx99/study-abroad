import { api, ApiError, CLOUD_MODE } from './api';
import { getApiKey } from './cloud/api-key';
import { localId } from './utils';
import type { Profile } from './types';

/**
 * Reading a CV into a profile.
 *
 * Filling thirty fields by hand is the single biggest reason someone abandons
 * this before sending anything, and the information is already sitting in a
 * document they wrote. So the first step is: hand over the CV, let the model
 * lay it out, then correct whatever it got wrong.
 *
 * Text is extracted in the browser rather than uploaded, so the CV itself never
 * leaves the machine — only the text does, on the same request that carries the
 * user's own key.
 */

export class CvImportError extends Error {}

/* --------------------------------------------------------------- extraction */

async function readPdf(file: File): Promise<string> {
  // Loaded on demand: pdf.js is large, and most sessions never open this modal.
  const pdfjs = await import('pdfjs-dist');

  pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();

  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const pages: string[] = [];

  for (let n = 1; n <= doc.numPages; n += 1) {
    const page = await doc.getPage(n);
    const content = await page.getTextContent();
    pages.push(
      content.items
        .map((item) => ('str' in item ? item.str : ''))
        .join(' ')
        .replace(/\s+/g, ' '),
    );
  }

  return pages.join('\n\n');
}

async function readDocx(file: File): Promise<string> {
  const mammoth = await import('mammoth/mammoth.browser');
  const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
  return result.value;
}

/**
 * Pulls plain text out of a CV.
 * @throws {CvImportError} when the file cannot be read, or holds no text.
 */
export async function extractText(file: File): Promise<string> {
  const name = file.name.toLowerCase();

  let text = '';
  try {
    if (name.endsWith('.pdf')) text = await readPdf(file);
    else if (name.endsWith('.docx')) text = await readDocx(file);
    else if (name.endsWith('.txt') || name.endsWith('.md')) text = await file.text();
    else throw new CvImportError('That file type is not supported. Use a PDF, a DOCX, or plain text.');
  } catch (error) {
    if (error instanceof CvImportError) throw error;
    throw new CvImportError(
      `Could not read that file. ${error instanceof Error ? error.message : ''} You can paste the text instead.`.trim(),
    );
  }

  // Strip the control characters PDF extraction leaves behind and collapse
  // runs of blank lines. Spaces are load-bearing, so nothing else is touched.
  const cleaned = text
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  if (cleaned.length < 120) {
    throw new CvImportError(
      'Almost no text came out of that file. It is probably a scan rather than a text PDF. Paste the text instead.',
    );
  }

  // Long CVs exist; the tail is usually references and formatting artefacts.
  return cleaned.slice(0, 60_000);
}

/* ------------------------------------------------------------------ parsing */

const SYSTEM = `You read a CV and lay it out as structured data.

You transcribe. You do not embellish, infer a degree class that is not written, invent dates, or improve on how something is described. If the CV does not say it, the field stays empty.

CVs come from every country and every field. Never convert a grade to a scale you find familiar: record the number and the scale exactly as written. Degree names, institutions, and test names stay in the CV's own wording.`;

const SCHEMA = {
  type: 'object',
  properties: {
    fullName: { type: 'string' },
    email: { type: 'string' },
    phone: { type: 'string' },
    nationality: { type: 'string' },
    countryOfResidence: { type: 'string' },
    city: { type: 'string' },
    headline: { type: 'string', description: 'One line describing who this person is, drawn from the CV' },
    summary: { type: 'string', description: 'A short paragraph of background, in plain prose' },
    researchStatement: { type: 'string', description: 'What they work on and why, if the CV says' },
    researchInterests: { type: 'array', items: { type: 'string' } },
    skills: { type: 'array', items: { type: 'string' } },
    education: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          degree: { type: 'string' },
          field: { type: 'string' },
          institution: { type: 'string' },
          country: { type: 'string' },
          startYear: { type: 'string' },
          endYear: { type: 'string' },
          gradeValue: { type: 'string', description: 'The number only, exactly as written' },
          gradeScale: { type: 'string', description: 'What it is out of, exactly as written' },
          thesisTitle: { type: 'string' },
        },
        required: ['degree', 'field', 'institution', 'country', 'startYear', 'endYear', 'gradeValue', 'gradeScale', 'thesisTitle'],
        additionalProperties: false,
      },
    },
    tests: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          score: { type: 'string' },
          maxScore: { type: 'string' },
          takenOn: { type: 'string' },
        },
        required: ['name', 'score', 'maxScore', 'takenOn'],
        additionalProperties: false,
      },
    },
    languages: {
      type: 'array',
      items: {
        type: 'object',
        properties: { language: { type: 'string' }, level: { type: 'string' } },
        required: ['language', 'level'],
        additionalProperties: false,
      },
    },
    experience: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          role: { type: 'string' },
          organization: { type: 'string' },
          country: { type: 'string' },
          startDate: { type: 'string' },
          endDate: { type: 'string' },
          summary: { type: 'string' },
        },
        required: ['role', 'organization', 'country', 'startDate', 'endDate', 'summary'],
        additionalProperties: false,
      },
    },
    publications: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          venue: { type: 'string' },
          year: { type: 'string' },
          role: { type: 'string', description: 'First author, co-author, under review, and so on' },
          summary: { type: 'string' },
        },
        required: ['title', 'venue', 'year', 'role', 'summary'],
        additionalProperties: false,
      },
    },
    links: {
      type: 'array',
      items: {
        type: 'object',
        properties: { label: { type: 'string' }, url: { type: 'string' } },
        required: ['label', 'url'],
        additionalProperties: false,
      },
    },
  },
  required: [
    'fullName',
    'email',
    'phone',
    'nationality',
    'countryOfResidence',
    'city',
    'headline',
    'summary',
    'researchStatement',
    'researchInterests',
    'skills',
    'education',
    'tests',
    'languages',
    'experience',
    'publications',
    'links',
  ],
  additionalProperties: false,
};

/** What the model returned, before it is turned into profile records. */
export interface CvFields {
  fullName: string;
  email: string;
  phone: string;
  nationality: string;
  countryOfResidence: string;
  city: string;
  headline: string;
  summary: string;
  researchStatement: string;
  researchInterests: string[];
  skills: string[];
  education: Record<string, string>[];
  tests: Record<string, string>[];
  languages: Record<string, string>[];
  experience: Record<string, string>[];
  publications: Record<string, string>[];
  links: Record<string, string>[];
}

/**
 * Sends the CV text for structuring.
 * @throws {CvImportError}
 */
export async function parseCv(text: string): Promise<CvFields> {
  const apiKey = CLOUD_MODE ? getApiKey() : undefined;

  if (CLOUD_MODE && !apiKey) {
    throw new CvImportError('Add your OpenAI key under Settings first. Reading a CV needs a real model call.');
  }

  // Hosted: the stateless route, carrying the visitor's own key. Self-hosted:
  // the gateway, where the stage service reads the key from disk. Different
  // backends, same request shape.
  const path = CLOUD_MODE ? '/api/execute' : '/api/run-step';

  try {
    const result = await api.post<{ output: CvFields }>(path, {
      apiKey,
      context: {},
      step: {
        key: 'cv_import',
        title: 'Read the CV',
        systemPrompt: SYSTEM,
        userPrompt: `Lay this CV out as structured data. Leave anything it does not state empty.\n\n---\n${text}\n---`,
        outputSchema: SCHEMA,
        config: { webSearch: false },
      },
    });

    if (!result?.output) throw new CvImportError('The model returned nothing usable.');
    return result.output;
  } catch (error) {
    if (error instanceof CvImportError) throw error;
    throw new CvImportError(error instanceof ApiError ? error.message : 'The CV could not be read.');
  }
}

/* ------------------------------------------------------------------ merging */

const clean = (value: unknown): string => String(value ?? '').trim();

/**
 * Folds extracted fields into a profile.
 *
 * Anything the person already typed wins: an import is meant to save typing,
 * not to overwrite a correction they made a minute ago. Lists are replaced only
 * when they are currently empty.
 *
 * @param current the profile being edited
 * @param fields what the model returned
 * @param cvText the raw text, kept so prompts can quote the CV directly
 */
export function mergeCvIntoProfile(current: Profile, fields: CvFields, cvText: string): Profile {
  const keep = (existing: string, incoming: unknown) => (existing.trim() ? existing : clean(incoming));
  const keepList = <T>(existing: T[], incoming: T[]) => (existing.length ? existing : incoming);

  return {
    ...current,
    fullName: keep(current.fullName, fields.fullName),
    email: keep(current.email, fields.email),
    phone: keep(current.phone, fields.phone),
    nationality: keep(current.nationality, fields.nationality),
    countryOfResidence: keep(current.countryOfResidence, fields.countryOfResidence),
    city: keep(current.city, fields.city),
    headline: keep(current.headline, fields.headline),
    summary: keep(current.summary, fields.summary),
    researchStatement: keep(current.researchStatement, fields.researchStatement),

    researchInterests: keepList(current.researchInterests, (fields.researchInterests ?? []).map(clean).filter(Boolean)),
    skills: keepList(current.skills, (fields.skills ?? []).map(clean).filter(Boolean)),

    education: keepList(
      current.education,
      (fields.education ?? []).map((row) => ({
        id: localId('edu'),
        degree: clean(row.degree),
        field: clean(row.field),
        institution: clean(row.institution),
        country: clean(row.country),
        startYear: clean(row.startYear),
        endYear: clean(row.endYear),
        gradeValue: clean(row.gradeValue),
        gradeScale: clean(row.gradeScale),
        thesisTitle: clean(row.thesisTitle),
        notes: '',
      })),
    ),

    tests: keepList(
      current.tests,
      (fields.tests ?? [])
        .filter((row) => clean(row.name))
        .map((row) => ({
          id: localId('tst'),
          name: clean(row.name),
          score: clean(row.score),
          maxScore: clean(row.maxScore),
          takenOn: clean(row.takenOn),
          expiresOn: '',
          notes: '',
        })),
    ),

    languages: keepList(
      current.languages,
      (fields.languages ?? [])
        .filter((row) => clean(row.language))
        .map((row) => ({ id: localId('lng'), language: clean(row.language), level: clean(row.level) })),
    ),

    experience: keepList(
      current.experience,
      (fields.experience ?? []).map((row) => ({
        id: localId('exp'),
        role: clean(row.role),
        organization: clean(row.organization),
        country: clean(row.country),
        startDate: clean(row.startDate),
        endDate: clean(row.endDate),
        summary: clean(row.summary),
      })),
    ),

    publications: keepList(
      current.publications,
      (fields.publications ?? [])
        .filter((row) => clean(row.title))
        .map((row) => ({
          id: localId('pub'),
          title: clean(row.title),
          venue: clean(row.venue),
          year: clean(row.year),
          url: '',
          role: clean(row.role),
          summary: clean(row.summary),
        })),
    ),

    links: keepList(
      current.links,
      (fields.links ?? [])
        .filter((row) => clean(row.url))
        .map((row) => ({ id: localId('lnk'), label: clean(row.label) || 'Link', url: clean(row.url) })),
    ),

    // The CV text itself is kept so prompts can quote it. There is no tab for
    // it any more; the Preview tab shows exactly what the model receives.
    documents: [
      { id: localId('doc'), label: 'CV', kind: 'cv', url: '', text: cvText },
      ...current.documents.filter((d) => d.kind !== 'cv'),
    ],
  };
}

/** A short readout of what came back, for the confirmation step. */
export function summariseFields(fields: CvFields): { label: string; count: number }[] {
  return [
    { label: 'Education', count: fields.education?.length ?? 0 },
    { label: 'Experience', count: fields.experience?.length ?? 0 },
    { label: 'Tests', count: fields.tests?.length ?? 0 },
    { label: 'Languages', count: fields.languages?.length ?? 0 },
    { label: 'Publications', count: fields.publications?.length ?? 0 },
    { label: 'Interests', count: fields.researchInterests?.length ?? 0 },
    { label: 'Skills', count: fields.skills?.length ?? 0 },
    { label: 'Links', count: fields.links?.length ?? 0 },
  ];
}
