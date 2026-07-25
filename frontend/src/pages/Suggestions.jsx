import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, MapPin, Send, User } from 'lucide-react';
import { profileService } from '../services/profileService';
import { connectService } from '../services/connectService';
import { useToast } from '../context/ToastContext';
import Loader from '../components/Loader';
import EmptyState from '../components/EmptyState';
import Modal from '../components/Modal';
import { API_BASE_URL } from '../api/client';

export const Suggestions = () => {
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const { showToast } = useToast();

  // Connect request modal state
  const [selectedUser, setSelectedUser] = useState(null);
  const [connectReason, setConnectReason] = useState('be_friends');
  const [sendingRequest, setSendingRequest] = useState(false);

  const fetchSuggestions = async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      const response = await profileService.getSuggestions();
      if (response.success && response.data) {
        setSuggestions(response.data);
      }
    } catch (err) {
      if (err.status === 400 && err.message.includes('complete your profile')) {
        setErrorMsg('PROFILE_INCOMPLETE');
      } else {
        setErrorMsg(err.message || 'Failed to fetch suggestions.');
        showToast(err.message || 'Failed to fetch suggestions.', 'error');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSuggestions();
  }, []);

  const openConnectModal = (user) => {
    setSelectedUser(user);
    setConnectReason('be_friends');
  };

  const closeConnectModal = () => {
    setSelectedUser(null);
  };

  const handleSendConnectRequest = async () => {
    if (!selectedUser) return;

    setSendingRequest(true);
    try {
      const response = await connectService.sendConnectRequest(selectedUser.id, connectReason);
      if (response.success) {
        showToast(`Connection request sent to ${selectedUser.full_name || selectedUser.username}!`, 'success');
        // Remove the user from recommendations
        setSuggestions((prev) => prev.filter((u) => u.username !== selectedUser.username));
      } else {
        showToast(response.message || 'Failed to send request.', 'error');
      }
    } catch (err) {
      showToast(err.message || 'An error occurred.', 'error');
    } finally {
      setSendingRequest(false);
      closeConnectModal();
    }
  };

  const getProfilePicture = (profile) => {
    if (profile.profile_picture) {
      if (profile.profile_picture.startsWith('http')) return profile.profile_picture;
      return `${API_BASE_URL}${profile.profile_picture}`;
    }
    return null;
  };

  if (loading) {
    return <Loader />;
  }

  if (errorMsg === 'PROFILE_INCOMPLETE') {
    return (
      <EmptyState
        icon={User}
        title="Complete Your Profile First"
        description="To receive match suggestions, you need to complete your profile details first."
        actionText="Complete Profile"
        actionLink="/settings"
      />
    );
  }

  return (
    <div className="space-y-6 text-left relative">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-extrabold font-display text-[#2C2C2A] dark:text-slate-100 flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-[#D4537E] dark:text-brand-purple-light" />
            <span>Discover Matches</span>
          </h2>
          <p className="text-[#5F5E5A] dark:text-slate-400 text-xs mt-1">
            People nearby in your city available to connect.
          </p>
        </div>
      </div>

      {suggestions.length === 0 ? (
        <EmptyState
          icon={Sparkles}
          title="No Suggestions Left"
          description="You have seen all matching profiles in your city! Check back later for new members."
          actionText="Edit Settings"
          actionLink="/settings"
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <AnimatePresence mode="popLayout">
            {suggestions.map((user) => {
              const pic = getProfilePicture(user);
              return (
                <motion.div
                  layout
                  key={user.username}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8, y: 20 }}
                  className="glass-panel p-5 rounded-2xl border border-[#F4C0D1] dark:border-brand-purple/10 flex flex-col justify-between bg-white dark:bg-brand-dark/20 hover:border-[#D4537E]/40 dark:hover:border-brand-purple/35 transition-all duration-300 group shadow-lg"
                >
                  <div>
                    {/* Header: Photo and Info */}
                    <div className="flex gap-4 items-start">
                      {pic ? (
                        <img
                          src={pic}
                          alt={user.full_name}
                          className="w-14 h-14 rounded-full object-cover border border-[#F4C0D1] dark:border-brand-purple/20 shadow-md flex-shrink-0"
                        />
                      ) : (
                        <div className="w-14 h-14 rounded-full bg-[#D4537E]/15 dark:bg-brand-purple/20 flex items-center justify-center border border-[#D4537E]/30 dark:border-brand-purple/20 text-[#D4537E] dark:text-brand-purple-light text-base font-bold uppercase flex-shrink-0">
                          {user.username.substring(0, 2)}
                        </div>
                      )}
                      <div>
                        <h4 className="font-bold text-sm text-[#2C2C2A] dark:text-slate-200 group-hover:text-[#D4537E] dark:group-hover:text-brand-purple-light transition-colors">
                          {user.full_name}
                        </h4>
                        <div className="text-[10px] text-[#5F5E5A] dark:text-slate-500 font-semibold mt-0.5">@{user.username}</div>
                        
                        {user.city && (
                          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                            <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
                              <MapPin className="w-2.5 h-2.5" />
                              <span>{user.city}</span>
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => openConnectModal(user)}
                    className="w-full mt-6 bg-[#D4537E]/15 hover:bg-[#D4537E] dark:bg-brand-purple/20 dark:hover:bg-brand-purple text-[#D4537E] hover:text-white dark:text-brand-purple-light dark:hover:text-white border border-[#D4537E]/30 dark:border-brand-purple/35 text-xs font-bold py-2.5 rounded-xl transition-all duration-300 flex items-center justify-center gap-1.5 cursor-pointer shadow-xs group-hover:scale-[1.01]"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Connect</span>
                  </button>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}

      {/* Connect Modal */}
      <Modal
        isOpen={selectedUser !== null}
        onClose={closeConnectModal}
        title={`Connect with ${selectedUser?.full_name}`}
      >
        <div className="space-y-4">
          <p className="text-xs text-[#5F5E5A] dark:text-slate-400">
            Send an invitation note to connect. Choose a reason to start your conversation.
          </p>

          <div className="flex flex-col gap-1.5 text-left">
            <label className="text-xs font-semibold text-[#5F5E5A] dark:text-slate-400">Select Reason</label>
            <select
              className="glass-input p-3 rounded-xl text-sm w-full bg-white dark:bg-brand-black/90 text-[#2C2C2A] dark:text-slate-200"
              value={connectReason}
              onChange={(e) => setConnectReason(e.target.value)}
              disabled={sendingRequest}
            >
              <option value="be_friends">I'd like to be friends.</option>
              <option value="know_better">I'd like to know you better.</option>
              <option value="similar_interests">We live in the same city.</option>
            </select>
          </div>

          <div className="flex gap-3 justify-end mt-6">
            <button
              onClick={closeConnectModal}
              className="px-4 py-2.5 rounded-xl text-xs font-bold bg-transparent text-[#5F5E5A] dark:text-slate-400 hover:text-[#2C2C2A] dark:hover:text-slate-200 border border-[#F4C0D1] dark:border-slate-800 transition-all cursor-pointer"
              disabled={sendingRequest}
            >
              Cancel
            </button>
            <button
              onClick={handleSendConnectRequest}
              className="px-5 py-2.5 rounded-xl text-xs font-bold bg-[#D4537E] hover:bg-[#c2436d] dark:bg-brand-purple dark:hover:bg-brand-purple-dark text-white border border-transparent dark:border-brand-purple-light/20 transition-all flex items-center gap-1.5 cursor-pointer"
              disabled={sendingRequest}
            >
              {sendingRequest ? (
                <div className="w-4 h-4 rounded-full border-2 border-white/20 border-t-white animate-spin"></div>
              ) : (
                <>
                  <Send className="w-3.5 h-3.5" />
                  <span>Send Invitation</span>
                </>
              )}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default Suggestions;
