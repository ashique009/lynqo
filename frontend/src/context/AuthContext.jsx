import React, { createContext, useState, useEffect, useContext } from 'react';
import { profileService } from '../services/profileService';
import { wsService } from '../services/websocketService';
import { cacheInvalidate, setCacheUserScope } from '../utils/cache';

const AuthContext = createContext(null);

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

  const fetchCurrentProfile = async (authToken) => {
    try {
      const res = await profileService.getProfile();
      if (res.success && res.profile) {
        setProfile(res.profile);
        localStorage.setItem('lynqo_profile', JSON.stringify(res.profile));
        setCacheUserScope(res.profile.profile_id);
        wsService.connect(authToken);
      } else {
        clearAuth();
      }
    } catch (err) {
      if (!err.status || (err.status >= 400 && err.status < 500)) {
        clearAuth();
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (token) {
      // Connect WebSocket using token to avoid cold connection latency (wsService prevents duplicates)
      wsService.connect(token);
      fetchCurrentProfile(token);
    } else {
      setIsLoading(false);
    }
  }, [token]);

  const clearAuth = () => {
    localStorage.removeItem('lynqo_token');
    localStorage.removeItem('lynqo_profile');
    setCacheUserScope(null);
    cacheInvalidate();
    setToken(null);
    setProfile(null);
    wsService.disconnect();
  };

  const createProfile = async (displayName, pictureFile) => {
    setIsLoading(true);
    try {
      const res = await profileService.createProfile(displayName, pictureFile);
      if (res.success) {
        const { token: newToken, profile: newProfile, recovery_code } = res;
        cacheInvalidate();
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

  const recoverProfile = async (recoveryCode) => {
    setIsLoading(true);
    try {
      const res = await profileService.recoverProfile(recoveryCode);
      if (res.success) {
        const { token: newToken, profile: recoveredProfile, new_recovery_code } = res;
        cacheInvalidate();
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

  const value = {
    token,
    profile,
    isAuthenticated: Boolean(token && profile),
    isLoading,
    createProfile,
    recoverProfile,
    updateProfile,
    regenerateRecoveryCode,
    logout,
    refreshProfile: () => (token ? fetchCurrentProfile(token) : null),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => useContext(AuthContext);
