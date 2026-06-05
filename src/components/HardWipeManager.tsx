import React, { useState } from 'react';
import { hardWipeTable } from '../backendService';
import { 
  AlertTriangle, 
  Trash2, 
  Download, 
  CheckCircle, 
  RefreshCw,
  Lock,
  Skull
} from 'lucide-react';

interface HardWipeManagerProps {
  isAdmin: boolean;
  onWipeComplete: () => Promise<void>;
}

export function HardWipeManager({ isAdmin, onWipeComplete }: HardWipeManagerProps) {
  const [typedConfirm, setTypedConfirm] = useState('');
  const [selectedOption, setSelectedOption] = useState<
    'attendance' | 'employees' | 'departments' | 'reports' | 'everything' | 'full_reset'
  >('attendance');

  const [loading, setLoading] = useState(false);
  const [resultCounts, setResultCounts] = useState<Record<string, number> | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  if (!isAdmin) {
    return (
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-6 text-center text-slate-400">
        <Lock className="h-8 w-8 mx-auto text-slate-400 mb-2" />
        <span className="font-bold text-xs">Security Restrict: Nuclear DB Hard Wipe configurations are locked for Administrator profiles.</span>
      </div>
    );
  }

  // Backup Export trigger
  const handleDownloadBackup = () => {
    try {
      const data = {
        departments: localStorage.getItem('excel_erp_departments') ? JSON.parse(localStorage.getItem('excel_erp_departments')!) : [],
        employees: localStorage.getItem('excel_erp_employees') ? JSON.parse(localStorage.getItem('excel_erp_employees')!) : [],
        attendance: localStorage.getItem('excel_erp_attendance_records') ? JSON.parse(localStorage.getItem('excel_erp_attendance_records')!) : [],
        monthlyReports: localStorage.getItem('excel_erp_monthly_reports') ? JSON.parse(localStorage.getItem('excel_erp_monthly_reports')!) : [],
        editHistory: localStorage.getItem('excel_erp_edit_history') ? JSON.parse(localStorage.getItem('excel_erp_edit_history')!) : [],
        deletedRecords: localStorage.getItem('excel_erp_deleted_records') ? JSON.parse(localStorage.getItem('excel_erp_deleted_records')!) : [],
        importLogs: localStorage.getItem('excel_erp_import_logs') ? JSON.parse(localStorage.getItem('excel_erp_import_logs')!) : [],
        metadata: {
          exportedAt: new Date().toISOString(),
          system: "KaprayOfficial ERP Attendance Manager"
        }
      };

      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `KaprayOfficial_Database_Backup_${new Date().toISOString().split('T')[0]}.json`;
      link.click();
      URL.revokeObjectURL(url);
      setSuccessMsg('Active backup exported successfully! Save this JSON securely.');
    } catch (err: any) {
      setErrorText('Backup generation failed: ' + err.message);
    }
  };

  const handleWipeExecute = async () => {
    setErrorText(null);
    setSuccessMsg(null);
    setResultCounts(null);

    // Phrase verification
    if (typedConfirm !== 'DELETE ALL ATTENDANCE DATA') {
      setErrorText('Incorrect verification phrase. Please type the text EXACTLY as indicated.');
      return;
    }

    if (!window.confirm('🚨 PERMANENT IRREVERSIBLE ACTION 🚨\n\nThis will purge selected database structures from Supabase AND your current LocalStorage cache. Backups cannot be recovered post-wipe.\n\nAre you absolutely sure you want to proceed?')) {
      return;
    }

    setLoading(true);

    let tablesToWipe: ('departments' | 'employees' | 'attendance_records' | 'monthly_reports' | 'attendance_edit_history' | 'deleted_records' | 'import_logs')[] = [];

    if (selectedOption === 'attendance') {
      tablesToWipe = ['attendance_records', 'attendance_edit_history', 'deleted_records'];
    } else if (selectedOption === 'employees') {
      tablesToWipe = ['employees', 'deleted_records'];
    } else if (selectedOption === 'departments') {
      tablesToWipe = ['departments'];
    } else if (selectedOption === 'reports') {
      tablesToWipe = ['monthly_reports'];
    } else if (selectedOption === 'everything') {
      // everything except config (which is just local db connectivity)
      tablesToWipe = ['attendance_records', 'employees', 'departments', 'monthly_reports', 'attendance_edit_history', 'deleted_records', 'import_logs'];
    } else if (selectedOption === 'full_reset') {
      tablesToWipe = ['attendance_records', 'employees', 'departments', 'monthly_reports', 'attendance_edit_history', 'deleted_records', 'import_logs'];
    }

    const res = await hardWipeTable(tablesToWipe);
    setLoading(false);

    if (res.success) {
      setResultCounts(res.counts);
      setTypedConfirm('');
      setSuccessMsg('Wipe policy execution finished.');
      
      if (selectedOption === 'full_reset') {
        localStorage.clear();
        setSuccessMsg('Full factory system reset completed! Page will reload in 3 seconds to reinitialize default state.');
        setTimeout(() => {
          window.location.reload();
        }, 3000);
      } else {
        await onWipeComplete();
      }
    } else {
      setErrorText(res.error || 'Purging table structures failed in the database engine.');
    }
  };

  return (
    <div id="hard-wipe-card" className="bg-white border-2 border-rose-100 rounded-xl shadow-lg p-5 space-y-5 animate-in fade-in duration-200">
      <div className="flex items-center gap-3 border-b border-rose-50 pb-3">
        <Skull className="h-6 w-6 text-rose-600 shrink-0" />
        <div>
          <h4 className="font-extrabold text-sm text-slate-800">Admin Nuclear Database hard Wipe Options</h4>
          <p className="text-[10px] text-slate-500 font-medium">Reset tables, purge logs, or factory-wipe everything from live databases instantly</p>
        </div>
      </div>

      <div className="bg-amber-50 border border-amber-200 p-4 rounded-lg flex items-start gap-2.5">
        <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
        <div className="text-xs leading-normal text-slate-700">
          <strong className="text-amber-850 block mb-1">DATA DAMAGE HAZARD</strong>
          Wiping data removes records permanently from both Supabase Cloud tables and local offline caches. We strongly advise creating a backup containing the complete schema before executing any wipe instructions below.
        </div>
      </div>

      {errorText && (
        <div className="bg-rose-50 border border-rose-200 text-rose-800 text-xs p-3.5 rounded-lg font-bold">
          ⚠ {errorText}
        </div>
      )}

      {successMsg && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs p-3.5 rounded-lg font-extrabold">
          ✓ {successMsg}
        </div>
      )}

      {resultCounts && (
        <div className="bg-slate-50 border border-slate-200 p-4 rounded-lg space-y-1.5">
          <span className="text-slate-800 font-bold text-xs block mb-1">Purge Report: Successfully deleted records:</span>
          {Object.entries(resultCounts).map(([tbl, count]) => (
            <div key={tbl} className="flex justify-between text-xs font-mono text-slate-600">
              <span className="capitalize">{tbl.replace('_', ' ')}:</span>
              <span className="font-bold text-rose-600 text-right">{count} rows cleared</span>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Step 1: Backup & Options selection */}
        <div className="space-y-4">
          <div>
            <span className="block text-[10px] font-extrabold text-slate-500 uppercase tracking-wider mb-2">
              Step 1: Download Database Backup
            </span>
            <button
              onClick={handleDownloadBackup}
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-4 py-2.5 rounded-lg flex items-center justify-center gap-1.5 w-full cursor-pointer transition-all shadow-sm"
            >
              <Download className="h-4 w-4" />
              Download Full Backup (JSON)
            </button>
          </div>

          <div>
            <span className="block text-[10px] font-extrabold text-slate-500 uppercase tracking-wider mb-2">
              Step 2: Selection Target
            </span>
            <select
              value={selectedOption}
              onChange={(e) => setSelectedOption(e.target.value as any)}
              className="w-full text-xs border border-slate-300 rounded-lg p-2.5 focus:outline-none focus:ring-1 focus:ring-rose-500"
            >
              <option value="attendance">Wipe attendance logs & histories only</option>
              <option value="employees">Wipe worker roster directory only</option>
              <option value="departments">Wipe departments registry only</option>
              <option value="reports">Wipe compiled salary monthly reports only</option>
              <option value="everything">Wipe all tables except database configurations</option>
              <option value="full_reset">Hard Factory Reset (All tables + localStorage clear)</option>
            </select>
          </div>
        </div>

        {/* Step 2: Typing confirmation phrase */}
        <div className="space-y-4 bg-slate-50/50 p-3.5 rounded-xl border border-slate-150">
          <div>
            <label className="block text-[10px] font-extrabold text-rose-800 uppercase tracking-wider mb-1 leading-normal">
              Step 3: Verification Phrase Check
            </label>
            <p className="text-[10px] text-slate-500 mb-2 leading-relaxed">
              To verify deletion permission, type the exact text <strong className="text-slate-800 font-black font-mono">DELETE ALL ATTENDANCE DATA</strong> in the field below:
            </p>
            <input
              type="text"
              placeholder="Type confirmation phrase here..."
              value={typedConfirm}
              onChange={(e) => setTypedConfirm(e.target.value)}
              className="w-full text-xs font-mono border border-slate-300 rounded-lg p-2.5 bg-white uppercase tracking-tight focus:outline-none focus:ring-1 focus:ring-rose-500"
            />
          </div>

          <button
            onClick={handleWipeExecute}
            disabled={loading || typedConfirm !== 'DELETE ALL ATTENDANCE DATA'}
            className="bg-rose-650 hover:bg-rose-700 disabled:bg-slate-200 disabled:text-slate-400 text-white text-xs font-black py-2.5 rounded-lg flex items-center justify-center gap-1.5 w-full cursor-pointer transition-all uppercase shadow-md shadow-rose-100"
          >
            {loading ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
            {selectedOption === 'full_reset' ? 'Execute Hard System Factory Reset' : 'Purge Selection Databases Now'}
          </button>
        </div>
      </div>
    </div>
  );
}
