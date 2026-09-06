import 'dotenv/config';
import { createService, finaliseService, listen, route } from '@flow/service-kit';
import { JsonRepository } from '@flow/store';
import {
  ok,
  createId,
  NotFoundError,
  profileSchema,
  profileInputSchema,
  profilePatchSchema,
  profileToPromptBlock,
  scoreProfileCompleteness,
} from '@flow/shared';

/**
 * Applicant service. Owns everything about the person applying.
 *
 * The prompt block and completeness score are computed here rather than in the
 * web app, so the text the model sees is byte-identical to the text the
 * applicant previews on screen.
 */

const { app, logger } = createService({ name: 'profiles' });
const profiles = new JsonRepository('profiles');

/**
 * Fills defaults through the schema so records written by older versions gain
 * new fields on read instead of crashing the UI.
 * @param {unknown} record
 */
function hydrate(record) {
  return profileSchema.parse(record);
}

/** @param {ReturnType<typeof hydrate>} profile */
function decorate(profile) {
  return {
    ...profile,
    completeness: scoreProfileCompleteness(profile),
    promptBlock: profileToPromptBlock(profile),
  };
}

app.get(
  '/profiles',
  route(async (req, res) => {
    const rows = (await profiles.readAll()).map(hydrate);
    const search = String(req.query.search ?? '').trim().toLowerCase();

    const filtered = search
      ? rows.filter((p) =>
          [p.fullName, p.headline, p.email, ...p.tags, ...p.researchInterests]
            .join(' ')
            .toLowerCase()
            .includes(search),
        )
      : rows;

    const sorted = [...filtered].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

    res.json(
      ok(
        sorted.map((p) => ({
          id: p.id,
          fullName: p.fullName,
          headline: p.headline,
          email: p.email,
          nationality: p.nationality,
          countryOfResidence: p.countryOfResidence,
          targetDegree: p.targetDegree,
          targetIntake: p.targetIntake,
          researchInterests: p.researchInterests,
          tags: p.tags,
          updatedAt: p.updatedAt,
          completeness: scoreProfileCompleteness(p),
        })),
        { total: sorted.length },
      ),
    );
  }),
);

app.get(
  '/profiles/:id',
  route(async (req, res) => {
    const record = await profiles.findById(req.params.id);
    if (!record) throw new NotFoundError('Applicant', req.params.id);
    res.json(ok(decorate(hydrate(record))));
  }),
);

app.post(
  '/profiles',
  route(async (req, res) => {
    const input = profileInputSchema.parse(req.body ?? {});
    const now = new Date().toISOString();

    const record = profileSchema.parse({
      ...input,
      id: createId('app'),
      createdAt: now,
      updatedAt: now,
    });

    await profiles.create(record);
    logger.info(`created applicant ${record.id} (${record.fullName})`);
    res.status(201).json(ok(decorate(record)));
  }),
);

app.patch(
  '/profiles/:id',
  route(async (req, res) => {
    const patch = profilePatchSchema.parse(req.body ?? {});

    const updated = await profiles.update(req.params.id, (current) =>
      profileSchema.parse({
        ...hydrate(current),
        ...patch,
        id: current.id,
        createdAt: current.createdAt,
        updatedAt: new Date().toISOString(),
      }),
    );

    if (!updated) throw new NotFoundError('Applicant', req.params.id);
    res.json(ok(decorate(updated)));
  }),
);

app.post(
  '/profiles/:id/duplicate',
  route(async (req, res) => {
    const source = await profiles.findById(req.params.id);
    if (!source) throw new NotFoundError('Applicant', req.params.id);

    const now = new Date().toISOString();
    const copy = profileSchema.parse({
      ...hydrate(source),
      id: createId('app'),
      fullName: `${hydrate(source).fullName} (copy)`,
      createdAt: now,
      updatedAt: now,
    });

    await profiles.create(copy);
    res.status(201).json(ok(decorate(copy)));
  }),
);

app.delete(
  '/profiles/:id',
  route(async (req, res) => {
    const removed = await profiles.delete(req.params.id);
    if (!removed) throw new NotFoundError('Applicant', req.params.id);
    logger.info(`deleted applicant ${req.params.id}`);
    res.json(ok({ id: req.params.id, deleted: true }));
  }),
);

/** Preview exactly what the model will read. Used by the profile editor. */
app.get(
  '/profiles/:id/prompt-block',
  route(async (req, res) => {
    const record = await profiles.findById(req.params.id);
    if (!record) throw new NotFoundError('Applicant', req.params.id);

    const profile = hydrate(record);
    const block = profileToPromptBlock(profile);

    res.json(
      ok({
        block,
        characters: block.length,
        approximateTokens: Math.round(block.length / 4),
      }),
    );
  }),
);

finaliseService(app, logger);
listen(app, process.env.PROFILES_PORT ?? 4001, logger);
