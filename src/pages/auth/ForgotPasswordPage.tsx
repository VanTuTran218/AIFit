import React, { useState, useRef, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ShieldCheck,
  ArrowLeft,
  ArrowRight,
  Mail,
  Lock,
  Eye,
  EyeOff,
  KeyRound,
  RefreshCw,
  CheckCircle2,
  Settings,
  Sparkles,
} from 'lucide-react';
import { useToast } from '../../components/ui/Toast';
import { authService } from '../../services/authService';
import { api } from '../../services/api';

export default function ForgotPasswordPage() {
  const navigate = useNavigate();
  const { success, error: toastError } = useToast();

  const [step, setStep] = useState<'email' | 'otp' | 'reset'>('email');
  const [email, setEmail] = useState('');
  const [otpDigits, setOtpDigits] = useState<string[]>(['', '', '', '', '', '']);
  const otpInputsRef = useRef<Array<HTMLInputElement | null>>([]);
  const [countdown, setCountdown] = useState(300);
  const [deliveryMode, setDeliveryMode] = useState<'gmail' | 'dev'>('dev');
  const [devOtpCode, setDevOtpCode] = useState<string | null>(null);

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPw, setShowNewPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Inline Gmail SMTP Setup Panel
  const [showSmtpSetup, setShowSmtpSetup] = useState(false);
  const [smtpEmail, setSmtpEmail] = useState('');
  const [smtpAppPassword, setSmtpAppPassword] = useState('');
  const [isSavingSmtp, setIsSavingSmtp] = useState(false);

  useEffect(() => {
    if (step !== 'otp' || countdown <= 0) return;
    const timer = setInterval(() => {
      setCountdown(c => (c > 0 ? c - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [step, countdown]);

  const formatCountdown = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Step 1: Send Reset Password OTP to Gmail
  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setErrorMsg('Vui lòng nhập địa chỉ email tài khoản của bạn.');
      return;
    }
    if (!/\S+@\S+\.\S+/.test(email)) {
      setErrorMsg('Định dạng email không hợp lệ.');
      return;
    }

    setErrorMsg(null);
    setIsLoading(true);
    try {
      const res = await authService.forgotPassword(email.trim());
      if (res.success && res.data) {
        setDeliveryMode(res.data.deliveryMode);
        setDevOtpCode(res.data.devOtp || null);
        setCountdown(res.data.expiresInSeconds || 300);
        setOtpDigits(['', '', '', '', '', '']);
        setStep('otp');
        success(
          res.data.deliveryMode === 'gmail'
            ? `Đã gửi mã OTP khôi phục mật khẩu tới Gmail ${email.trim()}!`
            : `Đã tạo mã OTP khôi phục mật khẩu cho ${email.trim()}.`
        );
        setTimeout(() => otpInputsRef.current[0]?.focus(), 100);
      } else {
        setErrorMsg(res.message || 'Không tìm thấy tài khoản với email này.');
      }
    } catch {
      setErrorMsg('Không thể kết nối máy chủ. Vui lòng thử lại.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendOtp = async () => {
    setErrorMsg(null);
    setIsLoading(true);
    try {
      const res = await authService.forgotPassword(email.trim());
      if (res.success && res.data) {
        setDeliveryMode(res.data.deliveryMode);
        setDevOtpCode(res.data.devOtp || null);
        setCountdown(res.data.expiresInSeconds || 300);
        setOtpDigits(['', '', '', '', '', '']);
        success('Đã gửi lại mã OTP khôi phục mật khẩu mới.');
        otpInputsRef.current[0]?.focus();
      } else {
        setErrorMsg(res.message || 'Không thể gửi lại mã OTP.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveSmtpAndResend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!smtpEmail.trim() || !smtpAppPassword.trim()) {
      toastError('Vui lòng nhập Gmail và Mật khẩu ứng dụng 16 ký tự.');
      return;
    }
    setIsSavingSmtp(true);
    try {
      await api.auth.saveSmtpConfig({
        email: smtpEmail.trim(),
        appPassword: smtpAppPassword.trim(),
      });
      setShowSmtpSetup(false);
      await handleResendOtp();
    } catch {
      toastError('Không thể lưu cấu hình Gmail SMTP.');
    } finally {
      setIsSavingSmtp(false);
    }
  };

  const handleOtpChange = (index: number, value: string) => {
    const digit = value.replace(/\D/g, '').slice(-1);
    const next = [...otpDigits];
    next[index] = digit;
    setOtpDigits(next);
    setErrorMsg(null);
    if (digit && index < 5) {
      otpInputsRef.current[index + 1]?.focus();
    }
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !otpDigits[index] && index > 0) {
      otpInputsRef.current[index - 1]?.focus();
    }
  };

  const handleOtpPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!pasted) return;
    const next = ['', '', '', '', '', ''];
    for (let i = 0; i < 6; i++) {
      next[i] = pasted[i] || '';
    }
    setOtpDigits(next);
    otpInputsRef.current[Math.min(5, pasted.length - 1)]?.focus();
  };

  const autofillDevOtp = () => {
    if (!devOtpCode) return;
    const chars = devOtpCode.slice(0, 6).split('');
    setOtpDigits([
      chars[0] || '',
      chars[1] || '',
      chars[2] || '',
      chars[3] || '',
      chars[4] || '',
      chars[5] || '',
    ]);
    setErrorMsg(null);
  };

  // Step 2: Verify 6-digit OTP
  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = otpDigits.join('');
    if (code.length < 6) {
      setErrorMsg('Vui lòng nhập đủ 6 chữ số OTP.');
      return;
    }

    setErrorMsg(null);
    setIsLoading(true);
    try {
      const res = await authService.verifyResetOtp(email.trim(), code);
      if (res.success) {
        setStep('reset');
        success('Xác thực OTP hợp lệ! Hãy đặt mật khẩu mới.');
      } else {
        setErrorMsg(res.message || 'Mã xác thực OTP không chính xác.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Step 3: Set New Password
  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPassword || newPassword.length < 8) {
      setErrorMsg('Mật khẩu mới phải có tối thiểu 8 ký tự.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setErrorMsg('Mật khẩu xác nhận không trùng khớp.');
      return;
    }

    setErrorMsg(null);
    setIsLoading(true);
    try {
      const code = otpDigits.join('');
      const res = await authService.resetPassword(
        email.trim(),
        code,
        newPassword,
        confirmPassword
      );
      if (res.success) {
        success('Khôi phục mật khẩu thành công! Vui lòng đăng nhập bằng mật khẩu mới.');
        navigate('/login', { replace: true, state: { prefillEmail: email.trim() } });
      } else {
        setErrorMsg(res.message || 'Không thể đặt lại mật khẩu.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen min-h-[100dvh] w-full flex flex-col lg:flex-row bg-[#F8F5ED] selection:bg-gold/30 selection:text-obsidian">
      {/* ======================================================== */}
      {/* CỘT TRÁI (52%): CINEMATIC FITNESS BRANDING               */}
      {/* ======================================================== */}
      <div className="relative w-full lg:w-[52%] min-h-[400px] lg:min-h-[100dvh] bg-[#101114] text-white flex flex-col justify-between p-8 sm:p-12 lg:p-16 overflow-hidden">
        <div className="absolute inset-0 z-0">
          <motion.img
            initial={{ scale: 1 }}
            animate={{ scale: 1.04 }}
            transition={{ duration: 25, ease: 'linear', repeat: Infinity, repeatType: 'reverse' }}
            src="https://images.unsplash.com/photo-1534438327276-14e5300c3a48?auto=format&fit=crop&w=1920&q=85"
            alt="AIFit Security Recovery"
            className="w-full h-full object-cover object-center"
          />
          <div
            className="absolute inset-0"
            style={{
              background:
                'linear-gradient(90deg, rgba(10,11,13,0.90) 0%, rgba(10,11,13,0.72) 50%, rgba(10,11,13,0.50) 100%)',
            }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#101114] via-transparent to-transparent opacity-80" />
        </div>

        <div className="relative z-10">
          <NavLink to="/welcome" className="inline-flex items-center gap-3 group">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-[#D5B56A] via-[#C9A227] to-[#101114] flex items-center justify-center shadow-md shadow-gold/20 border border-[#D5B56A]/40 group-hover:scale-105 transition-transform">
              <span className="font-display font-black text-white text-lg tracking-wider">AI</span>
            </div>
            <div>
              <span className="font-display font-black text-2xl tracking-tight text-[#F8FAFC] block leading-tight">
                AIFit
              </span>
              <span className="text-[10px] font-bold tracking-widest text-[#D5B56A] uppercase block">
                Trung tâm Bảo mật Tài khoản
              </span>
            </div>
          </NavLink>
        </div>

        <div className="relative z-10 my-auto py-10 max-w-lg space-y-4">
          <span className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/10 backdrop-blur-md border border-[#E7CA80]/30 text-[#E7CA80] text-xs font-medium tracking-wide">
            Khôi phục quyền truy cập an toàn
          </span>
          <h1 className="font-display font-bold text-3xl sm:text-4xl lg:text-[42px] text-[#F8FAFC] tracking-tight leading-[1.2]">
            Bảo vệ hành trình tập luyện của bạn qua{' '}
            <span className="text-[#E7CA80]">xác thực OTP Gmail</span>.
          </h1>
          <p className="text-[15px] text-[#E5E7EB] font-normal leading-[1.6]">
            Hệ thống sẽ gửi mã OTP 6 chữ số có hiệu lực trong 5 phút về địa chỉ email đăng ký để bạn thiết lập lại mật khẩu mới một cách an toàn.
          </p>
        </div>

        <div className="relative z-10 pt-4 border-t border-white/10 flex items-center gap-2.5 text-xs text-[#E5E7EB]">
          <ShieldCheck className="w-4 h-4 text-[#E7CA80] shrink-0" />
          <span>Tự động thu hồi toàn bộ phiên đăng nhập cũ sau khi đổi mật khẩu</span>
        </div>
      </div>

      {/* ======================================================== */}
      {/* CỘT PHẢI (48%): 3 BƯỚC KHÔI PHỤC MẬT KHẨU               */}
      {/* ======================================================== */}
      <div className="w-full lg:w-[48%] min-h-[100dvh] bg-[#F8F5ED] flex items-center justify-center p-6 sm:p-10 lg:p-12">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="w-full max-w-[460px] bg-white rounded-[24px] border border-[#E8E2D6] p-8 sm:p-10 shadow-[0_20px_50px_rgba(16,17,20,0.06)] space-y-6"
        >
          <div className="flex items-center justify-between">
            <NavLink
              to="/login"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-[#64676E] hover:text-[#202124] transition-colors group"
            >
              <ArrowLeft className="w-3.5 h-3.5 text-[#92701B] group-hover:-translate-x-0.5 transition-transform" />
              <span>Quay lại đăng nhập</span>
            </NavLink>

            <span className="text-[11px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-[#FAF6EC] text-[#92701B] border border-[#E8E2D6]">
              {step === 'email' && 'Bước 1/3 • Nhập Email'}
              {step === 'otp' && 'Bước 2/3 • Mã OTP'}
              {step === 'reset' && 'Bước 3/3 • Mật khẩu mới'}
            </span>
          </div>

          {errorMsg && (
            <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-medium">
              {errorMsg}
            </div>
          )}

          {step === 'email' && (
            <form onSubmit={handleSendOtp} className="space-y-5" noValidate>
              <div className="space-y-1.5">
                <h2 className="font-display font-bold text-[28px] text-[#202124] tracking-tight">
                  Quên mật khẩu?
                </h2>
                <p className="text-[14px] text-[#64676E] leading-[1.6]">
                  Nhập địa chỉ email đã đăng ký tài khoản AIFit. Chúng tôi sẽ gửi mã xác thực OTP 6 chữ số để bạn đặt lại mật khẩu.
                </p>
              </div>

              <div className="space-y-2">
                <label className="block text-[14px] font-medium text-[#202124]">
                  Địa chỉ Email tài khoản
                </label>
                <div className="relative flex items-center">
                  <Mail className="w-5 h-5 text-[#64676E] absolute left-4 pointer-events-none" />
                  <input
                    type="email"
                    placeholder="trainee@aifit.vn hoặc email của bạn"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    className="w-full h-[54px] pl-12 pr-4 rounded-xl border border-[#D8D3C8] focus:border-[#C9A227] focus:ring-3 focus:ring-[#C9A227]/15 text-[15px] text-[#202124] placeholder:text-[#8C9099] outline-none transition-all"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full h-[54px] rounded-xl font-semibold text-[16px] bg-[#C9A227] hover:bg-[#B18B20] text-[#161616] shadow-xs active:scale-[0.99] transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
              >
                {isLoading ? (
                  <span>Đang kiểm tra & Gửi mã OTP...</span>
                ) : (
                  <>
                    <span>Gửi mã khôi phục qua Gmail</span>
                    <ArrowRight className="w-4 h-4 text-[#161616]" />
                  </>
                )}
              </button>
            </form>
          )}

          {step === 'otp' && (
            <div className="space-y-5">
              <div className="space-y-1.5">
                <div className="w-11 h-11 rounded-2xl bg-[#FAF6EC] border border-[#E8E2D6] text-[#92701B] flex items-center justify-center mb-2">
                  <KeyRound className="w-5 h-5" />
                </div>
                <h2 className="font-display font-bold text-[26px] text-[#202124] tracking-tight">
                  Nhập mã khôi phục OTP
                </h2>
                <p className="text-[14px] text-[#64676E] leading-[1.6]">
                  Mã OTP 6 chữ số đã được gửi tới <strong className="text-[#202124]">{email}</strong>.
                </p>
              </div>

              {deliveryMode === 'gmail' ? (
                <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <strong className="block font-semibold">Đã gửi email thật qua Gmail SMTP!</strong>
                    <span>Vui lòng mở hộp thư Gmail của bạn để lấy mã 6 số.</span>
                  </div>
                </div>
              ) : (
                <div className="p-3.5 rounded-xl bg-[#FAF6EC] border border-[#E7CA80] text-[#202124] text-xs space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-[#80601D] flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5" />
                      Mã OTP khôi phục (Chế độ thử nghiệm):
                    </span>
                    {devOtpCode && (
                      <button
                        type="button"
                        onClick={autofillDevOtp}
                        className="px-2.5 py-1 rounded-lg bg-[#C9A227] text-[#101114] font-bold text-[11px] hover:bg-[#B18B20] transition-colors cursor-pointer"
                      >
                        Điền nhanh {devOtpCode}
                      </button>
                    )}
                  </div>
                  <div className="flex items-center justify-between pt-1 border-t border-[#E8E2D6] text-[11px] text-[#64676E]">
                    <span>Muốn nhận qua Gmail thật?</span>
                    <button
                      type="button"
                      onClick={() => setShowSmtpSetup(!showSmtpSetup)}
                      className="font-semibold text-[#92701B] hover:underline inline-flex items-center gap-1 cursor-pointer"
                    >
                      <Settings className="w-3 h-3" />
                      <span>{showSmtpSetup ? 'Đóng cấu hình' : 'Cấu hình Gmail SMTP'}</span>
                    </button>
                  </div>
                </div>
              )}

              {showSmtpSetup && (
                <form
                  onSubmit={handleSaveSmtpAndResend}
                  className="p-4 rounded-xl bg-[#F8F5ED] border border-[#D8D3C8] space-y-3 text-xs"
                >
                  <div className="font-semibold text-[#202124]">
                    Cấu hình Gmail SMTP để gửi OTP thật
                  </div>
                  <input
                    type="email"
                    placeholder="Gmail gửi (vd: your_gmail@gmail.com)"
                    value={smtpEmail}
                    onChange={e => setSmtpEmail(e.target.value)}
                    className="w-full h-9 px-3 rounded-lg border border-[#D8D3C8] bg-white text-[#202124] outline-none focus:border-[#C9A227]"
                  />
                  <input
                    type="password"
                    placeholder="App Password 16 ký tự của Google"
                    value={smtpAppPassword}
                    onChange={e => setSmtpAppPassword(e.target.value)}
                    className="w-full h-9 px-3 rounded-lg border border-[#D8D3C8] bg-white text-[#202124] outline-none focus:border-[#C9A227]"
                  />
                  <button
                    type="submit"
                    disabled={isSavingSmtp}
                    className="w-full h-9 rounded-lg bg-[#202124] hover:bg-[#35373C] text-white font-semibold transition-colors cursor-pointer"
                  >
                    {isSavingSmtp ? 'Đang lưu & gửi mail...' : 'Lưu & Gửi lại mã qua Gmail thật'}
                  </button>
                </form>
              )}

              <form onSubmit={handleVerifyOtp} className="space-y-5">
                <div className="grid grid-cols-6 gap-2.5">
                  {otpDigits.map((digit, idx) => (
                    <input
                      key={idx}
                      ref={el => {
                        otpInputsRef.current[idx] = el;
                      }}
                      type="text"
                      inputMode="numeric"
                      maxLength={1}
                      value={digit}
                      onChange={e => handleOtpChange(idx, e.target.value)}
                      onKeyDown={e => handleOtpKeyDown(idx, e)}
                      onPaste={handleOtpPaste}
                      className="w-full h-[54px] text-center font-display font-bold text-xl text-[#202124] bg-white rounded-xl border border-[#D8D3C8] focus:border-[#C9A227] focus:ring-3 focus:ring-[#C9A227]/20 outline-none transition-all"
                    />
                  ))}
                </div>

                <div className="flex items-center justify-between text-xs text-[#64676E]">
                  <span>
                    Hiệu lực còn lại:{' '}
                    <strong className="text-[#202124] font-mono">
                      {formatCountdown(countdown)}
                    </strong>
                  </span>
                  <button
                    type="button"
                    disabled={isLoading}
                    onClick={handleResendOtp}
                    className="inline-flex items-center gap-1 font-semibold text-[#92701B] hover:text-[#7A5D13] cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Gửi lại mã OTP</span>
                  </button>
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full h-[54px] rounded-xl font-semibold text-[16px] bg-[#C9A227] hover:bg-[#B18B20] text-[#161616] shadow-xs active:scale-[0.99] transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
                >
                  {isLoading ? (
                    <span>Đang kiểm tra mã OTP...</span>
                  ) : (
                    <>
                      <span>Xác nhận mã OTP</span>
                      <ArrowRight className="w-4 h-4 text-[#161616]" />
                    </>
                  )}
                </button>
              </form>
            </div>
          )}

          {step === 'reset' && (
            <form onSubmit={handleResetPassword} className="space-y-4" noValidate>
              <div className="space-y-1.5">
                <h2 className="font-display font-bold text-[26px] text-[#202124] tracking-tight">
                  Thiết lập mật khẩu mới
                </h2>
                <p className="text-[14px] text-[#64676E] leading-[1.6]">
                  Tạo mật khẩu mới cho tài khoản <strong className="text-[#202124]">{email}</strong>.
                </p>
              </div>

              <div className="space-y-2">
                <label className="block text-[14px] font-medium text-[#202124]">
                  Mật khẩu mới <span className="text-red-600">*</span>
                </label>
                <div className="relative flex items-center">
                  <Lock className="w-5 h-5 text-[#64676E] absolute left-4 pointer-events-none" />
                  <input
                    type={showNewPw ? 'text' : 'password'}
                    placeholder="Tối thiểu 8 ký tự"
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    className="w-full h-[54px] pl-12 pr-12 rounded-xl border border-[#D8D3C8] focus:border-[#C9A227] focus:ring-3 focus:ring-[#C9A227]/15 text-[15px] text-[#202124] outline-none transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPw(!showNewPw)}
                    className="absolute right-4 text-[#64676E] hover:text-[#202124] cursor-pointer"
                  >
                    {showNewPw ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <label className="block text-[14px] font-medium text-[#202124]">
                  Xác nhận mật khẩu mới <span className="text-red-600">*</span>
                </label>
                <div className="relative flex items-center">
                  <Lock className="w-5 h-5 text-[#64676E] absolute left-4 pointer-events-none" />
                  <input
                    type={showConfirmPw ? 'text' : 'password'}
                    placeholder="Nhập lại mật khẩu mới"
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    className="w-full h-[54px] pl-12 pr-12 rounded-xl border border-[#D8D3C8] focus:border-[#C9A227] focus:ring-3 focus:ring-[#C9A227]/15 text-[15px] text-[#202124] outline-none transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPw(!showConfirmPw)}
                    className="absolute right-4 text-[#64676E] hover:text-[#202124] cursor-pointer"
                  >
                    {showConfirmPw ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full h-[54px] rounded-xl font-semibold text-[16px] bg-[#C9A227] hover:bg-[#B18B20] text-[#161616] shadow-xs active:scale-[0.99] transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
                >
                  {isLoading ? (
                    <span>Đang cập nhật mật khẩu...</span>
                  ) : (
                    <>
                      <span>Lưu mật khẩu mới & Đăng nhập</span>
                      <ArrowRight className="w-4 h-4 text-[#161616]" />
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </motion.div>
      </div>
    </div>
  );
}
