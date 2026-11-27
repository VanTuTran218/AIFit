using System.Security.Cryptography;
using AIFit.Application.Common;
using AIFit.Application.DTOs;
using AIFit.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace AIFit.Application.Services;

public interface IAuthService
{
    Task<OtpSentResponse> SendRegisterOtpAsync(SendRegisterOtpRequest request);
    Task<AuthResponse> RegisterAsync(RegisterRequest request);
    Task<AuthResponse> LoginAsync(LoginRequest request);
    Task<OtpSentResponse> ForgotPasswordAsync(ForgotPasswordRequest request);
    Task VerifyResetOtpAsync(VerifyOtpRequest request);
    Task ResetPasswordAsync(ResetPasswordWithOtpRequest request);
    Task<AuthResponse> RefreshAsync(RefreshRequest request);
    Task<UserDto> GetMeAsync(int userId);
    Task<UserDto> UpdateProfileAsync(int userId, UpdateProfileRequest request);
    Task ChangePasswordAsync(int userId, ChangePasswordRequest request);
}

public class AuthService : IAuthService
{
    private readonly DbContext _db;
    private readonly ITokenService _tokenService;
    private readonly ILogService _logs;
    private readonly IEmailService _email;

    private const int OtpExpirySeconds = 300; // 5 minutes

    public AuthService(DbContext db, ITokenService tokenService, ILogService logs, IEmailService email)
    {
        _db = db;
        _tokenService = tokenService;
        _logs = logs;
        _email = email;
    }

    public async Task<OtpSentResponse> SendRegisterOtpAsync(SendRegisterOtpRequest request)
    {
        var email = request.Email.Trim().ToLowerInvariant();

        var exists = await _db.Set<User>().AnyAsync(u => u.Email == email);
        if (exists)
        {
            throw ApiException.Conflict("Địa chỉ email này đã được đăng ký.");
        }

        var otpCode = GenerateSixDigitOtp();
        await SaveOtpAsync(email, otpCode, "Register");

        var sentViaGmail = await _email.SendOtpEmailAsync(
            email,
            string.IsNullOrWhiteSpace(request.FullName) ? "Học viên AIFit" : request.FullName.Trim(),
            otpCode,
            "Register");

        await _logs.WriteAsync("Info", "AuthOtpSent", $"Đã gửi mã OTP đăng ký tới {email}", userEmail: email);

        return new OtpSentResponse
        {
            Message = sentViaGmail
                ? $"Mã xác thực OTP đã được gửi tới Gmail {email}."
                : $"Đã tạo mã OTP cho {email} (chế độ thử nghiệm chưa cấu hình SMTP).",
            ExpiresInSeconds = OtpExpirySeconds,
            DeliveryMode = sentViaGmail ? "gmail" : "dev",
            DevOtp = sentViaGmail ? null : otpCode
        };
    }

    public async Task<AuthResponse> RegisterAsync(RegisterRequest request)
    {
        var email = request.Email.Trim().ToLowerInvariant();

        var exists = await _db.Set<User>().AnyAsync(u => u.Email == email);
        if (exists)
        {
            throw ApiException.Conflict("Địa chỉ email này đã được đăng ký.");
        }

        if (!string.IsNullOrWhiteSpace(request.OtpCode))
        {
            await ValidateAndConsumeOtpAsync(email, request.OtpCode.Trim(), "Register");
        }

        var user = new User
        {
            Email = email,
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(request.Password),
            FullName = request.FullName.Trim(),
            Role = Domain.Enums.UserRole.Trainee,
            Gender = request.Gender,
            HeightCm = request.HeightCm,
            WeightKg = request.WeightKg,
            CreatedAt = DateTime.UtcNow
        };

        _db.Set<User>().Add(user);
        await _db.SaveChangesAsync();

        await _logs.WriteAsync("Info", "AuthRegister", "Đăng ký tài khoản mới thành công qua OTP", userEmail: email);

        return await IssueTokensAsync(user);
    }

    public async Task<AuthResponse> LoginAsync(LoginRequest request)
    {
        var email = request.Email.Trim().ToLowerInvariant();
        var user = await _db.Set<User>().FirstOrDefaultAsync(u => u.Email == email);

        if (user == null || !BCrypt.Net.BCrypt.Verify(request.Password, user.PasswordHash))
        {
            await _logs.WriteAsync("Warning", "AuthFailedLogin", "Đăng nhập sai email hoặc mật khẩu", userEmail: email);
            throw ApiException.Unauthorized("Email hoặc mật khẩu không chính xác.");
        }

        if (!user.IsActive)
        {
            await _logs.WriteAsync("Warning", "AuthBlocked", "Tài khoản bị vô hiệu hoá cố gắng đăng nhập", userEmail: email);
            throw ApiException.Forbidden("Tài khoản của bạn đã bị khóa. Vui lòng liên hệ quản trị viên.");
        }

        await _logs.WriteAsync("Info", "AuthLogin", "Đăng nhập thành công", userEmail: email);

        return await IssueTokensAsync(user);
    }

    public async Task<OtpSentResponse> ForgotPasswordAsync(ForgotPasswordRequest request)
    {
        var email = request.Email.Trim().ToLowerInvariant();
        var user = await _db.Set<User>().FirstOrDefaultAsync(u => u.Email == email);

        if (user == null)
        {
            throw ApiException.NotFound("Không tìm thấy tài khoản nào đăng ký với địa chỉ email này.");
        }

        if (!user.IsActive)
        {
            throw ApiException.Forbidden("Tài khoản này đang bị khóa. Không thể khôi phục mật khẩu.");
        }

        var otpCode = GenerateSixDigitOtp();
        await SaveOtpAsync(email, otpCode, "ResetPassword");

        var sentViaGmail = await _email.SendOtpEmailAsync(email, user.FullName, otpCode, "ResetPassword");
        await _logs.WriteAsync("Info", "AuthForgotPassword", $"Yêu cầu mã OTP khôi phục mật khẩu cho {email}", userEmail: email);

        return new OtpSentResponse
        {
            Message = sentViaGmail
                ? $"Mã khôi phục mật khẩu đã được gửi tới Gmail {email}."
                : $"Đã tạo mã OTP khôi phục mật khẩu cho {email} (chế độ thử nghiệm).",
            ExpiresInSeconds = OtpExpirySeconds,
            DeliveryMode = sentViaGmail ? "gmail" : "dev",
            DevOtp = sentViaGmail ? null : otpCode
        };
    }

    public async Task VerifyResetOtpAsync(VerifyOtpRequest request)
    {
        var email = request.Email.Trim().ToLowerInvariant();
        var code = request.OtpCode.Trim();

        var record = await _db.Set<EmailOtp>()
            .Where(o => o.Email == email && o.Purpose == "ResetPassword" && !o.IsUsed)
            .OrderByDescending(o => o.CreatedAt)
            .FirstOrDefaultAsync();

        if (record == null || record.OtpCode != code)
        {
            throw ApiException.BadRequest("Mã xác thực OTP không chính xác.");
        }

        if (record.ExpiresAt < DateTime.UtcNow)
        {
            throw ApiException.BadRequest("Mã OTP đã hết hạn. Vui lòng yêu cầu gửi lại mã mới.");
        }
    }

    public async Task ResetPasswordAsync(ResetPasswordWithOtpRequest request)
    {
        var email = request.Email.Trim().ToLowerInvariant();

        if (request.NewPassword != request.ConfirmNewPassword)
        {
            throw ApiException.BadRequest("Mật khẩu xác nhận không trùng khớp.");
        }

        var user = await _db.Set<User>().FirstOrDefaultAsync(u => u.Email == email)
            ?? throw ApiException.NotFound("Không tìm thấy tài khoản người dùng.");

        await ValidateAndConsumeOtpAsync(email, request.OtpCode.Trim(), "ResetPassword");

        user.PasswordHash = BCrypt.Net.BCrypt.HashPassword(request.NewPassword);
        user.UpdatedAt = DateTime.UtcNow;

        var activeTokens = await _db.Set<RefreshToken>()
            .Where(t => t.UserId == user.Id && t.RevokedAt == null)
            .ToListAsync();

        foreach (var t in activeTokens)
        {
            t.RevokedAt = DateTime.UtcNow;
        }

        await _db.SaveChangesAsync();
        await _logs.WriteAsync("Info", "AuthResetPassword", "Đặt lại mật khẩu thành công qua OTP Gmail", userEmail: email);
    }

    public async Task<AuthResponse> RefreshAsync(RefreshRequest request)
    {
        var stored = await _db.Set<RefreshToken>()
            .Include(t => t.User)
            .FirstOrDefaultAsync(t => t.Token == request.RefreshToken);

        if (stored == null || !stored.IsActive)
        {
            throw ApiException.Unauthorized("Refresh token is invalid or expired. Please log in again.");
        }

        stored.RevokedAt = DateTime.UtcNow;

        var (accessToken, expiresAt) = _tokenService.CreateAccessToken(stored.User);
        var newRefresh = _tokenService.CreateRefreshToken();

        _db.Set<RefreshToken>().Add(new RefreshToken
        {
            UserId = stored.UserId,
            Token = newRefresh,
            ExpiresAt = DateTime.UtcNow.AddDays(RefreshTokenDays),
            CreatedAt = DateTime.UtcNow
        });

        await _db.SaveChangesAsync();

        return new AuthResponse
        {
            AccessToken = accessToken,
            AccessTokenExpiresAt = expiresAt,
            RefreshToken = newRefresh,
            User = ToDto(stored.User)
        };
    }

    public async Task<UserDto> GetMeAsync(int userId)
    {
        var user = await _db.Set<User>().FirstOrDefaultAsync(u => u.Id == userId)
            ?? throw ApiException.NotFound("User not found.");
        return ToDto(user);
    }

    public async Task<UserDto> UpdateProfileAsync(int userId, UpdateProfileRequest request)
    {
        var user = await _db.Set<User>().FirstOrDefaultAsync(u => u.Id == userId)
            ?? throw ApiException.NotFound("User not found.");

        user.FullName = request.FullName.Trim();
        user.Gender = request.Gender;
        user.HeightCm = request.HeightCm;
        user.WeightKg = request.WeightKg;
        user.UpdatedAt = DateTime.UtcNow;

        await _db.SaveChangesAsync();
        return ToDto(user);
    }

    public async Task ChangePasswordAsync(int userId, ChangePasswordRequest request)
    {
        var user = await _db.Set<User>().FirstOrDefaultAsync(u => u.Id == userId)
            ?? throw ApiException.NotFound("User not found.");

        if (!BCrypt.Net.BCrypt.Verify(request.CurrentPassword, user.PasswordHash))
        {
            throw ApiException.BadRequest("Mật khẩu hiện tại không đúng.");
        }

        if (request.NewPassword != request.ConfirmNewPassword)
        {
            throw ApiException.BadRequest("Mật khẩu mới và ô nhập lại chưa giống nhau.");
        }

        user.PasswordHash = BCrypt.Net.BCrypt.HashPassword(request.NewPassword);
        user.UpdatedAt = DateTime.UtcNow;

        var tokens = await _db.Set<RefreshToken>()
            .Where(t => t.UserId == userId && t.RevokedAt == null)
            .ToListAsync();
        foreach (var t in tokens)
        {
            t.RevokedAt = DateTime.UtcNow;
        }

        await _db.SaveChangesAsync();
    }

    private static string GenerateSixDigitOtp()
    {
        return RandomNumberGenerator.GetInt32(100000, 1000000).ToString();
    }

    private async Task SaveOtpAsync(string email, string otpCode, string purpose)
    {
        var existing = await _db.Set<EmailOtp>()
            .Where(o => o.Email == email && o.Purpose == purpose && !o.IsUsed)
            .ToListAsync();

        foreach (var old in existing)
        {
            old.IsUsed = true;
        }

        _db.Set<EmailOtp>().Add(new EmailOtp
        {
            Email = email,
            OtpCode = otpCode,
            Purpose = purpose,
            ExpiresAt = DateTime.UtcNow.AddSeconds(OtpExpirySeconds),
            IsUsed = false,
            CreatedAt = DateTime.UtcNow
        });

        await _db.SaveChangesAsync();
    }

    private async Task ValidateAndConsumeOtpAsync(string email, string otpCode, string purpose)
    {
        var record = await _db.Set<EmailOtp>()
            .Where(o => o.Email == email && o.Purpose == purpose && !o.IsUsed)
            .OrderByDescending(o => o.CreatedAt)
            .FirstOrDefaultAsync();

        if (record == null || record.OtpCode != otpCode)
        {
            throw ApiException.BadRequest("Mã xác thực OTP không chính xác.");
        }

        if (record.ExpiresAt < DateTime.UtcNow)
        {
            throw ApiException.BadRequest("Mã OTP đã hết hạn. Vui lòng yêu cầu gửi lại mã mới.");
        }

        record.IsUsed = true;
        await _db.SaveChangesAsync();
    }

    private async Task<AuthResponse> IssueTokensAsync(User user)
    {
        var (accessToken, expiresAt) = _tokenService.CreateAccessToken(user);
        var refresh = _tokenService.CreateRefreshToken();

        _db.Set<RefreshToken>().Add(new RefreshToken
        {
            UserId = user.Id,
            Token = refresh,
            ExpiresAt = DateTime.UtcNow.AddDays(RefreshTokenDays),
            CreatedAt = DateTime.UtcNow
        });

        await _db.SaveChangesAsync();

        return new AuthResponse
        {
            AccessToken = accessToken,
            AccessTokenExpiresAt = expiresAt,
            RefreshToken = refresh,
            User = ToDto(user)
        };
    }

    private static int RefreshTokenDays => 30;

    private static UserDto ToDto(User u) => new()
    {
        Id = u.Id,
        Email = u.Email,
        FullName = u.FullName,
        Role = u.Role,
        Gender = u.Gender,
        HeightCm = u.HeightCm,
        WeightKg = u.WeightKg,
        CreatedAt = u.CreatedAt
    };
}
