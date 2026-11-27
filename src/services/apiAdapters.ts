import type {
  AuthUser,
  ErrorSummary,
  Exercise,
  ExerciseRule,
  LogType,
  RepResult,
  Role,
  SystemLog,
  User,
  WorkoutSession,
} from '../types';
import type {
  BeAdminUserDto,
  BeExerciseDto,
  BeFeedbackRuleDto,
  BeSaveSessionRequest,
  BeSessionDetailDto,
  BeSessionDto,
  BeSystemLogDto,
  BeUserDto,
} from './api';

const EXERCISE_META_BY_CODE: Record<string, { jointSet: string; mode: 'reps' | 'hold'; exerciseId: number }> = {
  squat: { jointSet: 'Hông › Đầu gối › Cổ chân', mode: 'reps', exerciseId: 1 },
  plank: { jointSet: 'Vai › Hông › Cổ chân', mode: 'hold', exerciseId: 2 },
  pushup: { jointSet: 'Vai › Khuỷu tay › Cổ tay', mode: 'reps', exerciseId: 3 },
};

const EXERCISE_CODE_BY_NAME: Record<string, string> = {
  Squat: 'squat',
  Plank: 'plank',
  'Push-up': 'pushup',
};

export function toExerciseCode(nameOrId: string | number): string {
  if (typeof nameOrId === 'number') {
    if (nameOrId === 2) return 'plank';
    if (nameOrId === 3) return 'pushup';
    return 'squat';
  }
  return EXERCISE_CODE_BY_NAME[nameOrId] || nameOrId.trim().toLowerCase();
}

export function mapBeUserToAuthUser(dto: BeUserDto): AuthUser {
  return {
    id: dto.id,
    fullName: dto.fullName,
    email: dto.email,
    role: (dto.role === 'Admin' ? 'Admin' : 'Trainee') as Role,
  };
}

export function mapBeExerciseToFE(dto: BeExerciseDto): Exercise {
  const meta = EXERCISE_META_BY_CODE[dto.code.toLowerCase()] || {
    jointSet: dto.targetMuscles || 'Toàn thân',
    mode: dto.code.toLowerCase() === 'plank' ? 'hold' : 'reps',
    exerciseId: dto.id,
  };
  return {
    id: dto.id,
    name: dto.name,
    description: dto.description,
    jointSet: meta.jointSet,
    mode: meta.mode,
    status: 'Active',
  };
}

export function mapBeRuleToFE(dto: BeFeedbackRuleDto): ExerciseRule {
  const prefix = dto.code.split('_')[0]?.toLowerCase() || 'squat';
  const exerciseName = prefix === 'plank' ? 'Plank' : prefix === 'pushup' ? 'Push-up' : 'Squat';
  const exerciseId = prefix === 'plank' ? 2 : prefix === 'pushup' ? 3 : 1;
  const meta = EXERCISE_META_BY_CODE[prefix] || EXERCISE_META_BY_CODE.squat;

  let min: number | null = null;
  let max: number | null = null;
  let metric = dto.code;
  try {
    const parsed = JSON.parse(dto.thresholdsJson || '{}') as Record<string, number>;
    const entries = Object.entries(parsed);
    if (entries.length > 0) {
      const [key, val] = entries[0];
      metric = key;
      if (key.toLowerCase().startsWith('min')) min = val;
      else max = val;
    }
  } catch {
    // keep nulls if JSON malformed
  }

  return {
    id: dto.id,
    exerciseId,
    exercise: exerciseName,
    jointSet: meta.jointSet,
    metric,
    min,
    max,
    type: dto.severity === 'Error' || dto.severity === 'Warning' ? 'Error' : 'Correct',
    label: dto.name,
    voice: dto.description,
    ref: dto.code,
    version: 1,
    status: dto.isEnabled ? 'Active' : 'Inactive',
  };
}

export function mapBeSessionToFE(dto: BeSessionDto | BeSessionDetailDto): WorkoutSession {
  const code = dto.exerciseCode.toLowerCase();
  const exerciseId = code === 'plank' ? 2 : code === 'pushup' ? 3 : 1;
  const detailReps = 'reps' in dto ? dto.reps : [];

  const repResults: RepResult[] = detailReps.map(r => ({
    rep: r.repNumber,
    correct: r.isCorrect,
    errors: !r.isCorrect && r.ruleName ? [r.ruleName] : undefined,
  }));

  const errorMap = new Map<string, number>();
  for (const r of detailReps) {
    if (!r.isCorrect) {
      const label = r.ruleName || r.ruleCode || 'Lỗi tư thế';
      errorMap.set(label, (errorMap.get(label) || 0) + 1);
    }
  }
  const errors: ErrorSummary[] = Array.from(errorMap.entries()).map(([label, count]) => ({
    label,
    count,
  }));

  const incorrectReps = Math.max(0, dto.totalReps - dto.correctReps);
  const accuracy = Math.round(Number(dto.formScore));

  const isHold = code === 'plank';
  const correctHoldSec = isHold ? Math.round((dto.durationSec * accuracy) / 100) : undefined;
  const incorrectHoldSec = isHold ? Math.max(0, dto.durationSec - (correctHoldSec || 0)) : undefined;

  return {
    id: dto.id,
    exerciseId,
    exercise: dto.exerciseName,
    date: dto.startedAt,
    durationSec: dto.durationSec,
    totalReps: isHold ? 0 : dto.totalReps,
    correctReps: isHold ? 0 : dto.correctReps,
    incorrectReps: isHold ? 0 : incorrectReps,
    accuracy,
    correctHoldSec,
    incorrectHoldSec,
    repResults,
    errors,
    avgFps: 28,
    avgVisibility: 0.9,
    bodyLostCount: 0,
    synced: true,
  };
}

export function mapWorkoutSessionToSaveRequest(session: WorkoutSession): BeSaveSessionRequest {
  const code = toExerciseCode(session.exercise || session.exerciseId);
  const isHold = code === 'plank';

  return {
    exerciseCode: code,
    startedAt: session.date,
    durationSec: session.durationSec,
    totalReps: isHold ? 1 : session.totalReps,
    correctReps: isHold ? (session.accuracy >= 70 ? 1 : 0) : session.correctReps,
    formScore: session.accuracy,
    status: 'Completed',
    reps: session.repResults.map((r, idx) => ({
      repNumber: r.rep || idx + 1,
      isCorrect: r.correct,
      ruleCode: !r.correct && r.errors?.length ? r.errors[0] : null,
      occurredAtMs: Math.round((session.durationSec * 1000 * (idx + 1)) / Math.max(1, session.repResults.length + 1)),
    })),
  };
}

export function mapBeAdminUserToFE(dto: BeAdminUserDto): User {
  return {
    id: dto.id,
    fullName: dto.fullName,
    email: dto.email,
    role: (dto.role === 'Admin' ? 'Admin' : 'Trainee') as Role,
    status: dto.isActive ? 'Active' : 'Locked',
    createdAt: dto.createdAt.slice(0, 10),
  };
}

export function mapBeSystemLogToFE(dto: BeSystemLogDto): SystemLog {
  const typeMap: Record<string, LogType> = {
    CameraDenied: 'Camera denied',
    BodyLost: 'Body lost',
    SyncFailed: 'Sync failed',
    ApiError: 'API error',
  };
  return {
    id: dto.id,
    time: dto.createdAt,
    user: dto.userEmail || 'system@aifit.vn',
    exercise: dto.exercise || 'System',
    type: typeMap[dto.type] || 'API error',
    message: `[${dto.type}] ${dto.message}`,
  };
}
