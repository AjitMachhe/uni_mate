import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import AuthScreen from './components/AuthScreen';
import ChatRoom from './components/ChatRoom';
import AdminDashboard from './components/AdminDashboard';
import { LogOut, Plus, Shield, MessageCircle, Menu, X, GraduationCap } from 'lucide-react';

export default function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [groups, setGroups] = useState([]);
  const [activeGroup, setActiveGroup] = useState(null);
  const [viewAdmin, setViewAdmin] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [showNewGroup, setShowNewGroup] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) loadProfile(session.user.id);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) loadProfile(session.user.id);
      else { setProfile(null); setGroups([]); }
    });

    return () => subscription.unsubscribe();
  }, []);

const [profileError, setProfileError] = useState('');

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
      if (data.length > 0 && !activeGroup) setActiveGroup(data[0]);
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
  if (!profile) return <div className="h-screen flex items-center justify-center text-brand-maroon font-semibold">Loading uni_mate...</div>;

  const isStaffOrAdmin = profile.role === 'admin' || profile.role === 'staff';

  return (
    <div className="h-screen flex flex-col md:flex-row bg-slate-100 overflow-hidden">
      {/* Mobile Top Navbar */}
      <div className="md:hidden bg-brand-maroon text-white px-4 py-3 flex items-center justify-between shadow">
        <div className="flex items-center gap-2 font-bold">
          <GraduationCap size={22} className="text-amber-300" />
          <span>uni_mate</span>
        </div>
        <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="p-1">
          {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* Sidebar (Groups & Controls) */}
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
          {groups.map((grp) => (
            <button
              key={grp.id}
              onClick={() => { setActiveGroup(grp); setViewAdmin(false); setMobileMenuOpen(false); }}
              className={`w-full text-left px-3 py-3 rounded-xl flex items-center gap-3 transition ${
                !viewAdmin && activeGroup?.id === grp.id
                  ? 'bg-brand-maroon text-white shadow-sm'
                  : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              <MessageCircle size={18} className={!viewAdmin && activeGroup?.id === grp.id ? 'text-amber-300' : 'text-brand-maroon'} />
              <div className="truncate">
                <p className="text-sm font-semibold truncate">{grp.name}</p>
                <p className={`text-[11px] truncate ${!viewAdmin && activeGroup?.id === grp.id ? 'text-red-100' : 'text-slate-400'}`}>
                  {grp.department || 'University Broadcast'}
                </p>
              </div>
            </button>
          ))}
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col h-full overflow-hidden">
        {viewAdmin && profile.role === 'admin' ? (
          <AdminDashboard onSelectGroup={(g) => { setActiveGroup(g); setViewAdmin(false); }} />
        ) : activeGroup ? (
          <ChatRoom group={activeGroup} currentUser={profile} />
        ) : (
          <div className="flex-1 flex items-center justify-center text-slate-400 text-sm p-6 text-center">
            {isStaffOrAdmin ? 'Create your first department or staff group from the sidebar.' : 'You have not been added to any department groups yet.'}
          </div>
        )}
      </main>
    </div>
  );
}

//////////////////////////////////////////////////////////////////////////////
// import { useState } from 'react'
// import heroImg from './assets/hero.png'
// import reactLogo from './assets/react.svg'
// import viteLogo from './assets/vite.svg'
// import './App.css'

// function App() {
//   const [count, setCount] = useState(0)

//   return (
//     <>
//       <section id="center">
//         <div className="hero">
//           <img src={heroImg} className="base" width="170" height="179" alt="" />
//           <img src={reactLogo} className="framework" alt="React logo" />
//           <img src={viteLogo} className="vite" alt="Vite logo" />
//         </div>
//         <div>
//           <h1>Get started</h1>
//           <p>
//             Edit <code>src/App.jsx</code> and save to test <code>HMR</code>
//           </p>
//         </div>
//         <button
//           type="button"
//           className="counter"
//           onClick={() => setCount((count) => count + 1)}
//         >
//           Count is {count}
//         </button>
//       </section>

//       <div className="ticks"></div>

//       <section id="next-steps">
//         <div id="docs">
//           <svg className="icon" role="presentation" aria-hidden="true">
//             <use href="/icons.svg#documentation-icon"></use>
//           </svg>
//           <h2>Documentation</h2>
//           <p>Your questions, answered</p>
//           <ul>
//             <li>
//               <a href="https://vite.dev/" target="_blank">
//                 <img className="logo" src={viteLogo} alt="" />
//                 Explore Vite
//               </a>
//             </li>
//             <li>
//               <a href="https://react.dev/" target="_blank">
//                 <img className="button-icon" src={reactLogo} alt="" />
//                 Learn more
//               </a>
//             </li>
//           </ul>
//         </div>
//         <div id="social">
//           <svg className="icon" role="presentation" aria-hidden="true">
//             <use href="/icons.svg#social-icon"></use>
//           </svg>
//           <h2>Connect with us</h2>
//           <p>Join the Vite community</p>
//           <ul>
//             <li>
//               <a href="https://github.com/vitejs/vite" target="_blank">
//                 <svg
//                   className="button-icon"
//                   role="presentation"
//                   aria-hidden="true"
//                 >
//                   <use href="/icons.svg#github-icon"></use>
//                 </svg>
//                 GitHub
//               </a>
//             </li>
//             <li>
//               <a href="https://chat.vite.dev/" target="_blank">
//                 <svg
//                   className="button-icon"
//                   role="presentation"
//                   aria-hidden="true"
//                 >
//                   <use href="/icons.svg#discord-icon"></use>
//                 </svg>
//                 Discord
//               </a>
//             </li>
//             <li>
//               <a href="https://x.com/vite_js" target="_blank">
//                 <svg
//                   className="button-icon"
//                   role="presentation"
//                   aria-hidden="true"
//                 >
//                   <use href="/icons.svg#x-icon"></use>
//                 </svg>
//                 X.com
//               </a>
//             </li>
//             <li>
//               <a href="https://bsky.app/profile/vite.dev" target="_blank">
//                 <svg
//                   className="button-icon"
//                   role="presentation"
//                   aria-hidden="true"
//                 >
//                   <use href="/icons.svg#bluesky-icon"></use>
//                 </svg>
//                 Bluesky
//               </a>
//             </li>
//           </ul>
//         </div>
//       </section>

//       <div className="ticks"></div>
//       <section id="spacer"></section>
//     </>
//   )
// }

// export default App
