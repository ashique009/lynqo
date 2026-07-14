import { useEffect, useState } from 'react';
import { getUsers, banUser, unbanUser, deleteUser } from '../services/adminService';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Trash2, ShieldAlert, ShieldCheck, Mail, MapPin, AlertCircle, Phone, Calendar } from 'lucide-react';
import { API_BASE_URL } from '../api/client';

export default function AdminUsers() {
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [genderFilter, setGenderFilter] = useState('all');

  const fetchUsers = async () => {
    const params = {};
    if (search) params.search = search;
    if (statusFilter !== 'all') params.status = statusFilter;
    if (genderFilter !== 'all') params.gender = genderFilter;

    const res = await getUsers(params);
    if (res.success) setUsers(res.data);
  };

  useEffect(() => {
    fetchUsers();
  }, [search, statusFilter, genderFilter]);

  const handleBan = async (id) => {
    await banUser(id);
    fetchUsers();
  };

  const handleUnban = async (id) => {
    await unbanUser(id);
    fetchUsers();
  };

  const handleDelete = async (id) => {
    if (window.confirm('Delete this user permanently?')) {
      await deleteUser(id);
      fetchUsers();
    }
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.03 }
    }
  };

  const rowVariants = {
    hidden: { opacity: 0, y: 8 },
    show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 300, damping: 25 } }
  };

  const getAvatarUrl = (pic) => {
    if (!pic) return null;
    if (pic.startsWith('http')) return pic;
    return `${API_BASE_URL}${pic}`;
  };

  const formatJoinedDate = (d) => {
    if (!d) return '-';
    return new Date(d).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  };

  const getGenderBadge = (g) => {
    switch (g) {
      case 'M':
        return <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">Male</span>;
      case 'F':
        return <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold bg-pink-500/10 text-pink-400 border border-pink-500/20">Female</span>;
      case 'O':
        return <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold bg-teal-500/10 text-teal-400 border border-teal-500/20">Other</span>;
      default:
        return <span className="text-slate-500 text-xs italic">Not Specified</span>;
    }
  };

  return (
    <div className="space-y-8 py-4 px-2 md:px-0">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold font-display text-white tracking-tight">User Management</h1>
          <p className="text-sm text-slate-400 mt-1">Audit user accounts, manage statuses, and adjust platform access.</p>
        </div>

        <div className="relative w-full sm:w-80 group">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 group-focus-within:text-brand-purple-light transition-colors" />
          <input
            placeholder="Search by name, email, city..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-brand-black/60 border border-brand-purple/15 rounded-xl text-white placeholder-slate-500 focus:border-brand-purple focus:ring-1 focus:ring-brand-purple-light/20 outline-none transition-all duration-300 text-sm font-medium"
          />
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="flex flex-wrap items-center gap-6 bg-brand-card/30 backdrop-blur-md border border-brand-purple/10 p-4 rounded-xl shadow-md">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider select-none">Status:</span>
          <div className="flex rounded-lg overflow-hidden border border-brand-purple/20 bg-brand-black/40">
            {['all', 'active', 'banned'].map((status) => (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={`px-3 py-1 text-xs font-semibold transition-all capitalize cursor-pointer ${
                  statusFilter === status
                    ? 'bg-brand-purple text-white'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-brand-purple/10'
                }`}
              >
                {status}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider select-none">Gender:</span>
          <div className="flex rounded-lg overflow-hidden border border-brand-purple/20 bg-brand-black/40">
            {['all', 'M', 'F', 'O'].map((gender) => (
              <button
                key={gender}
                onClick={() => setGenderFilter(gender)}
                className={`px-3 py-1 text-xs font-semibold transition-all uppercase cursor-pointer ${
                  genderFilter === gender
                    ? 'bg-brand-purple text-white'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-brand-purple/10'
                }`}
              >
                {gender === 'all' ? 'All' : gender === 'M' ? 'Male' : gender === 'F' ? 'Female' : 'Other'}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-brand-card backdrop-blur-md border border-brand-purple/10 rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-brand-purple/[0.03] border-b border-brand-purple/10 text-slate-400 text-xs font-semibold uppercase tracking-wider select-none">
                <th className="py-4 px-6">User Info</th>
                <th className="py-4 px-6">Contact Details</th>
                <th className="py-4 px-6">Gender</th>
                <th className="py-4 px-6">Location</th>
                <th className="py-4 px-6">Joined Date</th>
                <th className="py-4 px-6">Account Status</th>
                <th className="py-4 px-6 text-right">Actions</th>
              </tr>
            </thead>
            <motion.tbody 
              variants={containerVariants}
              initial="hidden"
              animate="show"
              className="divide-y divide-brand-purple/5"
            >
              <AnimatePresence mode="popLayout">
                {users.length === 0 ? (
                  <motion.tr
                    key="empty"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                  >
                    <td colSpan={7} className="py-12 text-center text-slate-500">
                      <div className="flex flex-col items-center gap-2">
                        <AlertCircle className="w-8 h-8 text-slate-600 animate-pulse" />
                        <span className="font-semibold text-sm">No registered users matched your criteria</span>
                      </div>
                    </td>
                  </motion.tr>
                ) : (
                  users.map((u) => {
                    const avatarUrl = getAvatarUrl(u.profile_picture);
                    return (
                      <motion.tr 
                        key={u.id}
                        variants={rowVariants}
                        layout
                        exit={{ opacity: 0, x: -20, transition: { duration: 0.2 } }}
                        className="hover:bg-brand-purple/[0.02] transition-colors duration-150"
                      >
                        <td className="py-4 px-6">
                          <div className="flex items-center gap-3">
                            {avatarUrl ? (
                              <img 
                                src={avatarUrl} 
                                alt={u.full_name || u.username} 
                                className="w-10 h-10 rounded-full object-cover border border-brand-purple/30"
                              />
                            ) : (
                              <div className="w-10 h-10 rounded-full bg-brand-purple/20 border border-brand-purple/30 flex items-center justify-center text-brand-purple-light font-bold text-sm uppercase">
                                {u.username ? u.username.substring(0, 2) : 'CK'}
                              </div>
                            )}
                            <div>
                              <div className="font-bold text-white text-sm">{u.full_name || 'No Name'}</div>
                              <div className="text-xs text-slate-500 mt-0.5">@{u.username}</div>
                            </div>
                          </div>
                        </td>
                        <td className="py-4 px-6 text-sm text-slate-355">
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-1.5 text-slate-300">
                              <Mail className="w-3.5 h-3.5 text-slate-500" />
                              <span>{u.email}</span>
                            </div>
                            <div className="flex items-center gap-1.5 text-slate-400 text-xs">
                              <Phone className="w-3 h-3 text-slate-500" />
                              <span>{u.phone || 'No Phone'}</span>
                            </div>
                          </div>
                        </td>
                        <td className="py-4 px-6">
                          {getGenderBadge(u.gender)}
                        </td>
                        <td className="py-4 px-6 text-sm text-slate-300">
                          <div className="flex items-center gap-2">
                            <MapPin className="w-3.5 h-3.5 text-slate-500" />
                            <span>{u.city || 'Not Specified'}</span>
                          </div>
                        </td>
                        <td className="py-4 px-6 text-sm text-slate-300">
                          <div className="flex items-center gap-2">
                            <Calendar className="w-3.5 h-3.5 text-slate-500" />
                            <span>{formatJoinedDate(u.date_joined)}</span>
                          </div>
                        </td>
                        <td className="py-4 px-6">
                          {u.is_banned ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-500/10 border border-rose-500/20 text-rose-400">
                              <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
                              Banned
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                              Active
                            </span>
                          )}
                        </td>
                        <td className="py-4 px-6 text-right">
                          <div className="flex items-center justify-end gap-2 text-sm font-bold">
                            {u.is_banned ? (
                              <motion.button 
                                whileHover={{ scale: 1.02 }}
                                whileTap={{ scale: 0.98 }}
                                onClick={() => handleUnban(u.id)}
                                className="px-3 py-1.5 rounded-lg border border-emerald-500/35 text-emerald-400 hover:bg-emerald-500/10 hover:border-emerald-500 transition-all duration-205 flex items-center gap-1 cursor-pointer"
                              >
                                <ShieldCheck className="w-3.5 h-3.5" />
                                <span>Unban</span>
                              </motion.button>
                            ) : (
                              <motion.button 
                                whileHover={{ scale: 1.02 }}
                                whileTap={{ scale: 0.98 }}
                                onClick={() => handleBan(u.id)}
                                className="px-3 py-1.5 rounded-lg border border-amber-500/35 text-amber-400 hover:bg-amber-500/10 hover:border-amber-500 transition-all duration-205 flex items-center gap-1 cursor-pointer"
                              >
                                <ShieldAlert className="w-3.5 h-3.5" />
                                <span>Ban</span>
                              </motion.button>
                            )}
                            <motion.button 
                              whileHover={{ scale: 1.02 }}
                              whileTap={{ scale: 0.98 }}
                              onClick={() => handleDelete(u.id)}
                              className="px-3 py-1.5 rounded-lg border border-rose-500/35 text-rose-400 hover:bg-rose-500/10 hover:border-rose-500 transition-all duration-205 flex items-center gap-1 cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>Delete</span>
                            </motion.button>
                          </div>
                        </td>
                      </motion.tr>
                    );
                  })
                )}
              </AnimatePresence>
            </motion.tbody>
          </table>
        </div>
      </div>
    </div>
  );
}