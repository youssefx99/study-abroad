import 'dotenv/config';
import { createService, finaliseService, listen, route } from '@flow/service-kit';
import { JsonRepository } from '@flow/store';
import {
  ok,
  createId,
  AppError,
  NotFoundError,
  targetSchema,
  targetInputSchema,
  targetPatchSchema,
  targetToPromptBlock,
  normaliseImportRow,
} from '@flow/shared';

/**
 * Target service. Owns professors, programmes, scholarships, labs, and
 * companies — anything an applicant writes to.
 *
 * Import is deliberately forgiving: people arrive with a spreadsheet export, a
 * JSON array they wrote by hand, or a list of names pasted from a browser tab.
 * All three should work without anyone reading a format spec.
 */

const { app, logger } = createService({ name: 'targets' });
const targets = new JsonRepository('targets');

/** @param {unknown} record */
const hydrate = (record) => targetSchema.parse(record);

app.get(
  '/targets',
  route(async (req, res) => {
    const rows = (await targets.readAll()).map(hydrate);

    const search = String(req.query.search ?? '').trim().toLowerCase();
    const kind = String(req.query.kind ?? '').trim();
    const status = String(req.query.status ?? '').trim();
    const country = String(req.query.country ?? '').trim();
    const tag = String(req.query.tag ?? '').trim();

    const filtered = rows.filter((t) => {
      if (kind && t.kind !== kind) return false;
      if (status && t.status !== status) return false;
      if (country && t.country.toLowerCase() !== country.toLowerCase()) return false;
      if (tag && !t.tags.includes(tag)) return false;
      if (!search) return true;

      return [t.name, t.organization, t.department, t.country, t.city, t.notes, ...t.focusAreas, ...t.tags]
        .join(' ')
        .toLowerCase()
        .includes(search);
    });

    // Highest priority first, then most recently touched.
    const sorted = [...filtered].sort(
      (a, b) => a.priority - b.priority || b.updatedAt.localeCompare(a.updatedAt),
    );

    res.json(
      ok(sorted, {
        total: sorted.length,
        // Facets let the UI build filter chips without a second request.
        facets: {
          kinds: countBy(rows, (t) => t.kind),
          statuses: countBy(rows, (t) => t.status),
          countries: countBy(rows.filter((t) => t.country), (t) => t.country),
          tags: countBy(rows.flatMap((t) => t.tags.map((tag) => ({ tag }))), (t) => t.tag),
        },
      }),
    );
  }),
);

/**
 * @template T
 * @param {T[]} rows
 * @param {(row: T) => string} pick
 */
function countBy(rows, pick) {
  /** @type {Record<string, number>} */
  const counts = {};
  for (const row of rows) {
    const key = pick(row);
    if (!key) continue;
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([value, count]) => ({ value, count }));
}

app.get(
  '/targets/:id',
  route(async (req, res) => {
    const record = await targets.findById(req.params.id);
    if (!record) throw new NotFoundError('Target', req.params.id);

    const target = hydrate(record);
    res.json(ok({ ...target, promptBlock: targetToPromptBlock(target) }));
  }),
);

app.post(
  '/targets',
  route(async (req, res) => {
    const input = targetInputSchema.parse(req.body ?? {});
    const now = new Date().toISOString();

    const record = targetSchema.parse({
      ...input,
      id: createId('tgt'),
      createdAt: now,
      updatedAt: now,
    });

    await targets.create(record);
    logger.info(`created target ${record.id} (${record.name})`);
    res.status(201).json(ok(record));
  }),
);

app.patch(
  '/targets/:id',
  route(async (req, res) => {
    const patch = targetPatchSchema.parse(req.body ?? {});

    const updated = await targets.update(req.params.id, (current) =>
      targetSchema.parse({
        ...hydrate(current),
        ...patch,
        id: current.id,
        createdAt: current.createdAt,
        updatedAt: new Date().toISOString(),
      }),
    );

    if (!updated) throw new NotFoundError('Target', req.params.id);
    res.json(ok(updated));
  }),
);

/** Bulk status or tag changes from the targets table. */
app.post(
  '/targets/bulk',
  route(async (req, res) => {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(String) : [];
    if (!ids.length) throw new AppError('Select at least one target first.', 422);

    const patch = targetPatchSchema.parse(req.body?.patch ?? {});
    const updated = [];

    for (const id of ids) {
      const record = await targets.update(id, (current) =>
        targetSchema.parse({
          ...hydrate(current),
          ...patch,
          id: current.id,
          createdAt: current.createdAt,
          updatedAt: new Date().toISOString(),
        }),
      );
      if (record) updated.push(record);
    }

    logger.info(`bulk updated ${updated.length} targets`);
    res.json(ok({ updated: updated.length, targets: updated }));
  }),
);

app.delete(
  '/targets/:id',
  route(async (req, res) => {
    const removed = await targets.delete(req.params.id);
    if (!removed) throw new NotFoundError('Target', req.params.id);
    res.json(ok({ id: req.params.id, deleted: true }));
  }),
);

app.post(
  '/targets/bulk-delete',
  route(async (req, res) => {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(String) : [];
    if (!ids.length) throw new AppError('Select at least one target first.', 422);

    const removed = await targets.deleteMany(ids);
    logger.info(`deleted ${removed} targets`);
    res.json(ok({ deleted: removed }));
  }),
);

/**
 * Bulk import. Accepts a JSON array, or CSV/TSV text with a header row.
 * Reports per-row problems instead of failing the whole file, because one bad
 * row in a hundred should not cost the applicant the other ninety-nine.
 */
app.post(
  '/targets/import',
  route(async (req, res) => {
    const { format = 'json', content = '', defaults = {} } = req.body ?? {};
    const rows = format === 'csv' ? parseDelimited(String(content)) : parseJsonArray(String(content));

    if (!rows.length) throw new AppError('Nothing to import. The content had no readable rows.', 422);

    const now = new Date().toISOString();
    const existing = (await targets.readAll()).map(hydrate);
    /** Match on name plus organisation so two people with the same name at different institutions both import. */
    const seen = new Set(existing.map((t) => `${t.name.toLowerCase()}|${t.organization.toLowerCase()}`));

    const created = [];
    /** @type {{ row: number, reason: string }[]} */
    const skipped = [];

    for (const [index, row] of rows.entries()) {
      try {
        const normalised = normaliseImportRow(row, createId);
        const merged = { ...normalised, ...stripEmpty(defaults) };

        if (!merged.name) {
          skipped.push({ row: index + 1, reason: 'No name in this row' });
          continue;
        }

        const fingerprint = `${String(merged.name).toLowerCase()}|${String(merged.organization ?? '').toLowerCase()}`;
        if (seen.has(fingerprint)) {
          skipped.push({ row: index + 1, reason: `"${merged.name}" is already in your list` });
          continue;
        }
        seen.add(fingerprint);

        created.push(
          targetSchema.parse({
            ...merged,
            id: createId('tgt'),
            createdAt: now,
            updatedAt: now,
          }),
        );
      } catch (error) {
        skipped.push({ row: index + 1, reason: error instanceof Error ? error.message : 'Could not read this row' });
      }
    }

    if (created.length) await targets.createMany(created);
    logger.info(`imported ${created.length} targets, skipped ${skipped.length}`);

    res.status(created.length ? 201 : 200).json(
      ok({ imported: created.length, skipped, targets: created }),
    );
  }),
);

/** Preview an import without writing anything. */
app.post(
  '/targets/import/preview',
  route(async (req, res) => {
    const { format = 'json', content = '' } = req.body ?? {};
    const rows = format === 'csv' ? parseDelimited(String(content)) : parseJsonArray(String(content));

    const preview = rows.slice(0, 25).map((row, index) => {
      try {
        const normalised = normaliseImportRow(row, createId);
        return { row: index + 1, ok: Boolean(normalised.name), data: normalised, reason: normalised.name ? '' : 'No name in this row' };
      } catch (error) {
        return { row: index + 1, ok: false, data: null, reason: error instanceof Error ? error.message : 'Unreadable row' };
      }
    });

    res.json(ok({ total: rows.length, preview }));
  }),
);

/**
 * @param {string} content
 * @returns {unknown[]}
 */
function parseJsonArray(content) {
  const trimmed = content.trim();
  if (!trimmed) return [];

  let parsed;
  try {
    parsed = JSON.parse(trimmed);
  } catch (error) {
    throw new AppError(`That is not valid JSON: ${error instanceof Error ? error.message : 'parse failed'}`, 422);
  }

  if (Array.isArray(parsed)) return parsed;
  if (parsed && typeof parsed === 'object') return [parsed];
  throw new AppError('Expected a JSON array of targets.', 422);
}

/**
 * Minimal CSV/TSV reader with quoted-field support. Written by hand rather than
 * pulled in as a dependency: the input is a pasted contact list, not arbitrary
 * RFC 4180, and one fewer dependency is one fewer thing to keep patched.
 * @param {string} content
 * @returns {Record<string, string>[]}
 */
function parseDelimited(content) {
  const text = content.replace(/\r\n?/g, '\n').trim();
  if (!text) return [];

  const firstLine = text.slice(0, text.indexOf('\n') === -1 ? text.length : text.indexOf('\n'));
  const delimiter = firstLine.includes('\t') ? '\t' : ',';

  /** @type {string[][]} */
  const rows = [];
  /** @type {string[]} */
  let row = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];

    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === delimiter) {
      row.push(field.trim());
      field = '';
    } else if (char === '\n') {
      row.push(field.trim());
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += char;
    }
  }

  row.push(field.trim());
  rows.push(row);

  const [header, ...body] = rows.filter((r) => r.some((cell) => cell !== ''));
  if (!header) return [];

  const keys = header.map((h) => h.trim().toLowerCase().replace(/\s+/g, '_'));

  return body.map((cells) => {
    /** @type {Record<string, string>} */
    const record = {};
    keys.forEach((key, index) => {
      if (key) record[key] = cells[index] ?? '';
    });
    return record;
  });
}

/**
 * @param {Record<string, unknown>} source
 */
function stripEmpty(source) {
  return Object.fromEntries(
    Object.entries(source ?? {}).filter(([, value]) => value !== undefined && value !== '' && value !== null),
  );
}

finaliseService(app, logger);
listen(app, process.env.TARGETS_PORT ?? 4002, logger);
