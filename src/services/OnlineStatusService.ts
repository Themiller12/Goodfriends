import ApiClient from './ApiClient';
import API_CONFIG from '../config/api';

const HEARTBEAT_INTERVAL = 60_000; // 1 minute
const CACHE_TTL = 30_000;          // 30 secondes

interface CacheEntry {
  online: boolean;
  ts: number;
}

class OnlineStatusService {
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private cache: Map<string, CacheEntry> = new Map();

  // ── Heartbeat ────────────────────────────────────────────────────────────
  startHeartbeat() {
    this.sendHeartbeat();
    this.heartbeatTimer = setInterval(() => this.sendHeartbeat(), HEARTBEAT_INTERVAL);
  }

  stopHeartbeat() {
    if (this.heartbeatTimer !== null) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private async sendHeartbeat() {
    try {
      await ApiClient.post(API_CONFIG.BASE_URL + API_CONFIG.ENDPOINTS.ONLINE_STATUS, {});
    } catch {
      // silencieux - pas de connexion = pas grave
    }
  }

  // ── Récupérer les statuts ─────────────────────────────────────────────────
  async getStatuses(userIds: string[]): Promise<Record<string, boolean>> {
    if (!userIds.length) return {};

    const now = Date.now();
    const needed: string[] = [];
    const result: Record<string, boolean> = {};

    for (const id of userIds) {
      const cached = this.cache.get(id);
      if (cached && now - cached.ts < CACHE_TTL) {
        result[id] = cached.online;
      } else {
        needed.push(id);
      }
    }

    if (needed.length === 0) return result;

    try {
      const idsParam = needed.join(',');
      const resp = await ApiClient.get<{success: boolean; data: Record<string, boolean>}>(
        API_CONFIG.BASE_URL + API_CONFIG.ENDPOINTS.ONLINE_STATUS + `?user_ids=${encodeURIComponent(idsParam)}`
      );
      const data: Record<string, boolean> = resp?.data ?? {};
      for (const id of needed) {
        const online = data[id] ?? false;
        this.cache.set(id, {online, ts: now});
        result[id] = online;
      }
    } catch {
      for (const id of needed) {
        result[id] = false;
      }
    }

    return result;
  }

  isOnline(userId: string): boolean {
    const cached = this.cache.get(userId);
    if (!cached) return false;
    if (Date.now() - cached.ts > CACHE_TTL) return false;
    return cached.online;
  }
}

export default new OnlineStatusService();
