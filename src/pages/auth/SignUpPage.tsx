import React, { useState, useRef, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ShieldCheck,
  ArrowLeft,
  ArrowRight,
  User,
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
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../components/ui/Toast';
import { authService } from '../../services/authService';
import { api } from '../../services/api';

export default function SignUpPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const { success, error: toastError } = useToast();

  // Step 1: Registration Form
  const [step, setStep] = useState<'form' | 'otp'>('form');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [errors, setErrors] = useState<{
    fullName?: string;
    email?: string;
    password?: string;
    confirmPassword?: string;
    otp?: string;
    form?: string;
  }>({});
  const [isLoading, setIsLoading] = useState(false);

  // Step 2: 6-Digit OTP Verification
  const [otpDigits, setOtpDigits] = useState<string[]>(['', '', '', '', '', '']);
  const otpInputsRef = useRef<Array<HTMLInputElement | null>>([]);
  const [countdown, setCountdown] = useState(300);
  const [deliveryMode, setDeliveryMode] = useState<'gmail' | 'dev'>('dev');
  const [devOtpCode, setDevOtpCode] = useState<string | null>(null);

  // Inline Gmail SMTP Setup Panel (optional convenience for real Gmail sending)
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

  // Step 1 Submit -> Request 6-digit OTP to Gmail
  const handleRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    const newErrors: typeof errors = {};

    if (!fullName.trim()) {
      newErrors.fullName = 'Vui lòng nhập họ và tên.';
    }

    if (!email.trim()) {
      newErrors.email = 'Vui lòng nhập địa chỉ email.';
    } else if (!/\S+@\S+\.\S+/.test(email)) {
      newErrors.email = 'Định dạng email không hợp lệ.';
    }

    if (!password) {
      newErrors.password = 'Vui lòng nhập mật khẩu.';
    } else if (password.length < 8) {
      newErrors.password = 'Mật khẩu phải có tối thiểu 8 ký tự.';
    } else if (password.length > 50) {
      newErrors.password = 'Mật khẩu tối đa 50 ký tự.';
    }

    if (!confirmPassword) {
      newErrors.confirmPassword = 'Vui lòng nhập lại mật khẩu.';
    } else if (password !== confirmPassword) {
      newErrors.confirmPassword = 'Mật khẩu xác nhận không trùng khớp.';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setErrors({});
    setIsLoading(true);

    try {
      const res = await authService.sendRegisterOtp(email.trim(), fullName.trim());
      if (res.success && res.data) {
        setDeliveryMode(res.data.deliveryMode);
        setDevOtpCode(res.data.devOtp || null);
        setCountdown(res.data.expiresInSeconds || 300);
        setOtpDigits(['', '', '', '', '', '']);
        setStep('otp');
        if (res.data.deliveryMode === 'gmail') {
          success(`Đã gửi mã OTP 6 số tới hộp thư Gmail ${email.trim()}!`);
        } else {
          success(`Đã tạo mã xác thực OTP cho ${email.trim()}.`);
        }
        setTimeout(() => otpInputsRef.current[0]?.focus(), 100);
      } else if (res.error === 'email_exists') {
        setErrors({ email: res.message || 'Địa chỉ email này đã được sử dụng.' });
      } else {
        setErrors({ form: res.message || 'Không thể gửi mã xác thực OTP. Vui lòng thử lại.' });
      }
    } catch {
      setErrors({ form: 'Lỗi kết nối máy chủ. Vui lòng thử lại sau.' });
    } finally {
      setIsLoading(false);
    }
  };

  // Resend OTP
  const handleResendOtp = async () => {
    setErrors({});
    setIsLoading(true);
    try {
      const res = await authService.sendRegisterOtp(email.trim(), fullName.trim());
      if (res.success && res.data) {
        setDeliveryMode(res.data.deliveryMode);
        setDevOtpCode(res.data.devOtp || null);
        setCountdown(res.data.expiresInSeconds || 300);
        setOtpDigits(['', '', '', '', '', '']);
        success(
          res.data.deliveryMode === 'gmail'
            ? `Đã gửi lại mã OTP mới tới Gmail ${email.trim()}!`
            : 'Đã tạo mã OTP mới thành công.'
        );
        otpInputsRef.current[0]?.focus();
      } else {
        setErrors({ otp: res.message || 'Không thể gửi lại mã OTP.' });
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Save real Gmail SMTP credentials and immediately resend OTP via real Gmail
  const handleSaveSmtpAndResend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!smtpEmail.trim() || !smtpAppPassword.trim()) {
      toastError('Vui lòng nhập đầy đủ Gmail gửi và Mật khẩu ứng dụng 16 ký tự.');
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

  // Handle 6-digit OTP input
  const handleOtpChange = (index: number, value: string) => {
    const digit = value.replace(/\D/g, '').slice(-1);
    const next = [...otpDigits];
    next[index] = digit;
    setOtpDigits(next);
    if (errors.otp) setErrors(prev => ({ ...prev, otp: undefined }));

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
    const focusIdx = Math.min(5, pasted.length - 1);
    otpInputsRef.current[focusIdx]?.focus();
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
    setErrors({});
  };

  // Step 2 Submit -> Verify OTP & Create Account in DB
  const handleVerifyAndRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    const otpCode = otpDigits.join('');
    if (otpCode.length < 6) {
      setErrors({ otp: 'Vui lòng nhập đủ 6 chữ số của mã xác thực OTP.' });
      return;
    }

    setErrors({});
    setIsLoading(true);

    try {
      const res = await register(fullName.trim(), email.trim(), password, otpCode);
      if (res.success) {
        success('Xác thực OTP & đăng ký tài khoản thành công! Vui lòng đăng nhập.');
        navigate('/login', { replace: true, state: { prefillEmail: email.trim() } });
      } else if (res.error === 'invalid_otp') {
        setErrors({ otp: res.message || 'Mã xác thực OTP không chính xác hoặc đã hết hạn.' });
      } else if (res.error === 'email_exists') {
        setErrors({ otp: 'Địa chỉ email này đã được đăng ký.' });
      } else {
        setErrors({ otp: res.message || 'Không thể hoàn tất đăng ký. Vui lòng thử lại.' });
      }
    } catch {
      setErrors({ otp: 'Lỗi kết nối máy chủ. Vui lòng thử lại sau.' });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen min-h-[100dvh] w-full flex flex-col lg:flex-row bg-[#F8F5ED] selection:bg-gold/30 selection:text-obsidian">
      {/* ======================================================== */}
      {/* CỘT TRÁI (52%): CINEMATIC FITNESS BRANDING               */}
      {/* ======================================================== */}
      <div className="relative w-full lg:w-[52%] min-h-[440px] lg:min-h-[100dvh] bg-[#101114] text-white flex flex-col justify-between p-8 sm:p-12 lg:p-16 overflow-hidden">
        <div className="absolute inset-0 z-0">
          <motion.img
            initial={{ scale: 1 }}
            animate={{ scale: 1.04 }}
            transition={{ duration: 25, ease: 'linear', repeat: Infinity, repeatType: 'reverse' }}
            src="https://images.unsplash.com/photo-1517838277536-f5f99be501cd?auto=format&fit=crop&w=1920&q=85"
            alt="AIFit Studio Training"
            className="w-full h-full object-cover object-center"
          />
          <div
            className="absolute inset-0"
            style={{
              background:
                'linear-gradient(90deg, rgba(10,11,13,0.88) 0%, rgba(10,11,13,0.70) 50%, rgba(10,11,13,0.48) 100%)',
            }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#101114] via-transparent to-transparent opacity-80" />
        </div>

        {/* SECTION TOP: BRANDING LOGO */}
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
                Trợ lý tập luyện thông minh
              </span>
            </div>
          </NavLink>
        </div>

        {/* SECTION CENTER: CLEAN EDITORIAL HEADLINE & DESCRIPTION */}
        <div className="relative z-10 my-auto py-10 max-w-lg space-y-4">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45 }}
            className="space-y-4"
          >
            <span className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/10 backdrop-blur-md border border-[#E7CA80]/30 text-[#E7CA80] text-xs font-medium tracking-wide">
              Khởi đầu hành trình mới
            </span>

            <h1 className="font-display font-bold text-3xl sm:text-4xl lg:text-[42px] text-[#F8FAFC] tracking-tight leading-[1.2]">
              Xây dựng nền tảng{' '}
              <span className="text-[#E7CA80]">tư thế chuẩn mực</span> ngay từ buổi đầu.
            </h1>

            <p className="text-[15px] text-[#E5E7EB] font-normal leading-[1.6]">
              Tài khoản cá nhân giúp bạn lưu trữ lịch sử tập luyện, xác thực bảo mật hai lớp qua mã OTP Gmail và theo dõi biểu đồ tiến bộ sinh cơ học theo thời gian thực.
            </p>
          </motion.div>
        </div>

        {/* SECTION BOTTOM: PRIVACY NOTE */}
        <div className="relative z-10 pt-4 border-t border-white/10 flex items-center gap-2.5 text-xs text-[#E5E7EB]">
          <ShieldCheck className="w-4 h-4 text-[#E7CA80] shrink-0" />
          <span>Xác thực bảo mật OTP qua Gmail • Xử lý camera 100% tại thiết bị</span>
        </div>
      </div>

      {/* ======================================================== */}
      {/* CỘT PHẢI (48%): FORM ĐĂNG KÝ & XÁC THỰC OTP GMAIL        */}
      {/* ======================================================== */}
      <div className="w-full lg:w-[48%] min-h-[100dvh] bg-[#F8F5ED] flex items-center justify-center p-6 sm:p-10 lg:p-12">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="w-full max-w-[460px] bg-white rounded-[24px] border border-[#E8E2D6] p-8 sm:p-10 shadow-[0_20px_50px_rgba(16,17,20,0.06)] space-y-6"
        >
          {/* Back Link & Step Indicator */}
          <div className="flex items-center justify-between">
            {step === 'form' ? (
              <NavLink
                to="/welcome"
                className="inline-flex items-center gap-1.5 text-xs font-medium text-[#64676E] hover:text-[#202124] transition-colors group"
              >
                <ArrowLeft className="w-3.5 h-3.5 text-[#92701B] group-hover:-translate-x-0.5 transition-transform" />
                <span>Trang giới thiệu</span>
              </NavLink>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setStep('form');
                  setErrors({});
                }}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-[#64676E] hover:text-[#202124] transition-colors group cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5 text-[#92701B] group-hover:-translate-x-0.5 transition-transform" />
                <span>Quay lại sửa thông tin</span>
              </button>
            )}

            <span className="text-[11px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-[#FAF6EC] text-[#92701B] border border-[#E8E2D6]">
              {step === 'form' ? 'Bước 1/2 • Thông tin' : 'Bước 2/2 • Xác thực OTP'}
            </span>
          </div>

          {step === 'form' ? (
            <>
              {/* Title & Description */}
              <div className="space-y-1.5">
                <h2 className="font-display font-bold text-[30px] text-[#202124] tracking-tight leading-tight">
                  Tạo tài khoản mới
                </h2>
                <p className="text-[15px] text-[#64676E] font-normal leading-[1.6]">
                  Điền thông tin cá nhân để nhận mã xác thực OTP 6 chữ số gửi về Gmail của bạn.
                </p>
              </div>

              {errors.form && (
                <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-medium">
                  {errors.form}
                </div>
              )}

              <form onSubmit={handleRequestOtp} className="space-y-4" noValidate>
                {/* Field 1: Họ và tên */}
                <div className="space-y-2">
                  <label className="block text-[14px] font-medium text-[#202124]">
                    Họ và tên <span className="text-red-600">*</span>
                  </label>
                  <div className="relative flex items-center">
                    <User className="w-5 h-5 text-[#64676E] absolute left-4 pointer-events-none" />
                    <input
                      type="text"
                      placeholder="Nguyễn Văn A"
                      value={fullName}
                      onChange={e => setFullName(e.target.value)}
                      className={`w-full h-[54px] min-h-[54px] pl-12 pr-4 rounded-xl border text-[15px] text-[#202124] placeholder:text-[#8C9099] bg-white outline-none transition-all ${
                        errors.fullName
                          ? 'border-red-500 focus:ring-2 focus:ring-red-500/15'
                          : 'border-[#D8D3C8] focus:border-[#C9A227] focus:ring-3 focus:ring-[#C9A227]/15'
                      }`}
                    />
                  </div>
                  {errors.fullName && (
                    <p className="text-xs text-red-600 font-medium">{errors.fullName}</p>
                  )}
                </div>

                {/* Field 2: Email (Gmail) */}
                <div className="space-y-2">
                  <label className="block text-[14px] font-medium text-[#202124]">
                    Địa chỉ Email (Gmail nhận OTP) <span className="text-red-600">*</span>
                  </label>
                  <div className="relative flex items-center">
                    <Mail className="w-5 h-5 text-[#64676E] absolute left-4 pointer-events-none" />
                    <input
                      type="email"
                      placeholder="tenban@gmail.com"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      className={`w-full h-[54px] min-h-[54px] pl-12 pr-4 rounded-xl border text-[15px] text-[#202124] placeholder:text-[#8C9099] bg-white outline-none transition-all ${
                        errors.email
                          ? 'border-red-500 focus:ring-2 focus:ring-red-500/15'
                          : 'border-[#D8D3C8] focus:border-[#C9A227] focus:ring-3 focus:ring-[#C9A227]/15'
                      }`}
                    />
                  </div>
                  {errors.email && (
                    <p className="text-xs text-red-600 font-medium">{errors.email}</p>
                  )}
                </div>

                {/* Field 3: Mật khẩu */}
                <div className="space-y-2">
                  <label className="block text-[14px] font-medium text-[#202124]">
                    Mật khẩu <span className="text-red-600">*</span>
                  </label>
                  <div className="relative flex items-center">
                    <Lock className="w-5 h-5 text-[#64676E] absolute left-4 pointer-events-none" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Tối thiểu 8 ký tự"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      className={`w-full h-[54px] min-h-[54px] pl-12 pr-12 rounded-xl border text-[15px] text-[#202124] placeholder:text-[#8C9099] bg-white outline-none transition-all ${
                        errors.password
                          ? 'border-red-500 focus:ring-2 focus:ring-red-500/15'
                          : 'border-[#D8D3C8] focus:border-[#C9A227] focus:ring-3 focus:ring-[#C9A227]/15'
                      }`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-4 text-[#64676E] hover:text-[#202124] transition-colors cursor-pointer"
                      aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                    >
                      {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                  {errors.password && (
                    <p className="text-xs text-red-600 font-medium">{errors.password}</p>
                  )}
                </div>

                {/* Field 4: Xác nhận mật khẩu */}
                <div className="space-y-2">
                  <label className="block text-[14px] font-medium text-[#202124]">
                    Xác nhận mật khẩu <span className="text-red-600">*</span>
                  </label>
                  <div className="relative flex items-center">
                    <Lock className="w-5 h-5 text-[#64676E] absolute left-4 pointer-events-none" />
                    <input
                      type={showConfirmPassword ? 'text' : 'password'}
                      placeholder="Nhập lại mật khẩu"
                      value={confirmPassword}
                      onChange={e => setConfirmPassword(e.target.value)}
                      className={`w-full h-[54px] min-h-[54px] pl-12 pr-12 rounded-xl border text-[15px] text-[#202124] placeholder:text-[#8C9099] bg-white outline-none transition-all ${
                        errors.confirmPassword
                          ? 'border-red-500 focus:ring-2 focus:ring-red-500/15'
                          : 'border-[#D8D3C8] focus:border-[#C9A227] focus:ring-3 focus:ring-[#C9A227]/15'
                      }`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-4 text-[#64676E] hover:text-[#202124] transition-colors cursor-pointer"
                      aria-label={showConfirmPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                    >
                      {showConfirmPassword ? (
                        <EyeOff className="w-5 h-5" />
                      ) : (
                        <Eye className="w-5 h-5" />
                      )}
                    </button>
                  </div>
                  {errors.confirmPassword && (
                    <p className="text-xs text-red-600 font-medium">{errors.confirmPassword}</p>
                  )}
                </div>

                {/* Submit Button */}
                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full h-[54px] min-h-[54px] rounded-xl font-semibold text-[16px] bg-[#C9A227] hover:bg-[#B18B20] text-[#161616] shadow-xs active:scale-[0.99] transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {isLoading ? (
                      <span>Đang gửi mã OTP...</span>
                    ) : (
                      <>
                        <span>Tiếp tục & Nhận mã OTP Gmail</span>
                        <ArrowRight className="w-4 h-4 text-[#161616]" />
                      </>
                    )}
                  </button>
                </div>
              </form>
            </>
          ) : (
            /* ======================================================== */
            /* BƯỚC 2: XÁC THỰC MÃ OTP 6 CHỮ SỐ                         */
            /* ======================================================== */
            <div className="space-y-5">
              <div className="space-y-1.5">
                <div className="w-11 h-11 rounded-2xl bg-[#FAF6EC] border border-[#E8E2D6] text-[#92701B] flex items-center justify-center mb-2">
                  <KeyRound className="w-5 h-5" />
                </div>
                <h2 className="font-display font-bold text-[26px] text-[#202124] tracking-tight leading-tight">
                  Xác thực mã OTP Gmail
                </h2>
                <p className="text-[14px] text-[#64676E] leading-[1.6]">
                  Nhập mã xác thực 6 chữ số đã được gửi tới{' '}
                  <strong className="text-[#202124]">{email}</strong>.
                </p>
              </div>

              {/* Delivery status banner */}
              {deliveryMode === 'gmail' ? (
                <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <strong className="block font-semibold">Đã gửi email thật qua Gmail SMTP!</strong>
                    <span>Vui lòng kiểm tra hộp thư đến (hoặc mục Thư rác/Spam) của {email}.</span>
                  </div>
                </div>
              ) : (
                <div className="p-3.5 rounded-xl bg-[#FAF6EC] border border-[#E7CA80] text-[#202124] text-xs space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-[#80601D] flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5" />
                      Mã OTP của bạn (Chế độ chưa gắn Gmail SMTP):
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
                    <span>Muốn gửi mail thật về hộp thư Gmail?</span>
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

              {/* Optional Inline Gmail SMTP Configuration */}
              {showSmtpSetup && (
                <form
                  onSubmit={handleSaveSmtpAndResend}
                  className="p-4 rounded-xl bg-[#F8F5ED] border border-[#D8D3C8] space-y-3 text-xs"
                >
                  <div className="font-semibold text-[#202124]">
                    Kết nối Gmail SMTP để gửi OTP thật
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-[#64676E] font-medium">Gmail dùng để gửi:</label>
                    <input
                      type="email"
                      placeholder="your_gmail@gmail.com"
                      value={smtpEmail}
                      onChange={e => setSmtpEmail(e.target.value)}
                      className="w-full h-9 px-3 rounded-lg border border-[#D8D3C8] bg-white text-[#202124] outline-none focus:border-[#C9A227]"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-[#64676E] font-medium">
                      Mật khẩu ứng dụng Google (App Password 16 ký tự):
                    </label>
                    <input
                      type="password"
                      placeholder="xxxx xxxx xxxx xxxx"
                      value={smtpAppPassword}
                      onChange={e => setSmtpAppPassword(e.target.value)}
                      className="w-full h-9 px-3 rounded-lg border border-[#D8D3C8] bg-white text-[#202124] outline-none focus:border-[#C9A227]"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={isSavingSmtp}
                    className="w-full h-9 rounded-lg bg-[#202124] hover:bg-[#35373C] text-white font-semibold transition-colors cursor-pointer"
                  >
                    {isSavingSmtp ? 'Đang lưu & gửi mail...' : 'Lưu & Gửi mã OTP qua Gmail thật'}
                  </button>
                </form>
              )}

              {errors.otp && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-medium">
                  {errors.otp}
                </div>
              )}

              <form onSubmit={handleVerifyAndRegister} className="space-y-5">
                {/* 6 OTP Boxes */}
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

                {/* Countdown & Resend */}
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
                    className="inline-flex items-center gap-1 font-semibold text-[#92701B] hover:text-[#7A5D13] cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Gửi lại mã OTP</span>
                  </button>
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full h-[54px] min-h-[54px] rounded-xl font-semibold text-[16px] bg-[#C9A227] hover:bg-[#B18B20] text-[#161616] shadow-xs active:scale-[0.99] transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
                >
                  {isLoading ? (
                    <span>Đang xác thực & Tạo tài khoản...</span>
                  ) : (
                    <>
                      <span>Xác nhận OTP & Hoàn tất đăng ký</span>
                      <ArrowRight className="w-4 h-4 text-[#161616]" />
                    </>
                  )}
                </button>
              </form>
            </div>
          )}

          {/* Footer Link to Login */}
          <div className="text-center text-[14px] text-[#64676E] pt-2 border-t border-[#E8E2D6]">
            Đã có tài khoản?{' '}
            <NavLink
              to="/login"
              className="font-semibold text-[#92701B] hover:text-[#7A5D13] hover:underline transition-colors"
            >
              Đăng nhập
            </NavLink>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
