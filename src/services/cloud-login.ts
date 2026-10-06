import crypto from 'node:crypto';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { getServerUrl } from '../lib/config.js';

const CALLBACK_TIMEOUT_MS = 5 * 60 * 1000;

const PAGE = (message: string) =>
  `<!doctype html><meta charset="utf-8"><title>GitGone</title><body style="font-family:system-ui;padding:3rem">${message}</body>`;

export const createPkce = () => {
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
};

export type BrowserOpener = (url: string) => void;

export const openBrowser: BrowserOpener = (url) => {
  const [command, args] =
    process.platform === 'darwin'
      ? ['open', [url]]
      : process.platform === 'win32'
        ? ['cmd', ['/c', 'start', '', url]]
        : ['xdg-open', [url]];
  try {
    spawn(command, args, { stdio: 'ignore', detached: true }).on('error', () => {}).unref();
  } catch {}
};

const listenForCode = (state: string) =>
  new Promise<{ port: number; code: Promise<string> }>((resolveListening, rejectListening) => {
    let settle: { resolve: (code: string) => void; reject: (error: Error) => void };
    const code = new Promise<string>((resolve, reject) => {
      settle = { resolve, reject };
    });

    const server = http.createServer((request, response) => {
      const url = new URL(request.url ?? '/', 'http://127.0.0.1');
      if (url.pathname !== '/callback' || url.searchParams.get('state') !== state) {
        response.writeHead(404).end();
        return;
      }
      const error = url.searchParams.get('error');
      const value = url.searchParams.get('code');
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      response.end(PAGE(value && !error ? 'Connecté. Vous pouvez fermer cet onglet.' : 'Connexion refusée.'));
      finish();
      if (value && !error) settle.resolve(value);
      else settle.reject(new Error(url.searchParams.get('error_description') ?? 'Login was denied'));
    });

    const timer = setTimeout(() => {
      finish();
      settle.reject(new Error('Timed out waiting for the browser login'));
    }, CALLBACK_TIMEOUT_MS);
    const finish = () => {
      clearTimeout(timer);
      server.close();
      server.closeAllConnections();
    };

    server.on('error', rejectListening);
    server.listen(0, '127.0.0.1', () => {
      resolveListening({ port: (server.address() as { port: number }).port, code });
    });
  });

export const browserLogin = async (open: BrowserOpener) => {
  const { verifier, challenge } = createPkce();
  const state = crypto.randomBytes(16).toString('base64url');
  const { port, code } = await listenForCode(state);
  const url = `${getServerUrl()}/auth/cloud/login?${new URLSearchParams({
    port: String(port),
    state,
    code_challenge: challenge,
  })}`;
  open(url);
  return { code: await code, codeVerifier: verifier };
};
