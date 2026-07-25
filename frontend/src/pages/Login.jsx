import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { LogIn, Key, User } from 'lucide-react';

export const Login = () => {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const { login } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  const from = location.state?.from?.pathname || '/dashboard';

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!identifier.trim() || !password.trim()) {
      showToast('Please fill in all fields.', 'error');
      return;
    }

    setLoading(true);
    const result = await login(identifier.trim(), password.trim());
    setLoading(false);

    if (result.success) {
      showToast('Welcome back to Lynqo!', 'success');
      navigate(from, { replace: true });
    } else {
      if (result.data && result.data.email_verification_required && result.data.user_id) {
        showToast(result.message || 'Please verify your email before logging in.', 'info');
        navigate(`/verify-email?user_id=${result.data.user_id}`);
      } else {
        showToast(result.message || 'Invalid username/email or password.', 'error');
      }
    }
  };

  return (
    <div>
      <h2 className="text-2xl font-bold font-display text-slate-100 text-center mb-6">
        Welcome Back
      </h2>
      
      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <div className="flex flex-col gap-1.5 text-left">
          <label className="text-xs font-semibold text-slate-400">
            Username or Email
          </label>
          <div className="relative">
            <User className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-500" />
            <input
              type="text"
              className="w-full glass-input pl-10 pr-4 py-3 rounded-xl text-sm"
              placeholder="Enter your username or email"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              disabled={loading}
              required
            />
          </div>
        </div>

        <div className="flex flex-col gap-1.5 text-left">
          <label className="text-xs font-semibold text-slate-400">
            Password
          </label>
          <div className="relative">
            <Key className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-500" />
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
          <div className="text-right mt-1">
            <Link
              to="/forgot-password"
              className="text-xs text-brand-purple-light hover:underline font-semibold transition-all"
            >
              Forgot Password?
            </Link>
          </div>
        </div>

        <button
          type="submit"
          className="w-full mt-2 bg-brand-purple hover:bg-brand-purple-dark text-white font-bold py-3.5 rounded-xl transition-all duration-300 shadow-lg shadow-brand-purple/20 border border-brand-purple-light/25 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={loading}
        >
          {loading ? (
            <div className="w-5 h-5 rounded-full border-2 border-white/20 border-t-white animate-spin"></div>
          ) : (
            <>
              <LogIn className="w-4 h-4" />
              <span>Log In</span>
            </>
          )}
        </button>
      </form>

      <div className="mt-6 text-center text-sm text-slate-400 font-medium">
        Don't have an account?{' '}
        <Link
          to="/signup"
          className="text-brand-purple-light hover:underline font-bold transition-all"
        >
          Sign Up
        </Link>
      </div>
    </div>
  );
};

export default Login;
