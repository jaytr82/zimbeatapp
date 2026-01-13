import { Song, QuizQuestion, QuizResult, Post, PostType, Comment, TelegramUser, UserRole, VerificationRequest, VerificationStatus } from '../types';
import { claimQuizReward } from './rewardService';
import { CONFIG } from './config';
import { authService } from './authService';

// --- API CLIENT ---

export class ApiError extends Error {
  statusCode: number;
  code?: string;
  retryAfter?: number;

  constructor(message: string, statusCode: number, code?: string, retryAfter?: number) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code;
    this.retryAfter = retryAfter;
  }
}

/**
 * Generic Fetch Wrapper with Error Handling, Auth Injection, and Security Headers
 */
async function apiRequest<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = authService.getAccessToken();
  
  // Prevent request if no token is available (Gatekeeper Check)
  if (!token) {
     throw new ApiError("Session expired or invalid. Please reload.", 401);
  }

  const url = `${CONFIG.API_BASE_URL}${endpoint}`;
  
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    'X-App-Version': CONFIG.APP_VERSION,
    'X-Client-Platform': 'twa', // Telegram Web App
    ...(options.headers || {}),
  };

  headers['Authorization'] = `Bearer ${token}`;

  try {
    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (response.status === 401) {
       console.warn("Unauthorized access. Token might be expired.");
    }

    if (response.status === 429) {
        const errorData = await response.json().catch(() => ({}));
        const retryAfter = errorData.retry_after_seconds || 10;
        throw new ApiError(
            errorData.message || `Too fast! Wait ${retryAfter}s.`, 
            429, 
            'RATE_LIMIT_EXCEEDED', 
            retryAfter
        );
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new ApiError(
          errorData.message || `API Error: ${response.statusText}`, 
          response.status
      );
    }

    return await response.json();
  } catch (error) {
    if (error instanceof ApiError) {
        throw error;
    }
    // Log the specific URL that failed to help debug config issues
    console.error(`[DataService] Request failed for ${url}:`, error);
    throw new Error('Network error. Please check your connection and API configuration.');
  }
}

// --- TRANSACTIONS ---

export const verifyTransaction = async (
    txHash: string, 
    type: 'quiz_reward' | 'tip', 
    metadata: any
): Promise<boolean> => {
    try {
        await apiRequest('/transactions-verify', {
            method: 'POST',
            body: JSON.stringify({ txHash, type, metadata })
        });
        return true;
    } catch (e) {
        console.warn("Verification request failed:", e);
        return false;
    }
};

// --- MUSIC ---

export const fetchFeaturedSongs = async (): Promise<Song[]> => {
  // In a real app, this would also use an Edge Function or Supabase Rest API directly
  // For now, we assume an edge function 'music-featured' exists
  const data = await apiRequest<{ songs: Song[] }>('/music-featured');
  return data.songs;
};

// --- IDENTITY & VERIFICATION ---

export const getVerificationStatus = async (): Promise<{ status: VerificationStatus, message?: string }> => {
  try {
    // Maps to supabase/functions/artist-verify (GET)
    return await apiRequest<{ status: VerificationStatus, message?: string }>('/artist-verify');
  } catch (e) {
    return { status: 'idle' };
  }
};

export const submitVerificationRequest = async (data: VerificationRequest): Promise<boolean> => {
    // Maps to supabase/functions/artist-verify (POST)
    await apiRequest('/artist-verify', {
        method: 'POST',
        body: JSON.stringify({ action: 'apply', ...data })
    });
    return true;
};

// --- QUIZ & INTEGRITY ---

export const fetchQuizQuestions = async (): Promise<QuizQuestion[]> => {
  return await apiRequest<QuizQuestion[]>('/quiz-questions');
};

export const startQuizSession = async (questionId: string): Promise<string> => {
    const data = await apiRequest<{ sessionId: string }>('/quiz-session', {
        method: 'POST',
        body: JSON.stringify({ questionId })
    });
    return data.sessionId;
};

export const submitQuizResult = async (
    questionId: string, 
    answerIndex: number, 
    sessionId: string, 
    durationWatched: number
): Promise<QuizResult & { correctAnswerIndex?: number }> => {
    if (!sessionId) return { success: false, message: "Invalid session." };

    try {
        const response = await apiRequest<{
            success: boolean;
            correct: boolean;
            message: string;
            correctAnswerIndex?: number;
            rewardAmount?: number;
            signature?: string; 
        }>('/quiz-submit', {
            method: 'POST',
            body: JSON.stringify({
                questionId,
                answerIndex,
                sessionId,
                durationWatched 
            })
        });

        let rewardPayload = undefined;
        if (response.success && response.correct && response.rewardAmount) {
            rewardPayload = await claimQuizReward(response.rewardAmount, response.signature);
        }

        return {
            success: response.success,
            correct: response.correct,
            message: response.message,
            correctAnswerIndex: response.correctAnswerIndex,
            rewardPayload
        };

    } catch (error: any) {
        return {
            success: false,
            message: error.message || "Submission failed"
        };
    }
};

// --- SOCIAL FEED ---

export const fetchSocialFeed = async (role: 'user' | 'artist', userId: string): Promise<Post[]> => {
  // Assuming a generic feed function
  return await apiRequest<Post[]>(`/social-feed?role=${role}&userId=${userId}`);
};

export const publishPost = async (content: string, type: PostType, artist: { id: string, name: string }): Promise<Post> => {
  // Direct table insert is safer via Edge Function for complex logic, or Row Level Security
  return await apiRequest<Post>('/social-post', {
    method: 'POST',
    body: JSON.stringify({ content, type, artistId: artist.id })
  });
};

export const likePost = async (postId: string, userId: string): Promise<boolean> => {
  const result = await apiRequest<{ isLiked: boolean }>(`/social-like`, {
    method: 'POST',
    body: JSON.stringify({ postId, userId })
  });
  return result.isLiked;
};

export const toggleFollowArtist = async (artistId: string, shouldFollow: boolean): Promise<boolean> => {
  await apiRequest('/social-follow', {
    method: 'POST',
    body: JSON.stringify({ artistId, action: shouldFollow ? 'follow' : 'unfollow' })
  });
  return shouldFollow;
};

export const fetchComments = async (postId: string): Promise<Comment[]> => {
    return await apiRequest<Comment[]>(`/social-comments?postId=${postId}`);
};

export const postComment = async (
  postId: string, 
  content: string, 
  user: TelegramUser, 
  role: UserRole
): Promise<Comment> => {
    return await apiRequest<Comment>(`/social-comments`, {
        method: 'POST',
        body: JSON.stringify({
            postId,
            content
        })
    });
};