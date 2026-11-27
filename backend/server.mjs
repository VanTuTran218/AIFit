import http from 'node:http';
import crypto from 'node:crypto';
import tls from 'node:tls';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const DB_PATH = path.join(__dirname, 'aifit.db');
const APPSETTINGS_PATH = path.join(__dirname, 'AIFit.Api', 'appsettings.json');
const ENV_PATH = path.join(ROOT_DIR, '.env');

const PORT = Number(process.env.PORT || 5080);
const JWT_SECRET = 'AIFit_C1SE_87_SuperSecretKey_2026_MinLength_32Chars!!';
const OTP_EXPIRY_SEC = 300; // 5 minutes

// ─── Load .env / appsettings.json SMTP config ────────────────────────────────

let smtpConfig = {
  email: process.env.SMTP_EMAIL || '',
  appPassword: process.env.SMTP_APP_PASSWORD || '',
};

function reloadSmtpConfig() {
  if (fs.existsSync(ENV_PATH)) {
    const lines = fs.readFileSync(ENV_PATH, 'utf8').split(/\r?\n/);
    for (const line of lines) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m) {
        const val = m[2].replace(/^['"]|['"]$/g, '').trim();
        if (m[1] === 'SMTP_EMAIL' && val) smtpConfig.email = val;
        if (m[1] === 'SMTP_APP_PASSWORD' && val) smtpConfig.appPassword = val;
      }
    }
  }
  if ((!smtpConfig.email || !smtpConfig.appPassword) && fs.existsSync(APPSETTINGS_PATH)) {
    try {
      const cfg = JSON.parse(fs.readFileSync(APPSETTINGS_PATH, 'utf8'));
      if (cfg?.Smtp?.Email) smtpConfig.email = cfg.Smtp.Email;
      if (cfg?.Smtp?.AppPassword) smtpConfig.appPassword = cfg.Smtp.AppPassword;
    } catch {
      // ignore
    }
  }
}
reloadSmtpConfig();

function saveSmtpConfig(email, appPassword) {
  smtpConfig.email = email.trim();
  smtpConfig.appPassword = appPassword.replace(/\s+/g, '');

  const envContent = [
    `SMTP_EMAIL=${smtpConfig.email}`,
    `SMTP_APP_PASSWORD=${smtpConfig.appPassword}`,
    `VITE_API_URL=http://localhost:${PORT}`,
    '',
  ].join('\n');
  fs.writeFileSync(ENV_PATH, envContent, 'utf8');

  if (fs.existsSync(APPSETTINGS_PATH)) {
    try {
      const cfg = JSON.parse(fs.readFileSync(APPSETTINGS_PATH, 'utf8'));
      cfg.Smtp = {
        Host: 'smtp.gmail.com',
        Port: 587,
        Email: smtpConfig.email,
        AppPassword: smtpConfig.appPassword,
      };
      fs.writeFileSync(APPSETTINGS_PATH, JSON.stringify(cfg, null, 2), 'utf8');
    } catch {
      // ignore
    }
  }
}

// ─── Password Hashing & JWT (matching .NET TokenService) ─────────────────────

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${derived}`;
}

function verifyPassword(password, storedHash) {
  if (!storedHash || !storedHash.startsWith('scrypt$')) return false;
  const [, salt, hash] = storedHash.split('$');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(derived, 'hex'));
}

function base64UrlEncode(input) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(String(input), 'utf8');
  return buf.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function base64UrlDecode(str) {
  const pad = 4 - (str.length % 4 || 4);
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/') + (pad < 4 ? '='.repeat(pad) : '');
  return Buffer.from(b64, 'base64').toString('utf8');
}

function createAccessToken(user) {
  const expiresAtDate = new Date(Date.now() + 120 * 60 * 1000);
  const header = { alg: 'HS256', typ: 'JWT' };
  const payload = {
    sub: String(user.Id),
    email: user.Email,
    name: user.FullName,
    role: user.Role,
    iss: 'AIFit.Api',
    aud: 'AIFit.Frontend',
    exp: Math.floor(expiresAtDate.getTime() / 1000),
    jti: crypto.randomUUID(),
  };
  const unsigned = `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(JSON.stringify(payload))}`;
  const sig = crypto.createHmac('sha256', JWT_SECRET).update(unsigned).digest();
  return {
    token: `${unsigned}.${base64UrlEncode(sig)}`,
    expiresAt: expiresAtDate.toISOString(),
  };
}

function verifyAccessToken(token) {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [h, p, s] = parts;
  const expected = base64UrlEncode(crypto.createHmac('sha256', JWT_SECRET).update(`${h}.${p}`).digest());
  if (expected !== s) return null;
  try {
    const payload = JSON.parse(base64UrlDecode(p));
    if (payload.exp && payload.exp * 1000 < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

// ─── Zero-Dependency Gmail SMTP over TLS (smtp.gmail.com:465) ────────────────

function sendGmailOtpViaTls({ toEmail, fullName, otpCode, purpose }) {
  reloadSmtpConfig();
  const user = smtpConfig.email.trim();
  const pass = smtpConfig.appPassword.replace(/\s+/g, '');

  if (!user || !pass) {
    console.log(`\n📧 [DEV OTP - ${purpose}] To: ${toEmail} | Mã OTP: ${otpCode}\n`);
    return Promise.resolve({ sent: false, reason: 'not_configured' });
  }

  const title =
    purpose === 'ResetPassword'
      ? 'Khôi phục mật khẩu tài khoản AIFit'
      : 'Xác thực đăng ký tài khoản AIFit';

  const subject = `[AIFit] ${otpCode} là mã xác thực OTP của bạn (${title})`;
  const encodedSubject = `=?UTF-8?B?${Buffer.from(subject, 'utf8').toString('base64')}?=`;

  const htmlBody = `<!DOCTYPE html>
<html>
<body style="margin:0;padding:24px;background:#F2F1ED;font-family:Inter,Arial,sans-serif;">
  <div style="max-width:520px;margin:0 auto;background:#101114;color:#F8FAFC;border-radius:18px;padding:32px;border:1px solid rgba(213,181,106,0.35);">
    <div style="margin-bottom:20px;">
      <span style="display:inline-block;background:#C9A227;color:#101114;font-weight:800;padding:6px 12px;border-radius:8px;font-size:13px;letter-spacing:1px;">AIFIT STUDIO</span>
    </div>
    <h2 style="margin:0 0 12px;color:#F8FAFC;font-size:22px;">${title}</h2>
    <p style="color:#CBD5E1;font-size:14px;line-height:1.6;">Xin chào <strong>${fullName}</strong>,</p>
    <p style="color:#CBD5E1;font-size:14px;line-height:1.6;">Mã xác thực OTP 6 chữ số của bạn là:</p>
    <div style="margin:24px 0;padding:20px;background:#18191B;border:1px solid #C9A227;border-radius:14px;text-align:center;letter-spacing:10px;font-size:34px;font-weight:800;color:#E7CA80;">
      ${otpCode}
    </div>
    <p style="color:#94A3B8;font-size:12px;line-height:1.5;">Mã có hiệu lực trong vòng <strong>5 phút</strong>. Nếu bạn không thực hiện yêu cầu này, vui lòng bỏ qua email này.</p>
  </div>
</body>
</html>`;

  const mimeMessage = [
    `From: "AIFit Studio" <${user}>`,
    `To: <${toEmail}>`,
    `Subject: ${encodedSubject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(htmlBody, 'utf8').toString('base64'),
    '.',
  ].join('\r\n');

  return new Promise(resolve => {
    const socket = tls.connect(465, 'smtp.gmail.com', { servername: 'smtp.gmail.com' });
    let step = 0;
    let buffer = '';
    const timer = setTimeout(() => {
      socket.destroy();
      resolve({ sent: false, reason: 'timeout' });
    }, 10000);

    const finish = result => {
      clearTimeout(timer);
      try {
        socket.end();
      } catch {
        // ignore
      }
      resolve(result);
    };

    socket.on('error', err => {
      console.warn('[SMTP Error]', err.message);
      finish({ sent: false, reason: err.message });
    });

    socket.on('data', chunk => {
      buffer += chunk.toString('utf8');
      const lines = buffer.split('\r\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line) continue;
        // Multi-line SMTP response continues if 4th char is '-'
        if (line.length >= 4 && line[3] === '-') continue;
        const code = Number(line.slice(0, 3));

        if (code >= 400) {
          console.warn('[SMTP Rejected]', line);
          finish({ sent: false, reason: line });
          return;
        }

        if (step === 0 && code === 220) {
          step = 1;
          socket.write('EHLO localhost\r\n');
        } else if (step === 1 && code === 250) {
          step = 2;
          socket.write('AUTH LOGIN\r\n');
        } else if (step === 2 && code === 334) {
          step = 3;
          socket.write(Buffer.from(user, 'utf8').toString('base64') + '\r\n');
        } else if (step === 3 && code === 334) {
          step = 4;
          socket.write(Buffer.from(pass, 'utf8').toString('base64') + '\r\n');
        } else if (step === 4 && code === 235) {
          step = 5;
          socket.write(`MAIL FROM:<${user}>\r\n`);
        } else if (step === 5 && code === 250) {
          step = 6;
          socket.write(`RCPT TO:<${toEmail}>\r\n`);
        } else if (step === 6 && code === 250) {
          step = 7;
          socket.write('DATA\r\n');
        } else if (step === 7 && code === 354) {
          step = 8;
          socket.write(mimeMessage + '\r\n');
        } else if (step === 8 && code === 250) {
          step = 9;
          socket.write('QUIT\r\n');
          finish({ sent: true });
          return;
        }
      }
    });
  });
}

// ─── Initialize SQLite Database (AifitDbContext Schema + DbSeeder) ───────────

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS Users (
  Id INTEGER PRIMARY KEY AUTOINCREMENT,
  Email TEXT NOT NULL UNIQUE,
  PasswordHash TEXT NOT NULL,
  FullName TEXT NOT NULL,
  Role TEXT NOT NULL DEFAULT 'Trainee',
  Gender TEXT,
  HeightCm REAL,
  WeightKg REAL,
  IsActive INTEGER NOT NULL DEFAULT 1,
  CreatedAt TEXT NOT NULL,
  UpdatedAt TEXT
);

CREATE TABLE IF NOT EXISTS Exercises (
  Id INTEGER PRIMARY KEY AUTOINCREMENT,
  Code TEXT NOT NULL UNIQUE,
  Name TEXT NOT NULL,
  Description TEXT NOT NULL,
  VideoUrl TEXT,
  ImageUrl TEXT,
  Difficulty TEXT NOT NULL,
  TargetMuscles TEXT,
  CaloriesPerRep REAL,
  CaloriesPerMinute REAL,
  DisplayOrder INTEGER NOT NULL DEFAULT 1,
  CreatedAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS FeedbackRules (
  Id INTEGER PRIMARY KEY AUTOINCREMENT,
  ExerciseId INTEGER NOT NULL,
  Code TEXT NOT NULL UNIQUE,
  Name TEXT NOT NULL,
  Description TEXT NOT NULL,
  Severity TEXT NOT NULL DEFAULT 'Warning',
  ThresholdsJson TEXT NOT NULL DEFAULT '{}',
  IsEnabled INTEGER NOT NULL DEFAULT 1,
  DisplayOrder INTEGER NOT NULL DEFAULT 1,
  CreatedAt TEXT NOT NULL,
  FOREIGN KEY (ExerciseId) REFERENCES Exercises(Id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS WorkoutSessions (
  Id INTEGER PRIMARY KEY AUTOINCREMENT,
  UserId INTEGER NOT NULL,
  ExerciseId INTEGER NOT NULL,
  StartedAt TEXT NOT NULL,
  DurationSec INTEGER NOT NULL,
  TotalReps INTEGER NOT NULL,
  CorrectReps INTEGER NOT NULL,
  FormScore REAL NOT NULL,
  CaloriesBurned REAL NOT NULL,
  Status TEXT NOT NULL DEFAULT 'Completed',
  Note TEXT,
  CreatedAt TEXT NOT NULL,
  FOREIGN KEY (UserId) REFERENCES Users(Id) ON DELETE CASCADE,
  FOREIGN KEY (ExerciseId) REFERENCES Exercises(Id)
);

CREATE TABLE IF NOT EXISTS RepDetails (
  Id INTEGER PRIMARY KEY AUTOINCREMENT,
  SessionId INTEGER NOT NULL,
  RepNumber INTEGER NOT NULL,
  IsCorrect INTEGER NOT NULL,
  RuleId INTEGER,
  OccurredAtMs INTEGER NOT NULL,
  AnglesJson TEXT,
  FOREIGN KEY (SessionId) REFERENCES WorkoutSessions(Id) ON DELETE CASCADE,
  FOREIGN KEY (RuleId) REFERENCES FeedbackRules(Id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS RefreshTokens (
  Id INTEGER PRIMARY KEY AUTOINCREMENT,
  UserId INTEGER NOT NULL,
  Token TEXT NOT NULL UNIQUE,
  ExpiresAt TEXT NOT NULL,
  CreatedAt TEXT NOT NULL,
  RevokedAt TEXT,
  FOREIGN KEY (UserId) REFERENCES Users(Id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS SystemLogs (
  Id INTEGER PRIMARY KEY AUTOINCREMENT,
  Level TEXT NOT NULL,
  Type TEXT NOT NULL,
  Message TEXT NOT NULL,
  UserEmail TEXT,
  Exercise TEXT,
  Path TEXT,
  CreatedAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS EmailOtps (
  Id INTEGER PRIMARY KEY AUTOINCREMENT,
  Email TEXT NOT NULL,
  OtpCode TEXT NOT NULL,
  Purpose TEXT NOT NULL,
  ExpiresAt TEXT NOT NULL,
  IsUsed INTEGER NOT NULL DEFAULT 0,
  CreatedAt TEXT NOT NULL
);
`);

function writeLog(level, type, message, userEmail = null, exercise = null, reqPath = null) {
  try {
    db.prepare(
      `INSERT INTO SystemLogs (Level, Type, Message, UserEmail, Exercise, Path, CreatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(level, type, message, userEmail, exercise, reqPath, new Date().toISOString());
  } catch {
    // best-effort logging
  }
}

function seedDatabase() {
  const userCount = db.prepare('SELECT COUNT(*) as c FROM Users').get().c;
  if (userCount > 0) return;

  const nowIso = new Date().toISOString();

  // 1. Seed 3 Exercises (exact match with DbSeeder.cs)
  const insertEx = db.prepare(`
    INSERT INTO Exercises (Code, Name, Description, VideoUrl, ImageUrl, Difficulty, TargetMuscles, CaloriesPerRep, CaloriesPerMinute, DisplayOrder, CreatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const squatRes = insertEx.run(
    'squat',
    'Squat',
    'Bài tập squat cơ bản: hai chân rộng bằng vai, hạ hông xuống đến khi đùi song song sàn rồi đẩy người đứng lên. Tăng cường cơ đùi trước, cơ mông và lõi.',
    '/videos/squat.mp4',
    '/images/squat.jpg',
    'Intermediate',
    'Quadriceps, Glutes, Hamstrings, Core',
    0.32,
    null,
    1,
    nowIso
  );
  const plankRes = insertEx.run(
    'plank',
    'Plank',
    'Giữ tư thế plank tĩnh: khuỷu tay vuông góc vai, thân người tạo đường thẳng từ đầu đến gót chân. Tăng cường cơ lõi và sức bền toàn thân.',
    '/videos/plank.mp4',
    '/images/plank.jpg',
    'Beginner',
    'Core, Rectus Abdominis, Obliques',
    null,
    3.9,
    2,
    nowIso
  );
  const pushupRes = insertEx.run(
    'pushup',
    'Push-up',
    'Hít đất chuẩn form: hai tay rộng hơn vai một chút, hạ ngực xuống gần sàn rồi đẩy người lên. Tăng cường cơ ngực, vai và tay sau.',
    '/videos/pushup.mp4',
    '/images/pushup.jpg',
    'Intermediate',
    'Chest, Triceps, Shoulders, Core',
    0.29,
    null,
    3,
    nowIso
  );

  const squatId = Number(squatRes.lastInsertRowid);
  const plankId = Number(plankRes.lastInsertRowid);
  const pushupId = Number(pushupRes.lastInsertRowid);

  // 2. Seed 11 FeedbackRules (exact match with DbSeeder.cs)
  const rulesSeed = [
    [squatId, 'squat_knee_toe', 'Đầu gối vượt quá mũi chân', 'Khi hạ xuống, đầu gối đẩy vượt quá mũi chân gây áp lực lớn lên khớp gối. Hãy đẩy hông ra sau và giữ gối thẳng hướng mũi chân.', 'Error', '{"maxKneeOverToeRatio": 0.1}', 1],
    [squatId, 'squat_depth', 'Squat chưa đủ sâu', 'Chưa hạ đủ thấp — hông nên xuống dưới mức đầu gối (đùi song song sàn hoặc thấp hơn) để kích hoạt tối đa cơ mông.', 'Warning', '{"minKneeAngleDeg": 95}', 2],
    [squatId, 'squat_back_round', 'Lưng cong khi hạ người', 'Lưng dưới cong quá mức làm tăng nguy cơ chấn thương cột sống. Giữ ngực ưỡn, mắt nhìn về phía trước, core siết chặt.', 'Error', '{"maxSpineLeanDeg": 45}', 3],
    [squatId, 'squat_heel_lift', 'Gót chân nhấc khỏi sàn', 'Gót chân nhấc làm mất điểm tựa và lệch trọng tâm. Đặt toàn bộ bàn chân bám sàn, phân bổ trọng lượng về gót và giữa bàn chân.', 'Warning', '{"minAnkleAngleDeg": 70}', 4],
    [plankId, 'plank_hip_sag', 'Hông tụt xuống quá thấp', 'Hông tụt khiến cột sống ưỡn quá mức, gây đau lưng dưới. Siết cơ mông và bụng để giữ thân thẳng.', 'Error', '{"maxShoulderHipAnkleAngleDeg": 165}', 1],
    [plankId, 'plank_hip_high', 'Hông nâng quá cao', 'Đẩy hông quá cao làm giảm tác động lên cơ lõi. Hạ hông xuống để thân người tạo một đường thẳng.', 'Warning', '{"minShoulderHipAnkleAngleDeg": 175}', 2],
    [plankId, 'plank_neck_drop', 'Cổ gật gù / ngẩng quá cao', 'Cổ không thẳng hàng với cột sống gây căng cơ vai gáy. Nhìn xuống sàn, giữ gáy kéo dài tự nhiên.', 'Warning', '{"maxNeckAngleDeg": 25}', 3],
    [plankId, 'plank_elbow_offset', 'Khuỷu tay không ngay dưới vai', 'Khuỷu đặt lệch về trước hoặc sau vai làm giảm ổn định khớp vai. Đặt khuỷu thẳng đứng ngay dưới khớp vai.', 'Warning', '{"maxElbowShoulderOffsetRatio": 0.15}', 4],
    [pushupId, 'pushup_elbow_flare', 'Cánh tay xòe quá rộng', 'Khuỷu tay xòe ra gần vuông góc với thân gây áp lực lên khớp vai. Giữ khuỷu tạo góc khoảng 45 độ so với thân.', 'Warning', '{"maxElbowFlareDeg": 60}', 1],
    [pushupId, 'pushup_hip_sag', 'Hông tụt, thân không thẳng', 'Hông tụt xuống phá vỡ đường thẳng đầu-mông-gót, làm giảm hiệu quả và nguy cơ đau lưng. Siết core, giữ thân cứng như tấm ván.', 'Error', '{"minShoulderHipAnkleAngleDeg": 165}', 2],
    [pushupId, 'pushup_depth', 'Hạ chưa đủ sâu', 'Ngực chưa hạ tới gần sàn (khuỷu chưa gập ~90 độ) khiến động tác kém hiệu quả. Hạ sâu hơn, ngực cách sàn một nắm tay.', 'Warning', '{"maxElbowAngleDegAtBottom": 100}', 3],
  ];
  const insertRule = db.prepare(`
    INSERT INTO FeedbackRules (ExerciseId, Code, Name, Description, Severity, ThresholdsJson, IsEnabled, DisplayOrder, CreatedAt)
    VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
  `);
  const ruleIdsByEx = { [squatId]: [], [plankId]: [], [pushupId]: [] };
  for (const r of rulesSeed) {
    const res = insertRule.run(r[0], r[1], r[2], r[3], r[4], r[5], r[6], nowIso);
    ruleIdsByEx[r[0]].push(Number(res.lastInsertRowid));
  }

  // 3. Seed Users (both @aifit.vn from BE repo and @aifit.com from FE UI)
  const insertUser = db.prepare(`
    INSERT INTO Users (Email, PasswordHash, FullName, Role, Gender, HeightCm, WeightKg, IsActive, CreatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insertUser.run('admin@aifit.vn', hashPassword('Admin@123'), 'Quản trị viên AIFit', 'Admin', null, null, null, 1, new Date(Date.now() - 60 * 86400000).toISOString());
  const traineeVnRes = insertUser.run('trainee@aifit.vn', hashPassword('Trainee@123'), 'Nguyễn Văn Demo', 'Trainee', 'Male', 172, 65, 1, new Date(Date.now() - 45 * 86400000).toISOString());
  const traineeComRes = insertUser.run('trainee@aifit.com', hashPassword('trainee123'), 'Trần Thị Thanh Vinh', 'Trainee', 'Female', 165, 54, 1, new Date(Date.now() - 40 * 86400000).toISOString());
  insertUser.run('admin@aifit.com', hashPassword('admin123'), 'Quản trị viên AIFit', 'Admin', null, null, null, 1, new Date(Date.now() - 55 * 86400000).toISOString());

  // 4. Seed workout history for trainee accounts
  const insertSession = db.prepare(`
    INSERT INTO WorkoutSessions (UserId, ExerciseId, StartedAt, DurationSec, TotalReps, CorrectReps, FormScore, CaloriesBurned, Status, CreatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Completed', ?)
  `);
  const insertRep = db.prepare(`
    INSERT INTO RepDetails (SessionId, RepNumber, IsCorrect, RuleId, OccurredAtMs, AnglesJson)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const exercises = [
    { id: squatId, code: 'squat', calRep: 0.32, calMin: null },
    { id: plankId, code: 'plank', calRep: null, calMin: 3.9 },
    { id: pushupId, code: 'pushup', calRep: 0.29, calMin: null },
  ];

  for (const uid of [Number(traineeVnRes.lastInsertRowid), Number(traineeComRes.lastInsertRowid)]) {
    for (let day = 14; day >= 0; day -= 2) {
      const ex = exercises[day % 3];
      const isPlank = ex.code === 'plank';
      const durationSec = isPlank ? 90 : 210 + (day % 4) * 30;
      const totalReps = isPlank ? 1 : 16 + (day % 5);
      const badReps = isPlank ? 0 : Math.max(1, day % 4);
      const correctReps = totalReps - badReps;
      const formScore = Math.round((correctReps * 100) / totalReps);
      const calories = isPlank
        ? Number(((durationSec / 60) * ex.calMin).toFixed(2))
        : Number((correctReps * ex.calRep).toFixed(2));
      const startedAt = new Date(Date.now() - day * 86400000).toISOString();

      const sRes = insertSession.run(uid, ex.id, startedAt, durationSec, totalReps, correctReps, formScore, calories, startedAt);
      const sid = Number(sRes.lastInsertRowid);
      const exRuleIds = ruleIdsByEx[ex.id];

      for (let r = 1; r <= totalReps; r++) {
        const isCorrect = r > badReps ? 1 : 0;
        const ruleId = isCorrect ? null : exRuleIds[r % exRuleIds.length];
        insertRep.run(sid, r, isCorrect, ruleId, Math.round((durationSec * 1000 * r) / (totalReps + 1)), isCorrect ? null : '{"kneeAngle":112}');
      }
    }
  }

  writeLog('Info', 'SystemSeed', 'Khởi tạo cơ sở dữ liệu AIFit_Db hoàn tất', 'system@aifit.vn');
  console.log('✅ Seeded SQLite database (Users, Exercises, 11 FeedbackRules, WorkoutSessions, EmailOtps)');
}

seedDatabase();

// ─── HTTP Helpers ────────────────────────────────────────────────────────────

function sendJson(res, status, data) {
  const body = status === 204 ? '' : JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  });
  res.end(body);
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', chunk => {
      raw += chunk;
      if (raw.length > 2 * 1024 * 1024) req.destroy();
    });
    req.on('end', () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

function getAuthClaims(req) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) return null;
  return verifyAccessToken(header.slice(7).trim());
}

function toUserDto(row) {
  return {
    id: row.Id,
    email: row.Email,
    fullName: row.FullName,
    role: row.Role,
    gender: row.Gender,
    heightCm: row.HeightCm,
    weightKg: row.WeightKg,
    createdAt: row.CreatedAt,
  };
}

function issueAuthResponse(userRow) {
  const { token: accessToken, expiresAt } = createAccessToken(userRow);
  const refreshToken = crypto.randomBytes(48).toString('base64');
  const now = new Date();
  const refreshExp = new Date(now.getTime() + 30 * 86400000);

  db.prepare(
    `INSERT INTO RefreshTokens (UserId, Token, ExpiresAt, CreatedAt) VALUES (?, ?, ?, ?)`
  ).run(userRow.Id, refreshToken, refreshExp.toISOString(), now.toISOString());

  return {
    accessToken,
    accessTokenExpiresAt: expiresAt,
    refreshToken,
    user: toUserDto(userRow),
  };
}

function generateSixDigitOtp() {
  return String(crypto.randomInt(100000, 1000000));
}

function saveOtpRecord(email, otpCode, purpose) {
  db.prepare(`UPDATE EmailOtps SET IsUsed = 1 WHERE Email = ? AND Purpose = ? AND IsUsed = 0`).run(email, purpose);
  const now = new Date();
  const expires = new Date(now.getTime() + OTP_EXPIRY_SEC * 1000);
  db.prepare(
    `INSERT INTO EmailOtps (Email, OtpCode, Purpose, ExpiresAt, IsUsed, CreatedAt) VALUES (?, ?, ?, ?, 0, ?)`
  ).run(email, otpCode, purpose, expires.toISOString(), now.toISOString());
}

function verifyOtpRecord(email, otpCode, purpose, consume = true) {
  const row = db
    .prepare(
      `SELECT * FROM EmailOtps WHERE Email = ? AND Purpose = ? AND IsUsed = 0 ORDER BY Id DESC LIMIT 1`
    )
    .get(email, purpose);

  if (!row || row.OtpCode !== String(otpCode).trim()) {
    return { ok: false, message: 'Mã xác thực OTP không chính xác.' };
  }
  if (new Date(row.ExpiresAt).getTime() < Date.now()) {
    return { ok: false, message: 'Mã OTP đã hết hạn (quá 5 phút). Vui lòng gửi lại mã mới.' };
  }
  if (consume) {
    db.prepare(`UPDATE EmailOtps SET IsUsed = 1 WHERE Id = ?`).run(row.Id);
  }
  return { ok: true };
}

// ─── Request Router ──────────────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    return sendJson(res, 204, null);
  }

  const url = new URL(req.url || '/', `http://localhost:${PORT}`);
  const pathname = url.pathname;

  try {
    // ── SMTP Configuration Endpoints (for Gmail App Password setup) ──
    if (req.method === 'GET' && pathname === '/api/auth/smtp-status') {
      reloadSmtpConfig();
      return sendJson(res, 200, {
        configured: Boolean(smtpConfig.email && smtpConfig.appPassword),
        email: smtpConfig.email || '',
      });
    }

    if (req.method === 'POST' && pathname === '/api/auth/smtp-config') {
      const body = await readJsonBody(req);
      const email = String(body.email || '').trim();
      const appPassword = String(body.appPassword || '').replace(/\s+/g, '');
      if (!email || !appPassword) {
        return sendJson(res, 400, { message: 'Vui lòng nhập Gmail và Mật khẩu ứng dụng (App Password 16 ký tự).' });
      }
      saveSmtpConfig(email, appPassword);
      return sendJson(res, 200, {
        configured: true,
        email: smtpConfig.email,
        message: 'Đã lưu cấu hình Gmail SMTP thành công!',
      });
    }

    // ── 1. Send Registration OTP ──
    if (req.method === 'POST' && pathname === '/api/auth/send-register-otp') {
      const body = await readJsonBody(req);
      const email = String(body.email || '').trim().toLowerCase();
      const fullName = String(body.fullName || 'Học viên AIFit').trim();

      if (!email || !/\S+@\S+\.\S+/.test(email)) {
        return sendJson(res, 400, { message: 'Địa chỉ email không hợp lệ.' });
      }

      const existing = db.prepare(`SELECT Id FROM Users WHERE Email = ?`).get(email);
      if (existing) {
        return sendJson(res, 409, { message: 'Địa chỉ email này đã được sử dụng.' });
      }

      const otpCode = generateSixDigitOtp();
      saveOtpRecord(email, otpCode, 'Register');

      const mailRes = await sendGmailOtpViaTls({ toEmail: email, fullName, otpCode, purpose: 'Register' });
      writeLog('Info', 'AuthOtpSent', `Gửi mã OTP đăng ký cho ${email} (${mailRes.sent ? 'Gmail' : 'Dev'})`, email);

      return sendJson(res, 200, {
        message: mailRes.sent
          ? `Đã gửi mã OTP 6 chữ số tới hộp thư Gmail ${email}.`
          : `Đã tạo mã OTP cho ${email}. (Chế độ thử nghiệm hoặc lỗi SMTP: ${mailRes.reason || 'chưa cấu hình'})`,
        expiresInSeconds: OTP_EXPIRY_SEC,
        deliveryMode: mailRes.sent ? 'gmail' : 'dev',
        devOtp: mailRes.sent ? null : otpCode,
        smtpReason: mailRes.sent ? null : mailRes.reason,
      });
    }

    // ── 2. Verify OTP & Complete Registration ──
    if (req.method === 'POST' && pathname === '/api/auth/register') {
      const body = await readJsonBody(req);
      const email = String(body.email || '').trim().toLowerCase();
      const fullName = String(body.fullName || '').trim();
      const password = String(body.password || '');
      const otpCode = body.otpCode ? String(body.otpCode).trim() : '';

      if (!email || !fullName || password.length < 6) {
        return sendJson(res, 400, { message: 'Thông tin đăng ký không hợp lệ.' });
      }

      const existing = db.prepare(`SELECT Id FROM Users WHERE Email = ?`).get(email);
      if (existing) {
        return sendJson(res, 409, { message: 'Địa chỉ email này đã được sử dụng.' });
      }

      if (otpCode) {
        const check = verifyOtpRecord(email, otpCode, 'Register', true);
        if (!check.ok) {
          return sendJson(res, 400, { message: check.message });
        }
      }

      const nowIso = new Date().toISOString();
      const info = db
        .prepare(
          `INSERT INTO Users (Email, PasswordHash, FullName, Role, Gender, HeightCm, WeightKg, IsActive, CreatedAt)
           VALUES (?, ?, ?, 'Trainee', ?, ?, ?, 1, ?)`
        )
        .run(email, hashPassword(password), fullName, body.gender || null, body.heightCm || null, body.weightKg || null, nowIso);

      const userRow = db.prepare(`SELECT * FROM Users WHERE Id = ?`).get(Number(info.lastInsertRowid));
      writeLog('Info', 'AuthRegister', 'Đăng ký tài khoản mới thành công qua OTP', email);

      return sendJson(res, 200, issueAuthResponse(userRow));
    }

    // ── 3. Login ──
    if (req.method === 'POST' && pathname === '/api/auth/login') {
      const body = await readJsonBody(req);
      const email = String(body.email || '').trim().toLowerCase();
      const password = String(body.password || '');

      const userRow = db.prepare(`SELECT * FROM Users WHERE Email = ?`).get(email);
      if (!userRow || !verifyPassword(password, userRow.PasswordHash)) {
        writeLog('Warning', 'AuthFailedLogin', 'Đăng nhập sai email hoặc mật khẩu', email);
        return sendJson(res, 401, { message: 'Email hoặc mật khẩu không chính xác.' });
      }

      if (!userRow.IsActive) {
        writeLog('Warning', 'AuthBlocked', 'Tài khoản bị khóa cố gắng đăng nhập', email);
        return sendJson(res, 403, { message: 'Tài khoản của bạn đã bị khóa. Vui lòng liên hệ quản trị viên.' });
      }

      writeLog('Info', 'AuthLogin', 'Đăng nhập thành công', email);
      return sendJson(res, 200, issueAuthResponse(userRow));
    }

    // ── 4. Forgot Password (send 6-digit OTP to Gmail) ──
    if (req.method === 'POST' && pathname === '/api/auth/forgot-password') {
      const body = await readJsonBody(req);
      const email = String(body.email || '').trim().toLowerCase();

      const userRow = db.prepare(`SELECT * FROM Users WHERE Email = ?`).get(email);
      if (!userRow) {
        return sendJson(res, 404, { message: 'Không tìm thấy tài khoản nào đăng ký với địa chỉ email này.' });
      }
      if (!userRow.IsActive) {
        return sendJson(res, 403, { message: 'Tài khoản này đang bị khóa. Không thể khôi phục mật khẩu.' });
      }

      const otpCode = generateSixDigitOtp();
      saveOtpRecord(email, otpCode, 'ResetPassword');

      const mailRes = await sendGmailOtpViaTls({
        toEmail: email,
        fullName: userRow.FullName,
        otpCode,
        purpose: 'ResetPassword',
      });
      writeLog('Info', 'AuthForgotPassword', `Gửi mã OTP khôi phục mật khẩu cho ${email}`, email);

      return sendJson(res, 200, {
        message: mailRes.sent
          ? `Mã OTP khôi phục mật khẩu đã được gửi tới Gmail ${email}.`
          : `Đã tạo mã OTP khôi phục mật khẩu cho ${email}.`,
        expiresInSeconds: OTP_EXPIRY_SEC,
        deliveryMode: mailRes.sent ? 'gmail' : 'dev',
        devOtp: mailRes.sent ? null : otpCode,
        smtpReason: mailRes.sent ? null : mailRes.reason,
      });
    }

    // ── 5. Verify Reset Password OTP ──
    if (req.method === 'POST' && pathname === '/api/auth/verify-reset-otp') {
      const body = await readJsonBody(req);
      const email = String(body.email || '').trim().toLowerCase();
      const otpCode = String(body.otpCode || '').trim();

      const check = verifyOtpRecord(email, otpCode, 'ResetPassword', false);
      if (!check.ok) {
        return sendJson(res, 400, { message: check.message });
      }
      return sendJson(res, 200, { valid: true });
    }

    // ── 6. Reset Password with OTP ──
    if (req.method === 'POST' && pathname === '/api/auth/reset-password') {
      const body = await readJsonBody(req);
      const email = String(body.email || '').trim().toLowerCase();
      const otpCode = String(body.otpCode || '').trim();
      const newPassword = String(body.newPassword || '');
      const confirmNewPassword = String(body.confirmNewPassword || '');

      if (newPassword.length < 6) {
        return sendJson(res, 400, { message: 'Mật khẩu mới phải có tối thiểu 6 ký tự.' });
      }
      if (newPassword !== confirmNewPassword) {
        return sendJson(res, 400, { message: 'Mật khẩu xác nhận không trùng khớp.' });
      }

      const userRow = db.prepare(`SELECT * FROM Users WHERE Email = ?`).get(email);
      if (!userRow) {
        return sendJson(res, 404, { message: 'Không tìm thấy tài khoản người dùng.' });
      }

      const check = verifyOtpRecord(email, otpCode, 'ResetPassword', true);
      if (!check.ok) {
        return sendJson(res, 400, { message: check.message });
      }

      const nowIso = new Date().toISOString();
      db.prepare(`UPDATE Users SET PasswordHash = ?, UpdatedAt = ? WHERE Id = ?`).run(
        hashPassword(newPassword),
        nowIso,
        userRow.Id
      );
      db.prepare(`UPDATE RefreshTokens SET RevokedAt = ? WHERE UserId = ? AND RevokedAt IS NULL`).run(
        nowIso,
        userRow.Id
      );

      writeLog('Info', 'AuthResetPassword', 'Khôi phục mật khẩu thành công qua OTP Gmail', email);
      return sendJson(res, 200, { message: 'Đặt lại mật khẩu thành công.' });
    }

    // ── 7. Refresh Token ──
    if (req.method === 'POST' && pathname === '/api/auth/refresh') {
      const body = await readJsonBody(req);
      const token = String(body.refreshToken || '');
      const row = db
        .prepare(`SELECT * FROM RefreshTokens WHERE Token = ? AND RevokedAt IS NULL`)
        .get(token);

      if (!row || new Date(row.ExpiresAt).getTime() < Date.now()) {
        return sendJson(res, 401, { message: 'Phiên đăng nhập đã hết hạn.' });
      }

      db.prepare(`UPDATE RefreshTokens SET RevokedAt = ? WHERE Id = ?`).run(new Date().toISOString(), row.Id);
      const userRow = db.prepare(`SELECT * FROM Users WHERE Id = ?`).get(row.UserId);
      return sendJson(res, 200, issueAuthResponse(userRow));
    }

    // ── 8. Auth Me & Users Profile ──
    if (req.method === 'GET' && (pathname === '/api/auth/me' || pathname === '/api/users/profile')) {
      const claims = getAuthClaims(req);
      if (!claims) return sendJson(res, 401, { message: 'Unauthorized' });
      const userRow = db.prepare(`SELECT * FROM Users WHERE Id = ?`).get(Number(claims.sub));
      if (!userRow) return sendJson(res, 404, { message: 'User not found' });
      return sendJson(res, 200, toUserDto(userRow));
    }

    if (req.method === 'PUT' && pathname === '/api/users/profile') {
      const claims = getAuthClaims(req);
      if (!claims) return sendJson(res, 401, { message: 'Unauthorized' });
      const body = await readJsonBody(req);
      db.prepare(
        `UPDATE Users SET FullName = ?, Gender = COALESCE(?, Gender), HeightCm = COALESCE(?, HeightCm), WeightKg = COALESCE(?, WeightKg), UpdatedAt = ? WHERE Id = ?`
      ).run(
        String(body.fullName || '').trim(),
        body.gender ?? null,
        body.heightCm ?? null,
        body.weightKg ?? null,
        new Date().toISOString(),
        Number(claims.sub)
      );
      const updated = db.prepare(`SELECT * FROM Users WHERE Id = ?`).get(Number(claims.sub));
      return sendJson(res, 200, toUserDto(updated));
    }

    if (req.method === 'PUT' && pathname === '/api/users/password') {
      const claims = getAuthClaims(req);
      if (!claims) return sendJson(res, 401, { message: 'Unauthorized' });
      const body = await readJsonBody(req);
      const userRow = db.prepare(`SELECT * FROM Users WHERE Id = ?`).get(Number(claims.sub));
      if (!userRow || !verifyPassword(String(body.currentPassword || ''), userRow.PasswordHash)) {
        return sendJson(res, 400, { message: 'Mật khẩu hiện tại không đúng.' });
      }
      if (body.newPassword !== body.confirmNewPassword) {
        return sendJson(res, 400, { message: 'Mật khẩu mới và ô nhập lại chưa giống nhau.' });
      }
      db.prepare(`UPDATE Users SET PasswordHash = ?, UpdatedAt = ? WHERE Id = ?`).run(
        hashPassword(String(body.newPassword)),
        new Date().toISOString(),
        userRow.Id
      );
      return sendJson(res, 204, null);
    }

    // ── 9. Exercises ──
    if (req.method === 'GET' && pathname === '/api/exercises') {
      const rows = db
        .prepare(
          `SELECT e.*, (SELECT COUNT(*) FROM FeedbackRules r WHERE r.ExerciseId = e.Id AND r.IsEnabled = 1) as RuleCount
           FROM Exercises e ORDER BY e.DisplayOrder`
        )
        .all();
      return sendJson(
        res,
        200,
        rows.map(e => ({
          id: e.Id,
          code: e.Code,
          name: e.Name,
          description: e.Description,
          videoUrl: e.VideoUrl,
          imageUrl: e.ImageUrl,
          difficulty: e.Difficulty,
          targetMuscles: e.TargetMuscles,
          ruleCount: e.RuleCount,
        }))
      );
    }

    // ── 10. Sessions ──
    if (req.method === 'GET' && pathname === '/api/sessions') {
      const claims = getAuthClaims(req);
      if (!claims) return sendJson(res, 401, { message: 'Unauthorized' });
      const rows = db
        .prepare(
          `SELECT s.*, e.Code as ExerciseCode, e.Name as ExerciseName
           FROM WorkoutSessions s JOIN Exercises e ON s.ExerciseId = e.Id
           WHERE s.UserId = ? ORDER BY s.StartedAt DESC LIMIT 50`
        )
        .all(Number(claims.sub));

      return sendJson(res, 200, {
        items: rows.map(s => ({
          id: s.Id,
          exerciseCode: s.ExerciseCode,
          exerciseName: s.ExerciseName,
          startedAt: s.StartedAt,
          durationSec: s.DurationSec,
          totalReps: s.TotalReps,
          correctReps: s.CorrectReps,
          formScore: s.FormScore,
          caloriesBurned: s.CaloriesBurned,
          status: s.Status,
        })),
        page: 1,
        pageSize: 50,
        totalItems: rows.length,
        totalPages: 1,
      });
    }

    if (req.method === 'GET' && pathname.startsWith('/api/sessions/')) {
      const claims = getAuthClaims(req);
      if (!claims) return sendJson(res, 401, { message: 'Unauthorized' });
      const id = Number(pathname.split('/').pop());
      const s = db
        .prepare(
          `SELECT s.*, e.Code as ExerciseCode, e.Name as ExerciseName
           FROM WorkoutSessions s JOIN Exercises e ON s.ExerciseId = e.Id WHERE s.Id = ?`
        )
        .get(id);
      if (!s) return sendJson(res, 404, { message: 'Session not found' });

      const reps = db
        .prepare(
          `SELECT r.*, fr.Code as RuleCode, fr.Name as RuleName
           FROM RepDetails r LEFT JOIN FeedbackRules fr ON r.RuleId = fr.Id
           WHERE r.SessionId = ? ORDER BY r.RepNumber`
        )
        .all(id);

      return sendJson(res, 200, {
        id: s.Id,
        exerciseCode: s.ExerciseCode,
        exerciseName: s.ExerciseName,
        startedAt: s.StartedAt,
        durationSec: s.DurationSec,
        totalReps: s.TotalReps,
        correctReps: s.CorrectReps,
        formScore: s.FormScore,
        caloriesBurned: s.CaloriesBurned,
        status: s.Status,
        note: s.Note,
        reps: reps.map(r => ({
          id: r.Id,
          repNumber: r.RepNumber,
          isCorrect: Boolean(r.IsCorrect),
          ruleCode: r.RuleCode,
          ruleName: r.RuleName,
          occurredAtMs: r.OccurredAtMs,
          anglesJson: r.AnglesJson,
        })),
      });
    }

    if (req.method === 'POST' && pathname === '/api/sessions') {
      const claims = getAuthClaims(req);
      if (!claims) return sendJson(res, 401, { message: 'Unauthorized' });
      const body = await readJsonBody(req);
      const code = String(body.exerciseCode || 'squat').toLowerCase();
      const ex = db.prepare(`SELECT * FROM Exercises WHERE Code = ?`).get(code);
      if (!ex) return sendJson(res, 404, { message: 'Exercise not found' });

      const totalReps = Number(body.totalReps || 0);
      const correctReps = Number(body.correctReps || 0);
      const durationSec = Number(body.durationSec || 0);
      const formScore = body.formScore ?? (totalReps > 0 ? Math.round((correctReps * 100) / totalReps) : 100);
      const calories = ex.CaloriesPerRep ? Number((correctReps * ex.CaloriesPerRep).toFixed(2)) : Number(((durationSec / 60) * (ex.CaloriesPerMinute || 3.5)).toFixed(2));
      const startedAt = body.startedAt || new Date().toISOString();

      const info = db
        .prepare(
          `INSERT INTO WorkoutSessions (UserId, ExerciseId, StartedAt, DurationSec, TotalReps, CorrectReps, FormScore, CaloriesBurned, Status, CreatedAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Completed', ?)`
        )
        .run(Number(claims.sub), ex.Id, startedAt, durationSec, totalReps, correctReps, formScore, calories, new Date().toISOString());

      const sid = Number(info.lastInsertRowid);
      const repsInput = Array.isArray(body.reps) ? body.reps : [];
      const insertRep = db.prepare(
        `INSERT INTO RepDetails (SessionId, RepNumber, IsCorrect, RuleId, OccurredAtMs, AnglesJson)
         VALUES (?, ?, ?, ?, ?, ?)`
      );
      const exRules = db.prepare(`SELECT Id, Code, Name FROM FeedbackRules WHERE ExerciseId = ?`).all(ex.Id);

      for (let i = 0; i < repsInput.length; i++) {
        const r = repsInput[i];
        const isCorrect = r.isCorrect ? 1 : 0;
        let ruleId = null;
        if (!isCorrect && exRules.length > 0) {
          const matched = exRules.find(
            er => er.Code === r.ruleCode || er.Name === r.ruleCode
          );
          ruleId = matched ? matched.Id : exRules[0].Id;
        }
        insertRep.run(
          sid,
          Number(r.repNumber || i + 1),
          isCorrect,
          ruleId,
          Number(r.occurredAtMs || (i + 1) * 2000),
          r.anglesJson || null
        );
      }

      const savedReps = db
        .prepare(
          `SELECT r.*, fr.Code as RuleCode, fr.Name as RuleName
           FROM RepDetails r LEFT JOIN FeedbackRules fr ON r.RuleId = fr.Id
           WHERE r.SessionId = ? ORDER BY r.RepNumber`
        )
        .all(sid);

      return sendJson(res, 200, {
        id: sid,
        exerciseCode: ex.Code,
        exerciseName: ex.Name,
        startedAt,
        durationSec,
        totalReps,
        correctReps,
        formScore,
        caloriesBurned: calories,
        status: 'Completed',
        reps: savedReps.map(r => ({
          id: r.Id,
          repNumber: r.RepNumber,
          isCorrect: Boolean(r.IsCorrect),
          ruleCode: r.RuleCode,
          ruleName: r.RuleName,
          occurredAtMs: r.OccurredAtMs,
          anglesJson: r.AnglesJson,
        })),
      });
    }

    // ── 11. Admin Endpoints ──
    if (req.method === 'PUT' && /^\/api\/admin\/users\/\d+\/status$/.test(pathname)) {
      const parts = pathname.split('/');
      const userId = Number(parts[4]);
      const body = await readJsonBody(req);
      const isActive = body.isActive ? 1 : 0;
      db.prepare(`UPDATE Users SET IsActive = ?, UpdatedAt = ? WHERE Id = ?`).run(
        isActive,
        new Date().toISOString(),
        userId
      );
      return sendJson(res, 200, { id: userId, isActive: Boolean(isActive) });
    }

    if (req.method === 'DELETE' && /^\/api\/admin\/users\/\d+$/.test(pathname)) {
      const userId = Number(pathname.split('/').pop());
      db.prepare(`DELETE FROM Users WHERE Id = ?`).run(userId);
      return sendJson(res, 204, null);
    }
    if (req.method === 'GET' && pathname === '/api/admin/users') {
      const rows = db
        .prepare(
          `SELECT u.*, (SELECT COUNT(*) FROM WorkoutSessions s WHERE s.UserId = u.Id) as TotalSessions
           FROM Users u ORDER BY u.Id ASC`
        )
        .all();
      return sendJson(res, 200, {
        items: rows.map(u => ({
          id: u.Id,
          email: u.Email,
          fullName: u.FullName,
          role: u.Role,
          isActive: Boolean(u.IsActive),
          createdAt: u.CreatedAt,
          totalSessions: u.TotalSessions,
        })),
        page: 1,
        pageSize: 50,
        totalItems: rows.length,
        totalPages: 1,
      });
    }

    if (req.method === 'GET' && pathname === '/api/admin/rules') {
      const rows = db.prepare(`SELECT * FROM FeedbackRules ORDER BY ExerciseId, DisplayOrder`).all();
      return sendJson(
        res,
        200,
        rows.map(r => ({
          id: r.Id,
          code: r.Code,
          name: r.Name,
          description: r.Description,
          severity: r.Severity,
          thresholdsJson: r.ThresholdsJson,
          isEnabled: Boolean(r.IsEnabled),
        }))
      );
    }

    if (req.method === 'PUT' && pathname.startsWith('/api/admin/rules/')) {
      const id = Number(pathname.split('/').pop());
      const body = await readJsonBody(req);
      if (typeof body.isEnabled === 'boolean') {
        db.prepare(`UPDATE FeedbackRules SET IsEnabled = ? WHERE Id = ?`).run(body.isEnabled ? 1 : 0, id);
      }
      const r = db.prepare(`SELECT * FROM FeedbackRules WHERE Id = ?`).get(id);
      return sendJson(res, 200, {
        id: r.Id,
        code: r.Code,
        name: r.Name,
        description: r.Description,
        severity: r.Severity,
        thresholdsJson: r.ThresholdsJson,
        isEnabled: Boolean(r.IsEnabled),
      });
    }

    if (req.method === 'GET' && pathname === '/api/admin/dashboard') {
      const totalUsers = db.prepare(`SELECT COUNT(*) as c FROM Users`).get().c;
      const activeUsers = db.prepare(`SELECT COUNT(*) as c FROM Users WHERE IsActive = 1`).get().c;
      const totalSessions = db.prepare(`SELECT COUNT(*) as c FROM WorkoutSessions`).get().c;
      const avgFormScore = db.prepare(`SELECT COALESCE(AVG(FormScore), 84) as a FROM WorkoutSessions`).get().a;
      return sendJson(res, 200, {
        totalUsers,
        activeUsers,
        totalSessions,
        totalReps: 240,
        avgFormScore: Math.round(avgFormScore),
        sessionsByExercise: [],
        sessionsLast7Days: [],
        topRuleViolations: [],
      });
    }

    if (req.method === 'GET' && pathname === '/api/admin/logs') {
      const rows = db.prepare(`SELECT * FROM SystemLogs ORDER BY Id DESC LIMIT 50`).all();
      return sendJson(res, 200, {
        page: 1,
        pageSize: 50,
        total: rows.length,
        items: rows.map(l => ({
          id: l.Id,
          level: l.Level,
          type: l.Type,
          message: l.Message,
          userEmail: l.UserEmail,
          exercise: l.Exercise,
          path: l.Path,
          createdAt: l.CreatedAt,
        })),
      });
    }

    return sendJson(res, 404, { message: `Endpoint not found: ${req.method} ${pathname}` });
  } catch (err) {
    console.error('[Server Error]', err);
    return sendJson(res, 500, { message: 'Lỗi máy chủ nội bộ.' });
  }
});

server.on('error', err => {
  if (err && err.code === 'EADDRINUSE') {
    console.log(`ℹ️ AIFit Backend DB server is already running on http://localhost:${PORT}`);
    process.exit(0);
  }
  console.error(err);
});

server.listen(PORT, () => {
  console.log(`🚀 AIFit Backend + SQLite DB (AIFit_Db) listening on http://localhost:${PORT}`);
});
