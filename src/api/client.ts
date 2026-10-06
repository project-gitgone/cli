import { getConfig, getServerUrl } from '../lib/config.js';

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export type RequestOptions = Omit<RequestInit, 'body'> & {
  body?: unknown;
  requireAuth?: boolean;
};

type ErrorBody = { message?: string; errors?: { message: string }[] } | null;

const errorMessage = (data: ErrorBody, status: number) => {
  if (data?.errors) return data.errors.map((e) => e.message).join(', ');
  if (data?.message) return data.message;
  return `Request failed with status ${status}`;
};

export async function api<T = void>(path: string, options: RequestOptions = {}): Promise<T> {
  const serverUrl = getServerUrl();
  const { authToken } = getConfig();
  const { body, requireAuth, headers, ...init } = options;

  const requestHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    ...(headers as Record<string, string> | undefined),
  };
  if (requireAuth !== false && authToken) requestHeaders.Authorization = `Bearer ${authToken}`;

  let response: Response;
  try {
    response = await fetch(`${serverUrl}${path}`, {
      ...init,
      headers: requestHeaders,
      ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }),
    });
  } catch (error) {
    if ((error as { cause?: { code?: string } }).cause?.code === 'ECONNREFUSED') {
      throw new Error(`Could not connect to server at ${serverUrl}. Is it running?`);
    }
    throw error;
  }

  if (response.status === 401) throw new ApiError('Unauthorized. Please login again.', 401);
  if (response.status === 204) return null as T;

  const data = await response.json().catch(() => null);
  if (!response.ok) throw new ApiError(errorMessage(data as ErrorBody, response.status), response.status);
  return data as T;
}

export const isNotFound = (error: unknown) => error instanceof ApiError && error.status === 404;
