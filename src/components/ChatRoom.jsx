import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';
import {
  Send, Paperclip, Download, Users, ShieldCheck, FileText,
  UserPlus, Trash2, Search, Pencil, Check, X
} from 'lucide-react';

const ROOM_THEMES = {
  admin: { headerBg: 'bg-[#800000]', btnBg: 'bg-[#800000] hover:bg-[#5a0000]' },
  staff: { headerBg: 'bg-indigo-900', btnBg: 'bg-indigo-800 hover:bg-indigo-950' },
  student: { headerBg: 'bg-emerald-800', btnBg: 'bg-emerald-700 hover:bg-emerald-900' },
  parent: { headerBg: 'bg-teal-800', btnBg: 'bg-teal-700 hover:bg-teal-900' },
};

export default function ChatRoom({ group, currentUser, onGroupUpdated, onGroupDeleted }) {
  const roomTheme = ROOM_THEMES[currentUser.role] || ROOM_THEMES.student;

  const [messages, setMessages] = useState([]);
  const [members, setMembers] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [text, setText] = useState('');
  const [file, setFile] = useState(null);
  const [showMembers, setShowMembers] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Rename group state
  const [isRenaming, setIsRenaming] = useState(false);
  const [editedName, setEditedName] = useState(group.name);

  const bottomRef = useRef(null);

  const canManage = currentUser.role === 'admin' || currentUser.role === 'staff';
  const isAdmin = currentUser.role === 'admin';

  // Auto-scroll smoothly when new messages arrive
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    setEditedName(group.name);
    setIsRenaming(false);
    setShowMembers(false);
    fetchMessages();
    fetchMembers();
    if (canManage) {
      fetchAllProfiles();
    } else {
      setAllUsers([]);
    }

    const channel = supabase
      .channel(`group-${group.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `group_id=eq.${group.id}` },
        () => fetchMessages()
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [group.id]);

  async function fetchMessages() {
    const { data } = await supabase
      .from('messages')
      .select('*, profiles(full_name, designation, role)')
      .eq('group_id', group.id)
      .order('created_at', { ascending: true });
    if (data) setMessages(data);
  }

  async function fetchMembers() {
    const { data } = await supabase
      .from('group_members')
      .select('user_id, profiles(id, full_name, email, designation, department, role)')
      .eq('group_id', group.id);
    if (data) {
      const cleaned = data.map((m) => m.profiles).filter(Boolean);
      setMembers(cleaned);
    }
  }

  async function fetchAllProfiles() {
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, email, designation, department, role')
      .order('full_name', { ascending: true });
    if (data) setAllUsers(data);
  }

  async function handleRenameGroup() {
    const trimmed = editedName.trim();
    if (!trimmed || trimmed === group.name) {
      setIsRenaming(false);
      return;
    }
    const { data, error } = await supabase
      .from('groups')
      .update({ name: trimmed })
      .eq('id', group.id)
      .select()
      .single();

    if (!error && data) {
      setIsRenaming(false);
      if (onGroupUpdated) onGroupUpdated(data);
    }
  }

  async function handleDeleteGroup() {
    if (!window.confirm(`Permanently delete "${group.name}" and all its messages?`)) return;
    const { error } = await supabase.from('groups').delete().eq('id', group.id);
    if (!error && onGroupDeleted) {
      onGroupDeleted(group.id);
    }
  }

  async function handleAddMember(userId) {
    if (!canManage) return;
    const { error } = await supabase
      .from('group_members')
      .insert([{ group_id: group.id, user_id: userId }]);
    if (!error) fetchMembers();
  }

  async function handleRemoveMember(userId) {
    if (!canManage) return;
    if (userId === currentUser.id) return;
    await supabase
      .from('group_members')
      .delete()
      .eq('group_id', group.id)
      .eq('user_id', userId);
    fetchMembers();
  }

  // STRICT PRIVACY: Students/Parents ONLY see Staff & Admin, never other Students/Parents
  const visibleMembers = canManage
    ? members
    : members.filter((m) => m.role === 'staff' || m.role === 'admin');

  const memberIds = new Set(members.map((m) => m.id));
  const availableUsers = canManage
    ? allUsers.filter(
        (u) =>
          !memberIds.has(u.id) &&
          (u.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            u.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (u.department || '').toLowerCase().includes(searchTerm.toLowerCase()))
      )
    : [];

  async function handleSend(e) {
    e.preventDefault();
    if (!canManage || (!text.trim() && !file)) return;
    setUploading(true);

    let mediaUrl = null;
    let mediaType = 'text';
    let fileName = null;

    if (file) {
      fileName = file.name;
      const ext = file.name.split('.').pop().toLowerCase();
      if (['jpg', 'jpeg', 'png', 'webp'].includes(ext)) mediaType = 'image';
      else if (ext === 'pdf') mediaType = 'pdf';
      else if (['mp4', 'webm'].includes(ext)) mediaType = 'video';
      else if (['mp3', 'wav', 'ogg'].includes(ext)) mediaType = 'audio';

      const filePath = `${group.id}/${Date.now()}_${file.name}`;
      const { error: uploadError } = await supabase.storage.from('uni-media').upload(filePath, file);
      if (!uploadError) {
        const { data } = supabase.storage.from('uni-media').getPublicUrl(filePath);
        mediaUrl = data.publicUrl;
      }
    }

    await supabase.from('messages').insert({
      group_id: group.id,
      sender_id: currentUser.id,
      content: text,
      media_url: mediaUrl,
      media_type: mediaType,
      file_name: fileName,
    });

    setText('');
    setFile(null);
    setUploading(false);
    fetchMessages();
  }

  return (
    <div className="flex flex-col h-full bg-slate-50">
      {/* Header (Color-coded by logged-in user's role) */}
      <div className={`${roomTheme.headerBg} text-white px-4 py-3 flex items-center justify-between shadow-md gap-2`}>
        <div className="min-w-0 flex-1">
          {isRenaming && canManage ? (
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                value={editedName}
                onChange={(e) => setEditedName(e.target.value)}
                autoFocus
                className="bg-white text-slate-900 text-sm font-bold px-2.5 py-1 rounded-lg focus:outline-none w-full max-w-xs"
              />
              <button onClick={handleRenameGroup} className="p-1.5 bg-emerald-600 rounded-lg hover:bg-emerald-700" title="Save name">
                <Check size={14} />
              </button>
              <button onClick={() => { setIsRenaming(false); setEditedName(group.name); }} className="p-1.5 bg-white/20 rounded-lg hover:bg-white/30" title="Cancel">
                <X size={14} />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <h2 className="font-bold text-lg leading-tight truncate">{group.name}</h2>
              {canManage && (
                <button
                  onClick={() => setIsRenaming(true)}
                  title="Rename group"
                  className="p-1 text-amber-200 hover:text-white hover:bg-white/15 rounded transition"
                >
                  <Pencil size={14} />
                </button>
              )}
            </div>
          )}
          <p className="text-xs text-white/80">
            {canManage ? `${members.length} Total Members` : 'Official Department Broadcast'}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setShowMembers(!showMembers)}
            className="flex items-center gap-1.5 bg-white/15 hover:bg-white/25 px-3 py-1.5 rounded-full text-xs font-medium transition"
          >
            <Users size={15} />
            <span>{canManage ? 'Manage Members' : 'Faculty'}</span>
          </button>

          {(isAdmin || group.created_by === currentUser.id) && (
            <button
              onClick={handleDeleteGroup}
              title="Delete group"
              className="p-2 bg-black/25 hover:bg-red-700 text-white/90 hover:text-white rounded-full transition"
            >
              <Trash2 size={15} />
            </button>
          )}
        </div>
      </div>

      {/* Collapsible Member Drawer */}
      {showMembers && (
        <div className="bg-white border-b border-slate-200 p-4 shadow-inner max-h-80 overflow-y-auto space-y-4">
          {canManage && (
            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
              <p className="text-xs font-bold text-slate-800 mb-2 flex items-center gap-1.5">
                <UserPlus size={14} /> Add Students, Parents, or Staff to {group.name}
              </p>
              <div className="relative mb-2">
                <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search by name, username, or department..."
                  className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs focus:outline-none focus:border-slate-500"
                />
              </div>
              <div className="max-h-28 overflow-y-auto space-y-1">
                {availableUsers.length === 0 ? (
                  <p className="text-[11px] text-slate-500 px-1">No matching users left to add.</p>
                ) : (
                  availableUsers.map((u) => (
                    <div key={u.id} className="flex items-center justify-between bg-white px-2.5 py-1.5 rounded-lg text-xs border border-slate-100">
                      <div>
                        <span className="font-semibold text-slate-800">{u.full_name}</span>
                        <span className="ml-1.5 text-[11px] text-slate-500">
                          ({u.role} • {u.department || 'General'})
                        </span>
                      </div>
                      <button
                        onClick={() => handleAddMember(u.id)}
                        className={`${roomTheme.btnBg} text-white px-2.5 py-1 rounded text-[11px] font-semibold`}
                      >
                        + Add
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
              {canManage ? `All Group Members (${members.length})` : 'Group Faculty & Administrators'}
            </h3>
            <div className="space-y-1.5">
              {visibleMembers.length === 0 ? (
                <p className="text-xs text-slate-400">No faculty listed.</p>
              ) : (
                visibleMembers.map((member) => (
                  <div key={member.id} className="flex items-center justify-between text-sm bg-slate-50 p-2 rounded-lg">
                    <div>
                      <span className="font-medium text-slate-800">{member.full_name}</span>
                      <span className="ml-2 text-xs text-slate-500">
                        {member.designation || member.role} {member.department ? `• ${member.department}` : ''}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {(member.role === 'staff' || member.role === 'admin') && (
                        <span className="text-[10px] bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full font-semibold flex items-center gap-1">
                          <ShieldCheck size={12} /> Staff
                        </span>
                      )}
                      {canManage && member.id !== currentUser.id && (
                        <button
                          onClick={() => handleRemoveMember(member.id)}
                          title="Remove from group"
                          className="text-slate-400 hover:text-red-600 p-1"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Messages Feed (Color-coded border by sender: Maroon = Admin, Indigo = Staff) */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg) => {
          const isMsgAdmin = msg.profiles?.role === 'admin';
          return (
       <div
           key={msg.id}
           className={`bg-white rounded-r-lg rounded-l-none p-4 shadow-sm border-l-4 max-w-2xl ${
             isMsgAdmin ? 'border-l-[#800000] border border-red-100' : 'border-l-indigo-700 border border-indigo-100'
           }`}
         >
              <div className="flex items-center justify-between mb-1.5">
                <span className={`text-xs font-bold ${isMsgAdmin ? 'text-[#800000]' : 'text-indigo-800'}`}>
                  {msg.profiles?.full_name} •{' '}
                  <span className="text-slate-500 font-normal">{msg.profiles?.designation}</span>
                </span>
                <span className="text-[11px] text-slate-400">
                  {new Date(msg.created_at).toLocaleDateString()}
                </span>
              </div>

              {msg.content && <p className="text-slate-800 text-sm whitespace-pre-wrap mb-2">{msg.content}</p>}

              {msg.media_url && (
                <div className="mt-2 bg-slate-50 p-3 rounded-xl border border-slate-200">
                  {msg.media_type === 'image' && (
                    <img src={msg.media_url} alt="attachment" className="rounded-lg max-h-64 object-cover mb-2" />
                  )}
                  {msg.media_type === 'video' && (
                    <video src={msg.media_url} controls className="rounded-lg max-h-64 w-full mb-2" />
                  )}
                  {msg.media_type === 'audio' && (
                    <audio src={msg.media_url} controls className="w-full mb-2" />
                  )}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs font-medium text-slate-700 truncate">
                      <FileText size={16} className="text-slate-600 shrink-0" />
                      <span className="truncate">{msg.file_name || 'Attachment'}</span>
                    </div>
                    <a
                      href={msg.media_url}
                      download={msg.file_name}
                      target="_blank"
                      rel="noreferrer"
                      className={`flex items-center gap-1 ${roomTheme.btnBg} text-white text-xs px-3 py-1.5 rounded-lg transition shrink-0`}
                    >
                      <Download size={14} /> Save
                    </a>
                  </div>
                </div>
              )}
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input Area: ONLY visible to Staff & Admin */}
      {canManage ? (
        <form onSubmit={handleSend} className="p-3 bg-white border-t border-slate-200 flex items-center gap-2">
          <label className="cursor-pointer p-2 text-slate-500 hover:text-slate-800 rounded-full hover:bg-slate-100">
            <Paperclip size={20} />
            <input
              type="file"
              className="hidden"
              accept="image/*,application/pdf,video/*,audio/*"
              onChange={(e) => setFile(e.target.files[0])}
            />
          </label>
          <input
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={file ? `Attached: ${file.name}` : 'Post announcement or circular...'}
            className="flex-1 bg-slate-100 rounded-full px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
          />
          <button
            type="submit"
            disabled={uploading}
            className={`${roomTheme.btnBg} text-white p-2.5 rounded-full transition disabled:opacity-50`}
          >
            <Send size={18} />
          </button>
        </form>
      ) : (
        <div className="p-3 bg-emerald-50 border-t border-emerald-200 text-center text-xs text-emerald-900 font-medium">
          Only university faculty and administrators can post messages in this group.
        </div>
      )}
    </div>
  );
}