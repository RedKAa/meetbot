// API configuration for connecting to the server
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

export interface ApiResponse<T = any> {
  success?: boolean;
  error?: string;
  [key: string]: any;
}

// Generic API request function
async function apiRequest<T = any>(
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
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('API request failed:', error);
    throw error;
  }
}

// GET request
export async function apiGet<T = any>(endpoint: string): Promise<T> {
  return apiRequest<T>(endpoint, { method: 'GET' });
}

// POST request
export async function apiPost<T = any>(
  endpoint: string,
  data?: any
): Promise<T> {
  return apiRequest<T>(endpoint, {
    method: 'POST',
    body: data ? JSON.stringify(data) : undefined,
  });
}

// PUT request
export async function apiPut<T = any>(
  endpoint: string,
  data?: any
): Promise<T> {
  return apiRequest<T>(endpoint, {
    method: 'PUT',
    body: data ? JSON.stringify(data) : undefined,
  });
}

// DELETE request
export async function apiDelete<T = any>(endpoint: string): Promise<T> {
  return apiRequest<T>(endpoint, { method: 'DELETE' });
}

// Authentication API calls
export const authApi = {
  login: async (email: string, password: string) => {
    return apiPost<ApiResponse>('/api/auth/login', { email, password });
  },
  
  register: async (email: string, password: string) => {
    return apiPost<ApiResponse>('/api/auth/register', { email, password });
  },
};

// Session API calls
export const sessionApi = {
  getLiveSessions: async () => {
    return apiGet<{ items: any[] }>('/api/sessions/live');
  },
  
  getCompletedSessions: async () => {
    return apiGet<{ items: any[] }>('/api/sessions/completed');
  },
  
  getSessionDetails: async (sessionId: string) => {
    return apiGet(`/api/sessions/${sessionId}`);
  },
  
  startRecording: async (meetingUrl: string, botName: string, duration?: number) => {
    return apiPost('/api/recordings', {
      meetingUrl,
      botName,
      durationSec: duration,
    });
  },
};

export default {
  get: apiGet,
  post: apiPost,
  put: apiPut,
  delete: apiDelete,
  auth: authApi,
  session: sessionApi,
};