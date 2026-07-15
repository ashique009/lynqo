import { useEffect, useState } from 'react';
import { getUsers, banUser, unbanUser, deleteUser } from '../services/adminService';
import { API_URL } from '../api/client';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Trash2, ShieldAlert, ShieldCheck, Mail, MapPin, AlertCircle } from 'lucide-react';

export default function AdminUsers() {
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState('');

  const fetchUsers = async () => {
    const res = await getUsers(search ? { search } : {});
    if (res.success) setUsers(res.data);
  };

  useEffect(() => { fetchUsers(); }, [search]);

  const handleBan = async (id) => { await banUser(id); fetchUsers(); };
  const handleUnban = async (id) => { await unbanUser(id); fetchUsers(); };
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
      transition: { staggerChildren: 0.02 }
    }
  };

  const rowVariants = {
    hidden: { opacity: 0, y: 10 },
    show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 260, damping: 22 } }
  };

  return (
    <div className="space-y-8 py-4 px-2 md:px-0">
      {/* Header and Summary stats */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold font-display bg-gradient-to-r from-white via-slate-200 to-brand-purple-light bg-clip-text text-transparent tracking-tight">
            User Management
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Audit user accounts, manage suspension status, and adjust system permissions.
          </p>
        </div>
      </div>

      {/* Control Panel (Filters and Search) */}
      <div className="bg-brand-card backdrop-blur-md border border-brand-purple/10 p-5 rounded-2xl shadow-xl space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
          {/* Search Box */}
          <div className="md:col-span-5 relative w-full group">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 group-focus-within:text-brand-purple-light transition-colors" />
            <input
              type="text"
              placeholder="Search by name, email, or username..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-brand-black/60 border border-brand-purple/15 rounded-xl text-white placeholder-slate-500 focus:border-brand-purple focus:ring-1 focus:ring-brand-purple-light/20 outline-none transition-all duration-300 text-sm font-medium"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white hover:bg-slate-800/40 p-1 rounded-md transition-all text-xs"
              >
                Clear
              </button>
            )}
          </div>

          {/* Status filter tabs */}
          <div className="md:col-span-4 flex items-center bg-brand-black/60 p-1 border border-brand-purple/15 rounded-xl h-[46px]">
            <button
              onClick={() => setStatusFilter('all')}
              className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                statusFilter === 'all'
                  ? 'bg-brand-purple text-white shadow-lg shadow-brand-purple/20'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              All Users
            </button>
            <button
              onClick={() => setStatusFilter('active')}
              className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                statusFilter === 'active'
                  ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/25'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Active
            </button>
            <button
              onClick={() => setStatusFilter('banned')}
              className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                statusFilter === 'banned'
                  ? 'bg-rose-600 text-white shadow-lg shadow-rose-600/25'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Banned
            </button>
          </div>

          {/* Gender Filter */}
          <div className="md:col-span-2 relative">
            <select
              value={genderFilter}
              onChange={(e) => setGenderFilter(e.target.value)}
              className="w-full px-4 py-2.5 bg-brand-black/60 border border-brand-purple/15 rounded-xl text-white outline-none transition-all duration-300 text-sm font-medium focus:border-brand-purple cursor-pointer appearance-none"
            >
              <option value="all">All Genders</option>
              <option value="M">Male</option>
              <option value="F">Female</option>
            </select>
            <div className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
              <SlidersHorizontal className="w-3.5 h-3.5" />
            </div>
          </div>

          {/* Refresh / Actions */}
          <div className="md:col-span-1 flex justify-end gap-2">
            <button
              onClick={fetchUsers}
              disabled={isLoading}
              className="w-full md:w-auto p-2.5 bg-brand-purple/10 border border-brand-purple/20 hover:bg-brand-purple/25 rounded-xl text-brand-purple-light hover:text-white transition-all cursor-pointer flex items-center justify-center disabled:opacity-50"
              title="Refresh User List"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Filters Active summary */}
        {hasActiveFilters && (
          <div className="flex items-center justify-between text-xs border-t border-brand-purple/5 pt-3 text-slate-400">
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-brand-purple-light animate-pulse" />
              <span>
                Filters active: {search && `Search "${search}"`}
                {statusFilter !== 'all' && ` • Status: ${statusFilter}`}
                {genderFilter !== 'all' && ` • Gender: ${genderFilter === 'M' ? 'Male' : 'Female'}`}
              </span>
            </div>
            <button 
              onClick={clearFilters}
              className="text-brand-purple-light hover:text-white font-semibold transition-colors cursor-pointer"
            >
              Reset Filters
            </button>
          </div>
        )}
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

      {/* Users Table / Layout Container */}
      <div className="bg-brand-card backdrop-blur-md border border-brand-purple/10 rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-brand-purple/[0.03] border-b border-brand-purple/10 text-slate-400 text-xs font-semibold uppercase tracking-wider">
                <th className="py-4 px-6">User Info</th>
                <th className="py-4 px-6">Email</th>
                <th className="py-4 px-6">Location</th>
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
                    <td colSpan={5} className="py-12 text-center text-slate-500">
                      <div className="flex flex-col items-center gap-2">
                        <AlertCircle className="w-8 h-8 text-slate-600 animate-pulse" />
                        <span className="font-semibold text-sm">No registered users matched your criteria</span>
                      </div>
                    </td>
                  </motion.tr>
                ) : (
                  users.map((u) => (
                    <motion.tr 
                      key={u.id}
                      variants={rowVariants}
                      layout
                      exit={{ opacity: 0, x: -20, transition: { duration: 0.2 } }}
                      className="hover:bg-brand-purple/[0.02] transition-colors duration-150"
                    >
                      <td className="py-4 px-6">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-brand-purple/10 border border-brand-purple/20 flex items-center justify-center text-brand-purple-light font-bold text-sm uppercase">
                            {u.username ? u.username.substring(0, 2) : 'CK'}
                          </div>
                          <div>
                            <div className="font-bold text-white text-sm">{u.full_name || 'No Name'}</div>
                            <div className="text-xs text-slate-500 mt-0.5">@{u.username}</div>
                          </div>
                        </div>
                      </td>
                      <td className="py-4 px-6 text-sm text-slate-300">
                        <div className="flex items-center gap-2">
                          <Mail className="w-3.5 h-3.5 text-slate-500" />
                          <span>{u.email}</span>
                        </div>
                      </td>
                      <td className="py-4 px-6 text-sm text-slate-300">
                        <div className="flex items-center gap-2">
                          <MapPin className="w-3.5 h-3.5 text-slate-500" />
                          <span>{u.city || 'Not Specified'}</span>
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
                        <div className="flex items-center justify-end gap-2">
                          {u.is_banned ? (
                            <motion.button 
                              whileHover={{ scale: 1.02 }}
                              whileTap={{ scale: 0.98 }}
                              onClick={() => handleUnban(u.id)}
                              className="px-3 py-1.5 text-xs font-bold rounded-lg border border-emerald-500/35 text-emerald-400 hover:bg-emerald-500/10 hover:border-emerald-500 transition-all duration-205 flex items-center gap-1 cursor-pointer"
                            >
                              <ShieldCheck className="w-3.5 h-3.5" />
                              <span>Unban</span>
                            </motion.button>
                          ) : (
                            <motion.button 
                              whileHover={{ scale: 1.02 }}
                              whileTap={{ scale: 0.98 }}
                              onClick={() => handleBan(u.id)}
                              className="px-3 py-1.5 text-xs font-bold rounded-lg border border-amber-500/35 text-amber-400 hover:bg-amber-500/10 hover:border-amber-500 transition-all duration-205 flex items-center gap-1 cursor-pointer"
                            >
                              <ShieldAlert className="w-3.5 h-3.5" />
                              <span>Ban</span>
                            </motion.button>
                          )}
                          <motion.button 
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={() => handleDelete(u.id)}
                            className="px-3 py-1.5 text-xs font-bold rounded-lg border border-rose-500/35 text-rose-400 hover:bg-rose-500/10 hover:border-rose-500 transition-all duration-205 flex items-center gap-1 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Delete</span>
                          </motion.button>
                        </div>
                      </td>
                    </motion.tr>
                  ))
                )}
              </AnimatePresence>
            </motion.tbody>
          </table>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={isDeleteModalOpen}
        onClose={() => {
          if (actionInProgress.actionType !== 'delete') {
            setIsDeleteModalOpen(false);
            setUserToDelete(null);
          }
        }}
        title="Delete Account Permanently"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-3.5 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400">
            <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold">Warning: This action is irreversible</p>
              <p className="text-xs text-rose-400/80 mt-1">
                This will permanently delete the user's account and all associated data from the system.
              </p>
            </div>
          </div>
          
          <p className="text-slate-300 text-sm">
            Are you sure you want to permanently delete the account for{' '}
            <strong className="text-white font-semibold">
              {userToDelete ? `${userToDelete.full_name || `@${userToDelete.username}`}` : 'this user'}
            </strong>
            ?
          </p>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-800/80 mt-6">
            <button
              onClick={() => {
                setIsDeleteModalOpen(false);
                setUserToDelete(null);
              }}
              disabled={actionInProgress.actionType === 'delete'}
              className="px-4 py-2 rounded-xl text-sm font-bold text-slate-400 hover:text-slate-200 hover:bg-slate-800/40 transition-all cursor-pointer disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={confirmDelete}
              disabled={actionInProgress.actionType === 'delete'}
              className="px-4 py-2 rounded-xl text-sm font-bold bg-rose-600 hover:bg-rose-700 text-white transition-all cursor-pointer flex items-center gap-2 disabled:opacity-50"
            >
              {actionInProgress.actionType === 'delete' ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Deleting...</span>
                </>
              ) : (
                <>
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Confirm Delete</span>
                </>
              )}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}