import { CONFIG } from './config';
import { authService } from './authService';

interface AnalyticsEvent {
  name: string;
  properties?: Record<string, any>;
  timestamp: number;
}

const BATCH_SIZE = 10;
const FLUSH_INTERVAL = 5000; // 5 seconds

class AnalyticsService {
  private queue: AnalyticsEvent[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    // Attempt to flush on page unload
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', () => this.flush(true));
    }
  }

  /**
   * Tracks a user action.
   * @param name The event name (e.g., 'quiz_start', 'view_artist')
   * @param properties Additional metadata
   */
  track(name: string, properties: Record<string, any> = {}) {
    if (!CONFIG.ENABLE_ANALYTICS) return;

    const event: AnalyticsEvent = {
      name,
      properties,
      timestamp: Date.now(),
    };

    this.queue.push(event);

    if (this.queue.length >= BATCH_SIZE) {
      this.flush();
    } else if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => this.flush(), FLUSH_INTERVAL);
    }
  }

  /**
   * Sends queued events to the backend.
   * @param useBeacon If true, uses navigator.sendBeacon (for page unload)
   */
  async flush(useBeacon = false) {
    if (this.queue.length === 0) return;

    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    const payload = [...this.queue];
    this.queue = [];

    const endpoint = `${CONFIG.API_BASE_URL}/analytics/batch`;
    const token = authService.getAccessToken();

    // Prepare data
    const body = JSON.stringify({ events: payload });

    try {
      if (useBeacon && navigator.sendBeacon) {
        // Beacon does not support custom Auth headers easily, 
        // usually rely on cookies or query params, but we fallback gracefully.
        const blob = new Blob([body], { type: 'application/json' });
        navigator.sendBeacon(endpoint, blob);
      } else {
        await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {})
          },
          body,
          keepalive: true // Important for background requests
        });
      }
    } catch (e) {
      console.warn('Analytics flush failed', e);
      // Optional: re-queue events if critical, but for analytics we usually drop to avoid memory leaks
    }
  }
}

export const analytics = new AnalyticsService();