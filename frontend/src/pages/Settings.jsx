import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useTheme } from '../context/ThemeContext';
import { profileService } from '../services/profileService';
import { authService } from '../services/authService';
import Loader from '../components/Loader';
import { Upload, Check, Save, LogOut, Bell, BellOff, Download, Sun, Moon } from 'lucide-react';
import { API_BASE_URL } from '../api/client';

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY || 'BD57u82r0XebhNJL2PE0cGdLCsGv3zD8iNkTXp2blUwT6rrfm46ws_w5cxbMqMLJsGTfx6Tewq6qtQeOI9eYKc8';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export const Settings = () => {
  const { userProfile, refreshProfile, logout } = useAuth();
  const { showToast } = useToast();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();

  // Form states
  const [profilePicture, setProfilePicture] = useState(null);
  const [picturePreview, setPicturePreview] = useState(null);
  const [bio, setBio] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [pincode, setPincode] = useState('');
  const [lookingFor, setLookingFor] = useState('friendship');
  const [selectedInterests, setSelectedInterests] = useState([]);
  const [interestsList, setInterestsList] = useState([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [isSubscribed, setIsSubscribed] = useState(false);
  const [loadingPush, setLoadingPush] = useState(false);
  const [swSupported, setSwSupported] = useState(false);

  // PWA installation states
  const [deferredPrompt, setDeferredPrompt] = useState(window.deferredPrompt || null);
  const [showInstallButton, setShowInstallButton] = useState(!!window.deferredPrompt);
  const [showIosFallback, setShowIosFallback] = useState(false);
  const [isAlreadyInstalled, setIsAlreadyInstalled] = useState(false);

  useEffect(() => {
    const checkPushSubscription = async () => {
      if ('serviceWorker' in navigator && 'PushManager' in window) {
        setSwSupported(true);
        try {
          const registration = await navigator.serviceWorker.ready;
          const subscription = await registration.pushManager.getSubscription();
          setIsSubscribed(!!subscription);
        } catch (error) {
          console.error('Error checking push subscription status:', error);
        }
      }
    };
    checkPushSubscription();
  }, []);

  useEffect(() => {
    // Check if the app is already installed or running in standalone mode
    const checkStandalone = () => {
      const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
      setIsAlreadyInstalled(isStandalone);
    };
    checkStandalone();

    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault();
      window.deferredPrompt = e;
      setDeferredPrompt(e);
      setShowInstallButton(true);
      setShowIosFallback(false);
    };

    const handleAppInstalled = () => {
      window.deferredPrompt = null;
      setDeferredPrompt(null);
      setShowInstallButton(false);
      setIsAlreadyInstalled(true);
      showToast('Lynqo has been successfully installed!', 'success');
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    if (window.deferredPrompt) {
      setDeferredPrompt(window.deferredPrompt);
      setShowInstallButton(true);
    } else {
      // If we are not already in standalone mode, show fallback text after 4 seconds if prompt doesn't fire
      const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
      if (!isStandalone) {
        const timer = setTimeout(() => {
          if (!window.deferredPrompt) {
            setShowIosFallback(true);
          }
        }, 4000);
        return () => {
          clearTimeout(timer);
          window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
          window.removeEventListener('appinstalled', handleAppInstalled);
        };
      }
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, [showToast]);

  const handleInstallClick = async () => {
    const promptEvent = deferredPrompt || window.deferredPrompt;
    if (!promptEvent) {
      showToast('Install prompt is not available.', 'error');
      return;
    }

    promptEvent.prompt();

    try {
      const { outcome } = await promptEvent.userChoice;
      if (outcome === 'accepted') {
        showToast('Thank you for installing Lynqo!', 'success');
        setShowInstallButton(false);
        setDeferredPrompt(null);
        window.deferredPrompt = null;
      } else {
        showToast('Installation prompt dismissed.', 'info');
      }
    } catch (err) {
      console.error('Error during PWA installation:', err);
      showToast('Failed to trigger installation.', 'error');
    }
  };

  const handlePushToggle = async () => {
    if (!swSupported) {
      showToast('Push notifications are not supported on this browser.', 'error');
      return;
    }

    setLoadingPush(true);
    try {
      if (isSubscribed) {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        if (subscription) {
          await authService.unsubscribePush(subscription.endpoint);
          await subscription.unsubscribe();
          setIsSubscribed(false);
          showToast('Unsubscribed from push notifications.', 'info');
        } else {
          setIsSubscribed(false);
        }
      } else {
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
          showToast('Permission for notifications was denied.', 'error');
          setLoadingPush(false);
          return;
        }

        const registration = await navigator.serviceWorker.ready;
        const applicationServerKey = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
        const subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: applicationServerKey
        });

        const subJson = subscription.toJSON();
        const payloadKeys = {
          p256dh: subJson.keys?.p256dh,
          auth: subJson.keys?.auth
        };

        await authService.subscribePush(subscription.endpoint, payloadKeys);
        setIsSubscribed(true);
        showToast('Successfully subscribed to push notifications!', 'success');
      }
    } catch (err) {
      console.error('Error toggling push notifications:', err);
      showToast(err.message || 'Failed to update push notification subscription.', 'error');
    } finally {
      setLoadingPush(false);
    }
  };

  useEffect(() => {
    const initializeForm = async () => {
      try {
        const [profileRes, interestsRes] = await Promise.all([
          profileService.getProfileDetail(),
          profileService.getInterests()
        ]);

        if (profileRes.success && profileRes.data) {
          const profile = profileRes.data;
          setBio(profile.bio || '');
          setAddress(profile.address || '');
          setCity(profile.city || '');
          setState(profile.state || '');
          setPincode(profile.pincode || '');
          setLookingFor(profile.looking_for || 'friendship');
          setSelectedInterests(profile.interests.map(i => i.id));
          
          if (profile.profile_picture) {
            if (profile.profile_picture.startsWith('http')) {
              setPicturePreview(profile.profile_picture);
            } else {
              setPicturePreview(`${API_BASE_URL}${profile.profile_picture}`);
            }
          }
        }

        if (interestsRes.success && interestsRes.data) {
          setInterestsList(interestsRes.data);
        }
      } catch (err) {
        showToast('Failed to load settings details.', 'error');
      } finally {
        setLoading(false);
      }
    };

    initializeForm();
  }, [showToast]);

  const handlePictureChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setProfilePicture(file);
      setPicturePreview(URL.createObjectURL(file));
    }
  };

  const handleInterestToggle = (id) => {
    setSelectedInterests((prev) =>
      prev.includes(id)
        ? prev.filter((item) => item !== id)
        : [...prev, id]
    );
  };

  const handleSave = async (e) => {
    e.preventDefault();

    if (selectedInterests.length < 3) {
      showToast('Please select at least 3 interests.', 'error');
      return;
    }
    if (selectedInterests.length > 10) {
      showToast('You can select a maximum of 10 interests.', 'error');
      return;
    }

    setSaving(true);
    
    const payload = {
      bio: bio.trim(),
      address: address.trim(),
      city: city.trim(),
      state: state.trim(),
      pincode: pincode.trim(),
      looking_for: lookingFor,
      interest_ids: selectedInterests,
    };

    if (profilePicture) {
      payload.profile_picture = profilePicture;
    }

    try {
      const response = await profileService.updateProfile(payload);
      if (response.success) {
        showToast('Profile settings saved successfully!', 'success');
        await refreshProfile();
      } else {
        showToast(response.message || 'Failed to update profile.', 'error');
      }
    } catch (err) {
      showToast(err.message || 'An error occurred while saving.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    showToast('Logged out successfully.', 'info');
    navigate('/');
  };

  // Group interests by category
  const groupedInterests = interestsList.reduce((acc, interest) => {
    const category = interest.category || 'General';
    if (!acc[category]) acc[category] = [];
    acc[category].push(interest);
    return acc;
  }, {});

  if (loading) {
    return <Loader />;
  }

  return (
    <div className="space-y-6 text-left max-w-3xl mx-auto">
      <div>
        <h2 className="text-2xl font-extrabold font-display text-slate-100">Settings</h2>
        <p className="text-slate-400 text-xs mt-1">
          Update your location, profile biography, and connection tags here.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Settings Form */}
        <div className="lg:col-span-2 space-y-6">
          <form onSubmit={handleSave} className="glass-panel p-6 md:p-8 rounded-3xl border border-brand-purple/10 bg-brand-dark/15 space-y-6">
            
            {/* Profile Pic Upload */}
            <div className="flex flex-col sm:flex-row items-center gap-5 border-b border-slate-900 pb-6">
              <div className="relative w-20 h-20 rounded-full border border-slate-800 flex items-center justify-center overflow-hidden bg-brand-black/40 group flex-shrink-0">
                {picturePreview ? (
                  <img src={picturePreview} alt="Avatar" className="w-full h-full object-cover" />
                ) : (
                  <Upload className="w-5 h-5 text-slate-500" />
                )}
                <input
                  type="file"
                  accept="image/*"
                  onChange={handlePictureChange}
                  className="absolute inset-0 opacity-0 cursor-pointer"
                  disabled={saving}
                />
              </div>
              
              <div className="text-center sm:text-left">
                <div className="text-sm font-bold text-slate-200">Change Profile Image</div>
                <div className="text-xs text-slate-500 mt-1">Upload a clear photo to help matches recognize you.</div>
              </div>
            </div>

            {/* Location & Looking For */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-slate-400">City</label>
                <input
                  type="text"
                  className="glass-input p-3 rounded-xl text-sm"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  disabled={saving}
                  required
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-slate-400">State</label>
                <input
                  type="text"
                  className="glass-input p-3 rounded-xl text-sm"
                  value={state}
                  onChange={(e) => setState(e.target.value)}
                  disabled={saving}
                  required
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-slate-400">Pincode</label>
                <input
                  type="text"
                  className="glass-input p-3 rounded-xl text-sm"
                  value={pincode}
                  onChange={(e) => setPincode(e.target.value)}
                  disabled={saving}
                  required
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-slate-400">Looking For</label>
                <select
                  className="glass-input p-3 rounded-xl text-sm w-full bg-brand-black/90"
                  value={lookingFor}
                  onChange={(e) => setLookingFor(e.target.value)}
                  disabled={saving}
                  required
                >
                  <option value="friendship">Friendship</option>
                  <option value="relationship">Relationship</option>
                </select>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-slate-400">Address</label>
              <input
                type="text"
                className="glass-input p-3 rounded-xl text-sm"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                disabled={saving}
              />
            </div>

            {/* Bio */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-slate-400">Biography</label>
              <textarea
                className="glass-input p-3 rounded-xl text-sm min-h-24 resize-none"
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                disabled={saving}
                required
              />
            </div>

            {/* Interests checklist */}
            <div className="flex flex-col gap-3 text-left border-t border-slate-900 pt-6">
              <div className="flex justify-between items-end pb-1">
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Update Interests
                </label>
                <span className="text-[10px] font-bold text-brand-purple-light uppercase">
                  {selectedInterests.length} selected (Requires 3-10)
                </span>
              </div>

              <div className="space-y-5 max-h-[250px] overflow-y-auto pr-1">
                {Object.keys(groupedInterests).map((category) => (
                  <div key={category} className="space-y-1.5">
                    <div className="text-[9px] font-extrabold text-slate-500 uppercase tracking-widest">
                      {category}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {groupedInterests[category].map((interest) => {
                        const isSelected = selectedInterests.includes(interest.id);
                        return (
                          <button
                            type="button"
                            key={interest.id}
                            onClick={() => handleInterestToggle(interest.id)}
                            disabled={saving}
                            className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all duration-200 cursor-pointer border ${
                              isSelected
                                ? 'bg-brand-purple text-white border-brand-purple-light shadow-sm'
                                : 'bg-brand-black/30 text-slate-400 border-slate-800 hover:text-slate-200 hover:border-slate-700'
                            }`}
                          >
                            {isSelected && <Check className="w-3 h-3" />}
                            <span>{interest.name}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Submit */}
            <button
              type="submit"
              className="w-full bg-brand-purple hover:bg-brand-purple-dark text-white font-bold py-3.5 rounded-xl transition-all duration-300 border border-brand-purple-light/20 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-brand-purple/10"
              disabled={saving}
            >
              {saving ? (
                <div className="w-5 h-5 rounded-full border-2 border-white/20 border-t-white animate-spin"></div>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  <span>Save Changes</span>
                </>
              )}
            </button>

          </form>
        </div>

        {/* Sidebar Cards */}
        <div className="space-y-6">
          {/* Appearance & Theme Card */}
          <div className="glass-panel p-6 rounded-3xl border border-[#F4C0D1] dark:border-brand-purple/10 bg-white dark:bg-brand-dark/15 flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-[#D4537E]/10 dark:bg-brand-purple/10 border border-[#D4537E]/20 dark:border-brand-purple/20">
                {theme === 'dark' ? (
                  <Moon className="w-5 h-5 text-brand-purple-light" />
                ) : (
                  <Sun className="w-5 h-5 text-[#D4537E]" />
                )}
              </div>
              <div>
                <h3 className="text-sm font-bold text-[#2C2C2A] dark:text-slate-200">Appearance</h3>
                <span className="text-[10px] text-[#5F5E5A] dark:text-slate-500 font-semibold uppercase">
                  {theme === 'dark' ? 'Dark Mode Active' : 'Light Mode Active'}
                </span>
              </div>
            </div>
            <p className="text-xs text-[#5F5E5A] dark:text-slate-400 leading-relaxed">
              Switch between soft pink light theme and sleek dark purple workspace aesthetics.
            </p>
            
            <button
              type="button"
              onClick={toggleTheme}
              className="w-full font-bold py-3 rounded-xl transition-all duration-200 cursor-pointer flex items-center justify-center gap-2 text-xs border bg-[#D4537E] hover:bg-[#c2436d] text-white border-transparent shadow-md dark:bg-brand-purple dark:hover:bg-brand-purple-dark dark:border-brand-purple-light/20 shadow-brand-purple/10"
            >
              {theme === 'dark' ? (
                <>
                  <Sun className="w-4 h-4" />
                  <span>Switch to Light Mode</span>
                </>
              ) : (
                <>
                  <Moon className="w-4 h-4" />
                  <span>Switch to Dark Mode</span>
                </>
              )}
            </button>
          </div>

          {/* Push Notifications Card */}
          <div className="glass-panel p-6 rounded-3xl border border-brand-purple/10 bg-brand-dark/15 flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-brand-purple/10 border border-brand-purple/20">
                {isSubscribed ? (
                  <Bell className="w-5 h-5 text-brand-purple-light" />
                ) : (
                  <BellOff className="w-5 h-5 text-slate-400" />
                )}
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-200">Push Notifications</h3>
                <span className="text-[10px] text-slate-500 font-semibold uppercase">
                  {swSupported ? (isSubscribed ? 'Enabled' : 'Disabled') : 'Not Supported'}
                </span>
              </div>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Get real-time updates when you receive connect requests or new direct messages.
            </p>
            
            {swSupported ? (
              <button
                type="button"
                onClick={handlePushToggle}
                disabled={loadingPush}
                className={`w-full font-bold py-3 rounded-xl transition-all duration-200 cursor-pointer flex items-center justify-center gap-2 text-xs border ${
                  isSubscribed
                    ? 'bg-brand-black/35 hover:bg-rose-500/10 text-slate-300 hover:text-rose-400 border-slate-800 hover:border-rose-500/30'
                    : 'bg-brand-purple hover:bg-brand-purple-dark text-white border-brand-purple-light/20 shadow-md shadow-brand-purple/10'
                }`}
              >
                {loadingPush ? (
                  <div className="w-4 h-4 rounded-full border-2 border-white/20 border-t-white animate-spin"></div>
                ) : isSubscribed ? (
                  <>
                    <BellOff className="w-4 h-4" />
                    <span>Disable Notifications</span>
                  </>
                ) : (
                  <>
                    <Bell className="w-4 h-4" />
                    <span>Enable Notifications</span>
                  </>
                )}
              </button>
            ) : (
              <div className="text-center text-xs font-semibold text-slate-500 py-2 border border-dashed border-slate-800 rounded-xl bg-brand-black/20">
                Service Worker not supported in this browser.
              </div>
            )}
          </div>

          {/* Install App Card */}
          {!isAlreadyInstalled && (showInstallButton || showIosFallback) && (
            <div className="glass-panel p-6 rounded-3xl border border-brand-purple/10 bg-brand-dark/15 flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-brand-purple/10 border border-brand-purple/20">
                  <Download className="w-5 h-5 text-brand-purple-light" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-200">Install App</h3>
                  <span className="text-[10px] text-slate-500 font-semibold uppercase">
                    PWA Support
                  </span>
                </div>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Install Lynqo on your device for a fast, full-screen, native experience.
              </p>
              
              {showInstallButton ? (
                <button
                  type="button"
                  onClick={handleInstallClick}
                  className="w-full bg-brand-purple hover:bg-brand-purple-dark text-white font-bold py-3 rounded-xl transition-all duration-200 cursor-pointer flex items-center justify-center gap-2 text-xs border border-brand-purple-light/20 shadow-md shadow-brand-purple/10"
                >
                  <Download className="w-4 h-4" />
                  <span>Install Lynqo</span>
                </button>
              ) : showIosFallback ? (
                <div className="text-slate-400 text-xs py-2 px-3 border border-brand-purple/15 rounded-xl bg-brand-purple/5 text-center font-medium leading-relaxed">
                  On iPhone: tap <span className="text-brand-purple-light font-bold">Share</span>, then <span className="text-brand-purple-light font-bold">'Add to Home Screen'</span>
                </div>
              ) : null}
            </div>
          )}

          {/* Sidebar Log Out Card */}
          <div className="glass-panel p-6 rounded-3xl border border-brand-purple/10 bg-brand-dark/15 flex flex-col gap-4">
            <h3 className="text-sm font-bold text-slate-200">Account Actions</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              If you want to clear your current browser credentials and exit the workspace, log out below.
            </p>
            
            <button
              onClick={handleLogout}
              className="w-full bg-rose-500/10 hover:bg-rose-500 text-rose-400 hover:text-white border border-rose-500/25 font-bold py-3 rounded-xl transition-all duration-200 cursor-pointer flex items-center justify-center gap-2 text-xs"
            >
              <LogOut className="w-4 h-4" />
              <span>Log Out Session</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Settings;
