using AIFit.Application.Common;
using AIFit.Application.DTOs;
using AIFit.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace AIFit.Application.Services;

public interface ISessionService
{
    Task<SessionDetailDto> SaveAsync(int userId, SaveSessionRequest request);
    Task<PagedResult<SessionDto>> GetHistoryAsync(int userId, string? exerciseCode, int page, int pageSize);
    Task<SessionDetailDto> GetByIdAsync(int userId, bool isAdmin, int sessionId);
}

public class SessionService : ISessionService
{
    private readonly DbContext _db;

    public SessionService(DbContext db) => _db = db;

    public async Task<SessionDetailDto> SaveAsync(int userId, SaveSessionRequest request)
    {
        if (request.CorrectReps > request.TotalReps)
        {
            throw ApiException.BadRequest("correctReps cannot be greater than totalReps.");
        }

        var exercise = await _db.Set<Exercise>()
            .FirstOrDefaultAsync(e => e.Code == request.ExerciseCode.Trim().ToLowerInvariant())
            ?? throw ApiException.NotFound($"Exercise '{request.ExerciseCode}' was not found.");

        // Resolve rule codes once for the whole batch.
        var ruleCodes = request.Reps
            .Where(r => !string.IsNullOrWhiteSpace(r.RuleCode))
            .Select(r => r.RuleCode!.Trim())
            .Distinct()
            .ToList();

        var ruleMap = await _db.Set<FeedbackRule>()
            .Where(r => ruleCodes.Contains(r.Code))
            .ToDictionaryAsync(r => r.Code, r => r.Id);

        var formScore = request.FormScore
            ?? (request.TotalReps > 0
                ? Math.Round(request.CorrectReps * 100m / request.TotalReps, 2)
                : 0m);

        var calories = request.CaloriesBurned ?? EstimateCalories(exercise, request.DurationSec, request.CorrectReps);

        var session = new WorkoutSession
        {
            UserId = userId,
            ExerciseId = exercise.Id,
            StartedAt = request.StartedAt?.ToUniversalTime() ?? DateTime.UtcNow.AddSeconds(-request.DurationSec),
            DurationSec = request.DurationSec,
            TotalReps = request.TotalReps,
            CorrectReps = request.CorrectReps,
            FormScore = formScore,
            CaloriesBurned = Math.Round(calories, 2),
            Status = request.Status,
            Note = request.Note,
            CreatedAt = DateTime.UtcNow
        };

        foreach (var rep in request.Reps)
        {
            int? ruleId = null;
            var code = rep.RuleCode?.Trim();

            // Unknown rule codes are tolerated (ruleId = null) so the frontend
            // evaluator can evolve ahead of the rule catalog without breaking saves.
            if (!string.IsNullOrWhiteSpace(code) && ruleMap.TryGetValue(code, out var id))
            {
                ruleId = id;
            }

            session.Reps.Add(new RepDetail
            {
                RepNumber = rep.RepNumber,
                IsCorrect = rep.IsCorrect,
                RuleId = ruleId,
                OccurredAtMs = rep.OccurredAtMs,
                AnglesJson = rep.AnglesJson
            });
        }

        _db.Set<WorkoutSession>().Add(session);
        await _db.SaveChangesAsync();

        return await GetByIdAsync(userId, isAdmin: true, session.Id);
    }

    public async Task<PagedResult<SessionDto>> GetHistoryAsync(int userId, string? exerciseCode, int page, int pageSize)
    {
        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, 100);

        var query = _db.Set<WorkoutSession>()
            .AsNoTracking()
            .Where(s => s.UserId == userId);

        if (!string.IsNullOrWhiteSpace(exerciseCode))
        {
            var code = exerciseCode.Trim().ToLowerInvariant();
            query = query.Where(s => s.Exercise.Code == code);
        }

        var total = await query.CountAsync();

        var items = await query
            .OrderByDescending(s => s.StartedAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(s => new SessionDto
            {
                Id = s.Id,
                ExerciseCode = s.Exercise.Code,
                ExerciseName = s.Exercise.Name,
                StartedAt = s.StartedAt,
                DurationSec = s.DurationSec,
                TotalReps = s.TotalReps,
                CorrectReps = s.CorrectReps,
                FormScore = s.FormScore,
                CaloriesBurned = s.CaloriesBurned,
                Status = s.Status
            })
            .ToListAsync();

        return new PagedResult<SessionDto>
        {
            Items = items,
            Page = page,
            PageSize = pageSize,
            TotalItems = total
        };
    }

    public async Task<SessionDetailDto> GetByIdAsync(int userId, bool isAdmin, int sessionId)
    {
        var session = await _db.Set<WorkoutSession>()
            .AsNoTracking()
            .Include(s => s.Exercise)
            .Include(s => s.Reps).ThenInclude(r => r.Rule)
            .FirstOrDefaultAsync(s => s.Id == sessionId)
            ?? throw ApiException.NotFound("Workout session not found.");

        if (!isAdmin && session.UserId != userId)
        {
            throw ApiException.Forbidden("You can only view your own sessions.");
        }

        return new SessionDetailDto
        {
            Id = session.Id,
            ExerciseCode = session.Exercise.Code,
            ExerciseName = session.Exercise.Name,
            StartedAt = session.StartedAt,
            DurationSec = session.DurationSec,
            TotalReps = session.TotalReps,
            CorrectReps = session.CorrectReps,
            FormScore = session.FormScore,
            CaloriesBurned = session.CaloriesBurned,
            Status = session.Status,
            Note = session.Note,
            Reps = session.Reps
                .OrderBy(r => r.RepNumber)
                .Select(r => new RepDetailDto
                {
                    Id = r.Id,
                    RepNumber = r.RepNumber,
                    IsCorrect = r.IsCorrect,
                    RuleCode = r.Rule?.Code,
                    RuleName = r.Rule?.Name,
                    OccurredAtMs = r.OccurredAtMs,
                    AnglesJson = r.AnglesJson
                }).ToList()
        };
    }

    private static decimal EstimateCalories(Exercise exercise, int durationSec, int correctReps)
    {
        if (exercise.CaloriesPerRep.HasValue)
        {
            return correctReps * exercise.CaloriesPerRep.Value;
        }

        if (exercise.CaloriesPerMinute.HasValue)
        {
            return (decimal)(durationSec / 60.0) * exercise.CaloriesPerMinute.Value;
        }

        return 0m;
    }
}
