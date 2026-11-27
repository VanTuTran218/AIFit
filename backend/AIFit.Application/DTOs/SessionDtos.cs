using System.ComponentModel.DataAnnotations;

namespace AIFit.Application.DTOs;

public class RepDetailRequest
{
    public int RepNumber { get; set; }
    public bool IsCorrect { get; set; }

    /// <summary>Rule code that fired (null when correct).</summary>
    public string? RuleCode { get; set; }

    /// <summary>Offset from session start in ms.</summary>
    public int OccurredAtMs { get; set; }

    /// <summary>Optional joint-angle JSON snapshot.</summary>
    public string? AnglesJson { get; set; }
}

public class SaveSessionRequest
{
    [Required, MaxLength(20)]
    public string ExerciseCode { get; set; } = null!;

    public DateTime? StartedAt { get; set; }

    [Range(0, 24 * 60 * 60)]
    public int DurationSec { get; set; }

    [Range(0, 100000)]
    public int TotalReps { get; set; }

    [Range(0, 100000)]
    public int CorrectReps { get; set; }

    /// <summary>Optional; when omitted the server derives it from correct/total reps.</summary>
    [Range(0, 100)]
    public decimal? FormScore { get; set; }

    /// <summary>Optional; when omitted the server estimates it from the exercise metadata.</summary>
    [Range(0, 10000)]
    public decimal? CaloriesBurned { get; set; }

    [MaxLength(20)]
    public string Status { get; set; } = "Completed";

    [MaxLength(500)]
    public string? Note { get; set; }

    public List<RepDetailRequest> Reps { get; set; } = new();
}

public class RepDetailDto
{
    public int Id { get; set; }
    public int RepNumber { get; set; }
    public bool IsCorrect { get; set; }
    public string? RuleCode { get; set; }
    public string? RuleName { get; set; }
    public int OccurredAtMs { get; set; }
    public string? AnglesJson { get; set; }
}

public class SessionDto
{
    public int Id { get; set; }
    public string ExerciseCode { get; set; } = null!;
    public string ExerciseName { get; set; } = null!;
    public DateTime StartedAt { get; set; }
    public int DurationSec { get; set; }
    public int TotalReps { get; set; }
    public int CorrectReps { get; set; }
    public decimal FormScore { get; set; }
    public decimal CaloriesBurned { get; set; }
    public string Status { get; set; } = null!;
}

/// <summary>Full session detail with per-rep breakdown (History detail view).</summary>
public class SessionDetailDto : SessionDto
{
    public string? Note { get; set; }
    public List<RepDetailDto> Reps { get; set; } = new();
}

public class PagedResult<T>
{
    public List<T> Items { get; set; } = new();
    public int Page { get; set; }
    public int PageSize { get; set; }
    public int TotalItems { get; set; }
    public int TotalPages => PageSize <= 0 ? 0 : (int)Math.Ceiling(TotalItems / (double)PageSize);
}
