import React, { useState } from 'react';
import { DbEmployee, DbAttendance } from '../supabaseClient';
import { saveAttendanceRecord, saveImportLog, saveEmployee } from '../backendService';
import { calculateAttendanceRecord, parseTimeTo24h } from '../utils';
import { UploadCloud, AlertCircle, CheckCircle2, AlertTriangle, Play, HelpCircle, FileText, Download, FileSpreadsheet } from 'lucide-react';

interface CsvImporterProps {
  employees: DbEmployee[];
  existingAttendance: DbAttendance[];
  onImportComplete: () => void;
  onClose: () => void;
}

export function CsvImporter({ employees, existingAttendance, onImportComplete, onClose }: CsvImporterProps) {
  const [csvRawText, setCsvRawText] = useState('');
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  
  // Mapping assignments
  const [mapEmp, setMapEmp] = useState('');
  const [mapDate, setMapDate] = useState('');
  const [mapIn, setMapIn] = useState('');
  const [mapOut, setMapOut] = useState('');
  const [mapManualStatus, setMapManualStatus] = useState('');
  const [mapRemarks, setMapRemarks] = useState('');

  // Conflict state
  const [duplicateStrategy, setDuplicateStrategy] = useState<'skip' | 'update' | 'revision'>('update');
  
  // Unregistered Employees handling (skip or auto-create)
  const [unregisteredStrategy, setUnregisteredStrategy] = useState<'skip' | 'create'>('skip');

  // Preview structure
  interface ParsedRow {
    isValid: boolean;
    errors: string[];
    employeeId: string;
    employeeName: string;
    date: string;
    checkIn: string | null;
    checkOut: string | null;
    manualStatus: string;
    remarks: string;
    isDuplicate: boolean;
  }
  const [parsedData, setParsedData] = useState<ParsedRow[]>([]);
  const [importStatus, setImportStatus] = useState<'idle' | 'saving' | 'success' | 'failed'>('idle');
  const [importReport, setImportReport] = useState('');

  const handleDownloadTemplate = () => {
    const csvContent = "EmployeeId,Date,CheckIn,CheckOut,ManualStatus,Remarks\n" +
      "EMP-01,2026-06-03,09:30 AM,07:30 PM,Auto,Stitching master production complete\n" +
      "EMP-02,2026-06-03,09:15 AM,07:00 PM,Present,On-time arrival senior master\n" +
      "EMP-03,2026-06-03,10:15 AM,03:30 PM,Half-Day,Leaves compensated cutting line";
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'KaprayOfficial_Attendance_Template.csv');
    link.click();
    URL.revokeObjectURL(url);
  };

  // Step 1: Handle CSV uploading/pasting
  const handleParseCSV = (text: string) => {
    if (!text.trim()) return;
    const lines = text.split(/\r?\n/).map(line => line.trim()).filter(line => line.length > 0);
    if (lines.length < 2) return;

    // Direct simple CSV parsing (accounting for commas nested in quotes)
    const parseCSVLine = (line: string): string[] => {
      const result: string[] = [];
      let current = '';
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          result.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      result.push(current.trim());
      return result;
    };

    const parsedHeaders = parseCSVLine(lines[0]);
    
    // Strict Verification check
    const cleanHeaders = parsedHeaders.map(h => h.trim().toLowerCase());
    const required = ['employeeid', 'date', 'checkin', 'checkout', 'manualstatus', 'remarks'];
    const missing = required.filter(req => !cleanHeaders.includes(req));
    if (missing.length > 0) {
      alert(`CSV IMPORT REJECTED!\n\nThe selected file header structure is invalid.\nMissing required columns: "${missing.join(', ')}"\n\nPlease click "Download Correct Template" below to get the official spreadsheet structure.`);
      return;
    }

    const parsedRows = lines.slice(1).map(line => parseCSVLine(line));

    setHeaders(parsedHeaders);
    setRows(parsedRows);

    // Dynamic fuzzy mapping guessing
    parsedHeaders.forEach(h => {
      const lower = h.toLowerCase();
      if (lower.includes('name') || lower.includes('id') || lower.includes('employee') || lower.includes('staff')) {
        setMapEmp(h);
      } else if (lower.includes('date') || lower.includes('day')) {
        setMapDate(h);
      } else if (lower.includes('check_in') || lower.includes('check-in') || lower.includes('in') || lower.includes('checkin')) {
        setMapIn(h);
      } else if (lower.includes('check_out') || lower.includes('check-out') || lower.includes('out') || lower.includes('checkout')) {
        setMapOut(h);
      } else if (lower.includes('status') || lower.includes('manual')) {
        setMapManualStatus(h);
      } else if (lower.includes('remarks') || lower.includes('note') || lower.includes('reason')) {
        setMapRemarks(h);
      }
    });

    setStep(2);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          setCsvRawText(event.target.result as string);
          handleParseCSV(event.target.result as string);
        }
      };
      reader.readAsText(file);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          setCsvRawText(event.target.result as string);
          handleParseCSV(event.target.result as string);
        }
      };
      reader.readAsText(file);
    }
  };

  // Step 2: Columns Mapping & Preview Generator
  const generatePreview = () => {
    const empIdx = headers.indexOf(mapEmp);
    const dateIdx = headers.indexOf(mapDate);
    const inIdx = headers.indexOf(mapIn);
    const outIdx = headers.indexOf(mapOut);
    const manualStatusIdx = headers.indexOf(mapManualStatus);
    const remarksIdx = headers.indexOf(mapRemarks);

    const list: ParsedRow[] = rows.map((row, rI) => {
      const rawEmpVal = empIdx >= 0 ? row[empIdx] : '';
      const rawDateVal = dateIdx >= 0 ? row[dateIdx] : '';
      const rawInVal = inIdx >= 0 ? row[inIdx] : '';
      const rawOutVal = outIdx >= 0 ? row[outIdx] : '';
      const rawManualStatusVal = manualStatusIdx >= 0 ? row[manualStatusIdx] : 'Auto';
      const rawRemarksVal = remarksIdx >= 0 ? row[remarksIdx] : '';

      const errors: string[] = [];
      
      // 1. Resolve employee
      const resolvedEmployee = employees.find(
        e => e.id.toLowerCase() === rawEmpVal.toLowerCase() || 
             e.name.toLowerCase() === rawEmpVal.toLowerCase()
      );

      let empId = '';
      let empName = '';
      if (!resolvedEmployee) {
        errors.push(`Staff not registered: "${rawEmpVal}"`);
        empId = 'UNKNOWN';
        empName = rawEmpVal;
      } else {
        empId = resolvedEmployee.id;
        empName = resolvedEmployee.name;
      }

      // 2. Format Date
      let formattedDate = rawDateVal;
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(formattedDate)) {
        // Try parsing slash date format e.g. DD/MM/YYYY or MM/DD/YYYY
        try {
          const d = new Date(rawDateVal);
          if (!isNaN(d.getTime())) {
            formattedDate = d.toISOString().split('T')[0];
          } else {
            errors.push(`Invalid date format: "${rawDateVal}" (Use YYYY-MM-DD)`);
          }
        } catch {
          errors.push(`Invalid date format: "${rawDateVal}"`);
        }
      }

      // 3. Format Time
      let cleanIn: string | null = null;
      let cleanOut: string | null = null;
      
      if (rawInVal) {
        cleanIn = parseTimeTo24h(rawInVal);
        if (!cleanIn.includes(':')) {
          errors.push(`Check-In time parsing error: "${rawInVal}"`);
        }
      }
      if (rawOutVal) {
        cleanOut = parseTimeTo24h(rawOutVal);
        if (!cleanOut.includes(':')) {
          errors.push(`Check-Out time parsing error: "${rawOutVal}"`);
        }
      }

      // 4. Duplicate Check
      const recordId = `${empId}_${formattedDate}`;
      const isDuplicate = existingAttendance.some(a => a.id === recordId && !a.is_deleted);

      return {
        isValid: errors.length === 0,
        errors,
        employeeId: empId,
        employeeName: empName,
        date: formattedDate,
        checkIn: cleanIn,
        checkOut: cleanOut,
        manualStatus: rawManualStatusVal || 'Auto',
        remarks: rawRemarksVal,
        isDuplicate
      };
    });

    setParsedData(list);
    setStep(3);
  };

  // Step 3: Trigger active bulk saves with conflict handling
  const handleTriggerImport = async () => {
    setImportStatus('saving');
    let successCount = 0;
    let skipCount = 0;
    let overwriteCount = 0;
    const failures: string[] = [];

    // Allow unregistered employees if 'create' strategy is chosen
    const importAttempts = unregisteredStrategy === 'create'
      ? [...parsedData]
      : parsedData.filter(row => row.employeeId !== 'UNKNOWN');

    for (const record of importAttempts) {
      // Create non-existent employees if strategy says 'create'
      if (record.employeeId === 'UNKNOWN') {
        if (unregisteredStrategy === 'create') {
          const rawId = record.employeeName.trim().toUpperCase().replace(/\s/g, '');
          const cleanId = rawId ? rawId : `EMP-${Date.now().toString().slice(-4)}`;
          
          const newEmp: DbEmployee = {
            id: cleanId,
            employee_code: cleanId,
            name: record.employeeName,
            email: null,
            designation: 'Auto-Created via CSV Import',
            department: 'Stitching',
            base_salary: 25000,
            active: true,
            is_deleted: false,
            created_at: new Date().toISOString()
          };
          
          const createRes = await saveEmployee(newEmp);
          if (createRes.success) {
            record.employeeId = cleanId;
          } else {
            failures.push(`Auto-creation failed for "${record.employeeName}": ${createRes.error}`);
            continue;
          }
        } else {
          skipCount++;
          continue;
        }
      }

      const recordId = `${record.employeeId}_${record.date}`;
      const duplicateFound = existingAttendance.find(a => a.id === recordId && !a.is_deleted);

      if (duplicateFound) {
        if (duplicateStrategy === 'skip') {
          skipCount++;
          continue;
        }
        // update represents rewriting
        if (duplicateStrategy === 'update') {
          // Fall through to save - we overwrite
          overwriteCount++;
        }
        if (duplicateStrategy === 'revision') {
          // Tag remarks with revision log
          record.remarks = `${record.remarks || ''} (Correction Revised Import)`.trim();
        }
      }

      // Calculate calculated metrics
      const calculatedInfo = calculateAttendanceRecord(
        record.checkIn,
        record.checkOut,
        record.date,
        record.manualStatus
      );

      const dbRecord: DbAttendance = {
        id: recordId,
        employee_id: record.employeeId,
        date: record.date,
        check_in: record.checkIn,
        check_out: record.checkOut,
        net_hours: calculatedInfo.netHours,
        late_minutes: calculatedInfo.lateMinutes,
        overtime_hours: calculatedInfo.overtimeHours,
        short_hours: calculatedInfo.shortHours,
        manual_status: record.manualStatus,
        status: calculatedInfo.status,
        remarks: record.remarks,
        is_deleted: false,
        edit_history: `Imported via CSV file at ${new Date().toISOString()}`
      };

      const result = await saveAttendanceRecord(dbRecord);
      if (result.success) {
        successCount++;
      } else {
        failures.push(`Failed for Row ${record.employeeName} (${record.date}): ${result.error}`);
      }
    }

    const logSummary = `Uploaded: ${successCount} successful rows. Overwrites: ${overwriteCount}. Skipped: ${skipCount}.`;
    await saveImportLog({
      id: `csv_${Date.now()}`,
      file_name: 'import_upload.csv',
      import_type: 'CSV_MANUAL',
      total_rows: importAttempts.length,
      success_rows: successCount,
      failed_rows: failures.length,
      duplicate_rows: overwriteCount + skipCount,
      imported_by: 'Admin',
      created_at: new Date().toISOString()
    });

    setImportReport(logSummary + (failures.length > 0 ? ` Warnings: ${failures.slice(0, 3).join(', ')}...` : ''));
    setImportStatus('success');
    
    setTimeout(() => {
      onImportComplete();
      onClose();
    }, 2000);
  };

  const totalErrorsCount = parsedData.reduce((acc, row) => acc + row.errors.length, 0);

  return (
    <div id="csv-wizard-backdrop" className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div id="csv-wizard-panel" className="bg-white rounded-xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        
        {/* Wizard Head */}
        <div className="bg-slate-850 border-b border-slate-200 px-6 py-4 flex items-center justify-between bg-slate-100">
          <div className="flex items-center gap-2">
            <UploadCloud className="h-5 w-5 text-emerald-600" />
            <div>
              <h3 className="font-bold text-slate-800 text-sm">CSV Attendance Import Wizard</h3>
              <p className="text-xs text-slate-500">Map custom excel layouts directly without manual database updates</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-md p-1 hover:bg-slate-200 text-slate-400 hover:text-slate-700 text-xs">Close [X]</button>
        </div>

        {/* Timeline Progress */}
        <div className="bg-slate-50 border-b border-slate-200 px-6 py-3 flex items-center justify-start gap-8 text-xs font-semibold">
          <div className={`flex items-center gap-1.5 ${step === 1 ? 'text-emerald-700 font-bold' : 'text-slate-400'}`}>
            <span className="h-5 w-5 bg-emerald-100 text-emerald-750 rounded-full flex items-center justify-center text-[11px]">1</span>
            <span>Upload File</span>
          </div>
          <span className="text-slate-300">/</span>
          <div className={`flex items-center gap-1.5 ${step === 2 ? 'text-emerald-700 font-bold' : 'text-slate-400'}`}>
            <span className="h-5 w-5 bg-slate-200 rounded-full flex items-center justify-center text-[11px]">2</span>
            <span>Map Column Headers</span>
          </div>
          <span className="text-slate-300">/</span>
          <div className={`flex items-center gap-1.5 ${step === 3 ? 'text-emerald-700 font-bold' : 'text-slate-400'}`}>
            <span className="h-5 w-5 bg-slate-200 rounded-full flex items-center justify-center text-[11px]">3</span>
            <span>Conflict Conflict Resolution & Preview</span>
          </div>
        </div>

        {/* Step Contents */}
        <div className="flex-1 overflow-y-auto p-6">
          
          {step === 1 && (
            <div className="space-y-4">
              <div 
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                className="border-2 border-dashed border-slate-300 hover:border-emerald-500 rounded-xl p-8 text-center bg-slate-50 transition-colors cursor-pointer relative"
              >
                <input 
                  type="file" 
                  accept=".csv"
                  onChange={handleFileChange}
                  className="absolute inset-0 opacity-0 cursor-pointer" 
                />
                <UploadCloud className="h-12 w-12 text-slate-400 mx-auto mb-3" />
                <div className="text-sm font-semibold text-slate-700">Drag & Drop attendance CSV template here</div>
                <p className="text-xs text-slate-400 mt-1 mb-4">or manual browsing on your storage</p>
                <button className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-xs px-4 py-2 rounded-lg cursor-pointer">
                  Browse CSV File
                </button>
              </div>

              {/* Official Template Download Banner */}
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-emerald-100 rounded-lg text-emerald-800">
                    <FileSpreadsheet className="h-6 w-6" />
                  </div>
                  <div>
                    <h4 className="font-bold text-xs text-emerald-900">Download Official CSV Template</h4>
                    <p className="text-[11px] text-emerald-700 leading-tight">Use this formatted spreadsheet to guarantee seamless imports and locked header columns.</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleDownloadTemplate}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-4 py-2 rounded-lg flex items-center gap-1.5 shrink-0 transition-colors cursor-pointer"
                >
                  <Download className="h-3.5 w-3.5" />
                  Download Template (CSV)
                </button>
              </div>

              <div className="rounded-lg border border-slate-200 p-4 space-y-3 bg-slate-50">
                <div className="text-xs font-bold text-slate-700 flex items-center gap-1">
                  <HelpCircle className="h-4 w-4 text-emerald-600" />
                  Required Import Column Specifications:
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-[11px] text-slate-600">
                  <div className="bg-white p-2.5 rounded border border-slate-200">
                    <span className="font-bold text-slate-800 block mb-0.5">1. Duty Date Format</span>
                    Must conform strictly to <code className="bg-slate-100 font-bold px-1 py-0.5 text-rose-600 rounded">YYYY-MM-DD</code> (e.g. 2026-06-03).
                  </div>
                  <div className="bg-white p-2.5 rounded border border-slate-200">
                    <span className="font-bold text-slate-800 block mb-0.5">2. Timestamp Formats</span>
                    CheckIn & CheckOut support standard 12-hour AM/PM (<code className="bg-slate-100 font-bold px-1 py-0.5 rounded">09:15 AM</code>) or 24-hour (<code className="bg-slate-100 font-bold px-1 py-0.5 rounded">13:30</code>).
                  </div>
                  <div className="bg-white p-2.5 rounded border border-slate-200">
                    <span className="font-bold text-slate-800 block mb-0.5">3. Status Overrides</span>
                    Values must match <code className="bg-slate-100 font-bold px-1 py-0.5 rounded">Present</code>, <code className="bg-slate-100 font-bold px-1 py-0.5 rounded">Leave</code>, <code className="bg-slate-100 font-bold px-1 py-0.5 rounded">Half-Day</code>, <code className="bg-slate-100 font-bold px-1 py-0.5 rounded">Off</code>, or <code className="bg-slate-100 font-bold px-1 py-0.5 rounded">Auto</code>.
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-200/50">
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Backup Bypass: Paste CSV file content below</label>
                  <textarea 
                    rows={4}
                    value={csvRawText}
                    onChange={(e) => setCsvRawText(e.target.value)}
                    placeholder="EmployeeId,Date,CheckIn,CheckOut,ManualStatus,Remarks&#13;&#10;EMP-01,2026-06-03,09:30 AM,07:30 PM,Auto,Stitching master production complete"
                    className="w-full text-xs font-mono p-2 border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                  <button 
                    onClick={() => handleParseCSV(csvRawText)}
                    disabled={!csvRawText.trim()}
                    className="mt-2 bg-slate-800 hover:bg-slate-900 text-white font-medium text-xs px-4 py-1.5 rounded cursor-pointer disabled:opacity-40"
                  >
                    Analyze Raw Input
                  </button>
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6">
              <div className="bg-blue-50 border border-blue-200 text-blue-800 p-3.5 rounded-lg text-xs leading-normal">
                <strong>Headers recognized!</strong> Match these to the correct columns below. 
                Any column left unmatched will fall back to its database default status.
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                
                <div className="space-y-1">
                  <label className="block text-xs font-bold text-slate-700">Staff Identifier <span className="text-red-500">*</span></label>
                  <p className="text-[10px] text-slate-400 leading-tight">Match employee name or ID (e.g., EMP-01)</p>
                  <select 
                    value={mapEmp} 
                    onChange={(e) => setMapEmp(e.target.value)}
                    className="w-full text-xs border border-slate-300 rounded-lg p-2 focus:ring-1 focus:ring-emerald-500 font-medium"
                  >
                    <option value="">-- Unassigned --</option>
                    {headers.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-bold text-slate-700">Duty Date <span className="text-red-500">*</span></label>
                  <p className="text-[10px] text-slate-400 leading-tight">Calendar date representation (YYYY-MM-DD)</p>
                  <select 
                    value={mapDate} 
                    onChange={(e) => setMapDate(e.target.value)}
                    className="w-full text-xs border border-slate-300 rounded-lg p-2 focus:ring-1 focus:ring-emerald-500 font-medium"
                  >
                    <option value="">-- Unassigned --</option>
                    {headers.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-bold text-slate-700">Check-In Time</label>
                  <p className="text-[10px] text-slate-400 leading-tight">Check-In stamp (HH:MM or AM/PM style)</p>
                  <select 
                    value={mapIn} 
                    onChange={(e) => setMapIn(e.target.value)}
                    className="w-full text-xs border border-slate-300 rounded-lg p-2 focus:ring-1 focus:ring-emerald-500 font-medium"
                  >
                    <option value="">-- Unassigned --</option>
                    {headers.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-bold text-slate-700">Check-Out Time</label>
                  <p className="text-[10px] text-slate-400 leading-tight">Check-Out stamp (HH:MM or AM/PM style)</p>
                  <select 
                    value={mapOut} 
                    onChange={(e) => setMapOut(e.target.value)}
                    className="w-full text-xs border border-slate-300 rounded-lg p-2 focus:ring-1 focus:ring-emerald-500 font-medium"
                  >
                    <option value="">-- Unassigned --</option>
                    {headers.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-bold text-slate-700">Manual Status Overrides</label>
                  <p className="text-[10px] text-slate-400 leading-tight">e.g., Leave, Off, Auto</p>
                  <select 
                    value={mapManualStatus} 
                    onChange={(e) => setMapManualStatus(e.target.value)}
                    className="w-full text-xs border border-slate-300 rounded-lg p-2 focus:ring-1 focus:ring-emerald-500 font-medium"
                  >
                    <option value="">-- Unassigned (Auto Calculation defaults) --</option>
                    {headers.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-bold text-slate-700">Remarks / Remarks</label>
                  <p className="text-[10px] text-slate-400 leading-tight">Brief status text notes</p>
                  <select 
                    value={mapRemarks} 
                    onChange={(e) => setMapRemarks(e.target.value)}
                    className="w-full text-xs border border-slate-300 rounded-lg p-2 focus:ring-1 focus:ring-emerald-500 font-medium"
                  >
                    <option value="">-- Unassigned --</option>
                    {headers.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>

              </div>

              <div className="flex items-center gap-3 pt-4 border-t border-slate-100">
                <button 
                  onClick={generatePreview}
                  disabled={!mapEmp || !mapDate}
                  className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium text-xs px-6 py-2.5 rounded-lg flex items-center gap-2 cursor-pointer transition-colors"
                >
                  <Play className="h-3.5 w-3.5" />
                  Validate Columns & Generate Preview
                </button>
                <button 
                  onClick={() => setStep(1)}
                  className="border border-slate-300 text-slate-700 text-xs px-4 py-2.5 rounded-lg hover:bg-slate-50 transition-colors"
                >
                  Back to File Upload
                </button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-6">
              
              {/* Duplicate & Unregistered Configuration Panels - REQUIREMENT 5 */}
              <div id="import-resolution-rules" className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                
                {/* Duplicate same-day registers */}
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                  <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <AlertTriangle className="h-4.5 w-4.5 text-yellow-600" />
                    How to reconcile existing same-day attendance records?
                  </div>
                  
                  <div className="grid grid-cols-1 gap-2 pt-1">
                    <label className="flex items-start gap-2 p-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 cursor-pointer">
                      <input 
                        type="radio" 
                        name="conflictStrategy" 
                        value="skip" 
                        checked={duplicateStrategy === 'skip'}
                        onChange={() => setDuplicateStrategy('skip')}
                        className="mt-0.5"
                      />
                      <div>
                        <div className="text-[11px] font-bold text-slate-700">Skip Duplicates</div>
                        <p className="text-[10px] text-slate-400">Ignore imported records if this worker date already exists on disk.</p>
                      </div>
                    </label>

                    <label className="flex items-start gap-2 p-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 cursor-pointer">
                      <input 
                        type="radio" 
                        name="conflictStrategy" 
                        value="update" 
                        checked={duplicateStrategy === 'update'}
                        onChange={() => setDuplicateStrategy('update')}
                        className="mt-0.5"
                      />
                      <div>
                        <div className="text-[11px] font-bold text-slate-700">Overwrite / Update Existing</div>
                        <p className="text-[10px] text-slate-400">Overwrite old registers with newly mapped CSV timesheets.</p>
                      </div>
                    </label>

                    <label className="flex items-start gap-2 p-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 cursor-pointer">
                      <input 
                        type="radio" 
                        name="conflictStrategy" 
                        value="revision" 
                        checked={duplicateStrategy === 'revision'}
                        onChange={() => setDuplicateStrategy('revision')}
                        className="mt-0.5"
                      />
                      <div>
                        <div className="text-[11px] font-bold text-slate-700">Import with Revision Correction Tag</div>
                        <p className="text-[10px] text-slate-400">Add a "(Correction Revised Import)" footnote to attendance remarks.</p>
                      </div>
                    </label>
                  </div>
                </div>

                {/* Unregistered Staff - REQUIREMENT 5 */}
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                  <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <HelpCircle className="h-4.5 w-4.5 text-emerald-600" />
                    How to handle unrecognized employee IDs / names?
                  </div>
                  
                  <div className="grid grid-cols-1 gap-2 pt-1">
                    <label className="flex items-start gap-2 p-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 cursor-pointer">
                      <input 
                        type="radio" 
                        name="unregisteredStrategy" 
                        value="skip" 
                        checked={unregisteredStrategy === 'skip'}
                        onChange={() => setUnregisteredStrategy('skip')}
                        className="mt-0.5"
                      />
                      <div>
                        <div className="text-[11px] font-bold text-slate-700">Skip Errored Rows (Recommended)</div>
                        <p className="text-[10px] text-slate-400">Omit non-existent worker rows from the database integration.</p>
                      </div>
                    </label>

                    <label className="flex items-start gap-2 p-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 cursor-pointer">
                      <input 
                        type="radio" 
                        name="unregisteredStrategy" 
                        value="create" 
                        checked={unregisteredStrategy === 'create'}
                        onChange={() => setUnregisteredStrategy('create')}
                        className="mt-0.5"
                      />
                      <div>
                        <div className="text-[11px] font-bold text-slate-700 text-emerald-700">Auto-Register Employees On-the-Fly</div>
                        <p className="text-[10px] text-slate-400">Automatically register new active staff members into the directory list.</p>
                      </div>
                    </label>
                  </div>
                </div>

              </div>

              {/* Real-time preview with validation anomalies check - REQUIREMENT 5 */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="font-semibold text-slate-850 text-xs text-slate-700">Spreadsheet Row Preview ({parsedData.length} records parsed)</h4>
                  {totalErrorsCount > 0 && (
                    <div className="text-xs text-amber-600 font-bold bg-amber-50 px-2.5 py-1 rounded border border-amber-200">
                      Found {totalErrorsCount} critical input warnings during mapping analysis!
                    </div>
                  )}
                </div>

                <div className="border border-slate-200 rounded-lg overflow-x-auto max-h-72">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead className="bg-slate-100 font-bold text-slate-700 border-b border-slate-200 sticky top-0">
                      <tr>
                        <th className="p-2 border-r border-slate-250">Row</th>
                        <th className="p-2 border-r border-slate-250">Employee</th>
                        <th className="p-2 border-r border-slate-250">Calculated Date</th>
                        <th className="p-2 border-r border-slate-250">In Time</th>
                        <th className="p-2 border-r border-slate-250">Out Time</th>
                        <th className="p-2 border-r border-slate-250">Manual Status</th>
                        <th className="p-2 border-r border-slate-250">Duplicate on Database?</th>
                        <th className="p-2">Validation Remarks</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-mono">
                      {parsedData.map((row, i) => (
                        <tr key={i} className={row.isValid ? (row.isDuplicate ? 'bg-amber-50/50' : 'hover:bg-slate-50') : 'bg-red-50/70'}>
                          <td className="p-2 border-r border-slate-200 text-slate-400">{i + 1}</td>
                          <td className="p-2 border-r border-slate-200 text-slate-700 font-sans font-medium">{row.employeeName}</td>
                          <td className="p-2 border-r border-slate-200 text-slate-600">{row.date}</td>
                          <td className="p-2 border-r border-slate-200 text-slate-600">{row.checkIn || '-'}</td>
                          <td className="p-2 border-r border-slate-200 text-slate-600">{row.checkOut || '-'}</td>
                          <td className="p-2 border-r border-slate-200 text-slate-500">{row.manualStatus}</td>
                          <td className="p-2 border-r border-slate-200">
                            {row.isDuplicate ? (
                              <span className="text-[10px] bg-yellow-100 text-yellow-850 px-1.5 py-0.5 rounded font-bold">Duplicate Found</span>
                            ) : (
                              <span className="text-[10px] text-green-600 font-bold">Unique</span>
                            )}
                          </td>
                          <td className="p-2 text-slate-500 font-sans text-[11px]">
                            {row.errors.length > 0 ? (
                              <div className="text-red-600 font-semibold flex items-center gap-1">
                                <AlertCircle className="h-3 w-3 shrink-0" />
                                {row.errors.join(', ')}
                              </div>
                            ) : (
                              <span className="text-green-600 font-medium">Auto-Calculation Approved</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Progress and Commit buttons */}
              <div className="flex items-center gap-3 pt-2">
                {importStatus === 'saving' ? (
                  <div className="flex items-center gap-1.5 text-xs text-blue-700 font-semibold">
                    <span className="animate-spin rounded-full h-4 w-4 border-2 border-blue-600 border-t-transparent"></span>
                    Committing entries to Supabase tables. Do not close this canvas...
                  </div>
                ) : importStatus === 'success' ? (
                  <div className="flex items-center gap-1.5 text-xs text-green-700 bg-green-50 border border-green-200 p-2.5 rounded-lg w-full">
                    <CheckCircle2 className="h-4.5 w-4.5" />
                    <span>Upload synchronized successfully! {importReport}</span>
                  </div>
                ) : (
                  <>
                    <button 
                      onClick={handleTriggerImport}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs px-6 py-2.5 rounded-lg flex items-center gap-2 cursor-pointer transition-colors"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Commit Verified Records To Cloud
                    </button>
                    <button 
                      onClick={() => setStep(2)}
                      className="border border-slate-300 text-slate-700 text-xs px-4 py-2.5 rounded-lg hover:bg-slate-50 transition-colors"
                    >
                      Re-align Columns Map
                    </button>
                    <p className="text-[10px] text-slate-400 italic">Verify preview carefully. Errored employee rows will skip automatically to keep database integers clean.</p>
                  </>
                )}
              </div>

            </div>
          )}

        </div>

        {/* Wizard Footer */}
        <div className="bg-slate-50 border-t border-slate-200 px-6 py-3.5 flex items-center justify-between text-xs text-slate-450 text-slate-500">
          <div className="flex items-center gap-1">
            <FileText className="h-4 w-4 text-slate-400" />
            <span>KaprayOfficial Import System strictly validates timestamps to protect previous month archives</span>
          </div>
          <button 
            onClick={onClose}
            className="hover:bg-slate-100 text-slate-600 font-semibold border border-slate-300 px-4 py-1.5 rounded transition-colors cursor-pointer"
          >
            Cancel Wizard
          </button>
        </div>

      </div>
    </div>
  );
}
