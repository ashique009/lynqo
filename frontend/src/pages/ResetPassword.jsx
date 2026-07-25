import React, { useState } from 'react';
import { useSearchParams, Link, useNavigate } from 'react-router-dom';
import { authService } from '../services/authService';
import { useToast } from '../context/ToastContext';
import { Lock, ArrowLeft, Eye, EyeOff } from 'lucide-react';

export const ResetPassword = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [validationError, setValidationError] = useState('');

  const handlePasswordChange = (val) => {
    setNewPassword(val);
    if (validationError) {
      setValidationError('');
    }
  };

  const handleConfirmPasswordChange = (val) => {
    setConfirmPassword(val);
    if (validationError) {
      setValidationError('');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setValidationError('');

    if (!token) {
      showToast('Invalid or missing reset link.', 'error');
      return;
    }

    if (newPassword !== confirmPassword) {
      setValidationError('Passwords do not match.');
      showToast('Passwords do not match.', 'error');
      return;
    }

    setLoading(true);
    try {
      const response = await authService.resetPassword(token, newPassword);
      // Show response message
      showToast(response.message || 'Password has been reset successfully.', 'success');
      // Redirect after 2 seconds
      setTimeout(() => {
        navigate('/login');
      }, 2000);
    } catch (err) {
      showToast(err.message || 'Failed to reset password. The link may have expired.', 'error');
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="text-center py-4">
        <h2 className="text-2xl font-bold font-display text-slate-100 mb-4">
          Invalid Reset Link
        </h2>
        <p className="text-rose-400 text-sm font-semibold mb-6">
          Invalid or missing reset link.
        </p>
        <Link
          to="/forgot-password"
          className="inline-flex items-center gap-2 text-brand-purple-light hover:underline font-bold transition-all"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Go to Forgot Password</span>
        </Link>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-2xl font-bold font-display text-slate-100 text-center mb-6">
        Reset Password
      </h2>
      
      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <div className="flex flex-col gap-1.5 text-left">
          <label className="text-xs font-semibold text-slate-400">
            New Password
          </label>
          <div className="relative">
            <Lock className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-500" />
            <input
              type={showNewPassword ? 'text' : 'password'}
              className="w-full glass-input pl-10 pr-10 py-3 rounded-xl text-sm"
              placeholder="••••••••"
              value={newPassword}
              onChange={(e) => handlePasswordChange(e.target.value)}
              disabled={loading}
              required
            />
            <button
              type="button"
              className="absolute right-3.5 top-3.5 text-slate-500 hover:text-slate-300 cursor-pointer"
              onClick={() => setShowNewPassword(!showNewPassword)}
            >
              {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-1.5 text-left">
          <label className="text-xs font-semibold text-slate-400">
            Confirm Password
          </label>
          <div className="relative">
            <Lock className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-500" />
            <input
              type={showConfirmPassword ? 'text' : 'password'}
              className="w-full glass-input pl-10 pr-10 py-3 rounded-xl text-sm"
              placeholder="••••••••"
              value={confirmPassword}
              onChange={(e) => handleConfirmPasswordChange(e.target.value)}
              disabled={loading}
              required
            />
            <button
              type="button"
              className="absolute right-3.5 top-3.5 text-slate-500 hover:text-slate-300 cursor-pointer"
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
            >
              {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          {validationError && (
            <p className="text-[10px] text-rose-400 font-semibold mt-1">
              {validationError}
            </p>
          )}
        </div>

        <button
          type="submit"
          className="w-full mt-2 bg-brand-purple hover:bg-brand-purple-dark text-white font-bold py-3.5 rounded-xl transition-all duration-300 shadow-lg shadow-brand-purple/20 border border-brand-purple-light/25 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={loading}
        >
          {loading ? (
            <div className="w-5 h-5 rounded-full border-2 border-white/20 border-t-white animate-spin"></div>
          ) : (
            <span>Reset Password</span>
          )}
        </button>
      </form>
    </div>
  );
};

export default ResetPassword;
