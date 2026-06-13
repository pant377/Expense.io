import { execFileSync } from 'node:child_process';

const DEFAULT_PROJECT_ID = 'thenewone-3b948';
const DEFAULT_COUNT = 400;
const BATCH_SIZE = 200;
const CATEGORIES = [
  'Food',
  'Transport',
  'Home',
  'Health',
  'Leisure',
  'Subscriptions',
  'Other',
];
const DESCRIPTIONS = {
  Food: ['Supermarket', 'Lunch', 'Coffee', 'Dinner', 'Bakery'],
  Transport: ['Fuel', 'Bus ticket', 'Taxi', 'Parking', 'Train ticket'],
  Home: ['Electricity bill', 'Household supplies', 'Internet', 'Furniture', 'Repairs'],
  Health: ['Pharmacy', 'Doctor visit', 'Gym membership', 'Vitamins', 'Dental care'],
  Leisure: ['Cinema', 'Weekend activity', 'Books', 'Concert', 'Games'],
  Subscriptions: ['Streaming service', 'Cloud storage', 'Software plan', 'Music service'],
  Other: ['Gift', 'Personal care', 'Office supplies', 'Pet supplies', 'Miscellaneous'],
};

const options = parseArguments(process.argv.slice(2));
const accessToken = firebaseAccessToken();
const writes = buildWrites(options);

for (let index = 0; index < writes.length; index += BATCH_SIZE) {
  const batch = writes.slice(index, index + BATCH_SIZE);
  await firestoreRequest(
    `https://firestore.googleapis.com/v1/projects/${options.projectId}/databases/(default)/documents:commit`,
    accessToken,
    {
      method: 'POST',
      body: JSON.stringify({ writes: batch }),
    },
  );
}

const verifiedCount = await verifyDocuments(options, accessToken);

console.log(
  `Seeded and verified ${verifiedCount} test expenses for ${options.userId}.`,
);

function parseArguments(argumentsList) {
  const values = new Map();

  for (let index = 0; index < argumentsList.length; index += 2) {
    const key = argumentsList[index];
    const value = argumentsList[index + 1];

    if (!key?.startsWith('--') || value === undefined) {
      throw new Error('Use --uid <user-id> [--count 400] [--project <project-id>].');
    }

    values.set(key.slice(2), value);
  }

  const userId = values.get('uid');
  const count = Number(values.get('count') ?? DEFAULT_COUNT);
  const projectId = values.get('project') ?? DEFAULT_PROJECT_ID;

  if (!userId) {
    throw new Error('Missing required --uid argument.');
  }

  if (!Number.isInteger(count) || count < 1 || count > 500) {
    throw new Error('--count must be an integer between 1 and 500.');
  }

  return { userId, count, projectId };
}

function firebaseAccessToken() {
  const executable = process.platform === 'win32' ? process.env.ComSpec : 'npx';
  const argumentsList =
    process.platform === 'win32'
      ? ['/d', '/s', '/c', 'npx firebase login:list --json']
      : ['firebase', 'login:list', '--json'];
  const result = execFileSync(executable, argumentsList, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  const accounts = JSON.parse(result).result;
  const token = accounts?.[0]?.tokens?.access_token;

  if (!token) {
    throw new Error('No Firebase CLI login found. Run `npx firebase login` first.');
  }

  return token;
}

function buildWrites({ projectId, userId, count }) {
  const random = mulberry32(20260613);
  const now = new Date();

  return Array.from({ length: count }, (_, index) => {
    const category = CATEGORIES[Math.floor(random() * CATEGORIES.length)];
    const descriptions = DESCRIPTIONS[category];
    const description = descriptions[Math.floor(random() * descriptions.length)];
    const amountCents = amountForCategory(category, random);
    const occurredAt = expenseDate(index, now, random);
    const createdAt = new Date(
      Math.min(now.getTime(), occurredAt.getTime() + Math.floor(random() * 86_400_000)),
    );
    const documentId = `test-seed-${String(index + 1).padStart(4, '0')}`;

    return {
      update: {
        name:
          `projects/${projectId}/databases/(default)/documents/users/` +
          `${userId}/expenses/${documentId}`,
        fields: {
          description: { stringValue: `${description} #${index + 1}` },
          amountCents: { integerValue: String(amountCents) },
          category: { stringValue: category },
          occurredAt: { timestampValue: occurredAt.toISOString() },
          createdAt: { timestampValue: createdAt.toISOString() },
          updatedAt: { timestampValue: now.toISOString() },
        },
      },
    };
  });
}

function expenseDate(index, now, random) {
  const date = new Date(now);

  if (index < 12) {
    date.setHours(8 + (index % 12), (index * 7) % 60, 0, 0);
    return date;
  }

  if (index < 45) {
    date.setDate(1 + Math.floor(random() * now.getDate()));
    date.setHours(8 + Math.floor(random() * 12), Math.floor(random() * 60), 0, 0);
    return date;
  }

  date.setDate(date.getDate() - Math.floor(random() * 540));
  date.setHours(8 + Math.floor(random() * 12), Math.floor(random() * 60), 0, 0);
  return date;
}

function amountForCategory(category, random) {
  const ranges = {
    Food: [350, 9500],
    Transport: [180, 12500],
    Home: [1200, 28000],
    Health: [700, 18000],
    Leisure: [500, 15000],
    Subscriptions: [299, 4500],
    Other: [400, 12000],
  };
  const [minimum, maximum] = ranges[category];

  return Math.round(minimum + random() * (maximum - minimum));
}

async function verifyDocuments({ projectId, userId, count }, accessToken) {
  const documents = Array.from(
    { length: count },
    (_, index) =>
      `projects/${projectId}/databases/(default)/documents/users/${userId}/expenses/` +
      `test-seed-${String(index + 1).padStart(4, '0')}`,
  );
  const response = await firestoreRequest(
    `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:batchGet`,
    accessToken,
    {
      method: 'POST',
      body: JSON.stringify({ documents }),
    },
  );
  const results = JSON.parse(response);

  return results.reduce((total, result) => {
    return total + (result.found ? 1 : 0);
  }, 0);
}

async function firestoreRequest(url, accessToken, init) {
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });
  const body = await response.text();

  if (!response.ok) {
    throw new Error(`Firestore request failed (${response.status}): ${body}`);
  }

  return body;
}

function mulberry32(seed) {
  return function random() {
    let value = (seed += 0x6d2b79f5);
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}
