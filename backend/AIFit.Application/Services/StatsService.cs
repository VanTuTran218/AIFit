using AIFit.Application.DTOs;
using AIFit.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace AIFit.Application.Services;

public interface IStatsService
{
    Task<StatsSummaryDto> GetSummaryAsync(int userId);
    Task<List<DailyStatDto>> GetDailyAsync(int userId, int days);
}

public class StatsService : IStatsService
{
    private readonly DbContext _db;

    public StatsService(DbContext db) => _db = db;

    public async Task<StatsSummaryDto> GetSummaryAsync(int userId)
    {
        var sessions = await _db.Set<WorkoutSession>()
            .AsNoTracking()
            .Where(s => s.UserId == userId)
            .Select(s => new
            {
                s.StartedAt,
                s.TotalReps,
                s.CorrectReps,
                s.FormScore,
                s.DurationSec,
                s.CaloriesBurned,
                ExerciseCode = s.Exercise.Code
            })
            .ToListAsync();

        if (sessions.Count == 0)
        {
            return new StatsSummaryDto();
        }

        var days = sessions.Select(s => s.StartedAt.Date).Distinct().OrderBy(d => d).ToList();

        return new StatsSummaryDto
        {
            TotalSessions = sessions.Count,
            TotalReps = sessions.Sum(s => s.TotalReps),
            TotalCorrectReps = sessions.Sum(s => s.CorrectReps),
            OverallFormScore = sessions.Sum(s => s.TotalReps) > 0
                ? Math.Round(sessions.Sum(s => s.CorrectReps) * 100m / sessions.Sum(s => s.TotalReps), 2)
                : 0m,
            TotalMinutes = (int)Math.Round(sessions.Sum(s => (double)s.DurationSec) / 60.0),
            TotalCalories = Math.Round(sessions.Sum(s => s.CaloriesBurned), 2),
            CurrentStreakDays = ComputeCurrentStreak(days),
            LongestStreakDays = ComputeLongestStreak(days),
            LastWorkoutAt = sessions.Max(s => s.StartedAt),
            RepsByExercise = sessions
                .GroupBy(s => s.ExerciseCode)
                .ToDictionary(g => g.Key, g => g.Sum(s => s.TotalReps))
        };
    }

    public async Task<List<DailyStatDto>> GetDailyAsync(int userId, int days)
    {
        days = Math.Clamp(days, 7, 365);
        var from = DateTime.UtcNow.Date.AddDays(-(days - 1));

        var raw = await _db.Set<WorkoutSession>()
            .AsNoTracking()
            .Where(s => s.UserId == userId && s.StartedAt >= from)
            .GroupBy(s => s.StartedAt.Date)
            .Select(g => new
            {
                Date = g.Key,
                Sessions = g.Count(),
                TotalReps = g.Sum(s => s.TotalReps),
                CorrectReps = g.Sum(s => s.CorrectReps),
                Minutes = g.Sum(s => s.DurationSec) / 60,
                Calories = g.Sum(s => s.CaloriesBurned)
            })
            .OrderBy(x => x.Date)
            .ToListAsync();

        return raw.Select(x => new DailyStatDto
        {
            Date = x.Date.ToString("yyyy-MM-dd"),
            Sessions = x.Sessions,
            TotalReps = x.TotalReps,
            CorrectReps = x.CorrectReps,
            AvgFormScore = x.TotalReps > 0 ? Math.Round(x.CorrectReps * 100m / x.TotalReps, 2) : 0m,
            Minutes = x.Minutes,
            Calories = Math.Round(x.Calories, 2)
        }).ToList();
    }

    private static int ComputeCurrentStreak(List<DateTime> workoutDays)
    {
        if (workoutDays.Count == 0) return 0;

        var set = workoutDays.ToHashSet();
        var today = DateTime.UtcNow.Date;

        // Streak survives if last workout was today or yesterday.
        var cursor = set.Contains(today) ? today : today.AddDays(-1);
        if (!set.Contains(cursor)) return 0;

        var streak = 0;
        while (set.Contains(cursor))
        {
            streak++;
            cursor = cursor.AddDays(-1);
        }

        return streak;
    }

    private static int ComputeLongestStreak(List<DateTime> workoutDays)
    {
        if (workoutDays.Count == 0) return 0;

        var ordered = workoutDays.Distinct().OrderBy(d => d).ToList();
        int longest = 1, current = 1;

        for (var i = 1; i < ordered.Count; i++)
        {
            current = (ordered[i] - ordered[i - 1]).Days == 1 ? current + 1 : 1;
            if (current > longest) longest = current;
        }

        return longest;
    }
}
