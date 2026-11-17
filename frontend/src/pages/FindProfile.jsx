import React, { useState, useEffect } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import {
  Search, Copy, Check, Share2, UserPlus, MessageSquare,
  Clock, CheckCircle, AlertCircle, Sparkles
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { connectService } from '../services/connectService';
import Loader from '../components/Loader';

export const FindProfile = () => {
  const { profile } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const { profileId: paramProfileId } = useParams();
  const [searchParams] = useSearchParams();

  const [searchQuery, setSearchQuery] = useState(paramProfileId || searchParams.get('id') || '');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResult, setSearchResult] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [copiedId, setCopiedId] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const inviteLink = profile?.profile_id
    ? `${window.location.origin}/connect/${profile.profile_id}`
    : '';

  useEffect(() => {
    const autoQuery = paramProfileId || searchParams.get('id');
    if (autoQuery && autoQuery.toUpperCase() !== profile?.profile_id) {
      performSearch(autoQuery.toUpperCase());
    }
  }, [paramProfileId]);

  const performSearch = async (queryId) => {
    const id = (queryId || searchQuery).trim().toUpperCase();
    if (!id) return;

    if (id === profile?.profile_id) {
      showToast('You cannot search for your own profile ID.', 'error');
      return;
    }

    setIsSearching(true);
    setSearchResult(null);
    try {
      const res = await connectService.searchProfile(id);
      if (res.success) {
        setSearchResult(res);
      } else {
        showToast(res.message || 'Profile not found.', 'error');
      }
    } catch (err) {
      showToast(err.message || 'Profile not found.', 'error');
    } finally {
      setIsSearching(false);
    }
  };

  const handleSendRequest = async () => {
    if (!searchResult?.profile?.profile_id) return;
    setActionLoading(true);
    try {
      const res = await connectService.sendConnectRequest(searchResult.profile.profile_id);
      if (res.success) {
        showToast('Connection request sent!', 'success');
        // Refresh status
        performSearch(searchResult.profile.profile_id);
      } else {
        showToast(res.message || 'Failed to send request.', 'error');
      }
    } catch (err) {
      showToast(err.message || 'Failed to send request.', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleAcceptRequest = async (requestId) => {
    setActionLoading(true);
    try {
      const res = await connectService.acceptRequest(requestId);
      if (res.success) {
        showToast('Connection accepted!', 'success');
        if (res.conversation_id) {
          navigate(`/chat/${res.conversation_id}`);
        } else {
          performSearch(searchResult.profile.profile_id);
        }
      }
    } catch (err) {
      showToast(err.message || 'Failed to accept request.', 'error');
    } finally {
      setActionLoading(false);
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
    <div className="space-y-8 max-w-3xl mx-auto">
      {/* Top Banner: Your Connection Info */}
      <div className="p-6 md:p-8 rounded-3xl bg-slate-900/80 border border-slate-800 shadow-xl backdrop-blur-xl space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-pink-500/10 border border-pink-500/20 text-pink-400 flex items-center justify-center">
            <Share2 className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">Share Your Profile</h2>
            <p className="text-xs text-slate-400">Others can connect with you using your ID or link</p>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          {/* Profile ID Card */}
          <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-between">
            <div>
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Your Profile ID</span>
              <span className="font-mono text-base font-bold text-pink-400 tracking-wider">
                {profile?.profile_id || '...'}
              </span>
            </div>
            <button
              onClick={copyId}
              className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors flex items-center gap-1.5 text-xs font-semibold"
            >
              {copiedId ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              <span>Copy</span>
            </button>
          </div>

          {/* Invitation Link Card */}
          <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-between">
            <div className="truncate mr-2">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Direct Invite Link</span>
              <span className="font-mono text-xs text-slate-300 truncate block">
                {inviteLink}
              </span>
            </div>
            <button
              onClick={copyInviteLink}
              className="p-2.5 rounded-xl bg-pink-500/10 hover:bg-pink-500/20 text-pink-400 border border-pink-500/30 transition-colors flex items-center gap-1.5 text-xs font-semibold shrink-0"
            >
              {copiedLink ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              <span>Copy</span>
            </button>
          </div>
        </div>
      </div>

      {/* Search Input Section */}
      <div className="p-6 md:p-8 rounded-3xl bg-slate-900/80 border border-slate-800 shadow-xl backdrop-blur-xl space-y-6">
        <div>
          <h2 className="text-xl font-bold text-white">Find Someone to Connect</h2>
          <p className="text-xs text-slate-400 mt-1">Enter a unique Profile ID to send a connection request</p>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            performSearch();
          }}
          className="flex gap-3"
        >
          <div className="relative flex-grow">
            <Search className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="e.g. LYNQ-7X9P2"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value.toUpperCase())}
              className="w-full pl-12 pr-4 py-3.5 rounded-2xl bg-slate-950 border border-slate-800 text-white font-mono placeholder-slate-600 focus:outline-none focus:border-pink-500 focus:ring-1 focus:ring-pink-500 transition-all text-sm tracking-wider"
            />
          </div>
          <button
            type="submit"
            disabled={isSearching || !searchQuery.trim()}
            className="px-6 py-3.5 rounded-2xl bg-gradient-to-r from-pink-500 to-indigo-600 hover:from-pink-600 hover:to-indigo-700 disabled:opacity-50 text-white font-bold text-sm shadow-lg shadow-pink-500/20 transition-all cursor-pointer shrink-0"
          >
            {isSearching ? 'Searching...' : 'Search'}
          </button>
        </form>

        {/* Search Result */}
        {isSearching && (
          <div className="py-8 flex justify-center">
            <Loader />
          </div>
        )}

        {searchResult && (
          <div className="p-5 rounded-2xl bg-slate-950 border border-slate-800/80 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-4 w-full sm:w-auto">
              <div className="relative w-14 h-14 rounded-2xl overflow-hidden bg-slate-800 border border-slate-700 shrink-0">
                {searchResult.profile.profile_picture ? (
                  <img
                    src={searchResult.profile.profile_picture}
                    alt={searchResult.profile.display_name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center font-bold text-xl text-pink-400 bg-pink-500/10">
                    {searchResult.profile.display_name?.charAt(0) || 'U'}
                  </div>
                )}
                {searchResult.profile.is_online && (
                  <span className="absolute bottom-1 right-1 w-3 h-3 bg-emerald-500 border-2 border-slate-900 rounded-full" />
                )}
              </div>

              <div>
                <h4 className="font-bold text-base text-white">{searchResult.profile.display_name}</h4>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="font-mono text-xs text-pink-400 font-semibold">{searchResult.profile.profile_id}</span>
                  <span className="text-xs text-slate-500">•</span>
                  <span className="text-xs text-slate-400">
                    {searchResult.profile.is_online ? 'Online now' : 'Offline'}
                  </span>
                </div>
              </div>
            </div>

            {/* Contextual Action Button */}
            <div className="w-full sm:w-auto flex justify-end">
              {searchResult.connection_status === 'connected' ? (
                <button
                  onClick={() => navigate(`/chat/${searchResult.conversation_id}`)}
                  className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-pink-500 hover:bg-pink-600 text-white text-xs font-bold transition-colors flex items-center justify-center gap-2"
                >
                  <MessageSquare className="w-4 h-4" />
                  <span>Open Chat</span>
                </button>
              ) : searchResult.connection_status === 'pending_sent' ? (
                <div className="px-4 py-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-semibold flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  <span>Request Pending</span>
                </div>
              ) : searchResult.connection_status === 'pending_received' ? (
                <button
                  onClick={() => handleAcceptRequest(searchResult.request_id)}
                  disabled={actionLoading}
                  className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold transition-colors flex items-center justify-center gap-2"
                >
                  <CheckCircle className="w-4 h-4" />
                  <span>Accept Request</span>
                </button>
              ) : (
                <button
                  onClick={handleSendRequest}
                  disabled={actionLoading}
                  className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-gradient-to-r from-pink-500 to-indigo-600 hover:from-pink-600 hover:to-indigo-700 text-white text-xs font-bold shadow-lg shadow-pink-500/20 transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <UserPlus className="w-4 h-4" />
                  <span>Send Connect Request</span>
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default FindProfile;
