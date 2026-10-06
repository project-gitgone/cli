import chalk from 'chalk';
import ora, { type Ora } from 'ora';

export const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

export const info = (message: string) => console.log(chalk.blue(message));
export const success = (message: string) => console.log(chalk.green(message));
export const warn = (message: string) => console.log(chalk.yellow(message));
export const fail = (message: string) => console.log(chalk.red(message));
export const hint = (message: string) => console.log(chalk.gray(message));

export async function task<T>(label: string, failure: string, work: (spinner: Ora) => Promise<T>): Promise<T | undefined> {
  const spinner = ora(label).start();
  try {
    const result = await work(spinner);
    if (spinner.isSpinning) spinner.stop();
    return result;
  } catch (error) {
    spinner.fail(`${failure}: ${errorMessage(error)}`);
    return undefined;
  }
}
