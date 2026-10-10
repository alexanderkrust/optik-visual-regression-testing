#!/usr/bin/env node
import { parseArgs } from 'util';
import { collectScreenshots, upload } from './upload';

const HELP = `Usage: optik upload <file or directory>... [options]

Uploads PNG screenshots as one optik run. A snapshot's name is its path
relative to the directory, without ".png" (screenshots/home/desktop.png → home/desktop).

Options:
  --suite <name>          Runs are merged and baselines are kept per suite (default: cli)
  --server <url>          optik server (default: OPTIK_SERVER_URL, else http://localhost:3000)
  --fail-on-changes       Exit with 1 when snapshots changed (default: the project setting)
  --no-fail-on-changes    Exit with 0 even when snapshots changed
  --concurrency <n>       Parallel uploads (default: 4)
  -h, --help              Show this help
  -v, --version           Show the version

Environment:
  OPTIK_TOKEN             Project API token (optik_...) — required
  OPTIK_SERVER_URL        optik server
  OPTIK_BRANCH, OPTIK_COMMIT  Override the branch and commit detected from git or CI

Exit codes: 0 no changes to review (or not failing), 1 changes to review, 2 error.
`;

export async function main(argv: string[], env: NodeJS.ProcessEnv = process.env): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      suite: { type: 'string', default: 'cli' },
      server: { type: 'string' },
      'fail-on-changes': { type: 'boolean' },
      'no-fail-on-changes': { type: 'boolean' },
      concurrency: { type: 'string', default: '4' },
      help: { type: 'boolean', short: 'h' },
      version: { type: 'boolean', short: 'v' },
    },
  });

  if (values.version) {
    console.log(require('../package.json').version);
    return 0;
  }
  const [command, ...paths] = positionals;
  if (values.help || !command) {
    console.log(HELP);
    return values.help ? 0 : 2;
  }
  if (command !== 'upload') {
    console.error(`Unknown command "${command}".\n\n${HELP}`);
    return 2;
  }
  if (paths.length === 0) {
    console.error('Name the screenshots to upload: optik upload <file or directory>...');
    return 2;
  }
  const token = env.OPTIK_TOKEN;
  if (!token) {
    console.error('Set OPTIK_TOKEN to a project API token (optik_...) — create one under Access Tokens in optik.');
    return 2;
  }
  const concurrency = Number(values.concurrency);
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    console.error('--concurrency must be a positive number');
    return 2;
  }

  const screenshots = await collectScreenshots(paths);
  if (screenshots.length === 0) {
    console.error(`No PNG files found in ${paths.join(', ')}`);
    return 2;
  }

  const failOnChanges = values['no-fail-on-changes'] ? false : values['fail-on-changes'] ? true : undefined;
  const result = await upload(screenshots, {
    token,
    serverUrl: values.server ?? env.OPTIK_SERVER_URL,
    suite: values.suite!,
    failOnChanges,
    concurrency,
    log: (line) => console.log(line),
  });

  const count = (status: string) => result.snapshots.filter((s) => s.result.status === status).length;
  const parts = [
    [count('pending'), 'to review'],
    [count('new'), 'new'],
    [count('unchanged'), 'unchanged'],
  ].filter(([n]) => n);
  console.log(`\n${result.snapshots.length} snapshots: ${parts.map(([n, label]) => `${n} ${label}`).join(', ')}`);
  console.log(`Review: ${result.runUrl}`);
  return result.failed > 0 ? 1 : 0;
}

if (require.main === module) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (e: Error) => {
      console.error(e.message);
      process.exit(2);
    },
  );
}
