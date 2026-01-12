import { useState, useCallback, useRef } from 'react';

type ActionType = 'comment' | 'post' | 'like' | 'tip';

interface RateLimitConfig {
  [key: string]: number; // Cooldown in milliseconds
}

// Configuration for different actions
const COOLDOWNS: RateLimitConfig = {
  comment: 10000, // 10 seconds between comments
  post: 60000,    // 1 minute between posts
  like: 500,      // 500ms debounce for likes
  tip: 2000       // 2 seconds to prevent double-click transactions
};

export function useRateLimit() {
  const [error, setError] = useState<string | null>(null);
  
  // Use refs to track timestamps without causing re-renders
  const lastActions = useRef<Record<string, number>>({});

  /**
   * Checks if an action is allowed. 
   * Returns true if allowed, false if blocked.
   * Sets a user-friendly error message if blocked.
   */
  const checkLimit = useCallback((action: ActionType): boolean => {
    const now = Date.now();
    const lastTime = lastActions.current[action] || 0;
    const cooldown = COOLDOWNS[action];
    const timePassed = now - lastTime;

    if (timePassed < cooldown) {
      const remainingSeconds = Math.ceil((cooldown - timePassed) / 1000);
      
      // Customize message based on context
      if (action === 'like') {
        // Silent block for likes (don't spam toast)
        return false;
      }
      
      setError(`Please slow down. Wait ${remainingSeconds}s before ${action}ing again.`);
      return false;
    }

    // Update timestamp
    lastActions.current[action] = now;
    setError(null);
    return true;
  }, []);

  const clearError = () => setError(null);

  return {
    checkLimit,
    rateLimitError: error,
    clearRateLimitError: clearError
  };
}