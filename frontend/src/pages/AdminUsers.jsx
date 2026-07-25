import { useEffect, useState } from 'react';
import { getUsers, banUser, unbanUser, deleteUser } from '../services/adminService';
import { API_URL } from '../api/client';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Search, 
  Trash2, 
  ShieldAlert, 
  ShieldCheck, 
  Mail, 
  MapPin, 
  AlertCircle, 
  Calendar, 
  RefreshCw, 
  User 
} from 'lucide-react';
import Loader from '../components/Loader';
import Modal from '../components/Modal';
import EmptyState from '../components/EmptyState';
import { useToast } from '../context/ToastContext';

export default function AdminUsers() {
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [isLoading, setIsLoading] = useState(true);
  const [actionInProgress, setActionInProgress] = useState({ userId: null, actionType: null });
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState(null);

  const { showToast } = useToast();

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(search);
    }, 400);
    return () => clearTimeout(handler);
  }, [search]);

  const fetchUsers = async () => {
    setIsLoading(true);
    try {
      const params = {};
      if (debouncedSearch.trim()) params.search = debouncedSearch.trim();
      if (statusFilter !== 'all') params.status = statusFilter;

      const res = await getUsers(params);
      if (res && res.success) {
        setUsers(res.data || []);
      } else {
        showToast(res?.message || 'Failed to fetch users.', 'error');
      }
    } catch (err) {
      showToast(err?.message || 'Error occurred while loading users.', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, [debouncedSearch, statusFilter]);

  const handleBan = async (userId) => {
    setActionInProgress({ userId, actionType: 'ban' });
    try {
      const res = await banUser(userId);
      if (res && res.success) {
        showToast('User account suspended successfully.', 'success');
        fetchUsers();
      } else {
        showToast(res?.message || 'Failed to ban user.', 'error');
      }
    } catch (err) {
      showToast(err?.message || 'Error suspending user account.', 'error');
    } finally {
      setActionInProgress({ userId: null, actionType: null });
    }
  };

  const handleUnban = async (userId) => {
    setActionInProgress({ userId, actionType: 'unban' });
    try {
      const res = await unbanUser(userId);
      if (res && res.success) {
        showToast('User account reactivated successfully.', 'success');
        fetchUsers();
      } else {
        showToast(res?.message || 'Failed to unban user.', 'error');
      }
    } catch (err) {
      showToast(err?.message || 'Error reactivating user account.', 'error');
    } finally {
      setActionInProgress({ userId: null, actionType: null });
    }
  };

  const openDeleteConfirm = (user) => {
    setUserToDelete(user);
    setIsDeleteModalOpen(true);
  };

  const confirmDelete = async () => {
    if (!userToDelete) return;
    const userId = userToDelete.id;
    setIsDeleteModalOpen(false);
    setActionInProgress({ userId, actionType: 'delete' });
    try {
      const res = await deleteUser(userId);
      if (res && res.success) {
        showToast('User account deleted permanently.', 'success');
        fetchUsers();
      } else {
        showToast(res?.message || 'Failed to delete user.', 'error');
      }
    } catch (err) {
      showToast(err?.message || 'Error deleting user account.', 'error');
    } finally {
      setActionInProgress({ userId: null, actionType: null });
      setUserToDelete(null);
    }
  };

  const clearFilters = () => {
    setSearch('');
    setStatusFilter('all');
  };

  const getProfilePicUrl = (pic) => {
    if (!pic) return null;
    if (pic.startsWith('http://') || pic.startsWith('https://')) return pic;
    return `${API_URL}${pic}`;
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    try {
      const date = new Date(dateString);
      return new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      }).format(date);
    } catch (e) {
      return 'N/A';
    }
  };

  const renderAvatar = (user) => {
    const profileUrl = getProfilePicUrl(user.profile_picture);
    const initials = user.username ? user.username.substring(0, 2).toUpperCase() : 'CK';
    
    let gradientClass = 'from-purple-600 to-indigo-600';
    const charCode = user.username ? user.username.charCodeAt(0) : 0;
    if (charCode % 3 === 0) gradientClass = 'from-violet-500 to-pink-500';
    else if (charCode % 3 === 1) gradientClass = 'from-emerald-500 to-teal-500';

    if (profileUrl) {
      return (
        <div className="relative w-10 h-10 rounded-xl overflow-hidden border border-brand-purple/20 flex-shrink-0 bg-brand-black flex items-center justify-center">
          <img
            src={profileUrl}
            alt={user.username}
            className="w-full h-full object-cover"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
              e.currentTarget.nextSibling.style.display = 'flex';
            }}
          />
          <div 
            style={{ display: 'none' }}
            className={`w-full h-full bg-gradient-to-tr ${gradientClass} items-center justify-center text-white font-extrabold text-sm uppercase`}
          >
            {initials}
          </div>
        </div>
      );
    }

    return (
      <div className={`w-10 h-10 rounded-xl bg-gradient-to-tr ${gradientClass} flex items-center justify-center text-white font-extrabold text-sm uppercase border border-brand-purple/20 flex-shrink-0 shadow-inner`}>
        {initials}
      </div>
    );
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { staggerChildren: 0.02 } }
  };

  const rowVariants = {
    hidden: { opacity: 0, y: 10 },
    show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 260, damping: 22 } }
  };

  const hasActiveFilters = search || statusFilter !== 'all';

  return (
    <div className="space-y-8 py-4 px-2 md:px-0">
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

      <div className="bg-brand-card backdrop-blur-md border border-brand-purple/10 p-5 rounded-2xl shadow-xl space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
          <div className="md:col-span-7 relative w-full group">
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

          <div className="md:col-span-4 flex items-center bg-brand-black/60 p-1 border border-brand-purple/15 rounded-xl h-[46px]">
            <button
              onClick={() => setStatusFilter('all')}
              className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                statusFilter === 'all' ? 'bg-brand-purple text-white shadow-lg shadow-brand-purple/20' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              All Users
            </button>
            <button
              onClick={() => setStatusFilter('active')}
              className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                statusFilter === 'active' ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/25' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Active
            </button>
            <button
              onClick={() => setStatusFilter('banned')}
              className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                statusFilter === 'banned' ? 'bg-rose-600 text-white shadow-lg shadow-rose-600/25' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Banned
            </button>
          </div>

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

        {hasActiveFilters && (
          <div className="flex items-center justify-between text-xs border-t border-brand-purple/5 pt-3 text-slate-400">
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-brand-purple-light animate-pulse" />
              <span>
                Filters active: {search && `Search "${search}"`}
                {statusFilter !== 'all' && ` • Status: ${statusFilter}`}
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

      <div className="bg-brand-card backdrop-blur-md border border-brand-purple/10 rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          {isLoading && users.length === 0 ? (
            <div className="py-24 text-center flex flex-col items-center justify-center">
              <Loader />
              <span className="text-slate-400 text-sm mt-3 animate-pulse">Loading system users...</span>
            </div>
          ) : users.length === 0 ? (
            <div className="p-4">
              <EmptyState
                icon={Search}
                title="No Users Found"
                description={
                  hasActiveFilters
                    ? "We couldn't find any user profiles matching your selected filter parameters."
                    : "No users have registered on the platform yet."
                }
                actionText={hasActiveFilters ? "Reset Filter Controls" : null}
                onAction={hasActiveFilters ? clearFilters : null}
              />
            </div>
          ) : (
            <table className="w-full text-left border-collapse min-w-[900px]">
              <thead>
                <tr className="bg-brand-purple/[0.03] border-b border-brand-purple/10 text-slate-400 text-[11px] font-bold uppercase tracking-wider">
                  <th className="py-4 px-6 w-16">Photo</th>
                  <th className="py-4 px-4">Username</th>
                  <th className="py-4 px-4">Full Name</th>
                  <th className="py-4 px-4">Email</th>
                  <th className="py-4 px-4">City</th>
                  <th className="py-4 px-4 w-32">Joined Date</th>
                  <th className="py-4 px-4 w-28">Status</th>
                  <th className="py-4 px-6 text-right w-44">Actions</th>
                </tr>
              </thead>
              <motion.tbody
                variants={containerVariants}
                initial="hidden"
                animate="show"
                className="divide-y divide-brand-purple/5"
              >
                <AnimatePresence mode="popLayout">
                  {users.map((u) => {
                    const isBusy = actionInProgress.userId === u.id;
                    return (
                      <motion.tr
                        key={u.id}
                        variants={rowVariants}
                        layout
                        exit={{ opacity: 0, x: -20, transition: { duration: 0.2 } }}
                        className="hover:bg-brand-purple/[0.02] transition-colors duration-150 relative group"
                      >
                        <td className="py-4 px-6">{renderAvatar(u)}</td>
                        <td className="py-4 px-4 text-sm font-semibold text-slate-300">
                          <span className="text-slate-400">@</span>
                          {u.username}
                          {u.is_staff && (
                            <span className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-extrabold bg-brand-purple/20 border border-brand-purple-light/35 text-brand-purple-light uppercase">
                              Staff
                            </span>
                          )}
                        </td>
                        <td className="py-4 px-4 text-sm font-bold text-white">{u.full_name || '-'}</td>
                        <td className="py-4 px-4 text-sm text-slate-300">
                          <div className="flex items-center gap-1.5">
                            <Mail className="w-3.5 h-3.5 text-slate-500" />
                            <span className="truncate max-w-[180px]">{u.email}</span>
                          </div>
                        </td>
                        <td className="py-4 px-4 text-sm text-slate-300">
                          <div className="flex items-center gap-1.5">
                            <MapPin className="w-3.5 h-3.5 text-slate-500" />
                            <span>{u.city || 'N/A'}</span>
                          </div>
                        </td>
                        <td className="py-4 px-4 text-sm text-slate-300">
                          <div className="flex items-center gap-1.5">
                            <Calendar className="w-3.5 h-3.5 text-slate-500" />
                            <span>{formatDate(u.date_joined)}</span>
                          </div>
                        </td>
                        <td className="py-4 px-4">
                          {u.is_banned ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-rose-500/10 border border-rose-500/20 text-rose-400">
                              <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
                              Suspended
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                              Active
                            </span>
                          )}
                        </td>
                        <td className="py-4 px-6 text-right">
                          <div className="flex items-center justify-end gap-2 opacity-90 group-hover:opacity-100 transition-opacity">
                            {u.is_banned ? (
                              <button
                                onClick={() => handleUnban(u.id)}
                                disabled={isBusy || (actionInProgress.userId !== null)}
                                className="px-2.5 py-1.5 text-xs font-bold rounded-lg border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 hover:border-emerald-500 transition-all duration-200 flex items-center gap-1 cursor-pointer disabled:opacity-50"
                                title="Reactivate User Account"
                              >
                                {isBusy && actionInProgress.actionType === 'unban' ? (
                                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <ShieldCheck className="w-3.5 h-3.5" />
                                )}
                                <span>Unban</span>
                              </button>
                            ) : (
                              <button
                                onClick={() => handleBan(u.id)}
                                disabled={isBusy || (actionInProgress.userId !== null)}
                                className="px-2.5 py-1.5 text-xs font-bold rounded-lg border border-amber-500/30 text-amber-400 hover:bg-amber-500/10 hover:border-amber-500 transition-all duration-200 flex items-center gap-1 cursor-pointer disabled:opacity-50"
                                title="Suspend User Account"
                              >
                                {isBusy && actionInProgress.actionType === 'ban' ? (
                                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <ShieldAlert className="w-3.5 h-3.5" />
                                )}
                                <span>Ban</span>
                              </button>
                            )}

                            <button
                              onClick={() => openDeleteConfirm(u)}
                              disabled={isBusy || (actionInProgress.userId !== null)}
                              className="px-2.5 py-1.5 text-xs font-bold rounded-lg border border-rose-500/30 text-rose-400 hover:bg-rose-500/10 hover:border-rose-500 transition-all duration-200 flex items-center gap-1 cursor-pointer disabled:opacity-50"
                              title="Delete User Permanently"
                            >
                              {isBusy && actionInProgress.actionType === 'delete' ? (
                                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Trash2 className="w-3.5 h-3.5" />
                              )}
                              <span>Delete</span>
                            </button>
                          </div>
                        </td>
                      </motion.tr>
                    );
                  })}
                </AnimatePresence>
              </motion.tbody>
            </table>
          )}
        </div>
      </div>

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