/**
 * The prompt library moved into @flow/shared so the browser-side build can use
 * the exact same definitions. Re-exported here to keep this service's imports
 * readable.
 */
export { buildDefaultPrompts, buildDefaultPipelines } from '@flow/shared';
