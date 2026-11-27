import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  MessageSquare, UserPlus, Users, Search, Copy, Check,
  Plus, ChevronRight, Mic, ImageIcon
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
  const [isWsConnected, setIsWsConnected] = useState(wsService.isConnected);
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
        // Background prefetch Chat chunk & top conversation messages during idle time
        if (convList.length > 0) {
          const topConvId = convList[0].id;
          const schedulePrefetch = typeof window !== 'undefined' && 'requestIdleCallback' in window
            ? (fn) => window.requestIdleCallback(fn, { timeout: 1200 })
            : (fn) => setTimeout(fn, 350);
          schedulePrefetch(() => {
            import('./Chat').catch(() => {});
            if (!cacheGet(`conv_msgs_${topConvId}`)) {
              chatService.getMessages(topConvId, { limit: 50, mark_read: false }).then((msgRes) => {
                if (msgRes.success) {
                  cacheSet(`conv_msgs_${topConvId}`, msgRes.messages || [], 60);
                }
              }).catch(() => {});
            }
          });
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

    const unsubStatus = wsService.on('connection_status', (data) => {
      setIsWsConnected(Boolean(data?.isConnected));
    });

    return () => {
      unsubConv();
      unsubPresence();
      unsubConn();
      unsubStatus();
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
    <div className="space-y-6 max-w-3xl mx-auto pb-8">
      {/* Liquid Glass Profile Card */}
      <div className="liquid-glass-card rounded-[26px] p-5 flex flex-col gap-4">
        <div className="flex items-center gap-4">
          <div className="relative w-16 h-16 rounded-full bg-gradient-to-br from-[#8B68F6] to-[#EC6EB8] p-[2px] shrink-0 shadow-[0_4px_16px_rgba(139,104,246,0.3)]">
            <div className="w-full h-full rounded-full overflow-hidden bg-gradient-to-br from-[#8B68F6] to-[#EC6EB8] flex items-center justify-center">
              {profile?.profile_picture ? (
                <img
                  src={getOptimizedImageUrl(profile.profile_picture, { width: 128, height: 128 })}
                  alt=""
                  width="64"
                  height="64"
                  className="w-full h-full object-cover"
                  loading="lazy"
                  decoding="async"
                />
              ) : (
                <span className="font-bold text-2xl text-white">
                  {profile?.display_name?.charAt(0) || 'U'}
                </span>
              )}
            </div>
            <span
              className={`absolute bottom-0.5 right-0.5 w-3.5 h-3.5 border-[2.5px] border-[#1A1328] rounded-full ${
                isWsConnected ? 'bg-emerald-400' : 'bg-amber-400'
              }`}
            />
          </div>

          <div className="min-w-0 flex-grow">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h2 className="text-[22px] font-bold text-white leading-tight truncate">
                {profile?.display_name}
              </h2>
              <span
                className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${
                  isWsConnected
                    ? 'bg-emerald-500/15 border-emerald-400/30 text-emerald-300'
                    : 'bg-amber-500/15 border-amber-400/30 text-amber-300'
                }`}
              >
                {isWsConnected ? 'Active' : 'Offline'}
              </span>
            </div>

            <div className="flex items-center gap-1 mt-1">
              <span className="text-[13px] text-[#B8ABC7] font-mono tracking-wider">
                {profile?.profile_id}
              </span>
              <button
                type="button"
                onClick={copyId}
                className="min-w-[44px] min-h-[44px] -my-2.5 flex items-center justify-center rounded-full hover:bg-white/10 text-[#B8ABC7] hover:text-white transition-colors active:scale-95 cursor-pointer"
                title="Copy Profile ID"
                aria-label="Copy Profile ID"
              >
                {copiedId ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>

        {/* Full-Width New Chat CTA */}
        <Link
          to="/find"
          className="liquid-glass-new-chat w-full min-h-[48px] px-5 py-3 rounded-[20px] text-white text-[15px] font-semibold transition-transform active:scale-[0.98] flex items-center justify-center gap-2 cursor-pointer"
        >
          <Plus className="w-5 h-5" />
          <span>New Chat</span>
        </Link>
      </div>

      {/* Chats Section */}
      <div className="space-y-3.5">
        <div className="flex items-center justify-between px-0.5">
          <h3 className="text-[20px] font-bold text-white tracking-tight">Chats</h3>
          <Link
            to="/connections"
            className="min-h-[44px] pl-3 pr-1 text-[14px] font-medium text-[#C4B8D4] hover:text-white transition-colors flex items-center gap-1"
          >
            <span>Connections</span>
            <ChevronRight className="w-4 h-4" />
          </Link>
        </div>

        {/* Liquid Glass Search Field (16px to prevent iOS zoom) */}
        <div className="relative">
          <Search className="w-[18px] h-[18px] absolute left-4 top-1/2 -translate-y-1/2 text-[#A99BB8] pointer-events-none z-10" />
          <input
            type="text"
            placeholder="Search chats"
            aria-label="Search chats"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="liquid-glass-pill w-full pl-11 pr-4 py-3 min-h-[48px] rounded-[22px] text-white placeholder-[#9E90B0] text-[16px] focus:outline-none focus:border-white/40 transition-colors"
          />
        </div>

        {/* Conversation Cards */}
        {isLoading ? (
          <div className="space-y-3 animate-pulse" role="status" aria-label="Loading conversations">
            {[1, 2, 3].map((i) => (
              <div key={i} className="liquid-glass-card p-3.5 rounded-[22px] flex items-center gap-3.5">
                <div className="w-12 h-12 rounded-full bg-white/10 shrink-0" />
                <div className="flex-grow space-y-2">
                  <div className="h-4 w-32 bg-white/10 rounded-full" />
                  <div className="h-3.5 w-48 bg-white/5 rounded-full" />
                </div>
              </div>
            ))}
          </div>
        ) : conversations.length === 0 ? (
          <div className="liquid-glass-card py-12 text-center rounded-[24px] p-6 space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-white/10 text-[#C4B5FD] flex items-center justify-center mx-auto">
              <MessageSquare className="w-6 h-6" />
            </div>
            <div>
              <h4 className="text-base font-semibold text-white">No chats yet</h4>
              <p className="text-xs text-[#B8ABC7] max-w-sm mx-auto mt-1">
                Find someone by Profile ID to start your first conversation.
              </p>
            </div>
            <Link
              to="/find"
              className="liquid-glass-new-chat inline-flex items-center justify-center gap-2 min-h-[44px] px-5 py-2.5 rounded-2xl text-white text-xs font-semibold active:scale-[0.98] transition-transform cursor-pointer"
            >
              <UserPlus className="w-4 h-4" />
              <span>Find Someone</span>
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredConversations.map((conv) => (
              <div
                key={conv.id}
                onPointerDown={() => {
                  if (!cacheGet(`conv_msgs_${conv.id}`)) {
                    chatService.getMessages(conv.id, { limit: 50, mark_read: false }).then((msgRes) => {
                      if (msgRes.success) {
                        cacheSet(`conv_msgs_${conv.id}`, msgRes.messages || [], 60);
                      }
                    }).catch(() => {});
                  }
                }}
                onClick={() => {
                  cacheSet(`conv_detail_${conv.id}`, conv, 120);
                  navigate(`/chat/${conv.id}`, { state: { conversation: conv } });
                }}
                className="liquid-glass-card px-4 py-3.5 rounded-[22px] hover:border-white/25 active:scale-[0.985] transition-transform duration-150 cursor-pointer flex items-center justify-between gap-3.5 group"
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="relative w-12 h-12 shrink-0">
                    <div className="w-full h-full rounded-full overflow-hidden bg-gradient-to-br from-[#8B68F6] to-[#EC6EB8]">
                      {conv.other_participant?.profile_picture ? (
                        <img
                          src={getOptimizedImageUrl(conv.other_participant.profile_picture, { width: 96, height: 96 })}
                          alt=""
                          width="48"
                          height="48"
                          className="w-full h-full object-cover"
                          loading="lazy"
                          decoding="async"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center font-bold text-lg text-white">
                          {conv.other_participant?.display_name?.charAt(0) || 'U'}
                        </div>
                      )}
                    </div>
                    {conv.other_participant?.is_online && (
                      <span className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-emerald-400 border-2 border-[#1A1328] rounded-full" />
                    )}
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h4 className="font-semibold text-[17px] leading-snug text-white truncate">
                        {conv.other_participant?.display_name}
                      </h4>
                      <span className="font-mono text-[12px] text-[#A99BB8] shrink-0">
                        {conv.other_participant?.profile_id}
                      </span>
                    </div>

                    <div className="text-[15px] text-[#C4B8D4] truncate mt-0.5 max-w-[200px] sm:max-w-md">
                      {conv.last_message ? (
                        conv.last_message.message_type === 'voice' ? (
                          <span className="inline-flex items-center gap-1.5 text-[#E88CC8] font-medium">
                            <Mic className="w-4 h-4 shrink-0" />
                            <span>Voice message {conv.last_message.duration_seconds ? `(${conv.last_message.duration_seconds}s)` : ''}</span>
                          </span>
                        ) : conv.last_message.message_type === 'image' ? (
                          <span className="inline-flex items-center gap-1.5 text-[#E88CC8] font-medium">
                            <ImageIcon className="w-4 h-4 shrink-0" />
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
                  <span className="text-[12px] text-[#A99BB8] tabular-nums">
                    {formatTime(conv.last_message?.created_at || conv.updated_at)}
                  </span>
                  {conv.unread_count > 0 && (
                    <span className="min-w-[22px] h-[22px] px-1.5 rounded-full text-[12px] font-bold bg-[#7957F5] text-white flex items-center justify-center tabular-nums shadow-xs">
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
