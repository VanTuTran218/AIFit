namespace AIFit.Domain.Entities;

/// <summary>One completed workout (a single exercise session tracked in real time).</summary>
public class WorkoutSession
{
    public int Id { get; set; }

    public int UserId { get; set; }
    public User User { get; set; } = null!;

    public int ExerciseId { get; set; }
    public Exercise Exercise { get; set; } = null!;

    public DateTime StartedAt { get; set; }

    /// <summary>Total active duration in seconds.</summary>
    public int DurationSec { get; set; }

    public int TotalReps { get; set; }

    public int CorrectReps { get; set; }

    /// <summary>Form score 0-100 = correctReps / totalReps * 100 (or evaluator-defined).</summary>
    public decimal FormScore { get; set; }

    public decimal CaloriesBurned { get; set; }

    public string Status { get; set; } = Enums.SessionStatus.Completed;

    public string? Note { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public ICollection<RepDetail> Reps { get; set; } = new List<RepDetail>();
}
