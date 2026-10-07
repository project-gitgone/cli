import type { Changes } from '@/services/diff.js';
import { colors } from '@/ui/theme.js';

export const changeLines = (changes: Changes) => [
  ...changes.added.map((name) => colors.brand(`+ ${name}`)),
  ...changes.changed.map((name) => colors.warning(`~ ${name}`)),
  ...changes.removed.map((name) => colors.danger(`- ${name}`)),
];
