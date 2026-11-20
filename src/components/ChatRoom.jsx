import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { Send, Paperclip, Download, Users, ShieldCheck, FileText, UserPlus, Trash2, Search } from 'lucide-react';

export default function ChatRoom({ group, currentUser }) {
  const [messages, setMessages] = useState([]);
  const [members, setMembers] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [text, setText] = useState('');
  const [file, setFile] = useState(null);
  const [showMembers, setShowMembers] = useState(false);
  const [uploading, setUploading] = useState(false);

  const canPost = currentUser.role === 'admin' || currentUser.role === 'staff';

  useEffect(() => {
    fetchMessages();
    fetchMembers();
    if (canPost) fetchAllProfiles();

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
    if (data) setMembers(data.map((m) => m.profiles).filter(Boolean));
  }

  async function fetchAllProfiles() {
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, email, designation, department, role')
      .order('full_name', { ascending: true });
    if (data) setAllUsers(data);
  }

  async function handleAddMember(userId) {
    const { error } = await supabase
      .from('group_members')
      .insert([{ group_id: group.id, user_id: userId }]);
    if (!error) fetchMembers();
  }

  async function handleRemoveMember(userId) {
    if (userId === currentUser.id) return;
    await supabase
      .from('group_members')
      .delete()
      .eq('group_id', group.id)
      .eq('user_id', userId);
    fetchMembers();
  }

  // PRIVACY RULE: Students/Parents only see Staff/Admins, never other Students/Parents
  const visibleMembers = canPost
    ? members
    : members.filter((m) => m.role === 'staff' || m.role === 'admin');

  // Filter users not yet in this group
  const memberIds = new Set(members.map((m) => m.id));
  const availableUsers = allUsers.filter(
    (u) =>
      !memberIds.has(u.id) &&
      (u.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        u.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (u.department || '').toLowerCase().includes(searchTerm.toLowerCase()))
  );

  async function handleSend(e) {
    e.preventDefault();
    if (!text.trim() && !file) return;
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
      {/* Header */}
      <div className="bg-brand-maroon text-white px-4 py-3 flex items-center justify-between shadow-md">
        <div>
          <h2 className="font-bold text-lg leading-tight">{group.name}</h2>
          <p className="text-xs text-amber-200">
            {canPost ? `${members.length} Total Members` : 'Official Department Broadcast'}
          </p>
        </div>
        <button
          onClick={() => setShowMembers(!showMembers)}
          className="flex items-center gap-1.5 bg-white/15 hover:bg-white/25 px-3 py-1.5 rounded-full text-xs font-medium transition"
        >
          <Users size={15} />
          <span>{canPost ? 'Manage Members' : 'Faculty'}</span>
        </button>
      </div>

      {/* Collapsible Member Drawer */}
      {showMembers && (
        <div className="bg-white border-b border-slate-200 p-4 shadow-inner max-h-80 overflow-y-auto space-y-4">
          {canPost && (
            <div className="bg-brand-light p-3 rounded-xl border border-red-100">
              <p className="text-xs font-bold text-brand-maroon mb-2 flex items-center gap-1.5">
                <UserPlus size={14} /> Add Students, Parents, or Staff to {group.name}
              </p>
              <div className="relative mb-2">
                <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search by name, email, or department..."
                  className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs focus:outline-none focus:border-brand-maroon"
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
                        className="bg-brand-maroon hover:bg-brand-dark text-white px-2.5 py-1 rounded text-[11px] font-semibold"
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
              {canPost ? `Current Group Members (${members.length})` : 'Group Administrators & Faculty'}
            </h3>
            <div className="space-y-1.5">
              {visibleMembers.map((member) => (
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
                    {canPost && member.id !== currentUser.id && (
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
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Messages Feed */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg) => (
          <div key={msg.id} className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 max-w-2xl">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-bold text-brand-maroon">
                {msg.profiles?.full_name} •{' '}
                <span className="text-slate-500 font-normal">{msg.profiles?.designation}</span>
              </span>
              <span className="text-[11px] text-slate-400">
                {new Date(msg.created_at).toLocaleDateString()}
              </span>
            </div>

            {msg.content && <p className="text-slate-800 text-sm whitespace-pre-wrap mb-2">{msg.content}</p>}

            {/* Media Attachments with Download */}
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
                    <FileText size={16} className="text-brand-maroon shrink-0" />
                    <span className="truncate">{msg.file_name || 'Attachment'}</span>
                  </div>
                  <a
                    href={msg.media_url}
                    download={msg.file_name}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1 bg-brand-maroon text-white text-xs px-3 py-1.5 rounded-lg hover:bg-brand-dark transition shrink-0"
                  >
                    <Download size={14} /> Save
                  </a>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Input Area: ONLY visible to Staff & Admin */}
      {canPost ? (
        <form onSubmit={handleSend} className="p-3 bg-white border-t border-slate-200 flex items-center gap-2">
          <label className="cursor-pointer p-2 text-slate-500 hover:text-brand-maroon rounded-full hover:bg-slate-100">
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
            className="flex-1 bg-slate-100 rounded-full px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-maroon"
          />
          <button
            type="submit"
            disabled={uploading}
            className="bg-brand-maroon text-white p-2.5 rounded-full hover:bg-brand-dark transition disabled:opacity-50"
          >
            <Send size={18} />
          </button>
        </form>
      ) : (
        <div className="p-3 bg-amber-50 border-t border-amber-200 text-center text-xs text-amber-900 font-medium">
          Only university faculty and administrators can post messages in this group.
        </div>
      )}
    </div>
  );
}