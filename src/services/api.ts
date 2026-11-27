// Typed HTTP client matching AIFit ASP.NET Core 8 Backend (/api/*)

const ACCESS_TOKEN_KEY = 'aifit_access_token';
const REFRESH_TOKEN_KEY = 'aifit_refresh_token';

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') || '';

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = 'ApiError';
  }
}

export class BackendOfflineError extends Error {
  constructor(message = 'Backend server is unreachable') {
    super(message);
    this.name = 'BackendOfflineError';
  }
}

// ─── Backend DTO Contracts ────────────────────────────────────────────────────

export interface BeUserDto {
  id: number;
  email: string;
  fullName: string;
  role: 'Trainee' | 'Admin' | string;
  gender?: string | null;
  heightCm?: number | null;
  weightKg?: number | null;
  createdAt: string;
}

export interface BeAuthResponse {
  accessToken: string;
  accessTokenExpiresAt: string;
  refreshToken: string;
  user: BeUserDto;
}

export interface BeOtpSentResponse {
  message: string;
  expiresInSeconds: number;
  deliveryMode: 'gmail' | 'dev';
  devOtp?: string | null;
  smtpReason?: string | null;
}

export interface BeSmtpStatusResponse {
  configured: boolean;
  email: string;
  message?: string;
}

export interface BeFeedbackRuleDto {
  id: number;
  code: string;
  name: string;
  description: string;
  severity: 'Warning' | 'Error' | string;
  thresholdsJson: string;
  isEnabled: boolean;
}

export interface BeExerciseDto {
  id: number;
  code: string;
  name: string;
  description: string;
  videoUrl?: string | null;
  imageUrl?: string | null;
  difficulty: string;
  targetMuscles?: string | null;
  ruleCount: number;
}

export interface BeExerciseDetailDto extends BeExerciseDto {
  rules: BeFeedbackRuleDto[];
}

export interface BeRepDetailRequest {
  repNumber: number;
  isCorrect: boolean;
  ruleCode?: string | null;
  occurredAtMs: number;
  anglesJson?: string | null;
}

export interface BeSaveSessionRequest {
  exerciseCode: string;
  startedAt?: string;
  durationSec: number;
  totalReps: number;
  correctReps: number;
  formScore?: number;
  caloriesBurned?: number;
  status?: string;
  note?: string;
  reps: BeRepDetailRequest[];
}

export interface BeRepDetailDto {
  id: number;
  repNumber: number;
  isCorrect: boolean;
  ruleCode?: string | null;
  ruleName?: string | null;
  occurredAtMs: number;
  anglesJson?: string | null;
}

export interface BeSessionDto {
  id: number;
  exerciseCode: string;
  exerciseName: string;
  startedAt: string;
  durationSec: number;
  totalReps: number;
  correctReps: number;
  formScore: number;
  caloriesBurned: number;
  status: string;
}

export interface BeSessionDetailDto extends BeSessionDto {
  note?: string | null;
  reps: BeRepDetailDto[];
}

export interface BePagedResult<T> {
  items: T[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export interface BeStatsSummaryDto {
  totalSessions: number;
  totalReps: number;
  totalCorrectReps: number;
  overallFormScore: number;
  totalMinutes: number;
  totalCalories: number;
  currentStreakDays: number;
  longestStreakDays: number;
  lastWorkoutAt?: string | null;
  repsByExercise: Record<string, number>;
}

export interface BeDailyStatDto {
  date: string;
  sessions: number;
  totalReps: number;
  correctReps: number;
  avgFormScore: number;
  minutes: number;
  calories: number;
}

export interface BeAdminUserDto {
  id: number;
  email: string;
  fullName: string;
  role: string;
  isActive: boolean;
  createdAt: string;
  totalSessions: number;
  lastWorkoutAt?: string | null;
}

export interface BeAdminDashboardDto {
  totalUsers: number;
  activeUsers: number;
  totalSessions: number;
  totalReps: number;
  avgFormScore: number;
  sessionsByExercise: Array<{ exerciseCode: string; exerciseName: string; sessionCount: number }>;
  sessionsLast7Days: Array<{ date: string; count: number }>;
  topRuleViolations: Array<{ ruleCode: string; ruleName: string; fireCount: number }>;
}

export interface BeSystemLogDto {
  id: number;
  level: string;
  type: string;
  message: string;
  userEmail?: string | null;
  exercise?: string | null;
  path?: string | null;
  createdAt: string;
}

export interface BeLogListDto {
  page: number;
  pageSize: number;
  total: number;
  items: BeSystemLogDto[];
}

// ─── Token Helpers ────────────────────────────────────────────────────────────

export const tokenStorage = {
  getAccessToken: () => localStorage.getItem(ACCESS_TOKEN_KEY),
  getRefreshToken: () => localStorage.getItem(REFRESH_TOKEN_KEY),
  hasTokens: () => Boolean(localStorage.getItem(ACCESS_TOKEN_KEY)),
  setTokens: (accessToken: string, refreshToken: string) => {
    localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
    localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
  },
  clear: () => {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
  },
};

// ─── Core Request with Auto-Refresh ───────────────────────────────────────────

let refreshPromise: Promise<string | null> | null = null;

async function tryRefreshToken(): Promise<string | null> {
  const refreshToken = tokenStorage.getRefreshToken();
  if (!refreshToken) return null;

  if (!refreshPromise) {
    refreshPromise = (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
        });
        if (!res.ok) {
          tokenStorage.clear();
          return null;
        }
        const data = (await res.json()) as BeAuthResponse;
        tokenStorage.setTokens(data.accessToken, data.refreshToken);
        return data.accessToken;
      } catch {
        return null;
      } finally {
        refreshPromise = null;
      }
    })();
  }

  return refreshPromise;
}

async function request<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  const headers = new Headers(init.headers);
  if (!headers.has('Content-Type') && init.body) {
    headers.set('Content-Type', 'application/json');
  }

  const token = tokenStorage.getAccessToken();
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, { ...init, headers });
  } catch {
    throw new BackendOfflineError();
  }

  // Vite dev proxy returns 500/502/504 without JSON content-type when :5000 is down
  const contentType = res.headers.get('content-type') || '';
  if (res.status >= 502 || (res.status === 500 && !contentType.includes('application/json'))) {
    throw new BackendOfflineError();
  }

  if (res.status === 401 && retry && tokenStorage.getRefreshToken()) {
    const nextToken = await tryRefreshToken();
    if (nextToken) {
      headers.set('Authorization', `Bearer ${nextToken}`);
      return request<T>(path, { ...init, headers }, false);
    }
  }

  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    if (contentType.includes('application/json')) {
      try {
        const body = (await res.json()) as { message?: string; title?: string };
        message = body.message || body.title || message;
      } catch {
        // ignore JSON parse errors
      }
    }
    throw new ApiError(res.status, message);
  }

  if (res.status === 204) {
    return undefined as T;
  }

  return (await res.json()) as T;
}

// ─── Endpoint Modules ─────────────────────────────────────────────────────────

export const api = {
  auth: {
    sendRegisterOtp: (payload: { email: string; fullName?: string }) =>
      request<BeOtpSentResponse>('/api/auth/send-register-otp', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    login: (email: string, password: string) =>
      request<BeAuthResponse>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      }),
    register: (payload: {
      fullName: string;
      email: string;
      password: string;
      otpCode?: string;
      gender?: string;
      heightCm?: number;
      weightKg?: number;
    }) =>
      request<BeAuthResponse>('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    forgotPassword: (email: string) =>
      request<BeOtpSentResponse>('/api/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email }),
      }),
    verifyResetOtp: (email: string, otpCode: string) =>
      request<{ valid: boolean }>('/api/auth/verify-reset-otp', {
        method: 'POST',
        body: JSON.stringify({ email, otpCode }),
      }),
    resetPassword: (payload: {
      email: string;
      otpCode: string;
      newPassword: string;
      confirmNewPassword: string;
    }) =>
      request<{ message: string }>('/api/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    getSmtpStatus: () => request<BeSmtpStatusResponse>('/api/auth/smtp-status'),
    saveSmtpConfig: (payload: { email: string; appPassword: string }) =>
      request<BeSmtpStatusResponse>('/api/auth/smtp-config', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    me: () => request<BeUserDto>('/api/auth/me'),
  },

  exercises: {
    getAll: () => request<BeExerciseDto[]>('/api/exercises'),
    getByCode: (code: string) => request<BeExerciseDetailDto>(`/api/exercises/${encodeURIComponent(code)}`),
  },

  sessions: {
    save: (payload: BeSaveSessionRequest) =>
      request<BeSessionDetailDto>('/api/sessions', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    getHistory: (params?: { exerciseCode?: string; page?: number; pageSize?: number }) => {
      const qs = new URLSearchParams();
      if (params?.exerciseCode) qs.set('exerciseCode', params.exerciseCode);
      if (params?.page) qs.set('page', String(params.page));
      if (params?.pageSize) qs.set('pageSize', String(params.pageSize));
      const query = qs.toString();
      return request<BePagedResult<BeSessionDto>>(`/api/sessions${query ? `?${query}` : ''}`);
    },
    getById: (id: number) => request<BeSessionDetailDto>(`/api/sessions/${id}`),
  },

  stats: {
    getSummary: () => request<BeStatsSummaryDto>('/api/stats/summary'),
    getDaily: (days = 30) => request<BeDailyStatDto[]>(`/api/stats/daily?days=${days}`),
  },

  users: {
    getProfile: () => request<BeUserDto>('/api/users/profile'),
    updateProfile: (payload: {
      fullName: string;
      gender?: string;
      heightCm?: number;
      weightKg?: number;
    }) =>
      request<BeUserDto>('/api/users/profile', {
        method: 'PUT',
        body: JSON.stringify(payload),
      }),
    changePassword: (payload: {
      currentPassword: string;
      newPassword: string;
      confirmNewPassword: string;
    }) =>
      request<void>('/api/users/password', {
        method: 'PUT',
        body: JSON.stringify(payload),
      }),
  },

  admin: {
    getDashboard: () => request<BeAdminDashboardDto>('/api/admin/dashboard'),
    getUsers: (params?: { search?: string; page?: number; pageSize?: number }) => {
      const qs = new URLSearchParams();
      if (params?.search) qs.set('search', params.search);
      if (params?.page) qs.set('page', String(params.page));
      if (params?.pageSize) qs.set('pageSize', String(params.pageSize));
      const query = qs.toString();
      return request<BePagedResult<BeAdminUserDto>>(`/api/admin/users${query ? `?${query}` : ''}`);
    },
    updateUserStatus: (id: number, isActive: boolean) =>
      request<{ id: number; isActive: boolean }>(`/api/admin/users/${id}/status`, {
        method: 'PUT',
        body: JSON.stringify({ isActive }),
      }),
    deleteUser: (id: number) =>
      request<void>(`/api/admin/users/${id}`, {
        method: 'DELETE',
      }),
    getSessions: (params?: { exerciseCode?: string; page?: number; pageSize?: number }) => {
      const qs = new URLSearchParams();
      if (params?.exerciseCode) qs.set('exerciseCode', params.exerciseCode);
      if (params?.page) qs.set('page', String(params.page));
      if (params?.pageSize) qs.set('pageSize', String(params.pageSize));
      const query = qs.toString();
      return request<BePagedResult<BeSessionDto>>(`/api/admin/sessions${query ? `?${query}` : ''}`);
    },
    getRules: (exerciseCode?: string) => {
      const query = exerciseCode ? `?exerciseCode=${encodeURIComponent(exerciseCode)}` : '';
      return request<BeFeedbackRuleDto[]>(`/api/admin/rules${query}`);
    },
    updateRule: (
      id: number,
      payload: { name?: string; description?: string; thresholdsJson?: string; isEnabled?: boolean }
    ) =>
      request<BeFeedbackRuleDto>(`/api/admin/rules/${id}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      }),
    getLogs: (params?: { page?: number; pageSize?: number; level?: string; type?: string; days?: number }) => {
      const qs = new URLSearchParams();
      if (params?.page) qs.set('page', String(params.page));
      if (params?.pageSize) qs.set('pageSize', String(params.pageSize));
      if (params?.level) qs.set('level', params.level);
      if (params?.type) qs.set('type', params.type);
      if (params?.days) qs.set('days', String(params.days));
      const query = qs.toString();
      return request<BeLogListDto>(`/api/admin/logs${query ? `?${query}` : ''}`);
    },
  },

  logs: {
    create: (payload: { level: string; type: string; message: string; exercise?: string }) =>
      request<{ ok: boolean }>('/api/logs', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
  },
};
