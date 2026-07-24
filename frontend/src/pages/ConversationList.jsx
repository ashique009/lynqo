import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { chatService } from '../services/chatService';
import { authService } from '../services/authService';
import { useToast } from '../context/ToastContext';
import Loader from '../components/Loader';
import EmptyState from '../components/EmptyState';
import { MessageSquare, MessageCircle, ChevronRight } from 'lucide-react';
import { motion } from 'framer-motion';

export const ConversationList = () => {
  const [conversations, setConversations] = useState([]);
  const [onlineStatuses, setOnlineStatuses] = useState({});
  const [loading, setLoading] = useState(true);
  const { showToast } = useToast();

  useEffect(() => {
    const fetchConversations = async () => {
      try {
        const response = await chatService.getConversations();
        if (response.success && response.data) {
          setConversations(response.data);

          // Fetch online statuses in parallel for participants
          response.data.forEach(async (convo) => {
            const partnerId = convo.other_participant?.id;
            if (partnerId) {
              try {
                const statusRes = await authService.getOnlineStatus(partnerId);
                if (statusRes?.success && statusRes.data) {
                  setOnlineStatuses((prev) => ({
                    ...prev,
                    [partnerId]: statusRes.data.is_online,
                  }));
                }
              } catch (e) {
                // Ignore silent background status fetch error
              }
            }
          });
        }
      } catch (err) {
        showToast('Failed to fetch conversation list.', 'error');
      } finally {
        setLoading(false);
      }
    };
    fetchConversations();
  }, [showToast]);

  const formatMessageTime = (isoString) => {
    if (!isoString) return '';
    const date = new Date(isoString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  if (loading) {
    return <Loader />;
  }

  return (
    <div className="space-y-6 text-left max-w-2xl mx-auto">
      <div>
        <h2 className="text-2xl font-extrabold font-display text-[#2C2C2A] dark:text-slate-100 flex items-center gap-2">
          <MessageCircle className="w-6 h-6 text-[#D4537E] dark:text-brand-purple-light" />
          <span>Conversations</span>
        </h2>
        <p className="text-[#5F5E5A] dark:text-slate-400 text-xs mt-1">
          Chat securely with approved connection matches.
        </p>
      </div>

      {conversations.length === 0 ? (
        <EmptyState
          icon={MessageSquare}
          title="No Conversations Yet"
          description="You haven't matched or opened any chat channels yet. Accept incoming invitations or invite suggestions to get matching!"
          actionText="Discover Suggestions"
          actionLink="/suggestions"
        />
      ) : (
        <div className="flex flex-col gap-3">
          {conversations.map((convo, index) => {
            const partner = convo.other_participant || {};
            const lastMsg = convo.last_message;
            const isOnline = onlineStatuses[partner.id];

            return (
              <motion.div
                key={convo.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: index * 0.05 }}
              >
                <Link
                  to={`/chat/${convo.id}`}
                  className="glass-panel p-4 rounded-xl border border-[#F4C0D1] dark:border-brand-purple/10 flex items-center justify-between gap-4 bg-white dark:bg-brand-dark/15 hover:border-[#D4537E]/40 dark:hover:border-brand-purple/35 hover:bg-[#D4537E]/5 dark:hover:bg-brand-purple/5 transition-all duration-300 group cursor-pointer shadow-md"
                >
                  <div className="flex items-center gap-3.5 min-w-0 flex-grow">
                    <div className="relative flex-shrink-0">
                      <div className="w-11 h-11 rounded-full bg-[#D4537E]/15 dark:bg-brand-purple/15 flex items-center justify-center border border-[#D4537E]/30 dark:border-brand-purple/25 text-[#D4537E] dark:text-brand-purple-light text-sm font-extrabold uppercase">
                        {partner.username ? partner.username.substring(0, 2) : 'CK'}
                      </div>
                      {isOnline && (
                        <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-slate-950" />
                      )}
                    </div>

                    <div className="min-w-0 flex-grow">
                      <div className="flex justify-between items-baseline gap-2">
                        <h4 className="font-bold text-sm text-[#2C2C2A] dark:text-slate-200 group-hover:text-[#D4537E] dark:group-hover:text-brand-purple-light transition-colors truncate">
                          {partner.full_name || partner.username}
                        </h4>
                        {lastMsg && (
                          <span className="text-[10px] text-[#5F5E5A] dark:text-slate-500 font-semibold flex-shrink-0">
                            {formatMessageTime(lastMsg.created_at)}
                          </span>
                        )}
                      </div>
                      
                      <p className="text-xs text-[#5F5E5A] dark:text-slate-400 font-medium truncate mt-1">
                        {lastMsg ? (
                          <span>
                            <strong className="text-[#5F5E5A] dark:text-slate-500 font-bold">
                              {lastMsg.sender === partner.username ? 'They: ' : 'You: '}
                            </strong>
                            {lastMsg.content}
                          </span>
                        ) : (
                          <span className="text-[#5F5E5A] dark:text-slate-500 italic">No messages sent yet. Say hello!</span>
                        )}
                      </p>
                    </div>
                  </div>

                  <ChevronRight className="w-5 h-5 text-[#5F5E5A] dark:text-slate-500 group-hover:text-[#2C2C2A] dark:group-hover:text-slate-300 transition-colors flex-shrink-0" />
                </Link>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ConversationList;
