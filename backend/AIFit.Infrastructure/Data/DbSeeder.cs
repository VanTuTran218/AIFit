using AIFit.Domain.Entities;
using AIFit.Domain.Enums;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace AIFit.Infrastructure.Data;

/// <summary>
/// Idempotent seeder: exercises, the 11 feedback rules, one admin account,
/// one demo trainee and ~35 demo workout sessions so the Admin dashboard and
/// History charts have data immediately after the first run.
/// </summary>
public static class DbSeeder
{
    public static async Task SeedAsync(AifitDbContext db, ILogger? logger = null)
    {
        var hasExercises = await db.Exercises.AnyAsync();
        var hasUsers = await db.Users.AnyAsync();

        if (hasExercises && hasUsers)
        {
            return; // already seeded
        }

        await using var tx = await db.Database.BeginTransactionAsync();

        // ---------- 1. Exercises ----------
        var squat = new Exercise
        {
            Code = "squat",
            Name = "Squat",
            Description = "Bài tập squat cơ bản: hai chân rộng bằng vai, hạ hông xuống until đùi song song sàn rồi đẩy người đứng lên. Tăng cường cơ đùi trước, cơ mông và lõi.",
            VideoUrl = "/videos/squat.mp4",
            ImageUrl = "/images/squat.jpg",
            Difficulty = Difficulty.Intermediate,
            TargetMuscles = "Quadriceps, Glutes, Hamstrings, Core",
            CaloriesPerRep = 0.32m,
            DisplayOrder = 1
        };

        var plank = new Exercise
        {
            Code = "plank",
            Name = "Plank",
            Description = "Giữ tư thế plank tĩnh: khuỷu tay vuông góc vai, thân người tạo đường thẳng từ đầu đến gót chân. Tăng cường cơ lõi và sức bền toàn thân.",
            VideoUrl = "/videos/plank.mp4",
            ImageUrl = "/images/plank.jpg",
            Difficulty = Difficulty.Beginner,
            TargetMuscles = "Core, Rectus Abdominis, Obliques",
            CaloriesPerMinute = 3.9m,
            DisplayOrder = 2
        };

        var pushup = new Exercise
        {
            Code = "pushup",
            Name = "Push-up",
            Description = "Hít đất chuẩn form: hai tay rộng hơn vai một chút, hạ ngực xuống gần sàn rồi đẩy người lên. Tăng cường cơ ngực, vai và tay sau.",
            VideoUrl = "/videos/pushup.mp4",
            ImageUrl = "/images/pushup.jpg",
            Difficulty = Difficulty.Intermediate,
            TargetMuscles = "Chest, Triceps, Shoulders, Core",
            CaloriesPerRep = 0.29m,
            DisplayOrder = 3
        };

        db.Exercises.AddRange(squat, plank, pushup);
        await db.SaveChangesAsync(); // need IDs for FK

        // ---------- 2. Feedback rules (11) ----------
        var rules = new List<FeedbackRule>
        {
            // ----- Squat (4) -----
            new()
            {
                ExerciseId = squat.Id, Code = "squat_knee_toe",
                Name = "Đầu gối vượt quá mũi chân",
                Description = "Khi hạ xuống, đầu gối đẩy vượt quá mũi chân gây áp lực lớn lên khớp gối. Hãy đẩy hông ra sau và giữ gối thẳng hướng mũi chân.",
                Severity = Severity.Error,
                ThresholdsJson = "{\"maxKneeOverToeRatio\": 0.1}",
                DisplayOrder = 1
            },
            new()
            {
                ExerciseId = squat.Id, Code = "squat_depth",
                Name = "Squat chưa đủ sâu",
                Description = "Chưa hạ đủ thấp — hông nên xuống dưới mức đầu gối (đùi song song sàn hoặc thấp hơn) để kích hoạt tối đa cơ mông.",
                Severity = Severity.Warning,
                ThresholdsJson = "{\"minKneeAngleDeg\": 95}",
                DisplayOrder = 2
            },
            new()
            {
                ExerciseId = squat.Id, Code = "squat_back_round",
                Name = "Lưng cong khi hạ người",
                Description = "Lưng dưới cong quá mức làm tăng nguy cơ chấn thương cột sống. Giữ ngực ưỡn, mắt nhìn về phía trước, core siết chặt.",
                Severity = Severity.Error,
                ThresholdsJson = "{\"maxSpineLeanDeg\": 45}",
                DisplayOrder = 3
            },
            new()
            {
                ExerciseId = squat.Id, Code = "squat_heel_lift",
                Name = "Gót chân nhấc khỏi sàn",
                Description = "Gót chân nhấc làm mất điểm tựa và lệch trọng tâm. Đặt toàn bộ bàn chân bám sàn, phân bổ trọng lượng về gót và giữa bàn chân.",
                Severity = Severity.Warning,
                ThresholdsJson = "{\"minAnkleAngleDeg\": 70}",
                DisplayOrder = 4
            },

            // ----- Plank (4) -----
            new()
            {
                ExerciseId = plank.Id, Code = "plank_hip_sag",
                Name = "Hông tụt xuống quá thấp",
                Description = "Hông tụt khiến cột sống ưỡn quá mức, gây đau lưng dưới. Siết cơ mông và bụng để giữ thân thẳng.",
                Severity = Severity.Error,
                ThresholdsJson = "{\"maxShoulderHipAnkleAngleDeg\": 165}",
                DisplayOrder = 1
            },
            new()
            {
                ExerciseId = plank.Id, Code = "plank_hip_high",
                Name = "Hông nâng quá cao",
                Description = "Đẩy hông quá cao làm giảm tác động lên cơ lõi. Hạ hông xuống để thân người tạo một đường thẳng.",
                Severity = Severity.Warning,
                ThresholdsJson = "{\"minShoulderHipAnkleAngleDeg\": 175}",
                DisplayOrder = 2
            },
            new()
            {
                ExerciseId = plank.Id, Code = "plank_neck_drop",
                Name = "Cổ gật gù / ngẩng quá cao",
                Description = "Cổ không thẳng hàng với cột sống gây căng cơ vai gáy. Nhìn xuống sàn, giữ gáy kéo dài tự nhiên.",
                Severity = Severity.Warning,
                ThresholdsJson = "{\"maxNeckAngleDeg\": 25}",
                DisplayOrder = 3
            },
            new()
            {
                ExerciseId = plank.Id, Code = "plank_elbow_offset",
                Name = "Khuỷu tay không ngay dưới vai",
                Description = "Khuỷu đặt lệch về trước hoặc sau vai làm giảm ổn định khớp vai. Đặt khuỷu thẳng đứng ngay dưới khớp vai.",
                Severity = Severity.Warning,
                ThresholdsJson = "{\"maxElbowShoulderOffsetRatio\": 0.15}",
                DisplayOrder = 4
            },

            // ----- Push-up (3) -----
            new()
            {
                ExerciseId = pushup.Id, Code = "pushup_elbow_flare",
                Name = "Cánh tay xòe quá rộng",
                Description = "Khuỷu tay xòe ra gần vuông góc với thân gây áp lực lên khớp vai. Giữ khuỷu tạo góc khoảng 45 độ so với thân.",
                Severity = Severity.Warning,
                ThresholdsJson = "{\"maxElbowFlareDeg\": 60}",
                DisplayOrder = 1
            },
            new()
            {
                ExerciseId = pushup.Id, Code = "pushup_hip_sag",
                Name = "Hông tụt, thân không thẳng",
                Description = "Hông tụt xuống phá vỡ đường thẳng đầu-mông-gót, làm giảm hiệu quả và nguy cơ đau lưng. Siết core, giữ thân cứng như tấm ván.",
                Severity = Severity.Error,
                ThresholdsJson = "{\"minShoulderHipAnkleAngleDeg\": 165}",
                DisplayOrder = 2
            },
            new()
            {
                ExerciseId = pushup.Id, Code = "pushup_depth",
                Name = "Hạ chưa đủ sâu",
                Description = "Ngực chưa hạ tới gần sàn (khuỷu chưa gập ~90 độ) khiến động tác kém hiệu quả. Hạ sâu hơn, ngực cách sàn một nắm tay.",
                Severity = Severity.Warning,
                ThresholdsJson = "{\"maxElbowAngleDegAtBottom\": 100}",
                DisplayOrder = 3
            }
        };

        db.FeedbackRules.AddRange(rules);

        // ---------- 3. Accounts ----------
        var admin = new User
        {
            Email = "admin@aifit.vn",
            PasswordHash = BCrypt.Net.BCrypt.HashPassword("Admin@123"),
            FullName = "Quản trị viên AIFit",
            Role = UserRole.Admin,
            CreatedAt = DateTime.UtcNow.AddDays(-60)
        };

        var trainee = new User
        {
            Email = "trainee@aifit.vn",
            PasswordHash = BCrypt.Net.BCrypt.HashPassword("Trainee@123"),
            FullName = "Nguyễn Văn Demo",
            Role = UserRole.Trainee,
            Gender = "Male",
            HeightCm = 172m,
            WeightKg = 65m,
            CreatedAt = DateTime.UtcNow.AddDays(-45)
        };

        db.Users.AddRange(admin, trainee);
        await db.SaveChangesAsync();

        // ---------- 4. Demo workout history (trainee, last 35 days) ----------
        var rng = new Random(42); // deterministic seed
        var sessions = new List<WorkoutSession>();
        var ruleLookup = new Dictionary<string, List<FeedbackRule>>
        {
            ["squat"] = rules.Where(r => r.ExerciseId == squat.Id).ToList(),
            ["plank"] = rules.Where(r => r.ExerciseId == plank.Id).ToList(),
            ["pushup"] = rules.Where(r => r.ExerciseId == pushup.Id).ToList()
        };
        var exerciseByCode = new Dictionary<string, Exercise>
        {
            ["squat"] = squat, ["plank"] = plank, ["pushup"] = pushup
        };

        for (var day = 34; day >= 0; day--)
        {
            // Skip some days to make streaks/charts look realistic.
            if (rng.NextDouble() < 0.3 && day != 0) continue;

            var exercisesOfDay = rng.Next(1, 3); // 1-2 exercises per day
            var chosen = exerciseByCode.Values.OrderBy(_ => rng.Next()).Take(exercisesOfDay);

            foreach (var exercise in chosen)
            {
                var isPlank = exercise.Code == "plank";
                var startedAt = DateTime.UtcNow.Date
                    .AddDays(-day)
                    .AddHours(6 + rng.Next(0, 15))
                    .AddMinutes(rng.Next(0, 60));

                var durationSec = isPlank ? 45 + rng.Next(0, 4) * 30 : 90 + rng.Next(0, 8) * 15;
                var totalReps = isPlank ? 1 : 8 + rng.Next(0, 12);

                var applicableRules = ruleLookup[exercise.Code];
                var reps = new List<RepDetail>();
                var badReps = 0;

                for (var i = 1; i <= totalReps; i++)
                {
                    var isCorrect = rng.NextDouble() > 0.22 || totalReps == 1 && rng.NextDouble() > 0.5;
                    var rep = new RepDetail
                    {
                        RepNumber = i,
                        IsCorrect = isCorrect,
                        OccurredAtMs = (int)(durationSec * 1000.0 * i / (totalReps + 1))
                    };

                    if (!isCorrect)
                    {
                        badReps++;
                        var rule = applicableRules[rng.Next(applicableRules.Count)];
                        rep.RuleId = rule.Id;
                        rep.AnglesJson = $"{{\"note\":\"auto-demo\",\"frame\":{100 + rng.Next(0, 500)}}}";
                    }

                    reps.Add(rep);
                }

                var correctReps = totalReps - badReps;
                var calories = isPlank
                    ? (decimal)(durationSec / 60.0) * (exercise.CaloriesPerMinute ?? 0m)
                    : correctReps * (exercise.CaloriesPerRep ?? 0m);

                sessions.Add(new WorkoutSession
                {
                    UserId = trainee.Id,
                    ExerciseId = exercise.Id,
                    StartedAt = startedAt,
                    DurationSec = durationSec,
                    TotalReps = totalReps,
                    CorrectReps = correctReps,
                    FormScore = totalReps > 0 ? Math.Round(correctReps * 100m / totalReps, 2) : 0m,
                    CaloriesBurned = Math.Round(calories, 2),
                    Status = rng.NextDouble() < 0.93 ? SessionStatus.Completed : SessionStatus.Abandoned,
                    CreatedAt = startedAt,
                    Reps = reps
                });
            }
        }

        db.WorkoutSessions.AddRange(sessions);
        await db.SaveChangesAsync();

        await tx.CommitAsync();

        logger?.LogInformation(
            "Seeded {Exercises} exercises, {Rules} rules, {Users} users, {Sessions} demo sessions.",
            3, rules.Count, 2, sessions.Count);
    }
}
