import { api } from '@/api/client.js';
import type { Health } from '@/api/types.js';

export type ServerState = { reachable: boolean; initialized: boolean };

export async function checkServer(): Promise<ServerState> {
  try {
    const health = await api<Health>('/healthcheck', { requireAuth: false });
    return { reachable: true, initialized: health?.initialized !== false };
  } catch {
    return { reachable: false, initialized: true };
  }
}
