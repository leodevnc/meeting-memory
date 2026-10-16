# Interface refresh

The recording panel, meeting list and detail workspace share an OpenAI-inspired neutral visual direction. White and light-gray surfaces, black primary actions, fine borders and generous spacing replace the orange accent and card shadows. The project retains its own name and identity.

Desktop presents capture, history and detail as distinct columns. Narrow screens stack the same controls without replacing their behavior. Skip navigation, visible keyboard focus, a named refresh button and pressed-state tab labels are included.

The mode notice explicitly distinguishes the local fixed-transcript demonstration from real transcription or model calls. No AWS deployment, adapter or authentication flow was changed.

## English defaults

Interface labels, accessibility names, errors, status messages and the fixed local demonstration use English. Dates use the English (US) display locale while retaining the browser's time zone. Both HTML entry points declare `lang="en"`.

Interface language is separate from source language: auto-detection remains the default transcription option, Korean and Japanese input options remain available, and existing user content is not translated. The multilingual evaluation fixtures remain unchanged.

The deterministic mock recognizes English decision keywords in addition to its existing Korean patterns so the English demonstration retains decision and action-item examples. It is a simple keyword-based fixture aid, not a semantic meeting extractor; negation, tentative proposals and arbitrary topics require a real extractor and separate quality checks.

## Verification — 2026-10-16

- `npm run build`: passed.
- `npm test`: 19 passed.
- `npm run eval`: passed; existing synthetic baseline remains 83.3% precision, recall and grounded predictions.
- `npm run test:e2e`: 2 passed.
- Browser coverage: English labels and document language, synthetic file upload, processing, meeting review, action completion, transcript disclosure, keyboard entry and 320/768/1440px layouts.
- Regression coverage includes English mock decisions/actions and preservation of Korean source evidence.
- Browser tests observed no non-loopback requests or page errors.
- Desktop and 390px mobile screenshots captured from the real local UI; no microphone recording or live model was used.

## Reproduce browser checks

```sh
npm ci
npx playwright install chromium
npm run test:e2e
```

The suite starts its own loopback mock server on port 4184. Do not run two copies against the same port. Default screenshots now use English content and do not require a Korean font override. Rendering actual Korean or Japanese records still requires system fonts with those glyphs; no font files or host font configuration are committed.

## Dependency observation

During browser-test dependency installation, `npm audit` reported one high-severity affected dependency entry under the existing `aws-cdk-lib/node_modules/brace-expansion` tree. The lockfile change only adds the pinned Playwright test packages; it does not change that existing dependency.

The advisory report includes [GHSA-qhr7-859c-m2p7](https://github.com/advisories/GHSA-qhr7-859c-m2p7). This is a package advisory observation, not a demonstrated application exploit. No audit fix or CDK upgrade was performed as part of the UI refresh. Assess and remediate it separately before using the infrastructure tooling with untrusted input.

Targeted browser checks do not establish full accessibility compliance or live transcription/model quality.
