import React, { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import { supabase } from '../supabaseClient';
import {
  Shield, Check, X, Trash2, MessageSquare, Users, UserPlus,
  FolderKanban, Pencil, Search, GraduationCap, Palette, RotateCcw,
  KeyRound, FileSpreadsheet, Download, Upload
} from 'lucide-react';

const tempAuthClient = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

export default function AdminDashboard({ onGroupsChanged }) {
  const [activeTab, setActiveTab] = useState('groups');
  const [requests, setRequests] = useState([]);
  const [allGroups, setAllGroups] = useState([]);
  const [allProfiles, setAllProfiles] = useState([]);
  const [recentMessages, setRecentMessages] = useState([]);
  const [creating, setCreating] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');

  // Bulk CSV Import state
  const [csvLogs, setCsvLogs] = useState([]);
  const [importingCsv, setImportingCsv] = useState(false);

  // Admin Reset Password Modal state
  const [resetTargetUser, setResetTargetUser] = useState(null);
  const [resetPwdValue, setResetPwdValue] = useState('');
  const [resetPwdStatus, setResetPwdStatus] = useState('');
  const [resettingPwd, setResettingPwd] = useState(false);

  // Global Chat Bubble Theme Studio state
  const [themeColors, setThemeColors] = useState({
    admin_bg_color: '#fff5f5',
    admin_border_color: '#800000',
    staff_bg_color: '#eef2ff',
    staff_border_color: '#4338ca',
  });
  const [savingColors, setSavingColors] = useState(false);
  const [colorSavedToast, setColorSavedToast] = useState('');

  // Group rename state
  const [editingGroupId, setEditingGroupId] = useState(null);
  const [editedGroupName, setEditedGroupName] = useState('');

  // Directory & Feed filter states
  const [userFilter, setUserFilter] = useState('all');
  const [userSearch, setUserSearch] = useState('');
  const [feedSearch, setFeedSearch] = useState('');

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
    const { data: settings } = await supabase.from('app_settings').select('*').eq('id', 1).maybeSingle();
    if (settings) {
      setThemeColors({
        admin_bg_color: settings.admin_bg_color || '#fff5f5',
        admin_border_color: settings.admin_border_color || '#800000',
        staff_bg_color: settings.staff_bg_color || '#eef2ff',
        staff_border_color: settings.staff_border_color || '#4338ca',
      });
    }

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
    if (grps) {
      setAllGroups(grps.filter((g) => !g.description?.startsWith('dm:')));
    }

    const { data: profs } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false });
    if (profs) setAllProfiles(profs);

    const { data: msgs } = await supabase
      .from('messages')
      .select('*, profiles(full_name, designation), groups(name)')
      .order('created_at', { ascending: false })
      .limit(100);
    if (msgs) setRecentMessages(msgs);
  }

  // Download sample CSV template for Excel
  function handleDownloadCsvTemplate() {
    const sampleCsv = [
      'full_name,username,password,role,designation,department,group_name',
      'Rohan Patil,rohan_cse,rohan123,student,TY BTech Student,CSE,CSE TY Notices',
      'Suresh Patil,suresh_parent,suresh123,parent,Parent (TY CSE),CSE,CSE TY Notices',
      'Dr. Priya Kulkarni,priya_hod,priya123,staff,HoD Food Tech,Food Tech,Food Tech.',
    ].join('\n');

    const blob = new Blob([sampleCsv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'uni_mate_bulk_users_template.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  // Parse and batch-import CSV rows
  async function handleCsvFileUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportingCsv(true);
    setCsvLogs(['Reading CSV file...']);

    const text = await file.text();
    const lines = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);

    if (lines.length < 2) {
      setCsvLogs(['Error: CSV must contain a header row and at least one user row.']);
      setImportingCsv(false);
      e.target.value = '';
      return;
    }

    const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
    const idx = {
      full_name: headers.indexOf('full_name'),
      username: headers.indexOf('username'),
      password: headers.indexOf('password'),
      role: headers.indexOf('role'),
      designation: headers.indexOf('designation'),
      department: headers.indexOf('department'),
      group_name: headers.indexOf('group_name'),
    };

    if (idx.full_name === -1 || idx.username === -1 || idx.password === -1) {
      setCsvLogs(['Error: Missing required columns (full_name, username, password). Download the sample template first.']);
      setImportingCsv(false);
      e.target.value = '';
      return;
    }

    const logs = [];
    let successCount = 0;

    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',').map((c) => c.trim());
      const fullName = cols[idx.full_name] || '';
      const rawUsername = (cols[idx.username] || '').toLowerCase().replace(/\s+/g, '');
      const password = cols[idx.password] || '';
      const rawRole = (cols[idx.role] || 'student').toLowerCase();
      const role = ['admin', 'staff', 'student', 'parent'].includes(rawRole) ? rawRole : 'student';
      const designation = cols[idx.designation] || role;
      const department = cols[idx.department] || '';
      const groupName = idx.group_name !== -1 ? cols[idx.group_name] || '' : '';

      if (!fullName || !rawUsername || password.length < 6) {
        logs.push(`Row ${i + 1} skipped (${fullName || 'Blank'}): Missing name/username or password < 6 chars.`);
        continue;
      }

      const authEmail = rawUsername.includes('@') ? rawUsername : `${rawUsername}@gmail.com`;

      const { data: authData, error: authErr } = await tempAuthClient.auth.signUp({
        email: authEmail,
        password,
      });

      if (authErr || !authData?.user) {
        logs.push(`Row ${i + 1} failed (${rawUsername}): ${authErr?.message || 'Auth creation failed'}`);
        continue;
      }

      const { error: profErr } = await supabase.from('profiles').insert([
        {
          id: authData.user.id,
          full_name: fullName,
          email: authEmail,
          role,
          designation,
          department,
        },
      ]);

      if (profErr) {
        logs.push(`Row ${i + 1} profile error (${rawUsername}): ${profErr.message}`);
        continue;
      }

      // Auto-assign to matching group if group_name column is provided
      let groupNote = '';
      if (groupName) {
        const matchedGroup = allGroups.find(
          (g) => g.name.trim().toLowerCase() === groupName.trim().toLowerCase()
        );
        if (matchedGroup) {
          const { error: memErr } = await supabase
            .from('group_members')
            .insert([{ group_id: matchedGroup.id, user_id: authData.user.id }]);
          groupNote = memErr ? ` (group assign failed: ${memErr.message})` : ` → Added to "${matchedGroup.name}"`;
        } else {
          groupNote = ` (Group "${groupName}" not found)`;
        }
      }

      successCount++;
      logs.push(`Row ${i + 1} OK: ${fullName} (${rawUsername})${groupNote}`);
    }

    logs.unshift(`Completed: ${successCount} of ${lines.length - 1} accounts created.`);
    setCsvLogs(logs);
    setImportingCsv(false);
    e.target.value = '';
    loadAdminData();
    if (onGroupsChanged) onGroupsChanged();
  }

  async function handleAdminResetPassword(e) {
    e.preventDefault();
    if (!resetTargetUser || resetPwdValue.trim().length < 6) {
      setResetPwdStatus('Password must be at least 6 characters.');
      return;
    }
    setResettingPwd(true);
    setResetPwdStatus('');

    const { error } = await supabase.rpc('admin_reset_user_password', {
      target_user_id: resetTargetUser.id,
      new_password: resetPwdValue.trim(),
    });

    setResettingPwd(false);
    if (error) {
      setResetPwdStatus(`Error: ${error.message}`);
    } else {
      setResetPwdStatus(`Password updated! Share new password: ${resetPwdValue.trim()}`);
    }
  }

  async function handleSaveGlobalColors() {
    setSavingColors(true);
    setColorSavedToast('');
    const { error } = await supabase
      .from('app_settings')
      .upsert({ id: 1, ...themeColors, updated_at: new Date().toISOString() });

    setSavingColors(false);
    if (error) {
      setColorSavedToast(`Error: ${error.message}`);
    } else {
      setColorSavedToast('Bubble colors saved & applied live across all chats!');
      setTimeout(() => setColorSavedToast(''), 3500);
    }
  }

  async function handleUpdateUserBubbleColor(userId, field, hexValue) {
    setAllProfiles((prev) =>
      prev.map((p) => (p.id === userId ? { ...p, [field]: hexValue } : p))
    );
    await supabase.from('profiles').update({ [field]: hexValue }).eq('id', userId);
  }

  async function handleResetUserBubbleColor(userId) {
    setAllProfiles((prev) =>
      prev.map((p) => (p.id === userId ? { ...p, bubble_bg_color: null, bubble_border_color: null } : p))
    );
    await supabase
      .from('profiles')
      .update({ bubble_bg_color: null, bubble_border_color: null })
      .eq('id', userId);
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

  async function handleDeleteUser(userObj) {
    if (userObj.role === 'admin') {
      alert('Super Admin accounts cannot be deleted here.');
      return;
    }
    if (!window.confirm(`Permanently delete user "${userObj.full_name}"? They will immediately lose login access.`)) {
      return;
    }

    const { error } = await supabase.rpc('admin_delete_user', {
      target_user_id: userObj.id,
    });

    if (error) {
      alert(`Failed to delete user: ${error.message}`);
    } else {
      loadAdminData();
      if (onGroupsChanged) onGroupsChanged();
    }
  }

  async function updateRequestStatus(id, status) {
    await supabase.from('access_requests').update({ status }).eq('id', id);
    loadAdminData();
  }

  async function deleteMessage(id) {
    if (!window.confirm('Permanently erase this message from database?')) return;
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

  const tabs = [
    { id: 'groups', label: `Groups (${allGroups.length})`, icon: FolderKanban },
    { id: 'directory', label: `Members & Passwords (${allProfiles.length})`, icon: GraduationCap },
    { id: 'create', label: `Create & Bulk CSV${requests.length ? ` (${requests.length})` : ''}`, icon: UserPlus },
    { id: 'appearance', label: 'Bubble Studio', icon: Palette },
    { id: 'feed', label: 'Audit Feed', icon: MessageSquare },
  ];

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-5 overflow-y-auto h-full">
      {/* Admin Reset Any User Password Modal */}
      {resetTargetUser && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                <KeyRound size={16} className="text-[#800000]" /> Reset User Password
              </h3>
              <button
                onClick={() => {
                  setResetTargetUser(null);
                  setResetPwdValue('');
                  setResetPwdStatus('');
                }}
                className="text-slate-400 hover:text-slate-700"
              >
                <X size={18} />
              </button>
            </div>

            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs">
              <p className="font-bold text-slate-800">{resetTargetUser.full_name}</p>
              <p className="text-slate-500 font-mono mt-0.5">
                Login ID: {resetTargetUser.email.replace('@gmail.com', '')} • {resetTargetUser.role}
              </p>
            </div>

            {resetPwdStatus && (
              <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-950 font-semibold select-all">
                {resetPwdStatus}
              </div>
            )}

            <form onSubmit={handleAdminResetPassword} className="space-y-3">
              <div className="flex gap-1.5">
                <input
                  type="text"
                  required
                  minLength={6}
                  placeholder="Enter new password (min 6 chars)"
                  value={resetPwdValue}
                  onChange={(e) => setResetPwdValue(e.target.value)}
                  className="flex-1 px-3 py-2 border border-slate-300 rounded-xl text-xs focus:outline-none focus:border-[#800000]"
                />
                <button
                  type="button"
                  onClick={() => setResetPwdValue(Math.random().toString(36).slice(-6) + 'A1')}
                  className="px-2.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-[11px] font-semibold"
                >
                  Auto
                </button>
              </div>
              <button
                type="submit"
                disabled={resettingPwd}
                className="w-full bg-[#800000] hover:bg-[#5a0000] text-white py-2.5 rounded-xl text-xs font-bold transition"
              >
                {resettingPwd ? 'Updating...' : 'Save New Password'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Header Banner */}
      <div className="bg-gradient-to-r from-[#800000] to-[#5a0000] text-white p-5 rounded-2xl shadow-md flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Shield size={22} className="text-amber-400" /> Super Admin Control Center
          </h2>
          <p className="text-xs text-red-100 mt-1">Manage groups, members, bulk CSV onboarding, colors, and audit logs</p>
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

      {/* Navigation Tabs */}
      <div className="bg-white p-1.5 rounded-2xl shadow-sm border border-slate-200 flex flex-wrap gap-1.5">
        {tabs.map((t) => {
          const Icon = t.icon;
          const isActive = activeTab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition ${
                isActive
                  ? 'bg-[#800000] text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <Icon size={15} className={isActive ? 'text-amber-300' : 'text-slate-400'} />
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>

      {/* TAB 1: MANAGE GROUPS */}
      {activeTab === 'groups' && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
          <h3 className="font-bold text-slate-800 mb-3 flex items-center gap-2 text-sm">
            <FolderKanban size={18} className="text-[#800000]" /> Manage All University Groups ({allGroups.length})
          </h3>
          {allGroups.length === 0 ? (
            <p className="text-xs text-slate-500">No groups created yet. Use "+ New Group" in the sidebar to create one.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {allGroups.map((grp) => (
                <div key={grp.id} className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between gap-2">
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
                        <p className="font-bold text-sm text-slate-800 truncate">
                          {grp.name}{' '}
                          {grp.is_staff_only && (
                            <span className="ml-1.5 text-[10px] bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded-full font-semibold">
                              Staff Only
                            </span>
                          )}
                        </p>
                        <p className="text-[11px] text-slate-500 mt-0.5">
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
      )}

      {/* TAB 2: MEMBERS DIRECTORY, PASSWORD RESET & CUSTOM BUBBLE COLORS */}
      {activeTab === 'directory' && (
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

          <div className="overflow-x-auto max-h-[28rem] overflow-y-auto border border-slate-100 rounded-xl">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="bg-slate-100 text-slate-600 uppercase text-[10px] sticky top-0">
                <tr>
                  <th className="py-2.5 px-3">Full Name</th>
                  <th className="py-2.5 px-3">Login ID</th>
                  <th className="py-2.5 px-3">Role</th>
                  <th className="py-2.5 px-3">Department</th>
                  <th className="py-2.5 px-3">Bubble (Fill / Border)</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
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

                  const isPoster = p.role === 'admin' || p.role === 'staff';

                  return (
                    <tr key={p.id} className="hover:bg-slate-50">
                      <td className="py-2.5 px-3">
                        <p className="font-semibold text-slate-800">{p.full_name}</p>
                        <p className="text-[10px] text-slate-500">{p.designation || '-'}</p>
                      </td>
                      <td className="py-2.5 px-3 text-slate-600 font-mono">{displayUsername}</td>
                      <td className="py-2.5 px-3">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${badgeColor}`}>
                          {p.role}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-slate-600">{p.department || '-'}</td>
                      <td className="py-2.5 px-3">
                        {isPoster ? (
                          <div className="flex items-center gap-2">
                            <input
                              type="color"
                              title="Custom Fill Color"
                              value={p.bubble_bg_color || (p.role === 'admin' ? themeColors.admin_bg_color : themeColors.staff_bg_color)}
                              onChange={(e) => handleUpdateUserBubbleColor(p.id, 'bubble_bg_color', e.target.value)}
                              className="w-6 h-6 rounded cursor-pointer border border-slate-200"
                            />
                            <input
                              type="color"
                              title="Custom Border Color"
                              value={p.bubble_border_color || (p.role === 'admin' ? themeColors.admin_border_color : themeColors.staff_border_color)}
                              onChange={(e) => handleUpdateUserBubbleColor(p.id, 'bubble_border_color', e.target.value)}
                              className="w-6 h-6 rounded cursor-pointer border border-slate-200"
                            />
                            {(p.bubble_bg_color || p.bubble_border_color) && (
                              <button
                                onClick={() => handleResetUserBubbleColor(p.id)}
                                title="Reset to role default"
                                className="text-[10px] text-slate-400 hover:text-slate-700 underline"
                              >
                                Reset
                              </button>
                            )}
                          </div>
                        ) : (
                          <span className="text-[10px] text-slate-400">Read-only</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <div className="inline-flex items-center gap-1">
                          <button
                            onClick={() => {
                              setResetTargetUser(p);
                              setResetPwdValue('');
                              setResetPwdStatus('');
                            }}
                            title={`Reset password for ${p.full_name}`}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 text-[11px] font-semibold transition"
                          >
                            <KeyRound size={12} /> Reset Pwd
                          </button>
                          {p.role !== 'admin' && (
                            <button
                              onClick={() => handleDeleteUser(p)}
                              title={`Delete ${p.full_name}`}
                              className="text-slate-400 hover:text-red-600 p-1.5 rounded-lg hover:bg-red-50 transition"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: BULK CSV UPLOAD, CREATE SINGLE USER & ACCESS REQUESTS */}
      {activeTab === 'create' && (
        <div className="space-y-5">
          {/* Bulk CSV Onboarding Card */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-bold text-slate-800 flex items-center gap-2 text-sm">
                  <FileSpreadsheet size={18} className="text-emerald-700" /> Bulk CSV Student / Parent / Staff Import
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Upload a CSV file to generate logins in bulk and auto-assign users to their department group
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleDownloadCsvTemplate}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-semibold transition"
                >
                  <Download size={14} /> Sample CSV
                </button>

                <label className="cursor-pointer flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold shadow-sm transition">
                  <Upload size={14} />
                  <span>{importingCsv ? 'Importing...' : 'Upload CSV'}</span>
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    disabled={importingCsv}
                    onChange={handleCsvFileUpload}
                    className="hidden"
                  />
                </label>
              </div>
            </div>

            {csvLogs.length > 0 && (
              <div className="p-3 rounded-xl bg-slate-900 text-slate-100 text-[11px] font-mono max-h-40 overflow-y-auto space-y-1">
                {csvLogs.map((line, i) => (
                  <p key={i} className={line.includes('OK') || line.includes('Completed') ? 'text-emerald-400' : 'text-amber-300'}>
                    {line}
                  </p>
                ))}
              </div>
            )}
          </div>

          {/* Single User Creation Form */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
            <h3 className="font-bold text-slate-800 mb-3 flex items-center gap-2 text-sm">
              <UserPlus size={18} className="text-[#800000]" /> Create Single Member Account
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

          {/* Pending Access Requests */}
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
        </div>
      )}

      {/* TAB 4: CHAT BUBBLE APPEARANCE STUDIO */}
      {activeTab === 'appearance' && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="font-bold text-slate-800 flex items-center gap-2 text-sm">
                <Palette size={18} className="text-[#800000]" /> Chat Bubble Appearance Studio
              </h3>
              <p className="text-xs text-slate-500">Customize message background fill and left accent border colors live</p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  setThemeColors({
                    admin_bg_color: '#fff5f5',
                    admin_border_color: '#800000',
                    staff_bg_color: '#eef2ff',
                    staff_border_color: '#4338ca',
                  })
                }
                className="text-xs px-3 py-1.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 flex items-center gap-1"
              >
                <RotateCcw size={13} /> Reset Defaults
              </button>
              <button
                type="button"
                onClick={handleSaveGlobalColors}
                disabled={savingColors}
                className="bg-[#800000] hover:bg-[#5a0000] text-white text-xs font-bold px-4 py-1.5 rounded-xl shadow-sm transition"
              >
                {savingColors ? 'Saving...' : 'Apply Colors Live'}
              </button>
            </div>
          </div>

          {colorSavedToast && (
            <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 font-semibold">
              {colorSavedToast}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
              <p className="text-xs font-bold text-slate-700 uppercase tracking-wider">Super Admin Message Bubble</p>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
                  <input
                    type="color"
                    value={themeColors.admin_bg_color}
                    onChange={(e) => setThemeColors({ ...themeColors, admin_bg_color: e.target.value })}
                    className="w-8 h-8 rounded cursor-pointer border-0 bg-transparent"
                  />
                  <span>Fill Color</span>
                </label>
                <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
                  <input
                    type="color"
                    value={themeColors.admin_border_color}
                    onChange={(e) => setThemeColors({ ...themeColors, admin_border_color: e.target.value })}
                    className="w-8 h-8 rounded cursor-pointer border-0 bg-transparent"
                  />
                  <span>Border Color</span>
                </label>
              </div>
              <div
                style={{
                  backgroundColor: themeColors.admin_bg_color,
                  borderColor: `${themeColors.admin_border_color}33`,
                  borderLeftColor: themeColors.admin_border_color,
                }}
                className="rounded-r-lg rounded-l-none p-3 shadow-sm border border-l-4"
              >
                <p style={{ color: themeColors.admin_border_color }} className="text-xs font-bold">
                  Super Admin • <span className="text-slate-600 font-normal">University Office</span>
                </p>
                <p className="text-xs text-slate-800 mt-1">Preview: Official university circular message.</p>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
              <p className="text-xs font-bold text-slate-700 uppercase tracking-wider">Faculty / Staff Message Bubble</p>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
                  <input
                    type="color"
                    value={themeColors.staff_bg_color}
                    onChange={(e) => setThemeColors({ ...themeColors, staff_bg_color: e.target.value })}
                    className="w-8 h-8 rounded cursor-pointer border-0 bg-transparent"
                  />
                  <span>Fill Color</span>
                </label>
                <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
                  <input
                    type="color"
                    value={themeColors.staff_border_color}
                    onChange={(e) => setThemeColors({ ...themeColors, staff_border_color: e.target.value })}
                    className="w-8 h-8 rounded cursor-pointer border-0 bg-transparent"
                  />
                  <span>Border Color</span>
                </label>
              </div>
              <div
                style={{
                  backgroundColor: themeColors.staff_bg_color,
                  borderColor: `${themeColors.staff_border_color}33`,
                  borderLeftColor: themeColors.staff_border_color,
                }}
                className="rounded-r-lg rounded-l-none p-3 shadow-sm border border-l-4"
              >
                <p style={{ color: themeColors.staff_border_color }} className="text-xs font-bold">
                  HoD / Faculty • <span className="text-slate-600 font-normal">Department</span>
                </p>
                <p className="text-xs text-slate-800 mt-1">Preview: Department lecture & lab schedule update.</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: GLOBAL MESSAGE AUDIT FEED */}
      {activeTab === 'feed' && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <div>
              <h3 className="font-bold text-slate-800 flex items-center gap-2 text-sm">
                <MessageSquare size={18} className="text-[#800000]" /> Live University Communication Audit Feed
              </h3>
              <p className="text-[11px] text-slate-500">
                Messages deleted by Staff remain preserved here for Super Admin oversight
              </p>
            </div>

            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-2 text-slate-400" />
              <input
                type="text"
                value={feedSearch}
                onChange={(e) => setFeedSearch(e.target.value)}
                placeholder="Search all chats, senders, files..."
                className="pl-7 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none focus:border-[#800000] w-64"
              />
            </div>
          </div>

          <div className="space-y-3 max-h-[30rem] overflow-y-auto">
            {recentMessages
              .filter((m) => {
                const q = feedSearch.toLowerCase();
                if (!q) return true;
                return (
                  (m.content || '').toLowerCase().includes(q) ||
                  (m.file_name || '').toLowerCase().includes(q) ||
                  (m.profiles?.full_name || '').toLowerCase().includes(q) ||
                  (m.groups?.name || '').toLowerCase().includes(q)
                );
              })
              .map((m) => (
                <div
                  key={m.id}
                  className={`p-3 rounded-xl border flex items-start justify-between gap-3 ${
                    m.deleted_by_staff
                      ? 'bg-red-50/60 border-red-200'
                      : 'bg-slate-50 border-slate-100'
                  }`}
                >
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold text-[#800000]">{m.groups?.name}</span>
                      <span className="text-xs text-slate-500">
                        • {m.profiles?.full_name} ({m.profiles?.designation})
                      </span>
                      <span className="text-[10px] text-slate-400">
                        {new Date(m.created_at).toLocaleString()}
                      </span>
                      {m.deleted_by_staff && (
                        <span className="text-[10px] bg-red-600 text-white px-2 py-0.5 rounded-full font-bold">
                          Deleted by Staff
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-slate-800 mt-1">{m.content || `[Media: ${m.file_name}]`}</p>
                  </div>
                  <button
                    onClick={() => deleteMessage(m.id)}
                    title="Permanently erase from database"
                    className="text-slate-400 hover:text-red-600 p-1.5 rounded-lg hover:bg-red-50 transition shrink-0"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}