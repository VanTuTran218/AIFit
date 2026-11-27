namespace AIFit.Application.DTOs;

/// <summary>Aggregate numbers for one calendar day (History charts).</summary>
public class DailyStatDto
{
    /// <summary>yyyy-MM-dd (UTC).</summary>
    public string Date { get; set; } = null!;
    public int Sessions { get; set; }
    public int TotalReps { get; set; }
    public int CorrectReps { get; set; }
    public decimal AvgFormScore { get; set; }
    public int Minutes { get; set; }
    public decimal Calories { get; set; }
}

/// <summary>Lifetime totals for the Summary / Profile page.</summary>
public class StatsSummaryDto
{
    public int TotalSessions { get; set; }
    public int TotalReps { get; set; }
    public int TotalCorrectReps { get; set; }
    public decimal OverallFormScore { get; set; }
    public int TotalMinutes { get; set; }
    public decimal TotalCalories { get; set; }
    public int CurrentStreakDays { get; set; }
    public int LongestStreakDays { get; set; }
    public DateTime? LastWorkoutAt { get; set; }
    /// <summary>Reps/minutes per exercise code, e.g. squat: 120.</summary>
    public Dictionary<string, int> RepsByExercise { get; set; } = new();
}
