# Assessment Studio

A local, single-user AI-native form and assessment creation prototype. The React form editor and conversational agent share one persistent form model. AI generation uses the configured OpenAI-compatible API; the running application does not simulate model responses.

## Quick start (Windows, macOS, Linux)

Requires Node.js 22.12+ (Node 24 LTS recommended) and npm. Extract this archive, open a terminal in `assessment-studio`, and run:

```bash
npm install
npm run dev
```

Open **http://127.0.0.1:5173**. The backend starts at **http://127.0.0.1:3001**, and Vite proxies `/api` to it. Both servers bind to localhost. Press Ctrl+C to stop both. If either port is already in use, free it before restarting. No database or environment file is needed.

The project can also be installed with `pnpm install`; the root command `npm run dev` still works. No lockfile was generated during packaging because dependency installation was blocked by the build environment's network restrictions.

## Configure AI

1. Open **Settings**.
2. Edit the base URL and model ID, or keep the defaults.
3. Enter your API key and click **Save settings**.
4. Click **Test connection**. This issues a real chat-completion request and may incur a small provider charge.

| Setting | Default |
| --- | --- |
| API base URL | `https://api.openai.com/v1` |
| Model ID | `gpt-6.2-sol` |
| API key | Empty |

The default `gpt-6.2-sol` is a requested alias, not a verified public OpenAI model ID. If your provider rejects it, enter the exact supported ID. The application does not substitute another model. Use the API root, not the full `/chat/completions` endpoint. HTTPS is recommended; HTTP is allowed for trusted local/private providers, but sends the credential and content without transport encryption. A custom provider must implement OpenAI-style Chat Completions with a textual assistant response.

Settings are saved in `.data/settings.json` on the backend. The key is never returned through the settings API or put in browser storage. Changing the provider origin requires re-entering or explicitly clearing a saved key. Keys are stored as plaintext with restricted filesystem permissions where supported; this is a local development prototype, not a production secrets vault. Do not expose it to a network or commit `.data`.

## Use the workspace

- Create an assessment or survey from the dashboard. Select an existing form to open the editor and AI sidebar.
- Edit the title, description, questions, options, correct answers and marks. Reorder with the up/down buttons. Changes autosave after a short delay.
- In the right sidebar, enter an instruction such as “Create 10 questions on TypeScript fundamentals.” Attach a PDF, DOCX, TXT, Markdown, CSV or JSON reference before sending, if desired.
- The backend extracts the reference text, loads the current form and recent context, requests a structured model response, validates it, saves it, and streams actual operation stages to the UI.
- Ask for follow-up modifications, such as “Assign two marks to each question” or “Add five scenario-based questions.” Review generated answers for correctness.
- Switch to **Preview** to view and interact with the respondent experience. Preview answers are not collected or published.

Uploads: at most three files of 10 MiB each per message. Extracted content is limited to 250,000 characters per file for local persistence; at most 30,000 characters per reference and 75,000 total reference characters are included in a request. Recent history is also bounded. When text is omitted from model context, an activity notice is shown. Scanned PDFs without extractable text are rejected; OCR is not included. Uploaded binaries are held in memory during processing and discarded. The model provider receives the current form, bounded conversation history and extracted reference content. Use only documents you are permitted to send to that provider.

## Architecture

The repository at https://github.com/raghava-indra-kj/react-foundation was inspected through its GitHub file interface. This standalone archive adapts its `src/ui`, `src/infra`, routing, TanStack Query provider, Vite/Tailwind setup, alias and formatting conventions. It is a reconstructed scaffold, not a full Git clone: the runtime could not download the repository or install its original locked dependency tree. Unused foundation utilities were not copied. The manifest uses compatible dependency ranges targeting Node 22+.

```text
src/
  main.tsx
  infra/api/api-client.ts
  ui/app-routes.tsx
  ui/query/query-client.ts
  ui/features/forms/       Dashboard, editor, preview, agent panel
  ui/features/settings/    Provider settings dialog
  ui/styles/globals.css
server/
  index.ts                 Local API server
  app.ts                   Express routes and streaming
  prompts/assessment-agent.ts
  services/                OpenAI, extraction, persistence, agent, locks
shared/
  types.ts                 Public contracts
  schemas.ts               Zod validation
  domain.ts                Domain invariants and change summaries
tests/
  core.test.ts             Offline unit and streaming tests
  api.test.ts              HTTP integration tests with test-only model double
  provider.test.ts         SDK integration against local compatible test server
```

Local storage deliberately uses only two files:

```text
.data/
  settings.json
  forms.json
```

The `forms.json` file contains form records, conversations, and separate private reference-text fields. Reference text is not exposed by the form detail endpoint. A single atomic file replacement commits a form and its conversation together; this avoids cross-file transaction failures. Writes are serialized, and a per-form lock prevents overlapping edits, deletion and generation. Invalid agent output leaves the form unchanged. The prototype is intended for one server process on one machine. Deleting a form deletes its conversation and reference text too.

## Backend API

Base URL: `http://127.0.0.1:3001/api`.

| Method | Path | Request | Response |
| --- | --- | --- | --- |
| GET | `/health` | — | `{status: "ok"}` |
| GET | `/settings` | — | `{baseUrl, model, hasApiKey}` |
| PUT | `/settings` | `{baseUrl, model, apiKey?}` | Safe settings |
| POST | `/settings/test` | — | `{success, message, model}` |
| GET | `/forms` | — | `{forms: FormSummary[]}` |
| POST | `/forms` | `{title, type}` | Form (201) |
| GET | `/forms/:formId` | — | `{form, messages}` |
| PUT | `/forms/:formId` | `FormContent` | Updated Form |
| DELETE | `/forms/:formId` | — | 204 No Content |
| POST | `/forms/:formId/agent` | Multipart `message`, optional repeated `files` | SSE |

`FormContent` has `title`, `description`, `type` (`form` or `assessment`), and `questions`. Question types are `singleChoice`, `multipleChoice` (multiple select), `trueFalse`, `shortAnswer`, and `longAnswer`. See `shared/types.ts` and `shared/schemas.ts` for the exact contract. Choice answer values reference option IDs; surveys have zero marks and no correct answers. Server-generated metadata includes form IDs and timestamps.

Agent stream events:

```text
event: activity
data: {"message":"Preparing form context"}

event: formUpdated
data: {"form":{...}}

event: message
data: {"message":{...}}

event: done
data: {"success":true}
```

`formUpdated` is emitted only after a validated mutation is saved. The `message` event contains the persisted `ChatMessage`. On a stream failure, an `error` event has `{code, message}` and the stream closes without `done`. Normal HTTP errors use `{error:{code,message}}`. The frontend handles cancellation with `AbortController`; if cancellation occurs during a committed save, reopening the form reconciles the persisted state. An unsuccessful request is not appended to persistent conversation history.

## Verification

```bash
npm run test:core    # Runs without installing third-party dependencies (Node 22+)
npm test             # All unit, API and SDK integration tests; requires npm install
npm run typecheck    # Complete TypeScript typecheck; requires npm install
npm run build        # Typecheck and Vite production build; requires npm install
npm run format       # Optional formatting pass
```

The API and SDK integration tests use test-only doubles/local endpoints and do not need a paid API key. A real external provider connection must be tested separately using Settings and your own credentials.

**Packaging verification:** 10 core tests passed in Node 22.16.0, covering credential handling, model JSON parsing, question invariants, change summaries, storage persistence, concurrent writes, lock behavior, bounded document context, text/JSON extraction, and SSE parsing. All TypeScript/TSX source files were transpiled for syntax diagnostics. The dependency-free domain/storage/context modules also passed a strict TypeScript check. The environment could not resolve `registry.npmjs.org` (`EAI_AGAIN`); full dependency installation, full typecheck, Vite build, running the real browser application, Express/SDK integration tests, PDF/DOCX runtime extraction and live provider verification were therefore not completed here. Run the above commands on a network-enabled machine to complete verification.

## Scope

No auth, database server, publishing, respondent submissions, proctoring, analytics, multi-agent framework, embeddings, background jobs or cloud deployment. This is a local authoring prototype, not a public service.
