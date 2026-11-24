// Where the scripts look for the data by default. The house's private data
// lives outside git: in `dum/` (current layout), formerly in `data/`.
import { existsSync } from 'node:fs';

export function defaultStatePath(): string {
  return existsSync('dum/data/appka.json') ? 'dum/data/appka.json' : 'data/marek.json';
}
