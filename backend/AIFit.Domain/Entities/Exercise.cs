namespace AIFit.Domain.Entities;

public class Exercise
{
    public int Id { get; set; }

    /// <summary>Stable identifier used by the frontend AI pipeline, e.g. "squat", "plank", "pushup".</summary>
    public string Code { get; set; } = null!;

    public string Name { get; set; } = null!;

    public string Description { get; set; } = null!;

    /// <summary>Path or URL to demo video (e.g. /videos/squat.mp4).</summary>
    public string? VideoUrl { get; set; }

    /// <summary>Path or URL to pose reference image (e.g. /images/squat.jpg).</summary>
    public string? ImageUrl { get; set; }

    public string Difficulty { get; set; } = Enums.Difficulty.Beginner;

    /// <summary>Comma-separated target muscle groups.</summary>
    public string? TargetMuscles { get; set; }

    /// <summary>Kcal burned per completed rep (squat / push-up). Null for duration-based exercises.</summary>
    public decimal? CaloriesPerRep { get; set; }

    /// <summary>Kcal burned per minute of correct hold (plank). Null for rep-based exercises.</summary>
    public decimal? CaloriesPerMinute { get; set; }

    public int DisplayOrder { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public ICollection<FeedbackRule> FeedbackRules { get; set; } = new List<FeedbackRule>();
    public ICollection<WorkoutSession> Sessions { get; set; } = new List<WorkoutSession>();
}
