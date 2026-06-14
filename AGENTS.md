# Expense.io Agent Guide

Use this file as the first map of the repository. Read the files relevant to a task before
editing; keep changes focused and follow the existing standalone Angular patterns.

## Project Summary

Expense.io is a private expense tracker built with Angular 20, TypeScript, Firebase
Authentication, Cloud Firestore, and Firebase Hosting.

Key behavior:

- Email/password and Google authentication
- Per-user expenses, income, recurring transactions, and spending limits
- English and Greek UI
- Light and dark themes
- Firebase Auth and Firestore emulator support

## Quick Start

Requirements:

- Node.js 20.19+ or 22.12+
- Java 21+ when running the Firestore emulator

Install dependencies:

```bash
npm ci
```

For development against a real Firebase project, copy `.env.example` to `.env`, fill in
all six `FIREBASE_*` values, and run:

```bash
npm start
```

For local emulators, use two terminals:

```bash
npm run firebase:emulators
npm run start:emulators
```

The application runs at `http://localhost:4200`; the Emulator Suite UI runs at
`http://localhost:4000`.

## Verification Commands

Run the checks that match the change:

```bash
npm test
npm run build
npm run build:emulators
```

- `npm test` uses `environment.emulator.ts` and does not require `.env`.
- `npm run build` is a production build and generates Firebase config from `.env`.
- `npm run build:emulators` is useful when no real Firebase config is available.
- `npm run firebase:deploy` builds, verifies the production project ID, and deploys.

## Repository Map

### Application shell

- `src/main.ts`: bootstraps the standalone Angular application.
- `src/app/app.config.ts`: global providers and Greek locale registration.
- `src/app/app.routes.ts`: lazy routes and authentication guards.
- `src/app/app.component.*`: root router outlet and theme initialization.

### Feature UI

- `src/app/features/auth/`: sign-in, registration, Google auth, and password reset.
- `src/app/features/dashboard/`: the main application UI and feature orchestration.

The dashboard component is currently large. Keep a tightly scoped UI change in its component,
template, and stylesheet. Put reusable calculations or data transformations in a focused pure
helper under `core` and cover them with a nearby spec.

### Core domain and infrastructure

- `src/app/core/auth/`: Firebase auth service and route guards.
- `src/app/core/account/`: deletion of all Firestore data owned by an account.
- `src/app/core/firebase/`: Firebase app initialization and emulator connections.
- `src/app/core/expenses/`: expense models, Firestore services, recurring transactions,
  analytics, filtering, CSV export, category icons, and their unit tests.
- `src/app/core/limits/`: spending-limit model, calculations, and Firestore service.
- `src/app/core/i18n/`: typed English/Greek translations and locale-aware labels.
- `src/app/core/theme/`: persisted light/dark theme state.
- `src/app/core/pagination/`: pure pagination helper.
- `src/app/core/errors/`: user-facing Firebase error mapping.

### Configuration and backend contract

- `src/environments/environment.ts`: real Firebase development environment.
- `src/environments/environment.prod.ts`: real Firebase production environment.
- `src/environments/environment.emulator.ts`: fixed safe demo project for tests/emulators.
- `src/environments/firebase.generated.ts`: generated local file; never edit or commit it.
- `firestore.rules`: authorization, allowed fields, types, and value constraints.
- `firestore.indexes.json`: Firestore indexes.
- `firebase.json`: hosting and emulator configuration.
- `scripts/generate-firebase-config.mjs`: creates `firebase.generated.ts` from `.env`.
- `scripts/verify-production-build.mjs`: rejects emulator config in production output.
- `scripts/seed-test-expenses.mjs`: writes test records to a real Firestore project. Verify its
  `--project` and `--uid` arguments before running it.

The old `src/app/components/` and `src/app/sevice/` directories are empty. Do not place new
code there; use `features` and `core`.

## Data Model

Firestore paths:

```text
users/{uid}
users/{uid}/expenses/{expenseId}
users/{uid}/recurring-expenses/{scheduleId}
users/{uid}/settings/spending-limits
```

Money is stored as integer cents. Do not store floating-point currency values.

Expense fields:

```text
description, amountCents, category, transactionType, paymentMethod,
occurredAt, createdAt, updatedAt
```

Recurring transaction fields:

```text
description, amountCents, category, transactionType, paymentMethod,
frequency, startDate, nextOccurrenceAt, active, createdAt, updatedAt
```

When changing stored data:

1. Update the TypeScript model and normalization logic.
2. Update the Firestore service read/write path.
3. Update `firestore.rules`; its `hasOnly` and `hasAll` checks reject undeclared fields.
4. Update account deletion when adding a new user-owned collection or document.
5. Add or update focused tests for validation and pure behavior.

Never weaken per-user authorization. All user data must remain under `users/{uid}`, and access
must require `request.auth.uid == uid`.

## Coding Conventions

- TypeScript and Angular template checking are strict.
- Use standalone components, `inject()`, `ChangeDetectionStrategy.OnPush`, signals for local
  UI state, RxJS for Firebase streams, and reactive forms.
- Keep Firebase SDK calls in services, not in templates or pure domain helpers.
- Wrap Firebase observer callbacks in `NgZone` as the existing services do.
- Prefer pure functions for analytics, filtering, pagination, export, date recurrence, and
  money conversion.
- Keep `createdAt` immutable on updates; use `serverTimestamp()` for persisted audit fields.
- Follow `.editorconfig`: two-space indentation and single quotes in TypeScript.
- Add user-visible text through `src/app/core/i18n/translations.ts` in both English and Greek.
- Put shared design tokens and global behavior in `src/styles.css`; keep feature-specific styles
  beside the feature component.
- Do not hand-edit generated output in `dist/`, `.angular/`, or `firebase.generated.ts`.
- Never commit `.env`, `.firebaserc`, service-account files, OAuth secrets, or private keys.

## Testing Expectations

- Add `*.spec.ts` beside pure helpers and models when behavior changes.
- Cover currency rounding, date boundaries, recurrence, filtering, and income-versus-expense
  behavior explicitly when those areas are touched.
- Run `npm test` for logic changes.
- Run the appropriate build after TypeScript, templates, styles, routes, environments, or
  Firebase integration changes.
- For Firestore schema changes, validate both client writes and matching security rules.

## Definition of Done

- The requested behavior works in the affected real or emulator flow.
- Strict TypeScript and Angular template compilation pass.
- Relevant unit tests pass and new behavior has focused coverage.
- Models, services, translations, account cleanup, and Firestore rules remain synchronized.
- No generated files, credentials, build output, or unrelated changes are included.
