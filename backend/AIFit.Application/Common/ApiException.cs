namespace AIFit.Application.Common;

/// <summary>Carries an HTTP status code into the exception middleware.</summary>
public class ApiException : Exception
{
    public int StatusCode { get; }

    public ApiException(int statusCode, string message) : base(message)
    {
        StatusCode = statusCode;
    }

    public static ApiException BadRequest(string message) => new(400, message);
    public static ApiException Unauthorized(string message = "Invalid email or password.") => new(401, message);
    public static ApiException Forbidden(string message = "You do not have permission to perform this action.") => new(403, message);
    public static ApiException NotFound(string message = "Resource not found.") => new(404, message);
    public static ApiException Conflict(string message) => new(409, message);
}
