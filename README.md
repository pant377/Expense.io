# Expense.io

A private expense tracker built with Angular 20, Firebase Authentication, Cloud Firestore and
Cloud Storage. Each account can only access data stored under its own Firebase user ID.

## Features

- Email/password and Google authentication
- Guarded user dashboard
- Real-time Firestore expense stream
- Optional receipt photos stored in per-user Cloud Storage paths
- Per-user data isolation with Firestore and Storage Security Rules
- Currency-safe amounts stored as integer cents
- Firebase Local Emulator Suite configuration
- Firebase Hosting configuration
- Spending-limit email alerts through a Firestore-triggered Cloud Function

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

To use Firebase Auth, Firestore and Storage emulators instead:

```bash
npm run firebase:emulators
```

In another terminal, start Angular:

```bash
npm run start:emulators
```

The emulator and test commands use the fixed safe demo configuration in
`environment.emulator.ts` and do not require `.env`.

The application runs at `http://localhost:4200` and the Emulator Suite UI runs at
`http://localhost:4000`.

The emulator environment uses the safe demo project ID `demo-expense-io`. Demo project IDs cannot
accidentally connect to production Firebase resources.

## Connect a real Firebase project

Copy `firebase.project.example.json` to `.firebaserc` and replace the placeholder project ID.
Enable Email/Password and Google Authentication in Firebase Console. Create the project's default
Cloud Storage bucket before using receipt photos.

Google sign-in also requires an active Web OAuth client whose authorized redirect URI includes:

```text
https://YOUR_PROJECT_ID.firebaseapp.com/__/auth/handler
```

Deploy the rules, indexes and application:

```bash
npm run firebase:deploy
```

To deploy only Hosting, use the guarded script so the Angular application is rebuilt first:

```bash
npm run firebase:deploy:hosting
```

Running `firebase deploy --only hosting` directly uploads the existing `dist/expense-io/browser`
directory and can publish an old build.

Firebase Web App configuration is public in the compiled browser application by design, but it is
kept out of source control here. User data is protected by Authentication and the rules in
`firestore.rules` and `storage.rules`; never replace those rules with unrestricted access.

## Email alert configuration

The `checkSpendingLimits` function reads SMTP credentials from the `SMTP_CONFIG` JSON secret.
Create or update it from the repository root:

```bash
firebase functions:secrets:set SMTP_CONFIG --format json
```

Enter one JSON object when prompted:

```json
{
  "host": "smtp.example.com",
  "port": 587,
  "secure": false,
  "user": "smtp-user",
  "pass": "smtp-password",
  "from": "Expense.io <alerts@example.com>"
}
```



Use port `465` with `"secure": true`, or port `587` with `"secure": false`, according to the
SMTP provider. The `from` address must be permitted by that provider. Deploy the updated function
after creating the secret:

```bash
firebase deploy --only functions:checkSpendingLimits
```

For emulator delivery tests, copy `functions/.secret.local.example` to
`functions/.secret.local` and replace the placeholders. Without that local file, the emulator
writes `last-sent-email.html` and logs the simulated message instead of connecting to SMTP.

### Configure Gmail

Gmail SMTP requires 2-Step Verification and a 16-character App Password. Do not use the normal
Google Account password.

1. Enable 2-Step Verification for the Google Account.
2. Open Google Account security settings and create an App Password for Expense.io.
3. Create the local secret file:

```powershell
Copy-Item functions\.secret.local.example functions\.secret.local
```

4. Replace the email address and App Password in `functions/.secret.local`:

```dotenv
SMTP_CONFIG={"host":"smtp.gmail.com","port":587,"secure":false,"user":"YOUR_ADDRESS@gmail.com","pass":"YOUR_16_CHARACTER_APP_PASSWORD","from":"Expense.io <YOUR_ADDRESS@gmail.com>"}
```

Restart the Firebase emulators after editing the file. Spaces displayed between groups in the App
Password can be omitted.

For production, create the same JSON value in Secret Manager:

```powershell
firebase functions:secrets:set SMTP_CONFIG --format json
firebase deploy --only functions:checkSpendingLimits
```

The authenticated Gmail address should also be used in `from`. Google Workspace accounts may
restrict App Passwords through administrator policy.

## Data model

```text
users/{uid}
users/{uid}/expenses/{expenseId}
users/{uid}/expenses/{expenseId}/receipt (Cloud Storage)
```

Expense documents contain:

```text
description, amountCents, category, transactionType, paymentMethod,
photoStoragePath?, photoFileName?, photoContentType?, occurredAt, createdAt, updatedAt
```

## Verification

```bash
npm run build
npm test
```
