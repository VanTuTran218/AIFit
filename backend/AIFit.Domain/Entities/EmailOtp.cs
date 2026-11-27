namespace AIFit.Domain.Entities;

public class EmailOtp
{
    public int Id { get; set; }

    public string Email { get; set; } = null!;

    public string OtpCode { get; set; } = null!;

    /// <summary>"Register" or "ResetPassword"</summary>
    public string Purpose { get; set; } = "Register";

    public DateTime ExpiresAt { get; set; }

    public bool IsUsed { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
