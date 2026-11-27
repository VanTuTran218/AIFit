using AIFit.Application.Common;
using AIFit.Application.DTOs;
using AIFit.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace AIFit.Application.Services;

public interface IExerciseService
{
    Task<List<ExerciseDto>> GetAllAsync();
    Task<ExerciseDetailDto> GetByCodeAsync(string code);
}

public class ExerciseService : IExerciseService
{
    private readonly DbContext _db;

    public ExerciseService(DbContext db) => _db = db;

    public async Task<List<ExerciseDto>> GetAllAsync()
    {
        var exercises = await _db.Set<Exercise>()
            .OrderBy(e => e.DisplayOrder)
            .ToListAsync();

        var ruleCounts = await _db.Set<FeedbackRule>()
            .Where(r => r.IsEnabled)
            .GroupBy(r => r.ExerciseId)
            .Select(g => new { ExerciseId = g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.ExerciseId, x => x.Count);

        return exercises.Select(e => new ExerciseDto
        {
            Id = e.Id,
            Code = e.Code,
            Name = e.Name,
            Description = e.Description,
            VideoUrl = e.VideoUrl,
            ImageUrl = e.ImageUrl,
            Difficulty = e.Difficulty,
            TargetMuscles = e.TargetMuscles,
            RuleCount = ruleCounts.GetValueOrDefault(e.Id)
        }).ToList();
    }

    public async Task<ExerciseDetailDto> GetByCodeAsync(string code)
    {
        var exercise = await _db.Set<Exercise>()
            .Include(e => e.FeedbackRules)
            .FirstOrDefaultAsync(e => e.Code == code.Trim().ToLowerInvariant())
            ?? throw ApiException.NotFound($"Exercise '{code}' was not found.");

        return new ExerciseDetailDto
        {
            Id = exercise.Id,
            Code = exercise.Code,
            Name = exercise.Name,
            Description = exercise.Description,
            VideoUrl = exercise.VideoUrl,
            ImageUrl = exercise.ImageUrl,
            Difficulty = exercise.Difficulty,
            TargetMuscles = exercise.TargetMuscles,
            RuleCount = exercise.FeedbackRules.Count(r => r.IsEnabled),
            Rules = exercise.FeedbackRules
                .Where(r => r.IsEnabled)
                .OrderBy(r => r.DisplayOrder)
                .Select(r => new FeedbackRuleDto
                {
                    Id = r.Id,
                    Code = r.Code,
                    Name = r.Name,
                    Description = r.Description,
                    Severity = r.Severity,
                    ThresholdsJson = r.ThresholdsJson,
                    IsEnabled = r.IsEnabled
                }).ToList()
        };
    }
}
