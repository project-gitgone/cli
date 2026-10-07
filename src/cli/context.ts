export type Streams = { stdin: { isTTY?: boolean }; stdout: { isTTY?: boolean } };

export type RunEnvironment = { env: NodeJS.ProcessEnv; streams: Streams };

export type CliContext = { interactive: boolean; json: boolean; yes: boolean };

export function resolveContext(
  flags: { json?: boolean; yes?: boolean },
  env: NodeJS.ProcessEnv = process.env,
  streams: Streams = process,
): CliContext {
  const json = flags.json === true;
  const interactive = !json && !env.CI && !!streams.stdin.isTTY && !!streams.stdout.isTTY;
  return { interactive, json, yes: flags.yes === true };
}
