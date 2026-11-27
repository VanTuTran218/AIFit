using AIFit.Application.DTOs;
using AIFit.Application.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace AIFit.Api.Controllers;

[ApiController]
[Route("api/auth")]
public class AuthController : ControllerBase
{
    private readonly IAuthService _auth;
    private readonly ICurrentUserService _currentUser;

    public AuthController(IAuthService auth, ICurrentUserService currentUser)
    {
        _auth = auth;
        _currentUser = currentUser;
    }

    /// <summary>Send a 6-digit OTP to Gmail before completing trainee registration.</summary>
    [HttpPost("send-register-otp")]
    [AllowAnonymous]
    public async Task<ActionResult<OtpSentResponse>> SendRegisterOtp([FromBody] SendRegisterOtpRequest request)
    {
        return Ok(await _auth.SendRegisterOtpAsync(request));
    }

    /// <summary>Verify OTP and register a new trainee account.</summary>
    [HttpPost("register")]
    [AllowAnonymous]
    public async Task<ActionResult<AuthResponse>> Register([FromBody] RegisterRequest request)
    {
        var response = await _auth.RegisterAsync(request);
        return Ok(response);
    }

    /// <summary>Login with email + password, returns access/refresh tokens.</summary>
    [HttpPost("login")]
    [AllowAnonymous]
    public async Task<ActionResult<AuthResponse>> Login([FromBody] LoginRequest request)
    {
        var response = await _auth.LoginAsync(request);
        return Ok(response);
    }

    /// <summary>Send a 6-digit password reset OTP to the user's Gmail.</summary>
    [HttpPost("forgot-password")]
    [AllowAnonymous]
    public async Task<ActionResult<OtpSentResponse>> ForgotPassword([FromBody] ForgotPasswordRequest request)
    {
        return Ok(await _auth.ForgotPasswordAsync(request));
    }

    /// <summary>Verify the 6-digit password reset OTP before setting a new password.</summary>
    [HttpPost("verify-reset-otp")]
    [AllowAnonymous]
    public async Task<IActionResult> VerifyResetOtp([FromBody] VerifyOtpRequest request)
    {
        await _auth.VerifyResetOtpAsync(request);
        return Ok(new { valid = true });
    }

    /// <summary>Reset password using the verified 6-digit OTP.</summary>
    [HttpPost("reset-password")]
    [AllowAnonymous]
    public async Task<IActionResult> ResetPassword([FromBody] ResetPasswordWithOtpRequest request)
    {
        await _auth.ResetPasswordAsync(request);
        return Ok(new { message = "Đặt lại mật khẩu thành công." });
    }

    /// <summary>Exchange a refresh token for a new token pair.</summary>
    [HttpPost("refresh")]
    [AllowAnonymous]
    public async Task<ActionResult<AuthResponse>> Refresh([FromBody] RefreshRequest request)
    {
        var response = await _auth.RefreshAsync(request);
        return Ok(response);
    }

    /// <summary>Get the profile of the currently authenticated user.</summary>
    [HttpGet("me")]
    [Authorize]
    public async Task<ActionResult<UserDto>> Me()
    {
        var user = await _auth.GetMeAsync(_currentUser.UserId);
        return Ok(user);
    }
}
