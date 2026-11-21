import React, { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import { supabase } from '../supabaseClient';
import {
  Shield, Check, X, Trash2, MessageSquare, Users, UserPlus,
  FolderKanban, Pencil, Search, GraduationCap
} from 'lucide-react';

const tempAuthClient = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

export default function AdminDashboard({ onGroupsChanged }) {
  const [requests, setRequests] = useState([]);
  const [allGroups, setAllGroups] = useState([]);
  const [allProfiles, setAllProfiles] = useState([]);
  const [recentMessages, setRecentMessages] = useState([]);
  const [creating, setCreating] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');

  // Group rename state
  const [editingGroupId, setEditingGroupId] = useState(null);
  const [editedGroupName, setEditedGroupName] = useState('');

  // Directory filter state
  const [userFilter, setUserFilter] = useState('all'); // 'all' | 'staff' | 'student' | 'parent'
  const [userSearch, setUserSearch] = useState('');

  const [newUser, setNewUser] = useState({
    full_name: '',
    username: '',
    password: '',
    role: 'student',
    designation: '',
    department: '',
  });

  useEffect(() => {
    loadAdminData();
  }, []);

  async function loadAdminData() {
    const { data: reqs } = await supabase
      .from('access_requests')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: false });
    if (reqs) setRequests(reqs);

    const { data: grps } = await supabase
      .from('groups')
      .select('*, group_members(count)')
      .order('created_at', { ascending: false });
    if (grps) setAllGroups(grps);

    const { data: profs } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false });
    if (profs) setAllProfiles(profs);

    const { data: msgs } = await supabase
      .from('messages')
      .select('*, profiles(full_name, designation), groups(name)')
      .order('created_at', { ascending: false })
      .limit(20);
    if (msgs) setRecentMessages(msgs);
  }

  function prefillFromRequest(req) {
    const mappedRole = ['Teaching Staff', 'Non-Teaching Staff', 'HoD / Dean / Director'].includes(req.requested_role)
      ? 'staff'
      : req.requested_role.toLowerCase();

    const suggestedUsername = req.full_name.trim().toLowerCase().replace(/\s+/g, '_');

    setNewUser({
      full_name: req.full_name,
      username: suggestedUsername,
      password: Math.random().toString(36).slice(-8) + 'A1',
      role: mappedRole,
      designation: req.requested_role,
      department: req.department,
    });
    setStatusMsg(`Prefilled for ${req.full_name}. Review username/password and click Create Account.`);
  }

  async function handleCreateUser(e) {
    e.preventDefault();
    setCreating(true);
    setStatusMsg('');

    const cleanUsername = newUser.username.trim().toLowerCase().replace(/\s+/g, '');
    const authEmail = cleanUsername.includes('@') ? cleanUsername : `${cleanUsername}@gmail.com`;

    const { data: authData, error: authError } = await tempAuthClient.auth.signUp({
      email: authEmail,
      password: newUser.password,
    });

    if (authError) {
      setStatusMsg(`Error: ${authError.message}`);
      setCreating(false);
      return;
    }

    if (authData?.user) {
      const { error: profError } = await supabase.from('profiles').insert([
        {
          id: authData.user.id,
          full_name: newUser.full_name,
          email: authEmail,
          role: newUser.role,
          designation: newUser.designation || newUser.role,
          department: newUser.department,
        },
      ]);

      if (profError) {
        setStatusMsg(`Account created, but profile failed: ${profError.message}`);
      } else {
        setStatusMsg(`Success! Share with user → Username: ${cleanUsername} | Password: ${newUser.password}`);
        setNewUser({ full_name: '', username: '', password: '', role: 'student', designation: '', department: '' });
        loadAdminData();
      }
    }
    setCreating(false);
  }

  async function handleRenameGroup(groupId) {
    const trimmed = editedGroupName.trim();
    if (!trimmed) {
      setEditingGroupId(null);
      return;
    }
    const { error } = await supabase.from('groups').update({ name: trimmed }).eq('id', groupId);
    if (!error) {
      setEditingGroupId(null);
      loadAdminData();
      if (onGroupsChanged) onGroupsChanged();
    }
  }

  async function handleDeleteGroup(grp) {
    if (!window.confirm(`Permanently delete group "${grp.name}" and all its messages?`)) return;
    const { error } = await supabase.from('groups').delete().eq('id', grp.id);
    if (!error) {
      loadAdminData();
      if (onGroupsChanged) onGroupsChanged();
    }
  }

  async function updateRequestStatus(id, status) {
    await supabase.from('access_requests').update({ status }).eq('id', id);
    loadAdminData();
  }

  async function deleteMessage(id) {
    if (!window.confirm('Delete this message permanently?')) return;
    await supabase.from('messages').delete().eq('id', id);
    loadAdminData();
  }

  const filteredProfiles = allProfiles.filter((p) => {
    const matchesRole = userFilter === 'all' || p.role === userFilter;
    const q = userSearch.toLowerCase();
    const matchesQuery =
      p.full_name.toLowerCase().includes(q) ||
      p.email.toLowerCase().includes(q) ||
      (p.department || '').toLowerCase().includes(q) ||
      (p.designation || '').toLowerCase().includes(q);
    return matchesRole && matchesQuery;
  });

  const staffCount = allProfiles.filter((p) => p.role === 'staff' || p.role === 'admin').length;
  const studentParentCount = allProfiles.filter((p) => p.role === 'student' || p.role === 'parent').length;

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-6 overflow-y-auto h-full">
      {/* Banner */}
      <div className="bg-gradient-to-r from-[#800000] to-[#5a0000] text-white p-5 rounded-2xl shadow-md flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Shield size={22} className="text-amber-400" /> Super Admin Control Center
          </h2>
          <p className="text-xs text-red-100 mt-1">Manage groups, directory, user credentials, and all messages</p>
        </div>
        <div className="flex items-center gap-5 text-right">
          <div>
            <span className="text-xl font-extrabold text-amber-400">{allGroups.length}</span>
            <p className="text-[10px] uppercase tracking-wider">Groups</p>
          </div>
          <div>
            <span className="text-xl font-extrabold text-amber-400">{staffCount}</span>
            <p className="text-[10px] uppercase tracking-wider">Staff</p>
          </div>
          <div>
            <span className="text-xl font-extrabold text-amber-400">{studentParentCount}</span>
            <p className="text-[10px] uppercase tracking-wider">Students/Parents</p>
          </div>
        </div>
      </div>

      {/* 1. Manage All University Groups (Rename & Delete) */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
        <h3 className="font-bold text-slate-800 mb-3 flex items-center gap-2 text-sm">
          <FolderKanban size={18} className="text-[#800000]" /> Manage All Groups ({allGroups.length})
        </h3>
        {allGroups.length === 0 ? (
          <p className="text-xs text-slate-500">No groups created yet.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {allGroups.map((grp) => (
              <div key={grp.id} className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between gap-2">
                {editingGroupId === grp.id ? (
                  <div className="flex items-center gap-1.5 flex-1">
                    <input
                      type="text"
                      value={editedGroupName}
                      onChange={(e) => setEditedGroupName(e.target.value)}
                      autoFocus
                      className="flex-1 px-2.5 py-1 bg-white border border-slate-300 rounded-lg text-xs font-bold focus:outline-none focus:border-[#800000]"
                    />
                    <button
                      onClick={() => handleRenameGroup(grp.id)}
                      className="p-1.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700"
                      title="Save"
                    >
                      <Check size={14} />
                    </button>
                    <button
                      onClick={() => setEditingGroupId(null)}
                      className="p-1.5 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300"
                      title="Cancel"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="min-w-0">
                      <p className="font-bold text-sm text-slate-800 truncate">{grp.name}</p>
                      <p className="text-[11px] text-slate-500">
                        {grp.department || 'General'} • {grp.group_members?.[0]?.count ?? 0} members
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={() => {
                          setEditingGroupId(grp.id);
                          setEditedGroupName(grp.name);
                        }}
                        title="Rename group"
                        className="flex items-center gap-1 px-2.5 py-1.5 bg-white border border-slate-200 hover:border-[#800000] text-slate-700 hover:text-[#800000] rounded-lg text-xs font-medium transition"
                      >
                        <Pencil size={13} /> Rename
                      </button>
                      <button
                        onClick={() => handleDeleteGroup(grp)}
                        title="Delete group"
                        className="p-1.5 bg-white border border-slate-200 hover:bg-red-50 hover:border-red-200 text-slate-500 hover:text-red-600 rounded-lg transition"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 2. University Directory: All Staff, Students & Parents */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <h3 className="font-bold text-slate-800 flex items-center gap-2 text-sm">
            <GraduationCap size={18} className="text-[#800000]" /> University Members Directory ({filteredProfiles.length})
          </h3>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-2 text-slate-400" />
              <input
                type="text"
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                placeholder="Search name, dept..."
                className="pl-7 pr-3 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none focus:border-[#800000]"
              />
            </div>
            <select
              value={userFilter}
              onChange={(e) => setUserFilter(e.target.value)}
              className="px-2.5 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium focus:outline-none focus:border-[#800000]"
            >
              <option value="all">All Roles ({allProfiles.length})</option>
              <option value="staff">Staff / Faculty</option>
              <option value="student">Students</option>
              <option value="parent">Parents</option>
              <option value="admin">Admins</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto max-h-72 overflow-y-auto border border-slate-100 rounded-xl">
          <table className="w-full text-left border-collapse text-xs">
            <thead className="bg-slate-100 text-slate-600 uppercase text-[10px] sticky top-0">
              <tr>
                <th className="py-2.5 px-3">Full Name</th>
                <th className="py-2.5 px-3">Login ID</th>
                <th className="py-2.5 px-3">Role</th>
                <th className="py-2.5 px-3">Designation</th>
                <th className="py-2.5 px-3">Department</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredProfiles.map((p) => {
                const displayUsername = p.email.endsWith('@gmail.com') ? p.email.replace('@gmail.com', '') : p.email;
                const badgeColor =
                  p.role === 'admin'
                    ? 'bg-red-100 text-[#800000]'
                    : p.role === 'staff'
                    ? 'bg-indigo-100 text-indigo-800'
                    : p.role === 'parent'
                    ? 'bg-teal-100 text-teal-800'
                    : 'bg-emerald-100 text-emerald-800';

                return (
                  <tr key={p.id} className="hover:bg-slate-50">
                    <td className="py-2.5 px-3 font-semibold text-slate-800">{p.full_name}</td>
                    <td className="py-2.5 px-3 text-slate-600 font-mono">{displayUsername}</td>
                    <td className="py-2.5 px-3">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${badgeColor}`}>
                        {p.role}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-slate-600">{p.designation || '-'}</td>
                    <td className="py-2.5 px-3 text-slate-600">{p.department || '-'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 3. Create User Account Form */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
        <h3 className="font-bold text-slate-800 mb-3 flex items-center gap-2 text-sm">
          <UserPlus size={18} className="text-[#800000]" /> Create Member Login Credentials
        </h3>

        {statusMsg && (
          <div className="mb-3 p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-950 font-semibold select-all">
            {statusMsg}
          </div>
        )}

        <form onSubmit={handleCreateUser} className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          <input
            type="text"
            required
            placeholder="Full Name (e.g. Amar Patil)"
            value={newUser.full_name}
            onChange={(e) => setNewUser({ ...newUser, full_name: e.target.value })}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-[#800000]"
          />
          <input
            type="text"
            required
            placeholder="Username (e.g. amar)"
            value={newUser.username}
            onChange={(e) => setNewUser({ ...newUser, username: e.target.value })}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-[#800000]"
          />
          <input
            type="text"
            required
            placeholder="Password (min 6 chars)"
            value={newUser.password}
            onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-[#800000]"
          />
          <select
            value={newUser.role}
            onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-[#800000]"
          >
            <option value="staff">Staff (HoD / Dean / Director / Faculty)</option>
            <option value="student">Student (Read & Download Only)</option>
            <option value="parent">Parent (Read & Download Only)</option>
            <option value="admin">Super Admin</option>
          </select>
          <input
            type="text"
            placeholder="Designation (e.g. HoD CSE, FY Student)"
            value={newUser.designation}
            onChange={(e) => setNewUser({ ...newUser, designation: e.target.value })}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-[#800000]"
          />
          <input
            type="text"
            placeholder="Department (e.g. CSE, Agri)"
            value={newUser.department}
            onChange={(e) => setNewUser({ ...newUser, department: e.target.value })}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-[#800000]"
          />
          <button
            type="submit"
            disabled={creating}
            className="sm:col-span-2 md:col-span-3 bg-[#800000] hover:bg-[#5a0000] text-white font-bold py-2.5 rounded-xl text-xs transition"
          >
            {creating ? 'Creating Account...' : 'Create Account & Generate Credentials'}
          </button>
        </form>
      </div>

      {/* 4. Pending Access Requests */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
        <h3 className="font-bold text-slate-800 mb-3 flex items-center gap-2 text-sm">
          <Users size={18} className="text-[#800000]" /> Pending Access Requests ({requests.length})
        </h3>
        {requests.length === 0 ? (
          <p className="text-xs text-slate-500">No pending requests right now.</p>
        ) : (
          <div className="space-y-3">
            {requests.map((r) => (
              <div key={r.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200">
                <div>
                  <p className="font-bold text-sm text-slate-800">
                    {r.full_name}{' '}
                    <span className="text-xs font-normal text-[#800000]">
                      ({r.requested_role} • {r.department})
                    </span>
                  </p>
                  <p className="text-xs text-slate-500">{r.email} | {r.phone}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => prefillFromRequest(r)}
                    className="bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs px-3 py-1.5 rounded-lg font-bold"
                  >
                    Fill Form
                  </button>
                  <button
                    onClick={() => updateRequestStatus(r.id, 'approved')}
                    className="flex items-center gap-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs px-3 py-1.5 rounded-lg font-medium"
                  >
                    <Check size={14} /> Done
                  </button>
                  <button
                    onClick={() => updateRequestStatus(r.id, 'rejected')}
                    className="flex items-center gap-1 bg-slate-200 hover:bg-red-100 hover:text-red-700 text-slate-700 text-xs px-3 py-1.5 rounded-lg font-medium"
                  >
                    <X size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 5. Global Message Audit Feed */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
        <h3 className="font-bold text-slate-800 mb-3 flex items-center gap-2 text-sm">
          <MessageSquare size={18} className="text-[#800000]" /> Live University Communication Feed
        </h3>
        <div className="space-y-3">
          {recentMessages.map((m) => (
            <div key={m.id} className="p-3 rounded-xl bg-slate-50 border border-slate-100 flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold text-[#800000]">{m.groups?.name}</span>
                  <span className="text-xs text-slate-500">
                    • {m.profiles?.full_name} ({m.profiles?.designation})
                  </span>
                </div>
                <p className="text-sm text-slate-800 mt-1">{m.content || `[Media: ${m.file_name}]`}</p>
              </div>
              <button
                onClick={() => deleteMessage(m.id)}
                title="Delete message"
                className="text-slate-400 hover:text-red-600 p-1.5 rounded-lg hover:bg-red-50 transition shrink-0"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}