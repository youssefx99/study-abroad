import 'dotenv/config';
import { createService, finaliseService, listen, route, httpJson, httpStream } from '@flow/service-kit';
import {
  ok,
  fail,
  serviceUrl,
  SERVICE_REGISTRY,
  getErrorMessage,
  UpstreamError,
  DEGREE_LEVELS,
  TARGET_KINDS,
  TARGET_STATUSES,
  FUNDING_NEEDS,
  OUTREACH_LANGUAGES,
  OUTREACH_TONES,
  GRADE_SCALE_SUGGESTIONS,
  TEST_SUGGESTIONS,
  LANGUAGE_LEVELS,
  STAGES,
  MODEL_SUGGESTIONS,
  REASONING_EFFORTS,
} from '@flow/shared';

/**
 * API gateway.
 *
 * The browser talks to exactly one origin. Everything behind it can move,
 * scale, or be replaced without the web app knowing. It also serves the
 * vocabulary the UI renders its dropdowns from, so adding a language or a
 * target kind is a change in one shared file rather than in both a service and
 * a component.
 */

const { app, logger } = createService({ name: 'gateway' });

/** Which service owns which path prefix. */
const ROUTES = [
  { prefix: '/api/profiles', service: 'profiles', rewrite: (p) => p.replace('/api', '') },
  { prefix: '/api/targets', service: 'targets', rewrite: (p) => p.replace('/api', '') },
  { prefix: '/api/prompts', service: 'prompts', rewrite: (p) => p.replace('/api', '') },
  { prefix: '/api/pipelines', service: 'prompts', rewrite: (p) => p.replace('/api', '') },
  { prefix: '/api/runs', service: 'orchestrator', rewrite: (p) => p.replace('/api', '') },
  { prefix: '/api/settings', service: 'orchestrator', rewrite: (p) => p.replace('/api', '') },
  { prefix: '/api/overview', service: 'orchestrator', rewrite: (p) => p.replace('/api', '') },
];

/**
 * Static vocabulary for the UI. Served from the gateway so a browser fetch of
 * `/api/meta` is all a fresh page needs to render every picker.
 */
app.get('/api/meta', (_req, res) => {
  res.json(
    ok({
      degreeLevels: DEGREE_LEVELS,
      targetKinds: TARGET_KINDS,
      targetStatuses: TARGET_STATUSES,
      fundingNeeds: FUNDING_NEEDS,
      languages: OUTREACH_LANGUAGES,
      tones: OUTREACH_TONES,
      gradeScales: GRADE_SCALE_SUGGESTIONS,
      tests: TEST_SUGGESTIONS,
      languageLevels: LANGUAGE_LEVELS,
      stages: STAGES,
      models: MODEL_SUGGESTIONS,
      reasoningEfforts: REASONING_EFFORTS,
    }),
  );
});

/**
 * Aggregate health. The UI shows this in the header so a stopped service is
 * visible immediately rather than as a failed request halfway through a form.
 */
app.get(
  '/api/health',
  route(async (_req, res) => {
    const names = Object.keys(SERVICE_REGISTRY).filter((name) => name !== 'gateway');

    const results = await Promise.all(
      names.map(async (name) => {
        const started = Date.now();
        try {
          const response = await httpJson(`${serviceUrl(name)}/health`, {
            serviceName: name,
            timeoutMs: 3000,
            retries: 0,
          });
          return {
            service: name,
            label: SERVICE_REGISTRY[name].label,
            status: response?.success ? 'ok' : 'degraded',
            latencyMs: Date.now() - started,
            url: serviceUrl(name),
          };
        } catch (error) {
          return {
            service: name,
            label: SERVICE_REGISTRY[name].label,
            status: 'down',
            latencyMs: Date.now() - started,
            url: serviceUrl(name),
            error: getErrorMessage(error),
          };
        }
      }),
    );

    const down = results.filter((r) => r.status !== 'ok');

    res.json(
      ok({
        status: down.length === 0 ? 'ok' : down.length === results.length ? 'down' : 'degraded',
        gateway: { service: 'gateway', label: 'Gateway', status: 'ok', latencyMs: 0 },
        services: results,
        checkedAt: new Date().toISOString(),
      }),
    );
  }),
);

/**
 * Live run progress. Streams cannot go through the JSON proxy below, because
 * that buffers the whole body before responding.
 */
app.get(
  '/api/runs/:id/stream',
  route(async (req, res) => {
    const controller = new AbortController();
    req.on('close', () => controller.abort());

    await httpStream(`${serviceUrl('orchestrator')}/runs/${req.params.id}/stream`, res, {
      signal: controller.signal,
      serviceName: 'orchestrator',
    });
  }),
);

/** Generic JSON proxy for everything else. */
for (const { prefix, service, rewrite } of ROUTES) {
  // The optional group matches the prefix itself and everything beneath it.
  app.all(
    `${prefix}{/*path}`,
    route(async (req, res) => {
      const target = `${serviceUrl(service)}${rewrite(req.path)}`;
      const query = new URL(req.originalUrl, 'http://localhost').search;

      try {
        const response = await httpJson(`${target}${query}`, {
          method: req.method,
          body: ['GET', 'HEAD', 'DELETE'].includes(req.method) ? undefined : (req.body ?? {}),
          serviceName: service,
          // Creating a run fans out to three services before it answers.
          timeoutMs: 60_000,
          retries: req.method === 'GET' ? 2 : 0,
        });

        // Upstream non-2xx already threw, so anything here succeeded. The
        // envelope carries the outcome, so a flat 200 keeps the client simple.
        res.status(200).json(response);
      } catch (error) {
        // A transport failure means the service is down or unreachable, which
        // is an operational problem the user can act on. Everything else is the
        // service answering, and its message and details pass through verbatim
        // so per-field validation errors reach the form that raised them.
        if (error instanceof UpstreamError) {
          logger.warn(`${service} unreachable for ${req.method} ${req.path}: ${error.message}`);
          res.status(503).json(
            fail(
              `The ${SERVICE_REGISTRY[service].label} service is not responding. Check that it is running, then try again.`,
              { service, hint: `Expected at ${serviceUrl(service)}` },
            ),
          );
          return;
        }

        const status = /** @type {{ status?: number }} */ (error)?.status ?? 502;
        const details = /** @type {{ details?: Record<string, unknown> }} */ (error)?.details;
        res.status(status).json(fail(getErrorMessage(error), { ...details, service }));
      }
    }),
  );
}

app.get('/', (_req, res) => {
  res.json(
    ok({
      name: 'Flow API gateway',
      docs: '/api/health for service status, /api/meta for UI vocabulary',
      services: Object.keys(SERVICE_REGISTRY),
    }),
  );
});

finaliseService(app, logger);
listen(app, process.env.GATEWAY_PORT ?? 4000, logger);
