using AIFit.Application.DTOs;
using AIFit.Application.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;

namespace AIFit.Api.Controllers;   // ★ chép khớp namespace của controller khác (vd UsersController)

[ApiController]
public class LogsController : ControllerBase
{
    private readonly ILogService _logs;
    public LogsController(ILogService logs) { _logs = logs; }

    // GET /api/admin/logs?page=1&pageSize=20&level=warning&type=AuthFailedLogin&days=7
    [HttpGet("api/admin/logs")]
    [Authorize(Policy = "Admin")]
    public async Task<ActionResult<LogListDto>> List(
        [FromQuery] int page = 1, [FromQuery] int pageSize = 20,
        [FromQuery] string? level = null, [FromQuery] string? type = null, [FromQuery] int? days = null)
        => Ok(await _logs.GetLogsAsync(page, pageSize, level, type, days));

    // GET /api/admin/logs/recent?count=10&level=error
    [HttpGet("api/admin/logs/recent")]
    [Authorize(Policy = "Admin")]
    public async Task<IActionResult> Recent([FromQuery] int count = 10, [FromQuery] string? level = null)
        => Ok(await _logs.GetRecentAsync(count, level));

    // GET /api/admin/logs/count?hours=24&level=error
    [HttpGet("api/admin/logs/count")]
    [Authorize(Policy = "Admin")]
    public async Task<IActionResult> Count([FromQuery] int hours = 24, [FromQuery] string? level = "error")
        => Ok(new { count = await _logs.CountSinceAsync(DateTime.UtcNow.AddHours(-hours), level) });

    // POST /api/logs — MỌI user đã đăng nhập (kể cả trainee) tự ghi log khi đang tập
    [HttpPost("api/logs")]
    [Authorize]
    public async Task<IActionResult> Create([FromBody] CreateLogDto dto)
    {
        var email = User.FindFirstValue(ClaimTypes.Email)
                    ?? User.FindFirstValue("email")
                    ?? User.FindFirstValue(ClaimTypes.Name);

        await _logs.WriteAsync(dto.Level, dto.Type, dto.Message, email, dto.Exercise);
        return Ok(new { ok = true });
    }
}