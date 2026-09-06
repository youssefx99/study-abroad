import { mkdir, readFile, writeFile, rename, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * A small JSON document store behind a repository interface.
 *
 * Each service owns its own collections, so two processes never write the same
 * file. Swapping this for Postgres or Mongo means implementing the same five
 * methods — nothing above this layer knows where records live.
 */

/**
 * Anchored to the repository root, not to the current working directory.
 *
 * Each service is launched from its own folder, so a relative `./data` would
 * give every service a private store and they would silently stop seeing each
 * other's records. `FLOW_DATA_DIR` overrides this for split deployments where
 * the packages are not siblings of the data directory.
 */
const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const DATA_DIR = process.env.FLOW_DATA_DIR
  ? path.resolve(process.env.FLOW_DATA_DIR)
  : path.join(PACKAGE_ROOT, 'data');

/**
 * Serialises writes per file. Without this, two overlapping requests can each
 * read the same array and the second write silently discards the first.
 * @type {Map<string, Promise<unknown>>}
 */
const writeChains = new Map();

/**
 * @param {string} file
 * @param {() => Promise<unknown>} task
 */
function enqueue(file, task) {
  const previous = writeChains.get(file) ?? Promise.resolve();
  const next = previous.then(task, task);
  writeChains.set(
    file,
    next.catch(() => undefined),
  );
  return next;
}

/**
 * Writes through a temp file so a crash mid-write cannot truncate the store.
 * @param {string} file
 * @param {unknown} data
 */
async function atomicWrite(file, data) {
  await mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  await writeFile(temp, JSON.stringify(data, null, 2), 'utf-8');

  try {
    await rename(temp, file);
  } catch (error) {
    // Windows can refuse a rename onto an open handle; fall back to a direct
    // write rather than leaving the temp file behind and losing the update.
    await writeFile(file, JSON.stringify(data, null, 2), 'utf-8');
    await unlink(temp).catch(() => undefined);
    if (process.env.LOG_LEVEL === 'debug') {
      process.stderr.write(`[store] rename fallback for ${path.basename(file)}: ${String(error)}\n`);
    }
  }
}

/**
 * @template T
 */
export class JsonRepository {
  /**
   * @param {string} collection File name without extension.
   * @param {{ seed?: T[], idField?: string }} [options]
   */
  constructor(collection, options = {}) {
    this.collection = collection;
    this.file = path.join(DATA_DIR, `${collection}.json`);
    this.idField = options.idField ?? 'id';
    this.seed = options.seed ?? [];
  }

  /** @returns {Promise<T[]>} */
  async readAll() {
    if (!existsSync(this.file)) {
      await atomicWrite(this.file, this.seed);
      return structuredClone(this.seed);
    }

    try {
      const raw = await readFile(this.file, 'utf-8');
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      throw new Error(`The ${this.collection} store is unreadable: ${error instanceof Error ? error.message : 'unknown error'}`);
    }
  }

  /**
   * @param {Record<string, unknown>} [filters]
   * @returns {Promise<T[]>}
   */
  async findAll(filters) {
    const rows = await this.readAll();
    if (!filters) return rows;

    const entries = Object.entries(filters).filter(([, value]) => value !== undefined && value !== '');
    if (!entries.length) return rows;

    return rows.filter((row) =>
      entries.every(([key, value]) => {
        const actual = /** @type {Record<string, unknown>} */ (row)[key];
        if (Array.isArray(actual)) return actual.includes(value);
        return String(actual ?? '') === String(value);
      }),
    );
  }

  /**
   * @param {string} id
   * @returns {Promise<T | null>}
   */
  async findById(id) {
    const rows = await this.readAll();
    return rows.find((row) => /** @type {Record<string, unknown>} */ (row)[this.idField] === id) ?? null;
  }

  /**
   * @param {(row: T) => boolean} predicate
   * @returns {Promise<T | null>}
   */
  async findOne(predicate) {
    const rows = await this.readAll();
    return rows.find(predicate) ?? null;
  }

  /**
   * @param {T} record
   * @returns {Promise<T>}
   */
  async create(record) {
    return /** @type {Promise<T>} */ (
      enqueue(this.file, async () => {
        const rows = await this.readAll();
        const next = [...rows, record];
        await atomicWrite(this.file, next);
        return record;
      })
    );
  }

  /**
   * @param {T[]} records
   * @returns {Promise<T[]>}
   */
  async createMany(records) {
    return /** @type {Promise<T[]>} */ (
      enqueue(this.file, async () => {
        const rows = await this.readAll();
        await atomicWrite(this.file, [...rows, ...records]);
        return records;
      })
    );
  }

  /**
   * Applies an immutable updater to one record.
   * @param {string} id
   * @param {(current: T) => T} updater
   * @returns {Promise<T | null>}
   */
  async update(id, updater) {
    return /** @type {Promise<T | null>} */ (
      enqueue(this.file, async () => {
        const rows = await this.readAll();
        const index = rows.findIndex((row) => /** @type {Record<string, unknown>} */ (row)[this.idField] === id);
        if (index === -1) return null;

        const updated = updater(rows[index]);
        const next = [...rows.slice(0, index), updated, ...rows.slice(index + 1)];
        await atomicWrite(this.file, next);
        return updated;
      })
    );
  }

  /**
   * @param {string} id
   * @returns {Promise<boolean>}
   */
  async delete(id) {
    return /** @type {Promise<boolean>} */ (
      enqueue(this.file, async () => {
        const rows = await this.readAll();
        const next = rows.filter((row) => /** @type {Record<string, unknown>} */ (row)[this.idField] !== id);
        if (next.length === rows.length) return false;
        await atomicWrite(this.file, next);
        return true;
      })
    );
  }

  /**
   * @param {string[]} ids
   * @returns {Promise<number>}
   */
  async deleteMany(ids) {
    return /** @type {Promise<number>} */ (
      enqueue(this.file, async () => {
        const rows = await this.readAll();
        const next = rows.filter((row) => !ids.includes(String(/** @type {Record<string, unknown>} */ (row)[this.idField])));
        await atomicWrite(this.file, next);
        return rows.length - next.length;
      })
    );
  }

  /** Replaces the whole collection. Used by seeding and reset. */
  async replaceAll(records) {
    return enqueue(this.file, async () => {
      await atomicWrite(this.file, records);
      return records;
    });
  }

  async count() {
    const rows = await this.readAll();
    return rows.length;
  }
}

/**
 * Single-document store for things there is exactly one of, like settings.
 * @template T
 */
export class JsonDocument {
  /**
   * @param {string} name
   * @param {T} defaults
   */
  constructor(name, defaults) {
    this.name = name;
    this.file = path.join(DATA_DIR, `${name}.json`);
    this.defaults = defaults;
  }

  /** @returns {Promise<T>} */
  async read() {
    if (!existsSync(this.file)) {
      await atomicWrite(this.file, this.defaults);
      return structuredClone(this.defaults);
    }

    try {
      const raw = await readFile(this.file, 'utf-8');
      return { ...this.defaults, ...JSON.parse(raw) };
    } catch {
      return structuredClone(this.defaults);
    }
  }

  /**
   * @param {(current: T) => T} updater
   * @returns {Promise<T>}
   */
  async update(updater) {
    return /** @type {Promise<T>} */ (
      enqueue(this.file, async () => {
        const current = await this.read();
        const next = updater(current);
        await atomicWrite(this.file, next);
        return next;
      })
    );
  }
}

export { DATA_DIR };
