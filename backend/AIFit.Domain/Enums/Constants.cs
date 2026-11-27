namespace AIFit.Domain.Enums;

/// <summary>String constants for user roles (stored as string in DB for readability).</summary>
public static class UserRole
{
    public const string Trainee = "Trainee";
    public const string Admin = "Admin";
}

/// <summary>Workout session status.</summary>
public static class SessionStatus
{
    public const string Completed = "Completed";
    public const string Abandoned = "Abandoned";
}

/// <summary>Feedback rule severity levels.</summary>
public static class Severity
{
    public const string Info = "Info";
    public const string Warning = "Warning";
    public const string Error = "Error";
}

/// <summary>Exercise difficulty levels.</summary>
public static class Difficulty
{
    public const string Beginner = "Beginner";
    public const string Intermediate = "Intermediate";
    public const string Advanced = "Advanced";
}
