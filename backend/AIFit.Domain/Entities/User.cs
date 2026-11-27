namespace AIFit.Domain.Entities;

public class User
{
    public int Id { get; set; }

    public string Email { get; set; } = null!;

    public string PasswordHash { get; set; } = null!;

    public string FullName { get; set; } = null!;

    public string Role { get; set; } = Enums.UserRole.Trainee;

    /// <summary>Male / Female / Other (optional, used for calorie estimation).</summary>
    public string? Gender { get; set; }

    public decimal? HeightCm { get; set; }

    public decimal? WeightKg { get; set; }

    public bool IsActive { get; set; } = true;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public DateTime? UpdatedAt { get; set; }

    public ICollection<WorkoutSession> Sessions { get; set; } = new List<WorkoutSession>();

    public ICollection<RefreshToken> RefreshTokens { get; set; } = new List<RefreshToken>();
}
