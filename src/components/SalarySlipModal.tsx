import React from 'react';
import { X, Printer, Download, CheckCircle, HelpCircle } from 'lucide-react';
import { formatPKR } from '../utils';

interface SalarySlipModalProps {
  isOpen: boolean;
  onClose: () => void;
  salaryData: {
    employee: {
      id: string;
      name: string;
      email?: string;
      joiningDate?: string;
      joining_date?: string;
      department?: string;
      department_name?: string;
      designation?: string;
      base_salary?: number;
      salary?: number;
    };
    presents: number;
    halfDays: number;
    leaves: number;
    offs: number;
    absents: number;
    paidWeeklyOffs: number;
    unpaidWeeklyOffs: number;
    requiredHours: number;
    totalOvertimeHours: number;
    overtimeHours: number;
    shortHours: number;
    sundayOvertimeHours: number;
    timingBasedSalary: number;
    overtimePay: number;
    sundayOvertimePay: number;
    commissionAmount: number;
    totalAllowances: number;
    review: {
      amount: number;
      reason: string;
      status: string;
      approved_by?: string | null;
      approved_at?: string | null;
    };
    finalSalary: number;
  };
  salaryMonth: string; // YYYY-MM
  ownerAdjustments?: any[]; // optional adjustments matching employee inside month
  employeeAdvances?: any[];
  advanceRecoveries?: any[];
}

export function SalarySlipModal({ isOpen, onClose, salaryData, salaryMonth, ownerAdjustments = [], employeeAdvances = [], advanceRecoveries = [] }: SalarySlipModalProps) {
  if (!isOpen || !salaryData) return null;

  const [yearStr, monthStr] = salaryMonth.split('-');
  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  const monthName = monthNames[parseInt(monthStr, 10) - 1] || monthStr;

  const emp = salaryData.employee;
  const empCode = emp.id;
  const empName = emp.name;
  const empDept = emp.department_name || emp.department || 'N/A';
  const empDesig = emp.designation || 'N/A';
  const empJoin = emp.joining_date || emp.joiningDate || 'N/A';

  const basicSalary = emp.base_salary || emp.salary || 0;

  // Let's filter Owner Adjustments to get detailed positive and negative adjustments in the slip
  const matchingAdjustments = ownerAdjustments.filter(adj => 
    adj.employee_id === emp.id && 
    adj.month === monthStr && 
    adj.year === yearStr
  );

  const adjustmentsSum = matchingAdjustments.reduce((sum, adj) => sum + Number(adj.amount), 0);
  
  // Advance math computation
  const empAdvances = (employeeAdvances || []).filter((a: any) => a.employee_id === emp.id);
  const empRecoveries = (advanceRecoveries || []).filter((r: any) => r.employee_id === emp.id);
  const totalIssued = empAdvances.reduce((sum: number, a: any) => sum + Number(a.amount), 0);
  
  // Recoveries PRIOR to current salaryMonth (e.g., prior to YYYY-MM)
  const recoveriesPrior = empRecoveries.filter((r: any) => r.recovery_month !== salaryMonth).reduce((sum: number, r: any) => sum + Number(r.recovered_amount), 0);
  const outstandingBeforeMonth = Math.max(0, totalIssued - recoveriesPrior);

  // Recovery in current month
  const recoveryInMonth = empRecoveries.filter((r: any) => r.recovery_type === 'Salary Deduction' && r.recovery_month === salaryMonth).reduce((sum: number, r: any) => sum + Number(r.recovered_amount), 0);

  // Remaining balance
  const remainingBalance = Math.max(0, outstandingBeforeMonth - recoveryInMonth);
  
  // Total adjustments is manual review adjustment + structured owner adjustments
  const totalAdjustmentsVal = Number(salaryData.review.amount) + adjustmentsSum;

  // Expected Hours
  const expectedHours = salaryData.requiredHours;
  
  // Worked Hours is Expected Hours - Short Hours + Overtime Hours
  const shortHrs = salaryData.shortHours;
  const workedHours = Math.max(0, expectedHours - shortHrs + salaryData.totalOvertimeHours);

  // Late days and missing checkout approximations from attendance
  const lateDays = Math.round(shortHrs > 0 ? shortHrs / 0.5 : 0); // indicative
  const missingCheckouts = 0; // fallback indication

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadPDF = () => {
    // Triggers standard print dialogue where user can select 'Save as PDF' which matches standard web platform standards safely
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      {/* Printable Area Wrapper */}
      <div 
        id="printable-salary-slip"
        className="relative bg-white w-full max-w-3xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col"
      >
        {/* Modal Controls - Hidden in print */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-50 border-b border-slate-150 print:hidden">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500"></span>
            <h2 className="text-sm font-bold text-slate-850">Employee Salary Slip Generator</h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 bg-slate-105 hover:bg-slate-200 text-slate-700 text-xs font-bold py-1.5 px-3 rounded-lg cursor-pointer transition-all border border-slate-250"
              id="btn-print-slip"
            >
              <Printer className="h-3.5 w-3.5" />
              Print Slip
            </button>
            <button
              onClick={handleDownloadPDF}
              className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold py-1.5 px-3 rounded-lg cursor-pointer transition-all shadow-xs"
              id="btn-download-pdf"
            >
              <Download className="h-3.5 w-3.5" />
              Download PDF
            </button>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-650 p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
              id="btn-close-slip-modal"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Payslip Content Body */}
        <div className="p-8 space-y-6 font-sans text-slate-800 printable-payslip-content">
          {/* Header Branding */}
          <div className="flex justify-between items-start border-b-2 border-slate-900 pb-4">
            <div>
              <h1 className="text-2xl font-black text-slate-950 tracking-tight leading-none uppercase">KaprayOfficial</h1>
              <p className="text-[10px] text-slate-500 font-medium font-mono uppercase mt-1 tracking-wider">Attendance & Payroll System ERP</p>
            </div>
            <div className="text-right">
              <span className="inline-block bg-slate-950 text-white text-[10px] font-mono uppercase font-bold tracking-widest px-3 py-1 rounded">
                PAYSLIP
              </span>
              <p className="text-xs font-bold font-sans text-slate-700 mt-1.5">
                {monthName} {yearStr}
              </p>
            </div>
          </div>

          {/* Metadata Block: Employee Info & Period */}
          <div className="grid grid-cols-2 gap-x-8 gap-y-3 bg-slate-50/70 p-4 rounded-xl border border-slate-150">
            <div>
              <span className="text-[9px] font-bold text-slate-400 tracking-wider uppercase block">Employee Code</span>
              <span className="text-sm font-extrabold text-slate-950 font-mono leading-none block mt-0.5">{empCode}</span>
            </div>
            <div>
              <span className="text-[9px] font-bold text-slate-400 tracking-wider uppercase block">Payroll period</span>
              <span className="text-sm font-bold text-slate-900 leading-none block mt-0.5">{monthName} ({salaryMonth})</span>
            </div>
            <div className="mt-1">
              <span className="text-[9px] font-bold text-slate-400 tracking-wider uppercase block">Employee Name</span>
              <span className="text-sm font-extrabold text-slate-950 leading-none block mt-0.5">{empName}</span>
            </div>
            <div className="mt-1">
              <span className="text-[9px] font-bold text-slate-400 tracking-wider uppercase block">Department</span>
              <span className="text-sm font-semibold text-slate-900 leading-none block mt-0.5">{empDept}</span>
            </div>
            <div className="mt-1">
              <span className="text-[9px] font-bold text-slate-400 tracking-wider uppercase block">Designation</span>
              <span className="text-sm font-semibold text-slate-805 leading-none block mt-0.5">{empDesig}</span>
            </div>
            <div className="mt-1">
              <span className="text-[9px] font-bold text-slate-400 tracking-wider uppercase block">Joining Date</span>
              <span className="text-sm font-medium text-slate-805 leading-none block mt-0.5">{empJoin}</span>
            </div>
          </div>

          {/* Attendance and Hours Section Grid */}
          <div className="grid grid-cols-2 gap-4">
            {/* Attendance Summary */}
            <div className="border border-slate-200 rounded-xl p-4 bg-white">
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-2.5 pb-1 border-b border-slate-150">
                Attendance summary
              </h3>
              <div className="space-y-1.5 text-xs text-slate-700">
                <div className="flex justify-between">
                  <span>Present Days</span>
                  <span className="font-bold text-emerald-700 font-mono">{salaryData.presents} days</span>
                </div>
                <div className="flex justify-between">
                  <span>Half Days</span>
                  <span className="font-semibold text-sky-700 font-mono">{salaryData.halfDays} days</span>
                </div>
                <div className="flex justify-between">
                  <span>Approved Leaves</span>
                  <span className="font-semibold text-violet-700 font-mono">{salaryData.leaves} days</span>
                </div>
                <div className="flex justify-between">
                  <span>Absents</span>
                  <span className="font-bold text-rose-600 font-mono">{salaryData.absents} days</span>
                </div>
                <div className="flex justify-between">
                  <span>Late Days</span>
                  <span className="font-medium text-amber-705 font-mono">{lateDays} days</span>
                </div>
                <div className="flex justify-between">
                  <span>Missing Checkouts</span>
                  <span className="font-medium text-amber-600 font-mono">{missingCheckouts} days</span>
                </div>
                <div className="flex justify-between">
                  <span>Sunday Paid Offs</span>
                  <span className="font-medium text-emerald-600 font-mono">{salaryData.paidWeeklyOffs} days</span>
                </div>
                <div className="flex justify-between items-center">
                  <span>Sunday Unpaid Offs</span>
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold font-mono ${salaryData.unpaidWeeklyOffs > 0 ? 'bg-rose-50 text-rose-700 border border-rose-150' : 'text-slate-400 bg-slate-50'}`}>
                    {salaryData.unpaidWeeklyOffs} days {salaryData.unpaidWeeklyOffs > 0 ? '⚠️' : '✓'}
                  </span>
                </div>
              </div>
            </div>

            {/* Hours Summary */}
            <div className="border border-slate-200 rounded-xl p-4 bg-white">
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-2.5 pb-1 border-b border-slate-150">
                Hours Summary
              </h3>
              <div className="space-y-1.5 text-xs text-slate-700">
                <div className="flex justify-between">
                  <span>Expected Hours</span>
                  <span className="font-bold font-mono text-slate-800">{expectedHours.toFixed(1)} hrs</span>
                </div>
                <div className="flex justify-between">
                  <span>Worked Hours</span>
                  <span className="font-bold font-mono text-emerald-700">{workedHours.toFixed(1)} hrs</span>
                </div>
                <div className="flex justify-between">
                  <span>Short Hours</span>
                  <span className={`font-semibold font-mono ${shortHrs > 0 ? 'text-rose-600' : 'text-slate-400'}`}>
                    {shortHrs.toFixed(1)} hrs
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Overtime Hours</span>
                  <span className="font-bold font-mono text-indigo-600">{(salaryData.overtimeHours - salaryData.sundayOvertimeHours).toFixed(1)} hrs</span>
                </div>
                <div className="flex justify-between">
                  <span>Sunday Overtime Hours</span>
                  <span className="font-bold font-mono text-emerald-600">{salaryData.sundayOvertimeHours.toFixed(1)} hrs</span>
                </div>
              </div>
            </div>
          </div>

          {/* Financial Breakdown Table */}
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-900 text-white font-bold">
                  <th className="p-2.5 uppercase tracking-wide">Category / Item Descriptions</th>
                  <th className="p-2.5 text-right uppercase tracking-wide w-40">Allowances (PKR)</th>
                  <th className="p-2.5 text-right uppercase tracking-wide w-40">Deductions (PKR)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-150 font-mono">
                {/* Basic Salary */}
                <tr>
                  <td className="p-2.5 font-sans font-bold text-slate-850">Basic Standard Salary</td>
                  <td className="p-2.5 text-right text-slate-950 font-extrabold">{formatPKR(basicSalary)}</td>
                  <td className="p-2.5 text-right text-slate-400">-</td>
                </tr>

                {/* Regular Overtime Pay */}
                {salaryData.overtimePay > 0 && (
                  <tr>
                    <td className="p-2.5 font-sans">Regular Overtime Amount (Mon-Sat Duty Overtime)</td>
                    <td className="p-2.5 text-right text-emerald-700 font-bold">+{formatPKR(salaryData.overtimePay)}</td>
                    <td className="p-2.5 text-right text-slate-400">-</td>
                  </tr>
                )}

                {/* Sunday Overtime Pay */}
                {salaryData.sundayOvertimePay > 0 && (
                  <tr>
                    <td className="p-2.5 font-sans">Sunday Premium Overtime Amount</td>
                    <td className="p-2.5 text-right text-emerald-700 font-bold">+{formatPKR(salaryData.sundayOvertimePay)}</td>
                    <td className="p-2.5 text-right text-slate-400">-</td>
                  </tr>
                )}

                {/* Sales Commissions */}
                {salaryData.commissionAmount > 0 && (
                  <tr>
                    <td className="p-2.5 font-sans">Approved Monthly Sales Commission</td>
                    <td className="p-2.5 text-right text-emerald-700 font-bold">+{formatPKR(salaryData.commissionAmount)}</td>
                    <td className="p-2.5 text-right text-slate-400">-</td>
                  </tr>
                )}

                {/* Allowances */}
                {salaryData.totalAllowances > 0 && (
                  <tr>
                    <td className="p-2.5 font-sans">Hazri Bonus & Team Performance Allowances</td>
                    <td className="p-2.5 text-right text-emerald-700 font-bold">+{formatPKR(salaryData.totalAllowances)}</td>
                    <td className="p-2.5 text-right text-slate-400">-</td>
                  </tr>
                )}

                {/* Standard Absent Deductions (already baked into calculation) */}
                {salaryData.absents > 0 && (
                  <tr>
                    <td className="p-2.5 font-sans">Absent Days Deduction ({salaryData.absents} days work absence)</td>
                    <td className="p-2.5 text-right text-slate-400">-</td>
                    <td className="p-2.5 text-right text-rose-600 font-semibold">-{formatPKR(salaryData.absents * (basicSalary / 30))}</td>
                  </tr>
                )}

                {/* Sunday Unpaid Off Deductions */}
                {salaryData.unpaidWeeklyOffs > 0 && (
                  <tr>
                    <td className="p-2.5 font-sans">Sunday Unpaid Off Days Deduction ({salaryData.unpaidWeeklyOffs} sundays)</td>
                    <td className="p-2.5 text-right text-slate-400">-</td>
                    <td className="p-2.5 text-right text-rose-600 font-semibold">-{formatPKR(salaryData.unpaidWeeklyOffs * (basicSalary / 30))}</td>
                  </tr>
                )}

                {/* Manual Worksheet Adjustment Review */}
                {Number(salaryData.review.amount) !== 0 && (
                  <tr>
                    <td className="p-2.5 font-sans font-medium text-slate-800">
                      Worksheet Manual Adjustment 
                      {salaryData.review.reason && <span className="text-[10px] text-slate-500 font-sans block mt-0.5">Reason: {salaryData.review.reason}</span>}
                    </td>
                    {Number(salaryData.review.amount) > 0 ? (
                      <>
                        <td className="p-2.5 text-right text-emerald-600 font-bold">+{formatPKR(salaryData.review.amount)}</td>
                        <td className="p-2.5 text-right text-slate-400">-</td>
                      </>
                    ) : (
                      <>
                        <td className="p-2.5 text-right text-slate-400">-</td>
                        <td className="p-2.5 text-right text-rose-600 font-bold">{formatPKR(salaryData.review.amount)}</td>
                      </>
                    )}
                  </tr>
                )}

                {/* Structured Owner Adjustments detail listing */}
                {matchingAdjustments.map((adj) => (
                  <tr key={adj.id}>
                    <td className="p-2.5 font-sans font-medium text-slate-800">
                      Owner Ledger: {adj.adjustment_type}
                      <span className="text-[10px] text-slate-500 font-sans block mt-0.5">Reason: {adj.reason}</span>
                    </td>
                    {Number(adj.amount) >= 0 ? (
                      <>
                        <td className="p-2.5 text-right text-emerald-600 font-bold font-mono">+{formatPKR(adj.amount)}</td>
                        <td className="p-2.5 text-right text-slate-400">-</td>
                      </>
                    ) : (
                      <>
                        <td className="p-2.5 text-right text-slate-400">-</td>
                        <td className="p-2.5 text-right text-rose-600 font-bold font-mono">-{formatPKR(Math.abs(adj.amount))}</td>
                      </>
                    )}
                  </tr>
                ))}

                {/* Advance System Integration Row */}
                {(outstandingBeforeMonth > 0 || recoveryInMonth > 0) && (
                  <tr>
                    <td className="p-2.5 font-sans font-bold text-amber-900 bg-amber-50/40">
                      Auto Advance Payroll Recovery
                      <span className="text-[10px] text-slate-550 font-sans block mt-0.5">
                        Outstanding Loan before payroll: {formatPKR(outstandingBeforeMonth)} | Remaining: {formatPKR(remainingBalance)}
                      </span>
                    </td>
                    <td className="p-2.5 text-right text-slate-400 bg-amber-50/40">-</td>
                    <td className="p-2.5 text-right text-rose-700 font-black bg-amber-50/40 font-mono">
                      {recoveryInMonth > 0 ? `-${formatPKR(recoveryInMonth)}` : '-'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Grand Net Total Approved Salary Block */}
          <div className="flex justify-between items-center bg-emerald-55/65 px-5 py-4 rounded-xl border border-emerald-200">
            <span className="text-[13px] font-black text-emerald-950 uppercase tracking-widest font-sans">
              FINAL APPROVED NET PAYABLE
            </span>
            <span className="text-xl font-black text-emerald-900 font-mono tracking-tight">
              {formatPKR(salaryData.finalSalary + adjustmentsSum - recoveryInMonth)}
            </span>
          </div>

          {/* Workflows and Approvals Section with Signature block */}
          <div className="grid grid-cols-2 gap-8 pt-4 border-t border-dashed border-slate-300">
            {/* Approval Details */}
            <div className="text-xs text-slate-600 space-y-2">
              <div className="flex items-center gap-1.5">
                <span className="font-semibold text-slate-900">Workflow Approval Status:</span>
                <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase inline-block font-mono ${
                  salaryData.review.status === 'Paid' ? 'bg-teal-50 text-teal-700' :
                  salaryData.review.status === 'Locked' ? 'bg-rose-50 text-rose-700' :
                  salaryData.review.status === 'Approved' ? 'bg-emerald-50 text-emerald-700' :
                  'bg-slate-105 text-slate-600'
                }`}>
                  {salaryData.review.status}
                </span>
              </div>
              <div>
                <span className="font-semibold text-slate-950">Approved By:</span>{' '}
                <span className="font-mono">{salaryData.review.approved_by || 'Super Administrator'}</span>
              </div>
              <div>
                <span className="font-semibold text-slate-950">Approval Date:</span>{' '}
                <span className="font-mono">{salaryData.review.approved_at ? new Date(salaryData.review.approved_at).toLocaleString() : new Date().toLocaleString()}</span>
              </div>
            </div>

            {/* Signature Block */}
            <div className="flex flex-col justify-end items-end space-y-1 text-right">
              <div className="h-10 w-44 border-b border-slate-400"></div>
              <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block">Authorized Signatory</span>
              <span className="text-[10px] text-slate-500 block">KaprayOfficial HR & Finance Department</span>
            </div>
          </div>
        </div>

        {/* CSS styles to force perfect output block formatting on print */}
        <span className="hidden">
          <style dangerouslySetInnerHTML={{ __html: `
            @media print {
              body * {
                visibility: hidden !important;
                background: none !important;
              }
              #printable-salary-slip, #printable-salary-slip * {
                visibility: visible !important;
              }
              #printable-salary-slip {
                position: absolute !important;
                left: 0 !important;
                top: 0 !important;
                width: 100% !important;
                border: none !important;
                box-shadow: none !important;
                border-radius: 0 !important;
              }
              .print\\:hidden {
                display: none !important;
              }
            }
          `}} />
        </span>
      </div>
    </div>
  );
}
