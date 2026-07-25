import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { UserPlus, User, Mail, Phone, Lock, Eye, EyeOff } from 'lucide-react';

export const Signup = () => {
  const [fullName, setFullName] = useState('');
  const [usernameInput, setUsernameInput] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});

  const { signup } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFieldErrors({});

    if (password !== confirmPassword) {
      setFieldErrors({ confirm_password: ['Passwords do not match.'] });
      showToast('Passwords do not match.', 'error');
      return;
    }

    setLoading(true);
    const result = await signup(
      fullName.trim(),
      usernameInput.trim(),
      email.trim(),
      phone.trim(),
      password,
      confirmPassword
    );
    setLoading(false);

    if (result.success) {
      showToast(result.message || 'Account created! Check your email for OTP.', 'success');
      const userId = result.data?.user_id;
      if (userId) {
        navigate(`/verify-email?user_id=${userId}`);
      } else {
        navigate('/verify-email');
      }
    } else {
      showToast(result.message || 'Registration failed.', 'error');
      if (result.errors) {
        setFieldErrors(result.errors);
      }
    }
  };

  const getFieldError = (fieldName) => {
    if (fieldErrors[fieldName] && fieldErrors[fieldName].length > 0) {
      return fieldErrors[fieldName][0];
    }
    return null;
  };

  return (
    <div>
      <h2 className="text-2xl font-bold font-display text-slate-100 text-center mb-6">
        Create Account
      </h2>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4 max-h-[60vh] overflow-y-auto px-1">
        {/* Full Name */}
        <div className="flex flex-col gap-1 text-left">
          <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
            Full Name
          </label>
          <div className="relative">
            <User className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-500" />
            <input
              type="text"
              className="w-full glass-input pl-10 pr-4 py-3 rounded-xl text-sm"
              placeholder="John Doe"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              disabled={loading}
              required
            />
          </div>
          {getFieldError('full_name') && (
            <p className="text-[10px] text-rose-400 font-semibold mt-1">
              {getFieldError('full_name')}
            </p>
          )}
        </div>

        {/* Username */}
        <div className="flex flex-col gap-1 text-left">
          <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
            Username
          </label>
          <div className="relative">
            <User className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-500" />
            <input
              type="text"
              className="w-full glass-input pl-10 pr-4 py-3 rounded-xl text-sm"
              placeholder="johndoe"
              value={usernameInput}
              onChange={(e) => setUsernameInput(e.target.value)}
              disabled={loading}
              required
            />
          </div>
          {getFieldError('username') && (
            <p className="text-[10px] text-rose-400 font-semibold mt-1">
              {getFieldError('username')}
            </p>
          )}
        </div>

        {/* Email */}
        <div className="flex flex-col gap-1 text-left">
          <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
            Email Address
          </label>
          <div className="relative">
            <Mail className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-500" />
            <input
              type="email"
              className="w-full glass-input pl-10 pr-4 py-3 rounded-xl text-sm"
              placeholder="johndoe@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
              required
            />
          </div>
          {getFieldError('email') && (
            <p className="text-[10px] text-rose-400 font-semibold mt-1">
              {getFieldError('email')}
            </p>
          )}
        </div>

        {/* Phone */}
        <div className="flex flex-col gap-1 text-left">
          <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
            Phone Number
          </label>
          <div className="relative">
            <Phone className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-500" />
            <input
              type="tel"
              className="w-full glass-input pl-10 pr-4 py-3 rounded-xl text-sm"
              placeholder="+1234567890"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              disabled={loading}
              required
            />
          </div>
          {getFieldError('phone') && (
            <p className="text-[10px] text-rose-400 font-semibold mt-1">
              {getFieldError('phone')}
            </p>
          )}
        </div>

        {/* Password */}
        <div className="flex flex-col gap-1 text-left">
          <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
            Password
          </label>
          <div className="relative">
            <Lock className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-500" />
            <input
              type="password"
              className="w-full glass-input pl-10 pr-4 py-3 rounded-xl text-sm"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
              required
            />
          </div>
          {getFieldError('password') && (
            <p className="text-[10px] text-rose-400 font-semibold mt-1">
              {getFieldError('password')}
            </p>
          )}
        </div>

        {/* Confirm Password */}
        <div className="flex flex-col gap-1 text-left">
          <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
            Confirm Password
          </label>
          <div className="relative">
            <Lock className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-500" />
            <input
              type="password"
              className="w-full glass-input pl-10 pr-4 py-3 rounded-xl text-sm"
              placeholder="••••••••"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              disabled={loading}
              required
            />
          </div>
          {getFieldError('confirm_password') && (
            <p className="text-[10px] text-rose-400 font-semibold mt-1">
              {getFieldError('confirm_password')}
            </p>
          )}
        </div>

        <button
          type="submit"
          className="w-full mt-4 bg-brand-purple hover:bg-brand-purple-dark text-white font-bold py-3.5 rounded-xl transition-all duration-300 shadow-lg shadow-brand-purple/20 border border-brand-purple-light/25 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={loading}
        >
          {loading ? (
            <div className="w-5 h-5 rounded-full border-2 border-white/20 border-t-white animate-spin"></div>
          ) : (
            <>
              <UserPlus className="w-4 h-4" />
              <span>Create Account</span>
            </>
          )}
        </button>
      </form>

      <div className="mt-6 text-center text-sm text-slate-400 font-medium">
        Already have an account?{' '}
        <Link
          to="/login"
          className="text-brand-purple-light hover:underline font-bold transition-all"
        >
          Log In
        </Link>
      </div>
    </div>
  );
};

export default Signup;
