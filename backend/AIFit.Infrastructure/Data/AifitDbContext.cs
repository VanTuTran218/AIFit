using AIFit.Application.Services;
using AIFit.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace AIFit.Infrastructure.Data;

public class AifitDbContext : DbContext
{
    public DbSet<AIFit.Domain.Entities.SystemLog> SystemLogs => Set<SystemLog>();
    public AifitDbContext(DbContextOptions<AifitDbContext> options) : base(options)
    {
    }

    public DbSet<User> Users => Set<User>();
    public DbSet<Exercise> Exercises => Set<Exercise>();
    public DbSet<FeedbackRule> FeedbackRules => Set<FeedbackRule>();
    public DbSet<WorkoutSession> WorkoutSessions => Set<WorkoutSession>();
    public DbSet<RepDetail> RepDetails => Set<RepDetail>();
    public DbSet<RefreshToken> RefreshTokens => Set<RefreshToken>();
    public DbSet<EmailOtp> EmailOtps => Set<EmailOtp>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        // ---- User ----
        modelBuilder.Entity<User>(entity =>
        {
            entity.HasIndex(u => u.Email).IsUnique();
            entity.Property(u => u.Email).HasMaxLength(256).IsRequired();
            entity.Property(u => u.PasswordHash).HasMaxLength(500).IsRequired();
            entity.Property(u => u.FullName).HasMaxLength(200).IsRequired();
            entity.Property(u => u.Role).HasMaxLength(20).IsRequired();
            entity.Property(u => u.Gender).HasMaxLength(10);
            entity.Property(u => u.HeightCm).HasPrecision(5, 1);
            entity.Property(u => u.WeightKg).HasPrecision(5, 1);
        });

        // ---- Exercise ----
        modelBuilder.Entity<Exercise>(entity =>
        {
            entity.HasIndex(e => e.Code).IsUnique();
            entity.Property(e => e.Code).HasMaxLength(20).IsRequired();
            entity.Property(e => e.Name).HasMaxLength(100).IsRequired();
            entity.Property(e => e.Description).HasMaxLength(1000).IsRequired();
            entity.Property(e => e.VideoUrl).HasMaxLength(300);
            entity.Property(e => e.ImageUrl).HasMaxLength(300);
            entity.Property(e => e.Difficulty).HasMaxLength(20).IsRequired();
            entity.Property(e => e.TargetMuscles).HasMaxLength(200);
            entity.Property(e => e.CaloriesPerRep).HasPrecision(6, 3);
            entity.Property(e => e.CaloriesPerMinute).HasPrecision(6, 3);
        });

        // ---- FeedbackRule ----
        modelBuilder.Entity<FeedbackRule>(entity =>
        {
            entity.HasIndex(r => r.Code).IsUnique();
            entity.Property(r => r.Code).HasMaxLength(30).IsRequired();
            entity.Property(r => r.Name).HasMaxLength(100).IsRequired();
            entity.Property(r => r.Description).HasMaxLength(500).IsRequired();
            entity.Property(r => r.Severity).HasMaxLength(20).IsRequired();
            entity.Property(r => r.ThresholdsJson).IsRequired();

            entity.HasOne(r => r.Exercise)
                .WithMany(e => e.FeedbackRules)
                .HasForeignKey(r => r.ExerciseId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        // ---- WorkoutSession ----
        modelBuilder.Entity<WorkoutSession>(entity =>
        {
            entity.HasIndex(s => new { s.UserId, s.StartedAt });
            entity.Property(s => s.FormScore).HasPrecision(5, 2);
            entity.Property(s => s.CaloriesBurned).HasPrecision(8, 2);
            entity.Property(s => s.Status).HasMaxLength(20).IsRequired();
            entity.Property(s => s.Note).HasMaxLength(500);

            entity.HasOne(s => s.User)
                .WithMany(u => u.Sessions)
                .HasForeignKey(s => s.UserId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(s => s.Exercise)
                .WithMany(e => e.Sessions)
                .HasForeignKey(s => s.ExerciseId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        // ---- RepDetail ----
        modelBuilder.Entity<RepDetail>(entity =>
        {
            entity.HasIndex(r => r.SessionId);
            entity.Property(r => r.AnglesJson).HasMaxLength(4000);

            entity.HasOne(r => r.Session)
                .WithMany(s => s.Reps)
                .HasForeignKey(r => r.SessionId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(r => r.Rule)
                .WithMany()
                .HasForeignKey(r => r.RuleId)
                .OnDelete(DeleteBehavior.SetNull);
        });

        // ---- RefreshToken ----
        modelBuilder.Entity<RefreshToken>(entity =>
        {
            entity.Property(t => t.Token).HasMaxLength(200).IsRequired();
            entity.HasIndex(t => t.Token).IsUnique();

            entity.HasOne(t => t.User)
                .WithMany(u => u.RefreshTokens)
                .HasForeignKey(t => t.UserId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        // ---- EmailOtp ----
        modelBuilder.Entity<EmailOtp>(entity =>
        {
            entity.HasIndex(o => new { o.Email, o.Purpose, o.CreatedAt });
            entity.Property(o => o.Email).HasMaxLength(256).IsRequired();
            entity.Property(o => o.OtpCode).HasMaxLength(10).IsRequired();
            entity.Property(o => o.Purpose).HasMaxLength(30).IsRequired();
        });
    }
}
