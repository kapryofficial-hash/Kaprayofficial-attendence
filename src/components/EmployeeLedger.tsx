import React, { useState, useMemo } from 'react';
import { DbEmployee, DbAttendance } from '../supabaseClient';
import { 
  formatPKR, 
  formatTime, 
  downloadCSV, 
  isFriday, 
  getSundaysInMonth, 
  getSundayPaidOffStatus, 
  calculatePerformanceScore, 
  getMonthlyRequiredHours,
  getSmartBonusRecommendation
} from '../utils';
import { Printer, FileDown, Search, Filter, Award, Clock, Calendar, CheckSquare, Layers, FileCheck, Landmark, ShieldAlert, GitCommit } from 'lucide-react';

interface EmployeeLedgerProps {
  employees: DbEmployee[];
  attendance: DbAttendance[];
  commissions?: any[];
  allowances?: any[];
  salaryReviews?: any[];
  ownerAdjustments?: any[];
  auditLogs?: any[];
}

export function EmployeeLedger({ 
  employees, 
  attendance, 
  commissions = [], 
  allowances = [], 
  salaryReviews = [],
  ownerAdjustments = [],
  auditLogs = []
}: EmployeeLedgerProps) {
  const [selectedEmpId, setSelectedEmpId] = useState('All');
  const [filterMonth, setFilterMonth] = useState('06');
  const [filterYear, setFilterYear] = useState('2026');

  // Interactive View sub-tab: 'ledger' or 'timeline'
  const [activeSubTab, setActiveSubTab] = useState<'ledger' | 'timeline'>('ledger');

  // Active employees list
  const activeEmployees = useMemo(() => {
    return employees.filter(e => !e.is_deleted);
  }, [employees]);

  // Compute stats for selected employee
  const ledgerData = useMemo(() => {
    if (selectedEmpId === 'All' || !selectedEmpId) return null;

    const emp = employees.find(e => e.id === selectedEmpId);
    if (!emp) return null;

    const y = filterYear;
    const m = filterMonth;

    // Filter attendance for this month
    const empMonthAttendance = attendance.filter(a => {
      if (a.employee_id !== emp.id || a.is_deleted) return false;
      const [attY, attM] = a.date.split('-');
      return attY === y && attM === m;
    });

    const presents = empMonthAttendance.filter(a => a.status === 'Present').length;
    const halfDays = empMonthAttendance.filter(a => a.status === 'Half-Day').length;
    const leaves = empMonthAttendance.filter(a => a.status === 'Leave').length;
    const offs = empMonthAttendance.filter(a => a.status === 'Off').length;
    const absents = empMonthAttendance.filter(a => a.status === 'Absent').length;
    const lates = empMonthAttendance.filter(a => a.late_minutes > 0 && a.status !== 'Absent').length;

    // Sunday logic
    const sundaysInMonth = getSundaysInMonth(parseInt(y, 10), parseInt(m, 10));
    let paidWeeklyOffs = 0;
    let unpaidWeeklyOffs = 0;
    let sundayWorkedCount = 0;
    let sundayWorkedHours = 0;

    const employeeAllAttendance = attendance.filter(a => a.employee_id === emp.id && !a.is_deleted);

    sundaysInMonth.forEach(sunDate => {
      const statusDetails = getSundayPaidOffStatus(sunDate, employeeAllAttendance);
      if (statusDetails.status === 'Paid Weekly Off') {
        paidWeeklyOffs++;
      } else if (statusDetails.status === 'Unpaid Weekly Off') {
        unpaidWeeklyOffs++;
      } else if (statusDetails.status === 'Sunday Worked') {
        sundayWorkedCount++;
        sundayWorkedHours += statusDetails.workedHours || 0;
      }
    });

    // Score sheet
    const scoreObj = calculatePerformanceScore(empMonthAttendance.map(a => ({
      status: a.status || '',
      late_minutes: a.late_minutes || 0,
      net_hours: a.net_hours || 0,
      overtime_hours: a.overtime_hours || 0,
      short_hours: a.short_hours || 0,
      manual_status: a.manual_status || 'Auto',
      date: a.date
    })));

    const basicSalary = emp.base_salary || emp.salary || 0;
    const reqHours = getMonthlyRequiredHours(parseInt(y, 10), parseInt(m, 10)) || 1;
    const hourlyRate = parseFloat((basicSalary / reqHours).toFixed(4));

    // Regular overtime/short (Mon-Sat)
    const regularOvertimeHours = empMonthAttendance.filter(a => {
      const dt = new Date(a.date);
      return dt.getDay() !== 0;
    }).reduce((acc, a) => acc + (a.overtime_hours || 0), 0);

    const regularShortHours = empMonthAttendance.filter(a => {
      const dt = new Date(a.date);
      if (dt.getDay() === 0) return false;
      const isApprovedShort = [
        'Approved Short Hours',
        'Approved Late + Short Hours',
        'Official Early Release',
        'Medical Emergency',
        'System / Machine Error',
        'Official Duty'
      ].includes(a.manual_status || '');
      return !isApprovedShort;
    }).reduce((acc, a) => acc + (a.short_hours || 0), 0);

    const adjustedShortHours = Math.max(0, regularShortHours - regularOvertimeHours);
    const netPayableOvertimeHours = Math.max(0, regularOvertimeHours - regularShortHours);

    // Deducts
    const unpaidLeavesCount = empMonthAttendance.filter(a => a.manual_status === 'Unpaid Leave').length;
    const absentDeduction = absents * (basicSalary / 30);
    const unpaidOffDeduction = unpaidWeeklyOffs * (basicSalary / 30);
    const unpaidLeaveDeduction = unpaidLeavesCount * (basicSalary / 30);

    const timingBasedSalaryBase = Math.max(0, basicSalary - (adjustedShortHours * hourlyRate));
    const timingBasedSalary = Math.max(0, timingBasedSalaryBase - absentDeduction - unpaidOffDeduction - unpaidLeaveDeduction);

    const regularOvertimePay = netPayableOvertimeHours * hourlyRate;
    const sundayOvertimePay = 0; // Sundays never count as overtime pay

    // Commission
    const empComms = commissions.filter(c => c.employee_id === emp.id && c.month === m && c.year === y && c.approved_by);
    const commissionAmount = empComms.reduce((acc, c) => acc + (c.commission_amount || 0), 0);

    // Allowances
    const empAllws = allowances.filter(a => a.employee_id === emp.id && a.month === m && a.year === y && a.approved_by);
    const attendanceBonus = empAllws.filter(a => a.allowance_type === 'Attendance Bonus').reduce((acc, a) => acc + (a.allowance_amount || 0), 0);
    const punctualityBonus = empAllws.filter(a => a.allowance_type === 'Punctuality Bonus').reduce((acc, a) => acc + (a.allowance_amount || 0), 0);
    const performanceBonus = empAllws.filter(a => a.allowance_type === 'Performance Bonus').reduce((acc, a) => acc + (a.allowance_amount || 0), 0);
    const manualBonus = empAllws.filter(a => a.allowance_type === 'Manual Bonus').reduce((acc, a) => acc + (a.allowance_amount || 0), 0);
    const totalAllowances = attendanceBonus + punctualityBonus + performanceBonus + manualBonus;

    const suggestedFinalSalary = timingBasedSalary + regularOvertimePay + sundayOvertimePay + commissionAmount + totalAllowances;

    // Review record
    const reviewRecord = salaryReviews.find(r => r.employee_id === emp.id && r.month === m && r.year === y) || {
      amount: 0,
      reason: '',
      status: 'Draft',
      approved_by: null,
      approved_at: null
    };

    // Policy Rule 4: No automatic final salary deduction for: Missing checkout, Sunday unpaid off, Late, Short hours.
    // Thus, finalSalary before manual adjustment only automatically deducts standard workday absents and unpaid Sundays.
    const finalTimingBasedSalary = Math.max(0, basicSalary - absentDeduction - unpaidOffDeduction - unpaidLeaveDeduction);
    const finalSalary = Math.round(finalTimingBasedSalary + regularOvertimePay + sundayOvertimePay + commissionAmount + totalAllowances + Number(reviewRecord.amount));

    return {
      employee: emp,
      presents,
      halfDays,
      leaves,
      offs,
      absents,
      paidWeeklyOffs,
      unpaidWeeklyOffs,
      sundayWorkedCount,
      sundayWorkedHours,
      sundayOvertimeHours: 0,
      score: scoreObj.score,
      remarks: scoreObj.remarks,
      scoreObj,
      requiredHours: reqHours,
      hourlyRate,
      regularOvertimeHours,
      regularShortHours,
      adjustedShortHours,
      netPayableOvertimeHours,
      timingBasedSalary,
      regularOvertimePay,
      sundayOvertimePay,
      absentDeduction,
      unpaidOffDeduction,
      commissionAmount,
      attendanceBonus,
      punctualityBonus,
      performanceBonus,
      manualBonus,
      totalAllowances,
      suggestedFinalSalary,
      review: reviewRecord,
      finalSalary,
      attendancePercentage: (() => {
        const total = presents + halfDays + leaves + offs + absents;
        return total > 0 ? parseFloat((((presents + leaves + offs + (halfDays * 0.5)) / total) * 100).toFixed(1)) : 100;
      })(),
      recommendation: getSmartBonusRecommendation({
        score: scoreObj.score,
        attendancePercentage: (() => {
          const total = presents + halfDays + leaves + offs + absents;
          return total > 0 ? parseFloat((((presents + leaves + offs + (halfDays * 0.5)) / total) * 100).toFixed(1)) : 100;
        })(),
        absentsCount: absents,
        lateCount: lates
      }),
      logs: empMonthAttendance.sort((a,b) => a.date.localeCompare(b.date))
    };
  }, [selectedEmpId, filterMonth, filterYear, employees, attendance, commissions, allowances, salaryReviews]);

  // Compute Chronological Timeline Events
  const chronologicalTimeline = useMemo(() => {
    if (selectedEmpId === 'All' || !selectedEmpId || !ledgerData) return [];

    const list: Array<{
      id: string;
      date: string; // YYYY-MM-DD
      dayStr: string; // "01 Jun"
      type: 'attendance' | 'financial' | 'admin';
      eventTitle: string;
      eventDescription: string;
      badgeColor: string;
    }> = [];

    // 1. Gather Attendance Events for the Month
    ledgerData.logs.forEach(a => {
      const dt = new Date(a.date);
      const dayStr = dt.toLocaleDateString('en-US', { day: '2-digit', month: 'short' });
      
      let title = '';
      let desc = '';
      let badge = 'bg-slate-100 text-slate-800';

      if (a.status === 'Present') {
        title = 'Shift Checked In';
        desc = `Arrival Time: ${formatTime(a.check_in)} | Departure: ${formatTime(a.check_out)} | Total Duty: ${a.net_hours?.toFixed(1) || '0'} hrs (Overtime: ${a.overtime_hours?.toFixed(1) || '0'} hrs, Short hours: ${a.short_hours?.toFixed(1) || '0'} hrs)`;
        badge = 'bg-emerald-50 text-emerald-800 border border-emerald-200';
      } else if (a.status === 'Half-Day') {
        title = 'Half Shift Registered';
        desc = `Arrival Time: ${formatTime(a.check_in)} | Departure: ${formatTime(a.check_out)} | Short Shift Worked: ${a.net_hours?.toFixed(1) || '0'} hrs`;
        badge = 'bg-sky-50 text-sky-800 border border-sky-200';
      } else if (a.status === 'Leave') {
        title = 'Approved Roster Leave';
        desc = `Excused from active shift duty. Fully counted inside attendance bonuses.`;
        badge = 'bg-violet-50 text-violet-800 border border-violet-200';
      } else if (a.status === 'Absent') {
        title = 'Roster Absenteeism Alert';
        desc = `Employee missed roster checkin window. Action mapped: Unpaid day.`;
        badge = 'bg-rose-50 text-rose-800 border border-rose-200';
      } else if (a.status === 'Off') {
        title = 'Weekly Rest Period (Sunday)';
        desc = 'Weekly offline rest day.';
        badge = 'bg-slate-50 text-slate-650 border border-slate-200';
      } else if (a.status === 'Missing Checkout') {
        title = 'Missing Checkout Warning!';
        desc = `Checked in at ${formatTime(a.check_in)} but registered no checkout log. Status adjusted: Audit Required (Unpaid/Absent not forced).`;
        badge = 'bg-amber-50 text-amber-850 border border-amber-200';
      }

      list.push({
        id: `att_${a.id}_${a.date}`,
        date: a.date,
        dayStr,
        type: 'attendance',
        eventTitle: title,
        eventDescription: desc,
        badgeColor: badge
      });
    });

    // 2. Gather Financial Events
    // Commissions
    commissions.filter(c => c.employee_id === selectedEmpId).forEach(c => {
      const isCurrentMonth = c.month === filterMonth && c.year === filterYear;
      if (!isCurrentMonth) return;

      const eventDate = c.approved_at ? c.approved_at.split('T')[0] : `${filterYear}-${filterMonth}-15`;
      const dt = new Date(eventDate);
      const dayStr = dt.toLocaleDateString('en-US', { day: '2-digit', month: 'short' });

      list.push({
        id: `comm_${c.id}`,
        date: eventDate,
        dayStr,
        type: 'financial',
        eventTitle: 'Sales Commission Approved',
        eventDescription: `Commission sum of Rs. ${formatPKR(c.commission_amount)} approved for dispatcher ledger. Auditing Notes: "${c.commission_reason || 'Dispatch productivity reward'}" (Added by: ${c.added_by || 'Admin'})`,
        badgeColor: 'bg-purple-55 text-purple-900 bg-purple-50 border border-purple-200'
      });
    });

    // Allowances
    allowances.filter(a => a.employee_id === selectedEmpId).forEach(a => {
      const isCurrentMonth = a.month === filterMonth && a.year === filterYear;
      if (!isCurrentMonth) return;

      const eventDate = a.created_at ? a.created_at.split('T')[0] : `${filterYear}-${filterMonth}-15`;
      const dt = new Date(eventDate);
      const dayStr = dt.toLocaleDateString('en-US', { day: '2-digit', month: 'short' });

      list.push({
        id: `allow_${a.id}`,
        date: eventDate,
        dayStr,
        type: 'financial',
        eventTitle: `Allowance Credited: ${a.allowance_type}`,
        eventDescription: `Bonus allowance of Rs. ${formatPKR(a.allowance_amount)} added to dispatch sheet. Audited by: ${a.approved_by || 'HR Admin'}`,
        badgeColor: 'bg-indigo-50 text-indigo-850 border border-indigo-200'
      });
    });

    // Owner Adjustments
    ownerAdjustments.filter(adj => adj.employee_id === selectedEmpId).forEach(adj => {
      const isCurrentMonth = adj.month === filterMonth && adj.year === filterYear;
      if (!isCurrentMonth) return;

      const eventDate = adj.created_at ? adj.created_at.split('T')[0] : `${filterYear}-${filterMonth}-15`;
      const dt = new Date(eventDate);
      const dayStr = dt.toLocaleDateString('en-US', { day: '2-digit', month: 'short' });
      const isNegative = adj.amount < 0;

      list.push({
        id: `lead_${adj.id}`,
        date: eventDate,
        dayStr,
        type: 'financial',
        eventTitle: `Owner Ledger File: ${adj.adjustment_type}`,
        eventDescription: `Direct adjustment of ${isNegative ? '-' : '+'}${formatPKR(Math.abs(adj.amount))} applied to payout envelope. Audited reason: "${adj.reason}" (Created by: ${adj.created_by.split('@')[0]})`,
        badgeColor: isNegative ? 'bg-rose-50 text-rose-800 border border-rose-250 font-bold' : 'bg-emerald-50 text-emerald-800 border border-emerald-250 font-bold'
      });
    });

    // Salary Reviews
    salaryReviews.filter(r => r.employee_id === selectedEmpId).forEach(r => {
      const isCurrentMonth = r.month === filterMonth && r.year === filterYear;
      if (!isCurrentMonth) return;

      const eventDate = r.approved_at ? r.approved_at.split('T')[0] : `${filterYear}-${filterMonth}-28`;
      const dt = new Date(eventDate);
      const dayStr = dt.toLocaleDateString('en-US', { day: '2-digit', month: 'short' });

      list.push({
        id: `rev_${r.id}`,
        date: eventDate,
        dayStr,
        type: 'financial',
        eventTitle: `Salary Status Transition: [${r.status}]`,
        eventDescription: `Month payout workbook promoted to state: ${r.status}. Outlining manual adjust: Rs. ${formatPKR(r.amount)} (Reason: ${r.reason || 'None provided'}), Audited by: ${r.approved_by || 'Administrator'}`,
        badgeColor: 'bg-teal-50 text-teal-850 border border-teal-200'
      });
    });

    // 3. Administrative Events from Audit Logs
    auditLogs.forEach((log, index) => {
      let isMatch = false;
      if (log.record_id === selectedEmpId) {
        isMatch = true;
      } else {
        try {
          const raw = (log.old_data || '') + (log.new_data || '');
          if (raw && raw.includes(selectedEmpId)) isMatch = true;
        } catch {}
      }

      if (!isMatch) return;

      const logDate = log.created_at ? log.created_at.split('T')[0] : null;
      if (!logDate) return;
      const [logY, logM] = logDate.split('-');
      if (logY !== filterYear || logM !== filterMonth) return;

      const dt = new Date(log.created_at);
      const dayStr = dt.toLocaleDateString('en-US', { day: '2-digit', month: 'short' });

      let title = 'System Administrative Change';
      let desc = `Action [${log.action}] executed by user: ${log.user_email || 'HR Department'} (Role: ${log.role}). Record id: ${log.record_id}`;

      if (log.action === 'employee_add') {
        title = 'Employee Profile Commissioned';
        desc = `New employee roster file entered and compiled in memory ledger. Authorized by: ${log.user_email}`;
      } else if (log.action === 'employee_edit') {
        title = 'Roster Profile Modified';
        desc = `Roster card properties / active state adjusted. Modified by: ${log.user_email}`;
      } else if (log.action === 'attendance_delete') {
        title = 'Attendance Entry Soft-Deleted';
        desc = `A day checkin record was deleted and placed into recycle folder by: ${log.user_email}`;
      }

      list.push({
        id: `admin_${log.id || index}`,
        date: logDate,
        dayStr,
        type: 'admin',
        eventTitle: title,
        eventDescription: desc,
        badgeColor: 'bg-amber-50 text-amber-850 border border-amber-200'
      });
    });

    // Sort chronologically ascending
    return list.sort((a, b) => a.date.localeCompare(b.date));
  }, [selectedEmpId, filterMonth, filterYear, ledgerData, commissions, allowances, ownerAdjustments, salaryReviews, auditLogs]);

  // Export CSV of individual Ledger
  const handleExportIndividualLedger = () => {
    if (!ledgerData) return;
    const csvFilename = `salary_ledger_${ledgerData.employee.id}_${filterYear}_${filterMonth}`;
    const headers = ['Metric Item', 'Computation Details', 'Value (PKR / Counts)'];
    const rows = [
      ['Employee Name', ledgerData.employee.name, ''],
      ['Employee Code', ledgerData.employee.id, ''],
      ['Designation', ledgerData.employee.designation, ''],
      ['Month/Year', `${filterMonth}/${filterYear}`, ''],
      ['Basic Salary (Base)', '', formatPKR(ledgerData.employee.base_salary)],
      ['Present Days Count', `${ledgerData.presents} days`, ''],
      ['Half Days Count', `${ledgerData.halfDays} days`, ''],
      ['Leaves Taken', `${ledgerData.leaves} days`, ''],
      ['Absent Days Count', `${ledgerData.absents} days`, ''],
      ['Sunday Paid Weekly Offs', `${ledgerData.paidWeeklyOffs} days`, ''],
      ['Sunday Unpaid Weekly Offs', `${ledgerData.unpaidWeeklyOffs} days`, ''],
      ['Absents Timing Deduction', `${ledgerData.absents} absents * basic/30`, formatPKR(ledgerData.absentDeduction)],
      ['Unpaid Sundays Deduction', `${ledgerData.unpaidWeeklyOffs} sundays * basic/30`, formatPKR(ledgerData.unpaidOffDeduction)],
      ['Weekday Net Short hours', `${ledgerData.adjustedShortHours} hrs`, formatPKR(ledgerData.adjustedShortHours * ledgerData.hourlyRate)],
      ['Weekday Net OT hours', `${ledgerData.netPayableOvertimeHours} hrs`, formatPKR(ledgerData.regularOvertimePay)],
      ['Sunday Worked Overtime', `${ledgerData.sundayOvertimeHours} hrs worked`, formatPKR(ledgerData.sundayOvertimePay)],
      ['Sales Commissions Amount', 'Approved commissions sum', formatPKR(ledgerData.commissionAmount)],
      ['Employee Allowances Total', 'Hazri bonus + Punctuality + Performance', formatPKR(ledgerData.totalAllowances)],
      ['Manual Adjustments (Bonus/Deduct)', ledgerData.review.reason || 'None', formatPKR(ledgerData.review.amount)],
      ['NET PAYABLE SALARY', 'Final PKR distribution after audits', formatPKR(ledgerData.finalSalary)],
      ['Performance Quality Score', `Rating ${ledgerData.score}/100`, ledgerData.remarks]
    ];

    downloadCSV(`${csvFilename}.csv`, headers, rows);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      
      {/* Controls Card */}
      <div className="bg-white rounded-xl shadow border border-slate-200 p-5 flex flex-wrap gap-4 items-end justify-between no-print">
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-[11px] font-bold text-slate-555 mb-1">Select Employee Ledger:</label>
            <select
              value={selectedEmpId}
              onChange={(e) => setSelectedEmpId(e.target.value)}
              className="text-xs border border-slate-300 rounded-lg p-2 bg-slate-50 font-medium focus:ring-1 focus:ring-emerald-500 w-56"
            >
              <option value="All">-- Select Staff Employee --</option>
              {activeEmployees.map(e => (
                <option key={e.id} value={e.id}>{e.id} - {e.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-555 mb-1">Select Month:</label>
            <select
              value={filterMonth}
              onChange={(e) => setFilterMonth(e.target.value)}
              className="text-xs border border-slate-300 rounded-lg p-2 bg-slate-50 font-mono focus:ring-1 focus:ring-emerald-500"
            >
              {['01','02','03','04','05','06','07','08','09','10','11','12'].map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-555 mb-1">Select Year:</label>
            <select
              value={filterYear}
              onChange={(e) => setFilterYear(e.target.value)}
              className="text-xs border border-slate-300 rounded-lg p-2 bg-slate-50 font-mono focus:ring-1 focus:ring-emerald-500"
            >
              {['2025','2026','2027','2028'].map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
        </div>

        {ledgerData && (
          <div className="flex gap-2">
            <button
              onClick={handleExportIndividualLedger}
              className="flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-55 cursor-pointer no-print"
            >
              <FileDown className="h-4 w-4 text-slate-500" />
              Download LEDGER CSV
            </button>
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-300 text-emerald-800 hover:bg-emerald-100 cursor-pointer no-print"
            >
              <Printer className="h-4 w-4 text-emerald-600" />
              {activeSubTab === 'timeline' ? 'Export Timeline PDF' : 'Print / Save PDF'}
            </button>
          </div>
        )}
      </div>

      {/* Roster sheet toggle tabs */}
      {ledgerData && (
        <div className="flex gap-2 border-b border-slate-200 pb-0.5 no-print">
          <button
            onClick={() => setActiveSubTab('ledger')}
            className={`px-4 py-2 text-xs font-bold rounded-t-lg transition-all border-t-2 cursor-pointer ${
              activeSubTab === 'ledger'
                ? 'bg-white border-emerald-600 text-slate-800 shadow-sm'
                : 'bg-slate-100 border-transparent text-slate-500 hover:bg-slate-200'
            }`}
          >
            <Landmark className="h-3.5 w-3.5 inline mr-1.5 text-emerald-600" />
            General Ledger Sheet
          </button>
          <button
            onClick={() => setActiveSubTab('timeline')}
            className={`px-4 py-2 text-xs font-bold rounded-t-lg transition-all border-t-2 cursor-pointer ${
              activeSubTab === 'timeline'
                ? 'bg-white border-emerald-600 text-slate-800 shadow-sm'
                : 'bg-slate-100 border-transparent text-slate-500 hover:bg-slate-200'
            }`}
          >
            <GitCommit className="h-3.5 w-3.5 inline mr-1.5 text-indigo-600" />
            Chronological Activity Timeline
          </button>
        </div>
      )}

      {/* Sheet Output Layout */}
      {!ledgerData ? (
        <div className="bg-white rounded-xl shadow border border-slate-200 py-20 text-center text-slate-400 text-xs italic">
          Please select an active employee from the dropdown above to calculate the ledger statistics sheet.
        </div>
      ) : activeSubTab === 'ledger' ? (
        /* TAB 1: GENERAL FINANCIAL LEDGER VIEW */
        <div className="bg-white rounded-xl shadow border border-slate-200 p-8 printable-content text-slate-800 max-w-4xl mx-auto space-y-6">
          
          {/* Top Banner */}
          <div className="text-center border-b border-double border-slate-300 pb-5 mb-5 flex items-center justify-between">
            <div className="text-left animate-fade-in">
              <h1 className="text-lg font-black text-slate-900 tracking-wider uppercase font-mono">KaprayOfficial ERP</h1>
              <p className="text-[10px] text-slate-400 font-mono uppercase tracking-tight mt-0.5">Staff Individual Monthly General Ledger Summary</p>
            </div>
            <div className="text-right">
              <span className="text-[10px] bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded font-bold border border-emerald-250 font-mono uppercase tracking-wider">
                Salary Month: {filterMonth}/{filterYear}
              </span>
            </div>
          </div>

          {/* Profile segment */}
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-5">
            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wide mb-3 flex items-center gap-1.5 border-b pb-2 border-slate-200">
              <Layers className="h-4 w-4 text-indigo-600" />
              A. Staff Personal & Profile Details
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-y-3 gap-x-6 text-[11px] font-mono">
              <div><span className="text-slate-450 font-sans">Employee Code:</span> <strong className="text-slate-800 font-bold">{ledgerData.employee.id}</strong></div>
              <div><span className="text-slate-450 font-sans">Full Name:</span> <strong className="text-cyan-900 font-bold font-sans text-[12px]">{ledgerData.employee.name}</strong></div>
              <div><span className="text-slate-450 font-sans">Designation:</span> <strong className="font-sans font-medium text-slate-700">{ledgerData.employee.designation}</strong></div>
              
              <div><span className="text-slate-450 font-sans">Department unit:</span> <strong className="font-sans font-medium text-indigo-700">{ledgerData.employee.department}</strong></div>
              <div><span className="text-slate-450 font-sans">Date of Joining:</span> <strong className="text-slate-700">{ledgerData.employee.joining_date || '01-Jan-2025'}</strong></div>
              <div><span className="text-slate-450 font-sans">Roster Status:</span> <span className={`px-1.5 py-0.5 text-[9px] rounded font-bold ${ledgerData.employee.active ? 'bg-emerald-50 text-emerald-700 border border-emerald-300' : 'bg-rose-50 text-rose-700 border border-rose-300'}`}>{ledgerData.employee.active ? 'Active Roster' : 'Blocked / Inactive'}</span></div>
              
              <div><span className="text-slate-450 font-sans">CNIC Verified:</span> <strong className="text-slate-700">{ledgerData.employee.remarks && ledgerData.employee.remarks.includes('CNIC') ? ledgerData.employee.remarks : '35201-XXXXXXX-X'}</strong></div>
              <div><span className="text-slate-450 font-sans">Contact Phone:</span> <strong className="text-slate-700 font-sans">{ledgerData.employee.phone || '+92 300 1234567'}</strong></div>
              <div><span className="text-slate-450 font-sans">Local Address:</span> <strong className="text-slate-700 font-sans text-[10px] italic">Kapray Staff Quarter #12, Lahore</strong></div>
            </div>
          </div>

          {/* Performance scorecard details */}
          <div className="bg-slate-50 border border-slate-205 rounded-lg p-5">
            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wide mb-3 flex items-center gap-1.5 border-b pb-2 border-slate-200">
              <Award className="h-4 w-4 text-emerald-600" />
              B. Performance Rating Quality Matrix
            </h3>
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div className="flex items-center gap-4">
                <div className="bg-emerald-100 text-emerald-800 text-center p-3 rounded-xl border border-emerald-300 flex flex-col justify-center w-18 h-18 shrink-0">
                  <span className="text-2xl font-black font-mono leading-none">{ledgerData.score}</span>
                  <span className="text-[8px] uppercase tracking-wide font-bold font-mono mt-1">/ 100</span>
                </div>
                <div>
                  <div className="text-[12px] font-bold text-slate-800 font-sans uppercase">Quality Rating: {ledgerData.remarks}</div>
                  <p className="text-[10px] text-slate-505 max-w-md mt-1 leading-relaxed">
                    Score reflects absolute compliance in prompt arrivals, required duty hours output, and absolute absences control.
                  </p>
                </div>
              </div>
              <div className="w-full md:w-80 bg-white rounded border border-slate-200 p-3 text-[10px] font-mono divide-y divide-slate-100">
                <div className="flex justify-between py-1 bg-slate-50 px-1"><span className="font-sans text-slate-500">Base Starting Score:</span> <strong>100 pts</strong></div>
                {ledgerData.scoreObj?.breakdown?.absent_days ? (
                  <div className="flex justify-between py-1 text-rose-600 px-1"><span className="font-sans">Unapproved Absence ({ledgerData.scoreObj.breakdown.absent_days}d):</span> <strong>-{ledgerData.scoreObj.breakdown.absent_days * 10} pts</strong></div>
                ) : null}
                {ledgerData.scoreObj?.breakdown?.late_days ? (
                  <div className="flex justify-between py-1 text-rose-600 px-1"><span className="font-sans">Late Arrivals ({ledgerData.scoreObj.breakdown.late_days}d):</span> <strong>-{ledgerData.scoreObj.breakdown.late_days * 2} pts</strong></div>
                ) : null}
                {ledgerData.scoreObj?.breakdown?.short_days ? (
                  <div className="flex justify-between py-1 text-rose-600 px-1"><span className="font-sans">Short Hours ({ledgerData.scoreObj.breakdown.short_days}d):</span> <strong>-{ledgerData.scoreObj.breakdown.short_days * 1} pts</strong></div>
                ) : null}
                {ledgerData.scoreObj?.breakdown?.missing_checkout ? (
                  <div className="flex justify-between py-1 text-rose-600 px-1"><span className="font-sans">Missing Checkout ({ledgerData.scoreObj.breakdown.missing_checkout}d):</span> <strong>-{ledgerData.scoreObj.breakdown.missing_checkout * 5} pts</strong></div>
                ) : null}
                {ledgerData.scoreObj?.breakdown?.sunday_bonus ? (
                  <div className="flex justify-between py-1 text-emerald-600 font-bold px-1"><span className="font-sans">Sunday Worked Bonus ({ledgerData.sundayWorkedCount}d):</span> <strong>+{ledgerData.scoreObj.breakdown.sunday_bonus} pts</strong></div>
                ) : null}
                {ledgerData.scoreObj?.breakdown?.perfect_attendance ? (
                  <div className="flex justify-between py-1 text-emerald-600 font-bold px-1"><span className="font-sans">Perfect Month Attendance:</span> <strong>+5 pts</strong></div>
                ) : null}
                {ledgerData.scoreObj?.breakdown?.excellent_attendance ? (
                  <div className="flex justify-between py-1 text-emerald-500 font-semibold px-1"><span className="font-sans">Excellent Attendance Bonus:</span> <strong>+2 pts</strong></div>
                ) : null}
                <div className="flex justify-between py-1.5 font-bold border-t border-slate-200 mt-1 pt-1 bg-emerald-50 text-emerald-800 px-1"><span className="font-sans">Final Score:</span> <span>{ledgerData.score} / 100</span></div>
              </div>
            </div>

            {/* Recommendation Panel */}
            <div className={`mt-4 border p-4 rounded-xl flex items-start gap-3.5 ${ledgerData.recommendation.color}`}>
              <div className={`p-2 rounded-lg shrink-0 ${ledgerData.recommendation.badgeColor}`}>
                <Award className="h-5 w-5" />
              </div>
              <div>
                <span className="text-[10px] uppercase font-mono font-bold tracking-wider opacity-75">Automated ERP Executive Recommendation</span>
                <h4 className="text-sm font-extrabold mt-0.5">{ledgerData.recommendation.recommendation}</h4>
                <p className="text-xs mt-1 leading-relaxed max-w-2xl">{ledgerData.recommendation.description}</p>
              </div>
            </div>

          </div>

          {/* Attendance metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3 no-print">
            <div className="bg-slate-50 border rounded p-2.5 text-center">
              <span className="text-[8px] text-slate-400 uppercase font-bold block">Present</span>
              <strong className="text-sm font-black text-slate-800 font-mono block mt-0.5">{ledgerData.presents} days</strong>
            </div>
            <div className="bg-slate-50 border rounded p-2.5 text-center">
              <span className="text-[8px] text-indigo-400 uppercase font-bold block">Half Shifts</span>
              <strong className="text-sm font-black text-indigo-600 font-mono block mt-0.5">{ledgerData.halfDays} days</strong>
            </div>
            <div className="bg-slate-50 border rounded p-2.5 text-center">
              <span className="text-[8px] text-rose-500 uppercase font-bold block">Absents</span>
              <strong className="text-sm font-black text-rose-600 font-mono block mt-0.5">{ledgerData.absents} days</strong>
            </div>
            <div className="bg-slate-50 border rounded p-2.5 text-center">
              <span className="text-[8px] text-emerald-600 uppercase font-bold block">Paid Sundays</span>
              <strong className="text-sm font-black text-emerald-600 font-mono block mt-0.5">{ledgerData.paidWeeklyOffs} days</strong>
            </div>
            <div className="bg-slate-100 border rounded p-2.5 text-center">
              <span className="text-[8px] text-amber-600 uppercase font-bold block">Unpaid Sundays</span>
              <strong className="text-sm font-black text-amber-705 font-mono block mt-0.5">{ledgerData.unpaidWeeklyOffs} days</strong>
            </div>
            <div className="bg-slate-50 border rounded p-2.5 text-center">
              <span className="text-[8px] text-purple-600 uppercase font-bold block">Commissions</span>
              <strong className="text-sm font-black text-purple-705 font-mono block mt-0.5">+{formatPKR(ledgerData.commissionAmount)}</strong>
            </div>
          </div>

          {/* Salary Breakdown */}
          <div className="border border-slate-250 rounded-xl overflow-hidden shadow-sm">
            <div className="bg-slate-800 text-white font-mono p-3 font-bold text-xs uppercase tracking-wide flex items-center justify-between">
              <span>C. General Ledger Formula Breakdown (PKR Base)</span>
              <span className="text-[10px] text-slate-300 font-normal">Workflow status: {ledgerData.review.status}</span>
            </div>
            <div className="p-5 space-y-4 text-[11px] font-sans">
              
              <div className="flex justify-between border-b pb-2"><span className="text-slate-600">1. Basic Contract Salary Rate (Fixed Monthly Base):</span> <strong className="font-mono text-xs">{formatPKR(ledgerData.employee.base_salary)}</strong></div>
              
              <div className="flex justify-between border-b pb-2"><span className="text-slate-605">2. Absents Deduction Clause: 
                <span className="text-[10px] text-slate-400 block font-normal leading-none italic mt-0.5">formula: absents * (basic_salary / 30)</span>
              </span> <strong className="font-mono text-rose-600">-{formatPKR(ledgerData.absentDeduction)} ({ledgerData.absents} Absents)</strong></div>
              
              <div className="flex justify-between border-b pb-2"><span className="text-slate-650 font-bold">3. Unpaid Sundays Exclusion:
                <span className="text-[10px] text-slate-400 block font-normal leading-none italic mt-0.5">formula: unpaid_sundays * (basic_salary / 30)</span>
              </span> <strong className="font-mono text-rose-600">-{formatPKR(ledgerData.unpaidOffDeduction)} ({ledgerData.unpaidWeeklyOffs} unearned off days)</strong></div>

              <div className="flex justify-between border-b pb-2"><span className="text-slate-605">4. Weekday Required Shifts Hours Compliance:
                <span className="text-[10px] text-slate-400 block font-normal leading-none italic mt-0.5">formula: Max(0, Short_Hours - Regular_OT) * hourly_rate</span>
              </span> <strong className={`font-mono ${ledgerData.adjustedShortHours > 0 ? 'text-rose-600' : 'text-slate-600'}`}>
                {ledgerData.adjustedShortHours > 0 ? `-${formatPKR(ledgerData.adjustedShortHours * ledgerData.hourlyRate)}` : 'PKR 0'} ({ledgerData.adjustedShortHours.toFixed(1)}h short)
              </strong></div>

              <div className="flex justify-between border-b pb-2"><span className="text-slate-605">5. Regular Weekday (Mon-Sat) Overtime Pay:
                <span className="text-[10px] text-slate-400 block font-normal leading-none italic mt-0.5">formula: Max(0, Regular_OT - Short_Hours) * hourly_rate</span>
              </span> <strong className="font-mono text-emerald-650">+{formatPKR(ledgerData.regularOvertimePay)} ({ledgerData.netPayableOvertimeHours.toFixed(1)}h OT)</strong></div>

              <div className="flex justify-between border-b pb-2"><span className="text-slate-650 font-bold">6. Sunday Overtime Separation Clause:
                <span className="text-[10px] text-slate-400 font-normal block leading-none italic mt-0.5">formula: Sunday_worked_hours * hourly_rate (Added separately, never compressed or offset)</span>
              </span> <strong className="font-mono text-emerald-600 font-bold">+{formatPKR(ledgerData.sundayOvertimePay)} ({ledgerData.sundayOvertimeHours.toFixed(1)}h worked)</strong></div>

              <div className="flex justify-between border-b pb-2"><span className="text-slate-605">7. Sales Commissions & Incentives Earned:</span> <strong className="font-mono text-indigo-600 font-bold">+{formatPKR(ledgerData.commissionAmount)}</strong></div>

              <div className="flex justify-between border-b pb-2"><span className="text-slate-605">8. Approved Allowances (Hazri/Performance Bonus sum):</span> <strong className="font-mono text-sky-600 font-bold">+{formatPKR(ledgerData.totalAllowances)}</strong></div>

              <div className="flex justify-between border-b pb-2"><span className="text-slate-605">9. Approved Manual Adjustment (Bonus / Penalty):
                <span className="text-[10px] text-slate-400 block leading-none font-normal italic mt-0.5">Approved reason: "{ledgerData.review.reason || 'No manual adjustment logs registered'}"</span>
              </span> <strong className={`font-mono ${Number(ledgerData.review.amount) >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                {Number(ledgerData.review.amount) > 0 ? '+' : ''}{formatPKR(ledgerData.review.amount)}
              </strong></div>

              {/* Final Payable */}
              <div className="flex justify-between pt-3 bg-slate-50 p-3 rounded-lg border border-slate-200 mt-2 text-sm">
                <span className="font-black text-slate-900 text-xs uppercase tracking-wider flex items-center gap-1">
                  <FileCheck className="h-4.5 w-4.5 text-emerald-600 shrink-0" />
                  D. FINAL NET ENVELOPE PAYABLE SALARY:
                </span> 
                <strong className="font-mono text-lg text-emerald-800 font-bold">
                  {formatPKR(ledgerData.finalSalary)}
                </strong>
              </div>

            </div>
          </div>

          {/* Child Log records table */}
          <div className="space-y-2 border border-slate-200 rounded-lg p-5">
            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wide flex items-center gap-1.5 border-b pb-2 border-slate-200">
              <Calendar className="h-4 w-4 text-emerald-600" />
              E. Consolidated Day-by-Day Monthly duty sheet
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-[10px] font-mono">
                <thead>
                  <tr className="bg-slate-100 border-b font-bold text-slate-650">
                    <th className="p-2">Date</th>
                    <th className="p-2">Check In</th>
                    <th className="p-2">Check Out</th>
                    <th className="p-2 text-center">Worked Hours</th>
                    <th className="p-2 text-center">Late minutes</th>
                    <th className="p-2 text-center">Overtime</th>
                    <th className="p-2 text-center">Short hour</th>
                    <th className="p-2 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-150">
                  {ledgerData.logs.map((log) => {
                    const isFri = isFriday(log.date);
                    const isSun = new Date(log.date).getDay() === 0;
                    return (
                      <tr key={log.id} className={`hover:bg-slate-50/50 ${isSun ? 'bg-amber-50/20' : ''} ${isFri ? 'bg-emerald-50/10' : ''}`}>
                        <td className="p-2 font-bold">{log.date} ({isSun ? 'Sun' : isFri ? 'Fri' : 'Shift'})</td>
                        <td className="p-2">{formatTime(log.check_in)}</td>
                        <td className="p-2">{formatTime(log.check_out)}</td>
                        <td className="p-2 text-center font-bold text-slate-700">{log.net_hours?.toFixed(1) || '0.0'} h</td>
                        <td className="p-2 text-center text-amber-700">{log.late_minutes || 0} min</td>
                        <td className="p-2 text-center text-emerald-600">{log.overtime_hours?.toFixed(1) || '0.0'} h</td>
                        <td className="p-2 text-center text-rose-500">{log.short_hours?.toFixed(1) || '0.0'} h</td>
                        <td className={`p-2 font-bold ${
                          log.status === 'Present' ? 'text-emerald-700' :
                          log.status === 'Half-Day' ? 'text-sky-600' :
                          log.status === 'Leave' ? 'text-violet-605' :
                          log.status === 'Absent' ? 'text-rose-600 font-extrabold' :
                          log.status === 'Missing Checkout' ? 'text-amber-600 underline' : 'text-slate-400'
                        }`}>{log.status || 'Off'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      ) : (
        /* TAB 2: CHRONOLOGICAL ACTIVITY TIMELINE VIEW */
        <div className="bg-white rounded-xl shadow border border-slate-200 p-8 printable-content text-slate-800 max-w-3xl mx-auto space-y-6">
          {/* Top Banner */}
          <div className="text-center border-b border-double border-slate-300 pb-5 flex items-center justify-between">
            <div className="text-left">
              <h1 className="text-lg font-black text-indigo-950 uppercase font-mono">KaprayOfficial Timeline</h1>
              <p className="text-[10px] text-slate-400 font-mono uppercase tracking-tight mt-0.5">Chronological Audit and Activity Timeline Profile</p>
            </div>
            <div className="text-right">
              <span className="text-[10px] bg-indigo-50 text-indigo-700 px-3 py-1 rounded font-bold border border-indigo-250 font-mono tracking-wider">
                Audited Period: {filterMonth}/{filterYear}
              </span>
            </div>
          </div>

          {/* Simple Profile header */}
          <div className="grid grid-cols-2 gap-4 text-xs font-mono bg-slate-50 p-4 rounded-xl border border-slate-150">
            <div><span className="text-slate-400">Employee Code:</span> <strong className="text-slate-800">{ledgerData.employee.id}</strong></div>
            <div><span className="text-slate-400">Staff Employee Name:</span> <strong className="text-slate-900">{ledgerData.employee.name}</strong></div>
            <div><span className="text-slate-400">Role Designation:</span> <span className="text-slate-700">{ledgerData.employee.designation}</span></div>
            <div><span className="text-slate-400">Roster Unit:</span> <span className="text-slate-700">{ledgerData.employee.department}</span></div>
          </div>

          {/* Chronological Vertical Timeline list */}
          <div className="relative border-l-2 border-indigo-200 ml-5 pl-8 space-y-6 pt-2 pb-2">
            {chronologicalTimeline.length === 0 ? (
              <div className="py-8 text-center text-slate-400 italic font-sans text-xs pl-0 ml-[-2rem]">
                No chronological activities or administrative audits detected for selected month and employee.
              </div>
            ) : (
              chronologicalTimeline.map((item) => (
                <div key={item.id} className="relative group transition-all duration-200">
                  {/* Timeline node dot bubble */}
                  <span className={`absolute left-[-2.4rem] top-1 h-5 w-5 rounded-full border-4 border-white shadow flex items-center justify-center shrink-0 ${
                    item.type === 'attendance' ? 'bg-emerald-500' :
                    item.type === 'financial' ? 'bg-indigo-500' : 'bg-amber-500'
                  }`}>
                    <span className="h-1 w-1 bg-white rounded-full"></span>
                  </span>

                  {/* Date Flag */}
                  <div className="text-[10px] font-bold font-mono text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded w-fit mb-1.5 shadow-xs border border-indigo-100">
                    {item.dayStr} ({item.date})
                  </div>

                  {/* Body Text Box */}
                  <div className="bg-slate-50/55 hover:bg-slate-50 border border-slate-150 rounded-xl p-3.5 shadow-xs transition-colors">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <h4 className="text-[12px] font-bold text-slate-900 font-sans tracking-tight leading-none">
                        {item.eventTitle}
                      </h4>
                      <span className={`px-2 py-0.5 rounded text-[9px] font-sans font-bold leading-none ${item.badgeColor}`}>
                        {item.type}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-600 mt-2 font-mono leading-relaxed">
                      {item.eventDescription}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Styled Printable Setup */}
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          body * {
            visibility: hidden !important;
            background: none !important;
          }
          .printable-content, .printable-content * {
            visibility: visible !important;
          }
          .printable-content {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            box-shadow: none !important;
            border: none !important;
            padding: 0 !important;
            margin: 0 auto !important;
          }
          .no-print {
            display: none !important;
          }
        }
      `}} />

    </div>
  );
}
