using AIFit.Application.DTOs;
using AIFit.Application.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace AIFit.Api.Controllers;

[ApiController]
[Route("api/users")]
[Authorize]
public class UsersController : ControllerBase
{
    private readonly IAuthService _auth;
    private readonly ICurrentUserService _currentUser;

    public UsersController(IAuthService auth, ICurrentUserService currentUser)
    {
        _auth = auth;
        _currentUser = currentUser;
    }

    /// <summary>Get own profile (Profile page).</summary>
    [HttpGet("profile")]
    public async Task<ActionResult<UserDto>> GetProfile()
    {
        return Ok(await _auth.GetMeAsync(_currentUser.UserId));
    }

    /// <summary>Update own profile info (height/weight are used for calorie estimates).</summary>
    [HttpPut("profile")]
    public async Task<ActionResult<UserDto>> UpdateProfile([FromBody] UpdateProfileRequest request)
    {
        var updated = await _auth.UpdateProfileAsync(_currentUser.UserId, request);
        return Ok(updated);
    }

    // ★ THÊM MỚI: đổi mật khẩu (PUT /api/users/password)
    /// <summary>Change own password. Revokes all refresh tokens (must log in again).</summary>
    [HttpPut("password")]
    public async Task<IActionResult> ChangePassword([FromBody] ChangePasswordRequest request)
    {
        await _auth.ChangePasswordAsync(_currentUser.UserId, request);
        return NoContent(); // 204 — thành công, không trả body
    }
}