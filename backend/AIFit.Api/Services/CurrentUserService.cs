using System.Security.Claims;
using AIFit.Application.Services;

namespace AIFit.Api.Services;

/// <summary>Reads the authenticated user's identity from JWT claims.</summary>
public class CurrentUserService : ICurrentUserService
{
    private readonly IHttpContextAccessor _accessor;

    public CurrentUserService(IHttpContextAccessor accessor)
    {
        _accessor = accessor;
    }

    private ClaimsPrincipal? Principal => _accessor.HttpContext?.User;

    public int UserId =>
        int.TryParse(Principal?.FindFirstValue(ClaimTypes.NameIdentifier), out var id) ? id : 0;

    public string Email => Principal?.FindFirstValue(ClaimTypes.Email) ?? string.Empty;

    public string Role => Principal?.FindFirstValue(ClaimTypes.Role) ?? string.Empty;

    public bool IsAdmin => Role == "Admin";
}
