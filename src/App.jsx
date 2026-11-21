import React, { useState, useEffect, useRef } from 'react';
import { supabase } from './supabaseClient';
import AuthScreen from './components/AuthScreen';
import ChatRoom from './components/ChatRoom';
import AdminDashboard from './components/AdminDashboard';
import { LogOut, Plus, Shield, MessageCircle, Menu, X, GraduationCap, Bell } from 'lucide-react';

export default function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [profileError, setProfileError] = useState('');
  const [groups, setGroups] = useState([]);
  const [activeGroup, setActiveGroup] = useState(null);
  const [viewAdmin, setViewAdmin] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [showNewGroup, setShowNewGroup] = useState(false);

  // Track unread message counts per group ID & toast banner
  const [unreadCounts, setUnreadCounts] = useState({});
  const [toastAlert, setToastAlert] = useState(null);
  const activeGroupRef = useRef(null);

  useEffect(() => {
    activeGroupRef.current = activeGroup;
  }, [activeGroup]);

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
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Global Realtime listener for new messages across all user groups
  useEffect(() => {
    if (!profile) return;

    // Request browser notification permission once
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }

    const globalChannel = supabase
      .channel('global-uni-messages')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        async (payload) => {
          const newMsg = payload.new;
          if (newMsg.sender_id === profile.id) return; // Ignore own messages

          // Play subtle notification chime
          playNotificationChime();

          // If user isn't currently viewing this group, increment unread badge
          if (!activeGroupRef.current || activeGroupRef.current.id !== newMsg.group_id) {
            setUnreadCounts((prev) => ({
              ...prev,
              [newMsg.group_id]: (prev[newMsg.group_id] || 0) + 1,
            }));
          }

          // Show in-app toast banner
          setToastAlert(newMsg.content || `New attachment: ${newMsg.file_name || 'Media'}`);
          setTimeout(() => setToastAlert(null), 5000);

          // Trigger system/browser notification if tab is in background
          if ('Notification' in window && Notification.permission === 'granted' && document.hidden) {
            new Notification('uni_mate • New Announcement', {
              body: newMsg.content || `New file shared: ${newMsg.file_name}`,
            });
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'group_members', filter: `user_id=eq.${profile.id}` },
        () => loadGroups() // Auto-refresh sidebar if user is added/removed from a group
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
      // Ignore if browser blocks audio before first user click
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
  }

  async function loadGroups() {
    const { data } = await supabase.from('groups').select('*').order('created_at', { ascending: false });
    if (data) {
      setGroups(data);
      if (data.length > 0 && !activeGroupRef.current) setActiveGroup(data[0]);
    }
  }

  async function handleCreateGroup(e) {
    e.preventDefault();
    if (!newGroupName.trim()) return;
    const { data: grp, error } = await supabase
      .from('groups')
      .insert([{ name: newGroupName, department: profile.department, created_by: profile.id }])
      .select()
      .single();

    if (!error && grp) {
      await supabase.from('group_members').insert([{ group_id: grp.id, user_id: profile.id }]);
      setNewGroupName('');
      setShowNewGroup(false);
      loadGroups();
      setActiveGroup(grp);
      setViewAdmin(false);
    }
  }

  function selectGroup(grp) {
    setActiveGroup(grp);
    setViewAdmin(false);
    setMobileMenuOpen(false);
    // Clear unread badge for opened group
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
          className="bg-brand-maroon text-white px-4 py-2 rounded-xl text-xs font-semibold"
        >
          Sign Out & Retry
        </button>
      </div>
    );
  }

  if (!profile) {
    return <div className="h-screen flex items-center justify-center text-brand-maroon font-semibold">Loading uni_mate...</div>;
  }

  const isStaffOrAdmin = profile.role === 'admin' || profile.role === 'staff';
  const totalUnread = Object.values(unreadCounts).reduce((a, b) => a + b, 0);

  return (
    <div className="h-screen flex flex-col md:flex-row bg-slate-100 overflow-hidden relative">
      {/* Live In-App Toast Notification */}
      {toastAlert && (
        <div className="fixed bottom-16 right-4 z-50 bg-slate-900 text-white px-4 py-3 rounded-2xl shadow-xl border border-amber-400/40 flex items-center gap-3 max-w-xs animate-bounce">
          <Bell size={18} className="text-amber-400 shrink-0" />
          <div className="text-xs truncate">
            <p className="font-bold text-amber-300">New Announcement</p>
            <p className="truncate text-slate-200">{toastAlert}</p>
          </div>
        </div>
      )}

      {/* Mobile Top Navbar */}
      <div className="md:hidden bg-brand-maroon text-white px-4 py-3 flex items-center justify-between shadow">
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
        <div className="p-4 bg-brand-maroon text-white hidden md:flex items-center justify-between">
          <div className="flex items-center gap-2 font-extrabold text-lg">
            <GraduationCap size={24} className="text-amber-300" />
            <span>uni_mate</span>
          </div>
          <span className="text-[10px] uppercase bg-white/20 px-2 py-0.5 rounded-full font-semibold">
            {profile.role}
          </span>
        </div>

        {/* User Card */}
        <div className="p-4 bg-brand-light border-b border-red-100 flex items-center justify-between">
          <div>
            <p className="font-bold text-sm text-slate-800">{profile.full_name}</p>
            <p className="text-xs text-brand-maroon font-medium">{profile.designation || profile.role}</p>
          </div>
          <button
            onClick={() => supabase.auth.signOut()}
            title="Sign Out"
            className="p-2 text-slate-500 hover:text-red-600 rounded-lg hover:bg-white transition"
          >
            <LogOut size={18} />
          </button>
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

        {/* Group List Header */}
        <div className="px-4 pt-4 pb-2 flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Channels & Groups</span>
          {isStaffOrAdmin && (
            <button
              onClick={() => setShowNewGroup(!showNewGroup)}
              className="text-xs flex items-center gap-1 text-brand-maroon font-bold hover:underline"
            >
              <Plus size={14} /> New Group
            </button>
          )}
        </div>

        {showNewGroup && (
          <form onSubmit={handleCreateGroup} className="px-4 pb-3 flex gap-1.5">
            <input
              type="text"
              placeholder="e.g. CSE TY Notices"
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              className="flex-1 px-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:border-brand-maroon"
            />
            <button type="submit" className="bg-brand-maroon text-white text-xs px-3 py-1.5 rounded-lg font-semibold">
              Add
            </button>
          </form>
        )}

        {/* Groups List */}
        <div className="flex-1 overflow-y-auto px-3 space-y-1">
          {groups.map((grp) => {
            const unread = unreadCounts[grp.id] || 0;
            const isSelected = !viewAdmin && activeGroup?.id === grp.id;

            return (
              <button
                key={grp.id}
                onClick={() => selectGroup(grp)}
                className={`w-full text-left px-3 py-3 rounded-xl flex items-center justify-between transition ${
                  isSelected
                    ? 'bg-brand-maroon text-white shadow-sm'
                    : 'text-slate-700 hover:bg-slate-100'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <MessageCircle size={18} className={isSelected ? 'text-amber-300 shrink-0' : 'text-brand-maroon shrink-0'} />
                  <div className="truncate">
                    <p className="text-sm font-semibold truncate">{grp.name}</p>
                    <p className={`text-[11px] truncate ${isSelected ? 'text-red-100' : 'text-slate-400'}`}>
                      {grp.department || 'University Broadcast'}
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
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col h-full overflow-hidden">
        {viewAdmin && profile.role === 'admin' ? (
          <AdminDashboard />
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
              ? 'Create your first department or staff group from the sidebar.'
              : 'You have not been added to any department groups yet.'}
          </div>
        )}
      </main>
    </div>
  );
}