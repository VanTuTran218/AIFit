using AIFit.Application.DTOs;
using AIFit.Application.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace AIFit.Api.Controllers;

[ApiController]
[Route("api/sessions")]
[Authorize]
public class SessionsController : ControllerBase
{
    private readonly ISessionService _sessions;
    private readonly ICurrentUserService _currentUser;

    public SessionsController(ISessionService sessions, ICurrentUserService currentUser)
    {
        _sessions = sessions;
        _currentUser = currentUser;
    }

    /// <summary>
    /// Save one completed workout: totals + per-rep breakdown.
    /// Called by the Workout page right after the session ends.
    /// </summary>
    [HttpPost]
    public async Task<ActionResult<SessionDetailDto>> Save([FromBody] SaveSessionRequest request)
    {
        var result = await _sessions.SaveAsync(_currentUser.UserId, request);
        return Ok(result);
    }

    /// <summary>Paginated workout history (History page). Filter by exerciseCode.</summary>
    [HttpGet]
    public async Task<ActionResult<PagedResult<SessionDto>>> GetHistory(
        [FromQuery] string? exerciseCode,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 10)
    {
        return Ok(await _sessions.GetHistoryAsync(_currentUser.UserId, exerciseCode, page, pageSize));
    }

    /// <summary>Session detail with per-rep breakdown.</summary>
    [HttpGet("{id:int}")]
    public async Task<ActionResult<SessionDetailDto>> GetById(int id)
    {
        return Ok(await _sessions.GetByIdAsync(_currentUser.UserId, _currentUser.IsAdmin, id));
    }
}
