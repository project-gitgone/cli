import pc from 'picocolors';

const defaultEnabled = () => !!process.stdout.isTTY && !process.env.NO_COLOR;

type Text = string | number | null | undefined;

let enabled = defaultEnabled();
let palette = pc.createColors(enabled);

export function setColor(next: boolean) {
  enabled = next;
  palette = pc.createColors(next);
}

const TRUE_COLOR = /^(truecolor|24bit)$/i;

const logoColor = (text: string) => {
  if (!enabled) return text;
  if (TRUE_COLOR.test(process.env.COLORTERM ?? '')) return `\u001b[38;2;96;164;65m${text}\u001b[39m`;
  return palette.green(text);
};

export const colors = {
  brand: (text: Text) => palette.green(text),
  muted: (text: Text) => palette.gray(text),
  danger: (text: Text) => palette.red(text),
  warning: (text: Text) => palette.yellow(text),
  info: (text: Text) => palette.blue(text),
  cyan: (text: Text) => palette.cyan(text),
  bold: (text: Text) => palette.bold(text),
  dim: (text: Text) => palette.dim(text),
  emphasis: (text: Text) => palette.bold(palette.green(text)),
  logo: logoColor,
  badge: (text: Text) => palette.bgGreen(palette.black(text)),
};

export const symbols = { success: '✔', error: '✖', warning: '▲', info: '●' } as const;
