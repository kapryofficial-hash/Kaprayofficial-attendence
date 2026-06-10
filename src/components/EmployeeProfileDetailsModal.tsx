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
  Info,
  CheckCircle,
  Activity,
  TrendingUp,
  Clock,
  AlertCircle,
  Award
} from 'lucide-react';
import { DbEmployee, DbDepartment, DbAttendance } from '../supabaseClient';
import { EmployeeCommission, EmployeeAllowance, OwnerAdjustment, SalaryReview, EmployeeDocument, EmployeeAdvance, AdvanceRecovery, EmployeeWarning, AllowedUserRole } from '../types';
import { formatPKR, calculatePerformanceScore, getSmartBonusRecommendation } from '../utils';

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
  const [activeTab, setActiveTab] = useState<'summary' | 'attendance' | 'performance' | 'vault' | 'advance' | 'disciplinary' | 'timeline'>('summary');
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

  const chronologicalTimeline = useMemo(() => {
    const list: Array<{
      date: string;
      type: 'attendance' | 'document' | 'advance' | 'warning';
      title: string;
      desc: string;
      color: string;
    }> = [];

    // 1. Attendance events
    attendance
      .filter(a => a.employee_id === employee.id && !a.is_deleted)
      .forEach(a => {
        let desc = `Shift status registered. Check-in: ${a.check_in || '--:--'} | Check-out: ${a.check_out || '--:--'}.`;
        if (a.late_minutes > 0) desc += ` Arrived late by ${a.late_minutes} minutes.`;
        if (a.short_hours > 0) desc += ` Shift logged short of the expected hours.`;
        
        list.push({
          date: a.date,
          type: 'attendance',
          title: `Attendance: ${a.status}`,
          desc,
          color: a.status === 'Present' ? 'bg-emerald-500' : a.status === 'Absent' ? 'bg-rose-500' : 'bg-slate-400'
        });
      });

    // 2. Documents
    documents
      .filter(d => d.employee_id === employee.id)
      .forEach(d => {
        list.push({
          date: d.uploaded_at?.split('T')[0] || '',
          type: 'document',
          title: 'Vault File Deposited',
          desc: `Secure file "${d.file_name}" was uploaded successfully to worker vault.`,
          color: 'bg-indigo-500'
        });
      });

    // 3. Advances & Recoveries
    advances
      .filter(a => a.employee_id === employee.id)
      .forEach(a => {
        list.push({
          date: a.date,
          type: 'advance',
          title: `Loan Cash Advance Disbursed`,
          desc: `Loan amount of PKR ${a.amount} issued. Reason: ${a.reason || 'Not specified'}. Approved by: ${a.approved_by || 'Admin'}.`,
          color: 'bg-amber-500'
        });
      });

    recoveries
      .filter(r => r.employee_id === employee.id)
      .forEach(r => {
        list.push({
          date: r.date,
          type: 'advance',
          title: `Loan Cash Recovery Entry`,
          desc: `Amount of PKR ${r.recovered_amount} recovered via ${r.recovery_type} for month ${r.recovery_month || 'N/A'}. Deducted by: ${r.recovered_by || 'Admin'}.`,
          color: 'bg-teal-500'
        });
      });

    // 4. Warnings
    warnings
      .filter(w => w.employee_id === employee.id)
      .forEach(w => {
        list.push({
          date: w.date,
          type: 'warning',
          title: `Disciplinary Action Letter: ${w.warning_type}`,
          desc: `Issued corrective action warning: ${w.reason}. Operating status: ${w.status}. Approved: ${w.issued_by}.`,
          color: 'bg-rose-600'
        });
      });

    return list.sort((a,b) => b.date.localeCompare(a.date));
  }, [employee.id, attendance, documents, advances, recoveries, warnings]);

  const monthlyStats = useMemo(() => {
    const now = new Date();
    const curYear = String(now.getFullYear());
    const curMonth = String(now.getMonth() + 1).padStart(2, '0');
    
    const records = attendance.filter(a => {
      if (a.employee_id !== employee.id || a.is_deleted) return false;
      const [y, m] = a.date.split('-');
      return y === curYear && m === curMonth;
    });

    const presents = records.filter(a => a.status === 'Present').length;
    const halfDays = records.filter(a => a.status === 'Half-Day').length;
    const leaves = records.filter(a => a.status === 'Leave').length;
    const offs = records.filter(a => a.status === 'Off').length;
    const absents = records.filter(a => a.status === 'Absent').length;
    const lates = records.filter(a => a.late_minutes > 0 && a.status !== 'Absent').length;
    const missingCheckouts = records.filter(a => !a.check_out && a.check_in).length;

    const scoreData = calculatePerformanceScore(
      records.map(r => ({
        status: r.status,
        late_minutes: r.late_minutes,
        net_hours: r.net_hours,
        overtime_hours: r.overtime_hours,
        short_hours: r.short_hours,
        manual_status: r.manual_status,
        date: r.date
      }))
    );

    const totalDays = presents + halfDays + leaves + offs + absents;
    const attendancePercentage = totalDays > 0
      ? (((presents + leaves + offs + (halfDays * 0.5)) / totalDays) * 100)
      : 100;

    const rec = getSmartBonusRecommendation({
      score: scoreData.score,
      attendancePercentage,
      absentsCount: absents,
      lateCount: lates
    });

    return {
      records,
      presents,
      halfDays,
      leaves,
      offs,
      absents,
      lates,
      missingCheckouts,
      score: scoreData.score,
      remarks: scoreData.remarks,
      breakdown: scoreData.breakdown,
      attendancePercentage,
      recommendation: rec
    };
  }, [employee.id, attendance]);

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
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex justify-end z-50 animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-xl md:max-w-2xl h-screen flex flex-col shadow-2xl overflow-hidden animate-in slide-in-from-right duration-300 border-l border-slate-200">
        
        {/* Drawer Banner Header */}
        <div className="bg-slate-900 px-5 py-4 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-emerald-600 flex items-center justify-center font-bold font-mono text-base shadow-inner">
              {employee.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <h3 className="font-extrabold text-sm leading-tight tracking-tight flex items-center gap-2">
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

        {/* Dynamic 7-Tab Navigation row */}
        <div className="flex border-b border-slate-200 bg-slate-50 px-4 py-2 gap-1.5 shrink-0 overflow-x-auto w-full font-sans">
          <button
            type="button"
            onClick={() => setActiveTab('summary')}
            className={`px-3 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
              activeTab === 'summary' 
                ? 'bg-white text-emerald-800 shadow-xs border-b-2 border-emerald-600' 
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <User className="h-3.5 w-3.5" />
            Summary
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('attendance')}
            className={`px-3 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
              activeTab === 'attendance' 
                ? 'bg-white text-emerald-800 shadow-xs border-b-2 border-emerald-600' 
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <CheckCircle className="h-3.5 w-3.5" />
            Attendance
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('performance')}
            className={`px-3 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
              activeTab === 'performance' 
                ? 'bg-white text-emerald-800 shadow-xs border-b-2 border-emerald-600' 
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <Activity className="h-3.5 w-3.5" />
            Performance
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('vault')}
            className={`px-3 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
              activeTab === 'vault' 
                ? 'bg-white text-emerald-800 shadow-xs border-b-2 border-emerald-600' 
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <FolderLock className="h-3.5 w-3.5" />
            Documents
            {currentEmployeeDocs.length > 0 && (
              <span className="bg-emerald-100 text-emerald-850 text-[9px] px-1 rounded-full font-black">
                {currentEmployeeDocs.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('advance')}
            className={`px-3 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
              activeTab === 'advance' 
                ? 'bg-white text-emerald-800 shadow-xs border-b-2 border-emerald-600' 
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <Coins className="h-3.5 w-3.5" />
            Advances
            {outstandingAdvanceBalance > 0 && (
              <span className="bg-amber-100 text-amber-850 text-[9px] px-1 rounded font-black animate-pulse">
                {formatPKR(outstandingAdvanceBalance)}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('disciplinary')}
            className={`px-3 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
              activeTab === 'disciplinary' 
                ? 'bg-white text-emerald-800 shadow-xs border-b-2 border-emerald-600' 
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <ShieldAlert className="h-3.5 w-3.5" />
            Warnings
            {currentEmployeeWarnings.filter(w => w.status === 'Active').length > 0 && (
              <span className="bg-rose-100 text-rose-800 text-[9px] px-1.5 py-0.5 rounded-full font-black">
                {currentEmployeeWarnings.filter(w => w.status === 'Active').length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('timeline')}
            className={`px-3 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
              activeTab === 'timeline' 
                ? 'bg-white text-emerald-800 shadow-xs border-b-2 border-emerald-600' 
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <TrendingUp className="h-3.5 w-3.5" />
            Timeline
          </button>
        </div>

        {/* Content body layout container */}
        <div className="flex-1 overflow-y-auto p-6 bg-slate-50">
          
          {/* TAB 1: SUMMARY DETAILS WITH STATS & SPECS FORM */}
          {activeTab === 'summary' && (
            <div className="max-w-xl mx-auto">
              
              {/* Roster Summary Overview Stats */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6 font-sans">
                <div className="bg-white border border-slate-200 shadow-xs rounded-xl p-3 text-left">
                  <span className="text-[9px] uppercase font-extrabold text-slate-400 block tracking-wider">Base Salary</span>
                  <span className="text-xs font-black text-slate-700 font-mono mt-0.5 block">{formatPKR(employee.base_salary)}</span>
                </div>
                <div className="bg-white border border-slate-200 shadow-xs rounded-xl p-3 text-left">
                  <span className="text-[9px] uppercase font-extrabold text-slate-400 block tracking-wider">Attendance %</span>
                  <span className="text-xs font-black text-emerald-700 font-mono mt-0.5 block">{monthlyStats.attendancePercentage.toFixed(1)}%</span>
                </div>
                <div className="bg-white border border-slate-200 shadow-xs rounded-xl p-3 text-left">
                  <span className="text-[9px] uppercase font-extrabold text-slate-400 block tracking-wider">Balance Loan</span>
                  <span className="text-xs font-black text-amber-700 font-mono mt-0.5 block">{formatPKR(outstandingAdvanceBalance)}</span>
                </div>
                <div className="bg-white border border-slate-200 shadow-xs rounded-xl p-3 text-left">
                  <span className="text-[9px] uppercase font-extrabold text-slate-400 block tracking-wider">Warnings Log</span>
                  <span className="text-xs font-black text-rose-600 font-mono mt-0.5 block">{currentEmployeeWarnings.length} letters</span>
                </div>
              </div>

              <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                <h4 className="text-xs font-bold text-slate-800 mb-4 pb-2 border-b border-slate-100 uppercase tracking-wider flex items-center gap-2">
                  <FileCheck className="h-4 w-4 text-emerald-600" />
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
          </div>
          )}

          {/* TAB: ATTENDANCE MONTHLY HISTORY LOGS */}
          {activeTab === 'attendance' && (
            <div className="space-y-4 font-sans">
              <div className="flex items-center justify-between bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
                <div>
                  <h4 className="font-extrabold text-slate-800 text-xs uppercase tracking-wide">
                    Monthly Shift Attendance Logs
                  </h4>
                  <p className="text-[10px] text-slate-400 mt-0.5">List of daily attendance and timesheet entries recorded this month</p>
                </div>
                <div className="flex gap-2 text-xs font-mono font-bold font-semibold">
                  <span className="bg-emerald-50 text-emerald-800 border border-emerald-100 px-2.5 py-1 rounded">
                    Presents: {monthlyStats.presents}
                  </span>
                  <span className="bg-rose-50 text-rose-800 border border-rose-100 px-2.5 py-1 rounded">
                    Absents: {monthlyStats.absents}
                  </span>
                </div>
              </div>

              {monthlyStats.records.length === 0 ? (
                <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-xs text-slate-400 font-sans italic">
                  No shift records logged for this employee within the active scope.
                </div>
              ) : (
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse font-sans">
                      <thead>
                        <tr className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200 text-[10px] uppercase tracking-wider">
                          <th className="p-3 font-semibold">Date</th>
                          <th className="p-3 text-center font-semibold">Shift Status</th>
                          <th className="p-3 font-semibold">Check-In</th>
                          <th className="p-3 font-semibold">Check-Out</th>
                          <th className="p-3 font-semibold">Anomalies / Events</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-mono text-[11px] text-slate-700">
                        {monthlyStats.records.sort((a, b) => b.date.localeCompare(a.date)).map(a => (
                          <tr key={a.id} className="hover:bg-slate-50/50">
                            <td className="p-3 font-bold text-slate-700">{a.date}</td>
                            <td className="p-3 text-center">
                              <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                                a.status === 'Present' ? 'bg-emerald-100 text-emerald-800' :
                                a.status === 'Absent' ? 'bg-rose-100 text-rose-800' :
                                a.status === 'Half-Day' ? 'bg-sky-100 text-sky-800' :
                                'bg-slate-150 text-slate-700 bg-slate-100'
                              }`}>
                                {a.status}
                              </span>
                            </td>
                            <td className="p-3 font-semibold text-slate-600">{a.check_in || '--:--'}</td>
                            <td className="p-3 font-semibold text-slate-600">{a.check_out || '--:--'}</td>
                            <td className="p-3 text-slate-500 font-sans text-[10px] leading-relaxed">
                              {a.late_minutes > 0 && <span className="text-amber-700 font-bold block">⏱️ Late Arrival: {a.late_minutes} min</span>}
                              {a.short_hours > 0 && <span className="text-rose-600 font-bold block">📉 Short shift logged</span>}
                              {!a.late_minutes && !a.short_hours && a.status === 'Present' && <span className="text-emerald-600 font-medium block">✓ Standard on-time Shift</span>}
                              {a.status === 'Absent' && <span className="text-red-700 font-bold block">✗ No-show registry</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB: PERFORMANCE SCORE DETAILS */}
          {activeTab === 'performance' && (() => {
            const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
            const formattedLates = (monthlyStats.records || [])
              .filter(l => l.late_minutes > 0 && l.status !== 'Absent' && l.status !== 'Leave' && l.status !== 'Off')
              .map(l => {
                const dObj = new Date(l.date);
                const dayName = days[dObj.getDay()];
                const isFri = dObj.getDay() === 5;
                const limitStr = isFri ? '3:00 PM' : '1:30 PM';
                return {
                  date: l.date,
                  dayName,
                  checkIn: l.check_in || '-',
                  checkout: l.check_out || '-',
                  limit: `Late after ${limitStr}`,
                  lateMins: l.late_minutes,
                  netHours: l.net_hours,
                  status: l.status || 'Present',
                  remarks: l.remarks || ''
                };
              })
              .sort((a, b) => b.date.localeCompare(a.date));

            const formattedAbsents = (monthlyStats.records || [])
              .filter(l => l.status === 'Absent')
              .map(l => {
                const dObj = new Date(l.date);
                const dayName = days[dObj.getDay()];
                return {
                  date: l.date,
                  dayName,
                  status: l.status || 'Absent',
                  remarks: l.remarks || '',
                  penaltyImpact: -10,
                  approvalStatus: l.manual_status !== 'Auto' && l.manual_status !== 'Absent' ? l.manual_status : 'Unapproved'
                };
              })
              .sort((a, b) => b.date.localeCompare(a.date));

            const formattedMissingCheckouts = (monthlyStats.records || [])
              .filter(l => l.status === 'Missing Checkout' || (!l.check_out && l.check_in))
              .map(l => {
                const dObj = new Date(l.date);
                const dayName = days[dObj.getDay()];
                return {
                  date: l.date,
                  dayName,
                  checkIn: l.check_in || '-',
                  checkout: 'Missing',
                  status: l.status || 'Missing Checkout',
                  remarks: l.remarks || '',
                  adminReviewStatus: l.manual_status !== 'Auto' && l.manual_status !== 'Missing Checkout' ? l.manual_status : 'Pending Review'
                };
              })
              .sort((a, b) => b.date.localeCompare(a.date));

            const formattedShortHours = (monthlyStats.records || [])
              .filter(l => {
                const sHrs = l.short_hours !== undefined ? l.short_hours : 0;
                return sHrs > 0 && l.status !== 'Absent' && l.status !== 'Leave' && l.status !== 'Off';
              })
              .map(l => {
                const dObj = new Date(l.date);
                const dayName = days[dObj.getDay()];
                const isFri = dObj.getDay() === 5;
                const requiredHours = isFri ? 7.0 : 10.0;
                return {
                  date: l.date,
                  dayName,
                  checkIn: l.check_in || '-',
                  checkout: l.check_out || '-',
                  workedHours: l.net_hours,
                  requiredHours,
                  shortHours: l.short_hours || 0,
                  approvalStatus: l.manual_status !== 'Auto' ? l.manual_status : 'Pending Review',
                  remarks: l.remarks || ''
                };
              })
              .sort((a, b) => b.date.localeCompare(a.date));

            const b = monthlyStats.breakdown || {
              baseScore: 100,
              lateCount: 0,
              latePenalty: 0,
              shortCount: 0,
              shortHoursPenalty: 0,
              absentCount: 0,
              absentPenalty: 0,
              missingCheckoutCount: 0,
              missingCheckoutPenalty: 0,
              sundayWorkedCount: 0,
              sundayWorkedBonus: 0,
              perfectBonus: 0,
              excellentBonus: 0,
              finalScore: monthlyStats.score || 100,
              grade: 'Average',
              description: ''
            };

            const netImpact = (b.absentPenalty || 0) + 
                              (b.latePenalty || 0) + 
                              (b.missingCheckoutPenalty || 0) + 
                              (b.shortHoursPenalty || 0) + 
                              (b.sundayWorkedBonus || 0) + 
                              (b.perfectBonus || 0) + 
                              (b.excellentBonus || 0);

            const isLateMismatch = (b.lateCount || 0) !== formattedLates.length;
            const isAbsentMismatch = (b.absentCount || 0) !== formattedAbsents.length;
            const isMissingCheckoutMismatch = (b.missingCheckoutCount || 0) !== formattedMissingCheckouts.length;
            const isShortHoursMismatch = (b.shortCount || 0) !== formattedShortHours.length;
            const hasValidationMismatch = isLateMismatch || isAbsentMismatch || isMissingCheckoutMismatch || isShortHoursMismatch;

            return (
              <div className="space-y-6 font-sans">
                <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shadow-xs">
                  <div>
                    <h4 className="font-extrabold text-slate-800 text-xs uppercase tracking-wide">
                      Performance Review Profile (Month Scope)
                    </h4>
                    <p className="text-[10px] text-slate-400 mt-0.5">Automated rating index & policy eligibility metrics</p>
                  </div>
                  <div className="bg-slate-900 text-white font-mono px-4 py-2 rounded-xl flex items-baseline gap-1">
                    <span className="text-2xl font-black">{monthlyStats.score}</span>
                    <span className="text-[10px] text-slate-400">/ 100</span>
                  </div>
                </div>

                {hasValidationMismatch && (
                  <div id="integrity-warning-modal" className="bg-amber-50 border-l-4 border-amber-500 p-4 rounded-r-xl shadow-[0_1px_3px_rgba(0,0,0,0.05)] text-amber-850 font-sans text-xs">
                    <div className="flex gap-2 items-center">
                      <AlertCircle className="h-5 w-5 text-amber-650 shrink-0" />
                      <div>
                        <h6 className="font-extrabold uppercase tracking-wide text-amber-950">Performance Report Integrity Warning</h6>
                        <p className="text-amber-800 mt-0.5 font-semibold">
                          Summary counts do not match detailed records.
                        </p>
                        <div className="text-[10px] text-amber-700 font-mono mt-1 grid grid-cols-2 md:grid-cols-4 gap-2 border-t border-amber-200/50 pt-1.5">
                          <span>Late Days: Summary {b.lateCount} vs Section {formattedLates.length}</span>
                          <span>Absent Days: Summary {b.absentCount} vs Section {formattedAbsents.length}</span>
                          <span>Missing Checkouts: Summary {b.missingCheckoutCount} vs Section {formattedMissingCheckouts.length}</span>
                          <span>Short Hours: Summary {b.shortCount} vs Section {formattedShortHours.length}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Performance Impact Summary Section */}
                <div id="performance-impact-summary-modal" className="bg-slate-50 border border-slate-200 rounded-xl p-5 space-y-4 font-sans">
                  <div className="flex justify-between items-center border-b pb-2 border-slate-200">
                    <h5 className="font-extrabold text-slate-800 text-xs uppercase tracking-wider flex items-center gap-1.5">
                      <Award className="h-4.5 w-4.5 text-indigo-600" />
                      Performance Impact Summary
                    </h5>
                    <span className="text-[9px] font-bold text-indigo-750 bg-indigo-50 border border-indigo-150 rounded px-2 py-0.5 uppercase">Audit Verification</span>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-slate-600">
                    <div className="space-y-3">
                      {/* Absent Penalty */}
                      <div className="flex justify-between items-center border-b border-slate-100 pb-1.5">
                        <div>
                          <span className="font-bold text-slate-700 block">Absent Penalty</span>
                          <span className="text-[10px] text-slate-400">Absent Days: {b.absentCount}</span>
                        </div>
                        <span className={`font-mono font-extrabold ${b.absentPenalty < 0 ? 'text-rose-600' : 'text-slate-400'}`}>
                          {b.absentPenalty < 0 ? `${b.absentPenalty}` : '0'}
                        </span>
                      </div>

                      {/* Late Penalty */}
                      <div className="flex justify-between items-center border-b border-slate-100 pb-1.5">
                        <div>
                          <span className="font-bold text-slate-700 block">Late Penalty</span>
                          <span className="text-[10px] text-slate-400">Late Days: {b.lateCount}</span>
                        </div>
                        <span className={`font-mono font-extrabold ${b.latePenalty < 0 ? 'text-rose-600' : 'text-slate-400'}`}>
                          {b.latePenalty < 0 ? `${b.latePenalty}` : '0'}
                        </span>
                      </div>

                      {/* Missing Checkout Penalty */}
                      <div className="flex justify-between items-center border-b border-slate-100 pb-1.5">
                        <div>
                          <span className="font-bold text-slate-700 block">Missing Checkout Penalty</span>
                          <span className="text-[10px] text-slate-400">Missing Checkout: {b.missingCheckoutCount}</span>
                        </div>
                        <span className={`font-mono font-extrabold ${b.missingCheckoutPenalty < 0 ? 'text-rose-600' : 'text-slate-400'}`}>
                          {b.missingCheckoutPenalty < 0 ? `${b.missingCheckoutPenalty}` : '0'}
                        </span>
                      </div>

                      {/* Short Hours Penalty */}
                      <div className="flex justify-between items-center border-b border-slate-100 pb-1.5">
                        <div>
                          <span className="font-bold text-slate-700 block">Short Hours Penalty</span>
                          <span className="text-[10px] text-slate-400">Short Hours Days: {b.shortCount}</span>
                        </div>
                        <span className={`font-mono font-extrabold ${b.shortHoursPenalty < 0 ? 'text-rose-600' : 'text-slate-400'}`}>
                          {b.shortHoursPenalty < 0 ? `${b.shortHoursPenalty}` : '0'}
                        </span>
                      </div>
                    </div>

                    <div className="space-y-3">
                      {/* Sunday Worked Bonus */}
                      <div className="flex justify-between items-center border-b border-slate-100 pb-1.5">
                        <div>
                          <span className="font-bold text-emerald-700 block">Sunday Worked Bonus</span>
                          <span className="text-[10px] text-slate-400">Sunday Worked: {b.sundayWorkedCount}</span>
                        </div>
                        <span className={`font-mono font-extrabold ${b.sundayWorkedBonus > 0 ? 'text-emerald-600' : 'text-slate-400'}`}>
                          {b.sundayWorkedBonus > 0 ? `+${b.sundayWorkedBonus}` : '0'}
                        </span>
                      </div>

                      {/* Perfect Attendance Bonus */}
                      <div className="flex justify-between items-center border-b border-slate-100 pb-1.5">
                        <div>
                          <span className="font-bold text-emerald-700 block">Perfect Attendance Bonus</span>
                          <span className="text-[10px] text-slate-400">Full Month Pristine</span>
                        </div>
                        <span className={`font-mono font-extrabold ${b.perfectBonus > 0 ? 'text-emerald-600' : 'text-slate-400'}`}>
                          {b.perfectBonus > 0 ? `+${b.perfectBonus}` : '0'}
                        </span>
                      </div>

                      {/* Excellent Attendance Bonus */}
                      <div className="flex justify-between items-center border-b border-slate-100 pb-1.5">
                        <div>
                          <span className="font-bold text-emerald-600 block">Excellent Attendance Bonus</span>
                          <span className="text-[10px] text-slate-400">Max 2 Lates Only</span>
                        </div>
                        <span className={`font-mono font-extrabold ${b.excellentBonus > 0 ? 'text-emerald-600' : 'text-slate-400'}`}>
                          {b.excellentBonus > 0 ? `+${b.excellentBonus}` : '0'}
                        </span>
                      </div>

                      {/* Net Impact */}
                      <div className="pt-2 flex justify-between items-center">
                        <span className="font-extrabold text-slate-800 uppercase text-[10px]">Final Net Impact</span>
                        <span className={`font-mono font-extrabold text-xs ${netImpact < 0 ? 'text-rose-600 font-black' : netImpact > 0 ? 'text-emerald-600 font-extrabold' : 'text-slate-500'}`}>
                          {netImpact > 0 ? `+${netImpact}` : netImpact}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Score Breakdown details */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {/* Employee Explanation View Card */}
                  <div id="employee-explanation-modal" className="bg-white border-2 border-slate-200 rounded-xl p-5 shadow-xs space-y-4 font-sans">
                    <div className="border-b pb-2.5 border-slate-250">
                      <h5 className="font-extrabold text-slate-905 text-slate-900 text-xs tracking-tight flex items-center gap-1.5 uppercase">
                        🏆 Why is my score {b.finalScore}?
                      </h5>
                      <span className="text-[9px] text-slate-400 mt-0.5 block">Audit log breakdown formula verification</span>
                    </div>
                    
                    <div className="space-y-3 text-xs text-slate-700">
                      <div className="flex justify-between items-center border-b border-dashed border-slate-100 pb-1.5">
                        <span className="font-medium text-slate-600">Perfect Rating Benchmark</span>
                        <span className="font-mono font-bold text-slate-800">100 pts</span>
                      </div>

                      {b.absentCount > 0 && (
                        <div className="flex justify-between items-center border-b border-dashed border-slate-100 pb-1.5 text-rose-650">
                          <div>
                            <span className="font-bold">Absent Deductions</span>
                            <span className="block text-[9px] text-slate-405 font-sans italic">{b.absentCount} day{b.absentCount > 1 ? 's' : ''} × -10</span>
                          </div>
                          <span className="font-mono font-extrabold">{b.absentPenalty} pts</span>
                        </div>
                      )}

                      {b.lateCount > 0 && (
                        <div className="flex justify-between items-center border-b border-dashed border-slate-100 pb-1.5 text-amber-700">
                          <div>
                            <span className="font-bold">Late Arrival Penalties</span>
                            <span className="block text-[9px] text-slate-405 font-sans italic">{b.lateCount} shift{b.lateCount > 1 ? 's' : ''} × -2</span>
                          </div>
                          <span className="font-mono font-extrabold">{b.latePenalty} pts</span>
                        </div>
                      )}

                      {b.missingCheckoutCount > 0 && (
                        <div className="flex justify-between items-center border-b border-dashed border-slate-100 pb-1.5 text-rose-650">
                          <div>
                            <span className="font-bold">Missing Check-outs Penalties</span>
                            <span className="block text-[9px] text-slate-405 font-sans italic">{b.missingCheckoutCount} date{b.missingCheckoutCount > 1 ? 's' : ''} × -5</span>
                          </div>
                          <span className="font-mono font-extrabold">{b.missingCheckoutPenalty} pts</span>
                        </div>
                      )}

                      {b.shortCount > 0 && (
                        <div className="flex justify-between items-center border-b border-dashed border-slate-100 pb-1.5 text-orange-705 text-orange-700">
                          <div>
                            <span className="font-bold">Short Working Hours Penalties</span>
                            <span className="block text-[9px] text-slate-405 font-sans italic">{b.shortCount} shift{b.shortCount > 1 ? 's' : ''} × -1</span>
                          </div>
                          <span className="font-mono font-extrabold">{b.shortHoursPenalty} pts</span>
                        </div>
                      )}

                      {b.sundayWorkedCount > 0 && (
                        <div className="flex justify-between items-center border-b border-dashed border-slate-100 pb-1.5 text-emerald-700">
                          <div>
                            <span className="font-bold">Sunday Duty Incentives</span>
                            <span className="block text-[9px] text-slate-405 font-sans italic">{b.sundayWorkedCount} Sunday{b.sundayWorkedCount > 1 ? 's' : ''} (max +8)</span>
                          </div>
                          <span className="font-mono font-extrabold">+{b.sundayWorkedBonus} pts</span>
                        </div>
                      )}

                      {b.perfectBonus > 0 && (
                        <div className="flex justify-between items-center border-b border-dashed border-slate-100 pb-1.5 text-emerald-750 font-bold">
                          <div>
                            <span>Perfect Month Attendance</span>
                            <span className="block text-[9px] text-slate-405 font-sans font-normal italic">Pristine work roster bonus</span>
                          </div>
                          <span className="font-mono font-black">+{b.perfectBonus} pts</span>
                        </div>
                      )}

                      {b.excellentBonus > 0 && (
                        <div className="flex justify-between items-center border-b border-dashed border-slate-100 pb-1.5 text-emerald-700">
                          <div>
                            <span>Excellent Month Attendance</span>
                            <span className="block text-[9px] text-slate-450 font-sans font-normal italic">Minimal tardiness recorded</span>
                          </div>
                          <span className="font-mono font-extrabold">+{b.excellentBonus} pts</span>
                        </div>
                      )}

                      <div className="pt-1 flex justify-between items-center text-slate-950 font-bold">
                        <span className="font-extrabold uppercase tracking-wide text-[9px] text-slate-500">Audit Equation:</span>
                        <span className="font-mono text-xs text-indigo-800 bg-indigo-50 px-2 py-0.5 rounded">
                          100
                          {b.absentPenalty < 0 ? ` - ${Math.abs(b.absentPenalty)}` : ''}
                          {b.latePenalty < 0 ? ` - ${Math.abs(b.latePenalty)}` : ''}
                          {b.missingCheckoutPenalty < 0 ? ` - ${Math.abs(b.missingCheckoutPenalty)}` : ''}
                          {b.shortHoursPenalty < 0 ? ` - ${Math.abs(b.shortHoursPenalty)}` : ''}
                          {b.sundayWorkedBonus > 0 ? ` + ${b.sundayWorkedBonus}` : ''}
                          {b.perfectBonus > 0 ? ` + 5` : ''}
                          {b.excellentBonus > 0 ? ` + 2` : ''}
                          {' = '}
                          <span className="font-black text-xs text-indigo-900 font-mono tracking-tight">{b.finalScore} pts</span>
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs flex flex-col justify-between">
                    <div>
                      <h5 className="font-bold text-slate-800 text-xs uppercase tracking-wider mb-2.5 border-b pb-2">
                        Incentive Action Recommendation
                      </h5>
                      <div className="mt-3">
                        <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-black border uppercase tracking-wider ${monthlyStats.recommendation.color}`}>
                          💡 {monthlyStats.recommendation.recommendation}
                        </span>
                        <p className="text-slate-500 text-[10px] leading-relaxed mt-2.5 font-medium">
                          {monthlyStats.recommendation.description}
                        </p>
                      </div>
                    </div>
                    <div className="text-[9px] text-slate-400 mt-4 leading-normal font-sans pt-2 border-t border-slate-100">
                      Calculated automatically from actual logs based on company ruleset definition. Change reviews requests super-admin overrides.
                    </div>
                  </div>
                </div>

                {/* 1. Late Arrival Logs Table */}
                <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-3">
                  <div className="flex items-center gap-1.5 border-b pb-2">
                    <Clock className="h-4.5 w-4.5 text-amber-500 animate-pulse" />
                    <h5 className="font-bold text-xs uppercase tracking-wider text-slate-850">
                      Late Arrival Logs ({formattedLates.length} items)
                    </h5>
                  </div>
                  {formattedLates.length === 0 ? (
                    <p className="text-xs text-slate-400 italic">Zero late arrival logs recorded this month.</p>
                  ) : (
                    <div className="border border-slate-100 rounded-lg overflow-hidden">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="bg-slate-50 font-bold text-slate-500 border-b border-slate-200 text-[10px] uppercase tracking-wider">
                            <th className="p-2.5">Date</th>
                            <th className="p-2.5">Day</th>
                            <th className="p-2.5">Check-In Time</th>
                            <th className="p-2.5">Late minutes</th>
                            <th className="p-2.5">Check-Out</th>
                            <th className="p-2.5">Net Hours</th>
                            <th className="p-2.5">Status</th>
                            <th className="p-2.5">Remarks</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-slate-700 font-mono text-[11px]">
                          {formattedLates.map(l => (
                            <tr key={l.date} className="hover:bg-slate-50/50">
                              <td className="p-2.5 font-bold">{l.date}</td>
                              <td className="p-2.5 font-sans">{l.dayName}</td>
                              <td className="p-2.5">{l.checkIn}</td>
                              <td className="p-2.5 font-bold text-amber-600 bg-amber-50/30">{l.lateMins} mins</td>
                              <td className="p-2.5">{l.checkout}</td>
                              <td className="p-2.5 font-bold">{l.netHours} hrs</td>
                              <td className="p-2.5 font-sans">
                                <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                                  l.status.startsWith('Approved') || l.status.includes('Official') || l.status.includes('Emergency')
                                    ? 'bg-sky-50 text-sky-700 border border-sky-100'
                                    : 'bg-amber-50 text-amber-700 border border-amber-100'
                                }`}>
                                  {l.status}
                                </span>
                              </td>
                              <td className="p-2.5 font-sans italic text-slate-500 text-[10px]">{l.remarks || '-'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* 2. Absent Days Table */}
                <div className="bg-rose-50/50 border border-rose-200 rounded-xl p-5 shadow-xs space-y-3">
                  <div className="flex items-center gap-1.5 border-b border-rose-200 pb-2">
                    <AlertCircle className="h-4.5 w-4.5 text-rose-600" />
                    <h5 className="font-bold text-xs uppercase tracking-wider text-rose-800">
                      Absent Days ({formattedAbsents.length} items)
                    </h5>
                  </div>
                  {formattedAbsents.length === 0 ? (
                    <p className="text-xs text-rose-600/60 italic">Zero absent days recorded this month.</p>
                  ) : (
                    <div className="border border-rose-100 rounded-lg overflow-hidden bg-white">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="bg-rose-50/50 font-bold text-rose-700 border-b border-rose-100 text-[10px] uppercase tracking-wider">
                            <th className="p-2.5">Date</th>
                            <th className="p-2.5">Day</th>
                            <th className="p-2.5 text-center">Status</th>
                            <th className="p-2.5 text-center text-rose-700 font-bold">Penalty Impact</th>
                            <th className="p-2.5 text-center">Approval Status</th>
                            <th className="p-2.5">Reason / Remarks</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-rose-50 text-rose-800 font-mono text-[11px]">
                          {formattedAbsents.map(a => (
                            <tr key={a.date} className="hover:bg-rose-50/20">
                              <td className="p-2.5 font-bold">{a.date}</td>
                              <td className="p-2.5 font-sans">{a.dayName}</td>
                              <td className="p-2.5 text-center font-bold text-rose-600">Absent</td>
                              <td className="p-2.5 text-center font-bold text-rose-700 bg-rose-50/50">{a.penaltyImpact} pts</td>
                              <td className="p-2.5 text-center font-sans">
                                <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                                  a.approvalStatus === 'Unapproved' ? 'bg-rose-50 text-rose-700 border border-rose-100' : 'bg-sky-50 text-sky-700 border border-sky-100 font-bold'
                                }`}>
                                  {a.approvalStatus === 'Unapproved' ? 'Unapproved Absent' : a.approvalStatus}
                                </span>
                              </td>
                              <td className="p-2.5 font-sans italic text-rose-800/80 text-[10px]">{a.remarks || '-'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* 3. Missing Checkout Days Table */}
                <div className="bg-amber-50/50 border border-amber-200 rounded-xl p-5 shadow-xs space-y-3">
                  <div className="flex items-center gap-1.5 border-b border-amber-200 pb-2">
                    <AlertTriangle className="h-4.5 w-4.5 text-amber-600" />
                    <h5 className="font-bold text-xs uppercase tracking-wider text-amber-805 font-extrabold">
                      Missing Checkout Days ({formattedMissingCheckouts.length} items)
                    </h5>
                  </div>
                  {formattedMissingCheckouts.length === 0 ? (
                    <p className="text-xs text-amber-600/60 italic">Zero missing checkout days recorded this month.</p>
                  ) : (
                    <div className="border border-amber-100 rounded-lg overflow-hidden bg-white">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="bg-amber-50/50 font-bold text-amber-700 border-b border-amber-100 text-[10px] uppercase tracking-wider">
                            <th className="p-2.5">Date</th>
                            <th className="p-2.5">Day</th>
                            <th className="p-2.5">Check-In</th>
                            <th className="p-2.5">Check-Out</th>
                            <th className="p-2.5 text-center">Status</th>
                            <th className="p-2.5 text-center">Admin Review Status</th>
                            <th className="p-2.5">Remarks</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-amber-50 text-amber-800 font-mono text-[11px]">
                          {formattedMissingCheckouts.map(m => (
                            <tr key={m.date} className="hover:bg-amber-50/20">
                              <td className="p-2.5 font-bold">{m.date}</td>
                              <td className="p-2.5 font-sans">{m.dayName}</td>
                              <td className="p-2.5">{m.checkIn}</td>
                              <td className="p-2.5 font-black text-rose-600">Missing</td>
                              <td className="p-2.5 text-center font-sans">
                                <span className="bg-rose-50 text-rose-700 border border-rose-100 px-1.5 py-0.5 rounded text-[9px] font-bold">
                                  {m.status}
                                </span>
                              </td>
                              <td className="p-2.5 text-center font-sans">
                                <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                                  m.adminReviewStatus === 'Pending Review' ? 'bg-amber-50 text-amber-700 border border-amber-150' : 'bg-sky-50 text-sky-700 border border-sky-100 font-bold'
                                }`}>
                                  {m.adminReviewStatus}
                                </span>
                              </td>
                              <td className="p-2.5 font-sans italic text-amber-805/85 text-[10px]">{m.remarks || '-'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* 4. Short Hours Days Table */}
                <div className="bg-orange-50/50 border border-orange-200 rounded-xl p-5 shadow-xs space-y-3">
                  <div className="flex items-center gap-1.5 border-b border-orange-200 pb-2">
                    <Clock className="h-4.5 w-4.5 text-orange-600" />
                    <h5 className="font-bold text-xs uppercase tracking-wider text-slate-850">
                      Short Hours Days ({formattedShortHours.length} items)
                    </h5>
                  </div>
                  {formattedShortHours.length === 0 ? (
                    <p className="text-xs text-orange-600/60 italic">Zero short hours shifts recorded this month.</p>
                  ) : (
                    <div className="border border-orange-100 rounded-lg overflow-hidden bg-white">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="bg-orange-50/50 font-bold text-orange-700 border-b border-orange-100 text-[10px] uppercase tracking-wider">
                            <th className="p-2.5">Date</th>
                            <th className="p-2.5">Day</th>
                            <th className="p-2.5">Check-In</th>
                            <th className="p-2.5">Check-Out</th>
                            <th className="p-2.5">Worked Hours</th>
                            <th className="p-2.5">Required Hours</th>
                            <th className="p-2.5 text-orange-600 font-bold">Short Hours</th>
                            <th className="p-2.5 text-center font-semibold">Approval Status</th>
                            <th className="p-2.5">Remarks</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-orange-50 text-orange-800 font-mono text-[11px]">
                          {formattedShortHours.map(s => (
                            <tr key={s.date} className="hover:bg-orange-50/10">
                              <td className="p-2.5 font-bold">{s.date}</td>
                              <td className="p-2.5 font-sans">{s.dayName}</td>
                              <td className="p-2.5">{s.checkIn}</td>
                              <td className="p-2.5">{s.checkout}</td>
                              <td className="p-2.5">{s.workedHours} hrs</td>
                              <td className="p-2.5">{s.requiredHours} hrs</td>
                              <td className="p-2.5 font-bold text-orange-600 bg-orange-50/50">{s.shortHours} hrs</td>
                              <td className="p-2.5 text-center font-sans">
                                <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                                  s.approvalStatus === 'Pending Review' ? 'bg-orange-50 text-orange-700 border border-orange-150' : 'bg-sky-50 text-sky-700 border border-sky-100 font-bold'
                                }`}>
                                  {s.approvalStatus}
                                </span>
                              </td>
                              <td className="p-2.5 font-sans italic text-orange-800/80 text-[10px]">{s.remarks || '-'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

              </div>
            );
          })()}

          {/* TAB: CHRONOLOGICAL ACTIONS TIMELINE */}
          {activeTab === 'timeline' && (
            <div className="space-y-4 font-sans">
              <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
                <h4 className="font-extrabold text-slate-800 text-xs uppercase tracking-wide">
                  Chronological unified Worker Timeline Feed
                </h4>
                <p className="text-[10px] text-slate-400 mt-0.5">Audit log of shift logs, loans, warning letters, and secure vault deposits</p>
              </div>

              {chronologicalTimeline.length === 0 ? (
                <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-xs text-slate-400 font-sans italic">
                  Clean feed. No transactions, warnings, files or custom events registered.
                </div>
              ) : (
                <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4 shadow-xs">
                  <div className="relative border-l-2 border-slate-100 pl-4 space-y-5">
                    {chronologicalTimeline.slice(0, 30).map((evt, idx) => (
                      <div key={idx} className="relative text-xs">
                        <div className={`absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full border border-white ${evt.color}`} />
                        <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono">
                          <span>{evt.date}</span>
                          <span className="uppercase text-[8px] font-bold tracking-tight bg-slate-100 px-1 py-0.5 rounded border border-slate-200 text-slate-500">{evt.type}</span>
                        </div>
                        <h5 className="font-extrabold text-slate-800 mt-0.5 text-[11px]">{evt.title}</h5>
                        <p className="text-slate-500 font-sans text-[10px] mt-0.5 leading-relaxed">{evt.desc}</p>
                      </div>
                    ))}
                  </div>
                  {chronologicalTimeline.length > 30 && (
                    <p className="text-[9px] text-slate-400 italic text-center pt-2 border-t border-slate-100">Showing last 30 log events sequentially.</p>
                  )}
                </div>
              )}
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
