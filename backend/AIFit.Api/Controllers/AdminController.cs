using AIFit.Application.DTOs;
using AIFit.Application.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace AIFit.Api.Controllers;

[ApiController]
[Route("api/admin")]
[Authorize(Policy = "Admin")]
public class AdminController : ControllerBase
{
    private readonly IAdminService _admin;

    public AdminController(IAdminService admin)
    {
        _admin = admin;
    }

    /// <summary>Paged user list with session counts (Admin Users page).</summary>
    [HttpGet("users")]
    public async Task<ActionResult<PagedResult<AdminUserDto>>> GetUsers(
        [FromQuery] string? search,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 10)
    {
        return Ok(await _admin.GetUsersAsync(page, pageSize, search));
    }

    /// <summary>All users' workout sessions (Admin Sessions page).</summary>
    [HttpGet("sessions")]
    public async Task<ActionResult<PagedResult<SessionDto>>> GetSessions(
        [FromQuery] string? exerciseCode,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 10)
    {
        return Ok(await _admin.GetAllSessionsAsync(exerciseCode, page, pageSize));
    }

    /// <summary>Feedback rule catalog, optionally filtered by exercise (Admin Rules page).</summary>
    [HttpGet("rules")]
    public async Task<ActionResult<List<FeedbackRuleDto>>> GetRules([FromQuery] string? exerciseCode)
    {
        return Ok(await _admin.GetRulesAsync(exerciseCode));
    }

    /// <summary>Update a rule: rename, re-describe, tweak thresholds JSON, enable/disable.</summary>
    [HttpPut("rules/{id:int}")]
    public async Task<ActionResult<FeedbackRuleDto>> UpdateRule(int id, [FromBody] UpdateRuleRequest request)
    {
        return Ok(await _admin.UpdateRuleAsync(id, request));
    }

    /// <summary>Dashboard aggregates: users, sessions, top violated rules, last-7-days trend.</summary>
    [HttpGet("dashboard")]
    public async Task<ActionResult<AdminDashboardDto>> GetDashboard()
    {
        return Ok(await _admin.GetDashboardAsync());
    }
}
