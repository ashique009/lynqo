import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { UserCheck, UserX, Clock, ArrowUpRight, ArrowDownLeft, Check, X, MessageSquare } from 'lucide-react';
import { connectService } from '../services/connectService';
import { wsService } from '../services/websocketService';
import { useToast } from '../context/ToastContext';
import { cacheGet, cacheSet } from '../utils/cache';
import Loader from '../components/Loader';

export const ConnectRequests = () => {
  const [activeTab, setActiveTab] = useState('incoming');
  const [incoming, setIncoming] = useState(() => cacheGet('requests_incoming') || []);
  const [outgoing, setOutgoing] = useState(() => cacheGet('requests_outgoing') || []);
  const [isLoading, setIsLoading] = useState(() => !cacheGet('requests_incoming'));
  const [processingId, setProcessingId] = useState(null);

  const { showToast } = useToast();
  const navigate = useNavigate();

  const fetchRequests = async (silent = false) => {
    if (!silent && !cacheGet('requests_incoming')) {
      setIsLoading(true);
    }
    try {
      const [inRes, outRes] = await Promise.all([
        connectService.getIncomingRequests(),
        connectService.getOutgoingRequests(),
      ]);
      if (inRes.success) {
        const inList = inRes.requests || [];
        setIncoming(inList);
        cacheSet('requests_incoming', inList, 120);
      }
      if (outRes.success) {
        const outList = outRes.requests || [];
        setOutgoing(outList);
        cacheSet('requests_outgoing', outList, 120);
      }
    } catch (err) {
      console.error('Error fetching requests:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const hasCache = Boolean(cacheGet('requests_incoming'));
    fetchRequests(hasCache);

    // Listen for real-time connection events
    const unsub = wsService.on('connection_event', () => {
      fetchRequests(true);
    });

    return () => unsub();
  }, []);

  const handleAccept = async (requestId) => {
    setProcessingId(requestId);
    try {
      const res = await connectService.acceptRequest(requestId);
      if (res.success) {
        showToast('Connection accepted!', 'success');
        setIncoming((prev) => prev.filter((r) => r.id !== requestId));
        if (res.conversation_id) {
          navigate(`/chat/${res.conversation_id}`);
        }
      } else {
        showToast(res.message || 'Failed to accept request.', 'error');
      }
    } catch (err) {
      showToast(err.message || 'Error accepting request.', 'error');
    } finally {
      setProcessingId(null);
    }
  };

  const handleDecline = async (requestId) => {
    setProcessingId(requestId);
    try {
      const res = await connectService.declineRequest(requestId);
      if (res.success) {
        showToast('Connection request declined.', 'info');
        setIncoming((prev) => prev.filter((r) => r.id !== requestId));
      }
    } catch (err) {
      showToast(err.message || 'Error declining request.', 'error');
    } finally {
      setProcessingId(null);
    }
  };

  const handleCancel = async (requestId) => {
    setProcessingId(requestId);
    try {
      const res = await connectService.cancelRequest(requestId);
      if (res.success) {
        showToast('Connection request cancelled.', 'info');
        setOutgoing((prev) => prev.filter((r) => r.id !== requestId));
      }
    } catch (err) {
      showToast(err.message || 'Error cancelling request.', 'error');
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Connection Requests</h1>
          <p className="text-sm text-slate-400">Manage your pending incoming and outgoing connection invitations</p>
        </div>

        {/* Tabs */}
        <div className="flex p-1 rounded-2xl bg-slate-900 border border-slate-800 self-start sm:self-auto">
          <button
            onClick={() => setActiveTab('incoming')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'incoming'
                ? 'bg-pink-500 text-white shadow-md shadow-pink-500/20'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <ArrowDownLeft className="w-3.5 h-3.5" />
            <span>Incoming</span>
            {incoming.length > 0 && (
              <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${activeTab === 'incoming' ? 'bg-white text-pink-500' : 'bg-pink-500 text-white'}`}>
                {incoming.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('outgoing')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'outgoing'
                ? 'bg-pink-500 text-white shadow-md shadow-pink-500/20'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <ArrowUpRight className="w-3.5 h-3.5" />
            <span>Outgoing</span>
            {outgoing.length > 0 && (
              <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${activeTab === 'outgoing' ? 'bg-white text-pink-500' : 'bg-slate-800 text-slate-300'}`}>
                {outgoing.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="py-16 flex justify-center">
          <Loader />
        </div>
      ) : activeTab === 'incoming' ? (
        /* Incoming List */
        incoming.length === 0 ? (
          <div className="py-16 text-center rounded-3xl bg-slate-900/40 border border-slate-800/60 p-8 space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-slate-800/80 text-slate-500 flex items-center justify-center mx-auto">
              <UserCheck className="w-6 h-6" />
            </div>
            <h3 className="text-base font-semibold text-slate-300">No incoming connection requests</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              When someone searches for your Profile ID and sends a request, it will appear here.
            </p>
          </div>
        ) : (
          <div className="grid gap-3">
            {incoming.map((req) => (
              <div
                key={req.id}
                className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
              >
                <div className="flex items-center gap-3.5">
                  <div className="w-12 h-12 rounded-xl overflow-hidden bg-slate-800 border border-slate-700 shrink-0">
                    {req.sender?.profile_picture ? (
                      <img src={req.sender.profile_picture} alt="" width="48" height="48" loading="lazy" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center font-bold text-pink-400 bg-pink-500/10">
                        {req.sender?.display_name?.charAt(0) || 'U'}
                      </div>
                    )}
                  </div>
                  <div>
                    <h4 className="font-bold text-sm text-white">{req.sender?.display_name}</h4>
                    <span className="font-mono text-xs accent-gradient-text font-semibold">{req.sender?.profile_id}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                  <button
                    onClick={() => handleDecline(req.id)}
                    disabled={processingId === req.id}
                    className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                    <span>Decline</span>
                  </button>
                  <button
                    onClick={() => handleAccept(req.id)}
                    disabled={processingId === req.id}
                    className="px-5 py-2 rounded-xl bg-gradient-to-r from-[#8B68F6] to-[#EC6EB8] hover:opacity-95 text-white text-xs font-bold transition-all shadow-md shadow-[#8B68F6]/25 flex items-center gap-1.5 cursor-pointer"
                  >
                    <Check className="w-4 h-4" />
                    <span>Accept</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )
      ) : (
        /* Outgoing List */
        outgoing.length === 0 ? (
          <div className="py-16 text-center rounded-3xl bg-slate-900/40 border border-slate-800/60 p-8 space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-slate-800/80 text-slate-500 flex items-center justify-center mx-auto">
              <Clock className="w-6 h-6" />
            </div>
            <h3 className="text-base font-semibold text-slate-300">No pending sent requests</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              Requests you send to others that haven't been accepted yet will appear here.
            </p>
          </div>
        ) : (
          <div className="grid gap-3">
            {outgoing.map((req) => (
              <div
                key={req.id}
                className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
              >
                <div className="flex items-center gap-3.5">
                  <div className="w-12 h-12 rounded-xl overflow-hidden bg-slate-800 border border-slate-700 shrink-0">
                    {req.receiver?.profile_picture ? (
                      <img src={req.receiver.profile_picture} alt="" width="48" height="48" loading="lazy" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center font-bold text-indigo-400 bg-indigo-500/10">
                        {req.receiver?.display_name?.charAt(0) || 'U'}
                      </div>
                    )}
                  </div>
                  <div>
                    <h4 className="font-bold text-sm text-white">{req.receiver?.display_name}</h4>
                    <span className="font-mono text-xs text-indigo-400 font-semibold">{req.receiver?.profile_id}</span>
                  </div>
                </div>

                <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
                  <span className="text-xs text-amber-400 flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" />
                    Pending
                  </span>
                  <button
                    onClick={() => handleCancel(req.id)}
                    disabled={processingId === req.id}
                    className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-rose-500/20 text-slate-300 hover:text-rose-400 text-xs font-semibold transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
};

export default ConnectRequests;
