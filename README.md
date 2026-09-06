# Flow

**Study-abroad outreach, automated end to end.**

You have a list of professors, programmes, and scholarships. Each one needs to be researched, judged for fit, and written to individually. Doing that well takes about an hour per target, so most people either send forty identical emails or give up after five.

Flow does the process, not the decision. It researches each target, tells you honestly whether the fit is real, and drafts a message you edit and send yourself.

It is built for applicants **anywhere, in any field**. Nothing in it assumes a country, a discipline, a grading system, or a degree structure — and the prompts that drive it are yours to rewrite.

---

## What it does

```
Your profile  ──┐
                ├──►  Research  ──►  Fit analysis  ──►  Draft  ──►  Review  ──►  You edit and send
Your targets  ──┘     (web)         (honest score)     (any lang)   (verify)
```

- **Research** every target from public sources, with a hard rule against inventing anything.
- **Score the fit** honestly. A "weak" verdict saves you from a message that costs you a reputation.
- **Draft** in the language and tone the target expects, using only facts the earlier steps verified.
- **Review** the draft, strip filler and unverifiable claims, and list what you still need to check yourself.

Every message comes with the factual claims it made about the target, so you can verify before your name is attached to them.

---

## Quick start

```bash
git clone https://github.com/youssefx99/study-abroad.git
cd study-abroad

npm install
cp .env.example .env      # optional — see "Running without a key" below
npm run seed              # loads a worked example spanning three countries
npm run dev
```

Open **http://localhost:3000**.

That starts eight backend services and the web app in one terminal. Stop everything with `Ctrl+C`.

### Running without a key

Flow works fully with no API key. Every stage returns representative, correctly structured output instead of calling a model, and says so on every screen. You can click through the entire product, run pipelines, and read results before spending anything.

To run for real, add an OpenAI key under **Settings → API key**, or put it in `.env`:

```
OPENAI_API_KEY=sk-...
```

The key is written to `data/secrets.json` (gitignored), read from disk by the services that need it, and **never** returned by any endpoint or sent between services.

---

## Built to be flexible

This is the part that matters, so it is worth being specific.

| What varies | How Flow handles it |
|---|---|
| **Country** | Nothing is US-centric. Grades are a value plus a free-text scale, so `4.42 / 5.0 GPA`, `First Class`, `1.3 German`, and `16/20` all fit. |
| **Field** | No prompt names a discipline. A law applicant in Nairobi and a physics applicant in Seoul use the same library. |
| **Who you write to** | Professors, degree programmes, admissions offices, scholarships, labs, and companies are one entity with one process. |
| **Language** | Drafts are written in any language, per run or per target. Tone presets map to regional convention. |
| **Tests and qualifications** | Test names are free text. IELTS, TestDaF, JLPT, HSK, and a national exam nobody on this repo has heard of all work. |
| **What the system asks the model** | Every prompt is editable, versioned, testable, and restorable in the UI. |
| **The order of the steps** | Pipelines are user-defined. Add, remove, reorder, disable, or mark steps optional. |
| **Anything else** | Applicants and targets both carry user-defined custom fields, and prompts can read them. |

If something still does not fit your situation, the fix is an edit in the **Prompts** screen, not a pull request.

---

## The screens

| Screen | What it is for |
|---|---|
| **Dashboard** | Where everything stands, and one clear next action. |
| **Applicants** | The person applying. A weighted completeness score shows what would most improve your drafts, and a preview shows the exact text the model reads. |
| **Targets** | A filterable ledger. Add one at a time, or paste a JSON array or spreadsheet export — the importer previews rows and reports problems per row instead of rejecting the file. |
| **Prompts** | Read and rewrite what the system asks the model. Publish versions, roll back, and render against real records without spending a token. |
| **Pipelines** | The order the steps run in, and what each one feeds the next. |
| **Runs** | A five-step wizard, then a live console that streams progress as it happens. Drafts are editable in place. |
| **Settings** | API key, per-stage models, run defaults, theme, and service health. |

---

## Architecture

Eight services behind one gateway. See [ARCHITECTURE.md](ARCHITECTURE.md) for the reasoning.

| Service | Port | Owns |
|---|---|---|
| `gateway` | 4000 | Single browser-facing origin, health aggregation, SSE relay |
| `profiles` | 4001 | Applicants, completeness scoring, prompt blocks |
| `targets` | 4002 | Targets, filtering facets, bulk import |
| `prompts` | 4003 | Prompt library, versions, pipelines |
| `research` | 4004 | Web research stage |
| `analysis` | 4005 | Fit analysis and custom steps |
| `outreach` | 4006 | Drafting and review |
| `orchestrator` | 4007 | Runs, live streaming, settings, secrets |

Frontend: Next.js 16, React 19, Tailwind v4, Radix primitives.
Backend: Node 20+, Express 5, Zod, plain-JSON storage behind a repository interface.

Storage is JSON files under `data/`. Nothing is uploaded anywhere except the model calls you trigger yourself. Swapping in Postgres means implementing five methods in `packages/store`.

---

## Commands

```bash
npm run dev            # everything, one terminal
npm run dev:services   # backend only
npm run dev:web        # frontend only
npm run build          # production build of the web app
npm run seed           # fill empty collections with the example
npm run reset          # wipe and re-seed (keeps your API key)
npm run typecheck      # tsc --noEmit
```

Per-service ports and models are configurable in `.env` — see `.env.example`.

---

## Writing your own prompt

Prompts are records, not code. Open **Prompts**, pick one, and edit. Variables use `{{double braces}}`:

```
APPLICANT
{{applicant.block}}

TARGET
{{target.block}}

RESEARCH FINDINGS
{{steps.research}}

Write in {{options.language}}, in a {{options.tone}} tone, about {{options.wordCount}} words.
```

The **Test** tab renders your unsaved edits against real records and tells you which variables resolved to nothing — the cheapest possible way to catch a typo before it costs you forty emails.

Publishing creates a new version. The old one is kept, so a run that already happened stays explainable.

---

## Honesty by design

A tool that writes on your behalf can do real damage if it invents things. Flow is built so it cannot, quietly:

- Prompts are instructed to report what they **could not** verify, and to leave gaps visible rather than filling them.
- The fit analysis must produce at least one concern, even when the score is high.
- Drafts list every factual claim they made about the target, for you to check.
- Demo output says it is demo output, in every field, on every screen.
- Prompt variables that resolve to nothing raise a visible warning on the step, instead of silently producing a thinner message.

Read every draft before you send it. The system is a first draft, not a delegate.

---

## License

MIT
