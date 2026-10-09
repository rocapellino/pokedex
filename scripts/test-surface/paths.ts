/**
 * Rutas canónicas del inventario de la superficie de testing.
 */

import path from 'node:path';
import { REPO_ROOT } from '../lib/repo-root.js';

export const ROOT_DIR = REPO_ROOT;
export const TESTS_DIR = path.join(ROOT_DIR, 'tests');
export const OUTPUT_DIR = path.join(ROOT_DIR, 'docs', 'testing');
export const JSON_FILE = path.join(OUTPUT_DIR, 'test-surface.json');
export const MD_FILE = path.join(OUTPUT_DIR, 'test-surface.md');
