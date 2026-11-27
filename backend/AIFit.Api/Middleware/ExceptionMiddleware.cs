using AIFit.Application.Common;
using AIFit.Application.Services;   // ★ THÊM: để dùng ILogService
using Microsoft.AspNetCore.Mvc;
using System.Text.Json;

namespace AIFit.Api.Middleware;

/// <summary>Converts ApiException into clean JSON error responses.</summary>
public class ExceptionMiddleware
{
    private readonly RequestDelegate _next;
    private readonly ILogger<ExceptionMiddleware> _logger;
    private readonly IServiceScopeFactory _scopeFactory;   // ★ THÊM

    // ★ SỬA 1: constructor thêm IServiceScopeFactory (cuối danh sách tham số)
    public ExceptionMiddleware(RequestDelegate next, ILogger<ExceptionMiddleware> logger, IServiceScopeFactory scopeFactory)
    {
        _next = next;
        _logger = logger;
        _scopeFactory = scopeFactory;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        try
        {
            await _next(context);
        }
        catch (ApiException ex)
        {
            // Lỗi nghiệp vụ 4xx — không ghi log DB (401 sai mật khẩu đã được AuthService log riêng)
            context.Response.StatusCode = ex.StatusCode;
            context.Response.ContentType = "application/json";
            await context.Response.WriteAsync(JsonSerializer.Serialize(new { message = ex.Message }));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Unhandled exception for {Method} {Path}",
                context.Request.Method, context.Request.Path);

            // ★ SỬA 2: ghi log 500 vào DB — best-effort, không bao giờ làm hỏng response lỗi
            try
            {
                using var scope = _scopeFactory.CreateScope();
                var logs = scope.ServiceProvider.GetRequiredService<ILogService>();
                await logs.WriteAsync("Error", "Exception", ex.Message, path: context.Request.Path);
            }
            catch { /* ignore */ }

            context.Response.StatusCode = StatusCodes.Status500InternalServerError;
            context.Response.ContentType = "application/json";
            await context.Response.WriteAsync(JsonSerializer.Serialize(new
            {
                message = "An unexpected error occurred. Please try again later."
            }));
        }
    }
}