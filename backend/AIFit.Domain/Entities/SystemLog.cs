namespace AIFit.Domain.Entities;   // ★ chép khớp dòng namespace của file entity khác (vd User.cs)

public class SystemLog
{
    public int Id { get; set; }

    // "Error" / "Warning" / "Info"
    public string Level { get; set; } = "Info";

    // AuthLogin, AuthFailedLogin, AuthBlocked, Exception,
    // CameraDenied, BodyLost, SyncFailed (bắn từ FE khi tập)
    public string Type { get; set; } = "Info";

    public string Message { get; set; } = string.Empty;

    public string? UserEmail { get; set; }

    public string? Exercise { get; set; }   // mã bài tập khi log đến từ lúc tập

    public string? Path { get; set; }       // API path gây lỗi (cho log Exception)

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}