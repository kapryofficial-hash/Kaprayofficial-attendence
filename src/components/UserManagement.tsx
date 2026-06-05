import React, { useState, useEffect } from 'react';
import { getSupabaseClient } from '../supabaseClient';
import { UserProfileRole, AllowedUserRole } from '../types';
import { DbEmployee } from '../supabaseClient';
import { 
  Users, Key, Shield, UserX, Search, Plus, Trash2, Edit3, Save, 
  X, Check, AlertCircle, RefreshCw, UserCheck, ShieldAlert, Loader
} from 'lucide-react';

interface UserManagementProps {
  employees: DbEmployee[];
  currentUserId: string;
}

export function UserManagement({ employees, currentUserId }: UserManagementProps) {
  const [userRoles, setUserRoles] = useState<UserProfileRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Search filter
  const [searchTerm, setSearchTerm] = useState('');

  // Add Row form states
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [newUserId, setNewUserId] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState<AllowedUserRole>('staff_viewer');
  const [newEmpId, setNewEmpId] = useState<string>('');

  // Edit Row state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editRole, setEditRole] = useState<AllowedUserRole>('staff_viewer');
  const [editEmpId, setEditEmpId] = useState<string>('');

  const loadUserRoles = async () => {
    setLoading(true);
    setErrorText(null);
    try {
      const supabase = getSupabaseClient();
      if (!supabase) throw new Error('Supabase Client not active.');

      const { data, error } = await supabase
        .from('user_roles')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setUserRoles(data || []);
    } catch (err: any) {
      setErrorText(err.message || 'Failed to fetch user roles database.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUserRoles();
  }, []);

  const handleCreateRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUserId || !newEmail || !newRole) {
      setErrorText('Please fill in User Authentication UUID, Email, and pick a design role.');
      return;
    }

    // Safety checks
    const cleanUserId = newUserId.trim();
    const cleanEmail = newEmail.trim().toLowerCase();

    setErrorText(null);
    setSuccessMsg(null);

    try {
      const supabase = getSupabaseClient();
      if (!supabase) throw new Error('Supabase client offline.');

      const cleanEmployeeId = newRole === 'staff_viewer' && newEmpId ? newEmpId : null;

      const newRoleRow = {
        id: `role_${Date.now()}`,
        user_id: cleanUserId,
        role: newRole,
        employee_id: cleanEmployeeId,
        // Since we may not have helper columns, we can attach info or write it.
        // We will store mapping row securely
      };

      const { error } = await supabase
        .from('user_roles')
        .insert([newRoleRow]);

      if (error) throw error;

      // Log action to audit logs if possible (will handle on parent level or directly)
      setSuccessMsg(`Provisioned role map successfully for user email ${cleanEmail}!`);
      setIsAddOpen(false);
      
      // Clear fields
      setNewUserId('');
      setNewEmail('');
      setNewRole('staff_viewer');
      setNewEmpId('');

      // Reload
      await loadUserRoles();

    } catch (err: any) {
      setErrorText(err.message || 'Creation of role map failed in DB.');
    }
  };

  const handleStartEdit = (roleRow: UserProfileRole) => {
    setEditingId(roleRow.id);
    setEditRole(roleRow.role);
    setEditEmpId(roleRow.employee_id || '');
  };

  const handleSaveEdit = async (id: string) => {
    setErrorText(null);
    setSuccessMsg(null);

    try {
      const supabase = getSupabaseClient();
      if (!supabase) throw new Error('Supabase client offline.');

      const cleanEmployeeId = editRole === 'staff_viewer' && editEmpId ? editEmpId : null;

      const { error } = await supabase
        .from('user_roles')
        .update({
          role: editRole,
          employee_id: cleanEmployeeId,
          updated_at: new Date().toISOString()
        })
        .eq('id', id);

      if (error) throw error;

      setSuccessMsg('UserProfile mapping role rules updated successfully!');
      setEditingId(null);
      await loadUserRoles();
    } catch (err: any) {
      setErrorText(err.message || 'Update failed.');
    }
  };

  const handleDeleteRole = async (id: string, userId: string) => {
    if (userId === currentUserId) {
      setErrorText('Safety guard: You cannot delete your own Super Admin access profile.');
      return;
    }

    if (!confirm('Are you absolutely certain you want to remove access for this user mapping row? They will lose all database communication permissions immediately.')) {
      return;
    }

    setErrorText(null);
    setSuccessMsg(null);

    try {
      const supabase = getSupabaseClient();
      if (!supabase) throw new Error('Supabase client offline.');

      const { error } = await supabase
        .from('user_roles')
        .delete()
        .eq('id', id);

      if (error) throw error;

      setSuccessMsg('User access revoked and permission mapping deleted!');
      await loadUserRoles();
    } catch (err: any) {
      setErrorText(err.message || 'Failed to delete role map row.');
    }
  };

  const filteredRoles = userRoles.filter(item => {
    const textStr = `${item.user_id} ${item.role} ${item.employee_id || ''}`.toLowerCase();
    return textStr.includes(searchTerm.toLowerCase());
  });

  return (
    <div id="user-management-panel" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-in fade-in duration-200">
      
      {/* Title Panel */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-5 mb-6">
        <div>
          <h2 className="text-slate-900 font-bold text-xl flex items-center gap-2">
            <Shield className="h-6 w-6 text-emerald-600" />
            Super Admin Access Authorization Engine
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Provision, authorize, link staff IDs, and audit platform permission mapping profiles securely.
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          <button 
            onClick={loadUserRoles}
            className="border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-semibold p-2.5 rounded-lg flex items-center gap-1.5 cursor-pointer select-none transition-all active:scale-95"
            title="Reload dataset"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          
          <button 
            onClick={() => setIsAddOpen(true)}
            className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-4 py-2.5 rounded-lg flex items-center gap-1.5 cursor-pointer select-none transition-all shadow-md shadow-emerald-600/10 active:scale-95"
          >
            <Plus className="h-4 w-4" />
            Add User Assignment
          </button>
        </div>
      </div>

      {/* Notifications banner */}
      {errorText && (
        <div className="bg-rose-50 border border-rose-200 text-rose-700 p-4 rounded-xl text-xs flex gap-2.5 items-start mb-6 animate-in hover:shadow-xs">
          <AlertCircle className="h-5 w-5 shrink-0 text-rose-500" />
          <p className="font-semibold leading-relaxed flex-1">{errorText}</p>
        </div>
      )}

      {successMsg && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-850 p-4 rounded-xl text-xs flex gap-2.5 items-start mb-6 animate-in hover:shadow-xs">
          <Check className="h-5 w-5 shrink-0 text-emerald-600" />
          <p className="font-semibold leading-relaxed flex-1">{successMsg}</p>
        </div>
      )}

      {/* Slide-out modal setup */}
      {isAddOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-100">
            <div className="bg-slate-900 text-white px-5 py-4 flex items-center justify-between">
              <h3 className="font-bold text-sm flex items-center gap-1.5">
                <UserCheck className="h-4 w-4 text-emerald-400" />
                Invite Secure Role Mapping
              </h3>
              <button onClick={() => setIsAddOpen(false)} className="text-slate-400 hover:text-white transition-colors cursor-pointer">[X]</button>
            </div>

            <form onSubmit={handleCreateRole} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">User Auth UID (UUID code from Supabase Auth) *</label>
                <input 
                  type="text"
                  required
                  value={newUserId}
                  onChange={(e) => setNewUserId(e.target.value)}
                  placeholder="e.g. ad4bca82-41f2-498c-85e3-..."
                  className="w-full text-xs px-3 py-2 border border-slate-300 rounded focus:ring-1 focus:ring-emerald-500 font-mono"
                />
                <p className="text-[10px] text-slate-400 mt-1 font-medium">Unique authenticated user identifier from your Supabase auth dashboard.</p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Backup Human Reference Email *</label>
                <input 
                  type="email"
                  required
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="e.g. adeel@kaprayofficial.com"
                  className="w-full text-xs px-3 py-2 border border-slate-300 rounded focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">System Authorization Role *</label>
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value as AllowedUserRole)}
                  className="w-full text-xs px-3 py-2 border border-slate-300 rounded bg-white focus:ring-1 focus:ring-emerald-500"
                >
                  <option value="staff_viewer">Staff Viewer (Read own record only)</option>
                  <option value="manager">Manager (Query worksheets & daily logs)</option>
                  <option value="admin">Administrator (Perform write reviews & soft deletions)</option>
                  <option value="super_admin">Super Administrator (Full Nuclear Control)</option>
                </select>
              </div>

              {newRole === 'staff_viewer' && (
                <div className="animate-in slide-in-from-top-2">
                  <label className="block text-xs font-bold text-slate-600 mb-1">Link to Employee Profile (Required for Staff Viewer) *</label>
                  <select
                    required
                    value={newEmpId}
                    onChange={(e) => setNewEmpId(e.target.value)}
                    className="w-full text-xs px-3 py-2 border border-slate-300 rounded bg-white focus:ring-1 focus:ring-emerald-500"
                  >
                    <option value="">-- Choose employee profile from active roster --</option>
                    {employees.map(emp => (
                      <option key={emp.id} value={emp.id}>
                        {emp.id} - {emp.employee_name || emp.name} [{emp.designation}]
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="bg-slate-50 border border-slate-200 -mx-5 -mb-5 px-5 py-4 flex items-center justify-end gap-2 border-t mt-4">
                <button 
                  type="button" 
                  onClick={() => setIsAddOpen(false)}
                  className="border border-slate-300 text-slate-700 hover:bg-slate-100 font-semibold text-xs px-4  py-2 rounded cursor-pointer transition-colors"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs px-4 py-2 rounded shadow-md shadow-emerald-600/10 cursor-pointer transition-all active:scale-95"
                >
                  Save Access Map
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Main search card container */}
      <div className="bg-white rounded-xl shadow-md border border-slate-200 overflow-hidden mb-6">
        <div className="px-5 py-4 border-b border-slate-200 bg-slate-50 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input 
              type="text" 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Filter active mappings by User ID, email, role alias..." 
              className="w-full text-xs pl-9 pr-4 py-2.5 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>
          <div className="text-xs text-slate-500">
            Matched: <span className="font-bold text-slate-800">{filteredRoles.length}</span> / {userRoles.length} assignments
          </div>
        </div>

        {loading ? (
          <div className="p-16 text-center text-slate-400 space-y-3">
            <Loader className="h-8 w-8 animate-spin text-emerald-600 mx-auto" />
            <p className="text-xs font-semibold">Decrypting user mapping access registers...</p>
          </div>
        ) : filteredRoles.length === 0 ? (
          <div className="p-16 text-slate-400 text-center border-b max-w-md mx-auto">
            <ShieldAlert className="h-10 w-10 text-slate-300 mx-auto mb-2" />
            <span className="font-bold text-sm block">No mappings matched current criteria</span>
            <p className="text-xs text-slate-500 mt-1">Try resetting filter characters or provision a new role configuration.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-100 text-[10px] text-slate-500 font-bold uppercase tracking-wider border-b border-slate-200">
                  <th className="px-5 py-3">Auth UUID (Unique identifier)</th>
                  <th className="px-5 py-3">Roster Permission Role</th>
                  <th className="px-5 py-3">Linked Employee ID</th>
                  <th className="px-5 py-3 text-right">Action Configuration</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-150 text-xs">
                {filteredRoles.map(row => {
                  const isEditing = editingId === row.id;
                  const isSelf = row.user_id === currentUserId;

                  return (
                    <tr 
                      key={row.id} 
                      className={`hover:bg-slate-50 transition-colors ${
                        isSelf ? 'bg-emerald-50/20' : ''
                      }`}
                    >
                      {/* UUID and label */}
                      <td className="px-5 py-3.5">
                        <div className="flex flex-col gap-1">
                          <code className="text-[11px] font-mono text-slate-700 bg-slate-100 font-medium tracking-tight px-1.5 py-0.5 rounded w-fit select-text">
                            {row.user_id}
                          </code>
                          {isSelf && (
                            <span className="text-[9px] text-emerald-600 font-bold px-1 py-0.5 border border-emerald-500/25 bg-emerald-100/35 rounded w-fit uppercase">
                              Active Admin Account (You)
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Permission select */}
                      <td className="px-5 py-3.5">
                        {isEditing ? (
                          <select
                            value={editRole}
                            onChange={(e) => setEditRole(e.target.value as AllowedUserRole)}
                            className="bg-white text-xs px-2 py-1 border border-slate-300 rounded focus:ring-1 focus:ring-emerald-500 w-fit"
                          >
                            <option value="staff_viewer">Staff Viewer</option>
                            <option value="manager">Manager</option>
                            <option value="admin">Administrator</option>
                            <option value="super_admin">Super Administrator</option>
                          </select>
                        ) : (
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold ${
                            row.role === 'super_admin' ? 'bg-amber-100 text-amber-800' :
                            row.role === 'admin' ? 'bg-emerald-100 text-emerald-800' :
                            row.role === 'manager' ? 'bg-sky-100 text-sky-800' :
                            'bg-slate-100 text-slate-800'
                          }`}>
                            <Key className="h-3.5 w-3.5 text-current" />
                            {row.role === 'super_admin' ? 'Super Admin' :
                             row.role === 'admin' ? 'Admin Profile' :
                             row.role === 'manager' ? 'Manager Office' : 
                             'Staff Viewer'}
                          </span>
                        )}
                      </td>

                      {/* Linked employee */}
                      <td className="px-5 py-3.5 text-slate-500 font-mono text-[11px]">
                        {isEditing ? (
                          editRole === 'staff_viewer' ? (
                            <select
                              value={editEmpId}
                              onChange={(e) => setEditEmpId(e.target.value)}
                              className="bg-white text-xs px-2 py-1 border border-slate-300 rounded focus:ring-1 focus:ring-emerald-500 max-w-[200px]"
                            >
                              <option value="">- Choose linked profile -</option>
                              {employees.map(emp => (
                                <option key={emp.id} value={emp.id}>{emp.id} - {emp.employee_name || emp.name}</option>
                              ))}
                            </select>
                          ) : (
                            <span className="text-slate-400 italic">No link needed</span>
                          )
                        ) : (
                          row.employee_id ? (
                            <div className="flex flex-col gap-0.5 text-slate-800">
                              <span className="font-bold">{row.employee_id}</span>
                              <span className="text-[10px] text-slate-400">
                                {employees.find(e => e.id === row.employee_id)?.employee_name || 'Roster Employee'}
                              </span>
                            </div>
                          ) : (
                            <span className="text-slate-400 font-sans italic">None (Wildcard Global Scope)</span>
                          )
                        )}
                      </td>

                      {/* Column Actions */}
                      <td className="px-5 py-3.5 text-right whitespace-nowrap">
                        {isEditing ? (
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => handleSaveEdit(row.id)}
                              className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold p-1.5 rounded-md hover:shadow-sm cursor-pointer transition-colors"
                              title="Commit updates"
                            >
                              <Check className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => setEditingId(null)}
                              className="bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold p-1.5 rounded-md cursor-pointer transition-colors"
                              title="Cancel edits"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => handleStartEdit(row)}
                              className="hover:bg-slate-100 border border-slate-300 hover:border-slate-400 text-slate-600 font-bold p-1.5 rounded shadow-xs cursor-pointer transition-colors"
                              title="Modify permission rule mapping"
                            >
                              <Edit3 className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => handleDeleteRole(row.id, row.user_id)}
                              className="hover:bg-rose-50 border border-slate-300 hover:border-rose-300 text-slate-500 hover:text-rose-600 font-bold p-1.5 rounded shadow-xs cursor-pointer transition-colors"
                              title="Revoke system access mapping"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  );
}
