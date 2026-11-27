namespace AIFit.Application.Services;   // ★ chép khớp namespace của service khác
using AIFit.Application.DTOs;
public interface ILogService
{
    // Ghi log — best-effort, không bao giờ throw làm sập request chính
    Task WriteAsync(string level, string type, string message,
        string? userEmail = null, string? exercise = null, string? path = null);

    Task<LogListDto> GetLogsAsync(int page, int pageSize,
        string? level = null, string? type = null, int? days = null);

    Task<int> CountSinceAsync(DateTime fromUtc, string? level = null);

    Task<List<SystemLogDto>> GetRecentAsync(int count = 10, string? level = null);
}