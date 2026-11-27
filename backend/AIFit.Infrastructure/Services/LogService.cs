using AIFit.Application.DTOs;
using AIFit.Application.Services;
using AIFit.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using AIFit.Infrastructure.Data;
namespace AIFit.Infrastructure.Services;   // ★ chép khớp namespace Infrastructure của bạn

public class LogService : ILogService
{
    private readonly AifitDbContext _db;   // ★★★ ĐỔI "AifitDbContext" thành tên DbContext THẬT của bạn (có trong 3 chỗ dưới đây)

    public LogService(AifitDbContext db) { _db = db; }

    public async Task WriteAsync(string level, string type, string message,
        string? userEmail = null, string? exercise = null, string? path = null)
    {
        try
        {
            _db.SystemLogs.Add(new SystemLog
            {
                Level = NormalizeLevel(level),
                Type = Trunc(type, 50) ?? "Info",
                Message = Trunc(message, 500) ?? "(no message)",
                UserEmail = Trunc(userEmail, 256),
                Exercise = Trunc(exercise, 30),
                Path = Trunc(path, 200),
                CreatedAt = DateTime.UtcNow
            });
            await _db.SaveChangesAsync();
        }
        catch { /* log là best-effort — lỗi log không được làm lỗi nghiệp vụ */ }
    }

    public async Task<LogListDto> GetLogsAsync(int page, int pageSize,
        string? level = null, string? type = null, int? days = null)
    {
        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, 200);

        var q = _db.SystemLogs.AsNoTracking().AsQueryable();
        if (!string.IsNullOrWhiteSpace(level)) q = q.Where(x => x.Level == level.Trim());
        if (!string.IsNullOrWhiteSpace(type))  q = q.Where(x => x.Type == type.Trim());
        if (days is > 0) q = q.Where(x => x.CreatedAt >= DateTime.UtcNow.AddDays(-days.Value));

        var total = await q.CountAsync();
        var items = await q.OrderByDescending(x => x.CreatedAt)
            .Skip((page - 1) * pageSize).Take(pageSize)
            .Select(x => new SystemLogDto
            {
                Id = x.Id, Level = x.Level, Type = x.Type, Message = x.Message,
                UserEmail = x.UserEmail, Exercise = x.Exercise, Path = x.Path, CreatedAt = x.CreatedAt
            })
            .ToListAsync();

        return new LogListDto { Page = page, PageSize = pageSize, Total = total, Items = items };
    }

    public async Task<int> CountSinceAsync(DateTime fromUtc, string? level = null)
    {
        var q = _db.SystemLogs.AsNoTracking().Where(x => x.CreatedAt >= fromUtc);
        if (!string.IsNullOrWhiteSpace(level)) q = q.Where(x => x.Level == level.Trim());
        return await q.CountAsync();
    }

    public async Task<List<SystemLogDto>> GetRecentAsync(int count = 10, string? level = null)
    {
        count = Math.Clamp(count, 1, 50);
        var q = _db.SystemLogs.AsNoTracking().AsQueryable();
        if (!string.IsNullOrWhiteSpace(level)) q = q.Where(x => x.Level == level.Trim());

        return await q.OrderByDescending(x => x.CreatedAt).Take(count)
            .Select(x => new SystemLogDto
            {
                Id = x.Id, Level = x.Level, Type = x.Type, Message = x.Message,
                UserEmail = x.UserEmail, Exercise = x.Exercise, Path = x.Path, CreatedAt = x.CreatedAt
            })
            .ToListAsync();
    }

    private static string NormalizeLevel(string? l)
    {
        var v = (l ?? "").Trim();
        return v is "Error" or "Warning" or "Info" ? v : "Info";
    }

    private static string? Trunc(string? s, int max)
        => string.IsNullOrEmpty(s) ? s : (s.Length <= max ? s : s[..max]);
}