namespace AIFit.Domain.Entities;

/// <summary>
/// Per-rep record stored at the end of a workout so the History page can
/// replay which reps failed and why.
/// </summary>
public class RepDetail
{
    public int Id { get; set; }

    public int SessionId { get; set; }
    public WorkoutSession Session { get; set; } = null!;

    /// <summary>1-based rep index within the session (for plank: checkpoint index every 15s).</summary>
    public int RepNumber { get; set; }

    public bool IsCorrect { get; set; }

    /// <summary>Fired feedback rule, null when the rep was correct.</summary>
    public int? RuleId { get; set; }
    public FeedbackRule? Rule { get; set; }

    /// <summary>Offset from session start in milliseconds.</summary>
    public int OccurredAtMs { get; set; }

    /// <summary>Optional JSON snapshot of joint angles at the failing frame.</summary>
    public string? AnglesJson { get; set; }
}
