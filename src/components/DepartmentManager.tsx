import React, { useState, useMemo } from 'react';
import { DbDepartment } from '../supabaseClient';
import { saveDepartment, deleteDepartmentAndRecords } from '../backendService';
import { 
  Plus, 
  Search, 
  Edit3, 
  Trash2, 
  Settings, 
  AlertTriangle, 
  X, 
  CheckCircle2, 
  Layers, 
  ToggleLeft, 
  ToggleRight 
} from 'lucide-react';

interface DepartmentManagerProps {
  departments: DbDepartment[];
  onReload: () => Promise<void>;
}

export function DepartmentManager({ departments, onReload }: DepartmentManagerProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingDept, setEditingDept] = useState<DbDepartment | null>(null);

  // Form Fields
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [desc, setDesc] = useState('');
  const [status, setStatus] = useState<'active' | 'disabled'>('active');

  // Multi-choice delete modal state
  const [deleteDeptTarget, setDeleteDeptTarget] = useState<DbDepartment | null>(null);
  const [deleteOption, setDeleteOption] = useState<'disable_only' | 'delete_keep_history' | 'delete_permanent'>('disable_only');

  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [loading, setLoading] = useState(false);

  // Trigger add modal and auto-generate code
  const handleOpenAdd = () => {
    setEditingDept(null);
    setName('');
    setDesc('');
    setStatus('active');
    
    // Auto-generate next department code format DEPT-XX
    const nextCodeNum = Math.max(...departments.map(d => {
      const match = d.department_code?.match(/\d+/);
      return match ? parseInt(match[0], 10) : 0;
    }), 0) + 1;
    const formattedCode = `DEPT-${String(nextCodeNum).padStart(2, '0')}`;
    setCode(formattedCode);
    
    setIsModalOpen(true);
  };

  // Trigger edit modal
  const handleOpenEdit = (dept: DbDepartment) => {
    setEditingDept(dept);
    setName(dept.department_name);
    setCode(dept.department_code);
    setDesc(dept.description || '');
    setStatus((dept.status as 'active' | 'disabled') || 'active');
    setIsModalOpen(true);
  };

  // Unique department name validation handler
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setNotification({ type: 'error', message: 'Department name is required' });
      return;
    }

    // Name uniqueness check
    const isDuplicate = departments.some(d => 
      d.department_name.toLowerCase().trim() === name.toLowerCase().trim() && 
      d.id !== editingDept?.id
    );
    if (isDuplicate) {
      setNotification({ type: 'error', message: `A department with the name "${name}" already exists.` });
      return;
    }

    setLoading(true);
    setNotification(null);

    const targetId = editingDept?.id || 'dept-' + crypto.randomUUID();

    const payload: DbDepartment = {
      id: targetId,
      department_code: code,
      department_name: name.trim(),
      description: desc.trim(),
      status: status,
      created_at: editingDept?.created_at || new Date().toISOString()
    };

    const res = await saveDepartment(payload);
    setLoading(false);
    if (res.success) {
      setNotification({ type: 'success', message: `Department "${name}" successfully compiled and synchronized.` });
      setIsModalOpen(false);
      await onReload();
    } else {
      setNotification({ type: 'error', message: res.error || 'Failed to sync department.' });
    }
  };

  const handleDeleteTrigger = (dept: DbDepartment) => {
    setDeleteDeptTarget(dept);
    setDeleteOption('disable_only'); // Default safe action
  };

  const handleConfirmDelete = async () => {
    if (!deleteDeptTarget) return;
    setLoading(true);
    const res = await deleteDepartmentAndRecords(deleteDeptTarget.id, deleteOption);
    setLoading(false);
    if (res.success) {
      setNotification({ type: 'success', message: `Department policy executed successfully.` });
      setDeleteDeptTarget(null);
      await onReload();
    } else {
      setNotification({ type: 'error', message: res.error || 'Failed to delete department.' });
    }
  };

  // Search filter implementation
  const filteredDepartments = useMemo(() => {
    return departments.filter(d => 
      d.department_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      d.department_code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (d.description && d.description.toLowerCase().includes(searchTerm.toLowerCase()))
    );
  }, [departments, searchTerm]);

  return (
    <div className="space-y-4">
      {/* Search and actions bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <div className="relative flex-1 max-w-md">
          <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
            <Search className="h-4 w-4" />
          </span>
          <input
            type="text"
            placeholder="Search departments by name, code or specs..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full text-xs pl-9 pr-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
        </div>

        <button
          onClick={handleOpenAdd}
          className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-4 py-2 rounded-lg flex items-center gap-1.5 cursor-pointer shadow-sm transition-colors"
        >
          <Plus className="h-4 w-4" />
          Create New Department
        </button>
      </div>

      {/* Notifications feedback popup */}
      {notification && (
        <div className={`p-4 rounded-lg flex items-center justify-between text-xs ${
          notification.type === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-150' : 'bg-rose-50 text-rose-800 border border-rose-150'
        }`}>
          <div className="flex items-center gap-2">
            {notification.type === 'success' ? <CheckCircle2 className="h-5 w-5 text-emerald-600" /> : <AlertTriangle className="h-5 w-5 text-rose-600" />}
            <span className="font-semibold">{notification.message}</span>
          </div>
          <button onClick={() => setNotification(null)} className="text-slate-400 hover:text-slate-600">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Roster list spreadsheet */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <table className="w-full text-left border-collapse text-xs">
          <thead className="bg-slate-50 font-bold text-slate-700 border-b border-slate-200">
            <tr>
              <th className="p-3 border-r border-slate-200 w-32">Department Code</th>
              <th className="p-3 border-r border-slate-200">Department Name</th>
              <th className="p-3 border-r border-slate-200">Description Specs</th>
              <th className="p-3 border-r border-slate-200 text-center w-28">Status</th>
              <th className="p-3 text-center w-28">CRUD Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-150">
            {filteredDepartments.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-8 text-center text-slate-400 italic">
                  No matching departments found in registry.
                </td>
              </tr>
            ) : (
              filteredDepartments.map((dept) => (
                <tr key={dept.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="p-3 border-r border-slate-200 font-bold font-mono text-slate-700">{dept.department_code}</td>
                  <td className="p-3 border-r border-slate-200 font-extrabold text-slate-900">{dept.department_name}</td>
                  <td className="p-3 border-r border-slate-200 text-slate-500">{dept.description || '-'}</td>
                  <td className="p-3 border-r border-slate-200 text-center">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold ${
                      dept.status === 'active' 
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-250' 
                        : 'bg-slate-100 text-slate-450 border border-slate-200'
                    }`}>
                      {dept.status === 'active' ? 'Active' : 'Disabled'}
                    </span>
                  </td>
                  <td className="p-3 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <button
                        onClick={() => handleOpenEdit(dept)}
                        className="text-slate-600 hover:text-emerald-700 border border-slate-300 hover:border-emerald-300 rounded p-1 hover:bg-emerald-50 transition-colors cursor-pointer"
                        title="Edit Department"
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteTrigger(dept)}
                        className="text-slate-400 hover:text-rose-700 border border-slate-300 hover:border-rose-300 rounded p-1 hover:bg-rose-50 transition-colors cursor-pointer"
                        title="Delete Operations"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* --- ADD/EDIT MODAL DIALOG --- */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-150">
            <div className="bg-slate-50 border-b border-slate-150 p-4 flex items-center justify-between">
              <span className="font-bold text-slate-800 text-sm flex items-center gap-1.5">
                <Settings className="h-4.5 w-4.5 text-emerald-600" />
                {editingDept ? 'Edit Roster Department Profile' : 'Register New Department'}
              </span>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSave} className="p-4 space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                  Department Code (Auto-generated)
                </label>
                <input
                  type="text"
                  disabled
                  value={code}
                  className="w-full text-xs font-mono font-bold bg-slate-50 border border-slate-200 text-slate-500 rounded-lg p-2.5"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Department Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Finishing, Cutting, Sales"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full text-xs font-bold border border-slate-300 rounded-lg p-2.5 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Description Specs
                </label>
                <textarea
                  placeholder="Enter details of department duties..."
                  value={desc}
                  onChange={(e) => setDesc(e.target.value)}
                  rows={2}
                  className="w-full text-xs border border-slate-300 rounded-lg p-2.5 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Status State
                </label>
                <div className="flex items-center gap-4">
                  <label className="inline-flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="status"
                      checked={status === 'active'}
                      onChange={() => setStatus('active')}
                      className="text-emerald-600 focus:ring-emerald-500"
                    />
                    <span className="text-xs font-medium text-slate-800">Active</span>
                  </label>
                  <label className="inline-flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="status"
                      checked={status === 'disabled'}
                      onChange={() => setStatus('disabled')}
                      className="text-emerald-500 focus:ring-emerald-500"
                    />
                    <span className="text-xs font-medium text-slate-800">Disabled</span>
                  </label>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-650 px-4 py-2 rounded-lg text-xs font-bold font-sans cursor-pointer transition-all border border-slate-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold px-4 py-2 rounded-lg text-xs cursor-pointer shadow-sm ml-1"
                >
                  {loading ? 'Saving...' : 'Sync Profile'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- MULTI-OPTION DELETION DIALOG --- */}
      {deleteDeptTarget && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-150">
            <div className="bg-rose-50 border-b border-rose-100 p-4 flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-rose-600 shrink-0" />
              <div>
                <span className="font-extrabold text-rose-900 text-sm">Delete Department Rule Matrix</span>
                <p className="text-[10px] text-rose-700 leading-tight">Selected Target: {deleteDeptTarget.department_name} ({deleteDeptTarget.department_code})</p>
              </div>
            </div>

            <div className="p-4 space-y-4">
              <p className="text-xs text-slate-650 leading-relaxed">
                Choose the exact policy rule to execute for the department <strong className="text-slate-800 font-extrabold">"{deleteDeptTarget.department_name}"</strong>:
              </p>

              <div className="space-y-2.5">
                {/* Option 1: Disable only */}
                <label className="flex items-start gap-2.5 p-2.5 border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer transition-colors">
                  <input
                    type="radio"
                    name="delete_opt"
                    checked={deleteOption === 'disable_only'}
                    onChange={() => setDeleteOption('disable_only')}
                    className="mt-0.5 text-emerald-600 focus:ring-emerald-500"
                  />
                  <div>
                    <span className="text-xs font-bold text-slate-800 block">Deactivate & Disable Only</span>
                    <span className="text-[10px] text-slate-500 block">Marks the department as Disabled. Current and historic roster logs remain unchanged.</span>
                  </div>
                </label>

                {/* Option 2: Soft delete */}
                <label className="flex items-start gap-2.5 p-2.5 border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer transition-colors">
                  <input
                    type="radio"
                    name="delete_opt"
                    checked={deleteOption === 'delete_keep_history'}
                    onChange={() => setDeleteOption('delete_keep_history')}
                    className="mt-0.5 text-emerald-600 focus:ring-emerald-500"
                  />
                  <div>
                    <span className="text-xs font-bold text-slate-800 block">Soft Delete Department (Keep History)</span>
                    <span className="text-[10px] text-slate-500 block">Hide this department from filters/new views, but preserve historic metrics for reports.</span>
                  </div>
                </label>

                {/* Option 3: Permanent delete */}
                <label className="flex items-start gap-2.5 p-2.5 border border-rose-150 rounded-lg hover:bg-rose-50/50 cursor-pointer transition-colors bg-rose-50/10">
                  <input
                    type="radio"
                    name="delete_opt"
                    checked={deleteOption === 'delete_permanent'}
                    onChange={() => setDeleteOption('delete_permanent')}
                    className="mt-0.5 text-rose-600 focus:ring-rose-500"
                  />
                  <div>
                    <span className="text-xs font-bold text-rose-800 block">Permanent Hard Delete</span>
                    <span className="text-[10px] text-rose-600 block leading-normal">Wipe department completely from Supabase DB. Unlink references by setting department_id on staff to NULL.</span>
                  </div>
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setDeleteDeptTarget(null)}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-650 px-4 py-2 rounded-lg text-xs font-bold font-sans cursor-pointer transition-all border border-slate-200"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDelete}
                  disabled={loading}
                  className="bg-rose-650 hover:bg-rose-700 text-white font-extrabold px-4 py-2 rounded-lg text-xs cursor-pointer shadow-sm ml-1"
                >
                  {loading ? 'Purging...' : 'Execute Policy'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
