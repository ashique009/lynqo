import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, useLocation, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { authService } from '../services/authService';
import { Mail, RefreshCw, ArrowRight } from 'lucide-react';

export const VerifyEmail = () => {
  const [otpCode, setOtpCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { saveSession } = useAuth();
  const { showToast } = useToast();

  const userId = searchParams.get('user_id') || location.state?.user_id;

  // Countdown timer effect for resend cooldown
  useEffect(() => {
    let timer;
    if (cooldown > 0) {
      timer = setInterval(() => {
        setCooldown((prev) => prev - 1);
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [cooldown]);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!userId) {
      showToast('Missing user identification. Please log in or sign up again.', 'error');
      navigate('/login');
      return;
    }

    const cleanOtp = otpCode.trim();
    if (!cleanOtp || cleanOtp.length !== 6 || !/^\d+$/.test(cleanOtp)) {
      showToast('Please enter a valid 6-digit numeric OTP code.', 'error');
      return;
    }

    setLoading(true);

    try {
      const response = await authService.verifyEmail(userId, cleanOtp);

      if (response.success && response.data) {
        showToast('Email verified successfully!', 'success');
        const { token: authToken, username: userObj } = response.data;
        
        // Save auth session & refresh profile
        await saveSession(authToken, userObj);

        // Navigate to profile setup
        navigate('/profile-setup');
      } else {
        showToast(response.message || 'Invalid or expired OTP.', 'error');
      }
    } catch (err) {
      showToast(err.message || 'Invalid or expired OTP.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (cooldown > 0 || resending) return;

    if (!userId) {
      showToast('Missing user identification. Please log in again.', 'error');
      navigate('/login');
      return;
    }

    setResending(true);

    try {
      const response = await authService.resendOtp(userId);
      if (response.success) {
        showToast(response.message || 'Verification code sent to your email!', 'success');
        setCooldown(60); // 60-second cooldown timer
      } else {
        showToast(response.message || 'Failed to resend verification code.', 'error');
      }
    } catch (err) {
      showToast(err.message || 'Failed to resend verification code.', 'error');
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="w-full">
      <div className="flex justify-center mb-4">
        <div className="p-3.5 rounded-2xl bg-brand-purple/10 border border-brand-purple/30 text-brand-purple-light">
          <Mail className="w-8 h-8" />
        </div>
      </div>

      <h2 className="text-2xl font-bold font-display text-slate-100 text-center mb-2">
        Verify Your Email
      </h2>
      <p className="text-xs text-slate-400 text-center mb-6 max-w-sm mx-auto leading-relaxed">
        We sent a 6-digit verification code to your email. Enter the code below to complete your registration.
      </p>

      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        <div className="flex flex-col gap-2 text-left">
          <label className="text-xs font-semibold text-slate-400 text-center">
            Enter 6-Digit OTP Code
          </label>
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={6}
            className="w-full glass-input text-center text-2xl font-mono tracking-[0.5em] py-4 rounded-2xl border border-brand-purple/20 focus:border-brand-purple focus:ring-2 focus:ring-brand-purple-light/20 outline-none transition-all"
            placeholder="000000"
            value={otpCode}
            onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            disabled={loading}
            autoFocus
            required
          />
        </div>

        <button
          type="submit"
          className="w-full bg-brand-purple hover:bg-brand-purple-dark text-white font-bold py-3.5 rounded-xl transition-all duration-300 shadow-lg shadow-brand-purple/20 border border-brand-purple-light/25 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={loading || otpCode.trim().length !== 6}
        >
          {loading ? (
            <div className="w-5 h-5 rounded-full border-2 border-white/20 border-t-white animate-spin"></div>
          ) : (
            <>
              <span>Verify & Continue</span>
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </form>

      {/* Resend Code Section */}
      <div className="mt-8 pt-6 border-t border-slate-800/80 flex flex-col items-center gap-2">
        <p className="text-xs text-slate-400 font-medium">
          Didn't receive the email code?
        </p>
        <button
          type="button"
          onClick={handleResendOtp}
          disabled={cooldown > 0 || resending}
          className="text-xs font-bold text-brand-purple-light hover:underline disabled:no-underline disabled:opacity-50 flex items-center gap-1.5 cursor-pointer transition-all"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${resending ? 'animate-spin' : ''}`} />
          {cooldown > 0 ? (
            <span>Resend Code in {cooldown}s</span>
          ) : (
            <span>Resend Code</span>
          )}
        </button>
      </div>

      <div className="mt-6 text-center text-xs text-slate-500">
        Need to log in with a different account?{' '}
        <Link to="/login" className="text-slate-400 hover:text-white font-semibold underline">
          Back to Login
        </Link>
      </div>
    </div>
  );
};

export default VerifyEmail;
