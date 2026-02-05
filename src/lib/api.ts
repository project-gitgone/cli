import { getConfig, getServerUrl } from './config.js';

type FetchOptions = RequestInit & {
  requireAuth?: boolean;
};

export const apiClient = async (path: string, options: FetchOptions = {}) => {
  const serverUrl = getServerUrl();
  const { authToken } = getConfig();
  const url = `${serverUrl}${path}`;

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    ...options.headers,
  };

  if (options.requireAuth !== false && authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }

  try {
    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (response.status === 401) {
      throw new Error('Unauthorized. Please login again.');
    }
    
    if (response.status === 204) return null;

    const data = await response.json().catch(() => null);

    if (!response.ok) {
        if (data && data.errors) {
             throw new Error(data.errors.map((e: any) => e.message).join(', '));
        }
        if (data && data.message) {
            throw new Error(data.message);
        }
        throw new Error(`Request failed with status ${response.status}`);
    }

    return data;
  } catch (error: any) {
    if (error.cause?.code === 'ECONNREFUSED') {
        throw new Error(`Could not connect to server at ${serverUrl}. Is it running?`);
    }
    throw error;
  }
};
