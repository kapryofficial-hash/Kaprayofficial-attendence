import React, { useState, useMemo } from 'react';
import { DbEmployee, DbAttendance } from '../supabaseClient';
import { 
  formatPKR, 
  formatTime, 
  downloadCSV, 
  downloadExcel,
  isFriday,
  calculatePerformanceScore
} from '../utils';
import { 
  Printer, 
  FileSpreadsheet, 
  Search, 
  FileDown, 
  Filter, 
  AlertCircle, 
  FileText, 
  TrendingUp, 
  Clock, 
  AlertTriangle,
  UserPlus,
  CheckCircle,
  Calendar,
  Layers,
  Award,
  ChevronDown,
  X
} from 'lucide-react';

interface ReportViewProps {
  employees: DbEmployee[];
  attendance: DbAttendance[];
  initialFilters?: {
    searchQuery?: string;
    selectedDept?: string;
    filterEmpId?: string;
    filterDate?: string;
    filterMonth?: string;
    filterYear?: string;
    filterStatus?: string;
    onlyLate?: boolean;
    onlyAbsent?: boolean;
    onlyOvertime?: boolean;
    onlyMissingCheckout?: boolean;
    onlyNeedsAttention?: boolean;
    onlyHighPerformance?: boolean;
    activeTab?: 'daily' | 'monthly-performance';
  } | null;
  onClearInitialFilters?: () => void;
}

export function ReportView({ employees, attendance, initialFilters, onClearInitialFilters }: ReportViewProps) {
  // Navigation tabs
  const [activeSubTab, setActiveSubTab] = useState<'daily' | 'monthly-performance'>('daily');

  // Broad filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDept, setSelectedDept] = useState('All');
  const [filterEmpId, setFilterEmpId] = useState('All');
  
  // Custom dates inputs
  const [filterDate, setFilterDate] = useState('');
  const [filterMonth, setFilterMonth] = useState('06'); // June default
  const [filterYear, setFilterYear] = useState('2026');
  
  // Date range filters
  const [startDateStr, setStartDateStr] = useState('');
  const [endDateStr, setEndDateStr] = useState('');

  // Status check filters
  const [filterStatus, setFilterStatus] = useState('All');

  // Specific condition checkboxes
  const [onlyLate, setOnlyLate] = useState(false);
  const [onlyAbsent, setOnlyAbsent] = useState(false);
  const [onlyOvertime, setOnlyOvertime] = useState(false);
  const [onlyMissingCheckout, setOnlyMissingCheckout] = useState(false);
  const [onlyNeedsAttention, setOnlyNeedsAttention] = useState(false);
  const [onlyHighPerformance, setOnlyHighPerformance] = useState(false);
  const [filterShortHoursOnly, setFilterShortHoursOnly] = useState(false);

  // Selected employee for the monthly performance detail/late view
  const [selectedMonthlyEmpId, setSelectedMonthlyEmpId] = useState<string | null>(null);

  // Capture outer dashboard deep-linking filter events
  React.useEffect(() => {
    if (initialFilters) {
      if (initialFilters.activeTab) {
        setActiveSubTab(initialFilters.activeTab);
      }
      setSearchQuery(initialFilters.searchQuery ?? '');
      setSelectedDept(initialFilters.selectedDept ?? 'All');
      setFilterEmpId(initialFilters.filterEmpId ?? 'All');
      setFilterDate(initialFilters.filterDate ?? '');
      if (initialFilters.filterMonth) setFilterMonth(initialFilters.filterMonth);
      if (initialFilters.filterYear) setFilterYear(initialFilters.filterYear);
      setFilterStatus(initialFilters.filterStatus ?? 'All');
      setOnlyLate(initialFilters.onlyLate ?? false);
      setOnlyAbsent(initialFilters.onlyAbsent ?? false);
      setOnlyOvertime(initialFilters.onlyOvertime ?? false);
      setOnlyMissingCheckout(initialFilters.onlyMissingCheckout ?? false);
      setOnlyNeedsAttention(initialFilters.onlyNeedsAttention ?? false);
      setOnlyHighPerformance(initialFilters.onlyHighPerformance ?? false);

      if (initialFilters.filterEmpId && initialFilters.filterEmpId !== 'All') {
        setSelectedMonthlyEmpId(initialFilters.filterEmpId);
      }
      
      onClearInitialFilters?.();
    }
  }, [initialFilters, onClearInitialFilters]);

  // Departments list
  const departments = useMemo(() => {
    const list = new Set(employees.map(e => e.department || e.department_name).filter(Boolean));
    return ['All', ...Array.from(list)];
  }, [employees]);

  // Daily records list calculation
  const filteredDailyData = useMemo(() => {
    return attendance.filter(record => {
      // Find associated employee info
      const emp = employees.find(e => e.id === record.employee_id || e.employee_code === record.employee_id);
      if (!emp || emp.is_deleted) return false;

      // 1. Employee name/code Search
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const nameMatch = (emp.name || emp.employee_name || '').toLowerCase().includes(query);
        const codeMatch = (emp.employee_code || emp.id || '').toLowerCase().includes(query);
        if (!nameMatch && !codeMatch) return false;
      }

      // 2. Department
      if (selectedDept !== 'All' && emp.department !== selectedDept && emp.department_name !== selectedDept) {
        return false;
      }

      // 3. Specific Employee
      if (filterEmpId !== 'All' && record.employee_id !== filterEmpId) {
        return false;
      }

      // 4. Exact Single Date
      if (filterDate && record.date !== filterDate) {
        return false;
      }

      // 5. Month matching split index
      if (filterMonth && !filterDate) {
        const [, m] = record.date.split('-'); // ["YYYY", "MM", "DD"]
        if (m !== filterMonth) return false;
      }

      // 6. Year matching
      if (filterYear && !filterDate) {
        const [y] = record.date.split('-');
        if (y !== filterYear) return false;
      }

      // 7. Date Range Filter
      if (startDateStr && record.date < startDateStr) return false;
      if (endDateStr && record.date > endDateStr) return false;

      // 8. Status match (compatibility for local vs supabase values)
      if (filterStatus !== 'All') {
        if (filterStatus === 'Missing Checkout') {
          if (record.check_out || !record.check_in) return false;
        } else if (record.status !== filterStatus) {
          return false;
        }
      }

      // 9. Late condition
      if (onlyLate && record.late_minutes <= 0) {
        return false;
      }

      // 10. Absent condition
      if (onlyAbsent && record.status !== 'Absent') {
        return false;
      }

      // 11. Overtime condition
      if (onlyOvertime && record.overtime_hours <= 0) {
        return false;
      }

      // 12. Missing checkout condition
      if (onlyMissingCheckout && (!record.check_in || record.check_out)) {
        return false;
      }

      return true;
    });
  }, [attendance, employees, searchQuery, selectedDept, filterEmpId, filterDate, filterMonth, filterYear, startDateStr, endDateStr, filterStatus, onlyLate, onlyAbsent, onlyOvertime, onlyMissingCheckout]);

      // Aggregate monthly performance summary formulas for each worker
  const monthlySummaries = useMemo(() => {
    const targetMonth = filterMonth || '06';
    const targetYear = filterYear || '2026';

    return employees.filter(e => !e.is_deleted).map(emp => {
      // Find all matching logs inside selected month-year Range
      const logs = attendance.filter(a => {
        if (a.employee_id !== emp.id && a.employee_id !== emp.employee_code) return false;
        if (a.is_deleted) return false;

        const [y, m] = a.date.split('-');
        return m === targetMonth && y === targetYear;
      });

      // Count core worksheet stats
      const present_days = logs.filter(l => l.status === 'Present').length;
      const half_days = logs.filter(l => l.status === 'Half-Day').length;
      const absent_days = logs.filter(l => l.status === 'Absent').length;
      const leave_days = logs.filter(l => l.status === 'Leave').length;
      const off_days = logs.filter(l => l.status === 'Off').length;

      // Late days (minutes > 0)
      const late_days_count = logs.filter(l => l.late_minutes > 0 && l.status !== 'Absent' && l.status !== 'Leave' && l.status !== 'Off').length;

      // Missing checkouts
      const missing_checkout_count = logs.filter(l => l.status === 'Missing Checkout' || (!l.check_out && l.check_in)).length;

      // Net working hours sum
      const total_net_hours = logs.reduce((sum, l) => sum + (l.net_hours || 0), 0);

      // Expected working days (Present + Half-day + Absent + Missing Checkout)
      const working_days = present_days + half_days + absent_days + missing_checkout_count;

      // Required hours based on individual shifts of logged non-leave/off days
      const required_hours = logs.reduce((sum, l) => {
        if (l.status === 'Leave' || l.status === 'Off') return sum;
        return sum + (isFriday(l.date) ? 7.0 : 10.0);
      }, 0);

      // Short hours - sum of daily short hours
      const short_hours = logs.reduce((sum, l) => {
        if (l.short_hours !== undefined) return sum + (l.short_hours || 0);
        const isFri = isFriday(l.date);
        const req = isFri ? 7.0 : 10.0;
        const tol = isFri ? 6.5 : 9.5;
        if (l.net_hours > 0 && l.net_hours < tol) {
          return sum + parseFloat((req - l.net_hours).toFixed(2));
        }
        return sum;
      }, 0);

      // Overtime hours - sum of daily overtime hours
      const overtime_hours = logs.reduce((sum, l) => {
        if (l.overtime_hours !== undefined) return sum + (l.overtime_hours || 0);
        const isFri = isFriday(l.date);
        const req = isFri ? 7.0 : 10.0;
        return sum + Math.max(0, (l.net_hours || 0) - req);
      }, 0);

      // Average daily active working hours
      const divisor = present_days + half_days;
      const average_daily_hours = divisor > 0 ? parseFloat((total_net_hours / divisor).toFixed(2)) : 0;

      // Performance score and remarks
      const scoreResult = calculatePerformanceScore(logs.map(l => ({
        status: l.status || '',
        late_minutes: l.late_minutes || 0,
        net_hours: l.net_hours || 0,
        overtime_hours: l.overtime_hours || 0
      })));
      const score = scoreResult.score;
      const remarks = scoreResult.remarks;

      return {
        id: emp.id,
        code: emp.employee_code || emp.id,
        name: emp.name || emp.employee_name || '',
        department: emp.department || emp.department_name || 'Stitching',
        designation: emp.designation || 'Master Stitcher',
        salary: emp.salary || emp.base_salary || 0,
        working_days,
        present_days: present_days + half_days,
        absent_days,
        leave_days,
        off_days,
        late_days_count,
        missing_checkout_count,
        total_net_hours: parseFloat(total_net_hours.toFixed(2)),
        required_hours,
        short_hours: parseFloat(short_hours.toFixed(2)),
        overtime_hours: parseFloat(overtime_hours.toFixed(2)),
        average_daily_hours,
        performance_score: score,
        remarks,
        logs
      };
    });
  }, [employees, attendance, filterMonth, filterYear]);

  // Filtered monthly summary list
  const filteredMonthlySummaries = useMemo(() => {
    return monthlySummaries.filter(item => {
      // 1. Search Query (name or code)
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const nameMatch = item.name.toLowerCase().includes(query);
        const codeMatch = item.code.toLowerCase().includes(query);
        if (!nameMatch && !codeMatch) return false;
      }

      // 2. Department Filter
      if (selectedDept !== 'All' && item.department !== selectedDept) {
        return false;
      }

      // 3. Employee selector
      if (filterEmpId !== 'All' && item.id !== filterEmpId) {
        return false;
      }

      // 4. Date range filter on child logs
      if (startDateStr || endDateStr) {
        const hasLogInRange = item.logs.some(l => {
          if (startDateStr && l.date < startDateStr) return false;
          if (endDateStr && l.date > endDateStr) return false;
          return true;
        });
        if (!hasLogInRange && item.logs.length > 0) return false;
      }

      // 5. Status specific sub-filters
      if (onlyLate && item.late_days_count === 0) return false;
      if (onlyAbsent && item.absent_days === 0) return false;
      if (onlyOvertime && item.overtime_hours === 0) return false;
      if (onlyMissingCheckout && item.missing_checkout_count === 0) return false;
      if (filterShortHoursOnly && item.short_hours === 0) return false;
      if (onlyNeedsAttention && item.performance_score >= 80) return false;
      if (onlyHighPerformance && item.performance_score < 90) return false;

      return true;
    });
  }, [monthlySummaries, searchQuery, selectedDept, filterEmpId, startDateStr, endDateStr, onlyLate, onlyAbsent, onlyOvertime, onlyMissingCheckout, filterShortHoursOnly, onlyNeedsAttention, onlyHighPerformance]);

  // Currently focused employee metrics for Late details
  const activeMonthlyEmpDetail = useMemo(() => {
    if (!selectedMonthlyEmpId) return null;
    return monthlySummaries.find(m => m.id === selectedMonthlyEmpId) || null;
  }, [monthlySummaries, selectedMonthlyEmpId]);

  // Days in that focused detail where late occurred
  const lateDetails = useMemo(() => {
    if (!activeMonthlyEmpDetail) return [];
    
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    
    return activeMonthlyEmpDetail.logs
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
      .sort((a, b) => b.date.localeCompare(a.date)); // descending dates
  }, [activeMonthlyEmpDetail]);

  // Statistics calculation for the current active sub-tab view
  const stats = useMemo(() => {
    if (activeSubTab === 'daily') {
      const records = filteredDailyData;
      const presents = records.filter(r => r.status === 'Present').length;
      const halfDays = records.filter(r => r.status === 'Half-Day').length;
      const absents = records.filter(r => r.status === 'Absent').length;
      const unclosed = records.filter(r => !r.check_out && r.check_in).length;
      const overtime = records.reduce((sum, r) => sum + (r.overtime_hours || 0), 0);
      const lates = records.filter(r => r.late_minutes > 0 && r.status !== 'Absent').length;

      return {
        total: records.length,
        presents,
        halfDays,
        absents,
        unclosed,
        overtime,
        lates
      };
    } else {
      const summaries = filteredMonthlySummaries;
      const totalStaff = summaries.length;
      const avgScore = totalStaff > 0 ? Math.round(summaries.reduce((sum, s) => sum + s.performance_score, 0) / totalStaff) : 100;
      const totalLatesMonth = summaries.reduce((sum, s) => sum + s.late_days_count, 0);
      const totalOvertimeMonth = summaries.reduce((sum, s) => sum + s.overtime_hours, 0);
      const needingAttention = summaries.filter(s => s.performance_score < 80).length;

      return {
        total: totalStaff,
        avgScore,
        totalLatesMonth,
        totalOvertimeMonth,
        needingAttention
      };
    }
  }, [activeSubTab, filteredDailyData, filteredMonthlySummaries]);

  // Clear all top filters helper
  const handleClearFilters = () => {
    setSearchQuery('');
    setSelectedDept('All');
    setFilterEmpId('All');
    setFilterDate('');
    setStartDateStr('');
    setEndDateStr('');
    setFilterStatus('All');
    setOnlyLate(false);
    setOnlyAbsent(false);
    setOnlyOvertime(false);
    setOnlyMissingCheckout(false);
    setOnlyNeedsAttention(false);
    setOnlyHighPerformance(false);
    setFilterShortHoursOnly(false);
  };

  // Trigger browser print
  const handleTriggerPrint = () => {
    window.print();
  };

  // CSV / Excel download logic for both Daily and Monthly tables
  const handleExportData = (isExcel: boolean) => {
    const activeM = filterMonth || '06';
    const activeY = filterYear || '2026';
    const filename = `alkali_${activeSubTab}_report_${activeY}_${activeM}`;

    if (activeSubTab === 'daily') {
      const headers = [
        'Staff ID',
        'Employee Name',
        'Department',
        'Date',
        'Check-In Time',
        'Check-Out Time',
        'Net Shift Hours',
        'Late Minutes',
        'Overtime Hours',
        'Status',
        'Remarks'
      ];

      const rows = filteredDailyData.map(record => {
        const emp = employees.find(e => e.id === record.employee_id || e.employee_code === record.employee_id);
        return [
          record.employee_id,
          emp ? emp.name || emp.employee_name : 'Unknown',
          emp ? emp.department || emp.department_name : 'Stitching',
          record.date,
          record.check_in || '-',
          record.check_out || '-',
          record.net_hours,
          record.late_minutes,
          record.overtime_hours,
          record.status,
          record.remarks || ''
        ];
      });

      if (isExcel) {
        downloadExcel(`${filename}.csv`, headers, rows);
      } else {
        downloadCSV(`${filename}.csv`, headers, rows);
      }
    } else {
      const headers = [
        'Employee Code',
        'Employee Name',
        'Department',
        'Expected Working Days',
        'Actual Present Days',
        'Absent Days',
        'Leave Days',
        'Weekly Off Days',
        'Late Days Count',
        'Missing Checkout Count',
        'Total Hours Worked',
        'Required Hours (Duty)',
        'Short Hours',
        'Overtime Hours Worked',
        'Avg Hours/Day',
        'Performance Score',
        'Auto Remarks'
      ];

      const rows = filteredMonthlySummaries.map(s => [
        s.code,
        s.name,
        s.department,
        s.working_days,
        s.present_days,
        s.absent_days,
        s.leave_days,
        s.off_days,
        s.late_days_count,
        s.missing_checkout_count,
        s.total_net_hours,
        s.required_hours,
        s.short_hours,
        s.overtime_hours,
        s.average_daily_hours,
        s.performance_score,
        s.remarks
      ]);

      if (isExcel) {
        downloadExcel(`${filename}.csv`, headers, rows);
      } else {
        downloadCSV(`${filename}.csv`, headers, rows);
      }
    }
  };

  return (
    <div id="report-view-container" className="space-y-6">
      
      {/* Interactive Tabs Menu */}
      <div className="flex border-b border-slate-200 no-print">
        <button
          onClick={() => { setActiveSubTab('daily'); setSelectedMonthlyEmpId(null); }}
          className={`px-5 py-3.5 font-bold text-xs select-none cursor-pointer transition-all border-b-2 flex items-center gap-2 ${
            activeSubTab === 'daily' 
              ? 'border-emerald-600 text-emerald-700 font-extrabold bg-emerald-50/20' 
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Layers className="h-4 w-4" />
          Day-by-Day Attendance Logs
        </button>
        <button
          onClick={() => setActiveSubTab('monthly-performance')}
          className={`px-5 py-3.5 font-bold text-xs select-none cursor-pointer transition-all border-b-2 flex items-center gap-2 ${
            activeSubTab === 'monthly-performance' 
              ? 'border-emerald-600 text-emerald-700 font-extrabold bg-emerald-50/20' 
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Award className="h-4 w-4" />
          Employee Monthly Performance Summary ({filterMonth}/{filterYear})
        </button>
      </div>

      {/* Main Filter Panel */}
      <div className="bg-white rounded-xl shadow-md border border-slate-200 p-5 space-y-4 no-print">
        <h4 className="font-bold text-slate-800 text-sm flex items-center gap-1.5 border-b pb-2.5 border-slate-100">
          <Filter className="h-4.5 w-4.5 text-emerald-600" />
          ERP Attendance Filtering Panel
        </h4>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          
          {/* Employee name query search */}
          <div>
            <label className="block text-[11px] font-bold text-slate-550 mb-1">Search Employee</label>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
              <input 
                type="text" 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Name or employee code..."
                className="w-full text-xs pl-8 pr-3 py-2 border border-slate-300 rounded-lg focus:ring-1 focus:ring-emerald-500 focus:outline-none bg-slate-50 font-medium"
              />
            </div>
          </div>

          {/* Department */}
          <div>
            <label className="block text-[11px] font-bold text-slate-550 mb-1">By Department</label>
            <select 
              value={selectedDept} 
              onChange={(e) => setSelectedDept(e.target.value)}
              className="w-full text-xs border border-slate-300 rounded-lg p-2 focus:ring-1 focus:ring-emerald-500 bg-slate-50"
            >
              {departments.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>

          {/* Individual Employee Selection */}
          <div>
            <label className="block text-[11px] font-bold text-slate-550 mb-1">By Specific Employee</label>
            <select
              value={filterEmpId}
              onChange={(e) => {
                setFilterEmpId(e.target.value);
                if (e.target.value !== 'All') {
                  setSelectedMonthlyEmpId(e.target.value);
                }
              }}
              className="w-full text-xs border border-slate-300 rounded-lg p-2 focus:ring-1 focus:ring-emerald-500 bg-slate-50"
            >
              <option value="All">All Staff Roster</option>
              {employees.filter(e => !e.is_deleted).map(emp => (
                <option key={emp.id} value={emp.id}>{emp.name || emp.employee_name} ({emp.employee_code || emp.id})</option>
              ))}
            </select>
          </div>

          {/* Single Target Date */}
          <div>
            <label className="block text-[11px] font-bold text-slate-550 mb-1">Specific Target Date</label>
            <input 
              type="date" 
              value={filterDate}
              onChange={(e) => setFilterDate(e.target.value)}
              disabled={activeSubTab === 'monthly-performance'}
              className="w-full text-xs border border-slate-300 rounded-lg p-2 focus:ring-1 focus:ring-emerald-500 bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
            />
          </div>

          {/* Filter Month */}
          <div>
            <label className="block text-[11px] font-bold text-slate-550 mb-1">Performance Month</label>
            <select
              value={filterMonth}
              onChange={(e) => setFilterMonth(e.target.value)}
              className="w-full text-xs border border-slate-300 rounded-lg p-2 focus:ring-1 focus:ring-emerald-500 bg-slate-50 font-semibold"
            >
              <option value="01">01 - January</option>
              <option value="02">02 - February</option>
              <option value="03">03 - March</option>
              <option value="04">04 - April</option>
              <option value="05">05 - May</option>
              <option value="06">06 - June</option>
              <option value="07">07 - July</option>
              <option value="08">08 - August</option>
              <option value="09">09 - September</option>
              <option value="10">10 - October</option>
              <option value="11">11 - November</option>
              <option value="12">12 - December</option>
            </select>
          </div>

          {/* Filter Year */}
          <div>
            <label className="block text-[11px] font-bold text-slate-550 mb-1">Performance Year</label>
            <select
              value={filterYear}
              onChange={(e) => setFilterYear(e.target.value)}
              className="w-full text-xs border border-slate-300 rounded-lg p-2 focus:ring-1 focus:ring-emerald-500 bg-slate-50"
            >
              <option value="2025">2025</option>
              <option value="2026">2026</option>
              <option value="2027">2027</option>
            </select>
          </div>

          {/* Custom Date Range from */}
          <div>
            <label className="block text-[11px] font-bold text-slate-550 mb-1">Date Range: From</label>
            <input 
              type="date" 
              value={startDateStr}
              onChange={(e) => setStartDateStr(e.target.value)}
              className="w-full text-xs border border-slate-300 rounded-lg p-2 focus:ring-1 focus:ring-emerald-500 bg-slate-50"
            />
          </div>

          {/* Custom Date Range to */}
          <div>
            <label className="block text-[11px] font-bold text-slate-550 mb-1">Date Range: To</label>
            <input 
              type="date" 
              value={endDateStr}
              onChange={(e) => setEndDateStr(e.target.value)}
              className="w-full text-xs border border-slate-300 rounded-lg p-2 focus:ring-1 focus:ring-emerald-500 bg-slate-50"
            />
          </div>

          {/* Workday status selector */}
          {activeSubTab === 'daily' && (
            <div>
              <label className="block text-[11px] font-bold text-slate-550 mb-1">By Attendance Status</label>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="w-full text-xs border border-slate-300 rounded-lg p-2 focus:ring-1 focus:ring-emerald-500 bg-slate-50"
              >
                <option value="All">All Statuses</option>
                <option value="Present">Present (Full Day)</option>
                <option value="Half-Day">Half-Day (5-9.99 Hours)</option>
                <option value="Absent">Absent (&lt;5 Hours)</option>
                <option value="Leave">On Leave</option>
                <option value="Off">Weekly Off</option>
                <option value="Missing Checkout">Missing Checkouts</option>
              </select>
            </div>
          )}

        </div>

        {/* Binary Selector Checkboxes */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 border-t pt-4 border-slate-100">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input 
              type="checkbox" 
              checked={onlyLate} 
              onChange={() => setOnlyLate(!onlyLate)}
              className="rounded text-emerald-600 focus:ring-emerald-500 h-4 w-4" 
            />
            <span className="text-xs text-slate-650 font-medium font-bold text-slate-700">⚠️ Late Arrivals &gt; 0m</span>
          </label>

          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input 
              type="checkbox" 
              checked={onlyAbsent} 
              onChange={() => setOnlyAbsent(!onlyAbsent)}
              className="rounded text-emerald-600 focus:ring-emerald-500 h-4 w-4" 
            />
            <span className="text-xs text-slate-650 font-medium text-rose-600 font-bold">❌ Absents Registered</span>
          </label>

          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input 
              type="checkbox" 
              checked={onlyOvertime} 
              onChange={() => setOnlyOvertime(!onlyOvertime)}
              className="rounded text-emerald-600 focus:ring-emerald-500 h-4 w-4" 
            />
            <span className="text-xs text-slate-650 font-medium text-violet-650 font-bold">⚡ Overtime Achieved</span>
          </label>

          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input 
              type="checkbox" 
              checked={onlyMissingCheckout} 
              onChange={() => setOnlyMissingCheckout(!onlyMissingCheckout)}
              className="rounded text-emerald-600 focus:ring-emerald-500 h-4 w-4" 
            />
            <span className="text-xs text-slate-650 font-medium text-amber-600 font-bold">🕰️ Missing Checkouts</span>
          </label>

          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input 
              type="checkbox" 
              checked={filterShortHoursOnly} 
              onChange={() => setFilterShortHoursOnly(!filterShortHoursOnly)}
              className="rounded text-emerald-600 focus:ring-emerald-500 h-4 w-4" 
            />
            <span className="text-xs text-slate-650 font-medium text-amber-700">📉 Short Hours (&lt;10h)</span>
          </label>

          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input 
              type="checkbox" 
              checked={onlyNeedsAttention} 
              onChange={() => setOnlyNeedsAttention(!onlyNeedsAttention)}
              className="rounded text-emerald-600 focus:ring-emerald-500 h-4 w-4" 
            />
            <span className="text-xs text-slate-650 font-bold text-red-500">📉 Needing Attention (&lt;80 Score)</span>
          </label>

          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input 
              type="checkbox" 
              checked={onlyHighPerformance} 
              onChange={() => setOnlyHighPerformance(!onlyHighPerformance)}
              className="rounded text-emerald-600 focus:ring-emerald-500 h-4 w-4" 
            />
            <span className="text-xs text-slate-650 font-bold text-teal-600">🏆 Top Punctual (&gt;90 Score)</span>
          </label>

          <div className="flex items-end justify-end">
            <button
              onClick={handleClearFilters}
              className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[11px] py-1 px-3 border border-slate-250 rounded transition-all cursor-pointer"
            >
              Clear All Rules
            </button>
          </div>
        </div>

      </div>

      {/* Visual Stat Summary blocks depending on active Sub-tab */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {activeSubTab === 'daily' ? (
          <>
            <div className="bg-white rounded-xl p-4 border border-slate-200">
              <span className="text-[10px] font-bold text-slate-450 uppercase tracking-wider block">Matching Log Records</span>
              <div className="text-2xl font-mono text-slate-800 font-bold mt-1">{stats.total}</div>
            </div>
            <div className="bg-white rounded-xl p-4 border border-slate-200">
              <span className="text-[10px] font-bold text-slate-450 uppercase tracking-wider block text-emerald-600">Full Shifts Logged</span>
              <div className="text-2xl font-mono text-emerald-600 font-bold mt-1">{stats.presents}</div>
            </div>
            <div className="bg-white rounded-xl p-4 border border-slate-200">
              <span className="text-[10px] font-bold text-slate-450 uppercase tracking-wider block text-amber-550 text-amber-600">Late arrivals</span>
              <div className="text-2xl font-mono text-amber-600 font-bold mt-1">{stats.lates}</div>
            </div>
            <div className="bg-white rounded-xl p-4 border border-slate-200">
              <span className="text-[10px] font-bold text-slate-450 uppercase tracking-wider block text-amber-700">Missing Checkouts</span>
              <div className="text-2xl font-mono text-amber-700 font-bold mt-1">{stats.unclosed}</div>
            </div>
          </>
        ) : (
          <>
            <div className="bg-white rounded-xl p-4 border border-slate-200">
              <span className="text-[10px] font-bold text-slate-450 uppercase tracking-wider block">Total Listed Staff</span>
              <div className="text-2xl font-mono text-slate-800 font-bold mt-1">{stats.total}</div>
            </div>
            <div className="bg-white rounded-xl p-4 border border-slate-200">
              <span className="text-[10px] font-bold text-slate-450 uppercase tracking-wider block text-violet-650">Avg. Punctuality Score</span>
              <div className="text-2xl font-mono text-violet-750 text-violet-700 font-bold mt-1">{stats.avgScore} / 100</div>
            </div>
            <div className="bg-white rounded-xl p-4 border border-slate-200">
              <span className="text-[10px] font-bold text-slate-450 uppercase tracking-wider block text-amber-600">Total Late Incidents</span>
              <div className="text-2xl font-mono text-amber-600 font-bold mt-1">{stats.totalLatesMonth} times</div>
            </div>
            <div className="bg-white rounded-xl p-4 border border-slate-200 text-rose-700 bg-rose-50/10">
              <span className="text-[10px] font-bold uppercase tracking-wider block text-rose-600">Critical (Score &lt;80)</span>
              <div className="text-2xl font-mono text-rose-700 font-bold mt-1">{stats.needingAttention} members</div>
            </div>
          </>
        )}
      </div>

      {/* Main Table output container */}
      <div className="bg-white rounded-xl shadow-md border border-slate-200 overflow-hidden print-area">
        
        {/* Document Header Panel */}
        <div className="p-5 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="text-emerald-700 font-bold text-xs uppercase tracking-widest leading-none mb-1">AL-KALI MANUFACTURE</div>
            <h3 className="text-slate-900 font-bold text-base flex items-center gap-1.5">
              <FileText className="h-5 w-5 text-emerald-600" />
              {activeSubTab === 'daily' 
                ? 'Central Synchronized Daily Attendance Sheet Logs' 
                : `Official Employee Monthly Performance Sheets (${filterMonth}/${filterYear})`
              }
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              {startDateStr || endDateStr 
                ? `Timeline range: From ${startDateStr || 'Initial'} To ${endDateStr || 'End'}` 
                : filterDate 
                  ? `Specific calendar date logged: ${filterDate}` 
                  : `Scope timeline: Month ${filterMonth}, ${filterYear}`
              }
              {selectedDept !== 'All' ? ` | Department division: ${selectedDept}` : ''}
              {filterEmpId !== 'All' ? ` | Selected worker: ${filterEmpId}` : ''}
            </p>
          </div>

          {/* PDF/CSV Download Buttons */}
          <div className="flex flex-wrap items-center gap-2 no-print">
            <button
              onClick={handleTriggerPrint}
              className="bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs px-3.5 py-2 rounded-lg flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              <Printer className="h-4 w-4" />
              Print / Save PDF
            </button>

            <button
              onClick={() => handleExportData(false)}
              className="bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 font-bold text-xs px-3.5 py-2 rounded-lg flex items-center gap-1.5 cursor-pointer transition-all"
            >
              <FileDown className="h-4 w-4" />
              Export CSV
            </button>

            <button
              onClick={() => handleExportData(true)}
              className="bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-200 font-bold text-xs px-3.5 py-2 rounded-lg flex items-center gap-1.5 cursor-pointer transition-all"
            >
              <FileSpreadsheet className="h-4 w-4" />
              Export Excel
            </button>
          </div>
        </div>

        {/* Tab 1: Daily logs */}
        {activeSubTab === 'daily' && (
          <div>
            {filteredDailyData.length === 0 ? (
              <div className="text-center py-16 text-slate-400 text-xs">
                <AlertCircle className="h-9 w-9 text-slate-350 mx-auto mb-2.5" />
                No daily dockets match your active parameters. Change filters above.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-100 font-bold text-slate-700 border-b border-slate-200">
                      <th className="p-3.5 border-r border-slate-200">Staff ID</th>
                      <th className="p-3.5 border-r border-slate-200">Employee Name</th>
                      <th className="p-3.5 border-r border-slate-200">Department</th>
                      <th className="p-2 border-r border-slate-200">Logged Date</th>
                      <th className="p-2 border-r border-slate-200 text-center">Check-In</th>
                      <th className="p-2 border-r border-slate-200 text-center">Check-Out</th>
                      <th className="p-2 border-r border-slate-200 text-center">Net Working Hours</th>
                      <th className="p-2 border-r border-slate-200 text-center">Late Minutes</th>
                      <th className="p-2 border-r border-slate-200 text-center">Overtime Hours</th>
                      <th className="p-3 border-r border-slate-200 text-center">Duty Status</th>
                      <th className="p-3">Logged Remarks</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                    {filteredDailyData.map((record) => {
                      const emp = employees.find(e => e.id === record.employee_id || e.employee_code === record.employee_id);
                      const isLate = record.late_minutes > 0;
                      const isUnclosed = !record.check_out && record.check_in;

                      return (
                        <tr key={record.id} className="hover:bg-slate-50">
                          <td className="p-3.5 border-r border-slate-200 font-bold text-slate-700">{record.employee_id}</td>
                          <td className="p-3.5 border-r border-slate-200 font-sans font-semibold text-slate-800">{emp ? emp.name || emp.employee_name : 'Roster Staff'}</td>
                          <td className="p-3.5 border-r border-slate-200 font-sans text-slate-550">{emp ? emp.department_name || emp.department : '-'}</td>
                          <td className="p-2 border-r border-slate-200 text-slate-600">{record.date}</td>
                          <td className="p-2 border-r border-slate-200 text-center text-slate-600">{formatTime(record.check_in || record.checkin_time || null)}</td>
                          <td className="p-2 border-r border-slate-200 text-center text-slate-600">{formatTime(record.check_out || record.checkout_time || null)}</td>
                          <td className="p-2 border-r border-slate-200 text-center font-bold text-slate-800">{record.net_hours} hrs</td>
                          <td className={`p-2 border-r border-slate-200 text-center font-bold ${isLate ? 'text-amber-600 bg-amber-50/40' : 'text-slate-400'}`}>
                            {record.late_minutes > 0 ? `${record.late_minutes} min` : '-'}
                          </td>
                          <td className={`p-2 border-r border-slate-200 text-center ${record.overtime_hours > 0 ? 'text-violet-650 font-bold bg-violet-50/20' : 'text-slate-400'}`}>
                            {record.overtime_hours > 0 ? `${record.overtime_hours} hrs` : '-'}
                          </td>
                          <td className="p-3 border-r border-slate-200 text-center font-sans font-bold">
                            <span className={`px-2 py-0.5 rounded text-[10px] ${
                              record.status === 'Present' ? 'bg-emerald-100 text-emerald-800' :
                              record.status === 'Half-Day' ? 'bg-sky-100 text-sky-800 animate-pulse' :
                              record.status === 'Absent' ? 'bg-rose-100 text-rose-800' :
                              record.status === 'Leave' ? 'bg-violet-100 text-violet-800' :
                              record.status === 'Off' ? 'bg-slate-100 text-slate-650' :
                              record.status === 'Missing Checkout' || isUnclosed ? 'bg-amber-100 text-amber-800' :
                              'bg-slate-100 text-slate-600'
                            }`}>
                              {record.status}
                            </span>
                          </td>
                          <td className="p-3 text-slate-550 font-sans italic truncate max-w-xs">{record.remarks || '-'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Monthly Performance & Scores (COMPLETE SUMMARY DETAIL) */}
        {activeSubTab === 'monthly-performance' && (
          <div>
            {filteredMonthlySummaries.length === 0 ? (
              <div className="text-center py-16 text-slate-400 text-xs">
                <AlertCircle className="h-9 w-9 text-slate-350 mx-auto mb-2.5" />
                No employee performance summaries match your selected filter criteria.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs select-none">
                  <thead>
                    <tr className="bg-slate-100 font-bold text-slate-700 border-b border-slate-200">
                      <th className="p-3 border-r border-slate-200">Staff Code</th>
                      <th className="p-3 border-r border-slate-200">Employee Name</th>
                      <th className="p-3 border-r border-slate-200">Department</th>
                      <th className="p-2 border-r border-slate-200 text-center" title="Total Days expected to work in this period">Duty Days</th>
                      <th className="p-2 border-r border-slate-200 text-center text-emerald-600 font-bold">Present</th>
                      <th className="p-2 border-r border-slate-200 text-center text-rose-600 font-bold">Absent</th>
                      <th className="p-2 border-r border-slate-200 text-center">Leave</th>
                      <th className="p-2 border-r border-slate-200 text-center">Off</th>
                      <th className="p-2 border-r border-slate-200 text-center text-amber-600">Late Days</th>
                      <th className="p-2 border-r border-slate-200 text-center text-red-500 font-bold">Mis. Ck</th>
                      <th className="p-2 border-r border-slate-200 text-center font-bold text-slate-800">Net Hours</th>
                      <th className="p-2 border-r border-slate-200 text-center" title="10 hours per expected working day">Req. Hours</th>
                      <th className="p-2 border-r border-slate-200 text-center text-amber-700">Short Hours</th>
                      <th className="p-2 border-r border-slate-200 text-center text-violet-600">Overtime</th>
                      <th className="p-2 border-r border-slate-200 text-center">Avg Hrs/Day</th>
                      <th className="p-3 border-r border-slate-200 text-center font-bold text-violet-750">Score</th>
                      <th className="p-3">Automated Remarks Summary</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                    {filteredMonthlySummaries.map((s) => {
                      const isSelected = selectedMonthlyEmpId === s.id;
                      
                      return (
                        <tr 
                          key={s.id} 
                          onClick={() => setSelectedMonthlyEmpId(isSelected ? null : s.id)}
                          className={`cursor-pointer transition-all ${
                            isSelected 
                              ? 'bg-emerald-50/40 hover:bg-emerald-50/60 font-semibold border-l-4 border-l-emerald-600' 
                              : 'hover:bg-slate-50'
                          }`}
                        >
                          <td className="p-3 border-r border-slate-200 font-bold text-slate-700 block flex items-center gap-1">
                            <ChevronDown className={`h-3 w-3 shrink-0 text-slate-400 transition-transform ${isSelected ? 'transform rotate-180 text-emerald-600' : ''}`} />
                            {s.code}
                          </td>
                          <td className="p-3 border-r border-slate-200 font-sans font-medium text-slate-800">{s.name}</td>
                          <td className="p-3 border-r border-slate-200 font-sans text-slate-550">{s.department}</td>
                          <td className="p-2 border-r border-slate-200 text-center font-bold">{s.working_days} d</td>
                          <td className="p-2 border-r border-slate-200 text-center text-emerald-650 font-bold text-emerald-600">{s.present_days} d</td>
                          <td className="p-2 border-r border-slate-200 text-center font-bold text-rose-600">{s.absent_days} d</td>
                          <td className="p-2 border-r border-slate-200 text-center text-slate-500">{s.leave_days}</td>
                          <td className="p-2 border-r border-slate-200 text-center text-slate-400">{s.off_days}</td>
                          <td className={`p-2 border-r border-slate-200 text-center font-bold ${s.late_days_count > 0 ? 'text-amber-600' : 'text-slate-400'}`}>
                            {s.late_days_count} d
                          </td>
                          <td className={`p-2 border-r border-slate-200 text-center font-bold ${s.missing_checkout_count > 0 ? 'text-red-500' : 'text-slate-400'}`}>
                            {s.missing_checkout_count}
                          </td>
                          <td className="p-2 border-r border-slate-200 text-center text-slate-800 font-bold">{s.total_net_hours} h</td>
                          <td className="p-2 border-r border-slate-200 text-center text-slate-455 text-slate-500">{s.required_hours} h</td>
                          <td className={`p-2 border-r border-slate-200 text-center font-semibold ${s.short_hours > 0 ? 'text-amber-700 bg-amber-50/20' : 'text-slate-400'}`}>
                            {s.short_hours} h
                          </td>
                          <td className={`p-2 border-r border-slate-200 text-center font-bold ${s.overtime_hours > 0 ? 'text-violet-600 bg-violet-50/10' : 'text-slate-450'}`}>
                            {s.overtime_hours > 0 ? `${s.overtime_hours} h` : '-'}
                          </td>
                          <td className="p-2 border-r border-slate-200 text-center">{s.average_daily_hours} h</td>
                          <td className="p-3 border-r border-slate-200 text-center font-sans font-bold">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold ${
                              s.performance_score >= 90 ? 'bg-emerald-100 text-emerald-800' :
                              s.performance_score >= 80 ? 'bg-teal-100 text-teal-850' :
                              s.performance_score >= 70 ? 'bg-amber-100 text-amber-800' :
                              'bg-rose-100 text-rose-800'
                            }`}>
                              {s.performance_score}
                            </span>
                          </td>
                          <td className="p-3 font-sans font-medium text-slate-700 flex items-center justify-between">
                            <span>{s.remarks}</span>
                            <span className="text-[10px] text-slate-400 font-mono no-print">Click to open raw logs & lates</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

      </div>

      {/* Expanded Employee Roster Score Card Details (LATE DETAIL VIEW) */}
      {activeSubTab === 'monthly-performance' && activeMonthlyEmpDetail && (
        <div className="bg-slate-900 text-white rounded-xl shadow-xl p-6 border border-slate-800 space-y-6">
          
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-800 pb-4">
            <div className="flex items-center gap-3">
              <Award className="h-6 w-6 text-emerald-400 animate-pulse" />
              <div>
                <span className="bg-slate-800 text-[10px] font-bold px-2 py-0.5 rounded text-slate-350 tracking-wider font-mono">
                  MEMBER ID: {activeMonthlyEmpDetail.code}
                </span>
                <h4 className="text-lg font-bold tracking-tight text-white mt-1">
                  Performance Docket: {activeMonthlyEmpDetail.name}
                </h4>
                <p className="text-xs text-slate-400 mt-0.5">
                  {activeMonthlyEmpDetail.designation} | {activeMonthlyEmpDetail.department} Branch Division
                </p>
              </div>
            </div>

            <button 
              onClick={() => setSelectedMonthlyEmpId(null)}
              className="text-slate-400 hover:text-white hover:bg-slate-800 p-1.5 rounded transition-colors"
              title="Close scorecard panel"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Sub-KPI blocks */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            
            <div className="bg-slate-850 p-3.5 rounded-lg border border-slate-800">
              <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block">Performance Rating Score</span>
              <strong className="text-2xl font-mono text-emerald-400 block mt-1">{activeMonthlyEmpDetail.performance_score} <span className="text-xs font-normal text-slate-450">/ 100</span></strong>
              <span className="text-[10px] text-slate-400 block mt-1 shrink-0">{activeMonthlyEmpDetail.remarks}</span>
            </div>

            <div className="bg-slate-850 p-3.5 rounded-lg border border-slate-800">
              <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block">Monthly Net Hours Worked</span>
              <strong className="text-2xl font-mono text-white block mt-1">{activeMonthlyEmpDetail.total_net_hours} hrs</strong>
              <span className="text-[10px] text-slate-400 block mt-1">Expected: {activeMonthlyEmpDetail.required_hours} hrs</span>
            </div>

            <div className="bg-slate-850 p-3.5 rounded-lg border border-slate-800">
              <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block text-amber-400">Total Short Hours Penalty</span>
              <strong className="text-2xl font-mono text-amber-400 block mt-1">{activeMonthlyEmpDetail.short_hours} hrs</strong>
              <span className="text-[10px] text-slate-400 block mt-1">Hours shortfall</span>
            </div>

            <div className="bg-slate-850 p-3.5 rounded-lg border border-slate-800">
              <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block text-indigo-400">Overtime hours logged</span>
              <strong className="text-2xl font-mono text-indigo-400 block mt-1">+{activeMonthlyEmpDetail.overtime_hours} hrs</strong>
              <span className="text-[10px] text-slate-400 block mt-1">Hrs above 10h/day shift</span>
            </div>

            <div className="bg-slate-850 p-3.5 rounded-lg border border-slate-800 col-span-2 md:col-span-1">
              <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block text-rose-400 font-semibold">Absents / Mis. Ck</span>
              <strong className="text-2xl font-mono text-rose-400 block mt-1">{activeMonthlyEmpDetail.absent_days} Abs / {activeMonthlyEmpDetail.missing_checkout_count} Mis</strong>
              <span className="text-[10px] text-slate-400 block mt-1">Leave: {activeMonthlyEmpDetail.leave_days} d | Off: {activeMonthlyEmpDetail.off_days} d</span>
            </div>

          </div>

          {/* Late Detail Table Section */}
          <div className="space-y-3">
            <div className="flex items-center gap-1.5 border-b border-slate-800 pb-2">
              <Clock className="h-4.5 w-4.5 text-amber-400Shrink" />
              <h5 className="font-bold text-xs uppercase tracking-wider text-slate-300">
                Punctuality Threshold audit logs ({activeMonthlyEmpDetail.late_days_count} late arrivals recorded)
              </h5>
            </div>

            {lateDetails.length === 0 ? (
              <p className="text-xs text-slate-500 italic py-4 bg-slate-850 p-4 rounded text-center border border-dashed border-slate-800">
                ⭐ Zero punctuality limit violations recorded for this worker in the selected calendar period! Outstanding discipline.
              </p>
            ) : (
              <div className="border border-slate-800 rounded-lg overflow-hidden bg-slate-850">
                <table className="w-full text-left border-collapse text-xs font-mono">
                  <thead>
                    <tr className="bg-slate-800 font-bold text-slate-350 border-b border-slate-750">
                      <th className="p-2.5">Date</th>
                      <th className="p-2.5">Day</th>
                      <th className="p-2.5 text-center">Check-In Time</th>
                      <th className="p-2.5 text-center">Late Limit Threshold</th>
                      <th className="p-2.5 text-center text-amber-450 text-amber-400 font-bold">Late minutes</th>
                      <th className="p-2.5 text-center">Check-Out</th>
                      <th className="p-2.5 text-center">Net shift Hours</th>
                      <th className="p-2.5 text-center">Duty Status</th>
                      <th className="p-2.5">Supervisor remarks</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 text-slate-300 text-[11px]">
                    {lateDetails.map((l) => (
                      <tr key={l.date} className="hover:bg-slate-800/65">
                        <td className="p-2.5 font-bold text-slate-200">{l.date}</td>
                        <td className="p-2.5 font-sans">{l.dayName}</td>
                        <td className="p-2.5 text-center text-slate-200">{formatTime(l.checkIn)}</td>
                        <td className="p-2.5 text-center text-slate-400 text-[10px]">{l.limit}</td>
                        <td className="p-2.5 text-center font-bold text-amber-400 bg-amber-500/10">
                          {l.lateMins} minutes
                        </td>
                        <td className="p-2.5 text-center text-slate-300">{formatTime(l.checkout)}</td>
                        <td className="p-2.5 text-center font-bold text-slate-200">{l.netHours} hrs</td>
                        <td className="p-2.5 text-center font-sans">
                          <span className="bg-amber-400/20 text-amber-300 px-1.5 py-0.5 rounded text-[9px] font-bold">
                            {l.status} (Late)
                          </span>
                        </td>
                        <td className="p-2.5 font-sans italic text-slate-400 text-[10px] truncate max-w-xs">{l.remarks || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

        </div>
      )}

    </div>
  );
}
