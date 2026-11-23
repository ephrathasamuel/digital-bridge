# Contributing to Digital Bridge

Thank you for helping. Digital Bridge is an accessible, bilingual (English and Amharic) onboarding and career widget
for learners with disabilities in Ethiopia. Every change must keep it usable by keyboard, screen reader, voice and on
slow connections.

## Ways to help

* Report a bug or an accessibility barrier (use the issue templates).
* Improve the Amharic wording. Native speakers are especially welcome.
* Test with NVDA, TalkBack, VoiceOver, a switch device or a budget Android phone, and tell us what happened.
* Pick an issue labelled `good first issue` or `help wanted`.

## Set up

Node 20 or newer and pnpm (do not use npm or yarn).

```bash
corepack enable
pnpm install
pnpm build
```

Run the API with `pnpm -F @db/api dev` and the widgets with `pnpm -F @db/web-components dev`.
More detail is in the [README](README.md).

## Before you open a pull request

1. Create a branch from `main`, for example `feat/short-topic` or `fix/short-topic`.
2. Keep pull requests small and focused. Small commits with clear messages are easier to review.
3. Run the gate and make sure it passes:
   ```bash
   pnpm gate
   ```
4. Follow the engineering rules in [CLAUDE.md](CLAUDE.md). The most important ones:
   * Native HTML controls only, with visible labels. No `div` buttons.
   * Every user facing string lives in `packages/shared-schemas` in both English and Amharic.
   * Errors use `aria-invalid`, an inline message and an error summary that receives focus.
   * The widget must still work offline and with no speech support.
   * Never log or share disability, support, phone or ID data.
5. Fill in the pull request template, including what you tested by keyboard and screen reader.

## Accessibility is pass or fail

A change that adds a serious or critical axe issue, breaks keyboard use or removes a label is not ready to merge,
even if every test passes.

## Code of conduct

By taking part you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## Licence

By contributing you agree that your contributions are licensed under the [MIT Licence](LICENSE).
