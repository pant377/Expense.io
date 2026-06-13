import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const browserOutput = resolve('dist/expense-io/browser');
const firebaseProject = JSON.parse(
  readFileSync(resolve('.firebaserc'), 'utf8'),
).projects.default;
const javascriptFiles = readdirSync(browserOutput)
  .filter((fileName) => fileName.endsWith('.js'))
  .map((fileName) => resolve(browserOutput, fileName));
const bundleSource = javascriptFiles
  .map((filePath) => readFileSync(filePath, 'utf8'))
  .join('\n');

if (bundleSource.includes('demo-expense-io') || bundleSource.includes('demo-api-key')) {
  console.error('Production build contains Firebase emulator configuration.');
  process.exit(1);
}

if (!bundleSource.includes(firebaseProject)) {
  console.error('Production Firebase project ID was not found in the build.');
  process.exit(1);
}

console.log('Verified production Firebase configuration.');
