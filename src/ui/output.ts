type Writer = (text: string) => void;

const stdoutWriter: Writer = (text) => {
  if (text.endsWith('\n')) console.log(text.slice(0, -1));
  else process.stdout.write(text);
};

let writer: Writer = stdoutWriter;

export const setOutput = (next: Writer) => {
  writer = next;
};

export const getOutput = () => writer;

export const resetOutput = () => {
  writer = stdoutWriter;
};

export const write = (text: string) => writer(text);

export const writeLine = (text = '') => writer(`${text}\n`);

const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g');

export const stripAnsi = (text: string) => text.replace(ANSI, '');
