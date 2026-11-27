import {
  MOCK_EXERCISES,
  MOCK_LOGS,
  MOCK_RULES,
  MOCK_SESSIONS,
  MOCK_USERS,
} from '../data/mockData';
import type {
  Exercise,
  ExerciseRule,
  SystemLog,
  User,
  WorkoutSession,
} from '../types';
import { api, tokenStorage, type BeAdminDashboardDto, type BeStatsSummaryDto } from './api';
import {
  mapBeAdminUserToFE,
  mapBeExerciseToFE,
  mapBeRuleToFE,
  mapBeSessionToFE,
  mapBeSystemLogToFE,
  mapWorkoutSessionToSaveRequest,
} from './apiAdapters';

export const dataService = {
  isLiveBackend(): boolean {
    return tokenStorage.hasTokens();
  },

  async getExercises(): Promise<Exercise[]> {
    if (!tokenStorage.hasTokens()) return MOCK_EXERCISES;
    try {
      const list = await api.exercises.getAll();
      return list.map(mapBeExerciseToFE);
    } catch {
      return MOCK_EXERCISES;
    }
  },

  async getSessions(exerciseCode?: string): Promise<WorkoutSession[]> {
    if (!tokenStorage.hasTokens()) return MOCK_SESSIONS;
    try {
      const paged = await api.sessions.getHistory({ exerciseCode, page: 1, pageSize: 50 });
      return paged.items.map(mapBeSessionToFE);
    } catch {
      return MOCK_SESSIONS;
    }
  },

  async getSessionById(id: number): Promise<WorkoutSession | null> {
    if (!tokenStorage.hasTokens()) {
      return MOCK_SESSIONS.find(s => s.id === id) || null;
    }
    try {
      const detail = await api.sessions.getById(id);
      return mapBeSessionToFE(detail);
    } catch {
      return MOCK_SESSIONS.find(s => s.id === id) || null;
    }
  },

  async saveSession(session: WorkoutSession): Promise<WorkoutSession> {
    if (!tokenStorage.hasTokens()) {
      localStorage.setItem('aifit_latest_session', JSON.stringify(session));
      return session;
    }
    try {
      const saved = await api.sessions.save(mapWorkoutSessionToSaveRequest(session));
      const mapped = mapBeSessionToFE(saved);
      localStorage.setItem('aifit_latest_session', JSON.stringify(mapped));
      return mapped;
    } catch {
      const offlineSession = { ...session, synced: false };
      localStorage.setItem('aifit_latest_session', JSON.stringify(offlineSession));
      return offlineSession;
    }
  },

  async getStatsSummary(): Promise<BeStatsSummaryDto | null> {
    if (!tokenStorage.hasTokens()) return null;
    try {
      return await api.stats.getSummary();
    } catch {
      return null;
    }
  },

  async updateProfile(fullName: string): Promise<boolean> {
    if (!tokenStorage.hasTokens()) return true;
    await api.users.updateProfile({ fullName });
    return true;
  },

  async changePassword(currentPassword: string, newPassword: string, confirmNewPassword: string): Promise<void> {
    if (!tokenStorage.hasTokens()) return;
    await api.users.changePassword({ currentPassword, newPassword, confirmNewPassword });
  },

  async getAdminDashboard(): Promise<BeAdminDashboardDto | null> {
    if (!tokenStorage.hasTokens()) return null;
    try {
      return await api.admin.getDashboard();
    } catch {
      return null;
    }
  },

  async getAdminUsers(): Promise<User[]> {
    if (!tokenStorage.hasTokens()) return MOCK_USERS;
    try {
      const paged = await api.admin.getUsers({ page: 1, pageSize: 50 });
      return paged.items.map(mapBeAdminUserToFE);
    } catch {
      return MOCK_USERS;
    }
  },

  async updateAdminUserStatus(id: number, isActive: boolean): Promise<void> {
    if (!tokenStorage.hasTokens()) return;
    await api.admin.updateUserStatus(id, isActive);
  },

  async deleteAdminUser(id: number): Promise<void> {
    if (!tokenStorage.hasTokens()) return;
    await api.admin.deleteUser(id);
  },

  async getAdminRules(): Promise<ExerciseRule[]> {
    if (!tokenStorage.hasTokens()) return MOCK_RULES;
    try {
      const rules = await api.admin.getRules();
      return rules.map(mapBeRuleToFE);
    } catch {
      return MOCK_RULES;
    }
  },

  async updateAdminRule(
    id: number,
    payload: { name?: string; description?: string; thresholdsJson?: string; isEnabled?: boolean }
  ): Promise<ExerciseRule | null> {
    if (!tokenStorage.hasTokens()) return null;
    const updated = await api.admin.updateRule(id, payload);
    return mapBeRuleToFE(updated);
  },

  async getSystemLogs(): Promise<SystemLog[]> {
    if (!tokenStorage.hasTokens()) return MOCK_LOGS;
    try {
      const list = await api.admin.getLogs({ page: 1, pageSize: 50 });
      const warningOrErrorLogs = list.items.filter(
        item => item.level === 'Warning' || item.level === 'Error' || ['CameraDenied', 'BodyLost', 'SyncFailed', 'ApiError'].includes(item.type)
      );
      const mapped = warningOrErrorLogs.map(mapBeSystemLogToFE);
      return mapped.length > 0 ? mapped : MOCK_LOGS;
    } catch {
      return MOCK_LOGS;
    }
  },
};
