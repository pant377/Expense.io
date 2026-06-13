# Expense.io

A private expense tracker built with Angular 20, Firebase Authentication and Cloud Firestore.
Each account can only access expenses stored under its own Firebase user ID.

## Features

- Email/password and Google authentication
- Guarded user dashboard
- Real-time Firestore expense stream
- Per-user data isolation with Firestore Security Rules
- Currency-safe amounts stored as integer cents
- Firebase Local Emulator Suite configuration
- Firebase Hosting configuration

## Local development

Requirements:

- Node.js 20.19+ or Node.js 22.12+
- Java 21+ for the Firestore emulator

Install dependencies:

```bash
npm install
```

Create your local Firebase configuration:

```bash
cp .env.example .env
```

Fill the six `FIREBASE_*` values in `.env`. The generated Angular configuration, `.env`,
`.firebaserc`, service-account keys and OAuth client files are excluded from Git.

To develop against the real Firebase project:

```bash
npm start
```

To use Firebase Auth and Firestore emulators instead:

```bash
npm run firebase:emulators
```

In another terminal, start Angular:

```bash
npm run start:emulators
```

The emulator and test commands use a generated demo configuration and do not require `.env`.

The application runs at `http://localhost:4200` and the Emulator Suite UI runs at
`http://localhost:4000`.

The emulator environment uses the safe demo project ID `demo-expense-io`. Demo project IDs cannot
accidentally connect to production Firebase resources.

## Connect a real Firebase project

Copy `firebase.project.example.json` to `.firebaserc` and replace the placeholder project ID.
Enable Email/Password and Google Authentication in Firebase Console.

Google sign-in also requires an active Web OAuth client whose authorized redirect URI includes:

```text
https://YOUR_PROJECT_ID.firebaseapp.com/__/auth/handler
```

Deploy the rules, indexes and application:

```bash
npm run firebase:deploy
```

Firebase Web App configuration is public in the compiled browser application by design, but it is
kept out of source control here. User data is protected by Authentication and the rules in
`firestore.rules`; never replace those rules with unrestricted access.

## Data model

```text
users/{uid}
users/{uid}/expenses/{expenseId}
```

Expense documents contain:

```text
description, amountCents, category, occurredAt, createdAt, updatedAt
```

## Verification

```bash
npm run build
npm test
```
