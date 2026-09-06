#!/usr/bin/env node
import { writeFile, mkdir, readdir, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createId } from '@flow/shared';
import { buildDefaultPrompts, buildDefaultPipelines } from '../services/prompts/src/builtins.js';

/**
 * Seeds the data directory with a worked example.
 *
 * The sample deliberately spans three countries, three target kinds, and a
 * non-US grading scale, so the first thing anyone sees demonstrates that the
 * platform is not built around one system.
 *
 *   npm run seed      fill any empty collections
 *   npm run reset     wipe and re-seed (keeps your API key)
 */

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.resolve(process.env.FLOW_DATA_DIR ?? path.join(root, 'data'));
const force = process.argv.includes('--force');
const now = new Date().toISOString();

const profile = {
  id: createId('app'),
  createdAt: now,
  updatedAt: now,
  fullName: 'Amara Okonkwo',
  email: 'amara.okonkwo@example.org',
  phone: '',
  nationality: 'Nigerian',
  countryOfResidence: 'Nigeria',
  city: 'Lagos',
  timezone: 'Africa/Lagos',
  headline: 'Environmental engineer working on low-cost water quality monitoring',
  summary:
    'I completed a five-year BEng in Civil Engineering at the University of Lagos and spent two years building sensor networks for water quality monitoring across three states. My work sits between environmental engineering and applied sensing: cheap hardware, careful calibration, and datasets that municipal engineers can actually act on. I am looking for a PhD where that work can continue with proper instrumentation and a group that publishes openly.',
  targetDegree: 'phd',
  targetIntake: 'Autumn 2027',
  targetCountries: ['Germany', 'Netherlands', 'Canada'],
  fundingNeed: 'full',
  education: [
    {
      id: createId('edu'),
      degree: 'BEng',
      field: 'Civil Engineering',
      institution: 'University of Lagos',
      country: 'Nigeria',
      startYear: '2018',
      endYear: '2023',
      gradeValue: '4.42',
      gradeScale: '5.0 GPA',
      thesisTitle: 'Low-cost turbidity sensing for peri-urban water networks',
      notes: 'First Class Honours. Five-year programme including a one-year industrial placement.',
    },
  ],
  tests: [
    { id: createId('tst'), name: 'IELTS Academic', score: '7.5', maxScore: '9.0', takenOn: '2026-03-14', expiresOn: '2028-03-14', notes: 'No band below 7.0' },
    { id: createId('tst'), name: 'Goethe-Zertifikat', score: 'A2', maxScore: '', takenOn: '2026-06-02', expiresOn: '', notes: 'Working toward B1' },
  ],
  languages: [
    { id: createId('lng'), language: 'English', level: 'Native' },
    { id: createId('lng'), language: 'Igbo', level: 'Native' },
    { id: createId('lng'), language: 'German', level: 'A2' },
  ],
  publications: [
    {
      id: createId('pub'),
      title: 'A calibration protocol for low-cost turbidity sensors in high-sediment water',
      venue: 'West African Journal of Applied Engineering',
      year: '2025',
      url: '',
      role: 'First author',
      summary: 'Field protocol that cut calibration drift by a third across a nine-month deployment.',
    },
  ],
  experience: [
    {
      id: createId('exp'),
      role: 'Research Engineer',
      organization: 'Lagos Water Resilience Lab',
      country: 'Nigeria',
      startDate: '2023-09',
      endDate: 'present',
      summary:
        'Built and maintained a 40-node water quality sensor network. Wrote the ingestion pipeline and the calibration tooling, and trained municipal staff to run it without me.',
    },
  ],
  researchInterests: ['Environmental sensing', 'Low-cost instrumentation', 'Water quality modelling', 'Open datasets'],
  skills: ['Python', 'Embedded C', 'Sensor calibration', 'Time-series analysis', 'Field deployment'],
  researchStatement:
    'Most water quality monitoring research assumes instrumentation budgets that municipalities in West Africa do not have. My interest is in closing that gap: understanding exactly where cheap sensors fail, building calibration methods that survive real deployment conditions, and publishing the datasets so the work compounds. A PhD would let me take this from field engineering to something methodologically rigorous.',
  links: [
    { id: createId('lnk'), label: 'GitHub', url: 'https://github.com/example-amara' },
    { id: createId('lnk'), label: 'ORCID', url: '' },
  ],
  documents: [
    {
      id: createId('doc'),
      label: 'CV',
      kind: 'cv',
      url: '',
      text:
        'AMARA OKONKWO — Environmental Engineer, Lagos\n\nEDUCATION\nBEng Civil Engineering, University of Lagos, 2018-2023. First Class Honours, 4.42/5.0.\n\nEXPERIENCE\nResearch Engineer, Lagos Water Resilience Lab, 2023-present. Designed and deployed a 40-node water quality sensor network across three states. Built the ingestion pipeline in Python and the calibration tooling in embedded C.\n\nPUBLICATIONS\nOkonkwo, A. (2025). A calibration protocol for low-cost turbidity sensors in high-sediment water. West African Journal of Applied Engineering.\n\nSKILLS\nPython, embedded C, sensor calibration, time-series analysis, field deployment, technical training.',
    },
  ],
  customFields: [
    { id: createId('cfd'), label: 'Scholarship applications in progress', value: 'DAAD EPOS, Commonwealth Scholarship' },
  ],
  tags: ['sample'],
};

/**
 * Three kinds, three countries, one with a real deadline — enough to show the
 * table, the filters, and both built-in pipelines doing something sensible.
 */
const targets = [
  {
    kind: 'professor',
    name: 'Prof. Lena Hartmann',
    organization: 'RWTH Aachen University',
    department: 'Institute for Water Resources Management',
    role: 'Chair',
    country: 'Germany',
    city: 'Aachen',
    focusAreas: ['Urban water systems', 'Sensor networks', 'Hydrological modelling'],
    language: 'de',
    priority: 1,
    tags: ['sample', 'germany'],
    notes: 'Runs a group with a strong field-deployment record. Check whether the chair takes external applicants directly.',
    links: [{ id: createId('lnk'), label: 'Website', url: 'https://example.edu/hartmann' }],
  },
  {
    kind: 'program',
    name: 'MSc/PhD Water Science and Engineering',
    organization: 'IHE Delft Institute for Water Education',
    department: 'Water Resources',
    country: 'Netherlands',
    city: 'Delft',
    focusAreas: ['Water resources', 'Development contexts'],
    deadline: '1 December 2026',
    language: 'en',
    priority: 2,
    tags: ['sample', 'netherlands'],
    notes: 'Explicitly oriented toward applicants from the global south. Confirm whether the PhD route requires a supervisor first.',
    links: [{ id: createId('lnk'), label: 'Programme page', url: 'https://example.edu/water-programme' }],
  },
  {
    kind: 'scholarship',
    name: 'DAAD EPOS Development-Related Postgraduate Courses',
    organization: 'DAAD',
    country: 'Germany',
    focusAreas: ['Development cooperation', 'Full funding'],
    deadline: 'Varies by course, usually August to October',
    language: 'en',
    priority: 1,
    tags: ['sample', 'funding'],
    notes: 'Requires two years of professional experience, which I have. Needs a course-specific application.',
    links: [{ id: createId('lnk'), label: 'Scholarship database', url: 'https://example.org/daad-epos' }],
  },
  {
    kind: 'lab',
    name: 'Sustainable Water Systems Group',
    organization: 'University of Waterloo',
    department: 'Civil and Environmental Engineering',
    country: 'Canada',
    city: 'Waterloo',
    focusAreas: ['Distribution networks', 'Data-driven monitoring'],
    language: 'en',
    priority: 3,
    tags: ['sample', 'canada'],
    notes: 'Group rather than a single supervisor. Address the enquiry to the group lead.',
    links: [],
  },
].map((target) => ({
  id: createId('tgt'),
  createdAt: now,
  updatedAt: now,
  department: '',
  role: '',
  city: '',
  email: '',
  links: [],
  deadline: '',
  status: 'new',
  notes: '',
  customFields: [],
  lastRunId: '',
  lastRunAt: '',
  ...target,
}));

/**
 * @param {string} name
 * @param {unknown} contents
 */
async function seedCollection(name, contents) {
  const file = path.join(dataDir, `${name}.json`);

  if (existsSync(file) && !force) {
    console.log(`  skipped ${name}.json (already exists — use "npm run reset" to replace it)`);
    return;
  }

  await writeFile(file, JSON.stringify(contents, null, 2), 'utf-8');
  const count = Array.isArray(contents) ? contents.length : 1;
  console.log(`  wrote   ${name}.json (${count} record${count === 1 ? '' : 's'})`);
}

async function main() {
  await mkdir(dataDir, { recursive: true });
  console.log(`\nSeeding ${dataDir}\n`);

  if (force) {
    // Never delete secrets.json: wiping sample data should not cost someone
    // their API key.
    const files = await readdir(dataDir).catch(() => []);
    for (const file of files) {
      if (file === 'secrets.json' || !file.endsWith('.json')) continue;
      await unlink(path.join(dataDir, file));
    }
    console.log('  cleared existing collections (kept secrets.json)\n');
  }

  await seedCollection('profiles', [profile]);
  await seedCollection('targets', targets);
  await seedCollection('prompts', buildDefaultPrompts(now, createId));
  await seedCollection('pipelines', buildDefaultPipelines(now, createId));
  await seedCollection('runs', []);

  console.log('\nDone. Start everything with:  npm run dev\n');
}

main().catch((error) => {
  console.error(`\nSeeding failed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
