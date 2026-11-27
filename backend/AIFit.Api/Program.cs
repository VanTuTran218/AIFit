using System.Text;
using AIFit.Api.Middleware;
using AIFit.Api.Services;
using AIFit.Application.Services;
using AIFit.Infrastructure.Data;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using AIFit.Infrastructure.Services;

var builder = WebApplication.CreateBuilder(args);

// ---------- Database ----------
builder.Services.AddDbContext<AifitDbContext>(options =>
    options.UseSqlServer(builder.Configuration.GetConnectionString("DefaultConnection")));

// Application services depend on the DbContext abstraction.
builder.Services.AddScoped<DbContext>(sp => sp.GetRequiredService<AifitDbContext>());

// ---------- Application services ----------
builder.Services.AddScoped<ITokenService, TokenService>();
builder.Services.AddScoped<IAuthService, AuthService>();
builder.Services.AddScoped<IExerciseService, ExerciseService>();
builder.Services.AddScoped<ISessionService, SessionService>();
builder.Services.AddScoped<IStatsService, StatsService>();
builder.Services.AddScoped<IAdminService, AdminService>();
builder.Services.AddScoped<ICurrentUserService, CurrentUserService>();
builder.Services.AddHttpContextAccessor();
builder.Services.AddScoped<ILogService, LogService>();
builder.Services.AddScoped<IEmailService, EmailService>();

// ---------- Controllers ----------
builder.Services.AddControllers();

// ---------- Auth: JWT Bearer ----------
var jwtKey = builder.Configuration["Jwt:Key"]
    ?? throw new InvalidOperationException("Jwt:Key is missing in appsettings.json");

builder.Services.AddAuthentication(options =>
    {
        options.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
        options.DefaultChallengeScheme = JwtBearerDefaults.AuthenticationScheme;
    })
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidIssuer = builder.Configuration["Jwt:Issuer"] ?? "AIFit.Api",
            ValidateAudience = true,
            ValidAudience = builder.Configuration["Jwt:Audience"] ?? "AIFit.Frontend",
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey)),
            ValidateLifetime = true,
            ClockSkew = TimeSpan.FromSeconds(30)
        };
    });

builder.Services.AddAuthorization(options =>
{
    options.AddPolicy("Admin", policy => policy.RequireRole("Admin"));
});

// ---------- CORS (Vite dev server) ----------
builder.Services.AddCors(options =>
{
    options.AddPolicy("frontend", policy => policy
        .WithOrigins(
            "http://localhost:5173",
            "http://127.0.0.1:5173",
            "http://localhost:5174",
            "http://127.0.0.1:5174",
            "http://localhost:4173")
        .AllowAnyHeader()
        .AllowAnyMethod());
});

// ---------- Swagger with JWT support ----------
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(options =>
{
    options.SwaggerDoc("v1", new Microsoft.OpenApi.Models.OpenApiInfo
    {
        Title = "AIFit API",
        Version = "v1",
        Description = "Backend for AIFit - AI virtual trainer (C1SE.87 capstone). " +
                      "Login via /api/auth/login, click Authorize, paste the accessToken."
    });

    options.AddSecurityDefinition("Bearer", new Microsoft.OpenApi.Models.OpenApiSecurityScheme
    {
        Name = "Authorization",
        Type = Microsoft.OpenApi.Models.SecuritySchemeType.Http,
        Scheme = "bearer",
        BearerFormat = "JWT",
        In = Microsoft.OpenApi.Models.ParameterLocation.Header,
        Description = "Paste only the accessToken (without the 'Bearer ' prefix)."
    });

    options.AddSecurityRequirement(new Microsoft.OpenApi.Models.OpenApiSecurityRequirement
    {
        {
            new Microsoft.OpenApi.Models.OpenApiSecurityScheme
            {
                Reference = new Microsoft.OpenApi.Models.OpenApiReference
                {
                    Type = Microsoft.OpenApi.Models.ReferenceType.SecurityScheme,
                    Id = "Bearer"
                }
            },
            Array.Empty<string>()
        }
    });
});

var app = builder.Build();

// ---------- Global exception handler ----------
app.UseMiddleware<ExceptionMiddleware>();

// ---------- Auto migrate + seed on startup ----------
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AifitDbContext>();
    var logger = scope.ServiceProvider.GetRequiredService<ILogger<AifitDbContext>>();

    await db.Database.MigrateAsync();
    await DbSeeder.SeedAsync(db, logger);
}

app.UseSwagger();
app.UseSwaggerUI(options =>
{
    options.SwaggerEndpoint("/swagger/v1/swagger.json", "AIFit API v1");
    options.DocumentTitle = "AIFit API";
});

app.UseCors("frontend");

app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();

app.Run();
