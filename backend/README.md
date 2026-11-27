# AIFit Backend — Phase 3 (ASP.NET Core 8 + EF Core + SQL Server)

Backend cho hệ thống **AIFit — Huấn luyện viên ảo** (C1SE.87). Kiến trúc Clean Architecture 4 project, JWT Auth, EF Core Migrations, seed dữ liệu tự động.

## 1. Cấu trúc solution

```
backend/
├── AIFit.Domain/           # Entities (6 bảng) + enums — không phụ thuộc thư viện ngoài
│   ├── Entities/           # User, Exercise, FeedbackRule, WorkoutSession, RepDetail, RefreshToken
│   └── Enums/              # UserRole, SessionStatus, Severity, Difficulty
├── AIFit.Application/      # Business logic + DTOs
│   ├── DTOs/               # Auth, Exercise, Session, Stats, User/Admin DTOs
│   ├── Services/           # TokenService (JWT), AuthService, SessionService, StatsService, AdminService, ExerciseService
│   └── Common/             # ApiException (mapping lỗi → HTTP status)
├── AIFit.Infrastructure/   # EF Core
│   └── Data/
│       ├── AifitDbContext.cs   # Cấu hình 6 bảng, index, FK, precision
│       ├── Migrations/         # EF Core migrations
│       └── DbSeeder.cs         # Seed: 3 bài tập + 11 rules + admin + 35 buổi demo
└── AIFit.Api/              # Web API (controllers, Program.cs, Swagger, CORS)
    ├── Controllers/        # Auth, Exercises, Sessions, Stats, Users, Admin
    ├── Middleware/         # ExceptionMiddleware
    └── Services/           # CurrentUserService (đọc JWT claims)
```

**Luồng phụ thuộc:** `Api → Application + Infrastructure`, `Infrastructure → Application → Domain`.

## 2. Yêu cầu môi trường

| Thành phần | Phiên bản |
|---|---|
| .NET SDK | **8.0** (LTS) — kiểm tra: `dotnet --version` |
| SQL Server | LocalDB (đi kèm Visual Studio) hoặc SQL Express |
| Kết nối DB | mặc định `(localdb)\MSSQLLocalDB` — sửa trong `appsettings.json` nếu khác |

## 3. Chạy lần đầu (3 lệnh)

```cmd
cd backend\AIFit.Api
dotnet run
```

Hết. Vì app **tự động**: tạo database `AIFit_Db` (EF Migrate) → seed 3 exercises + 11 rules + tài khoản + ~35 buổi tập demo.

- Swagger: **http://localhost:5000/swagger**
- API root: **http://localhost:5000**

> ⚠️ Nếu máy bạn không có LocalDB (lỗi khi `dotnet run`), đổi connection string trong `AIFit.Api\appsettings.json`:
> - SQL Express: `Server=.\SQLEXPRESS;Database=AIFit_Db;Trusted_Connection=True;MultipleActiveResultSets=true;TrustServerCertificate=True`
> - Docker: `Server=localhost,1433;Database=AIFit_Db;User Id=sa;Password=<pass>;TrustServerCertificate=True`

## 4. Tài khoản seed sẵn

| Vai trò | Email | Mật khẩu |
|---|---|---|
| Admin | `admin@aifit.vn` | `Admin@123` |
| Trainee (demo, có lịch sử 35 ngày) | `trainee@aifit.vn` | `Trainee@123` |

## 5. Danh sách API

### Auth (public)
| Method | Endpoint | Mô tả |
|---|---|---|
| POST | `/api/auth/register` | Đăng ký (email, password, fullName, gender?, heightCm?, weightKg?) |
| POST | `/api/auth/login` | Đăng nhập → `{accessToken, refreshToken, user}` |
| POST | `/api/auth/refresh` | Đổi refresh token lấy cặp token mới |
| GET | `/api/auth/me` | Thông tin user hiện tại 🔒 |

### Exercises (public)
| Method | Endpoint | Mô tả |
|---|---|---|
| GET | `/api/exercises` | Danh sách 3 bài tập (card Home/Guide) |
| GET | `/api/exercises/{code}` | Chi tiết + rules đang bật (`squat` \| `plank` \| `pushup`) |

### Sessions 🔒
| Method | Endpoint | Mô tả |
|---|---|---|
| POST | `/api/sessions` | Lưu 1 buổi tập: tổng số rep + chi tiết từng rep (`reps[]` với `ruleCode`) |
| GET | `/api/sessions?exerciseCode=&page=&pageSize=` | Lịch sử phân trang |
| GET | `/api/sessions/{id}` | Chi tiết 1 buổi (per-rep breakdown) |

### Stats 🔒
| Method | Endpoint | Mô tả |
|---|---|---|
| GET | `/api/stats/summary` | Tổng buổi, tổng rep, form score, streak, calories |
| GET | `/api/stats/daily?days=30` | Dữ liệu biểu đồ theo ngày |

### Users 🔒
| Method | Endpoint | Mô tả |
|---|---|---|
| GET | `/api/users/profile` | Xem profile |
| PUT | `/api/users/profile` | Cập nhật họ tên / chiều cao / cân nặng |

### Admin 🔒 (role Admin)
| Method | Endpoint | Mô tả |
|---|---|---|
| GET | `/api/admin/users?search=&page=` | Danh sách user + số buổi tập |
| GET | `/api/admin/sessions?exerciseCode=` | Tất cả session của mọi user |
| GET | `/api/admin/rules?exerciseCode=` | Danh mục 11 rules |
| PUT | `/api/admin/rules/{id}` | Sửa rule: tên, mô tả, **thresholdsJson**, bật/tắt |
| GET | `/api/admin/dashboard` | Số liệu dashboard: users, sessions, top vi phạm, trend 7 ngày |

🔒 = cần header `Authorization: Bearer <accessToken>`

## 6. Test nhanh bằng Swagger

1. Mở `http://localhost:5000/swagger`
2. `POST /api/auth/login` → body:
   ```json
   { "email": "admin@aifit.vn", "password": "Admin@123" }
   ```
3. Copy `accessToken` từ response → nút **Authorize** (góc phải) → paste → OK
4. Gọi thử `GET /api/admin/dashboard`, `GET /api/stats/summary`…

### Ví dụ lưu một buổi squat (POST /api/sessions)
```json
{
  "exerciseCode": "squat",
  "durationSec": 180,
  "totalReps": 12,
  "correctReps": 10,
  "status": "Completed",
  "reps": [
    { "repNumber": 1, "isCorrect": true, "occurredAtMs": 12000 },
    { "repNumber": 2, "isCorrect": false, "ruleCode": "squat_depth", "occurredAtMs": 21000,
      "anglesJson": "{\"kneeAngle\": 112}" }
  ]
}
```
> `formScore` và `caloriesBurned` bỏ trống thì server tự tính.

## 7. Các lệnh EF Core hay dùng

```cmd
# tạo migration mới (sau khi sửa entity)
dotnet ef migrations add TenMigration -p backend\AIFit.Infrastructure -s backend\AIFit.Api

# cập nhật database
dotnet ef database update -p backend\AIFit.Infrastructure -s backend\AIFit.Api

# xoá database để seed lại từ đầu
dotnet ef database drop -f -p backend\AIFit.Infrastructure -s backend\AIFit.Api
```
> Cần cài tool một lần: `dotnet tool install --global dotnet-ef` (yêu cầu .NET SDK).

## 8. Lưu ý bảo mật trước khi nộp

- Đổi `Jwt:Key` trong `appsettings.json` thành key riêng (≥ 32 ký tự) — hiện tại là key demo.
- Mật khẩu hash bằng **BCrypt** (không lưu plaintext).
- Refresh token có **rotation**: mỗi lần refresh, token cũ bị thu hồi.
- CORS chỉ mở cho `localhost:5173` (Vite dev) — khi deploy FE nhớ thêm domain thật.

## 9. Kết nối Frontend

Xem hướng dẫn trong `frontend-integration/` — copy 2 file vào project React rồi cấu hình `VITE_API_URL=http://localhost:5000`. File `src/data/mock.ts` sẽ được thay dần bằng dữ liệu thật từ API.
