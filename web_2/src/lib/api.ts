// API configuration for connecting to the server
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

export interface User {
  id: string;
  email: string;
  createdAt: string;
}

export interface SessionListItem {
  id: string;
  type: "live" | "completed";
  meetingUrl?: string | null;
  startedAt?: string | null;
  archivedAt?: string | null;
}

export interface SessionDetailsResponse {
  sessionId: string;
  durationMs: number;
  idleMsBeforeClose?: number;
  stats?: {
    jsonMessages: number;
    mixedAudioFrames: number;
    participantAudioFrames: number;
    videoFrames: number;
    encodedVideoChunks: number;
    unknownFrames: number;
  };
  metadata?: {
    sessionId: string;
    port: number;
    recordingsRoot: string;
    remoteAddress: string;
    userAgent: string;
    startedAtIso: string;
    audioFormat: string;
    meetingUrl: string;
    botName: string;
    audioFiles: string;
    participants: Array<{
      deviceId: string;
      displayName: string;
      fullName: string;
      isCurrentUser: boolean;
    }>;
    archivePath: string;
    manifestPath: string;
  };
  overallSummary?: {
    summary: string;
    keyPoints: string[];
  } | null;
  overallTranscript?: {
    text: string;
    confidence: number;
    duration: number;
    language: string;
  } | null;
  participantDetails?: Array<{
    id: string;
    audioFiles: Array<{
      filename: string;
      path: string;
    }>;
    transcripts: Array<{
      filename: string;
      data: {
        text: string;
        confidence: number;
        duration: number;
        language: string;
      };
    }>;
    summaries: Array<{
      filename: string;
      data: {
        summary: string;
        keyPoints: string[];
      };
    }>;
  }>;
  audioFiles?: {
    mixedAudio: string;
  };
}

export interface ApiResponse<T = unknown> {
  success?: boolean;
  error?: string;
  data?: T;
  [key: string]: unknown;
}

// Generic API request function
async function apiRequest<T = unknown>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;
  
  const defaultOptions: RequestInit = {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  };

  try {
    const response = await fetch(url, defaultOptions);
    // if (!response.ok) {
    //   throw new Error(`HTTP error! status: ${response.status}`);
    // }
    
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('API request failed:', error);
    throw error;
  }
}

// GET request
export async function apiGet<T = unknown>(endpoint: string): Promise<T> {
  return apiRequest<T>(endpoint, { method: 'GET' });
}

// POST request
export async function apiPost<T = unknown, D = Record<string, unknown>>(
  endpoint: string,
  data?: D
): Promise<T> {
  return apiRequest<T>(endpoint, {
    method: 'POST',
    body: data ? JSON.stringify(data) : undefined,
  });
}

// PUT request
export async function apiPut<T = unknown, D = Record<string, unknown>>(
  endpoint: string,
  data?: D
): Promise<T> {
  return apiRequest<T>(endpoint, {
    method: 'PUT',
    body: data ? JSON.stringify(data) : undefined,
  });
}

// DELETE request
export async function apiDelete<T = unknown>(endpoint: string): Promise<T> {
  return apiRequest<T>(endpoint, { method: 'DELETE' });
}

// Authentication API calls
export const authApi = {
  login: async (email: string, password: string) => {
    return apiPost<ApiResponse<{ user: Omit<User, 'password'> }>>('/api/auth/login', { email, password });
  },
  
  register: async (email: string, password: string) => {
    return apiPost<ApiResponse>('/api/auth/register', { email, password });
  },
};

// Session API calls
export const sessionApi = {
  getLiveSessions: async () => {
    return apiGet<{ items: SessionListItem[] }>('/api/sessions/live');
  },
  
  getCompletedSessions: async () => {
    return apiGet<{ items: SessionListItem[] }>('/api/sessions/completed');
  },
  
  getSessionDetails: async (sessionId: string) => {
    return apiGet<SessionDetailsResponse>(`/api/sessions/${sessionId}`);
  },
  
  startRecording: async (meetingUrl: string, botName: string, duration?: number) => {
    return apiPost('/api/recordings', {
      meetingUrl,
      botName,
      durationSec: duration,
    });
  },
};

const api = {
  get: apiGet,
  post: apiPost,
  put: apiPut,
  delete: apiDelete,
  auth: authApi,
  session: sessionApi,
};

export default api;