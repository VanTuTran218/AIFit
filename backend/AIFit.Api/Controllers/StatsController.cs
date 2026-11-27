using AIFit.Application.DTOs;
using AIFit.Application.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace AIFit.Api.Controllers;

[ApiController]
[Route("api/stats")]
[Authorize]
public class StatsController : ControllerBase
{
    private readonly IStatsService _stats;
    private readonly ICurrentUserService _currentUser;

    public StatsController(IStatsService stats, ICurrentUserService currentUser)
    {
        _stats = stats;
        _currentUser = currentUser;
    }

    /// <summary>Lifetime summary: totals, form score, streaks (Summary/Profile page).</summary>
    [HttpGet("summary")]
    public async Task<ActionResult<StatsSummaryDto>> GetSummary()
    {
        return Ok(await _stats.GetSummaryAsync(_currentUser.UserId));
    }

    /// <summary>Per-day aggregates for the History charts (default last 30 days).</summary>
    [HttpGet("daily")]
    public async Task<ActionResult<List<DailyStatDto>>> GetDaily([FromQuery] int days = 30)
    {
        return Ok(await _stats.GetDailyAsync(_currentUser.UserId, days));
    }
}
