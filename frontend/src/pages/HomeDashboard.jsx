import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  MessageSquare, UserPlus, Users, Search, Copy, Check,
  Sparkles, CheckCheck, Clock, UserCheck, Mic, ImageIcon
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { chatService } from '../services/chatService';
import { connectService } from '../services/connectService';
import { wsService } from '../services/websocketService';
import { cacheGet, cacheSet } from '../utils/cache';
import { mergeConversations } from '../utils/conversationUtils';
import { getOptimizedImageUrl } from '../utils/imageUtils';
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
  const lastFetchTimeRef = React.useRef(0);

  const loadData = async (silent = false) => {
    const now = Date.now();
    if (silent && now - lastFetchTimeRef.current < 10000) {
      return; // Skip background refetch if fresh within 10s
    }
    lastFetchTimeRef.current = now;

    if (!silent && !cacheGet('dashboard_conversations')) {
      setIsLoading(true);
    }
    try {
      const convRes = await chatService.getConversations();
      if (convRes.success) {
        const convList = convRes.conversations || [];
        setConversations((prev) => {
          const merged = mergeConversations(prev, convList);
          cacheSet('dashboard_conversations', merged, 120);
          return merged;
        });
        // Background prefetch messages for the most recent conversation for instant tap-to-open
        if (convList.length > 0) {
          const topConvId = convList[0].id;
          if (!cacheGet(`conv_msgs_${topConvId}`)) {
            chatService.getMessages(topConvId, { limit: 50 }).then((msgRes) => {
              if (msgRes.success) {
                cacheSet(`conv_msgs_${topConvId}`, msgRes.messages || [], 60);
              }
            }).catch(() => {});
          }
        }
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
    <div className="space-y-5 max-w-3xl mx-auto">
      {/* Profile Card */}
      <div className="p-4 sm:p-6 rounded-2xl bg-[#111827] border border-white/[0.08] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="relative w-14 h-14 rounded-full overflow-hidden bg-[#1E293B] border border-white/[0.12] shrink-0">
            {profile?.profile_picture ? (
              <img
                src={getOptimizedImageUrl(profile.profile_picture, { width: 128, height: 128 })}
                alt=""
                className="w-full h-full object-cover"
                loading="lazy"
                decoding="async"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center font-semibold text-xl text-[#F472B6] bg-[#7957F5]/15">
                {profile?.display_name?.charAt(0) || 'U'}
              </div>
            )}
            <span className="absolute bottom-0.5 right-0.5 w-3 h-3 bg-emerald-500 border-2 border-[#111827] rounded-full" />
          </div>

          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold text-[#F1F5F9]">{profile?.display_name}</h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                Active
              </span>
            </div>
            <div className="flex items-center gap-1 mt-0.5">
              <span className="text-xs text-[#94A3B8] font-mono">
                {profile?.profile_id}
              </span>
              <button
                type="button"
                onClick={copyId}
                className="min-w-[44px] min-h-[44px] -my-2 flex items-center justify-center rounded-xl hover:bg-[#1E293B] text-[#94A3B8] hover:text-[#F1F5F9] transition-colors active:scale-95 cursor-pointer"
                title="Copy Profile ID"
                aria-label="Copy Profile ID"
              >
                {copiedId ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>

        {/* Quick Action Button */}
        <div className="flex items-center gap-3 w-full sm:w-auto justify-start sm:justify-end">
          <Link
            to="/find"
            className="flex-1 sm:flex-none min-h-[44px] px-4 py-2.5 rounded-xl bg-[#7957F5] hover:bg-[#6340E0] active:scale-[0.98] text-white text-xs font-semibold transition-all flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <UserPlus className="w-4 h-4" />
            <span>New Chat</span>
          </Link>
        </div>
      </div>

      {/* Conversations Section Header */}
      <div className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-[#7957F5]" />
            <h3 className="text-base font-semibold text-[#F1F5F9]">Chats</h3>
          </div>
          <Link
            to="/connections"
            className="min-h-[44px] px-2 text-xs text-[#94A3B8] hover:text-[#F1F5F9] transition-colors flex items-center gap-1.5"
          >
            <Users className="w-3.5 h-3.5" />
            <span>Connections</span>
          </Link>
        </div>

        {/* Search Filter (16px on mobile to prevent iOS zoom) */}
        {conversations.length > 0 && (
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#94A3B8]" />
            <input
              type="text"
              placeholder="Search chats..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 min-h-[44px] rounded-xl bg-[#111827] border border-white/[0.08] text-[#F1F5F9] placeholder-[#94A3B8] text-base md:text-sm focus:outline-none focus:border-[#7957F5] transition-colors"
            />
          </div>
        )}

        {/* Conversations List */}
        {isLoading ? (
          <div className="space-y-2 animate-pulse" role="status" aria-label="Loading conversations">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="p-3.5 rounded-2xl bg-[#111827] border border-white/[0.06] flex items-center gap-3.5">
                <div className="w-12 h-12 rounded-full bg-[#1E293B] shrink-0" />
                <div className="flex-grow space-y-2">
                  <div className="h-3.5 w-32 bg-[#1E293B] rounded-full" />
                  <div className="h-3 w-48 bg-[#1E293B]/70 rounded-full" />
                </div>
              </div>
            ))}
          </div>
        ) : conversations.length === 0 ? (
          <div className="py-12 text-center rounded-2xl bg-[#111827] border border-white/[0.08] p-6 space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-[#1E293B] text-[#7957F5] flex items-center justify-center mx-auto">
              <MessageSquare className="w-6 h-6" />
            </div>
            <div>
              <h4 className="text-base font-semibold text-[#F1F5F9]">No chats yet</h4>
              <p className="text-xs text-[#94A3B8] max-w-sm mx-auto mt-1">
                Find someone by Profile ID to start your first conversation.
              </p>
            </div>
            <Link
              to="/find"
              className="inline-flex items-center justify-center gap-2 min-h-[44px] px-5 py-2.5 rounded-xl bg-[#7957F5] text-white text-xs font-semibold hover:bg-[#6340E0] active:scale-[0.98] transition-all cursor-pointer"
            >
              <UserPlus className="w-4 h-4" />
              <span>Find Someone</span>
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-white/[0.06] rounded-2xl bg-[#111827] border border-white/[0.08] overflow-hidden">
            {filteredConversations.map((conv) => (
              <div
                key={conv.id}
                onClick={() => {
                  cacheSet(`conv_detail_${conv.id}`, conv, 120);
                  navigate(`/chat/${conv.id}`, { state: { conversation: conv } });
                }}
                className="px-4 py-3.5 hover:bg-[#1E293B]/60 active:bg-[#1E293B] transition-colors cursor-pointer flex items-center justify-between gap-3.5 group"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="relative w-12 h-12 rounded-full overflow-hidden bg-[#1E293B] border border-white/[0.08] shrink-0">
                    {conv.other_participant?.profile_picture ? (
                      <img
                        src={getOptimizedImageUrl(conv.other_participant.profile_picture, { width: 96, height: 96 })}
                        alt=""
                        className="w-full h-full object-cover"
                        loading="lazy"
                        decoding="async"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center font-semibold text-[#F472B6] bg-[#7957F5]/15">
                        {conv.other_participant?.display_name?.charAt(0) || 'U'}
                      </div>
                    )}
                    {conv.other_participant?.is_online && (
                      <span className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 border-2 border-[#111827] rounded-full" />
                    )}
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h4 className="font-semibold text-[15px] text-[#F1F5F9] group-hover:text-[#9B80F8] transition-colors truncate">
                        {conv.other_participant?.display_name}
                      </h4>
                      <span className="font-mono text-[10px] text-[#94A3B8] shrink-0">
                        {conv.other_participant?.profile_id}
                      </span>
                    </div>

                    <div className="text-[13px] text-[#94A3B8] truncate mt-0.5 max-w-[200px] sm:max-w-md">
                      {conv.last_message ? (
                        conv.last_message.message_type === 'voice' ? (
                          <span className="inline-flex items-center gap-1.5 text-[#F472B6] font-medium">
                            <Mic className="w-3.5 h-3.5 shrink-0" />
                            <span>Voice message {conv.last_message.duration_seconds ? `(${conv.last_message.duration_seconds}s)` : ''}</span>
                          </span>
                        ) : conv.last_message.message_type === 'image' ? (
                          <span className="inline-flex items-center gap-1.5 text-[#F472B6] font-medium">
                            <ImageIcon className="w-3.5 h-3.5 shrink-0" />
                            <span>Photo</span>
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
                  <span className="text-[11px] text-[#94A3B8] tabular-nums">
                    {formatTime(conv.last_message?.created_at || conv.updated_at)}
                  </span>
                  {conv.unread_count > 0 && (
                    <span className="min-w-[20px] h-5 px-1.5 rounded-full text-[11px] font-semibold bg-[#7957F5] text-white flex items-center justify-center tabular-nums">
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
