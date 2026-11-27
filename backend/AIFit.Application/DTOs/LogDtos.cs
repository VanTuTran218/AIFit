namespace AIFit.Application.DTOs;   // ★ chép khớp namespace của DTO khác

public class SystemLogDto
{
    public int Id { get; set; }
    public string Level { get; set; } = "";
    public string Type { get; set; } = "";
    public string Message { get; set; } = "";
    public string? UserEmail { get; set; }
    public string? Exercise { get; set; }
    public string? Path { get; set; }
    public DateTime CreatedAt { get; set; }
}

public class LogListDto
{
    public int Page { get; set; }
    public int PageSize { get; set; }
    public int Total { get; set; }
    public List<SystemLogDto> Items { get; set; } = new();
}

public class CreateLogDto
{
    public string Level { get; set; } = "Info";   // Info / Warning / Error
    public string Type { get; set; } = "Info";    // CameraDenied / BodyLost / SyncFailed / ApiError
    public string Message { get; set; } = "";
    public string? Exercise { get; set; }         // vd "squat"
}