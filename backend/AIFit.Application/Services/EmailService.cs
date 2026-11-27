using System.Net;
using System.Net.Mail;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace AIFit.Application.Services;

public interface IEmailService
{
    Task<bool> SendOtpEmailAsync(string toEmail, string fullName, string otpCode, string purpose);
}

public class EmailService : IEmailService
{
    private readonly IConfiguration _config;
    private readonly ILogger<EmailService> _logger;

    public EmailService(IConfiguration config, ILogger<EmailService> logger)
    {
        _config = config;
        _logger = logger;
    }

    public async Task<bool> SendOtpEmailAsync(string toEmail, string fullName, string otpCode, string purpose)
    {
        var smtpEmail = _config["Smtp:Email"] ?? Environment.GetEnvironmentVariable("SMTP_EMAIL");
        var smtpPassword = _config["Smtp:AppPassword"] ?? Environment.GetEnvironmentVariable("SMTP_APP_PASSWORD");
        var smtpHost = _config["Smtp:Host"] ?? "smtp.gmail.com";
        var smtpPort = int.TryParse(_config["Smtp:Port"], out var p) ? p : 587;

        var title = purpose == "ResetPassword"
            ? "Khôi phục mật khẩu tài khoản AIFit"
            : "Xác thực đăng ký tài khoản AIFit";

        if (string.IsNullOrWhiteSpace(smtpEmail) || string.IsNullOrWhiteSpace(smtpPassword))
        {
            _logger.LogInformation("[DEV OTP] {Purpose} OTP for {Email}: {Otp}", purpose, toEmail, otpCode);
            return false;
        }

        try
        {
            using var client = new SmtpClient(smtpHost, smtpPort)
            {
                EnableSsl = true,
                Credentials = new NetworkCredential(smtpEmail.Trim(), smtpPassword.Replace(" ", ""))
            };

            var body = $@"
<div style=""font-family:Inter,Arial,sans-serif;max-width:520px;margin:0 auto;background:#101114;color:#F8FAFC;border-radius:16px;padding:32px;border:1px solid rgba(213,181,106,0.3)"">
  <div style=""margin-bottom:20px"">
    <span style=""display:inline-block;background:#C9A227;color:#101114;font-weight:800;padding:6px 12px;border-radius:8px;font-size:14px"">AIFit Studio</span>
  </div>
  <h2 style=""margin:0 0 12px;color:#F8FAFC;font-size:22px"">{title}</h2>
  <p style=""color:#CBD5E1;font-size:14px;line-height:1.6"">Xin chào <strong>{WebUtility.HtmlEncode(fullName)}</strong>,</p>
  <p style=""color:#CBD5E1;font-size:14px;line-height:1.6"">Mã xác thực OTP 6 chữ số của bạn là:</p>
  <div style=""margin:24px 0;padding:18px;background:#18191B;border:1px solid #C9A227;border-radius:12px;text-align:center;letter-spacing:8px;font-size:32px;font-weight:800;color:#E7CA80"">
    {otpCode}
  </div>
  <p style=""color:#94A3B8;font-size:12px;line-height:1.5"">Mã có hiệu lực trong vòng <strong>5 phút</strong>. Tuyệt đối không chia sẻ mã này cho bất kỳ ai.</p>
</div>";

            using var message = new MailMessage
            {
                From = new MailAddress(smtpEmail.Trim(), "AIFit — Trợ lý Tập luyện AI"),
                Subject = $"[AIFit] {otpCode} là mã xác thực của bạn ({title})",
                Body = body,
                IsBodyHtml = true
            };
            message.To.Add(toEmail);

            await client.SendMailAsync(message);
            return true;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to send Gmail SMTP to {Email}. Falling back to dev OTP.", toEmail);
            return false;
        }
    }
}
