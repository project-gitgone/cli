import { colors } from '@/ui/theme.js';

const LOGO = [
  '     ▄▄██▄▄',
  '  ▄██████████▄',
  '██████▀▀▀▀██████',
  ' ███▀      ▀███',
  ' ███        ███',
  ' ███▄      ▄███',
  '██████▄▄▄▄██████',
  '  ▀██████████▀',
  '     ▀▀██▀▀',
];

const WIDTH = Math.max(...LOGO.map((line) => line.length));
const TEXT_ROW = 3;

export function banner(text: string[]) {
  return LOGO.map((line, index) => {
    const right = text[index - TEXT_ROW];
    const logo = colors.logo(line);
    return right === undefined ? logo : `${logo}${' '.repeat(WIDTH - line.length + 4)}${right}`;
  }).join('\n');
}
