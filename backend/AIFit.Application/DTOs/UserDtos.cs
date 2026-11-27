using System.ComponentModel.DataAnnotations;

namespace AIFit.Application.DTOs;

public class UpdateProfileRequest
{
    [Required, MinLength(2), MaxLength(200)]
    public string FullName { get; set; } = null!;

    [MaxLength(10)]
    public string? Gender { get; set; }

    [Range(100, 250)]
    public decimal? HeightCm { get; set; }

    [Range(25, 300)]
    public decimal? WeightKg { get; set; }
}

// ---------- Admin DTOs ----------

public class AdminUserDto
{
    public int Id { get; set; }
    public string Email { get; set; } = null!;
    public string FullName { get; set; } = null!;
    public string Role { get; set; } = null!;
    public bool IsActive { get; set; }
    public DateTime CreatedAt { get; set; }
    public int TotalSessions { get; set; }
    public DateTime? LastWorkoutAt { get; set; }
}

public class UpdateRuleRequest
{
    [MaxLength(100)]
    public string? Name { get; set; }

    [MaxLength(500)]
    public string? Description { get; set; }

    /// <summary>Must be a valid JSON object when provided.</summary>
    public string? ThresholdsJson { get; set; }

    public bool? IsEnabled { get; set; }
}

public class AdminDashboardDto
{
    public int TotalUsers { get; set; }
    public int ActiveUsers { get; set; }
    public int TotalSessions { get; set; }
    public int TotalReps { get; set; }
    public decimal AvgFormScore { get; set; }
    public List<ExerciseUsageDto> SessionsByExercise { get; set; } = new();
    public List<DailyCountDto> SessionsLast7Days { get; set; } = new();
    public List<RuleFireStatDto> TopRuleViolations { get; set; } = new();
}

public class ExerciseUsageDto
{
    public string ExerciseCode { get; set; } = null!;
    public string ExerciseName { get; set; } = null!;
    public int SessionCount { get; set; }
}

public class DailyCountDto
{
    public string Date { get; set; } = null!;
    public int Count { get; set; }
}

public class RuleFireStatDto
{
    public string RuleCode { get; set; } = null!;
    public string RuleName { get; set; } = null!;
    public int FireCount { get; set; }
}
public class ChangePasswordRequest
{
    [Required]
    public string CurrentPassword { get; set; } = null!;

    [Required, MinLength(6)]
    public string NewPassword { get; set; } = null!;

    [Required]
    public string ConfirmNewPassword { get; set; } = null!;
}