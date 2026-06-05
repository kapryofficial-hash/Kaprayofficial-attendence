import React, { useState, useEffect } from 'react';
import { DbDeletedRecord } from '../supabaseClient';
import { 
  loadDeletedRecords, 
  restoreEmployee, 
  restoreAttendance, 
  permanentDeleteEmployee, 
  permanentDeleteAttendance 
} from '../backendService';
import { 
  Trash, 
  RotateCcw, 
  AlertTriangle, 
  RefreshCw, 
  ShieldAlert, 
  Clock, 
  DatabaseBackup 
} from 'lucide-react';
import { HardWipeManager } from './HardWipeManager';

interface RecycleBinProps {
  isAdmin: boolean;
  onRestoreHappened: () => void;
}

export function RecycleBin({ isAdmin, onRestoreHappened }: RecycleBinProps) {
  const [deletedList, setDeletedList] = useState<DbDeletedRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [actioningId, setActioningId] = useState<string | null>(null);

  const fetchBin = async () => {
    setLoading(true);
    const res = await loadDeletedRecords();
    setDeletedList(res.data);
    setLoading(false);
  };

  useEffect(() => {
    fetchBin();
  }, []);

  const handleRestore = async (item: DbDeletedRecord) => {
    if (!window.confirm(`Are you sure you want to restore this ${item.entity_type} record? It will automatically return to active tables.`)) {
      return;
    }
    
    setActioningId(item.id);
    setStatusMessage('Restoring record...');
    
    try {
      let success = false;
      if (item.entity_type === 'employee') {
        const res = await restoreEmployee(item.entity_id);
        success = res.success;
      } else if (item.entity_type === 'attendance_record') {
        const res = await restoreAttendance(item.entity_id);
        success = res.success;
      }

      if (success) {
        setStatusMessage('Restored successfully!');
        onRestoreHappened();
        fetchBin();
      } else {
        setStatusMessage('Error restoring record from database.');
      }
    } catch (err: any) {
      setStatusMessage(`Restore failed: ${err.message}`);
    } finally {
      setActioningId(null);
      setTimeout(() => setStatusMessage(''), 2000);
    }
  };

  const handleHardPurge = async (item: DbDeletedRecord) => {
    if (!isAdmin) {
      alert('Security Alert: Only Administrators can permanently purge deleted entries.');
      return;
    }

    if (!window.confirm(`⚠️ PERMANENT DELETE WARNING ⚠️\n\nYou are about to permanently purge this ${item.entity_type} from the Supabase backend. This action is irreversible. All backups will be cleared. Continue?`)) {
      return;
    }

    setActioningId(item.id);
    setStatusMessage('Purging permanently...');

    try {
      let success = false;
      if (item.entity_type === 'employee') {
        const res = await permanentDeleteEmployee(item.entity_id);
        success = res.success;
      } else if (item.entity_type === 'attendance_record') {
        const res = await permanentDeleteAttendance(item.entity_id);
        success = res.success;
      }

      // Deleting the bin index row in a real Supabase setting can be emulated or left to complete
      setStatusMessage('Purged completely from backend.');
      fetchBin();
      onRestoreHappened();
    } catch (err: any) {
      setStatusMessage(`Purge failed: ${err.message}`);
    } finally {
      setActioningId(null);
      setTimeout(() => setStatusMessage(''), 2000);
    }
  };

  return (
    <div id="recycle-bin" className="bg-white rounded-xl shadow-lg border border-slate-200 p-6 space-y-6">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-4 border-slate-100">
        <div className="flex items-center gap-2">
          <DatabaseBackup className="h-6 w-6 text-emerald-600" />
          <div>
            <h3 className="font-bold text-slate-800 text-sm">Recycle Bin & RLS Soft-Deleted Log</h3>
            <p className="text-xs text-slate-500">Track edit histories and restore previously discarded records immediately</p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <button 
            type="button" 
            onClick={fetchBin}
            className="p-1.5 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors text-slate-600 text-xs flex items-center gap-1 cursor-pointer"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Reload Bin
          </button>
        </div>
      </div>

      {statusMessage && (
        <div className="bg-blue-50 border border-blue-200 text-blue-800 p-3 rounded-lg text-xs font-semibold animate-pulse">
          {statusMessage}
        </div>
      )}

      {/* Safety Notice */}
      <div className="bg-amber-50 border border-amber-200 text-slate-700 p-3.5 rounded-lg text-xs leading-normal flex items-start gap-2">
        <AlertTriangle className="h-4.5 w-4.5 text-amber-600 shrink-0 mt-0.5" />
        <div>
          <span className="font-bold text-amber-850">Regulatory Audit Trail:</span> Whenever an item is soft-deleted, state fields mark them as inactive. When hard-deleted, we permanently wipe original tables from cloud files. <strong>Permanent purging is restricted to the Admin profile only</strong>.
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-slate-400 text-xs">
          <span className="animate-spin rounded-full h-5 w-5 border-2 border-slate-400 border-t-transparent inline-block mr-2 align-middle"></span>
          Scanning tables for soft-deleted registers...
        </div>
      ) : deletedList.length === 0 ? (
        <div className="text-center py-12 text-slate-400 text-xs bg-slate-50 rounded-lg border border-dashed border-slate-300">
          <Clock className="h-8 w-8 text-slate-300 mx-auto mb-2" />
          No soft-deleted entries exist in the database recycle queue.
        </div>
      ) : (
        <div className="border border-slate-200 rounded-xl overflow-hidden">
          <table className="w-full text-left border-collapse text-xs">
            <thead className="bg-slate-100 font-bold text-slate-700 border-b border-slate-200">
              <tr>
                <th className="p-3 border-r border-slate-200">Date Deleted</th>
                <th className="p-3 border-r border-slate-200">Resource Type</th>
                <th className="p-3 border-r border-slate-200">Original Item Label</th>
                <th className="p-3 border-r border-slate-200">Unique Identifier</th>
                <th className="p-3">Actions (Restore / Purge)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {deletedList.map((item) => {
                const isEmployee = item.entity_type === 'employee';
                let label = '';
                try {
                  if (isEmployee) {
                    label = `Roster staff: ${item.original_data?.name || item.entity_id} (${item.original_data?.designation || 'Staff'})`;
                  } else {
                    label = `Attendance date: ${item.original_data?.date || 'N/A'} for ID: ${item.original_data?.employee_id || item.entity_id}`;
                  }
                } catch {
                  label = `Resource ID: ${item.entity_id}`;
                }

                return (
                  <tr key={item.id} className="hover:bg-slate-50">
                    <td className="p-3 border-r border-slate-200 text-slate-550 font-mono text-[11px]">
                      {item.deleted_at ? new Date(item.deleted_at).toLocaleString() : 'Recent'}
                    </td>
                    <td className="p-3 border-r border-slate-200">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${isEmployee ? 'bg-violet-100 text-violet-850' : 'bg-sky-100 text-sky-850'}`}>
                        {item.entity_type.toUpperCase()}
                      </span>
                    </td>
                    <td className="p-3 border-r border-slate-200 font-medium text-slate-700">
                      {label}
                    </td>
                    <td className="p-3 border-r border-slate-200 text-slate-400 font-mono text-[11px]">
                      {item.entity_id}
                    </td>
                    <td className="p-3 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleRestore(item)}
                        disabled={actioningId !== null}
                        className="bg-emerald-50 hover:bg-emerald-100 text-emerald-820 font-bold px-2.5 py-1 text-xs rounded-lg flex items-center gap-1 transition-colors cursor-pointer disabled:opacity-50"
                      >
                        <RotateCcw className="h-3 w-3" />
                        Restore
                      </button>

                      <button
                        type="button"
                        onClick={() => handleHardPurge(item)}
                        disabled={actioningId !== null}
                        className={`font-semibold px-2.5 py-1 text-xs rounded-lg flex items-center gap-1 transition-colors cursor-pointer disabled:opacity-50 ${
                          isAdmin 
                            ? 'bg-rose-50 hover:bg-rose-100 text-rose-700' 
                            : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                        }`}
                        title={isAdmin ? 'Permanently Wipe from Supabase' : 'Requires Owner Admin access'}
                      >
                        <Trash className="h-3 w-3" />
                        Hard Wipe
                        {!isAdmin && <ShieldAlert className="h-3 w-3" />}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Admin database purge hard wipe */}
      <HardWipeManager 
        isAdmin={isAdmin}
        onWipeComplete={async () => {
          await fetchBin();
          onRestoreHappened();
        }}
      />

    </div>
  );
}
