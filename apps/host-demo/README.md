# Host demo pages

Static pages that show the Digital Bridge plug-in on a host site. The build copies this folder into
`apps/web-components/dist`, so after `pnpm build` you can serve `dist/` and open every page.

## Bridge Learning, the demo portal

**Bridge Learning is a made up learning portal**, not a real school. It stands in for any partner (a training
centre, a university, an NGO) that adds the plug-in to its own site. Its pages use one small stylesheet and one
small script, written for this project:

| File | What it does |
| --- | --- |
| `pages/home.html` | Learner home: next steps, course progress (native `<progress>`), and the Ask box. |
| `pages/signup.html` | `<db-signup>` sign up, with a confirmation link back to the learner home. |
| `pages/profile.html` | `<db-signup mode="edit">`: review, change, export or delete answers. |
| `pages/jobs.html` | `<db-career-gateway>` and `<db-employer-accommodations>`, with schema.org `JobPosting` data. |
| `assets/css/host.css` | The portal look. Plain CSS, four colour modes, 44px targets, visible focus, reflow at 320px. It also sets the `--bs-*` tokens the widgets read, so the plug-in follows the host's brand colour and font. |
| `assets/js/host.js` | The top bar English and Amharic buttons and the Colours menu. Sets `lang` and `vision` on every widget and remembers the choice on the device. `?lang=am` and `?vision=dark` work in the URL. |

The top bar is not sticky, so it can never cover the focused field (WCAG 2.4.11). Voice control numbers the
links and controls inside `.db-host-topbar` (the older `.db-savanna-topbar` class still works).

## Other pages

| Page | What it shows |
| --- | --- |
| `index.html` | Landing page that links every demo. |
| `demo/blank.html` | The plug-in on a page with no stylesheet at all: one script and one tag. |
| `standalone.html` | All three elements on one page (also the LTI launch target). |
| `external-partner-demo.html` | How a partner adds the plug-in and listens to its events. |
| `mock-lms/` | A mock LMS that signs real LTI 1.3 launches. See `mock-lms/README.md`. |
| `assets/audio/` | Recorded English and Amharic prompts used when the device has no voice for the language. |

## History

During the hackathon these pages ran inside a frozen copy of ALX's Savanna learner pages. Those third party pages,
styles, fonts and images were removed when the project became open source, and replaced by the Bridge Learning
portal above. The hackathon records (`HACKATHON_PLAN.md`, `JUDGE_REPORT.md`, `docs/SAVANNA_FIXES.md`) still describe
the original setup.
