import React, { useState, useEffect, useRef } from 'react';
import { supabase } from './supabaseClient';
import AuthScreen from './components/AuthScreen';
import ChatRoom from './components/ChatRoom';
import AdminDashboard from './components/AdminDashboard';
import {
  LogOut, Plus, Shield, MessageCircle, Menu, X,
  GraduationCap, Bell, BellRing, Lock, KeyRound, UserCheck, Trash2, Smartphone
} from 'lucide-react';

const ROLE_THEMES = {
  admin: {
    headerBg: 'bg-[#800000]',
    activeItem: 'bg-[#800000] text-white shadow-sm',
    iconColor: 'text-[#800000]',
    userCardBg: 'bg-red-50 border-red-100',
    userTitle: 'text-[#800000]',
    badge: 'bg-amber-400 text-slate-950',
  },
  staff: {
    headerBg: 'bg-indigo-900',
    activeItem: 'bg-indigo-900 text-white shadow-sm',
    iconColor: 'text-indigo-700',
    userCardBg: 'bg-indigo-50 border-indigo-100',
    userTitle: 'text-indigo-800',
    badge: 'bg-sky-300 text-indigo-950',
  },
  student: {
    headerBg: 'bg-emerald-800',
    activeItem: 'bg-emerald-800 text-white shadow-sm',
    iconColor: 'text-emerald-700',
    userCardBg: 'bg-emerald-50 border-emerald-100',
    userTitle: 'text-emerald-800',
    badge: 'bg-emerald-200 text-emerald-950',
  },
  parent: {
    headerBg: 'bg-teal-800',
    activeItem: 'bg-teal-800 text-white shadow-sm',
    iconColor: 'text-teal-700',
    userCardBg: 'bg-teal-50 border-teal-100',
    userTitle: 'text-teal-800',
    badge: 'bg-teal-200 text-teal-950',
  },
};

export default function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [profileError, setProfileError] = useState('');
  const [groups, setGroups] = useState([]);
  const [colleagues, setColleagues] = useState([]);
  const [activeGroup, setActiveGroup] = useState(null);
  const [viewAdmin, setViewAdmin] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // New group state
  const [newGroupName, setNewGroupName] = useState('');
  const [isStaffOnlyGroup, setIsStaffOnlyGroup] = useState(false);
  const [showNewGroup, setShowNewGroup] = useState(false);

  // Change password modal state
  const [showPwdModal, setShowPwdModal] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [pwdStatus, setPwdStatus] = useState('');

  // PWA Install & Notifications state
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showIosInstallHelp, setShowIosInstallHelp] = useState(false);
  const [notifPermission, setNotifPermission] = useState(
    typeof window !== 'undefined' && 'Notification' in window ? window.Notification.permission : 'default'
  );

  const [unreadCounts, setUnreadCounts] = useState({});
  const [toastAlert, setToastAlert] = useState(null);
  const activeGroupRef = useRef(null);

  useEffect(() => {
    activeGroupRef.current = activeGroup;
  }, [activeGroup]);

  useEffect(() => {
    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) loadProfile(session.user.id);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) loadProfile(session.user.id);
      else {
        setProfile(null);
        setGroups([]);
        setColleagues([]);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  async function triggerSystemNotification(title, bodyText) {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    if (window.Notification.permission !== 'granted') return;

    try {
      if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.ready;
        if (reg && reg.showNotification) {
          await reg.showNotification(title, {
            body: bodyText,
            icon: '/app-icon.svg',
            badge: '/app-icon.svg',
            vibrate: [200, 100, 200],
            tag: 'uni-mate-alert',
          });
          return;
        }
      }
      new window.Notification(title, { body: bodyText, icon: '/app-icon.svg' });
    } catch {
      // Fallback handled by in-app toast banner
    }
  }

  async function handleEnableNotifications() {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      alert('This browser does not support push notifications.');
      return;
    }
    const result = await window.Notification.requestPermission();
    setNotifPermission(result);
    if (result === 'granted') {
      playNotificationChime();
      await triggerSystemNotification(
        'uni_mate Alerts Active',
        'You will now receive live university circulars & messages.'
      );
    } else {
      alert('Notifications are blocked in your browser settings. Please allow notifications for this site.');
    }
  }

  async function handleInstallAppClick() {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') setDeferredPrompt(null);
    } else {
      setShowIosInstallHelp((prev) => !prev);
    }
  }

  useEffect(() => {
    if (!profile) return;

    const globalChannel = supabase
      .channel(`global-uni-messages-${profile.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload) => {
          const newMsg = payload.new;
          if (newMsg.sender_id === profile.id) return;

          playNotificationChime();

          const isViewingSameGroup = activeGroupRef.current?.id === newMsg.group_id;
          if (!isViewingSameGroup) {
            setUnreadCounts((prev) => ({
              ...prev,
              [newMsg.group_id]: (prev[newMsg.group_id] || 0) + 1,
            }));
          }

          const previewText = newMsg.content || `New attachment: ${newMsg.file_name || 'Media'}`;
          setToastAlert(previewText);
          setTimeout(() => setToastAlert(null), 5000);

          if (!isViewingSameGroup || document.hidden) {
            triggerSystemNotification('uni_mate • New Message', previewText);
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'group_members', filter: `user_id=eq.${profile.id}` },
        () => loadGroups()
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'groups' },
        (payload) => {
          if (activeGroupRef.current?.id === payload.old.id) {
            setActiveGroup(null);
          }
          loadGroups();
        }
      )
      .subscribe();

    return () => supabase.removeChannel(globalChannel);
  }, [profile]);

  function playNotificationChime() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.25);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.25);
    } catch {
      // Ignore if audio blocked
    }
  }

  async function loadProfile(userId) {
    setProfileError('');
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      setProfileError(error.message);
      return;
    }
    if (!data) {
      setProfileError('No profile found for this user ID in the profiles table.');
      return;
    }
    setProfile(data);
    loadGroups();

    if (data.role === 'admin' || data.role === 'staff') {
      const { data: staffList } = await supabase
        .from('profiles')
        .select('id, full_name, designation, department, role')
        .in('role', ['admin', 'staff'])
        .neq('id', userId)
        .order('full_name', { ascending: true });
      if (staffList) setColleagues(staffList);
    }
  }

  async function loadGroups() {
    const { data } = await supabase.from('groups').select('*').order('created_at', { ascending: false });
    if (data) {
      setGroups(data);
      const regularOnly = data.filter((g) => !g.description?.startsWith('dm:'));
      if (regularOnly.length > 0 && !activeGroupRef.current) {
        setActiveGroup(regularOnly[0]);
      }
    }
  }

  async function handleStartDirectStaffChat(colleague) {
    const pairKey = [profile.id, colleague.id].sort().join('_');
    const dmTag = `dm:${pairKey}`;

    let existing = groups.find((g) => g.description === dmTag);

    if (!existing) {
      const { data: found } = await supabase
        .from('groups')
        .select('*')
        .eq('description', dmTag)
        .maybeSingle();
      if (found) existing = found;
    }

    if (existing) {
      selectGroup(existing);
      return;
    }

    const chatTitle = `${profile.full_name} ↔ ${colleague.full_name}`;
    const { data: newDm, error: grpError } = await supabase
      .from('groups')
      .insert([
        {
          name: chatTitle,
          description: dmTag,
          department: 'Direct Staff Chat',
          created_by: profile.id,
          is_staff_only: true,
        },
      ])
      .select()
      .single();

    if (grpError) {
      alert(`Could not start chat: ${grpError.message}`);
      return;
    }

    const { error: memError } = await supabase.from('group_members').insert([
      { group_id: newDm.id, user_id: profile.id },
      { group_id: newDm.id, user_id: colleague.id },
    ]);

    if (memError) {
      alert(`Chat created, but adding colleague failed: ${memError.message}`);
      return;
    }

    await loadGroups();
    selectGroup(newDm);
  }

  async function handleDeleteDirectChat(e, dmGroup) {
    e.stopPropagation();
    if (!window.confirm('Delete this 1-on-1 chat history permanently?')) return;
    const { error } = await supabase.from('groups').delete().eq('id', dmGroup.id);
    if (!error) {
      if (activeGroup?.id === dmGroup.id) setActiveGroup(null);
      setGroups((prev) => prev.filter((g) => g.id !== dmGroup.id));
    }
  }

  async function handleCreateGroup(e) {
    e.preventDefault();
    if (!newGroupName.trim()) return;
    const { data: grp, error } = await supabase
      .from('groups')
      .insert([
        {
          name: newGroupName,
          department: profile.department,
          created_by: profile.id,
          is_staff_only: isStaffOnlyGroup,
        },
      ])
      .select()
      .single();

    if (!error && grp) {
      await supabase.from('group_members').insert([{ group_id: grp.id, user_id: profile.id }]);
      setNewGroupName('');
      setIsStaffOnlyGroup(false);
      setShowNewGroup(false);
      loadGroups();
      setActiveGroup(grp);
      setViewAdmin(false);
    }
  }

  async function handlePasswordUpdate(e) {
    e.preventDefault();
    if (newPassword.length < 6) {
      setPwdStatus('Password must be at least 6 characters.');
      return;
    }
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      setPwdStatus(`Error: ${error.message}`);
    } else {
      setPwdStatus('Password updated successfully!');
      setNewPassword('');
      setTimeout(() => {
        setShowPwdModal(false);
        setPwdStatus('');
      }, 1500);
    }
  }

  function selectGroup(grp) {
    setActiveGroup(grp);
    setViewAdmin(false);
    setMobileMenuOpen(false);
    setUnreadCounts((prev) => {
      const updated = { ...prev };
      delete updated[grp.id];
      return updated;
    });
  }

  if (!session) return <AuthScreen />;

  if (profileError) {
    return (
      <div className="h-screen flex flex-col items-center justify-center p-6 text-center gap-3">
        <p className="text-red-600 font-bold text-sm">Profile Load Error: {profileError}</p>
        <button
          onClick={() => supabase.auth.signOut()}
          className="bg-[#800000] text-white px-4 py-2 rounded-xl text-xs font-semibold"
        >
          Sign Out & Retry
        </button>
      </div>
    );
  }

  if (!profile) {
    return <div className="h-screen flex items-center justify-center text-[#800000] font-semibold">Loading uni_mate...</div>;
  }

  const isStaffOrAdmin = profile.role === 'admin' || profile.role === 'staff';
  const theme = ROLE_THEMES[profile.role] || ROLE_THEMES.student;
  const totalUnread = Object.values(unreadCounts).reduce((a, b) => a + b, 0);

  const regularGroups = groups.filter((g) => !g.description?.startsWith('dm:'));
  const directChats = groups.filter((g) => g.description?.startsWith('dm:'));

  return (
    <div className="h-screen flex flex-col md:flex-row bg-slate-100 overflow-hidden relative">
      {/* Change Password Modal */}
      {showPwdModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                <KeyRound size={16} className={theme.iconColor} /> Change Your Password
              </h3>
              <button onClick={() => { setShowPwdModal(false); setPwdStatus(''); }} className="text-slate-400 hover:text-slate-700">
                <X size={18} />
              </button>
            </div>
            {pwdStatus && (
              <p className="text-xs font-semibold text-amber-900 bg-amber-50 border border-amber-200 p-2.5 rounded-xl">
                {pwdStatus}
              </p>
            )}
            <form onSubmit={handlePasswordUpdate} className="space-y-3">
              <input
                type="password"
                required
                minLength={6}
                placeholder="New password (min 6 characters)"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs focus:outline-none focus:border-slate-600"
              />
              <button type="submit" className={`w-full ${theme.headerBg} text-white py-2 rounded-xl text-xs font-bold`}>
                Update Password
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Live In-App Toast Notification */}
      {toastAlert && (
        <div className="fixed bottom-16 right-4 z-50 bg-slate-900 text-white px-4 py-3 rounded-2xl shadow-xl border border-amber-400/40 flex items-center gap-3 max-w-xs animate-bounce">
          <Bell size={18} className="text-amber-400 shrink-0" />
          <div className="text-xs truncate">
            <p className="font-bold text-amber-300">New Message</p>
            <p className="truncate text-slate-200">{toastAlert}</p>
          </div>
        </div>
      )}

      {/* Mobile Top Navbar */}
      <div className={`md:hidden ${theme.headerBg} text-white px-4 py-3 flex items-center justify-between shadow`}>
        <div className="flex items-center gap-2 font-bold">
          <GraduationCap size={22} className="text-amber-300" />
          <span>uni_mate</span>
          {totalUnread > 0 && (
            <span className="bg-amber-400 text-slate-950 text-[10px] font-extrabold px-2 py-0.5 rounded-full">
              {totalUnread} new
            </span>
          )}
        </div>
        <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="p-1">
          {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* Sidebar */}
      <aside className={`${mobileMenuOpen ? 'fixed inset-0 z-40 flex' : 'hidden'} md:flex flex-col w-full md:w-80 bg-white border-r border-slate-200`}>
        <div className={`p-4 ${theme.headerBg} text-white hidden md:flex items-center justify-between`}>
          <div className="flex items-center gap-2 font-extrabold text-lg">
            <GraduationCap size={24} className="text-amber-300" />
            <span>uni_mate</span>
          </div>
          <span className={`text-[10px] uppercase px-2.5 py-0.5 rounded-full font-extrabold ${theme.badge}`}>
            {profile.role}
          </span>
        </div>

        {/* User Card */}
        <div className={`p-4 border-b flex items-center justify-between ${theme.userCardBg}`}>
          <div className="min-w-0">
            <p className="font-bold text-sm text-slate-800 truncate">{profile.full_name}</p>
            <p className={`text-xs font-semibold truncate ${theme.userTitle}`}>{profile.designation || profile.role}</p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={handleEnableNotifications}
              title={notifPermission === 'granted' ? 'Alerts Active (Click to Test)' : 'Enable Desktop & Mobile Alerts'}
              className={`p-2 rounded-lg hover:bg-white transition ${
                notifPermission === 'granted' ? 'text-emerald-600' : 'text-amber-600 animate-pulse'
              }`}
            >
              <BellRing size={17} />
            </button>
            <button
              onClick={() => setShowPwdModal(true)}
              title="Change Password"
              className="p-2 text-slate-500 hover:text-slate-900 rounded-lg hover:bg-white transition"
            >
              <KeyRound size={17} />
            </button>
            <button
              onClick={() => supabase.auth.signOut()}
              title="Sign Out"
              className="p-2 text-slate-500 hover:text-red-600 rounded-lg hover:bg-white transition"
            >
              <LogOut size={17} />
            </button>
          </div>
        </div>

        {/* Install Mobile App Button (PWA) */}
        <div className="px-3 pt-2.5 pb-1">
          <button
            onClick={handleInstallAppClick}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs font-bold bg-amber-50 hover:bg-amber-100 text-amber-950 border border-amber-300 transition"
          >
            <Smartphone size={15} className="text-[#800000]" />
            <span>Install uni_mate App</span>
          </button>

          {showIosInstallHelp && (
            <div className="mt-2 p-2.5 bg-slate-900 text-white rounded-xl text-[11px] space-y-1 relative">
              <button
                onClick={() => setShowIosInstallHelp(false)}
                className="absolute top-1.5 right-2 text-slate-400 hover:text-white"
              >
                ✕
              </button>
              <p className="font-bold text-amber-300">Install on Phone:</p>
              <p>• <strong>Android Chrome:</strong> Tap <strong>⋮</strong> (top right) → <strong>Install app</strong></p>
              <p>• <strong>iPhone Safari:</strong> Tap <strong>Share (↑)</strong> → <strong>Add to Home Screen</strong></p>
            </div>
          )}
        </div>

        {/* Admin Dashboard Button */}
        {profile.role === 'admin' && (
          <div className="p-3 border-b border-slate-100">
            <button
              onClick={() => { setViewAdmin(true); setMobileMenuOpen(false); }}
              className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold transition ${
                viewAdmin ? 'bg-amber-500 text-slate-950 shadow-sm' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <Shield size={16} /> Admin Control Center
            </button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          {/* Group List Header */}
          <div className="px-4 pt-4 pb-2 flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Channels & Groups</span>
            {isStaffOrAdmin && (
              <button
                onClick={() => setShowNewGroup(!showNewGroup)}
                className={`text-xs flex items-center gap-1 font-bold hover:underline ${theme.userTitle}`}
              >
                <Plus size={14} /> New Group
              </button>
            )}
          </div>

          {showNewGroup && (
            <form onSubmit={handleCreateGroup} className="px-4 pb-3 space-y-2">
              <div className="flex gap-1.5">
                <input
                  type="text"
                  placeholder="e.g. CSE TY Notices"
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  className="flex-1 px-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:border-slate-500"
                />
                <button type="submit" className={`${theme.headerBg} text-white text-xs px-3 py-1.5 rounded-lg font-semibold`}>
                  Add
                </button>
              </div>
              <label className="flex items-center gap-2 text-[11px] text-slate-600 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={isStaffOnlyGroup}
                  onChange={(e) => setIsStaffOnlyGroup(e.target.checked)}
                  className="rounded border-slate-300"
                />
                <Lock size={12} className="text-indigo-700" />
                <span>Staff-Only Channel (Faculty & Admin discussion)</span>
              </label>
            </form>
          )}

          {/* Formal Groups List */}
          <div className="px-3 space-y-1">
            {regularGroups.map((grp) => {
              const unread = unreadCounts[grp.id] || 0;
              const isSelected = !viewAdmin && activeGroup?.id === grp.id;

              return (
                <button
                  key={grp.id}
                  onClick={() => selectGroup(grp)}
                  className={`w-full text-left px-3 py-2.5 rounded-xl flex items-center justify-between transition ${
                    isSelected ? theme.activeItem : 'text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {grp.is_staff_only ? (
                      <Lock size={16} className={isSelected ? 'text-amber-300 shrink-0' : 'text-indigo-700 shrink-0'} />
                    ) : (
                      <MessageCircle size={17} className={isSelected ? 'text-amber-300 shrink-0' : `${theme.iconColor} shrink-0`} />
                    )}
                    <div className="truncate">
                      <p className="text-sm font-semibold truncate">{grp.name}</p>
                      <p className={`text-[11px] truncate ${isSelected ? 'text-white/80' : 'text-slate-400'}`}>
                        {grp.is_staff_only ? 'Staff-Only Channel' : grp.department || 'University Broadcast'}
                      </p>
                    </div>
                  </div>

                  {unread > 0 && !isSelected && (
                    <span className="bg-amber-500 text-slate-950 text-[11px] font-extrabold px-2 py-0.5 rounded-full shrink-0">
                      {unread}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Direct 1-on-1 Staff Chat Section */}
          {isStaffOrAdmin && colleagues.length > 0 && (
            <div className="mt-5 pt-4 border-t border-slate-100">
              <div className="px-4 pb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-indigo-800 flex items-center gap-1.5">
                  <UserCheck size={14} /> Direct 1-on-1 Staff Chat
                </span>
                <p className="text-[10px] text-slate-400">Private colleague messages (separate from groups)</p>
              </div>
              <div className="px-3 pb-4 space-y-1">
                {colleagues.map((col) => {
                  const pairKey = [profile.id, col.id].sort().join('_');
                  const dmGroup = directChats.find((g) => g.description === `dm:${pairKey}`);
                  const isDmSelected = !viewAdmin && dmGroup && activeGroup?.id === dmGroup.id;
                  const dmUnread = dmGroup ? unreadCounts[dmGroup.id] || 0 : 0;

                  return (
                    <div
                      key={col.id}
                      onClick={() => handleStartDirectStaffChat(col)}
                      className={`w-full cursor-pointer px-3 py-2 rounded-xl flex items-center justify-between transition ${
                        isDmSelected
                          ? 'bg-indigo-900 text-white shadow-sm'
                          : 'hover:bg-indigo-50 text-slate-800'
                      }`}
                    >
                      <div className="min-w-0 pr-2">
                        <p className={`text-xs font-bold truncate ${isDmSelected ? 'text-white' : 'text-slate-800'}`}>
                          {col.full_name}
                        </p>
                        <p className={`text-[10px] truncate ${isDmSelected ? 'text-indigo-200' : 'text-slate-500'}`}>
                          {col.designation || col.role} {col.department ? `• ${col.department}` : ''}
                        </p>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {dmUnread > 0 && !isDmSelected && (
                          <span className="bg-amber-500 text-slate-950 text-[10px] font-extrabold px-1.5 py-0.5 rounded-full">
                            {dmUnread}
                          </span>
                        )}
                        {dmGroup ? (
                          <button
                            onClick={(e) => handleDeleteDirectChat(e, dmGroup)}
                            title="Delete 1-on-1 chat"
                            className={`p-1 rounded-lg transition ${
                              isDmSelected
                                ? 'text-indigo-200 hover:text-white hover:bg-white/15'
                                : 'text-slate-400 hover:text-red-600 hover:bg-red-50'
                            }`}
                          >
                            <Trash2 size={13} />
                          </button>
                        ) : (
                          <span className="text-[10px] bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded-full font-semibold">
                            Chat
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col h-full overflow-hidden">
        {viewAdmin && profile.role === 'admin' ? (
          <AdminDashboard onGroupsChanged={loadGroups} />
        ) : activeGroup ? (
          <ChatRoom
            group={activeGroup}
            currentUser={profile}
            onGroupUpdated={(updated) => {
              setActiveGroup(updated);
              loadGroups();
            }}
            onGroupDeleted={(deletedId) => {
              setActiveGroup(null);
              setGroups((prev) => prev.filter((g) => g.id !== deletedId));
            }}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center text-slate-400 text-sm p-6 text-center">
            {isStaffOrAdmin
              ? 'Select a group or click any colleague under Direct 1-on-1 Staff Chat.'
              : 'You have not been added to any department groups yet.'}
          </div>
        )}
      </main>
    </div>
  );
}