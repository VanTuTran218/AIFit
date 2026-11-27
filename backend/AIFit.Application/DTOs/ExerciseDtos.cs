namespace AIFit.Application.DTOs;

public class ExerciseDto
{
    public int Id { get; set; }
    public string Code { get; set; } = null!;
    public string Name { get; set; } = null!;
    public string Description { get; set; } = null!;
    public string? VideoUrl { get; set; }
    public string? ImageUrl { get; set; }
    public string Difficulty { get; set; } = null!;
    public string? TargetMuscles { get; set; }
    public int RuleCount { get; set; }
}

/// <summary>Exercise detail including its enabled form rules (used by the Guide page).</summary>
public class ExerciseDetailDto : ExerciseDto
{
    public List<FeedbackRuleDto> Rules { get; set; } = new();
}

public class FeedbackRuleDto
{
    public int Id { get; set; }
    public string Code { get; set; } = null!;
    public string Name { get; set; } = null!;
    public string Description { get; set; } = null!;
    public string Severity { get; set; } = null!;
    public string ThresholdsJson { get; set; } = "{}";
    public bool IsEnabled { get; set; }
}
