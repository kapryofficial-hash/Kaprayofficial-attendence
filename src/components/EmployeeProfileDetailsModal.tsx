import React, { useState, useMemo } from 'react';
import { 
  X, 
  User, 
  FolderLock, 
  FileText, 
  ShieldAlert, 
  History, 
  Printer, 
  Upload, 
  Download, 
  Trash2, 
  Eye, 
  Coins, 
  UserCheck, 
  Calendar, 
  FileCheck,
  AlertTriangle,
  Info
} from 'lucide-react';
import { DbEmployee, DbDepartment, DbAttendance } from '../supabaseClient';
import { EmployeeCommission, EmployeeAllowance, OwnerAdjustment, SalaryReview, EmployeeDocument, EmployeeAdvance, AdvanceRecovery, EmployeeWarning, AllowedUserRole } from '../types';
import { formatPKR } from '../utils';

interface EmployeeProfileDetailsModalProps {
  isOpen: boolean;
  employee: DbEmployee;
  departments: DbDepartment[];
  onClose: () => void;
  onSave: (updated: DbEmployee) => Promise<void>;
  userRole: AllowedUserRole;
  currentUserEmail: string;
  currentUserId: string | null;

  // Documents
  documents: EmployeeDocument[];
  onAddDocument: (doc: EmployeeDocument) => Promise<void>;
  onDeleteDocument: (id: string) => Promise<void>;

  // Advances
  advances: EmployeeAdvance[];
  recoveries: AdvanceRecovery[];
  onAddAdvance: (adv: EmployeeAdvance) => Promise<void>;
  onAddRecovery: (rec: AdvanceRecovery) => Promise<void>;
  onDeleteAdvance: (id: string) => Promise<void>;
  onDeleteRecovery: (id: string) => Promise<void>;

  // Warnings
  warnings: EmployeeWarning[];
  onAddWarning: (warn: EmployeeWarning) => Promise<void>;
  onDeleteWarning: (id: string) => Promise<void>;

  // Auxiliary context for Self-Report
  attendance: DbAttendance[];
  commissions: EmployeeCommission[];
  allowances: EmployeeAllowance[];
  adjustments: OwnerAdjustment[];
  salaryReviews: SalaryReview[];
}

export function EmployeeProfileDetailsModal({
  isOpen,
  employee,
  departments,
  onClose,
  onSave,
  userRole,
  currentUserEmail,
  currentUserId,
  
  documents,
  onAddDocument,
  onDeleteDocument,

  advances,
  recoveries,
  onAddAdvance,
  onAddRecovery,
  onDeleteAdvance,
  onDeleteRecovery,

  warnings,
  onAddWarning,
  onDeleteWarning,

  attendance,
  commissions,
  allowances,
  adjustments,
  salaryReviews
}: EmployeeProfileDetailsModalProps) {
  const [activeTab, setActiveTab] = useState<'info' | 'vault' | 'advance' | 'disciplinary' | 'report'>('info');
  const [isSaving, setIsSaving] = useState(false);

  // States for Employment editing
  const [name, setName] = useState(employee.employee_name || employee.name || '');
  const [email, setEmail] = useState(employee.email || '');
  const [designation, setDesignation] = useState(employee.designation || '');
  const [deptId, setDeptId] = useState(employee.department_id || '');
  const [baseSalary, setBaseSalary] = useState(Number(employee.base_salary || employee.salary || 0));

  // States for Document Vault uploads
  const [selectedDocType, setSelectedDocType] = useState<EmployeeDocument['document_type']>('CNIC Front');
  const [docFileString, setDocFileString] = useState<string>('');
  const [docFileName, setDocFileName] = useState<string>('');
  const [docFileType, setDocFileType] = useState<string>('');
  const [docFileSize, setDocFileSize] = useState<number>(0);

  // States for Advance forms
  const [advAmt, setAdvAmt] = useState<number>(0);
  const [advReason, setAdvReason] = useState<string>('');
  const [recAmt, setRecAmt] = useState<number>(0);
  const [recType, setRecType] = useState<'Salary Deduction' | 'Manual Payment'>('Salary Deduction');
  const [recMonth, setRecMonth] = useState<string>(new Date().toISOString().substring(0, 7)); // YYYY-MM

  // States for Disciplinary warnings
  const [warnType, setWarnType] = useState<EmployeeWarning['warning_type']>('Written Warning');
  const [warnReason, setWarnReason] = useState<string>('');
  const [warnAttachmentString, setWarnAttachmentString] = useState<string>('');
  const [warnAttachmentName, setWarnAttachmentName] = useState<string>('');

  // Permission settings
  const hasVaultWrite = userRole === 'super_admin';
  const hasVaultRead = userRole === 'super_admin' || userRole === 'manager';
  
  const hasAdvanceControl = userRole === 'super_admin' || userRole === 'manager';
  const hasWarningControl = userRole === 'super_admin' || userRole === 'manager';

  // State for image zoom / download preview modal
  const [documentPreviewUrl, setDocumentPreviewUrl] = useState<{ name: string; data: string } | null>(null);

  // Filtering data for CURRENT employee
  const currentEmployeeDocs = useMemo(() => {
    return documents.filter(d => d.employee_id === employee.id);
  }, [documents, employee.id]);

  const currentEmployeeAdvances = useMemo(() => {
    return advances.filter(a => a.employee_id === employee.id);
  }, [advances, employee.id]);

  const currentEmployeeRecoveries = useMemo(() => {
    return recoveries.filter(r => r.employee_id === employee.id);
  }, [recoveries, employee.id]);

  const currentEmployeeWarnings = useMemo(() => {
    return warnings.filter(w => w.employee_id === employee.id);
  }, [warnings, employee.id]);

  // Aggregate Outstanding Balance calculations
  const totalIssuedAdvances = useMemo(() => {
    return currentEmployeeAdvances.reduce((sum, item) => sum + item.amount, 0);
  }, [currentEmployeeAdvances]);

  const totalRecoveredAdvances = useMemo(() => {
    return currentEmployeeRecoveries.reduce((sum, item) => sum + item.recovered_amount, 0);
  }, [currentEmployeeRecoveries]);

  const outstandingAdvanceBalance = useMemo(() => {
    return Math.max(0, totalIssuedAdvances - totalRecoveredAdvances);
  }, [totalIssuedAdvances, totalRecoveredAdvances]);

  // Form Submission handlers
  const handleSaveInfo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return alert('Name is required');
    const selectedDept = departments.find(d => d.id === deptId);
    
    setIsSaving(true);
    try {
      const updatedEmployee: DbEmployee = {
        ...employee,
        name: name.trim(),
        employee_name: name.trim(),
        email: email.trim(),
        designation: designation.trim(),
        department_id: deptId || null,
        department: selectedDept ? selectedDept.department_name : employee.department,
        department_name: selectedDept ? selectedDept.department_name : employee.department_name,
        base_salary: baseSalary,
        salary: baseSalary,
        active: employee.active,
        status: employee.status,
        updated_at: new Date().toISOString()
      };
      await onSave(updatedEmployee);
      alert('Employment configurations saved successfully');
    } catch (err: any) {
      alert(`Error saving employee: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  // Document attachments base64 converter
  const handleDocumentFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 8 * 1024 * 1024) {
      alert('File size exceeds the 8MB limit. Please upload a smaller file.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setDocFileString(reader.result as string);
      setDocFileName(file.name);
      setDocFileType(file.type);
      setDocFileSize(file.size);
    };
    reader.onerror = () => {
      alert('Error loading attachment file.');
    };
    reader.readAsDataURL(file);
  };

  const handleUploadDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!docFileString) {
      alert('Please select or drop a valid document file.');
      return;
    }

    const newDoc: EmployeeDocument = {
      id: `doc_${Date.now()}`,
      employee_id: employee.id,
      document_type: selectedDocType,
      file_name: docFileName,
      file_type: docFileType,
      file_size: docFileSize,
      file_data: docFileString,
      uploaded_by: currentUserEmail,
      uploaded_at: new Date().toISOString()
    };

    try {
      await onAddDocument(newDoc);
      setDocFileString('');
      setDocFileName('');
      setDocFileType('');
      setDocFileSize(0);
      alert(`${selectedDocType} uploaded successfully to Document Vault`);
    } catch (err: any) {
      alert(`Document upload error: ${err.message}`);
    }
  };

  // Advances creation handler
  const handleIssueAdvanceSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (advAmt <= 0) return alert('Invalid advance amount');
    if (!advReason.trim()) return alert('Reason is required');

    const newAdv: EmployeeAdvance = {
      id: `adv_${Date.now()}`,
      employee_id: employee.id,
      date: new Date().toISOString().substring(0, 10),
      amount: advAmt,
      reason: advReason.trim(),
      approved_by: currentUserEmail,
      remaining_balance: outstandingAdvanceBalance + advAmt,
      created_at: new Date().toISOString()
    };

    try {
      await onAddAdvance(newAdv);
      setAdvAmt(0);
      setAdvReason('');
      alert(`RS. ${formatPKR(advAmt)} advance tracked and registered inside ledger.`);
    } catch (err: any) {
      alert(`Advance issue error: ${err.message}`);
    }
  };

  // Recoveries creation handler
  const handleAddRecoverySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (recAmt <= 0) return alert('Invalid recovery amount');
    if (recAmt > outstandingAdvanceBalance) {
      alert(`Cannot recover RS. ${formatPKR(recAmt)}: Outstanding loan is RS. ${formatPKR(outstandingAdvanceBalance)}.`);
      return;
    }

    const linkedAdvance = currentEmployeeAdvances[0]; // link to standard loan session
    const newRec: AdvanceRecovery = {
      id: `rec_${Date.now()}`,
      advance_id: linkedAdvance ? linkedAdvance.id : 'multi_advance_ledger',
      employee_id: employee.id,
      date: new Date().toISOString().substring(0, 10),
      recovered_amount: recAmt,
      recovery_month: recType === 'Salary Deduction' ? recMonth : '',
      recovery_type: recType,
      recovered_by: currentUserEmail,
      created_at: new Date().toISOString()
    };

    try {
      await onAddRecovery(newRec);
      setRecAmt(0);
      alert(`RS. ${formatPKR(recAmt)} payment recorded inside advance ledger.`);
    } catch (err: any) {
      alert(`Advance recovery error: ${err.message}`);
    }
  };

  // Warning attachments reader
  const handleWarningFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 8 * 1024 * 1024) {
      alert('File size exceeds the 8MB limit. Please upload a smaller file.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setWarnAttachmentString(reader.result as string);
      setWarnAttachmentName(file.name);
    };
    reader.readAsDataURL(file);
  };

  const handleIssueWarningSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!warnReason.trim()) return alert('Warning reason details are required');

    const newWarning: EmployeeWarning = {
      id: `warn_${Date.now()}`,
      employee_id: employee.id,
      date: new Date().toISOString().substring(0, 10),
      warning_type: warnType,
      reason: warnReason.trim(),
      issued_by: currentUserEmail,
      attachment_name: warnAttachmentName || null,
      attachment_data: warnAttachmentString || null,
      status: 'Active',
      created_at: new Date().toISOString()
    };

    try {
      await onAddWarning(newWarning);
      setWarnReason('');
      setWarnAttachmentName('');
      setWarnAttachmentString('');
      alert(`${warnType} issued to ${employee.name}. Active dashboard counters updated.`);
    } catch (err: any) {
      alert(`Disciplinary Warning error: ${err.message}`);
    }
  };

  // Print trigger helper
  const handlePrintReport = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Popup blocker prevented loading the printable print view.');
      return;
    }

    // Format metrics
    const reportDate = new Date().toLocaleDateString('en-US', { day: '2-digit', month: 'long', year: 'numeric' });
    const empPresents = attendance.filter(a => a.employee_id === employee.id && a.status === 'Present').length;
    const empAbsents = attendance.filter(a => a.employee_id === employee.id && a.status === 'Absent').length;
    const empHalfDays = attendance.filter(a => a.employee_id === employee.id && a.status === 'Half-Day').length;
    const totalLateMinutes = attendance.filter(a => a.employee_id === employee.id).reduce((sum, item) => sum + (item.late_minutes || 0), 0);
    const totalOvertimeHours = attendance.filter(a => a.employee_id === employee.id).reduce((sum, item) => sum + (item.overtime_hours || 0), 0);

    const empCommSum = commissions.filter(c => c.employee_id === employee.id).reduce((sum, item) => sum + Number(item.commission_amount), 0);
    const empAllowSum = allowances.filter(al => al.employee_id === employee.id).reduce((sum, item) => sum + Number(item.allowance_amount), 0);
    const empAdjSum = adjustments.filter(ad => ad.employee_id === employee.id).reduce((sum, item) => sum + Number(item.amount), 0);

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Employment Self Report - ${employee.name}</title>
        <meta charset="utf-8" />
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #1e293b; padding: 40px; }
          .header { border-bottom: 2px solid #059669; padding-bottom: 15px; margin-bottom: 25px; display: flex; justify-content: space-between; align-items: flex-end; }
          .header h1 { margin: 0; font-size: 24px; color: #0f172a; text-transform: uppercase; letter-spacing: 0.5px; }
          .header p { margin: 5px 0 0 0; font-size: 11px; font-weight: bold; font-family: monospace; color: #0284c7; }
          .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 30px; }
          .card { border: 1px solid #e2e8f0; border-radius: 8px; padding: 15px; background: #f8fafc; }
          .card h3 { margin-top: 0; margin-bottom: 10px; font-size: 13px; color: #475569; text-transform: uppercase; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; }
          .field { display: flex; justify-content: space-between; padding: 4px 0; font-size: 12px; }
          .field span:first-child { font-weight: 600; color: #64748b; }
          .field span:last-child { font-weight: 700; color: #0f172a; font-family: monospace; }
          .table-title { font-size: 14px; font-weight: bold; color: #0f172a; margin-top: 25px; margin-bottom: 8px; border-left: 4px solid #059669; padding-left: 8px; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 11px; }
          th, td { border: 1px solid #cbd5e1; padding: 8px; text-align: left; }
          th { background-color: #f1f5f9; font-weight: bold; color: #334155; }
          .badge { font-weight: bold; padding: 2px 6px; border-radius: 4px; font-family: monospace; font-size: 9px; uppercase: true; }
          .badge-active { background-color: #d1fae5; color: #065f46; border: 1px solid #a7f3d0; }
          .badge-inactive { background-color: #f1f5f9; color: #475569; border: 1px solid #e2e8f0; }
          .badge-warning { background-color: #fef3c7; color: #92400e; border: 1px solid #fde68a; }
          .footer { margin-top: 40px; text-align: center; border-top: 1px solid #e2e8f0; padding-top: 10px; font-size: 10px; color: #94a3b8; font-weight: bold; }
          @media print {
            body { padding: 0; }
            button { display: none; }
          }
        </style>
      </head>
      <body>
        <div style="text-align: right; margin-bottom: 15px;">
          <button onclick="window.print()" style="background:#059669; color:white; border:none; padding:8px 16px; font-size:12px; font-weight:bold; border-radius:4px; cursor:pointer;">
            Print / Save to PDF
          </button>
        </div>

        <div class="header">
          <div>
            <h1>KaprayOfficial HRMS Enterprise</h1>
            <p>EMPLOYEE COMPREHENSIVE PERFORMANCE RECORD LEDGER</p>
          </div>
          <div style="text-align: right; font-size: 11px; color: #64748b; font-weight: bold;">
            Report Date: ${reportDate}
          </div>
        </div>

        <div class="grid">
          <div class="card">
            <h3>Staff Personal Profile</h3>
            <div class="field"><span>Staff Code ID:</span><span>${employee.id}</span></div>
            <div class="field"><span>Staff Member:</span><span>${employee.name}</span></div>
            <div class="field"><span>Email Address:</span><span>${employee.email || '-'}</span></div>
            <div class="field"><span>Department Team:</span><span>${employee.department}</span></div>
            <div class="field"><span>Designation Role:</span><span>${employee.designation}</span></div>
            <div class="field"><span>Roster Salary:</span><span>${formatPKR(employee.base_salary)}</span></div>
            <div class="field"><span>Roster Status:</span><span><span class="badge ${employee.active ? 'badge-active' : 'badge-inactive'}">${employee.active ? 'ACTIVE' : 'DISABLED'}</span></span></div>
          </div>

          <div class="card">
            <h3>Performance & Attendance Summary</h3>
            <div class="field"><span>Presents Worked:</span><span>${empPresents} Days</span></div>
            <div class="field"><span>Half-Days Worked:</span><span>${empHalfDays} Days</span></div>
            <div class="field"><span>Absents Registered:</span><span>${empAbsents} Days</span></div>
            <div class="field"><span>Accumulated Lates:</span><span>${totalLateMinutes} Minutes</span></div>
            <div class="field"><span>Overtime Earned:</span><span>${totalOvertimeHours} Hours</span></div>
            <div class="field"><span>Outstanding Advance:</span><span>${formatPKR(outstandingAdvanceBalance)}</span></div>
            <div class="field"><span>Active Warning Log:</span><span>${currentEmployeeWarnings.filter(w=>w.status === 'Active').length} Active</span></div>
          </div>
        </div>

        <div class="grid">
          <div class="card" style="grid-column: span 2;">
            <h3>Financial Remuneration Summary (Accumulated)</h3>
            <div class="field"><span>Sales Commissions Earned:</span><span>${formatPKR(empCommSum)}</span></div>
            <div class="field"><span>Allowances & Hazri Bonuses:</span><span>${formatPKR(empAllowSum)}</span></div>
            <div class="field"><span>Owner Compensation Adjustments:</span><span>${formatPKR(empAdjSum)}</span></div>
          </div>
        </div>

        <div class="table-title">Chronological Attendance History (Recent)</div>
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Status</th>
              <th>Check-In</th>
              <th>Check-Out</th>
              <th>Work Hours</th>
              <th>Late Minutes</th>
              <th>Overtime Hours</th>
            </tr>
          </thead>
          <tbody>
            ${attendance.filter(a => a.employee_id === employee.id).slice(0, 10).map(a => `
              <tr>
                <td><strong>${a.attendance_date || a.date}</strong></td>
                <td><span class="badge ${a.status === 'Present' ? 'badge-active' : 'badge-warning'}">${a.status}</span></td>
                <td>${a.check_in || '-'}</td>
                <td>${a.check_out || '-'}</td>
                <td>${a.net_hours || '0'} hrs</td>
                <td>${a.late_minutes || '0'} mins</td>
                <td>${a.overtime_hours || '0'} hrs</td>
              </tr>
            `).join('') || '<tr><td colspan="7" style="text-align:center;">No recent attendance records found.</td></tr>'}
          </tbody>
        </table>

        <div class="table-title">Outstanding Advance ledger & Recoveries</div>
        <table>
          <thead>
            <tr>
              <th>Type</th>
              <th>Date</th>
              <th>Amount (PKR)</th>
              <th>Details & Notes</th>
              <th>Tracked By</th>
            </tr>
          </thead>
          <tbody>
            ${[
              ...currentEmployeeAdvances.map(a => ({ type: 'loan', date: a.date, val: a.amount, detail: a.reason, op: a.approved_by })),
              ...currentEmployeeRecoveries.map(r => ({ type: 'recovery', date: r.date, val: -r.recovered_amount, detail: `${r.recovery_type} ${r.recovery_month ? '('+r.recovery_month+')' : ''}`, op: r.recovered_by }))
            ].sort((a,b)=>b.date.localeCompare(a.date)).map(item => `
              <tr>
                <td><span class="badge ${item.type === 'loan' ? 'badge-warning' : 'badge-active'}">${item.type.toUpperCase()}</span></td>
                <td><strong>${item.date}</strong></td>
                <td><strong>${item.val > 0 ? '+' : ''}${formatPKR(item.val)}</strong></td>
                <td>${item.detail}</td>
                <td>${item.op}</td>
              </tr>
            `).join('') || '<tr><td colspan="5" style="text-align:center;">No advance history found.</td></tr>'}
          </tbody>
        </table>

        <div class="table-title">Official Disciplinary Warning History</div>
        <table>
          <thead>
            <tr>
              <th>Warning Type</th>
              <th>Date</th>
              <th>Reason & Directives</th>
              <th>Issued By</th>
              <th>Roster Status</th>
            </tr>
          </thead>
          <tbody>
            ${currentEmployeeWarnings.map(w => `
              <tr>
                <td><span class="badge badge-warning">${w.warning_type.toUpperCase()}</span></td>
                <td><strong>${w.date}</strong></td>
                <td>${w.reason}</td>
                <td>${w.issued_by}</td>
                <td><span class="badge ${w.status === 'Active' ? 'badge-warning' : 'badge-active'}">${w.status}</span></td>
              </tr>
            `).join('') || '<tr><td colspan="5" style="text-align:center;">No warning history found. Clean record.</td></tr>'}
          </tbody>
        </table>

        <div class="footer">
          Generated automatically by KaprayOfficial HRMS ERP v1 Central Server. Authorized digital print.
        </div>
      </body>
      </html>
    `;

    printWindow.document.write(htmlContent);
    printWindow.document.close();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl h-[85vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200 border border-slate-200">
        
        {/* Banner header inside Profile modal */}
        <div className="bg-slate-900 px-6 py-5 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-emerald-600 flex items-center justify-center font-bold font-mono text-base shadow-inner">
              {employee.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <h3 className="font-extrabold text-base leading-tight tracking-tight flex items-center gap-2">
                {employee.name}
                <span className="text-xs text-slate-400 font-mono font-medium">({employee.id})</span>
              </h3>
              <p className="text-xs text-slate-400 font-medium">
                {employee.designation || 'Specialist Staff'} • {employee.department || 'Unassigned Dept'}
              </p>
            </div>
          </div>
          <button 
            type="button" 
            onClick={onClose} 
            className="text-slate-400 hover:text-white transition-colors duration-150 p-1.5 hover:bg-slate-800 rounded-lg cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* 5-Tab Navigation controller layout */}
        <div className="flex border-b border-slate-200 bg-slate-50 px-6 py-2.5 gap-2 shrink-0 overflow-x-auto w-full">
          <button
            type="button"
            onClick={() => setActiveTab('info')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'info' 
                ? 'bg-white text-emerald-800 shadow-xs border-b-2 border-emerald-600' 
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <User className="h-4 w-4" />
            Employment specs
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('vault')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'vault' 
                ? 'bg-white text-emerald-800 shadow-xs border-b-2 border-emerald-600' 
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <FolderLock className="h-4 w-4" />
            Document Vault
            {currentEmployeeDocs.length > 0 && (
              <span className="bg-emerald-100 text-emerald-800 text-[9px] px-1.5 py-0.5 rounded-full font-black">
                {currentEmployeeDocs.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('advance')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'advance' 
                ? 'bg-white text-emerald-800 shadow-xs border-b-2 border-emerald-600' 
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <Coins className="h-4 w-4" />
            Advance Ledger
            {outstandingAdvanceBalance > 0 && (
              <span className="bg-amber-100 text-amber-800 text-[9px] px-1.5 py-0.5 rounded-full font-black animate-pulse">
                {formatPKR(outstandingAdvanceBalance)}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('disciplinary')}
            className={`px-4 py-2 rounded-lg text-[11px] font-bold transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'disciplinary' 
                ? 'bg-white text-emerald-800 shadow-xs border-b-2 border-emerald-600' 
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <ShieldAlert className="h-4 w-4" />
            Warnings Log
            {currentEmployeeWarnings.filter(w => w.status === 'Active').length > 0 && (
              <span className="bg-rose-100 text-rose-800 text-[9px] px-1.5 py-0.5 rounded-full font-black">
                {currentEmployeeWarnings.filter(w => w.status === 'Active').length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('report')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'report' 
                ? 'bg-white text-emerald-800 shadow-xs border-b-2 border-emerald-600' 
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <Printer className="h-4 w-4" />
            Print Self-Report
          </button>
        </div>

        {/* Content body layout container */}
        <div className="flex-1 overflow-y-auto p-6 bg-slate-50">
          
          {/* TAB 1: PROFILE INFORMATION DETAILS Form */}
          {activeTab === 'info' && (
            <div className="max-w-xl mx-auto bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
              <h4 className="text-sm font-bold text-slate-800 mb-4 pb-2 border-b border-slate-100 uppercase tracking-wider flex items-center gap-2">
                <FileCheck className="h-4 w-4 text-emerald-655" />
                Customize Worker Employment Profile Specs
              </h4>
              
              <form onSubmit={handleSaveInfo} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">Worker Full Name</label>
                  <input 
                    type="text" 
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    disabled={userRole !== 'super_admin'}
                    className="w-full text-xs px-3.5 py-2.5 border border-slate-300 rounded-lg focus:ring-1 focus:ring-emerald-500 font-medium disabled:opacity-60"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">Email Address</label>
                  <input 
                    type="email" 
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={userRole !== 'super_admin'}
                    className="w-full text-xs px-3.5 py-2.5 border border-slate-300 rounded-lg focus:ring-1 focus:ring-emerald-500 disabled:opacity-60"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1">Department Section Spec</label>
                    <select
                      value={deptId}
                      onChange={(e) => setDeptId(e.target.value)}
                      disabled={userRole !== 'super_admin'}
                      className="w-full text-xs px-3.5 py-2.5 border border-slate-300 rounded-lg focus:ring-1 focus:ring-emerald-500 font-bold disabled:opacity-60"
                      required
                    >
                      <option value="">-- Choose Dept --</option>
                      {departments.map(d => (
                        <option key={d.id} value={d.id}>{d.department_name}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1">Base Monthly Salary (PKR)</label>
                    <input 
                      type="number" 
                      value={baseSalary}
                      onChange={(e) => setBaseSalary(Number(e.target.value))}
                      disabled={userRole !== 'super_admin'}
                      className="w-full text-xs px-3.5 py-2.5 border border-slate-300 rounded-lg focus:ring-1 focus:ring-emerald-500 font-mono font-bold disabled:opacity-60"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">Official Designation Title</label>
                  <input 
                    type="text" 
                    value={designation}
                    onChange={(e) => setDesignation(e.target.value)}
                    disabled={userRole !== 'super_admin'}
                    className="w-full text-xs px-3.5 py-2.5 border border-slate-300 rounded-lg focus:ring-1 focus:ring-emerald-500 disabled:opacity-60"
                  />
                </div>

                {userRole === 'super_admin' ? (
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold py-2.5 px-4 rounded-lg shadow-sm text-xs transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {isSaving ? 'Processing database update...' : 'Save Updated Profile Configurations'}
                  </button>
                ) : (
                  <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-800 text-xs p-3.5 rounded-lg font-medium">
                    <Info className="h-4 w-4 text-amber-600 shrink-0" />
                    Read-only: Super Admin permissions are strictly required to edit worker salary or core directory identifiers.
                  </div>
                )}
              </form>
            </div>
          )}

          {/* TAB 2: EMPLOYEE SECURE DOCUMENT VAULT */}
          {activeTab === 'vault' && (
            <div className="space-y-6">
              
              {/* If user is staff viewer, absolute lock */}
              {!hasVaultRead ? (
                <div className="max-w-md mx-auto text-center bg-rose-50 border border-rose-220 rounded-2xl p-8 shadow-xs">
                  <FolderLock className="h-12 w-12 text-rose-600 mx-auto mb-3" />
                  <h4 className="font-extrabold text-slate-900 border-b pb-1.5 mb-2">Access Status Denied</h4>
                  <p className="text-xs text-rose-700 leading-relaxed font-semibold">
                    Staff Viewers have no access permission limits to inspect sensitive worker CNICs details or salary contracts attachments.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  
                  {/* Upload document panel */}
                  <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 lg:col-span-1 h-fit">
                    <h4 className="text-xs font-bold text-slate-800 mb-3 uppercase tracking-wider">
                      Upload Profile Attachment
                    </h4>

                    {hasVaultWrite ? (
                      <form onSubmit={handleUploadDocument} className="space-y-4">
                        <div>
                          <label className="block text-[10px] font-extrabold text-slate-500 mb-1">Select Document Category</label>
                          <select
                            value={selectedDocType}
                            onChange={(e) => setSelectedDocType(e.target.value as any)}
                            className="w-full text-xs border border-slate-300 rounded-lg p-2.5 font-bold focus:ring-1 focus:ring-emerald-500"
                          >
                            <option value="CNIC Front">CNIC Front Side</option>
                            <option value="CNIC Back">CNIC Back Side</option>
                            <option value="CV">Curriculum Vitae (CV)</option>
                            <option value="Appointment Letter">Appointment Letter</option>
                            <option value="Salary Agreement">Salary Agreement Contract</option>
                            <option value="Warning Letters">Warning Letters File</option>
                            <option value="Resignation Letter">Resignation Letter</option>
                            <option value="Misc Documents">Miscellaneous Attachments</option>
                          </select>
                        </div>

                        <div className="border-2 border-dashed border-slate-250 hover:border-emerald-500 rounded-xl p-5 text-center bg-slate-50 transition-colors relative cursor-pointer">
                          <input
                            type="file"
                            accept="image/*,application/pdf"
                            onChange={handleDocumentFileChange}
                            className="absolute inset-0 opacity-0 cursor-pointer"
                          />
                          <Upload className="h-6 w-6 text-slate-400 mx-auto mb-2" />
                          <p className="text-[11px] font-bold text-slate-655 leading-tight">
                            {docFileName ? `Selected: ${docFileName}` : 'Choose File or Drop Image/PDF'}
                          </p>
                          <p className="text-[9px] text-slate-400 mt-1">Maximum upload size: 8MB limit</p>
                        </div>

                        {docFileString && (
                          <div className="text-[10px] text-slate-600 bg-emerald-50 border border-emerald-100 p-2 rounded flex items-center justify-between font-bold">
                            <span className="truncate">File ready ({Math.round(docFileSize / 1024)} KB)</span>
                            <button type="button" onClick={() => setDocFileString('')} className="text-rose-600">Cancel</button>
                          </div>
                        )}

                        <button
                          type="submit"
                          className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold py-2 px-4 rounded-lg shadow-sm text-xs transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                        >
                          <Upload className="h-3.5 w-3.5" />
                          Encrypt & Upload Document
                        </button>
                      </form>
                    ) : (
                      <div className="bg-amber-50 border border-amber-200 text-amber-800 text-[11px] p-3.5 rounded-lg leading-relaxed font-semibold">
                        <Info className="h-4 w-4 text-amber-500 shrink-0 mb-1" />
                        Manager roles are restricted to View-Only vault attachments. Saving or uploading profiles is reserved for Super Admins.
                      </div>
                    )}
                  </div>

                  {/* Documents Display Grid */}
                  <div className="lg:col-span-2 space-y-4">
                    <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
                      <h4 className="text-xs font-bold text-slate-800 mb-3 uppercase tracking-wider">
                        Vault Attachment Vault Directory ({currentEmployeeDocs.length})
                      </h4>

                      {currentEmployeeDocs.length === 0 ? (
                        <div className="text-center py-12 text-slate-400 font-medium">
                          <FolderLock className="h-8 w-8 mx-auto text-slate-300 mb-2" />
                          No encrypted document attachments uploaded for this staff member.
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          {currentEmployeeDocs.map(doc => (
                            <div key={doc.id} className="border border-slate-200 rounded-xl p-3 bg-slate-50 flex flex-col justify-between hover:border-slate-300 transition-colors">
                              <div className="flex items-start justify-between gap-1 mb-2">
                                <div>
                                  <span className="inline-block bg-slate-900 text-white text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded mb-1">
                                    {doc.document_type}
                                  </span>
                                  <h5 className="font-bold text-xs text-slate-800 truncate max-w-[180px]">{doc.file_name}</h5>
                                  <p className="text-[9px] text-slate-400 font-medium mt-0.5">
                                    Uploaded: {new Date(doc.uploaded_at).toLocaleDateString()} by {doc.uploaded_by.split('@')[0]}
                                  </p>
                                </div>
                                <div className="flex gap-1">
                                  <button
                                    onClick={() => setDocumentPreviewUrl({ name: doc.document_type, data: doc.file_data })}
                                    className="p-1 hover:bg-white border hover:border-slate-300 rounded text-slate-655"
                                    title="Preview Vault Attachment"
                                  >
                                    <Eye className="h-3.5 w-3.5" />
                                  </button>
                                  <a
                                    href={doc.file_data}
                                    download={doc.file_name}
                                    className="p-1 hover:bg-white border hover:border-slate-300 rounded text-slate-655"
                                    title="Download File"
                                  >
                                    <Download className="h-3.5 w-3.5" />
                                  </a>
                                  {hasVaultWrite && (
                                    <button
                                      onClick={() => onDeleteDocument(doc.id)}
                                      className="p-1 hover:bg-white border hover:border-slate-300 rounded text-rose-600"
                                      title="Delete Attachment Log"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                </div>
              )}
            </div>
          )}

          {/* TAB 3: EMPLOYEE ADVANCE LEDGER */}
          {activeTab === 'advance' && (
            <div className="space-y-6">
              
              {/* Stats Header Bento cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-emerald-50 border border-emerald-200 p-4 rounded-xl shadow-xs">
                  <span className="text-[10px] font-extrabold text-emerald-800 uppercase tracking-wider block">Total Advances Issued</span>
                  <span className="text-lg font-black font-mono text-emerald-950 block mt-1">{formatPKR(totalIssuedAdvances)}</span>
                  <span className="text-[9px] text-emerald-650 block">All recorded loan assets chronologically</span>
                </div>

                <div className="bg-teal-50 border border-teal-200 p-4 rounded-xl shadow-xs">
                  <span className="text-[10px] font-extrabold text-teal-800 uppercase tracking-wider block">Total Advances Recovered</span>
                  <span className="text-lg font-black font-mono text-teal-950 block mt-1">{formatPKR(totalRecoveredAdvances)}</span>
                  <span className="text-[9px] text-teal-650 block">Deducted from payroll or paid manually</span>
                </div>

                <div className="bg-amber-50 border border-amber-250 p-4 rounded-xl shadow-xs">
                  <span className="text-[10px] font-extrabold text-amber-800 uppercase tracking-wider block">Remaining Balance Payable</span>
                  <span className="text-lg font-black font-mono text-amber-950 block mt-1 animate-pulse">{formatPKR(outstandingAdvanceBalance)}</span>
                  <span className="text-[9px] text-amber-650 block">Active outstanding advance liability</span>
                </div>
              </div>

              {/* Advances Ledger panels */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                
                {/* Issue and Recovery Forms */}
                <div className="space-y-4 lg:col-span-1">
                  
                  {/* Form 1: Issue Advance */}
                  <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
                    <h4 className="text-xs font-bold text-slate-800 mb-3 uppercase tracking-wider">
                      Issue Staff Advance Loan
                    </h4>
                    
                    {hasAdvanceControl ? (
                      <form onSubmit={handleIssueAdvanceSubmit} className="space-y-3">
                        <div>
                          <label className="block text-[10px] font-bold text-slate-500 mb-1">Advance Amount (PKR)</label>
                          <input
                            type="number"
                            value={advAmt || ''}
                            onChange={(e) => setAdvAmt(Number(e.target.value))}
                            className="w-full text-xs border border-slate-300 rounded p-2 focus:ring-1 focus:ring-emerald-500 font-mono font-bold"
                            placeholder="RS. 5,000"
                            required
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-slate-500 mb-1">Reason / Notes Spec</label>
                          <input
                            type="text"
                            value={advReason}
                            onChange={(e) => setAdvReason(e.target.value)}
                            className="w-full text-xs border border-slate-300 rounded p-2 focus:ring-1 focus:ring-emerald-500"
                            placeholder="Emergency medical aid"
                            required
                          />
                        </div>
                        <button
                          type="submit"
                          className="w-full bg-slate-900 hover:bg-slate-950 text-white font-extrabold py-2 rounded shadow-xs text-xs cursor-pointer"
                        >
                          Approve and Record Advance
                        </button>
                      </form>
                    ) : (
                      <div className="text-[10px] text-slate-550 leading-relaxed font-semibold p-2 bg-slate-50 rounded">
                        Permission Denied: Supervisor access level required.
                      </div>
                    )}
                  </div>

                  {/* Form 2: Recovery Advance */}
                  {outstandingAdvanceBalance > 0 && (
                    <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
                      <h4 className="text-xs font-bold text-slate-800 mb-3 uppercase tracking-wider">
                        Recover Outstanding Loan
                      </h4>

                      {hasAdvanceControl ? (
                        <form onSubmit={handleAddRecoverySubmit} className="space-y-3">
                          <div>
                            <label className="block text-[10px] font-bold text-slate-500 mb-1">Receipt Recovery Amount (PKR)</label>
                            <input
                              type="number"
                              value={recAmt || ''}
                              onChange={(e) => setRecAmt(Number(e.target.value))}
                              max={outstandingAdvanceBalance}
                              className="w-full text-xs border border-slate-300 rounded p-2 focus:ring-1 focus:ring-emerald-500 font-mono font-bold text-emerald-800"
                              placeholder="PKR 2,500"
                              required
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold text-slate-500 mb-1">Recovery Stream Channel</label>
                            <select
                              value={recType}
                              onChange={(e) => setRecType(e.target.value as any)}
                              className="w-full text-xs border border-slate-300 rounded p-2 focus:ring-1 focus:ring-emerald-500 font-bold"
                            >
                              <option value="Salary Deduction">Auto Monthly Salary Deduction</option>
                              <option value="Manual Payment">Manual Cash Return Ledger</option>
                            </select>
                          </div>

                          {recType === 'Salary Deduction' && (
                            <div>
                              <label className="block text-[10px] font-bold text-slate-500 mb-1">Target Recovery Month</label>
                              <input
                                type="month"
                                value={recMonth}
                                onChange={(e) => setRecMonth(e.target.value)}
                                className="w-full text-xs border border-slate-300 rounded p-2 font-mono"
                                required
                              />
                            </div>
                          )}

                          <button
                            type="submit"
                            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold py-2 rounded shadow-xs text-xs cursor-pointer"
                          >
                            Post Ledger Recovery Cash Entry
                          </button>
                        </form>
                      ) : (
                        <div className="text-[10px] text-slate-500">Access Denied to adjust Ledger entries.</div>
                      )}
                    </div>
                  )}

                </div>

                {/* Ledger chronological timeline */}
                <div className="lg:col-span-2">
                  <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
                    <h4 className="text-xs font-bold text-slate-800 mb-3 uppercase tracking-wider">
                      Chronological Loan Ledger Operations
                    </h4>

                    {currentEmployeeAdvances.length === 0 && currentEmployeeRecoveries.length === 0 ? (
                      <div className="text-center py-12 text-slate-400">No active advance session history located.</div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse text-[11px]">
                          <thead className="bg-slate-100 font-bold border-b text-slate-600">
                            <tr>
                              <th className="p-2 border">Operation</th>
                              <th className="p-2 border">Date</th>
                              <th className="p-2 border">Amount</th>
                              <th className="p-2 border">Details Notes</th>
                              <th className="p-2 border">Operator</th>
                              <th className="p-2 border text-center">Action</th>
                            </tr>
                          </thead>
                          <tbody>
                            {[
                              ...currentEmployeeAdvances.map(a => ({ type: 'loan', id: a.id, date: a.date, amt: a.amount, detail: a.reason, op: a.approved_by })),
                              ...currentEmployeeRecoveries.map(r => ({ type: 'recovery', id: r.id, date: r.date, amt: -r.recovered_amount, detail: `${r.recovery_type} ${r.recovery_month ? '('+r.recovery_month+')' : ''}`, op: r.recovered_by }))
                            ].sort((a,b)=>b.date.localeCompare(a.date)).map((item, index) => (
                              <tr key={index} className="hover:bg-slate-50">
                                <td className="p-2 border">
                                  <span className={`inline-block text-[9px] font-black px-1.5 py-0.5 rounded ${
                                    item.type === 'loan' ? 'bg-orange-100 text-orange-850' : 'bg-teal-100 text-teal-850'
                                  }`}>
                                    {item.type.toUpperCase()}
                                  </span>
                                </td>
                                <td className="p-2 border font-mono font-bold text-slate-700">{item.date}</td>
                                <td className={`p-2 border font-mono font-black ${item.amt > 0 ? 'text-orange-700' : 'text-teal-700'}`}>
                                  {item.amt > 0 ? '+' : ''}{formatPKR(item.amt)}
                                </td>
                                <td className="p-2 border text-slate-600 font-medium">{item.detail}</td>
                                <td className="p-2 border text-slate-400 font-semibold">{item.op.split('@')[0]}</td>
                                <td className="p-2 border text-center">
                                  {hasAdvanceControl && (
                                    <button
                                      onClick={async () => {
                                        if (!confirm('Are you sure you want to revert this ledger entry permanently?')) return;
                                        if (item.type === 'loan') {
                                          await onDeleteAdvance(item.id);
                                        } else {
                                          await onDeleteRecovery(item.id);
                                        }
                                        alert('Ledger item reverted successfully.');
                                      }}
                                      className="text-rose-500 hover:text-rose-700 p-0.5"
                                      title="Revert transaction entry"
                                    >
                                      <Trash2 className="h-3 w-3" />
                                    </button>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>

              </div>

            </div>
          )}

          {/* TAB 4: WARNINGS & DISCIPLINARY SYSTEM */}
          {activeTab === 'disciplinary' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* Add disciplinary warning panel */}
              <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 lg:col-span-1 h-fit">
                <h4 className="text-xs font-bold text-slate-800 mb-3 uppercase tracking-wider">
                  Issue Disciplinary Directive
                </h4>

                {hasWarningControl ? (
                  <form onSubmit={handleIssueWarningSubmit} className="space-y-4">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 mb-1">Disciplinary severity</label>
                      <select
                        value={warnType}
                        onChange={(e) => setWarnType(e.target.value as any)}
                        className="w-full text-xs border border-slate-300 rounded p-2.5 font-bold focus:ring-1 focus:ring-emerald-500"
                      >
                        <option value="Verbal Warning">Verbal Warning</option>
                        <option value="Written Warning">Written Warning</option>
                        <option value="Final Warning">Final Escalation/Final Warning</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 mb-1">Reason Description</label>
                      <textarea
                        value={warnReason}
                        onChange={(e) => setWarnReason(e.target.value)}
                        className="w-full text-xs border border-slate-300 rounded p-2.5 focus:ring-1 focus:ring-emerald-500"
                        rows={4}
                        placeholder="Repeated lates or poor stitching production rate details..."
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 mb-1">Attach Written Directive (Image/PDF)</label>
                      <input
                        type="file"
                        accept="image/*,application/pdf"
                        onChange={handleWarningFileChange}
                        className="w-full text-xs border border-slate-200 p-1 bg-slate-50 rounded"
                      />
                    </div>

                    <button
                      type="submit"
                      className="w-full bg-rose-600 hover:bg-rose-700 text-white font-extrabold py-2.5 rounded shadow-sm text-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <AlertTriangle className="h-4 w-4" />
                      Dispatch Official Warning
                    </button>
                  </form>
                ) : (
                  <div className="text-xs text-slate-500">Supervisor access control credentials required.</div>
                )}
              </div>

              {/* Active employee disciplinary warnings directory */}
              <div className="lg:col-span-2 space-y-4">
                <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
                  <h4 className="text-xs font-bold text-slate-800 mb-3 uppercase tracking-wider flex items-center gap-2">
                    <ShieldAlert className="h-4 w-4 text-rose-600 animate-pulse" />
                    Warning and Infractions Records Directory ({currentEmployeeWarnings.length})
                  </h4>

                  {currentEmployeeWarnings.length === 0 ? (
                    <div className="text-center py-12 text-slate-400 font-semibold leading-relaxed">
                      Clean Record. No verbal, written, or final disciplinary warnings issued.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {currentEmployeeWarnings.map(w => (
                        <div key={w.id} className="border border-slate-200 hover:border-rose-300 rounded-xl p-4 bg-slate-50 flex flex-col justify-between transition-colors relative overflow-hidden">
                          {w.warning_type === 'Final Warning' && (
                            <div className="absolute top-0 left-0 right-0 h-1 bg-rose-600"></div>
                          )}
                          <div className="flex items-start justify-between gap-2.5">
                            <div>
                              <div className="flex items-center gap-2">
                                <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded border ${
                                  w.warning_type === 'Final Warning' ? 'bg-rose-100 text-rose-800 border-rose-220 animate-pulse' :
                                  w.warning_type === 'Written Warning' ? 'bg-amber-100 text-amber-800 border-amber-300' :
                                  'bg-slate-200 text-slate-700 border-slate-300'
                                }`}>
                                  {w.warning_type}
                                </span>
                                <span className="text-[10px] font-mono text-slate-500 font-bold">{w.date}</span>
                              </div>
                              <p className="text-xs text-slate-700 leading-relaxed font-semibold mt-2.5 whitespace-pre-line">{w.reason}</p>
                              <div className="flex items-center gap-2 mt-4 text-[10px] font-bold text-slate-400">
                                <span>Issued by: {w.issued_by.split('@')[0]}</span>
                                {w.attachment_name && (
                                  <button
                                    onClick={() => setDocumentPreviewUrl({ name: w.warning_type, data: w.attachment_data! })}
                                    className="text-emerald-600 hover:underline flex items-center gap-1.5"
                                  >
                                    <FileText className="h-3 w-3" /> View Directive attachment
                                  </button>
                                )}
                              </div>
                            </div>
                            
                            {hasWarningControl && (
                              <button
                                onClick={async () => {
                                  if (!confirm('Are you sure you want to strike this disciplinary warning log?')) return;
                                  await onDeleteWarning(w.id);
                                  alert('Warning deleted.');
                                }}
                                className="text-slate-400 hover:text-rose-600"
                                title="Strike warning"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

            </div>
          )}

          {/* TAB 5: PRINTABLE SELF-REPORT GENERATOR */}
          {activeTab === 'report' && (
            <div className="max-w-xl mx-auto bg-white p-6 rounded-2xl shadow-sm border border-slate-200 text-center space-y-4">
              <FileText className="h-12 w-12 text-emerald-600 mx-auto" />
              <h4 className="font-extrabold text-base text-slate-900 uppercase tracking-tight">Generate Corporate Roster Self Report Sheet</h4>
              
              <p className="text-xs text-slate-500 leading-relaxed max-w-md mx-auto">
                Generate a dynamic, professionally styled corporate PDF dossier containing general employment profile specs, visual check-in scores, earned overtime pay hours trackers, safety and discipline audit files, and ledger compensation chronologies.
              </p>

              <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl text-left text-xs font-medium text-slate-700 space-y-1.5 max-w-sm mx-auto">
                <div className="flex justify-between"><span>Employment info:</span><span className="font-mono text-slate-900 font-bold">READY ✔</span></div>
                <div className="flex justify-between"><span>Attendance summary:</span><span className="font-mono text-slate-900 font-bold">READY ✔</span></div>
                <div className="flex justify-between"><span>Advance ledger sheet:</span><span className="font-mono text-slate-900 font-bold">READY ({currentEmployeeDocs.length} DOCS) ✔</span></div>
                <div className="flex justify-between"><span>Earnings and reviews:</span><span className="font-mono text-slate-900 font-bold">READY ✔</span></div>
              </div>

              <button
                type="button"
                onClick={handlePrintReport}
                className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold py-2.5 px-6 rounded-lg shadow-sm text-xs transition-transform hover:scale-[1.01] active:scale-[0.99] cursor-pointer cursor-pointer"
              >
                <Printer className="h-4 w-4" />
                Initialize Single-Click PDF Print Sheet
              </button>
            </div>
          )}

        </div>

      </div>

      {/* DOCUMENT DETAILED PREVIEW MODAL */}
      {documentPreviewUrl && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-xs flex flex-col items-center justify-center p-4 z-[60] animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl p-4 max-w-2xl w-full max-h-[80vh] flex flex-col shadow-2xl relative">
            <button 
              onClick={() => setDocumentPreviewUrl(null)} 
              className="absolute top-3 right-3 bg-slate-900 text-white p-1 rounded-full hover:bg-slate-800 cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
            <h4 className="font-bold text-xs text-slate-800 mb-3">{documentPreviewUrl.name} Attachment Preview</h4>
            
            <div className="flex-1 overflow-auto bg-slate-100 rounded-xl p-2 flex items-center justify-center">
              {documentPreviewUrl.data.startsWith('data:application/pdf') ? (
                <embed src={documentPreviewUrl.data} type="application/pdf" width="100%" height="500px" />
              ) : (
                <img src={documentPreviewUrl.data} alt="Doc preview" className="max-h-[60vh] object-contain rounded shadow" />
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
