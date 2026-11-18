import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import {
  Search, Copy, Check, Share2, MessageSquare, Loader2, Sparkles, User
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { connectService } from '../services/connectService';
import { chatService } from '../services/chatService';
import { getOptimizedImageUrl } from '../utils/imageUtils';

export const FindProfile = () => {
  const { profile } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const { profileId: paramProfileId } = useParams();
  const [searchParams] = useSearchParams();

  const [searchQuery, setSearchQuery] = useState(paramProfileId || searchParams.get('id') || '');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [startingConvId, setStartingConvId] = useState(null);
  const [copiedId, setCopiedId] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const debounceTimerRef = useRef(null);

  const inviteLink = profile?.profile_id
    ? `${window.location.origin}/find?id=${profile.profile_id}`
    : '';

  const performSearch = useCallback(async (queryText) => {
    const q = (queryText !== undefined ? queryText : searchQuery).trim();
    if (!q) {
      setSearchResults([]);
      setHasSearched(false);
      return;
    }

    if (profile?.profile_id && q.toUpperCase() === profile.profile_id.toUpperCase()) {
      showToast('You cannot search for your own profile ID.', 'error');
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    setHasSearched(true);
    try {
      const res = await connectService.searchProfile(q);
      if (res.success) {
        const list = res.profiles || (res.profile ? [res.profile] : []);
        setSearchResults(list);
      } else {
        setSearchResults([]);
      }
    } catch {
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  }, [searchQuery, profile?.profile_id, showToast]);

  // Initial auto-search if profileId or ?id= param present
  useEffect(() => {
    const autoQuery = paramProfileId || searchParams.get('id');
    if (autoQuery && autoQuery.toUpperCase() !== profile?.profile_id) {
      setSearchQuery(autoQuery);
      performSearch(autoQuery);
    }
  }, [paramProfileId, searchParams, profile?.profile_id, performSearch]);

  // Handle text input change with debounce
  const handleInputChange = (e) => {
    const val = e.target.value;
    setSearchQuery(val);

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    const trimmed = val.trim();
    if (trimmed.length >= 2) {
      debounceTimerRef.current = setTimeout(() => {
        performSearch(trimmed);
      }, 350);
    } else if (trimmed.length === 0) {
      setSearchResults([]);
      setHasSearched(false);
    }
  };

  const handleOpenChat = async (targetProfile) => {
    if (!targetProfile?.profile_id) return;

    // If conversation ID is already known
    if (targetProfile.conversation_id) {
      navigate(`/chat/${targetProfile.conversation_id}`, {
        state: {
          conversation: {
            id: targetProfile.conversation_id,
            other_participant: targetProfile,
          },
        },
      });
      return;
    }

    // Otherwise, create or get the conversation directly
    setStartingConvId(targetProfile.profile_id);
    try {
      const res = await chatService.startConversation(targetProfile.profile_id);
      if (res.success && res.conversation?.id) {
        navigate(`/chat/${res.conversation.id}`, {
          state: {
            conversation: res.conversation,
          },
        });
      } else {
        showToast(res.message || 'Failed to start conversation.', 'error');
      }
    } catch (err) {
      showToast(err.message || 'Failed to start conversation.', 'error');
    } finally {
      setStartingConvId(null);
    }
  };

  const copyId = () => {
    if (profile?.profile_id) {
      navigator.clipboard.writeText(profile.profile_id);
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 2000);
      showToast('Profile ID copied!', 'success');
    }
  };

  const copyInviteLink = () => {
    if (inviteLink) {
      navigator.clipboard.writeText(inviteLink);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
      showToast('Invitation link copied!', 'success');
    }
  };

  return (
    <div className="space-y-6 sm:space-y-8 max-w-3xl mx-auto pb-10">
      {/* Top Banner: Your Profile ID & Direct Link */}
      <div className="p-5 sm:p-6 md:p-8 rounded-3xl bg-slate-900/80 border border-slate-800 shadow-xl backdrop-blur-xl space-y-5 sm:space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-pink-500/10 border border-pink-500/20 text-pink-400 flex items-center justify-center shrink-0">
            <Share2 className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg sm:text-xl font-bold text-white">Share Your Profile</h2>
            <p className="text-xs text-slate-400">Others can find and message you directly using your ID or link</p>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-3 sm:gap-4">
          {/* Profile ID Card */}
          <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-between gap-2">
            <div className="truncate">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Your Profile ID</span>
              <span className="font-mono text-sm sm:text-base font-bold text-pink-400 tracking-wider">
                {profile?.profile_id || '...'}
              </span>
            </div>
            <button
              onClick={copyId}
              className="p-2 sm:p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors flex items-center gap-1.5 text-xs font-semibold cursor-pointer shrink-0"
            >
              {copiedId ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              <span>Copy</span>
            </button>
          </div>

          {/* Invitation Link Card */}
          <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-between gap-2">
            <div className="truncate mr-2">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Direct Invite Link</span>
              <span className="font-mono text-xs text-slate-300 truncate block">
                {inviteLink}
              </span>
            </div>
            <button
              onClick={copyInviteLink}
              className="p-2 sm:p-2.5 rounded-xl bg-pink-500/10 hover:bg-pink-500/20 text-pink-400 border border-pink-500/30 transition-colors flex items-center gap-1.5 text-xs font-semibold shrink-0 cursor-pointer"
            >
              {copiedLink ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              <span>Copy</span>
            </button>
          </div>
        </div>
      </div>

      {/* Search Input Section */}
      <div className="p-5 sm:p-6 md:p-8 rounded-3xl bg-slate-900/80 border border-slate-800 shadow-xl backdrop-blur-xl space-y-6">
        <div>
          <h2 className="text-lg sm:text-xl font-bold text-white">Find Someone to Chat With</h2>
          <p className="text-xs text-slate-400 mt-1">Search by display name or Profile ID to start messaging immediately</p>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            performSearch();
          }}
          className="flex gap-2.5 sm:gap-3"
        >
          <div className="relative flex-grow">
            <Search className="w-4 sm:w-5 h-4 sm:h-5 absolute left-3.5 sm:left-4 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="Name or ID (e.g. Alice or LYNQ-XXXXX)"
              value={searchQuery}
              onChange={handleInputChange}
              className="w-full pl-10 sm:pl-12 pr-4 py-3 sm:py-3.5 rounded-2xl bg-slate-950 border border-slate-800 text-white placeholder-slate-600 focus:outline-none focus:border-pink-500 focus:ring-1 focus:ring-pink-500 transition-all text-xs sm:text-sm tracking-wide"
            />
          </div>
          <button
            type="submit"
            disabled={isSearching || !searchQuery.trim()}
            className="px-4 sm:px-6 py-3 sm:py-3.5 rounded-2xl bg-gradient-to-r from-pink-500 to-indigo-600 hover:from-pink-600 hover:to-indigo-700 disabled:opacity-50 text-white font-bold text-xs sm:text-sm shadow-lg shadow-pink-500/20 transition-all cursor-pointer shrink-0 flex items-center justify-center gap-1.5"
          >
            {isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            <span>{isSearching ? 'Searching...' : 'Search'}</span>
          </button>
        </form>

        {/* Searching Skeleton */}
        {isSearching && (
          <div className="space-y-3 pt-2">
            {[1, 2].map((i) => (
              <div key={i} className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800/60 animate-pulse flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-slate-800/80" />
                  <div className="space-y-2">
                    <div className="h-4 w-32 bg-slate-800/80 rounded" />
                    <div className="h-3 w-20 bg-slate-800/50 rounded" />
                  </div>
                </div>
                <div className="h-9 w-24 bg-slate-800/80 rounded-xl" />
              </div>
            ))}
          </div>
        )}

        {/* Search Results List */}
        {!isSearching && hasSearched && searchResults.length > 0 && (
          <div className="space-y-3 pt-1">
            <span className="text-xs font-semibold text-slate-400 block px-1">
              Found {searchResults.length} {searchResults.length === 1 ? 'account' : 'accounts'}
            </span>
            {searchResults.map((target) => (
              <div
                key={target.profile_id}
                className="p-4 sm:p-5 rounded-2xl bg-slate-950 border border-slate-800/90 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 transition-all hover:border-slate-700/80"
              >
                <div className="flex items-center gap-3.5">
                  <div className="relative w-12 h-12 sm:w-14 sm:h-14 rounded-2xl overflow-hidden bg-slate-800 border border-slate-700 shrink-0">
                    {target.profile_picture ? (
                      <img
                        src={getOptimizedImageUrl(target.profile_picture, { width: 112, height: 112 })}
                        alt={target.display_name}
                        className="w-full h-full object-cover"
                        loading="lazy"
                        decoding="async"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center font-bold text-lg sm:text-xl text-pink-400 bg-pink-500/10">
                        {target.display_name?.charAt(0) || <User className="w-6 h-6 text-pink-400" />}
                      </div>
                    )}
                    {target.is_online && (
                      <span className="absolute bottom-1 right-1 w-3 h-3 bg-emerald-500 border-2 border-slate-900 rounded-full" />
                    )}
                  </div>

                  <div>
                    <h4 className="font-bold text-sm sm:text-base text-white">{target.display_name}</h4>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="font-mono text-xs text-pink-400 font-semibold">{target.profile_id}</span>
                      <span className="text-xs text-slate-500">•</span>
                      <span className="text-xs text-slate-400">
                        {target.is_online ? (
                          <span className="text-emerald-400 font-medium">Online</span>
                        ) : (
                          'Offline'
                        )}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Direct Message Action Button */}
                <div className="w-full sm:w-auto flex justify-end">
                  <button
                    onClick={() => handleOpenChat(target)}
                    disabled={startingConvId === target.profile_id}
                    className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-gradient-to-r from-pink-500 to-indigo-600 hover:from-pink-600 hover:to-indigo-700 active:scale-95 text-white text-xs font-bold shadow-md shadow-pink-500/20 transition-all flex items-center justify-center gap-2 cursor-pointer min-h-[40px]"
                  >
                    {startingConvId === target.profile_id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <MessageSquare className="w-4 h-4" />
                    )}
                    <span>{startingConvId === target.profile_id ? 'Opening...' : 'Message'}</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Empty state when searched and no results */}
        {!isSearching && hasSearched && searchResults.length === 0 && (
          <div className="py-10 text-center space-y-2">
            <p className="text-sm font-semibold text-slate-300">No matching accounts found</p>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              We couldn&apos;t find anyone matching &quot;{searchQuery}&quot;. Check the spelling or enter their exact Profile ID.
            </p>
          </div>
        )}

        {/* Initial state before searching */}
        {!hasSearched && (
          <div className="py-8 text-center text-slate-500 text-xs">
            Start typing to search accounts and begin direct messaging instantly.
          </div>
        )}
      </div>
    </div>
  );
};

export default FindProfile;
