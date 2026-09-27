const { spawnSync } = require('node:child_process');
const { mkdirSync, existsSync } = require('node:fs');
const { join } = require('node:path');

const root = join(__dirname, '..');
const cacheRoot = join(root, '.cache');
const dirs = {
  cache: cacheRoot,
  jest: join(cacheRoot, 'jest'),
  tmp: join(cacheRoot, 'tmp'),
  mongo: join(cacheRoot, 'mongodb-binaries'),
};

for (const dir of Object.values(dirs)) {
  mkdirSync(dir, { recursive: true });
}

process.env.TEMP = dirs.tmp;
process.env.TMP = dirs.tmp;
process.env.JEST_CACHE_DIRECTORY = dirs.jest;
process.env.MONGOMS_DOWNLOAD_DIR = dirs.mongo;
process.env.MONGOMS_VERSION = process.env.MONGOMS_VERSION || '7.0.14';
process.env.REDIS_MODE = 'memory';

const jestBin = join(
  root,
  'node_modules',
  'jest',
  'bin',
  'jest.js',
);

if (!existsSync(jestBin)) {
  console.error(`Jest binary not found at ${jestBin}`);
  process.exit(1);
}

const result = spawnSync(
  process.execPath,
  [jestBin, '--config', './test/jest-e2e.json', '--runInBand', '--forceExit'],
  { stdio: 'inherit', env: process.env, cwd: root },
);

if (result.error) {
  console.error(result.error);
}

process.exit(result.status ?? 1);
