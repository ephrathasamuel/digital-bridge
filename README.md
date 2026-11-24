# Digital Bridge Accessible Onboarding & Career Gateway (`<db-signup>` & `<db-career-gateway>`)

> Open source and maintained by [Ephratha Samuel](https://github.com/ephrathasamuel). Contributions are welcome: see
> [CONTRIBUTING.md](CONTRIBUTING.md).

## Project history and credits
Digital Bridge started as the Track 1 entry of team **johny x** at the Digital Bridge Accessibility Hackathon 2026,
built in the team repository [KaleabBantayehu/digital-bridge-track1](https://github.com/KaleabBantayehu/digital-bridge-track1)
by Kaleab Bantayehu, Ephratha Samuel and teammates. This repository continues that work as an open source project, with
the team's permission and the full commit history, so every original contributor keeps their credit.

## What it does
Digital Bridge provides offline-first, bilingual (English and Amharic) onboarding and a privacy-preserving Career Gateway through Web Components, REST, and LTI 1.3. The same core capabilities work in partner pages, LMS hosts, Android WebViews, and low-connectivity environments.

The project uses native controls, explicit labels, keyboard navigation, visible focus, Shadow DOM focus management, bilingual errors and live regions, 44px targets, 400% reflow, and a high-contrast theme. Support preferences are isolated and never shared without explicit consent.

### 21 October Co-Design Feedback → What We Built

| Barrier heard on 21 October | What we built |
| --- | --- |
| Forms timed out or erased progress | Offline-first drafts persist on the device, with no expiry and resumable SMS links. |
| Learners had no Kebele ID | Inclusive identity routes accept national ID, refugee ID, community documents, or a consented partner voucher; no Kebele ID is mandatory. |
| Fear of disclosing disability to employers | Support preferences are private, stored separately, excluded from normal profiles and applications, and shared only with explicit consent. |
| Speech recognition failed on Ethiopian names | Voice answers remain editable for review, voice-note fallback works offline, and the Fidel helper supports Amharic transliteration. |
| Budget Android phones lacked Amharic TTS | The cascade uses an installed OS voice, then bundled neural Amharic audio, then a synchronized visual caption bar. |
| Job boards broke under screen readers | Jobs use semantic headings and links, keyboard-accessible filters, live result counts, and embedded `schema.org/JobPosting` metadata. |

## The main task we tested
Learners can complete onboarding by keyboard, screen reader, typing, voice with review and edit, Amharic or English, and resume later without losing their draft. The journey also covers inclusive identity verification, SMS resume, Ethiopian dates, private support preferences, job matching, applications, and bilingual recovery from validation errors.

**Yours to answer:**

- **A refugee has no document tonight:** They can continue with the refugee-ID route when available, a community document, or a consented partner voucher; no medical proof or mandatory Kebele ID blocks onboarding.
- **The connection drops on question 7:** The current draft is saved locally on every change and the API client queues patches; the learner reloads or returns later without losing answers.
- **Someone cannot read finishes alone:** One question appears at a time with native controls, keyboard and voice control, Read Aloud, bundled Amharic audio, visual captions, simple words, and editable voice-note review.
- **A partner registers a learner with consent without learning a password:** The partner uses the partner-vouch route with explicit learner consent; the learner receives a session and can resume through the one-time SMS link, with no password disclosed.

## Run it
Node 22.12+ and pnpm (`corepack enable`). The demo pages are static files, so build once and serve `dist/`:

```bash
corepack enable
pnpm install
pnpm build
npx serve apps/web-components/dist -l 5173
```

Then open (Bridge Learning is a made up portal that shows the plug-in on a host site):

| Page | Address |
| --- | --- |
| Learner home (Bridge Learning demo portal) | http://localhost:5173/pages/home.html |
| Sign-up | http://localhost:5173/pages/signup.html (add `?lang=am` for Amharic) |
| My Profile (edit mode) | http://localhost:5173/pages/profile.html |
| Career Gateway + employer form | http://localhost:5173/pages/jobs.html |
| Plain page (no stylesheet) | http://localhost:5173/demo/blank.html |
| All demo pages | http://localhost:5173/ |

The REST API (optional — the widgets work offline without it): `cd apps/api && node dist/main.js`, then
http://localhost:3000/api/v1/health and Swagger UI at http://localhost:3000/api/docs. The first start can take a few
minutes on a slow laptop.

Docker: `docker compose up --build -d` builds and serves the production web bundle on port 5173 and the NestJS API on port 3000.
Verified with `http://127.0.0.1:3000/api/v1/health` returning `200 OK`; use `docker compose down` to stop the containers.

### Help bar for any form (any website)

`db-assist.js` adds an "Accessibility help" button to every form on a page: read a field aloud (name, hint,
required, current answer), answer by voice (the words go into the field to check; nothing is submitted), type Amharic
with English letters, and display options (bigger text, strong focus outline, underlined links, more contrast).
Alt+Shift+H opens it, Esc closes it, settings are remembered per site. Try it on `demo/any-form.html`.

* **On your own site:** `<script src="https://digital-bridge-six.vercel.app/db-assist.js" data-lang="am" defer></script>`.
  Options: `data-lang` (`en`, `am`), `data-api` (your Digital Bridge API for voices), `data-voice`
  (`auto`, `device`, `server`, `custom`), `data-voice-url`, `data-position` (`right`, `left`).
* **On sites you do not own (LinkedIn, job boards):** the browser extension in `apps/extension` (see its README).

### Voices for any language

Read aloud uses the device's voices first. Where the device has none (Amharic on most phones), it asks the API:
`POST /api/v1/voice/speak` with `{"text","lang"}` returns audio. Configure the API with:

* `TTS_PROVIDER=mms` and `HF_TOKEN`: Meta's open source MMS voices (1,100+ languages, model
  `facebook/mms-tts-{iso639-3}`). `TTS_MMS_URL` can point at a self hosted copy instead of Hugging Face.
* `TTS_PROVIDER=custom` and `TTS_URL`: any text to speech service. With `{text}` and `{lang}` in the URL it is a GET
  (for example an OpenTTS or Piper server), otherwise a POST of `{"text","lang"}`. `TTS_AUTH_HEADER` is sent as
  `Authorization`.
* Nothing set: the route answers 501 and the widgets show captions and use device voices.

### Add a language in one tap

English and Amharic are written by people. Afaan Oromoo, Tigrinya, Somali, Kiswahili and Afar can be added by machine
translation, then fixed by people who speak them. Afaan Oromoo already ships in the repo
(`apps/api/src/translate/packs/om.ts`, machine translated, pull requests from speakers welcome), so it works with no
translation service. A speaker's fix saved through the API wins over the repo text.

* `GET /api/v1/i18n` lists the languages and how many strings are translated and checked by a speaker.
* `GET /api/v1/i18n/{lang}` returns the saved pack. Keys it lacks fall back to English.
* `POST /api/v1/i18n/{lang}/generate` (scope `i18n:edit`) translates the next 64 missing or out of date strings.
  Call it again until `remaining` is 0. Strings where the machine broke a `{placeholder}` stay in English.
* `PUT /api/v1/i18n/{lang}/{key}` with `{"text"}` (scope `i18n:edit`) saves a speaker's fix. Fixed strings are never
  overwritten by the machine.

Configure the API with `TRANSLATE_PROVIDER=nllb` and `HF_TOKEN` (Meta's NLLB 200; `TRANSLATE_NLLB_URL` can point at a
self hosted copy; the model weights are licensed for non commercial use only), or `TRANSLATE_PROVIDER=custom` with a
LibreTranslate style `TRANSLATE_URL` (and optional `TRANSLATE_AUTH_HEADER`). Give the `i18n:edit` scope only to your own
client in `PARTNER_CLIENTS`.

Widgets and the help bar also accept `voice="device|server|custom"` and `voice-url="https://…?text={text}&lang={lang}"`
to call a voice service directly. Keys never go in the browser: put them on the API.

### Deploy your own

* **API on Render:** `render.yaml` is a Render Blueprint (free plan). In Render choose New, then Blueprint, pick this
  repository, and fill in `PARTNER_CLIENTS` (your own client secrets) and `PUBLIC_RESUME_URL`. Health check:
  `/api/v1/health`, Swagger UI: `/docs`. Set `DATABASE_URL` to a Postgres connection string (a free Neon project works) so
  data, including Contact a person messages, survives restarts; tables are created automatically. Without it the API
  uses a SQLite file, which the free plan wipes on every restart.
* **Pages and widgets on Vercel:** `vercel.json` builds `apps/web-components/dist`. Import the repository in Vercel
  and keep the settings from the file. The API allows any `*.vercel.app` origin; set `CORS_ORIGINS` for other domains.

Hosted widgets call `https://digital-bridge-api.onrender.com/api/v1` by default. Build with
`VITE_DB_API_URL=https://your-api.example/api/v1` to use another API. On localhost and `127.0.0.1` the widgets stay
offline (mock data) unless the page sets an `api` or `api-url` attribute.

Ask a question (English or Amharic): `<db-ask>` sits on the signup, profile and jobs pages. Type or say a question and
the answer comes back in the language you used, offline, from the same bilingual help core that serves
`POST /api/v1/help/ask` (`{"question":"ለመመዝገብ መታወቂያ ያስፈልገኛል?"}`) and `GET /api/v1/help/faq?lang=am`. Questions are not
stored or logged.

Contact a person: when an answer does not help, the "Contact a person" button in `<db-ask>` opens a short form (phone or
email, message, consent). It sends `POST /api/v1/help/contact`
(`{"contact":"0911 234 567","message":"…","lang":"am","consent":true}`) and shows a reference such as `HELP-1A2B3C4D`.
Without consent the API answers 422. Offline, the message waits on the device and is sent when the connection returns.
The help team reads messages with `GET /api/v1/help/contact` and a token with the `help:admin` scope (demo client
`help-desk`; set real secrets with `PARTNER_CLIENTS`). Messages are never logged or shared with employers.

Install in an LMS: `GET /api/v1/lti/install` lists copy-ready values for Moodle (Tool URL, Public keyset, Initiate login
URL, Redirection URIs). Canvas admins paste one URL, `/api/v1/lti/install/canvas.json`, into Developer Keys > LTI Key >
Enter URL. Launches are then verified with RS256 once the platform is added to `LTI_PLATFORMS_JSON`.

For widget development with hot reload: `pnpm dev` (standalone dev page on http://localhost:5173, API on 3000).

## Install, Level 1
```html
<script type="module" src="https://example.invalid/db-signup.js"></script>
<db-signup lang="am"></db-signup>
```

The `<db-signup>` alias accepts `api`, `lang`, `partner-id`, `theme`, `mode`,
and `audio-base-url`. It emits composed onboarding, completion, support, and
error events without private support data unless explicitly shared.

## Install, Level 2
OpenAPI document: `docs/openapi.json` (also live at http://localhost:3000/api/docs-json). Every call below was run
against `node apps/api/dist/main.js` on 15 Nov 2026. On Windows PowerShell type `curl.exe` instead of `curl`.

```bash
# 1. Health
curl -s http://localhost:3000/api/v1/health

# 2. Start an onboarding session (returns the profile with its "id")
curl -s -X POST http://localhost:3000/api/v1/onboarding/sessions -H 'content-type: application/json' -d '{"lang":"en","partnerId":"demo"}'

# 3. Save a step; a bad phone number returns 422 with an English + Amharic message (replace SESSION_ID)
curl -s -X PATCH http://localhost:3000/api/v1/onboarding/sessions/SESSION_ID -H 'content-type: application/json' -d '{"step":"contact","data":{"phone":"123"}}'

# 4. List jobs (the learner's support filter runs in the browser, not here)
curl -s http://localhost:3000/api/v1/career/jobs

# 5. Get a development bearer token for partner calls (demo credentials, development only)
curl -s -X POST http://localhost:3000/api/v1/auth/token -H 'content-type: application/json' -d '{"clientId":"demo-partner","clientSecret":"demo-secret","scopes":["career:write"]}'
```

Every error, from validation (422) to not found (404), uses one envelope: `statusCode`, `error`,
`summary.en`, `summary.am` and a `fields` list.

The same API supports SMS resume, partner vouchers, applications, privacy export/delete and LTI 1.3.

## Install, Level 3
Use the REST API and LTI 1.3 integration under `/api/v1`, or host the generated Web Component bundle in any LMS or partner page. The `pages/jobs.html` Career Gateway embeds valid `schema.org/JobPosting` JSON-LD in each job card so external job boards can ingest listings without custom adapters.

LTI 1.3 uses OIDC login initiation and verifies RS256 signatures, state, nonce,
issuer, audience, expiry, and required claims; invalid launches return bilingual
401 responses before the tool renders. The Mock LMS Judge Launchpad at
`apps/host-demo/mock-lms/index.html` signs real launch tokens and
exercises the verification path end to end.

## Languages
English and Amharic are included. Adding Afaan Oromo (`om.json`), Tigrinya
(`ti.json`), Somali (`so.json`), or Arabic (`ar.json`) requires one JSON file
and running `node scripts/generate-tts-audio.mjs`; the resolver accepts the
language tag, uses an installed OS voice when available, then a manifest clip,
then an always-visible caption bar. Arabic can use `dir="rtl"` and CSS logical
properties such as `margin-inline-start`.

Voice support includes editable review before acceptance, spoken number and
symbol conversion (`zero nine one one` or `ዜሮ ዘጠኝ አንድ አንድ` to `0911…`),
Ethiopic numerals, and spoken email forms such as “at gmail dot com”. The
Fidel helper converts `abebe` to `አበበ` and `addis ababa` to `አዲስ አበባ`.

### Voice control for blind and voice-only learners
Turn it on with **Alt + V** or the first button in the widget, then say:
- **a number** (or "item 3", "ቁጥር 3") to jump to that numbered item; top-bar links are numbered from 91;
  in a noisy room, press the number keys instead;
- **down / up** to move between items ("down" starts at the first field of the step), **scroll down / scroll up**;
- **answer** to dictate into the current field, **guide** ("ምራኝ") to be walked through the fields one by one with
  each answer read back for yes / no;
- **repeat** to hear the whole step with every field and its number; **next**, **back**, **help**, **jobs** /
  **sign up** to move voice control between the Career Gateway and onboarding, **stop**.

Voice control pauses by itself while any field records or dictates, shows whether it is listening or still processing,
and only one widget on the page has it on at a time. On the date step, "Say your date of birth" fills the three lists
("15 Meskerem 1995" or in Amharic words).

### Sign language, colours and other ways in
- **Sign language (Ethiopian Sign Language):** every voice field has "Answer … in sign language". It records a short
  video of the learner signing (camera, `MediaRecorder`, up to 20 s), kept on the device like a voice note so the
  learner can continue without typing; a person who knows EthSL reads it. The panel also offers number / letter /
  word cards and an optional camera wave control (hand movement on the left, middle or right of the picture moves
  back, chooses, or moves forward). **It does not recognise or translate signs automatically**, and no video is
  uploaded or sent to any cloud or AI service. Pictures of EthSL hand shapes are to be added with Deaf co-designers.
- **Colours:** a Colours menu in the help bar and in the host top bar switches every widget between Warm (default),
  Colour-blind safe (blue and gold), High contrast and Dark. Hovered controls get a dashed border and chosen ones are
  inverted with a ✓ in every mode, so state never depends on colour alone. Hosts can set `vision="dark"` (or
  `colorblind-safe`, `high-contrast`) on any widget.

## Offline and slow connection
Drafts persist on the device, API failures use the deterministic mock service,
and static neural audio clips are served from the local manifest cache. Voice
control is hands-free: press the first control or `Alt + V`, then say
*next / back / repeat / down / up / choose / answer / help / stop* or
*ቀጥል / ተመለስ / ድገም / ታች / ላይ / ምረጥ / መልስ / እርዳታ / አቁም*.
Each command has a visible confirmation and screen-reader announcement.

Measured Slow 3G load on 15 Nov (time until the first question can be used, gzip as served by any web host,
`db-signup.js` = **166 KB gzipped**, 2 requests on the blank page, 0 requests to other websites):

| Profile | `demo/blank.html` | `pages/signup.html` (old Savanna copy, since removed) |
| --- | --- | --- |
| Slow 3G (500 kbit/s, 400 ms, CPU 4× slower) | 5.5 s | 8.4 s (Savanna's own CSS is about 1.3 MB) |

No fonts or scripts are loaded from other websites; Ethiopic text uses the device's own Noto Sans Ethiopic / Nyala
fonts.

## Data and privacy
Support preferences are stored separately and are never sent to employers or analytics without explicit consent. Learners can export or delete their data.

## Cost to run
For 3,000 learners the target monthly cost is **$0–$5**: a static Web
Component bundle, SQLite/Docker backend, zero-cost build-time neural TTS
generation, and browser `MediaRecorder` / `SpeechRecognition`, with no paid AI
or cloud lock-in. The bundle is **184 KB gzipped**, below the 250 KB target.

## Finished and not finished
The API, compatibility routes, accessibility checks, offline behavior, i18n
fallback architecture, neural audio packs, and documentation are implemented.
The Amharic wording and real-device NVDA, TalkBack, microphone, and native
voice experience still need co-designer validation.

## Libraries and their licences
React, Vite, NestJS, TypeScript, Zod, Playwright, axe-core, lucide-react, and edge-tts are used under their respective permissive open-source licences. Verify current licence texts before redistribution.

## Contributing
Bug reports, accessibility barriers, Amharic wording fixes and pull requests are welcome. Read
[CONTRIBUTING.md](CONTRIBUTING.md) and the [Code of Conduct](CODE_OF_CONDUCT.md). Report security problems privately as
described in [SECURITY.md](SECURITY.md).

## Licence
[MIT](LICENSE).
