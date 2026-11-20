import React, { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import { supabase } from '../supabaseClient';
import { Shield, Check, X, Trash2, MessageSquare, Users, UserPlus } from 'lucide-react';

const tempAuthClient = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

export default function AdminDashboard() {
  const [requests, setRequests] = useState([]);
  const [allGroups, setAllGroups] = useState([]);
  const [recentMessages, setRecentMessages] = useState([]);
  const [creating, setCreating] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');

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

    const { data: grps } = await supabase.from('groups').select('*').order('created_at', { ascending: false });
    if (grps) setAllGroups(grps);

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
      }
    }
    setCreating(false);
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

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-6 overflow-y-auto h-full">
      <div className="bg-gradient-to-r from-brand-maroon to-brand-dark text-white p-5 rounded-2xl shadow-md flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Shield size={22} className="text-amber-400" /> Super Admin Control Center
          </h2>
          <p className="text-xs text-red-100 mt-1">Create user credentials, approve requests, and audit all messages</p>
        </div>
        <div className="text-right hidden sm:block">
          <span className="text-2xl font-extrabold text-amber-400">{allGroups.length}</span>
          <p className="text-[11px] uppercase tracking-wider">Active Groups</p>
        </div>
      </div>

      {/* Create User Account Form */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
        <h3 className="font-bold text-slate-800 mb-3 flex items-center gap-2 text-sm">
          <UserPlus size={18} className="text-brand-maroon" /> Create Member Login Credentials
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
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-brand-maroon"
          />
          <input
            type="text"
            required
            placeholder="Username (e.g. amar)"
            value={newUser.username}
            onChange={(e) => setNewUser({ ...newUser, username: e.target.value })}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-brand-maroon"
          />
          <input
            type="text"
            required
            placeholder="Password (min 6 chars)"
            value={newUser.password}
            onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-brand-maroon"
          />
          <select
            value={newUser.role}
            onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-brand-maroon"
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
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-brand-maroon"
          />
          <input
            type="text"
            placeholder="Department (e.g. CSE, Agri)"
            value={newUser.department}
            onChange={(e) => setNewUser({ ...newUser, department: e.target.value })}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-brand-maroon"
          />
          <button
            type="submit"
            disabled={creating}
            className="sm:col-span-2 md:col-span-3 bg-brand-maroon hover:bg-brand-dark text-white font-bold py-2.5 rounded-xl text-xs transition"
          >
            {creating ? 'Creating Account...' : 'Create Account & Generate Credentials'}
          </button>
        </form>
      </div>

      {/* Pending Access Requests */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
        <h3 className="font-bold text-slate-800 mb-3 flex items-center gap-2 text-sm">
          <Users size={18} className="text-brand-maroon" /> Pending Access Requests ({requests.length})
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
                    <span className="text-xs font-normal text-brand-maroon">
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

      {/* Global Message Audit Feed */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
        <h3 className="font-bold text-slate-800 mb-3 flex items-center gap-2 text-sm">
          <MessageSquare size={18} className="text-brand-maroon" /> Live University Communication Feed
        </h3>
        <div className="space-y-3">
          {recentMessages.map((m) => (
            <div key={m.id} className="p-3 rounded-xl bg-slate-50 border border-slate-100 flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold text-brand-maroon">{m.groups?.name}</span>
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