import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Users, MessageSquare, Search, UserPlus } from 'lucide-react';
import { connectService } from '../services/connectService';
import { wsService } from '../services/websocketService';
import { cacheGet, cacheSet } from '../utils/cache';
import Loader from '../components/Loader';

export const ConnectedProfiles = () => {
  const [connections, setConnections] = useState(() => cacheGet('connected_profiles') || []);
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(() => !cacheGet('connected_profiles'));
  const navigate = useNavigate();

  const fetchConnections = async (silent = false) => {
    if (!silent && !cacheGet('connected_profiles')) {
      setIsLoading(true);
    }
    try {
      const res = await connectService.getConnectedProfiles();
      if (res.success) {
        const list = res.connections || [];
        setConnections(list);
        cacheSet('connected_profiles', list, 120);
      }
    } catch (err) {
      console.error('Error fetching connections:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const hasCache = Boolean(cacheGet('connected_profiles'));
    fetchConnections(hasCache);

    // Real-time presence update
    const unsubPresence = wsService.on('presence_update', (event) => {
      setConnections((prev) => {
        const updated = prev.map((c) => {
          if (c.profile?.profile_id === event.profile_id) {
            return {
              ...c,
              profile: {
                ...c.profile,
                is_online: event.is_online,
                last_seen: event.last_seen,
              },
            };
          }
          return c;
        });
        cacheSet('connected_profiles', updated, 120);
        return updated;
      });
    });

    return () => unsubPresence();
  }, []);

  const filtered = connections.filter((c) => {
    const q = search.toLowerCase();
    const name = c.profile?.display_name?.toLowerCase() || '';
    const id = c.profile?.profile_id?.toLowerCase() || '';
    return name.includes(q) || id.includes(q);
  });

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Connected Profiles</h1>
          <p className="text-sm text-slate-400">People you are connected with on LYNQO</p>
        </div>

        <Link
          to="/find"
          className="px-4 py-2.5 rounded-xl bg-pink-500 hover:bg-pink-600 text-white text-xs font-bold transition-all shadow-md shadow-pink-500/20 flex items-center gap-2 self-start sm:self-auto cursor-pointer"
        >
          <UserPlus className="w-4 h-4" />
          <span>Find More People</span>
        </Link>
      </div>

      {/* Search Filter */}
      {connections.length > 0 && (
        <div className="relative">
          <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            placeholder="Filter connections by name or ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-11 pr-4 py-3 rounded-2xl bg-slate-900/80 border border-slate-800 text-white placeholder-slate-500 text-xs focus:outline-none focus:border-pink-500"
          />
        </div>
      )}

      {/* Connections List */}
      {isLoading ? (
        <div className="py-16 flex justify-center">
          <Loader />
        </div>
      ) : connections.length === 0 ? (
        <div className="py-16 text-center rounded-3xl bg-slate-900/40 border border-slate-800/60 p-8 space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-slate-800/80 text-slate-500 flex items-center justify-center mx-auto">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-slate-300">No connections yet</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
              Find someone using their Profile ID or share your link to start connecting.
            </p>
          </div>
          <Link
            to="/find"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-pink-500 text-white text-xs font-bold shadow-md shadow-pink-500/20 hover:bg-pink-600 transition-all cursor-pointer"
          >
            <UserPlus className="w-4 h-4" />
            <span>Search Profiles</span>
          </Link>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {filtered.map((item) => (
            <div
              key={item.profile.profile_id}
              className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 flex items-center justify-between gap-3 backdrop-blur-sm hover:border-slate-700 transition-all"
            >
              <div className="flex items-center gap-3 truncate">
                <div className="relative w-12 h-12 rounded-xl overflow-hidden bg-slate-800 border border-slate-700 shrink-0">
                  {item.profile.profile_picture ? (
                    <img src={item.profile.profile_picture} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center font-bold text-pink-400 bg-pink-500/10">
                      {item.profile.display_name?.charAt(0) || 'U'}
                    </div>
                  )}
                  {item.profile.is_online && (
                    <span className="absolute bottom-0.5 right-0.5 w-2.5 h-2.5 bg-emerald-500 border-2 border-slate-900 rounded-full" />
                  )}
                </div>

                <div className="truncate">
                  <h4 className="font-bold text-sm text-white truncate">{item.profile.display_name}</h4>
                  <div className="flex items-center gap-1.5 text-xs">
                    <span className="font-mono text-pink-400 font-semibold">{item.profile.profile_id}</span>
                    <span className="text-slate-500">•</span>
                    <span className={item.profile.is_online ? 'text-emerald-400' : 'text-slate-500'}>
                      {item.profile.is_online ? 'Online' : 'Offline'}
                    </span>
                  </div>
                </div>
              </div>

              <button
                onClick={() => navigate(`/chat/${item.conversation_id}`)}
                className="p-2.5 rounded-xl bg-pink-500/10 hover:bg-pink-500/20 text-pink-400 border border-pink-500/20 transition-colors flex items-center gap-1.5 text-xs font-semibold shrink-0 cursor-pointer"
              >
                <MessageSquare className="w-4 h-4" />
                <span className="hidden sm:inline">Message</span>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ConnectedProfiles;
