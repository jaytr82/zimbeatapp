
export interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  is_premium?: boolean;
}

export type UserRole = 'artist' | 'user';

export type VerificationStatus = 'idle' | 'pending' | 'approved' | 'rejected';

export interface VerificationRequest {
  bio: string;
  genre: string;
  socialLink: string; // Portfolio or Social Media URL for proof
}

export interface Song {
  id: string;
  title: string;
  artist: string;
  artistId: string; // Links to the registered Artist account
  coverUrl: string;
  youtubeId: string;
  plays: number;
}

export interface QuizQuestion {
  id: string;
  question: string;
  options: string[];
  correctAnswer: number;
  media: {
    youtubeId: string;
    startSeconds: number; 
    duration: number; 
  };
  rewardAmount: number;
  isCompleted?: boolean; // Integrity flag
}

export interface QuizResult {
  success: boolean;
  message: string;
  correct?: boolean;
  rewardPayload?: RewardTransaction;
}

export interface Comment {
  id: string;
  postId: string;
  userId: number;
  userName: string;
  userRole: UserRole;
  content: string;
  timestamp: number;
}

// Stage 5: Social Types
export type PostType = 'news' | 'show' | 'release';

export interface Post {
  id: string;
  artistId: string;
  artistName: string;
  artistWallet: string; // Destination for tips
  content: string;
  type: PostType;
  timestamp: number;
  likes: number;
  comments: number;
  isLikedByMe?: boolean;
  isFollowedByMe?: boolean; // New field for relationship tracking
}

// Global App State
export interface AppState {
  telegramUser: TelegramUser | null;
  walletAddress: string | null;
  role: UserRole;
  isLoading: boolean;
  error: string | null;
}

export enum Tab {
  HOME = 'home',
  QUIZ = 'quiz',
  WALLET = 'wallet',
  PROFILE = 'profile',
}

export interface AssetBalance {
  symbol: string;
  balance: string; 
  decimals: number;
  rawBalance: string;
}

export interface RewardTransaction {
  validUntil: number;
  messages: {
    address: string;
    amount: string;
    payload?: string; 
  }[];
}

export interface AppContextType {
  // Identity State
  telegramUser: TelegramUser | null;
  walletAddress: string | null;
  role: UserRole;
  viewMode: UserRole; // Current visual context (Artist can switch, User cannot)
  setViewMode: (mode: UserRole) => void;
  isIdentityLoading: boolean;

  // App Functional State
  currentSong: Song | null;
  setCurrentSong: (song: Song | null) => void;
  isPlaying: boolean;
  setIsPlaying: (playing: boolean) => void;
  
  // Real Assets
  zbtToken: AssetBalance;
  tonBalance: string;
  isBalanceLoading: boolean;
  refreshBalance: () => void;
}
