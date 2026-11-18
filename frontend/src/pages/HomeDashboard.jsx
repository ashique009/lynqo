import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  MessageSquare, UserPlus, Users, Search, Copy, Check,
  Sparkles, CheckCheck, Clock, UserCheck, Mic
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { chatService } from '../services/chatService';
import { connectService } from '../services/connectService';
import { wsService } from '../services/websocketService';
import { cacheGet, cacheSet } from '../utils/cache';
import { mergeConversations } from '../utils/conversationUtils';
import Loader from '../components/Loader';

export const HomeDashboard = () => {
  const { profile } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [conversations, setConversations] = useState(() => cacheGet('dashboard_conversations') || []);
  const [pendingRequestsCount, setPendingRequestsCount] = useState(() => cacheGet('dashboard_pending_count') || 0);
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(() => !cacheGet('dashboard_conversations'));
  const [copiedId, setCopiedId] = useState(false);

  const loadData = async (silent = false) => {
    if (!silent && !cacheGet('dashboard_conversations')) {
      setIsLoading(true);
    }
    try {
      const [convRes, reqRes] = await Promise.all([
        chatService.getConversations(),
        connectService.getIncomingRequests(),
      ]);
      if (convRes.success) {
        const convList = convRes.conversations || [];
        setConversations((prev) => {
          const merged = mergeConversations(prev, convList);
          cacheSet('dashboard_conversations', merged, 120);
          return merged;
        });
      }
      if (reqRes.success) {
        const reqCount = reqRes.requests?.length || 0;
        setPendingRequestsCount(reqCount);
        cacheSet('dashboard_pending_count', reqCount, 120);
      }
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    // If we have cached data, fetch in background silently; otherwise show loader
    const hasCache = Boolean(cacheGet('dashboard_conversations'));
    loadData(hasCache);

    // Listen for real-time conversation updates
    const unsubConv = wsService.on('conversation_update', (event) => {
      setConversations((prev) => {
        const existingIdx = prev.findIndex((c) => c.id === event.conversation_id);
        let updated;
        if (existingIdx !== -1) {
          updated = [...prev];
          updated[existingIdx] = {
            ...updated[existingIdx],
            last_message: event.message,
            unread_count: (updated[existingIdx].unread_count || 0) + 1,
            updated_at: event.message.created_at,
          };
          const [moved] = updated.splice(existingIdx, 1);
          updated = [moved, ...updated];
        } else {
          loadData(true);
          return prev;
        }
        cacheSet('dashboard_conversations', updated, 120);
        return updated;
      });
    });

    const unsubPresence = wsService.on('presence_update', (event) => {
      setConversations((prev) => {
        const updated = prev.map((c) => {
          if (c.other_participant?.profile_id === event.profile_id) {
            return {
              ...c,
              other_participant: {
                ...c.other_participant,
                is_online: event.is_online,
                last_seen: event.last_seen,
              },
            };
          }
          return c;
        });
        cacheSet('dashboard_conversations', updated, 120);
        return updated;
      });
    });

    const unsubConn = wsService.on('connection_event', () => {
      loadData(true);
    });

    return () => {
      unsubConv();
      unsubPresence();
      unsubConn();
    };
  }, []);

  const copyId = () => {
    if (profile?.profile_id) {
      navigator.clipboard.writeText(profile.profile_id);
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 2000);
      showToast('Profile ID copied!', 'success');
    }
  };

  const filteredConversations = conversations.filter((c) => {
    const q = search.toLowerCase();
    const name = c.other_participant?.display_name?.toLowerCase() || '';
    const id = c.other_participant?.profile_id?.toLowerCase() || '';
    return name.includes(q) || id.includes(q);
  });

  const formatTime = (isoString) => {
    if (!isoString) return '';
    const date = new Date(isoString);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    if (isToday) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Profile Banner */}
      <div className="p-6 md:p-8 rounded-3xl bg-slate-900/80 border border-slate-800 shadow-xl backdrop-blur-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="relative w-16 h-16 rounded-2xl overflow-hidden bg-slate-800 border-2 border-pink-500/30 shrink-0 shadow-md">
            {profile?.profile_picture ? (
              <img src={profile.profile_picture} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center font-bold text-2xl text-pink-400 bg-pink-500/10">
                {profile?.display_name?.charAt(0) || 'U'}
              </div>
            )}
            <span className="absolute bottom-1 right-1 w-3.5 h-3.5 bg-emerald-500 border-2 border-slate-900 rounded-full" />
          </div>

          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-white">{profile?.display_name}</h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-pink-500/10 border border-pink-500/20 text-pink-400">
                Active
              </span>
            </div>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xs text-slate-400 font-mono font-medium">
                ID: {profile?.profile_id}
              </span>
              <button
                onClick={copyId}
                className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
                title="Copy Profile ID"
              >
                {copiedId ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>
        </div>

        {/* Quick Action Buttons */}
        <div className="flex items-center gap-3 w-full sm:w-auto justify-start sm:justify-end">
          <Link
            to="/find"
            className="flex-1 sm:flex-none px-4 py-2.5 rounded-xl bg-gradient-to-r from-pink-500 to-indigo-600 hover:from-pink-600 hover:to-indigo-700 text-white text-xs font-bold shadow-md shadow-pink-500/20 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <UserPlus className="w-4 h-4" />
            <span>Find Friend</span>
          </Link>
          <Link
            to="/requests"
            className="relative px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <UserCheck className="w-4 h-4" />
            <span className="hidden sm:inline">Requests</span>
            {pendingRequestsCount > 0 && (
              <span className="w-5 h-5 rounded-full bg-pink-500 text-white text-[10px] font-bold flex items-center justify-center">
                {pendingRequestsCount}
              </span>
            )}
          </Link>
        </div>
      </div>

      {/* Conversations Section Header */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-pink-400" />
            <h3 className="text-lg font-bold text-white">Your Conversations</h3>
          </div>
          <Link
            to="/connections"
            className="text-xs text-slate-400 hover:text-pink-400 transition-colors flex items-center gap-1"
          >
            <Users className="w-3.5 h-3.5" />
            <span>View All Connections</span>
          </Link>
        </div>

        {/* Search Filter */}
        {conversations.length > 0 && (
          <div className="relative">
            <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="Search conversations..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-11 pr-4 py-3 rounded-2xl bg-slate-900/80 border border-slate-800 text-white placeholder-slate-500 text-xs focus:outline-none focus:border-pink-500"
            />
          </div>
        )}

        {/* Conversations List */}
        {isLoading ? (
          <div className="py-16 flex justify-center">
            <Loader />
          </div>
        ) : conversations.length === 0 ? (
          <div className="py-16 text-center rounded-3xl bg-slate-900/40 border border-slate-800/60 p-8 space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-slate-800/80 text-slate-500 flex items-center justify-center mx-auto">
              <MessageSquare className="w-6 h-6" />
            </div>
            <div>
              <h4 className="text-base font-semibold text-slate-300">No active conversations yet</h4>
              <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
                Find someone by Profile ID or share your link to start your first chat!
              </p>
            </div>
            <Link
              to="/find"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-pink-500 text-white text-xs font-bold shadow-md shadow-pink-500/20 hover:bg-pink-600 transition-all cursor-pointer"
            >
              <UserPlus className="w-4 h-4" />
              <span>Connect with Someone</span>
            </Link>
          </div>
        ) : (
          <div className="grid gap-2.5">
            {filteredConversations.map((conv) => (
              <div
                key={conv.id}
                onClick={() => {
                  cacheSet(`conv_detail_${conv.id}`, conv, 120);
                  navigate(`/chat/${conv.id}`, { state: { conversation: conv } });
                }}
                className="p-4 rounded-2xl bg-slate-900/80 hover:bg-slate-800/80 border border-slate-800/80 hover:border-slate-700/80 transition-all cursor-pointer flex items-center justify-between gap-4 backdrop-blur-sm group"
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="relative w-12 h-12 rounded-xl overflow-hidden bg-slate-800 border border-slate-700 shrink-0">
                    {conv.other_participant?.profile_picture ? (
                      <img
                        src={conv.other_participant.profile_picture}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center font-bold text-pink-400 bg-pink-500/10">
                        {conv.other_participant?.display_name?.charAt(0) || 'U'}
                      </div>
                    )}
                    {conv.other_participant?.is_online && (
                      <span className="absolute bottom-0.5 right-0.5 w-2.5 h-2.5 bg-emerald-500 border-2 border-slate-900 rounded-full" />
                    )}
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h4 className="font-bold text-sm text-white group-hover:text-pink-400 transition-colors truncate">
                        {conv.other_participant?.display_name}
                      </h4>
                      <span className="font-mono text-[11px] text-slate-500 font-semibold shrink-0">
                        {conv.other_participant?.profile_id}
                      </span>
                    </div>

                    <div className="text-xs text-slate-400 truncate mt-0.5 max-w-xs sm:max-w-md">
                      {conv.last_message ? (
                        conv.last_message.message_type === 'voice' ? (
                          <span className="inline-flex items-center gap-1.5 text-pink-400 font-medium">
                            <Mic className="w-3.5 h-3.5 shrink-0" />
                            <span>Voice message {conv.last_message.duration_seconds ? `(${conv.last_message.duration_seconds}s)` : ''}</span>
                          </span>
                        ) : (
                          conv.last_message.content || 'No messages yet'
                        )
                      ) : (
                        'No messages yet'
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex flex-col items-end gap-1.5 shrink-0">
                  <span className="text-[11px] text-slate-500">
                    {formatTime(conv.last_message?.created_at || conv.updated_at)}
                  </span>
                  {conv.unread_count > 0 && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-pink-500 text-white">
                      {conv.unread_count}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default HomeDashboard;
