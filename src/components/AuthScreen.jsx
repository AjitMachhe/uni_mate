import React, { useState } from 'react';
import { supabase } from '../supabaseClient';
import { GraduationCap, Lock, User, UserPlus, CheckCircle2 } from 'lucide-react';

export default function AuthScreen() {
  const [tab, setTab] = useState('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [reqData, setReqData] = useState({
    full_name: '',
    email: '',
    phone: '',
    requested_role: 'Student',
    department: '',
  });
  const [reqSubmitted, setReqSubmitted] = useState(false);

  async function handleLogin(e) {
    e.preventDefault();
    setLoading(true);
    setError('');

    // Automatically converts plain username (e.g. "amar") into valid auth format
    const cleanInput = username.trim().toLowerCase();
    const loginEmail = cleanInput.includes('@') ? cleanInput : `${cleanInput}@gmail.com`;

    const { error } = await supabase.auth.signInWithPassword({ email: loginEmail, password });
    if (error) setError(error.message);
    setLoading(false);
  }

  async function handleAccessRequest(e) {
    e.preventDefault();
    setLoading(true);
    setError('');
    const { error } = await supabase.from('access_requests').insert([reqData]);
    if (error) setError(error.message);
    else setReqSubmitted(true);
    setLoading(false);
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-maroon via-brand-dark to-slate-900 flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden">
        <div className="bg-brand-light px-6 py-6 text-center border-b border-red-100">
          <div className="w-14 h-14 bg-brand-maroon text-white rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-md">
            <GraduationCap size={30} />
          </div>
          <h1 className="text-2xl font-extrabold text-brand-maroon tracking-tight">uni_mate</h1>
          <p className="text-xs text-slate-600 mt-1">University Internal Communication Portal</p>
        </div>

        <div className="grid grid-cols-2 border-b border-slate-200 text-sm font-semibold">
          <button
            onClick={() => { setTab('login'); setError(''); }}
            className={`py-3 transition ${tab === 'login' ? 'text-brand-maroon border-b-2 border-brand-maroon bg-white' : 'text-slate-500 bg-slate-50'}`}
          >
            Member Login
          </button>
          <button
            onClick={() => { setTab('request'); setError(''); setReqSubmitted(false); }}
            className={`py-3 transition ${tab === 'request' ? 'text-brand-maroon border-b-2 border-brand-maroon bg-white' : 'text-slate-500 bg-slate-50'}`}
          >
            Request Access
          </button>
        </div>

        <div className="p-6">
          {error && (
            <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 font-medium">
              {error}
            </div>
          )}

          {tab === 'login' ? (
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Username (or Email)</label>
                <div className="relative">
                  <User size={16} className="absolute left-3.5 top-3 text-slate-400" />
                  <input
                    type="text"
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="e.g. amar"
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-maroon"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Password</label>
                <div className="relative">
                  <Lock size={16} className="absolute left-3.5 top-3 text-slate-400" />
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-maroon"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-brand-maroon hover:bg-brand-dark text-white font-semibold py-2.5 rounded-xl shadow-md transition disabled:opacity-50"
              >
                {loading ? 'Signing in...' : 'Sign In'}
              </button>
            </form>
          ) : reqSubmitted ? (
            <div className="text-center py-6 space-y-3">
              <CheckCircle2 size={44} className="text-emerald-600 mx-auto" />
              <h3 className="font-bold text-slate-800">Request Submitted!</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Your details have been sent to the University Administrator. Once verified, you will receive your username and password.
              </p>
            </div>
          ) : (
            <form onSubmit={handleAccessRequest} className="space-y-3">
              <input
                type="text"
                required
                placeholder="Full Name"
                value={reqData.full_name}
                onChange={(e) => setReqData({ ...reqData, full_name: e.target.value })}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-maroon"
              />
              <input
                type="email"
                required
                placeholder="Personal Email (to receive credentials)"
                value={reqData.email}
                onChange={(e) => setReqData({ ...reqData, email: e.target.value })}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-maroon"
              />
              <input
                type="tel"
                required
                placeholder="Mobile Number"
                value={reqData.phone}
                onChange={(e) => setReqData({ ...reqData, phone: e.target.value })}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-maroon"
              />
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={reqData.requested_role}
                  onChange={(e) => setReqData({ ...reqData, requested_role: e.target.value })}
                  className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-maroon"
                >
                  <option value="Student">Student</option>
                  <option value="Parent">Parent</option>
                  <option value="Teaching Staff">Teaching Staff</option>
                  <option value="Non-Teaching Staff">Non-Teaching Staff</option>
                  <option value="HoD / Dean / Director">HoD / Dean / Director</option>
                </select>
                <input
                  type="text"
                  required
                  placeholder="Department (e.g. CSE)"
                  value={reqData.department}
                  onChange={(e) => setReqData({ ...reqData, department: e.target.value })}
                  className="px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-maroon"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold py-2.5 rounded-xl shadow-md transition flex items-center justify-center gap-2"
              >
                <UserPlus size={16} />
                {loading ? 'Submitting...' : 'Submit Access Request'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}