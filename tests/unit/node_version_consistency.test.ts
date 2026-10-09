import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT_DIR } from '../helpers/repo.js';

const read = (rel: string) => fs.readFileSync(path.join(ROOT_DIR, rel), 'utf-8');

test('🧩 Node: .nvmrc, engines, Dockerfiles y workflows usan la misma versión mayor', () => {
  const nvmrcMajor = read('.nvmrc').trim().split('.')[0];
  const engines = (JSON.parse(read('package.json')) as { engines?: { node?: string } }).engines?.node ?? '';

  assert.match(nvmrcMajor, /^\d+$/, '.nvmrc debe declarar una versión mayor de Node');
  assert.ok(
    engines.includes(nvmrcMajor),
    `engines.node (${engines}) debe incluir la versión mayor de .nvmrc (${nvmrcMajor})`,
  );

  for (const dockerfile of ['apps/backend/Dockerfile', 'apps/frontend/Dockerfile']) {
    const majors = [...read(dockerfile).matchAll(/^FROM node:(\d+)/gm)].map((m) => m[1]);
    assert.ok(majors.length > 0, `${dockerfile} debe basarse en una imagen node`);
    for (const major of majors) {
      assert.equal(major, nvmrcMajor, `${dockerfile} usa Node ${major}, distinto de .nvmrc (${nvmrcMajor})`);
    }
  }

  const workflowsDir = path.join(ROOT_DIR, '.github/workflows');
  for (const file of fs.readdirSync(workflowsDir).filter((f) => f.endsWith('.yaml'))) {
    for (const match of fs
      .readFileSync(path.join(workflowsDir, file), 'utf-8')
      .matchAll(/node-version:\s*["']?(\d+)/g)) {
      assert.equal(match[1], nvmrcMajor, `${file} usa Node ${match[1]}, distinto de .nvmrc (${nvmrcMajor})`);
    }
  }
});
