using System.ComponentModel.DataAnnotations;

namespace AIFit.Application.DTOs;

public class SendRegisterOtpRequest
{
    [Required, EmailAddress, MaxLength(256)]
    public string Email { get; set; } = null!;

    [MaxLength(200)]
    public string? FullName { get; set; }
}

public class ForgotPasswordRequest
{
    [Required, EmailAddress, MaxLength(256)]
    public string Email { get; set; } = null!;
}

public class VerifyOtpRequest
{
    [Required, EmailAddress, MaxLength(256)]
    public string Email { get; set; } = null!;

    [Required, MinLength(6), MaxLength(10)]
    public string OtpCode { get; set; } = null!;
}

public class ResetPasswordWithOtpRequest
{
    [Required, EmailAddress, MaxLength(256)]
    public string Email { get; set; } = null!;

    [Required, MinLength(6), MaxLength(10)]
    public string OtpCode { get; set; } = null!;

    [Required, MinLength(6), MaxLength(100)]
    public string NewPassword { get; set; } = null!;

    [Required]
    public string ConfirmNewPassword { get; set; } = null!;
}

public class OtpSentResponse
{
    public string Message { get; set; } = null!;
    public int ExpiresInSeconds { get; set; } = 300;
    /// <summary>"gmail" when sent via real Gmail SMTP, "dev" when SMTP is not configured yet</summary>
    public string DeliveryMode { get; set; } = "dev";
    public string? DevOtp { get; set; }
}

public class RegisterRequest
{
    [Required, EmailAddress, MaxLength(256)]
    public string Email { get; set; } = null!;

    [Required, MinLength(6), MaxLength(100)]
    public string Password { get; set; } = null!;

    [Required, MinLength(2), MaxLength(200)]
    public string FullName { get; set; } = null!;

    [MaxLength(10)]
    public string? OtpCode { get; set; }

    [MaxLength(10)]
    public string? Gender { get; set; }

    [Range(100, 250)]
    public decimal? HeightCm { get; set; }

    [Range(25, 300)]
    public decimal? WeightKg { get; set; }
}

public class LoginRequest
{
    [Required, EmailAddress]
    public string Email { get; set; } = null!;

    [Required]
    public string Password { get; set; } = null!;
}

public class RefreshRequest
{
    [Required]
    public string RefreshToken { get; set; } = null!;
}

public class AuthResponse
{
    public string AccessToken { get; set; } = null!;
    public DateTime AccessTokenExpiresAt { get; set; }
    public string RefreshToken { get; set; } = null!;
    public UserDto User { get; set; } = null!;
}

public class UserDto
{
    public int Id { get; set; }
    public string Email { get; set; } = null!;
    public string FullName { get; set; } = null!;
    public string Role { get; set; } = null!;
    public string? Gender { get; set; }
    public decimal? HeightCm { get; set; }
    public decimal? WeightKg { get; set; }
    public DateTime CreatedAt { get; set; }
}
