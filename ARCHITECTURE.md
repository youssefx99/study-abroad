# Architecture

Why Flow is shaped the way it is, and where to change things.

---

## The one idea

**Nothing about a country, a discipline, or a degree system is in the code.**

All of it lives in data the user owns: their profile, their targets, and — critically — the prompts. Making the system work for a situation the authors never imagined is an edit in the UI, not a release.

Everything below follows from that.

---

## Services

Eight processes behind one gateway.

```
                     browser
                        │
                        ▼
                 ┌─────────────┐
                 │   gateway   │  :4000   one origin, health, SSE relay
                 └──────┬──────┘
        ┌───────┬───────┼────────┬─────────────┐
        ▼       ▼       ▼        ▼             ▼
   ┌────────┐┌───────┐┌───────┐┌──────────────────┐
   │profiles││targets││prompts││   orchestrator   │ :4007
   │ :4001  ││ :4002 ││ :4003 ││  runs, settings  │
   └────────┘└───────┘└───────┘└────────┬─────────┘
                                        │  POST /execute
                          ┌─────────────┼─────────────┐
                          ▼             ▼             ▼
                    ┌──────────┐ ┌──────────┐ ┌──────────┐
                    │ research │ │ analysis │ │ outreach │
                    │  :4004   │ │  :4005   │ │  :4006   │
                    └──────────┘ └──────────┘ └──────────┘
```

### Why these boundaries

The split follows how the work actually behaves, not a diagram:

- **Research** is slow, network-bound, and unpredictable — a web-search call can take minutes. On its own process, a queue of slow research never blocks drafting.
- **Analysis** is fast, cheap, and pure reasoning. It also executes user-defined custom steps, since those are arbitrary reasoning over accumulated context.
- **Outreach** is the only stage whose output a person reads and sends, so it defaults to the strongest writing model and scales on a different axis from the others.
- **Profiles, targets, prompts** are CRUD with different consistency needs and different owners.
- **Orchestrator** holds the only stateful thing in the system: a run in flight.

The three stage services share one contract — `POST /execute` — and one implementation in `packages/llm/src/executor.js`. They are separate deployables with identical mechanics, which is what lets a pipeline step name any of them.

### What each service owns

Ownership is strict: one writer per collection, so two processes never contend for a file.

| Service | Writes | Reads |
|---|---|---|
| `profiles` | `profiles.json` | — |
| `targets` | `targets.json` | — |
| `prompts` | `prompts.json`, `pipelines.json` | — |
| `orchestrator` | `runs.json`, `settings.json`, `secrets.json` | via HTTP |
| `research` / `analysis` / `outreach` | nothing | `secrets.json` |

The stage services are stateless. Every `/execute` request carries the prompt text, the config, and the context, so they can scale horizontally without touching storage.

---

## Packages

| Package | Responsibility |
|---|---|
| `@flow/shared` | Zod schemas, the response envelope, error types, and the vocabulary every service and the UI agree on |
| `@flow/store` | `JsonRepository` and `JsonDocument` — the repository interface |
| `@flow/service-kit` | Express app factory, logger, error handler, retrying HTTP client |
| `@flow/llm` | OpenAI wrapper, the demo engine, secret resolution, the executor factory |

### The shared vocabulary matters

`packages/shared/src/constants.js` is the only place lists like target kinds, languages, and tones are defined. The gateway serves them at `/api/meta`, and the UI builds every dropdown from that. Adding a language is a one-line change in one file.

`profileToPromptBlock` and `targetToPromptBlock` also live in shared, so research, analysis, and outreach describe the applicant identically. Without that, the three stages could frame the same person differently and the model would receive contradictory context between steps.

---

## How a run works

1. `POST /api/runs` reaches the orchestrator.
2. It loads the profile, resolves the pipeline into a **plan** (one call to `prompts`, returning every step with its prompt text, model config, and output schema inline), and loads the targets.
3. The run record is created and returned **immediately**. The browser navigates to the live console rather than holding a request open for the length of the run.
4. A bounded worker pool walks the targets at the configured concurrency.
5. For each target, steps run in order. Each step's output is written into `context.steps[key]`, so later prompts can read `{{steps.research}}`.
6. Every step transition is persisted and emitted to an in-process event bus.
7. `GET /runs/:id/stream` sends a snapshot first, then live frames. The gateway relays the stream without buffering.

### Failure policy

Per-target, not per-run. One professor with a dead website must not cost the other thirty-nine drafts. A target that throws is recorded and the pool moves on.

The exception: after `stopAfterFailures` consecutive target failures (default 5), the run halts. That pattern means a bad key, an unreachable model, or a network problem — not bad data — and continuing would burn tokens on a guaranteed failure.

Steps marked **optional** fail into a warning. Later steps still receive everything the required steps produced.

### Live progress

Server-sent events, not WebSockets. The traffic is one-directional, SSE reconnects on its own, and it survives proxies that mangle upgrades. A snapshot goes out on connect so a browser opened halfway through renders the current state instead of an empty console.

---

## Prompts as data

A prompt is a record with a version history:

```
prompt
├── key            stable reference used by pipeline steps
├── stage          decides which service executes it
├── activeVersion  which version runs
└── versions[]
    ├── systemPrompt / userPrompt   with {{variables}}
    ├── config                      model, temperature, reasoning, web search
    └── outputSchema                JSON Schema enforced on the response
```

**Publishing never overwrites.** Editing a prompt that produced a run and losing the text that produced it would make those results unexplainable. Rolling back is one click; built-ins can be restored to what they shipped as.

Templates render through `renderTemplate` in `packages/shared/src/schemas/prompt.js`. Missing variables are **reported, not silently blanked** — a prompt that quietly loses the applicant's research statement produces a plausible but useless email, which is far worse than a visible error. The run records them and the UI shows a warning on the step.

---

## The demo engine

When no API key is configured, `packages/llm/src/demo.js` synthesises output that matches the prompt's own JSON schema, shaped by field names and the real target's details.

It exists for three reasons:

1. The product is explorable end to end before anyone spends a token.
2. A broken or missing key never leaves the interface showing empty panels.
3. Every screen, pipeline, and export can be exercised in development without a bill.

Every string it produces says it is demo output. Nothing here pretends to be research.

---

## Storage

JSON files behind a repository interface. Writes are serialised per file and go through a temp file plus rename, so an interrupted write cannot truncate a store. On Windows, where a rename onto an open handle can fail, it falls back to a direct write rather than leaving a temp file behind.

The data directory is anchored to the **repository root**, not the current working directory. Each service is launched from its own folder, so a relative `./data` would give every service a private store and they would silently stop seeing each other's records. `FLOW_DATA_DIR` overrides this for split deployments.

To move to a real database, implement `findAll`, `findById`, `create`, `update`, and `delete` in `packages/store`. Nothing above that layer knows where records live.

---

## Secrets

The orchestrator is the only writer of `data/secrets.json`. The stage services **read it from disk**.

Passing the key between services in request bodies would put it in every debug log and proxy trace. Reading it locally keeps it out of the wire entirely.

### Why there is no authentication

Flow is a single-user tool holding its own user's data, so a login screen would add friction without adding safety. What actually enforces that assumption is the network boundary, and it has to be right:

- `listen()` binds **127.0.0.1** by default. `listen(port)` with no host binds every interface, which on a shared network hands an unauthenticated stranger every applicant profile, CV, and the ability to spend the owner's model budget.
- CORS is pinned to the web app's origin. A wildcard would let any page open in the user's browser call `localhost:4000` and read or mutate everything — no network exposure required, since the request originates inside the trusted machine.

Neither of these is theoretical: both were live in the first cut of this codebase and were caught by a security review before release. The web app reaches the gateway through a Next.js rewrite, which is a server-side proxy, so restricting CORS costs nothing.

Container deployments set `FLOW_BIND_HOST=0.0.0.0` because containers must bind all interfaces to be reachable on the compose network. There, isolation comes from publishing only the gateway and web ports.

### The key itself

No endpoint ever returns the key. `/api/settings` returns only whether one exists, where it came from, and a masked hint, so a shared screen or a screenshot cannot leak it. An environment key takes priority over a stored one and is marked non-editable in the UI, so a deployment can pin a key the UI cannot overwrite. The stored file is written with owner-only permissions, so the default umask does not leave a plaintext key readable by other local accounts.

---

## Frontend

Next.js App Router. The web app does **not** import from the service packages — it is a client of an HTTP API, and keeping that boundary explicit means a service can change language or move host without the UI noticing. Types are mirrored in `src/lib/types.ts`.

`next.config.mjs` rewrites `/api/*` to the gateway, so the browser sees one origin and CORS, cookies, and SSE all stay simple.

### Design language

A **dossier**, not a card grid. Records sit in ruled rows inside one surface, because forty targets rendered as forty cards look like forty unrelated things. Radius varies by hierarchy (12px surfaces, 8px controls, 6px chips) so a surface, a control, and a chip are visibly different kinds of object.

Colour is carried almost entirely by ink on paper. One accent — a deep teal that reads as *verified* rather than *brand* — is reserved for actions and confirmed states, so when something turns amber or rose it means something.

Three typefaces, three jobs: Bricolage Grotesque for headings, IBM Plex Sans for the interface (chosen for genuine multilingual coverage, since applicants are worldwide), IBM Plex Mono for identifiers and JSON.

**Motion appears in exactly one place**: the live run console, where step rows arrive as work completes. Everything else is a flat 120ms colour transition. Scattering motion across the interface would make the one place it carries meaning stop meaning anything.

Numbered markers appear only where there is a real sequence — the run wizard stepper and pipeline steps. Nowhere else.

---

## Two deployment shapes

The same UI runs against two very different backends, and the switch lives in exactly one place: `apps/web/src/lib/api.ts`.

**Self-hosted** is the eight-service architecture described above.

**Hosted** (`NEXT_PUBLIC_FLOW_MODE=cloud`) has no services at all. Serverless functions cannot hold a run in flight — each invocation is isolated and short-lived, so an orchestrator process and an SSE stream have nothing to live in — and the filesystem is read-only. So:

- `lib/cloud/local-api.ts` serves the gateway's REST surface from browser storage, importing the same schemas and prompt library from `@flow/shared` that the services use. One definition, two consumers.
- `lib/cloud/run-engine.ts` runs the pipeline in the tab that started it, calling `/api/execute` once per step. Progress goes to subscribers directly; there is no stream to reconnect to.
- `app/api/execute/route.ts` is the only server code, and it is stateless.

Because both modes speak the identical REST contract, every screen, form, and error path is exercised by both. Neither can quietly drift.

### Why the key is not on the server

A hosted deployment serves strangers. Storing a key server-side would mean one of two things, both wrong: the operator pays for everyone's runs, or the first visitor's key gets spent by the rest.

So the key belongs to the person making the call. It lives in their browser, travels only on the request that needs it, and `/api/execute` never reads `process.env.OPENAI_API_KEY` — not as a fallback, not as an override. There is no code path to an operator-held key, which is a stronger guarantee than a configuration setting could be.

The tradeoff, stated honestly: the key does cross the wire to this app's own function, over HTTPS, on its way to OpenAI. That is unavoidable, because OpenAI does not permit browser-origin calls, and the function keeps no copy. Anyone unwilling to accept that can self-host, where nothing leaves their machine.

---

## Where to change things

| To change | Edit |
|---|---|
| What the model is asked | The **Prompts** screen. Not the code. |
| The order of steps | The **Pipelines** screen. |
| Add a language, tone, target kind, or degree level | `packages/shared/src/constants.js` |
| Add a field to the applicant or target model | The relevant schema in `packages/shared/src/schemas/`, then the editor tab |
| Swap the database | `packages/store/src/index.js` |
| Add a new stage service | Copy `services/analysis`, change the name and port, add it to `SERVICE_REGISTRY` and the gateway routes |
| Deploy for other people | `vercel --prod`. See the README. |
| Change how results are displayed | `StructuredOutput` in `apps/web/src/components/shared.tsx` derives its layout from the data shape, so a new schema field renders without a code change |
