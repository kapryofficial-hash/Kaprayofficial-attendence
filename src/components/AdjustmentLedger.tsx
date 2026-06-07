import React, { useState } from 'react';
import { DbEmployee } from '../supabaseClient';
import { OwnerAdjustment } from '../types';
import { formatPKR } from '../utils';
import { PlusCircle, Trash2, CheckCircle, FileText, AlertTriangle, Filter } from 'lucide-react';

interface AdjustmentLedgerProps {
  employees: DbEmployee[];
  adjustments: OwnerAdjustment[];
  onAddAdjustment: (adj: Omit<OwnerAdjustment, 'id' | 'created_at' | 'approved_at'>) => Promise<void>;
  onDeleteAdjustment: (id: string) => Promise<void>;
  onApproveAdjustment: (id: string, approver: string) => Promise<void>;
  salaryMonth: string; // YYYY-MM
  userRole: string;
  currentUserEmail: string;
  isLocked: boolean;
}

export function AdjustmentLedger({
  employees,
  adjustments,
  onAddAdjustment,
  onDeleteAdjustment,
  onApproveAdjustment,
  salaryMonth,
  userRole,
  currentUserEmail,
  isLocked
}: AdjustmentLedgerProps) {
  const [yearStr, monthStr] = salaryMonth.split('-');
  
  // Form states
  const [selectedEmpId, setSelectedEmpId] = useState('');
  const [adjType, setAdjType] = useState<'Bonus' | 'Attendance Bonus' | 'Performance Bonus' | 'Festival Bonus' | 'Special Allowance' | 'Salary Correction' | 'Advance Recovery' | 'Fine' | 'Manual Deduction'>('Bonus');
  const [amount, setAmount] = useState<number>(0);
  const [reason, setReason] = useState('');

  // Local filter states
  const [filterMonth, setFilterMonth] = useState(monthStr);
  const [filterYear, setFilterYear] = useState(yearStr);

  const activeEmployees = employees.filter(e => !e.is_deleted);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (isLocked) {
      alert('Operation Blocked: Current workspace month is locked as read-only.');
      return;
    }

    if (!selectedEmpId) {
      alert('Validation Error: Please select an employee roster code.');
      return;
    }

    if (amount <= 0) {
      alert('Validation Error: Amount must be greater than zero. (The system will handle negative values automatically based on type).');
      return;
    }

    if (!reason.trim()) {
      alert('Validation Error: No adjustment can be added without a specifiable auditing reason.');
      return;
    }

    const emp = employees.find(e => e.id === selectedEmpId);
    if (!emp) {
      alert('Validation Error: Selected employee profile not found.');
      return;
    }

    // Determine sign: positive adjustments add to salary, negative subtracts
    // Deductions have negative sign
    const isNegative = ['Advance Recovery', 'Fine', 'Manual Deduction'].includes(adjType);
    const finalAmount = isNegative ? -Math.abs(amount) : Math.abs(amount);

    await onAddAdjustment({
      employee_id: selectedEmpId,
      employee_name: emp.name,
      month: filterMonth,
      year: filterYear,
      adjustment_type: adjType,
      amount: finalAmount,
      reason: reason.trim(),
      created_by: currentUserEmail,
      approved_by: userRole === 'super_admin' ? currentUserEmail : null
    });

    // Reset Form
    setSelectedEmpId('');
    setAmount(0);
    setReason('');
    alert('Owner Ledger adjustment successfully recorded!');
  };

  // Filter ledger list
  const filteredAdjustments = adjustments.filter(adj => {
    const matchM = !filterMonth || adj.month === filterMonth;
    const matchY = !filterYear || adj.year === filterYear;
    return matchM && matchY;
  });

  return (
    <div className="space-y-4">
      {/* Create Adjustment card */}
      <div className="bg-white rounded-xl shadow-md border border-slate-200 overflow-hidden">
        <div className="bg-slate-50 border-b border-slate-200 px-4 py-3 flex justify-between items-center">
          <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest flex items-center gap-1.5">
            <PlusCircle className="h-4 w-4 text-emerald-600" />
            File New Owner Ledger Adjustment
          </h3>
          {isLocked && (
            <span className="text-[10px] bg-rose-50 text-rose-700 px-2 py-0.5 rounded font-bold border border-rose-150 animate-pulse">
              WORKBOOK LOCKED (ReadOnly)
            </span>
          )}
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Select Employee */}
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">
                Select staff employee *
              </label>
              <select
                value={selectedEmpId}
                onChange={(e) => setSelectedEmpId(e.target.value)}
                disabled={isLocked}
                className="w-full text-xs border border-slate-300 rounded p-2 focus:ring-1 focus:ring-emerald-500 bg-white"
              >
                <option value="">-- Choose Employee --</option>
                {activeEmployees.map(emp => (
                  <option key={emp.id} value={emp.id}>
                    {emp.name} ({emp.id})
                  </option>
                ))}
              </select>
            </div>

            {/* Type */}
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">
                Adjustment type *
              </label>
              <select
                value={adjType}
                onChange={(e) => setAdjType(e.target.value as any)}
                disabled={isLocked}
                className="w-full text-xs border border-slate-300 rounded p-2 focus:ring-1 focus:ring-emerald-500 bg-white"
              >
                <optgroup label="Positive Adjustments (Bonuses)">
                  <option value="Bonus">Standard Bonus</option>
                  <option value="Attendance Bonus">Attendance Bonus</option>
                  <option value="Performance Bonus">Performance Bonus</option>
                  <option value="Festival Bonus">Festival Bonus</option>
                  <option value="Special Allowance">Special Allowance</option>
                  <option value="Salary Correction">Positive Salary Correction</option>
                </optgroup>
                <optgroup label="Negative Adjustments (Deductions)">
                  <option value="Advance Recovery">Advance Recovery Deduction</option>
                  <option value="Fine">Company Fine</option>
                  <option value="Manual Deduction">Manual Deduction / Correction</option>
                </optgroup>
              </select>
            </div>

            {/* Amount */}
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">
                Amount (PKR) *
              </label>
              <input
                type="number"
                value={amount || ''}
                onChange={(e) => setAmount(Number(e.target.value))}
                placeholder="e.g. 2500"
                disabled={isLocked}
                className="w-full text-xs border border-slate-300 rounded p-2 font-mono font-medium focus:ring-1 focus:ring-emerald-500"
              />
            </div>

            {/* Target Execution Ledger Month/Year */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">
                  Scope Month
                </label>
                <select
                  value={filterMonth}
                  onChange={(e) => setFilterMonth(e.target.value)}
                  className="w-full text-xs border border-slate-300 rounded p-2 bg-white"
                >
                  {['01','02','03','04','05','06','07','08','09','10','11','12'].map(m => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">
                  Scope Year
                </label>
                <select
                  value={filterYear}
                  onChange={(e) => setFilterYear(e.target.value)}
                  className="w-full text-xs border border-slate-300 rounded p-2 bg-white"
                >
                  {['2025','2026','2027','2028'].map(y => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Reason */}
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">
              Deducted/Bonus Auditing Reason *
            </label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Provide clean and detailed reason to explain adjustment compliance..."
              disabled={isLocked}
              className="w-full text-xs border border-slate-300 rounded p-2 focus:ring-1 focus:ring-emerald-500"
            />
          </div>

          <div className="flex justify-end pt-1">
            <button
              type="submit"
              disabled={isLocked}
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold py-2 px-6 rounded-lg cursor-pointer transition-colors flex items-center gap-1.5 shadow"
            >
              <PlusCircle className="h-4 w-4" />
              Add To Payroll Ledger
            </button>
          </div>
        </form>
      </div>

      {/* List Ledger Table */}
      <div className="bg-white rounded-xl shadow-md border border-slate-200 overflow-hidden">
        <div className="p-4 bg-slate-50 flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200">
          <div>
            <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest flex items-center gap-1.5">
              <FileText className="h-4 w-4 text-indigo-600" />
              Historical Owner Adjustments Ledger
            </h3>
            <p className="text-[10px] text-slate-400 mt-0.5 font-sans">
              Showing adjustments applied to the sheet for Year {filterYear} / Month {filterMonth}
            </p>
          </div>

          {/* Table Filters */}
          <div className="flex items-center gap-2">
            <label className="text-[10px] font-bold text-slate-600 flex items-center gap-1">
              <Filter className="h-3 w-3" />
              Month Filter:
            </label>
            <select
              value={filterMonth}
              onChange={(e) => setFilterMonth(e.target.value)}
              className="text-xs border border-slate-350 bg-white rounded p-1 font-semibold"
            >
              <option value="">-- All Months --</option>
              {['01','02','03','04','05','06','07','08','09','10','11','12'].map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>

            <select
              value={filterYear}
              onChange={(e) => setFilterYear(e.target.value)}
              className="text-xs border border-slate-350 bg-white rounded p-1 font-semibold"
            >
              <option value="">-- All Years --</option>
              {['2025','2026','2027','2028'].map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          {filteredAdjustments.length === 0 ? (
            <div className="p-8 text-center text-slate-450 space-y-2">
              <AlertTriangle className="h-8 w-8 mx-auto text-slate-300" />
              <p className="text-xs font-medium font-sans">No owner ledger adjustments added for selected filters.</p>
            </div>
          ) : (
            <table className="w-full text-left border-collapse text-xs">
              <thead className="bg-slate-100 font-bold text-slate-700 border-b border-slate-250">
                <tr>
                  <th className="p-3">Employee</th>
                  <th className="p-3 text-center">Period</th>
                  <th className="p-3">Type</th>
                  <th className="p-3 text-right">Amount (PKR)</th>
                  <th className="p-3 w-80">Reason / Notes</th>
                  <th className="p-3">Created By</th>
                  <th className="p-3">Approved By</th>
                  <th className="p-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-150 bg-white font-mono text-[11px]">
                {filteredAdjustments.map((adj) => {
                  const isNegative = ['Advance Recovery', 'Fine', 'Manual Deduction'].includes(adj.adjustment_type);
                  return (
                    <tr key={adj.id} className="hover:bg-slate-50/50">
                      <td className="p-3">
                        <span className="font-extrabold text-slate-650 block leading-tight">{adj.employee_id}</span>
                        <span className="font-sans font-bold text-slate-800">{adj.employee_name}</span>
                      </td>
                      <td className="p-3 text-center font-bold text-slate-550">
                        {adj.month}/{adj.year}
                      </td>
                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-sans font-extrabold inline-block ${
                          isNegative ? 'bg-rose-50 text-rose-700 border border-rose-150' : 'bg-emerald-50 text-emerald-800 border border-emerald-150'
                        }`}>
                          {adj.adjustment_type}
                        </span>
                      </td>
                      <td className={`p-3 text-right font-extrabold ${isNegative ? 'text-rose-600' : 'text-emerald-700'}`}>
                        {isNegative ? '-' : '+'}{formatPKR(Math.abs(adj.amount))}
                      </td>
                      <td className="p-3 font-sans text-slate-650 italic text-[11px] leading-relaxed">
                        {adj.reason}
                      </td>
                      <td className="p-3 font-sans text-slate-500 text-[10px]">
                        {adj.created_by.split('@')[0]}
                      </td>
                      <td className="p-3">
                        {adj.approved_by ? (
                          <span className="text-[10px] text-emerald-750 flex items-center gap-1 font-semibold">
                            <CheckCircle className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                            {adj.approved_by.split('@')[0]}
                          </span>
                        ) : (
                          <button
                            onClick={() => onApproveAdjustment(adj.id, currentUserEmail)}
                            disabled={userRole !== 'super_admin' || isLocked}
                            className="text-[9px] bg-amber-50 hover:bg-amber-100 text-amber-800 font-bold px-2 py-1 rounded border border-amber-200 transition-all cursor-pointer"
                          >
                            Approve Pending
                          </button>
                        )}
                      </td>
                      <td className="p-3 text-center">
                        <button
                          onClick={() => onDeleteAdjustment(adj.id)}
                          disabled={isLocked}
                          className="text-slate-450 hover:text-rose-600 p-1 rounded-lg hover:bg-slate-100 cursor-pointer transition-colors disabled:opacity-40"
                          title="Delete adjustment"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
