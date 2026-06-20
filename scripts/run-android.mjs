import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { delimiter, join } from 'node:path';

const javaExecutable = process.platform === 'win32' ? 'java.exe' : 'java';
const candidates = [
  process.env.JAVA_HOME,
  process.platform === 'win32'
    ? join(process.env.ProgramFiles ?? 'C:\\Program Files', 'Android', 'Android Studio', 'jbr')
    : undefined,
  process.platform === 'win32' && process.env.LOCALAPPDATA
    ? join(process.env.LOCALAPPDATA, 'Programs', 'Android Studio', 'jbr')
    : undefined,
  process.platform === 'darwin'
    ? '/Applications/Android Studio.app/Contents/jbr/Contents/Home'
    : undefined,
  process.platform === 'linux' ? '/opt/android-studio/jbr' : undefined,
].filter(Boolean);

const javaHome = candidates.find((candidate) =>
  existsSync(join(candidate, 'bin', javaExecutable)),
);

if (!javaHome) {
  console.error(
    'Java 21 was not found. Install Android Studio or set JAVA_HOME before running Android.',
  );
  process.exit(1);
}

const environment = {
  ...process.env,
  JAVA_HOME: javaHome,
  PATH: `${join(javaHome, 'bin')}${delimiter}${process.env.PATH ?? ''}`,
};

const npmCli = process.env.npm_execpath;
const capacitorCli = join(
  process.cwd(),
  'node_modules',
  '@capacitor',
  'cli',
  'bin',
  'capacitor',
);

if (!npmCli || !existsSync(npmCli)) {
  console.error('Run this command through npm: npm run android:run');
  process.exit(1);
}

run(process.execPath, [npmCli, 'run', 'android:sync']);
run(process.execPath, [capacitorCli, 'run', 'android']);

function run(command, arguments_) {
  const result = spawnSync(command, arguments_, {
    env: environment,
    stdio: 'inherit',
  });

  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
