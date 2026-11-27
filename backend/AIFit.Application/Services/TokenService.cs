using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using AIFit.Domain.Entities;
using Microsoft.Extensions.Configuration;
using Microsoft.IdentityModel.Tokens;

namespace AIFit.Application.Services;

public interface ITokenService
{
    (string token, DateTime expiresAt) CreateAccessToken(User user);
    string CreateRefreshToken();
    ClaimsPrincipal? GetPrincipalFromExpiredToken(string accessToken);
}

public class TokenService : ITokenService
{
    private readonly IConfiguration _config;

    public TokenService(IConfiguration config)
    {
        _config = config;
    }

    public (string token, DateTime expiresAt) CreateAccessToken(User user)
    {
        var key = _config["Jwt:Key"] ?? throw new InvalidOperationException("Jwt:Key is not configured");
        var issuer = _config["Jwt:Issuer"] ?? "AIFit.Api";
        var audience = _config["Jwt:Audience"] ?? "AIFit.Frontend";
        var minutes = double.TryParse(_config["Jwt:AccessTokenMinutes"], out var m) ? m : 120;

        var claims = new List<Claim>
        {
            new(JwtRegisteredClaimNames.Sub, user.Id.ToString()),
            new(JwtRegisteredClaimNames.Email, user.Email),
            new(ClaimTypes.NameIdentifier, user.Id.ToString()),
            new(ClaimTypes.Email, user.Email),
            new(ClaimTypes.Name, user.FullName),
            new(ClaimTypes.Role, user.Role),
            new(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString())
        };

        var creds = new SigningCredentials(
            new SymmetricSecurityKey(Encoding.UTF8.GetBytes(key)),
            SecurityAlgorithms.HmacSha256);

        var expires = DateTime.UtcNow.AddMinutes(minutes);

        var token = new JwtSecurityToken(
            issuer: issuer,
            audience: audience,
            claims: claims,
            notBefore: DateTime.UtcNow,
            expires: expires,
            signingCredentials: creds);

        return (new JwtSecurityTokenHandler().WriteToken(token), expires);
    }

    public string CreateRefreshToken()
    {
        var randomBytes = RandomNumberGenerator.GetBytes(64);
        return Convert.ToBase64String(randomBytes);
    }

    /// <summary>
    /// Validates an expired access token ignoring its lifetime so a refresh
    /// token can be exchanged for a new access token.
    /// </summary>
    public ClaimsPrincipal? GetPrincipalFromExpiredToken(string accessToken)
    {
        var key = _config["Jwt:Key"] ?? throw new InvalidOperationException("Jwt:Key is not configured");
        var issuer = _config["Jwt:Issuer"] ?? "AIFit.Api";
        var audience = _config["Jwt:Audience"] ?? "AIFit.Frontend";

        var validation = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidIssuer = issuer,
            ValidateAudience = true,
            ValidAudience = audience,
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(key)),
            ValidateLifetime = false // we only care about signature here
        };

        var handler = new JwtSecurityTokenHandler();
        var principal = handler.ValidateToken(accessToken, validation, out var securityToken);

        if (securityToken is not JwtSecurityToken jwt ||
            !jwt.Header.Alg.Equals(SecurityAlgorithms.HmacSha256, StringComparison.InvariantCultureIgnoreCase))
        {
            return null;
        }

        return principal;
    }
}

public interface ICurrentUserService
{
    int UserId { get; }
    string Email { get; }
    string Role { get; }
    bool IsAdmin { get; }
}
