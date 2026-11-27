namespace AIFit.Domain.Entities;

/// <summary>
/// A form-correction rule the AI engine checks for one exercise
/// (e.g. "knees pass toes" for squat). Thresholds are stored as JSON so
/// the admin can fine-tune them without redeploying the frontend.
/// </summary>
public class FeedbackRule
{
    public int Id { get; set; }

    public int ExerciseId { get; set; }
    public Exercise Exercise { get; set; } = null!;

    /// <summary>Stable code shared with the frontend evaluators, e.g. "SQT_KNEE_FORWARD".</summary>
    public string Code { get; set; } = null!;

    public string Name { get; set; } = null!;

    public string Description { get; set; } = null!;

    public string Severity { get; set; } = Enums.Severity.Warning;

    /// <summary>JSON object with numeric thresholds used by the frontend evaluator.</summary>
    public string ThresholdsJson { get; set; } = "{}";

    public bool IsEnabled { get; set; } = true;

    public int DisplayOrder { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
