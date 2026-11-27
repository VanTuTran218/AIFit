using System.Text.Json;
using AIFit.Application.Common;
using AIFit.Application.DTOs;
using AIFit.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace AIFit.Application.Services;

public interface IAdminService
{
    Task<PagedResult<AdminUserDto>> GetUsersAsync(int page, int pageSize, string? search);
    Task<PagedResult<SessionDto>> GetAllSessionsAsync(string? exerciseCode, int page, int pageSize);
    Task<List<FeedbackRuleDto>> GetRulesAsync(string? exerciseCode);
    Task<FeedbackRuleDto> UpdateRuleAsync(int ruleId, UpdateRuleRequest request);
    Task<AdminDashboardDto> GetDashboardAsync();
}

public class AdminService : IAdminService
{
    private readonly DbContext _db;

    public AdminService(DbContext db) => _db = db;

    public async Task<PagedResult<AdminUserDto>> GetUsersAsync(int page, int pageSize, string? search)
    {
        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, 100);

        var query = _db.Set<User>().AsNoTracking();

        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim().ToLowerInvariant();
            query = query.Where(u => u.Email.ToLower().Contains(term) || u.FullName.ToLower().Contains(term));
        }

        var total = await query.CountAsync();

        var items = await query
            .OrderByDescending(u => u.CreatedAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(u => new AdminUserDto
            {
                Id = u.Id,
                Email = u.Email,
                FullName = u.FullName,
                Role = u.Role,
                IsActive = u.IsActive,
                CreatedAt = u.CreatedAt,
                TotalSessions = u.Sessions.Count,
                LastWorkoutAt = u.Sessions.Any()
                    ? u.Sessions.Max(s => s.StartedAt)
                    : null
            })
            .ToListAsync();

        return new PagedResult<AdminUserDto>
        {
            Items = items,
            Page = page,
            PageSize = pageSize,
            TotalItems = total
        };
    }

    public Task<PagedResult<SessionDto>> GetAllSessionsAsync(string? exerciseCode, int page, int pageSize)
    {
        // Reuse the history query without the userId filter (admin sees all).
        var query = _db.Set<WorkoutSession>().AsNoTracking();

        if (!string.IsNullOrWhiteSpace(exerciseCode))
        {
            var code = exerciseCode.Trim().ToLowerInvariant();
            query = query.Where(s => s.Exercise.Code == code);
        }

        return PaginateSessionsAsync(query, page, pageSize);
    }

    public async Task<List<FeedbackRuleDto>> GetRulesAsync(string? exerciseCode)
    {
        var query = _db.Set<FeedbackRule>().AsNoTracking();

        if (!string.IsNullOrWhiteSpace(exerciseCode))
        {
            var code = exerciseCode.Trim().ToLowerInvariant();
            var exercise = await _db.Set<Exercise>().FirstOrDefaultAsync(e => e.Code == code)
                ?? throw ApiException.NotFound($"Exercise '{exerciseCode}' was not found.");
            query = query.Where(r => r.ExerciseId == exercise.Id);
        }

        var rules = await query.Include(r => r.Exercise)
            .OrderBy(r => r.ExerciseId).ThenBy(r => r.DisplayOrder)
            .ToListAsync();

        return rules.Select(r => new FeedbackRuleDto
        {
            Id = r.Id,
            Code = r.Code,
            Name = r.Name,
            Description = r.Description,
            Severity = r.Severity,
            ThresholdsJson = r.ThresholdsJson,
            IsEnabled = r.IsEnabled
        }).ToList();
    }

    public async Task<FeedbackRuleDto> UpdateRuleAsync(int ruleId, UpdateRuleRequest request)
    {
        var rule = await _db.Set<FeedbackRule>().FirstOrDefaultAsync(r => r.Id == ruleId)
            ?? throw ApiException.NotFound("Feedback rule not found.");

        if (request.ThresholdsJson != null)
        {
            ValidateJsonObject(request.ThresholdsJson);
            rule.ThresholdsJson = request.ThresholdsJson;
        }

        if (request.Name != null) rule.Name = request.Name.Trim();
        if (request.Description != null) rule.Description = request.Description.Trim();
        if (request.IsEnabled.HasValue) rule.IsEnabled = request.IsEnabled.Value;

        await _db.SaveChangesAsync();

        return new FeedbackRuleDto
        {
            Id = rule.Id,
            Code = rule.Code,
            Name = rule.Name,
            Description = rule.Description,
            Severity = rule.Severity,
            ThresholdsJson = rule.ThresholdsJson,
            IsEnabled = rule.IsEnabled
        };
    }

    public async Task<AdminDashboardDto> GetDashboardAsync()
    {
        var totalUsers = await _db.Set<User>().CountAsync();
        var activeUsers = await _db.Set<User>().CountAsync(u => u.IsActive);

        // FIX (NullReferenceException): truoc day la AsNoTracking().ToListAsync() KHONG Include,
        // roi truy cap s.Exercise.Code ben ngoai query → s.Exercise = null → crash dashboard.
        // Gio chuyen sang server-side projection (JOIN trong SQL) de Code/Name co gia tri san.
        var sessions = await _db.Set<WorkoutSession>().AsNoTracking()
            .Select(s => new
            {
                s.Id,
                s.ExerciseId,
                ExerciseCode = s.Exercise.Code,
                ExerciseName = s.Exercise.Name,
                s.StartedAt,
                s.TotalReps,
                s.CorrectReps
            })
            .ToListAsync();

        var byExercise = sessions
            .GroupBy(s => new { s.ExerciseId, s.ExerciseCode, s.ExerciseName })
            .Select(g => new ExerciseUsageDto
            {
                ExerciseCode = g.Key.ExerciseCode,
                ExerciseName = g.Key.ExerciseName,
                SessionCount = g.Count()
            })
            .OrderByDescending(x => x.SessionCount)
            .ToList();

        var last7 = DateTime.UtcNow.Date.AddDays(-6);
        var last7Counts = sessions
            .Where(s => s.StartedAt >= last7)
            .GroupBy(s => s.StartedAt.Date)
            .ToDictionary(g => g.Key, g => g.Count());

        var last7List = Enumerable.Range(0, 7)
            .Select(i =>
            {
                var d = last7.AddDays(i);
                return new DailyCountDto
                {
                    Date = d.ToString("yyyy-MM-dd"),
                    Count = last7Counts.GetValueOrDefault(d)
                };
            }).ToList();

        var topRules = await _db.Set<RepDetail>()
            .AsNoTracking()
            .Where(r => !r.IsCorrect && r.Rule != null)
            .GroupBy(r => new { r.Rule!.Code, r.Rule!.Name })
            .Select(g => new RuleFireStatDto
            {
                RuleCode = g.Key.Code,
                RuleName = g.Key.Name,
                FireCount = g.Count()
            })
            .OrderByDescending(x => x.FireCount)
            .Take(5)
            .ToListAsync();

        var totalReps = sessions.Sum(s => s.TotalReps);

        return new AdminDashboardDto
        {
            TotalUsers = totalUsers,
            ActiveUsers = activeUsers,
            TotalSessions = sessions.Count,
            TotalReps = totalReps,
            AvgFormScore = totalReps > 0
                ? Math.Round(sessions.Sum(s => s.CorrectReps) * 100m / totalReps, 2)
                : 0m,
            SessionsByExercise = byExercise,
            SessionsLast7Days = last7List,
            TopRuleViolations = topRules
        };
    }

    private async Task<PagedResult<SessionDto>> PaginateSessionsAsync(IQueryable<WorkoutSession> query, int page, int pageSize)
    {
        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, 100);

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

    private static void ValidateJsonObject(string json)
    {
        try
        {
            using var doc = JsonDocument.Parse(json);
            if (doc.RootElement.ValueKind != JsonValueKind.Object)
            {
                throw ApiException.BadRequest("thresholdsJson must be a JSON object, e.g. {\"minKneeAngle\": 95}.");
            }
        }
        catch (JsonException)
        {
            throw ApiException.BadRequest("thresholdsJson is not valid JSON.");
        }
    }
}
