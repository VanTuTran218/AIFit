import type { AuthUser } from '../types';
import { MOCK_AUTH } from '../data/mockData';
import { api, ApiError, BackendOfflineError, tokenStorage, type BeOtpSentResponse } from './api';
import { mapBeUserToAuthUser } from './apiAdapters';

const STORAGE_KEY = 'aifit_user';
const MOCK_OTP_KEY = 'aifit_mock_otps';

export interface LoginResult {
  success: boolean;
  user?: AuthUser;
  error?: 'invalid_credentials' | 'account_locked' | 'network_error';
}

export interface RegisterResult {
  success: boolean;
  error?: 'email_exists' | 'invalid_otp' | 'network_error';
  message?: string;
}

export interface OtpActionResult {
  success: boolean;
  data?: BeOtpSentResponse;
  error?: 'email_exists' | 'user_not_found' | 'account_locked' | 'invalid_otp' | 'network_error';
  message?: string;
}

function saveMockOtp(email: string, code: string) {
  const raw = sessionStorage.getItem(MOCK_OTP_KEY);
  const map = raw ? (JSON.parse(raw) as Record<string, string>) : {};
  map[email.toLowerCase()] = code;
  sessionStorage.setItem(MOCK_OTP_KEY, JSON.stringify(map));
}

function verifyMockOtp(email: string, code: string): boolean {
  const raw = sessionStorage.getItem(MOCK_OTP_KEY);
  const map = raw ? (JSON.parse(raw) as Record<string, string>) : {};
  return map[email.toLowerCase()] === code.trim();
}

async function mockLogin(email: string, password: string): Promise<LoginResult> {
  await new Promise(r => setTimeout(r, 350));

  const mockAuthRecord = MOCK_AUTH as Record<string, { password: string; user: AuthUser } | undefined>;
  const entry = mockAuthRecord[email.toLowerCase()];
  if (!entry || entry.password !== password) {
    return { success: false, error: 'invalid_credentials' };
  }

  const { MOCK_USERS } = await import('../data/mockData');
  const user = MOCK_USERS.find(u => u.email.toLowerCase() === email.toLowerCase());
  if (user?.status === 'Locked') {
    return { success: false, error: 'account_locked' };
  }

  localStorage.setItem(STORAGE_KEY, JSON.stringify(entry.user));
  return { success: true, user: entry.user };
}

async function mockRegister(fullName: string, email: string, otpCode?: string): Promise<RegisterResult> {
  await new Promise(r => setTimeout(r, 350));

  const { MOCK_USERS } = await import('../data/mockData');
  const exists = MOCK_USERS.some(u => u.email.toLowerCase() === email.toLowerCase());
  const mockAuthRecord = MOCK_AUTH as Record<string, { password: string; user: AuthUser } | undefined>;
  if (exists || mockAuthRecord[email.toLowerCase()]) {
    return { success: false, error: 'email_exists' };
  }

  if (otpCode && !verifyMockOtp(email, otpCode)) {
    return { success: false, error: 'invalid_otp', message: 'Mã xác thực OTP không chính xác.' };
  }

  const newUser: AuthUser = { id: Date.now(), fullName, email, role: 'Trainee' };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(newUser));
  return { success: true };
}

export const authService = {
  async sendRegisterOtp(email: string, fullName?: string): Promise<OtpActionResult> {
    try {
      const data = await api.auth.sendRegisterOtp({ email, fullName });
      return { success: true, data };
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 409) {
          return { success: false, error: 'email_exists', message: err.message };
        }
        return { success: false, error: 'network_error', message: err.message };
      }
      if (err instanceof BackendOfflineError) {
        const otp = String(Math.floor(100000 + Math.random() * 900000));
        saveMockOtp(email, otp);
        return {
          success: true,
          data: {
            message: `Mã OTP thử nghiệm cho ${email}`,
            expiresInSeconds: 300,
            deliveryMode: 'dev',
            devOtp: otp,
          },
        };
      }
      return { success: false, error: 'network_error' };
    }
  },

  async login(email: string, password: string): Promise<LoginResult> {
    try {
      const res = await api.auth.login(email, password);
      tokenStorage.setTokens(res.accessToken, res.refreshToken);
      const user = mapBeUserToAuthUser(res.user);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
      return { success: true, user };
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 403) return { success: false, error: 'account_locked' };
        if (err.status === 401 || err.status === 400) {
          const mockAuthRecord = MOCK_AUTH as Record<string, { password: string; user: AuthUser } | undefined>;
          if (mockAuthRecord[email.toLowerCase()]?.password === password) {
            tokenStorage.clear();
            return mockLogin(email, password);
          }
          return { success: false, error: 'invalid_credentials' };
        }
      }
      if (err instanceof BackendOfflineError) {
        tokenStorage.clear();
        return mockLogin(email, password);
      }
      return { success: false, error: 'network_error' };
    }
  },

  async register(fullName: string, email: string, password: string, otpCode?: string): Promise<RegisterResult> {
    try {
      await api.auth.register({ fullName, email, password, otpCode });
      return { success: true };
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 409) {
          return { success: false, error: 'email_exists', message: err.message };
        }
        if (err.status === 400) {
          return { success: false, error: 'invalid_otp', message: err.message };
        }
      }
      if (err instanceof BackendOfflineError) {
        return mockRegister(fullName, email, otpCode);
      }
      return { success: false, error: 'network_error' };
    }
  },

  async forgotPassword(email: string): Promise<OtpActionResult> {
    try {
      const data = await api.auth.forgotPassword(email);
      return { success: true, data };
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 404) return { success: false, error: 'user_not_found', message: err.message };
        if (err.status === 403) return { success: false, error: 'account_locked', message: err.message };
        return { success: false, error: 'network_error', message: err.message };
      }
      if (err instanceof BackendOfflineError) {
        const otp = String(Math.floor(100000 + Math.random() * 900000));
        saveMockOtp(email, otp);
        return {
          success: true,
          data: {
            message: `Đã tạo mã OTP khôi phục mật khẩu cho ${email}`,
            expiresInSeconds: 300,
            deliveryMode: 'dev',
            devOtp: otp,
          },
        };
      }
      return { success: false, error: 'network_error' };
    }
  },

  async verifyResetOtp(email: string, otpCode: string): Promise<{ success: boolean; message?: string }> {
    try {
      await api.auth.verifyResetOtp(email, otpCode);
      return { success: true };
    } catch (err) {
      if (err instanceof ApiError) {
        return { success: false, message: err.message };
      }
      if (err instanceof BackendOfflineError) {
        return verifyMockOtp(email, otpCode)
          ? { success: true }
          : { success: false, message: 'Mã xác thực OTP không chính xác.' };
      }
      return { success: false, message: 'Không thể kết nối máy chủ.' };
    }
  },

  async resetPassword(
    email: string,
    otpCode: string,
    newPassword: string,
    confirmNewPassword: string
  ): Promise<{ success: boolean; message?: string }> {
    try {
      const res = await api.auth.resetPassword({
        email,
        otpCode,
        newPassword,
        confirmNewPassword,
      });
      return { success: true, message: res.message };
    } catch (err) {
      if (err instanceof ApiError) {
        return { success: false, message: err.message };
      }
      if (err instanceof BackendOfflineError) {
        return verifyMockOtp(email, otpCode)
          ? { success: true, message: 'Đặt lại mật khẩu thành công.' }
          : { success: false, message: 'Mã xác thực OTP không chính xác.' };
      }
      return { success: false, message: 'Không thể kết nối máy chủ.' };
    }
  },

  logout(): void {
    tokenStorage.clear();
    localStorage.removeItem(STORAGE_KEY);
  },

  getUser(): AuthUser | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      return JSON.parse(raw) as AuthUser;
    } catch {
      return null;
    }
  },

  updateUser(updates: Partial<AuthUser>): void {
    const current = authService.getUser();
    if (current) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...current, ...updates }));
    }
  },
};
