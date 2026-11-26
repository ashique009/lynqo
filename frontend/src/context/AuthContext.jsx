import React, { createContext, useState, useEffect, useContext, useCallback, useRef } from 'react';
import { isAuthFailureResponse } from '../api/client';
import { profileService } from '../services/profileService';
import { wsService } from '../services/websocketService';
import { cacheInvalidate, setCacheUserScope } from '../utils/cache';
import { clearMediaCache } from '../utils/mediaUrl';

const AuthContext = createContext(null);

export const shouldClearAuthOnProfileError = (err) => {
  if (!err || !err.status) return false; // Preserve session on offline / network / timeout errors
  if (err.status === 429 || err.status >= 500) return false; // Preserve session on rate limits & server errors
  return isAuthFailureResponse(err.status, err.data);
};

export const AuthProvider = ({ children }) => {
  const [token, setToken] = useState(() => localStorage.getItem('lynqo_token'));
  const [profile, setProfile] = useState(() => {
    try {
      const saved = localStorage.getItem('lynqo_profile');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  // Only show blocking loading state if token exists without a cached profile
  const [isLoading, setIsLoading] = useState(() => {
    const savedToken = localStorage.getItem('lynqo_token');
    const savedProfile = localStorage.getItem('lynqo_profile');
    return Boolean(savedToken && !savedProfile);
  });

  const tokenRef = useRef(token);
  tokenRef.current = token;

  const clearAuth = useCallback(() => {
    localStorage.removeItem('lynqo_token');
    localStorage.removeItem('lynqo_profile');
    setCacheUserScope(null);
    cacheInvalidate();
    clearMediaCache();
    setToken(null);
    setProfile(null);
    wsService.disconnect();
  }, []);

  const fetchCurrentProfile = useCallback(async (authToken) => {
    if (!authToken) return;
    try {
      const res = await profileService.getProfile();
      if (res.success && res.profile) {
        setProfile(res.profile);
        localStorage.setItem('lynqo_profile', JSON.stringify(res.profile));
        setCacheUserScope(res.profile.profile_id);
        wsService.connect(authToken);
      } else if (res && res.success === false && isAuthFailureResponse(403, res)) {
        clearAuth();
      }
    } catch (err) {
      if (shouldClearAuthOnProfileError(err)) {
        clearAuth();
      }
    } finally {
      setIsLoading(false);
    }
  }, [clearAuth]);

  useEffect(() => {
    if (token) {
      // Connect WebSocket using token to avoid cold connection latency (wsService prevents duplicates)
      wsService.connect(token);
      fetchCurrentProfile(token);
    } else {
      setIsLoading(false);
    }
  }, [token, fetchCurrentProfile]);

  // Recover session and WebSocket safely when network reconnects
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleOnline = () => {
      const activeToken = tokenRef.current;
      if (activeToken) {
        wsService.connect(activeToken);
        fetchCurrentProfile(activeToken);
      }
    };
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [fetchCurrentProfile]);

  const login = async (username, password) => {
    setIsLoading(true);
    try {
      // Clear any stale local credentials before fresh authentication
      localStorage.removeItem('lynqo_token');
      localStorage.removeItem('lynqo_profile');
      const res = await profileService.login(username, password);
      if (res.success) {
        const { token: newToken, profile: newProfile } = res;
        cacheInvalidate();
        clearMediaCache();
        setCacheUserScope(newProfile?.profile_id);
        localStorage.setItem('lynqo_token', newToken);
        localStorage.setItem('lynqo_profile', JSON.stringify(newProfile));
        setToken(newToken);
        setProfile(newProfile);
        wsService.connect(newToken);
        return { success: true, profile: newProfile };
      }
      return { success: false, message: res.message || 'Invalid username or password' };
    } catch (err) {
      return { success: false, message: err.message || 'Invalid username or password' };
    } finally {
      setIsLoading(false);
    }
  };

  const createProfile = async (displayName, pictureFile, username = null, password = null) => {
    setIsLoading(true);
    try {
      localStorage.removeItem('lynqo_token');
      localStorage.removeItem('lynqo_profile');
      const res = await profileService.createProfile(displayName, pictureFile, username, password);
      if (res.success) {
        const { token: newToken, profile: newProfile, recovery_code } = res;
        cacheInvalidate();
        clearMediaCache();
        setCacheUserScope(newProfile?.profile_id);
        localStorage.setItem('lynqo_token', newToken);
        localStorage.setItem('lynqo_profile', JSON.stringify(newProfile));
        setToken(newToken);
        setProfile(newProfile);
        wsService.connect(newToken);
        return { success: true, profile: newProfile, recovery_code };
      }
      return { success: false, message: res.message || 'Failed to create profile' };
    } catch (err) {
      return { success: false, message: err.message || 'Error creating profile' };
    } finally {
      setIsLoading(false);
    }
  };

  const recoverProfile = async (recoveryCode, username = null, newPassword = null) => {
    setIsLoading(true);
    try {
      localStorage.removeItem('lynqo_token');
      localStorage.removeItem('lynqo_profile');
      const res = await profileService.recoverProfile(recoveryCode, username, newPassword);
      if (res.success) {
        const { token: newToken, profile: recoveredProfile, new_recovery_code } = res;
        cacheInvalidate();
        clearMediaCache();
        setCacheUserScope(recoveredProfile?.profile_id);
        localStorage.setItem('lynqo_token', newToken);
        localStorage.setItem('lynqo_profile', JSON.stringify(recoveredProfile));
        setToken(newToken);
        setProfile(recoveredProfile);
        wsService.connect(newToken);
        return { success: true, profile: recoveredProfile, new_recovery_code };
      }
      return { success: false, message: res.message || 'Failed to recover profile' };
    } catch (err) {
      return { success: false, message: err.message || 'Invalid recovery code' };
    } finally {
      setIsLoading(false);
    }
  };

  const updateProfile = async ({ displayName, profilePictureFile }) => {
    try {
      const res = await profileService.updateProfile({ displayName, profilePictureFile });
      if (res.success && res.profile) {
        setProfile(res.profile);
        localStorage.setItem('lynqo_profile', JSON.stringify(res.profile));
        setCacheUserScope(res.profile.profile_id);
        return { success: true, profile: res.profile };
      }
      return { success: false, message: res.message || 'Failed to update profile' };
    } catch (err) {
      return { success: false, message: err.message || 'Error updating profile' };
    }
  };

  const regenerateRecoveryCode = async () => {
    try {
      const res = await profileService.regenerateRecoveryCode();
      if (res.success) {
        return { success: true, recovery_code: res.recovery_code };
      }
      return { success: false, message: res.message };
    } catch (err) {
      return { success: false, message: err.message || 'Error regenerating recovery code' };
    }
  };

  const logout = async () => {
    try {
      await profileService.logout();
    } catch (err) {
      console.warn('Logout error:', err);
    } finally {
      clearAuth();
    }
  };

  const logoutAll = async () => {
    try {
      await profileService.logoutAll();
    } catch (err) {
      console.warn('Logout all error:', err);
    } finally {
      clearAuth();
    }
  };

  const value = {
    token,
    profile,
    isAuthenticated: Boolean(token && profile),
    isLoading,
    login,
    createProfile,
    recoverProfile,
    updateProfile,
    regenerateRecoveryCode,
    logout,
    logoutAll,
    refreshProfile: () => (token ? fetchCurrentProfile(token) : null),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => useContext(AuthContext);
