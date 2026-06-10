import React, { useState, useMemo } from 'react';
import { DbEmployee, DbAttendance } from '../supabaseClient';
import { 
  formatPKR, 
  formatTime, 
  downloadCSV, 
  downloadExcel,
  isFriday,
  calculatePerformanceScore,
  getManagerActionRecommendation
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
import { EmployeeLedger } from './EmployeeLedger';

interface ReportViewProps {
  employees: DbEmployee[];
  attendance: DbAttendance[];
  commissions?: any[];
  allowances?: any[];
  salaryReviews?: any[];
  ownerAdjustments?: any[];
  auditLogs?: any[];
  warnings?: any[];
  advances?: any[];
  recoveries?: any[];
  monthlySalaryData?: any[];
  onOpenQuickProfile?: (emp: DbEmployee) => void;
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
    activeTab?: 'staff-monthly-report' | 'daily' | 'monthly-performance' | 'ledger';
  } | null;
  onClearInitialFilters?: () => void;
  userRole?: string;
}

export function ReportView({ 
  employees, 
  attendance, 
  commissions = [], 
  allowances = [], 
  salaryReviews = [], 
  ownerAdjustments = [],
  auditLogs = [],
  warnings = [],
  advances = [],
  recoveries = [],
  monthlySalaryData = [],
  onOpenQuickProfile,
  userRole = 'staff_viewer',
  initialFilters, 
  onClearInitialFilters 
}: ReportViewProps) {
  // Navigation tabs
  const [activeSubTab, setActiveSubTab] = useState<'staff-monthly-report' | 'daily' | 'monthly-performance' | 'ledger' | 'comparison'>('staff-monthly-report');

  // Report Access View Mode
  const [reportRoleMode, setReportRoleMode] = useState<'owner' | 'staff'>(userRole === 'staff_viewer' ? 'staff' : 'owner');

  React.useEffect(() => {
    setReportRoleMode(userRole === 'staff_viewer' ? 'staff' : 'owner');
  }, [userRole]);

  // Month-to-Month comparison states
  const [compareEmpId, setCompareEmpId] = useState<string>('');
  const [compareCurrentMonth, setCompareCurrentMonth] = useState<string>('06');
  const [compareCurrentYear, setCompareCurrentYear] = useState<string>('2026');
  const [comparePrevMonth, setComparePrevMonth] = useState<string>('05');
  const [comparePrevYear, setComparePrevYear] = useState<string>('2026');

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

  // Comparison defaults setup
  const nonDeletedEmployeesForComparison = useMemo(() => employees.filter(e => !e.is_deleted), [employees]);
  React.useEffect(() => {
    if (nonDeletedEmployeesForComparison.length > 0 && !compareEmpId) {
      setCompareEmpId(nonDeletedEmployeesForComparison[0].id);
    }
  }, [nonDeletedEmployeesForComparison, compareEmpId]);

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
        overtime_hours: l.overtime_hours || 0,
        short_hours: l.short_hours || 0,
        manual_status: l.manual_status || 'Auto',
        date: l.date
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
        sunday_worked_days: scoreResult.breakdown.sundayWorkedCount || 0,
        sunday_worked_bonus: scoreResult.breakdown.sundayWorkedBonus || 0,
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

  // Comprehensive monthly ranking logic sorted by multiple strict business parameters
  const rankedEmployeesList = useMemo(() => {
    return [...filteredMonthlySummaries].sort((a, b) => {
      if (b.performance_score !== a.performance_score) {
        return b.performance_score - a.performance_score;
      }
      const attendanceA = a.working_days > 0 ? (a.present_days / a.working_days) : 0;
      const attendanceB = b.working_days > 0 ? (b.present_days / b.working_days) : 0;
      if (attendanceB !== attendanceA) {
        return attendanceB - attendanceA;
      }
      if (a.late_days_count !== b.late_days_count) {
        return a.late_days_count - b.late_days_count;
      }
      if (a.short_hours !== b.short_hours) {
        return a.short_hours - b.short_hours;
      }
      const sundayBonusA = a.sunday_worked_bonus || 0;
      const sundayBonusB = b.sunday_worked_bonus || 0;
      return sundayBonusB - sundayBonusA;
    });
  }, [filteredMonthlySummaries]);

  // Currently focused employee metrics for Late details
  const activeMonthlyEmpDetail = useMemo(() => {
    if (activeSubTab === 'staff-monthly-report') {
      const activeEmps = employees.filter(e => !e.is_deleted);
      const selectedId = filterEmpId === 'All' ? activeEmps[0]?.id : filterEmpId;
      if (!selectedId) return null;
      return monthlySummaries.find(m => m.id === selectedId) || null;
    }
    if (!selectedMonthlyEmpId) return null;
    return monthlySummaries.find(m => m.id === selectedMonthlyEmpId) || null;
  }, [monthlySummaries, selectedMonthlyEmpId, activeSubTab, filterEmpId, employees]);

  // Active selected employee in staff-monthly-report context
  const activeStaffReportEmployee = useMemo(() => {
    const activeEmps = employees.filter(e => !e.is_deleted);
    if (filterEmpId === 'All') {
      return activeEmps[0] || null;
    }
    return employees.find(e => e.id === filterEmpId) || null;
  }, [employees, filterEmpId]);

  // Performance score summary for active staff report employee
  const activeStaffSummary = useMemo(() => {
    if (!activeStaffReportEmployee) return null;
    return monthlySummaries.find(s => s.id === activeStaffReportEmployee.id) || null;
  }, [monthlySummaries, activeStaffReportEmployee]);

  // Salary row details for active staff report employee
  const activeStaffSalaryRow = useMemo(() => {
    if (!activeStaffReportEmployee || !monthlySalaryData) return null;
    return monthlySalaryData.find(row => (row.employee?.id === activeStaffReportEmployee.id || row.employee_id === activeStaffReportEmployee.id)) || null;
  }, [monthlySalaryData, activeStaffReportEmployee]);

  // Month-to-Month comparison calculation engine
  const comparisonResults = useMemo(() => {
    if (!compareEmpId) return null;
    
    const emp = employees.find(e => e.id === compareEmpId);
    if (!emp) return null;

    const getStatsForMonth = (mName: string, yName: string) => {
      const logs = attendance.filter(a => {
        if (a.employee_id !== emp.id && a.employee_id !== emp.employee_code) return false;
        if (a.is_deleted) return false;
        const [y, m] = a.date.split('-');
        return m === mName && y === yName;
      });

      const presents = logs.filter(l => l.status === 'Present').length;
      const halfDays = logs.filter(l => l.status === 'Half-Day').length;
      const leaves = logs.filter(l => l.status === 'Leave').length;
      const offs = logs.filter(l => l.status === 'Off').length;
      const absents = logs.filter(l => l.status === 'Absent').length;
      const missingCheckoutCount = logs.filter(l => l.status === 'Missing Checkout' || (!l.check_out && l.check_in)).length;
      
      const totalDays = presents + halfDays + leaves + offs + absents + missingCheckoutCount;
      const attendancePcnt = totalDays > 0 
        ? parseFloat((((presents + leaves + offs + (halfDays * 0.5)) / totalDays) * 100).toFixed(1)) 
        : 100;

      const scoreObj = calculatePerformanceScore(logs.map(l => ({
        status: l.status || '',
        late_minutes: l.late_minutes || 0,
        net_hours: l.net_hours || 0,
        overtime_hours: l.overtime_hours || 0,
        short_hours: l.short_hours || 0,
        manual_status: l.manual_status || 'Auto',
        date: l.date
      })));

      const monthComms = (commissions || []).filter(c => c.employee_id === emp.id && c.month === mName && c.year === yName && c.approved_by);
      const commissionCount = monthComms.length;

      return {
        performanceScore: scoreObj.score,
        attendancePercentage: attendancePcnt,
        lateDays: scoreObj.breakdown.lateCount,
        shortHourDays: scoreObj.breakdown.shortCount,
        missingCheckouts: scoreObj.breakdown.missingCheckoutCount,
        sundayWorkedDays: scoreObj.breakdown.sundayWorkedCount,
        commissionCount,
        logsCount: logs.length
      };
    };

    const currentStats = getStatsForMonth(compareCurrentMonth, compareCurrentYear);
    const prevStats = getStatsForMonth(comparePrevMonth, comparePrevYear);

    return {
      employee: emp,
      current: currentStats,
      previous: prevStats
    };
  }, [compareEmpId, compareCurrentMonth, compareCurrentYear, comparePrevMonth, comparePrevYear, employees, attendance, commissions]);

  const staffWarnings = useMemo(() => {
    if (!activeStaffReportEmployee) return [];
    return warnings.filter(w => w.employee_id === activeStaffReportEmployee.id);
  }, [warnings, activeStaffReportEmployee]);

  const staffAdvances = useMemo(() => {
    if (!activeStaffReportEmployee) return [];
    return advances.filter(a => a.employee_id === activeStaffReportEmployee.id && a.status === 'Approved');
  }, [advances, activeStaffReportEmployee]);

  const staffRecoveries = useMemo(() => {
    if (!activeStaffReportEmployee) return [];
    return recoveries.filter(r => r.employee_id === activeStaffReportEmployee.id);
  }, [recoveries, activeStaffReportEmployee]);

  const staffAdvanceBalance = useMemo(() => {
    const totalAdv = staffAdvances.reduce((sum, a) => sum + (a.advance_amount || 0), 0);
    const totalRec = staffRecoveries.reduce((sum, r) => sum + (r.recovery_amount || 0), 0);
    return Math.max(0, totalAdv - totalRec);
  }, [staffAdvances, staffRecoveries]);

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

  const absentDetails = useMemo(() => {
    if (!activeMonthlyEmpDetail) return [];
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return activeMonthlyEmpDetail.logs
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
  }, [activeMonthlyEmpDetail]);

  const missingCheckoutDetails = useMemo(() => {
    if (!activeMonthlyEmpDetail) return [];
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return activeMonthlyEmpDetail.logs
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
  }, [activeMonthlyEmpDetail]);

  const shortHoursDetails = useMemo(() => {
    if (!activeMonthlyEmpDetail) return [];
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return activeMonthlyEmpDetail.logs
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
    const filename = `kaprayofficial_${activeSubTab}_report_${activeY}_${activeM}`;

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
    } else if (activeSubTab === 'staff-monthly-report') {
      const headers = [
        'Staff ID (Code)',
        'Staff Name',
        'Department/Category',
        'Designation',
        'Expected Duty Days',
        'Present Days',
        'Absent Days',
        'Approved Leaves',
        'Weekly Offs',
        'Late Arrivals Count',
        'Missing Checkouts Count',
        'Total Active Hours Worked',
        'Performance Compliance Score',
        'Performance Grade',
        'Admin Performance Remarks'
      ];

      const rows = filteredMonthlySummaries.map(s => [
        s.code,
        s.name,
        s.department,
        s.designation,
        s.working_days,
        s.present_days,
        s.absent_days,
        s.leave_days,
        s.off_days,
        s.late_days_count,
        s.missing_checkout_count,
        s.total_net_hours,
        s.performance_score,
        s.performance_score >= 90 ? 'A+' : s.performance_score >= 75 ? 'B' : 'C',
        s.remarks
      ]);

      if (isExcel) {
        downloadExcel(`${filename}.csv`, headers, rows);
      } else {
        downloadCSV(`${filename}.csv`, headers, rows);
      }
    } else {
      const headers = [
        'Employee ID (Code)',
        'Employee Name',
        'Department/Category',
        'Designation',
        'Base Contract Salary (PKR)',
        'Expected Duty Days',
        'Present Days',
        'Absent Days',
        'Late arrivals Count',
        'Missing Checkouts Count',
        'Total Net Hours Worked',
        'Required duty Hours',
        'Total Short Hours Debt',
        'Total Overtime Hours Credit',
        'Performance compliance Score',
        'Performance Grade',
        'Admin Remarks'
      ];

      const rows = filteredMonthlySummaries.map(s => [
        s.code,
        s.name,
        s.department,
        s.designation,
        formatPKR(s.salary),
        s.working_days,
        s.present_days,
        s.absent_days,
        s.late_days_count,
        s.missing_checkout_count,
        s.total_net_hours,
        s.required_hours,
        s.short_hours,
        s.overtime_hours,
        s.performance_score,
        s.performance_score >= 90 ? 'A+' : s.performance_score >= 75 ? 'B' : 'C',
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
      
      {/* Interactive Tabs Menu and Access Mode Switch */}
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center border-b border-slate-200 no-print pb-2 xl:pb-0 gap-3">
        <div className="flex overflow-x-auto gap-0.5 w-full xl:w-auto">
          <button
            onClick={() => { setActiveSubTab('staff-monthly-report'); setSelectedMonthlyEmpId(null); }}
            className={`px-4 py-3 font-bold text-xs select-none cursor-pointer transition-all border-b-2 flex items-center gap-1.5 whitespace-nowrap ${
              activeSubTab === 'staff-monthly-report' 
                ? 'border-emerald-600 text-emerald-800 font-extrabold bg-emerald-50/20' 
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <FileText className="h-4 w-4 text-emerald-600" />
            ✨ Core Staff Monthly Report
          </button>
          <button
            onClick={() => { setActiveSubTab('daily'); setSelectedMonthlyEmpId(null); }}
            className={`px-4 py-3 font-bold text-xs select-none cursor-pointer transition-all border-b-2 flex items-center gap-1.5 whitespace-nowrap ${
              activeSubTab === 'daily' 
                ? 'border-emerald-600 text-emerald-800 font-extrabold bg-emerald-50/20' 
                : 'border-transparent text-slate-500 hover:text-slate-805'
            }`}
          >
            <Layers className="h-4 w-4 text-slate-505" />
            Day-by-Day Attendance Logs
          </button>
          <button
            onClick={() => { setActiveSubTab('monthly-performance'); setSelectedMonthlyEmpId(null); }}
            className={`px-4 py-3 font-bold text-xs select-none cursor-pointer transition-all border-b-2 flex items-center gap-1.5 whitespace-nowrap ${
              activeSubTab === 'monthly-performance' 
                ? 'border-emerald-600 text-emerald-800 font-extrabold bg-emerald-50/20' 
                : 'border-transparent text-slate-500 hover:text-slate-805'
            }`}
          >
            <Award className="h-4 w-4 text-slate-505" />
            Employee Monthly Performance Summary ({filterMonth}/{filterYear})
          </button>
          {userRole !== 'staff_viewer' && (
            <button
              onClick={() => { setActiveSubTab('ledger'); setSelectedMonthlyEmpId(null); }}
              className={`px-4 py-3 font-bold text-xs select-none cursor-pointer transition-all border-b-2 flex items-center gap-1.5 whitespace-nowrap ${
                activeSubTab === 'ledger' 
                  ? 'border-emerald-600 text-emerald-800 font-extrabold bg-emerald-50/20' 
                  : 'border-transparent text-slate-500 hover:text-slate-805'
              }`}
            >
              <FileSpreadsheet className="h-4 w-4 text-slate-505" />
              📖 Staff Individual Ledger Sheet (PKR base)
            </button>
          )}
          <button
            onClick={() => { setActiveSubTab('comparison'); setSelectedMonthlyEmpId(null); }}
            className={`px-4 py-3 font-bold text-xs select-none cursor-pointer transition-all border-b-2 flex items-center gap-1.5 whitespace-nowrap ${
              activeSubTab === 'comparison' 
                ? 'border-emerald-600 text-emerald-800 font-extrabold bg-emerald-50/20' 
                : 'border-transparent text-slate-500 hover:text-slate-805'
            }`}
          >
            <TrendingUp className="h-4 w-4 text-violet-600" />
            📊 Comparison
          </button>
        </div>

        {/* Global Access Mode Switch / Privacy Level */}
        <div className="flex items-center gap-2 px-4 py-1 xl:py-0 w-full xl:w-auto justify-end">
          <span className="text-[10px] uppercase tracking-wider font-extrabold text-slate-500">
            Report Access Mode:
          </span>
          <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-1">
            <button
              type="button"
              disabled={userRole === 'staff_viewer'}
              onClick={() => setReportRoleMode('owner')}
              className={`rounded-md px-2.5 py-1 text-[10px] font-bold uppercase transition-all tracking-wide cursor-pointer ${
                reportRoleMode === 'owner'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-505 hover:text-slate-800 disabled:opacity-50'
              }`}
            >
              Owner Portal
            </button>
            <button
              type="button"
              onClick={() => setReportRoleMode('staff')}
              className={`rounded-md px-2.5 py-1 text-[10px] font-bold uppercase transition-all tracking-wide cursor-pointer ${
                reportRoleMode === 'staff'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-505 hover:text-slate-800'
              }`}
            >
              Staff View
            </button>
          </div>
        </div>
      </div>

      {/* Main Filter Panel */}
      {activeSubTab !== 'ledger' && activeSubTab !== 'comparison' && (
        <div className="bg-white rounded-xl shadow-md border border-slate-200 p-5 space-y-4 no-print">
        <h4 className="font-bold text-slate-800 text-sm flex items-center gap-1.5 border-b pb-2.5 border-slate-100">
          <Filter className="h-4.5 w-4.5 text-emerald-600" />
          {activeSubTab === 'staff-monthly-report' ? 'Select Staff Report Parameters (Pristine View)' : 'ERP Attendance Filtering Panel'}
        </h4>

        {activeSubTab === 'staff-monthly-report' ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6 max-w-4xl">
            {/* Staff Selector */}
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-2">Select Employee / Staff Member</label>
              <select
                value={filterEmpId}
                onChange={(e) => setFilterEmpId(e.target.value)}
                className="w-full text-xs border border-slate-350 rounded-lg p-2.5 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 bg-slate-50 font-semibold text-slate-800 tracking-tight"
              >
                <option value="All">All Staff (Select below to focus)</option>
                {employees.filter(e => !e.is_deleted).map(emp => (
                  <option key={emp.id} value={emp.id}>
                    {emp.name || emp.employee_name} ({emp.employee_code || emp.id}) — {emp.department || 'Stitching'}
                  </option>
                ))}
              </select>
            </div>

            {/* Performance Month */}
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-2">Select Billing Month</label>
              <select
                value={filterMonth}
                onChange={(e) => setFilterMonth(e.target.value)}
                className="w-full text-xs border border-slate-350 rounded-lg p-2.5 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 bg-slate-50 font-semibold text-slate-800"
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

            {/* Performance Year */}
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-2">Select Year</label>
              <select
                value={filterYear}
                onChange={(e) => setFilterYear(e.target.value)}
                className="w-full text-xs border border-slate-350 rounded-lg p-2.5 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 bg-slate-50 font-semibold text-slate-800"
              >
                <option value="2025">2025</option>
                <option value="2026">2026</option>
                <option value="2027">2027</option>
              </select>
            </div>
          </div>
        ) : (
          <>
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
          </>
        )}

      </div>
      )}

      {/* Visual Stat Summary blocks depending on active Sub-tab */}
      {activeSubTab !== 'staff-monthly-report' && activeSubTab !== 'ledger' && activeSubTab !== 'comparison' && (
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
      )}

      {/* Main Table output container */}
      <div className="bg-white rounded-xl shadow-md border border-slate-200 overflow-hidden print-area">
        
        {/* Document Header Panel */}
        <div className="p-5 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="text-emerald-700 font-bold text-xs uppercase tracking-widest leading-none mb-1">KAPRAYOFFICIAL</div>
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

        {/* Tab 1.5: Core Staff Monthly Report */}
        {activeSubTab === 'staff-monthly-report' && (
          <div className="p-6 space-y-6 bg-slate-50/40">
             {!activeStaffReportEmployee ? (
               <div className="text-center py-16 text-slate-400 text-xs bg-white rounded-xl border border-slate-20 flex flex-col items-center justify-center">
                 <AlertCircle className="h-9 w-9 text-slate-350 mb-2.5" />
                 Please select an employee / staff member from the parameters above to load their pristine monthly docket.
               </div>
             ) : (
               <div className="space-y-6">
                 {/* Card 1: Employee Header Profile Card */}
                 <div className="bg-gradient-to-r from-emerald-700 to-teal-800 text-white rounded-xl p-6 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                   <div>
                     <span className="bg-emerald-900/60 font-mono text-[10px] uppercase font-bold tracking-wider px-2.5 py-1 rounded text-emerald-250">
                       Employee Code: {activeStaffReportEmployee.employee_code || activeStaffReportEmployee.id}
                     </span>
                     <h2 className="text-2xl font-black tracking-tight mt-2 text-white">{activeStaffReportEmployee.name || activeStaffReportEmployee.employee_name}</h2>
                     <p className="text-sm text-teal-100 flex items-center gap-1.5 mt-1 font-medium">
                       <span className="font-extrabold">{activeStaffReportEmployee.department || 'Stitching'}</span> Branch &bull; 
                       <span>{activeStaffReportEmployee.designation || 'Staff Worker'}</span>
                     </p>
                   </div>
                   <div className={`bg-white/10 backdrop-blur-md border border-white/20 p-4 rounded-xl text-right min-w-[200px] ${reportRoleMode === 'staff' ? 'hidden' : ''}`}>
                     <span className="text-[10px] uppercase text-teal-200 font-bold block tracking-wider">Salary Band Details</span>
                     <div className="text-xl font-bold font-mono tracking-tight text-white mt-1">
                       PKR {parseFloat(activeStaffReportEmployee.salary || activeStaffReportEmployee.basic_salary || '0').toLocaleString()}
                     </div>
                     <span className="text-[10px] text-teal-100 block mt-0.5">Base Monthly Salary (PKR)</span>
                   </div>
                 </div>

                 {/* Card 2: 3-Column Metrics Dashboard Grid */}
                 <div className={`grid grid-cols-1 gap-6 ${reportRoleMode === 'owner' ? 'md:grid-cols-3' : 'md:grid-cols-2'}`}>
                   {/* Column 2.1: Performance Rating Score Card */}
                   <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm space-y-3.5">
                     <div className="flex items-center justify-between border-b pb-2.5 border-slate-100">
                       <h4 className="font-bold text-xs uppercase text-slate-500 tracking-wider flex items-center gap-1.5">
                         <Award className="h-4.5 w-4.5 text-emerald-600" />
                         Discipline Rating
                       </h4>
                       <span className="text-[10px] font-mono text-slate-400">{filterMonth}/{filterYear} Summary</span>
                     </div>
                     {activeStaffSummary ? (
                       <div className="space-y-3">
                         <div className="flex items-baseline gap-1.5">
                           <span className="text-4xl font-extrabold font-mono text-slate-900">{activeStaffSummary.performance_score}</span>
                           <span className="text-sm font-semibold text-slate-450">/ 100</span>
                         </div>
                         <div className="text-xs font-bold text-slate-700 flex items-center gap-1.5 bg-slate-100 px-2.5 py-1 rounded w-fit">
                           <span>Remarks:</span>
                           <span className={activeStaffSummary.performance_score >= 90 ? 'text-emerald-700 font-extrabold' : activeStaffSummary.performance_score >= 80 ? 'text-emerald-800' : 'text-rose-600 font-extrabold'}>
                             {activeStaffSummary.remarks}
                           </span>
                         </div>
                         <div className="grid grid-cols-2 gap-2 pt-1 font-mono text-[11px] text-slate-600">
                           <div className="bg-slate-50 p-2 border border-slate-150 rounded">
                             <span className="block text-[8px] text-slate-400 font-bold uppercase">Present Days</span>
                             <strong className="text-slate-800 text-sm">{activeStaffSummary.present_days} / {activeStaffSummary.working_days}</strong>
                           </div>
                           <div className="bg-slate-50 p-2 border border-slate-150 rounded">
                             <span className="block text-[8px] text-slate-400 font-bold uppercase">Late Days</span>
                             <strong className="text-amber-600 text-sm">{activeStaffSummary.late_days_count}</strong>
                           </div>
                           <div className="bg-slate-50 p-2 border border-slate-150 rounded">
                             <span className="block text-[8px] text-slate-400 font-bold uppercase">Absent Days</span>
                             <strong className="text-rose-650 text-sm">{activeStaffSummary.absent_days}</strong>
                           </div>
                           <div className="bg-slate-50 p-2 border border-slate-150 rounded">
                             <span className="block text-[8px] text-slate-400 font-bold uppercase">Short Hours</span>
                             <strong className="text-amber-800 text-sm">{activeStaffSummary.short_hours} hrs</strong>
                           </div>
                         </div>
                       </div>
                     ) : (
                       <p className="text-xs text-slate-400 italic py-6 text-center">No performance score logs available for this cycle.</p>
                     )}
                   </div>

                   {/* Column 2.2: Salary Computation Ledger */}
                   <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm space-y-3.5">
                     <div className="flex items-center justify-between border-b pb-2.5 border-slate-100">
                       <h4 className="font-bold text-xs uppercase text-slate-500 tracking-wider flex items-center gap-1.5">
                         <FileText className="h-4.5 w-4.5 text-emerald-600" />
                         Salary &amp; Deductions
                       </h4>
                       <span className="bg-slate-200 text-slate-800 text-[9px] font-bold px-1.5 py-0.5 rounded font-mono">Calculated PKR</span>
                     </div>
                     {activeStaffSalaryRow && reportRoleMode === 'owner' ? (
                       <div className="space-y-1.5 text-xs text-slate-600">
                         <div className="flex justify-between py-1 border-b border-dashed border-slate-200">
                           <span>Basic Salary:</span>
                           <span className="font-mono font-bold text-slate-800">PKR {parseFloat(activeStaffSalaryRow.basic_salary || '0').toLocaleString()}</span>
                         </div>
                         <div className="flex justify-between py-1 border-b border-dashed border-slate-200">
                           <span className="text-emerald-700 font-semibold">Allowances Total:</span>
                           <span className="font-mono font-bold text-emerald-700">+PKR {parseFloat(activeStaffSalaryRow.allowances || '0').toLocaleString()}</span>
                         </div>
                         <div className="flex justify-between py-1 border-b border-dashed border-slate-200">
                           <span className="text-emerald-700 font-semibold">Overtime Pay:</span>
                           <span className="font-mono font-bold text-emerald-700">+PKR {parseFloat(activeStaffSalaryRow.overtime_pay || '0').toLocaleString()}</span>
                         </div>
                         <div className="flex justify-between py-1 border-b border-dashed border-slate-200">
                           <span className="text-rose-600">Late Deductions:</span>
                           <span className="font-mono font-bold text-rose-600">-PKR {parseFloat(activeStaffSalaryRow.late_deduction || '0').toLocaleString()}</span>
                         </div>
                         <div className="flex justify-between py-1 border-b border-dashed border-slate-200">
                           <span className="text-rose-600">Short Hrs Deductions:</span>
                           <span className="font-mono font-bold text-rose-600">-PKR {parseFloat(activeStaffSalaryRow.short_hours_deduction || '0').toLocaleString()}</span>
                         </div>
                         <div className="flex justify-between py-1.5 border-b border-slate-200 bg-emerald-50 px-2 rounded mt-2">
                           <strong className="text-slate-800 font-sans font-bold">Net Payout:</strong>
                           <strong className="font-mono text-emerald-800 text-sm font-black">PKR {parseFloat(activeStaffSalaryRow.net_salary || '0').toLocaleString()}</strong>
                         </div>
                       </div>
                     ) : (
                       <div className="space-y-4 py-3 text-center">
                         {reportRoleMode === 'staff' ? (
                            <>
                              <AlertCircle className="h-7 w-7 text-rose-500 mx-auto mb-2 animate-pulse" />
                              <p className="text-xs text-rose-700 font-bold">Salary &amp; pay ledger access is restricted on your profile.</p>
                            </>
                          ) : (
                            <p className="text-xs text-slate-400 italic">No formal payroll calculated for this month.</p>
                          )}
                         {reportRoleMode === 'staff' ? (
                            <p className="text-[10px] text-slate-500 leading-relaxed max-w-[240px] mx-auto mt-1">Please consult with an authorized supervisor or administrative manager if you require a physical certified copy.</p>
                          ) : (
                            <p className="text-[10px] text-slate-500 bg-slate-50 p-2.5 rounded border">Use the salary calculation panel to process active logs.</p>
                          )}
                       </div>
                     )}
                   </div>

                   {/* Column 2.3: Cash Advances & Compliance Records */}
                   <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm space-y-4">
                     {/* Advances Subsection */}
                     <div className="space-y-2">
                       <h5 className="font-bold text-[10px] uppercase text-slate-500 tracking-wider flex items-center justify-between border-b pb-1.5 border-slate-100">
                         <span className="flex items-center gap-1.5"><Clock className="h-4 w-4 text-amber-500" /> Advance Balance Ledger</span>
                         <span className={`px-1.5 py-0.5 rounded text-[9px] font-mono ${staffAdvanceBalance > 0 ? 'bg-amber-100 text-amber-800 font-extrabold' : 'bg-slate-100 text-slate-500'}`}>
                           {staffAdvanceBalance > 0 ? 'Outstanding' : 'No Balance'}
                         </span>
                       </h5>

                       <div className="grid grid-cols-3 gap-2 font-mono text-[10px] text-center">
                         <div className="p-1.5 bg-slate-50 rounded border border-slate-150">
                           <span className="block text-[8px] text-slate-400 uppercase font-bold">Approved</span>
                           <strong className="text-slate-700 text-xs font-bold">
                             {staffAdvances.reduce((sum, a) => sum + (a.advance_amount || 0), 0).toLocaleString()}
                           </strong>
                         </div>
                         <div className="p-1.5 bg-slate-50 rounded border border-slate-150">
                           <span className="block text-[8px] text-slate-400 uppercase font-bold">Recovered</span>
                           <strong className="text-slate-700 text-xs font-bold">
                             {staffRecoveries.reduce((sum, r) => sum + (r.recovery_amount || 0), 0).toLocaleString()}
                           </strong>
                         </div>
                         <div className="p-1.5 bg-amber-50/60 rounded border border-amber-200">
                           <span className="block text-[8px] text-amber-600 uppercase font-bold">Balance</span>
                           <strong className="text-amber-700 text-xs font-black">
                             {staffAdvanceBalance.toLocaleString()}
                           </strong>
                         </div>
                       </div>
                     </div>

                     {/* Warnings Subsection */}
                     <div className="space-y-2">
                       <h5 className="font-bold text-[10px] uppercase text-slate-500 tracking-wider flex items-center justify-between border-b pb-1.5 border-slate-100">
                         <span className="flex items-center gap-1.5"><AlertCircle className="h-4 w-4 text-rose-500" /> Compliance Records</span>
                         <span className={`px-1.5 py-0.5 rounded text-[9px] font-mono ${staffWarnings.length > 0 ? 'bg-rose-100 text-rose-800 font-extrabold' : 'bg-emerald-50 text-emerald-800 font-bold'}`}>
                           {staffWarnings.length > 0 ? `${staffWarnings.length} Warnings` : 'Perfect File'}
                         </span>
                       </h5>
                       
                       {staffWarnings.length > 0 ? (
                         <div className="space-y-1.5 max-h-[85px] overflow-y-auto pr-1">
                           {staffWarnings.map((w, index) => (
                             <div key={w.id || index} className="text-[10px] bg-amber-50/50 p-2 rounded border border-amber-200 flex items-start justify-between gap-1">
                               <div>
                                 <strong className="text-amber-800 font-bold block">{w.warning_type}</strong>
                                 <span className="text-slate-500 truncate max-w-[130px] block">{w.reason}</span>
                               </div>
                               <span className="text-[10px] text-slate-400 font-mono tracking-tight shrink-0">{w.date}</span>
                             </div>
                           ))}
                         </div>
                       ) : (
                         <p className="text-[10px] text-slate-400 italic text-center py-2 bg-slate-50 border rounded-lg">
                           Compliance records indicate an outstanding disciplinary standing.
                         </p>
                       )}
                     </div>
                   </div>
                 </div>

                 {/* Card 3: Detailed Calendar Log Table for the Filtered Month */}
                 <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                   <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex items-center justify-between">
                     <h4 className="font-extrabold text-xs text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                       <Layers className="h-4.5 w-4.5 text-emerald-600" />
                       Comprehensive Calendar Log Detail & Timeline Logs
                     </h4>
                     <span className="text-[10px] font-semibold text-slate-500 bg-white border px-2 py-0.5 rounded font-mono">
                       Roster: {activeStaffSummary?.logs.length || 0} workdays
                      </span>
                    </div>

                    {activeStaffSummary && activeStaffSummary.logs.length > 0 && (() => {
                      const reportAbsents = activeStaffSummary.logs.filter(l => l.status === 'Absent') || [];
                      const reportMissingCheckouts = activeStaffSummary.logs.filter(l => l.status === 'Missing Checkout' || (!l.check_out && l.check_in)) || [];
                      const reportShortHours = activeStaffSummary.logs.filter(l => {
                        const sHrs = l.short_hours !== undefined ? l.short_hours : 0;
                        return sHrs > 0 && l.status !== 'Absent' && l.status !== 'Leave' && l.status !== 'Off';
                      }) || [];
                      const reportLates = activeStaffSummary.logs.filter(l => l.late_minutes > 0 && l.status !== 'Absent' && l.status !== 'Leave' && l.status !== 'Off') || [];

                      return (
                        <div className="p-4 bg-rose-50/20 border-b border-slate-150 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 font-sans print:border">
                          <div className="p-2.5 bg-white border border-rose-250 rounded-lg shadow-[0_1px_2px_rgba(0,0,0,0.03)] opacity-100">
                            <span className="text-[9px] uppercase tracking-wider font-extrabold text-rose-700 block mb-1">✗ Absent Dates Summary</span>
                            {reportAbsents.length === 0 ? (
                              <span className="text-[10px] text-slate-400 italic">Zero absences recorded this period.</span>
                            ) : (
                              <div className="flex flex-wrap gap-1">
                                {reportAbsents.map(l => (
                                  <span key={l.date} className="px-1.5 py-0.5 rounded bg-rose-50 text-rose-705 font-mono text-[9px] font-bold border border-rose-100">{l.date}</span>
                                ))}
                              </div>
                            )}
                          </div>

                          <div className="p-2.5 bg-white border border-amber-250 rounded-lg shadow-[0_1px_2px_rgba(0,0,0,0.03)] opacity-100">
                            <span className="text-[9px] uppercase tracking-wider font-extrabold text-amber-850 block mb-1">🔍 Missing Checkout Dates</span>
                            {reportMissingCheckouts.length === 0 ? (
                              <span className="text-[10px] text-slate-400 italic">Zero missing checkouts recorded.</span>
                            ) : (
                              <div className="flex flex-wrap gap-1">
                                {reportMissingCheckouts.map(l => (
                                  <span key={l.date} className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 font-mono text-[9px] font-bold border border-amber-100">{l.date}</span>
                                ))}
                              </div>
                            )}
                          </div>

                          <div className="p-2.5 bg-white border border-orange-255 rounded-lg shadow-[0_1px_2px_rgba(0,0,0,0.03)] opacity-100">
                            <span className="text-[9px] uppercase tracking-wider font-extrabold text-orange-850 block mb-1">📉 Short Hours Schedule Shifts</span>
                            {reportShortHours.length === 0 ? (
                              <span className="text-[10px] text-slate-400 italic">Zero short hour shifts recorded.</span>
                            ) : (
                              <div className="flex flex-wrap gap-1">
                                {reportShortHours.map(l => (
                                  <span key={l.date} className="px-1.5 py-0.5 rounded bg-orange-50 text-orange-700 font-mono text-[9px] font-bold border border-orange-100" title={`${l.short_hours} hrs shortfall`}>{l.date} ({l.short_hours}h)</span>
                                ))}
                              </div>
                            )}
                          </div>

                          <div className="p-2.5 bg-white border border-slate-250 rounded-lg shadow-[0_1px_2px_rgba(0,0,0,0.03)] opacity-100">
                            <span className="text-[9px] uppercase tracking-wider font-extrabold text-slate-500 block mb-1">⏱️ Late Arrivals Clock-ins</span>
                            {reportLates.length === 0 ? (
                              <span className="text-[10px] text-slate-400 italic">Zero late arrivals this month.</span>
                            ) : (
                              <div className="flex flex-wrap gap-1 max-h-[60px] overflow-y-auto print:max-h-none">
                                {reportLates.map(l => (
                                  <span key={l.date} className="px-1.5 py-0.5 rounded bg-slate-50 text-slate-705 font-mono text-[9px] border border-slate-200" title={`${l.late_minutes} mins late`}>{l.date}</span>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })()}


                    {activeStaffSummary && (() => {
                      const scoreResult = calculatePerformanceScore(activeStaffSummary.logs.map(l => ({
                        status: l.status || '',
                        late_minutes: l.late_minutes || 0,
                        net_hours: l.net_hours || 0,
                        overtime_hours: l.overtime_hours || 0,
                        short_hours: l.short_hours || 0,
                        manual_status: l.manual_status || 'Auto',
                        date: l.date
                      })));
                      const b = scoreResult.breakdown;
                      
                      const reportAbsents = activeStaffSummary.logs.filter(l => l.status === 'Absent') || [];
                      const reportMissingCheckouts = activeStaffSummary.logs.logs ? activeStaffSummary.logs.filter(l => l.status === 'Missing Checkout' || (!l.check_out && l.check_in)) : activeStaffSummary.logs.filter(l => l.status === 'Missing Checkout' || (!l.check_out && l.check_in)) || [];
                      const reportShortHours = activeStaffSummary.logs.filter(l => {
                        const sHrs = l.short_hours !== undefined ? l.short_hours : 0;
                        return sHrs > 0 && l.status !== 'Absent' && l.status !== 'Leave' && l.status !== 'Off';
                      }) || [];
                      const reportLates = activeStaffSummary.logs.filter(l => l.late_minutes > 0 && l.status !== 'Absent' && l.status !== 'Leave' && l.status !== 'Off') || [];

                      const isLateMismatch = (b.lateCount || 0) !== reportLates.length;
                      const isAbsentMismatch = (b.absentCount || 0) !== reportAbsents.length;
                      const isMissingCheckoutMismatch = (b.missingCheckoutCount || 0) !== reportMissingCheckouts.length;
                      const isShortHoursMismatch = (b.shortCount || 0) !== reportShortHours.length;
                      const hasValidationMismatch = isLateMismatch || isAbsentMismatch || isMissingCheckoutMismatch || isShortHoursMismatch;

                      const netImpact = (b.absentPenalty || 0) + 
                                        (b.latePenalty || 0) + 
                                        (b.missingCheckoutPenalty || 0) + 
                                        (b.shortHoursPenalty || 0) + 
                                        (b.sundayWorkedBonus || 0) + 
                                        (b.perfectBonus || 0) + 
                                        (b.excellentBonus || 0);

                      return (
                        <div className="p-4 space-y-4 border-b border-slate-150 bg-slate-50/50">
                          {/* Integrity Warning */}
                          {hasValidationMismatch && (
                            <div id="integrity-warning-report" className="bg-amber-50 border-l-4 border-amber-500 p-4 rounded-r-xl shadow-xs text-amber-850 font-sans text-xs">
                              <div className="flex gap-2 items-center">
                                <AlertCircle className="h-5 w-5 text-amber-600 shrink-0" />
                                <div>
                                  <h6 className="font-extrabold uppercase tracking-wide text-amber-900">Performance Report Integrity Warning</h6>
                                  <p className="text-amber-805 mt-0.5 font-semibold">
                                    Summary counts do not match detailed records.
                                  </p>
                                  <div className="text-[10px] text-amber-700 font-mono mt-1 grid grid-cols-2 md:grid-cols-4 gap-2 border-t border-amber-200/50 pt-1.5">
                                    <span>Late Days: Summary {b.lateCount} vs Section {reportLates.length}</span>
                                    <span>Absent Days: Summary {b.absentCount} vs Section {reportAbsents.length}</span>
                                    <span>Missing Checkouts: Summary {b.missingCheckoutCount} vs Section {reportMissingCheckouts.length}</span>
                                    <span>Short Hours: Summary {b.shortCount} vs Section {reportShortHours.length}</span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* Performance Impact Summary */}
                            <div id="performance-impact-summary-report" className="bg-white border border-slate-200 rounded-xl p-5 space-y-4 font-sans">
                              <div className="flex justify-between items-center border-b pb-2 border-slate-200">
                                <h5 className="font-extrabold text-slate-800 text-xs uppercase tracking-wider flex items-center gap-1.5">
                                  <Award className="h-4.5 w-4.5 text-indigo-600" />
                                  Performance Impact Summary
                                </h5>
                                <span className="text-[9px] font-bold text-indigo-750 bg-indigo-50 border border-indigo-150 rounded px-2 py-0.5 uppercase">Audit Verification</span>
                              </div>

                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs text-slate-600">
                                <div className="space-y-3">
                                  <div className="flex justify-between items-center border-b border-slate-100 pb-1.5">
                                    <div>
                                      <span className="font-bold text-slate-700 block">Absent Penalty</span>
                                      <span className="text-[10px] text-slate-400">Absent Days: {b.absentCount}</span>
                                    </div>
                                    <span className={`font-mono font-extrabold ${b.absentPenalty < 0 ? 'text-rose-600' : 'text-slate-400'}`}>
                                      {b.absentPenalty < 0 ? `${b.absentPenalty}` : '0'}
                                    </span>
                                  </div>

                                  <div className="flex justify-between items-center border-b border-slate-100 pb-1.5">
                                    <div>
                                      <span className="font-bold text-slate-700 block">Late Penalty</span>
                                      <span className="text-[10px] text-slate-400">Late Days: {b.lateCount}</span>
                                    </div>
                                    <span className={`font-mono font-extrabold ${b.latePenalty < 0 ? 'text-rose-600' : 'text-slate-400'}`}>
                                      {b.latePenalty < 0 ? `${b.latePenalty}` : '0'}
                                    </span>
                                  </div>

                                  <div className="flex justify-between items-center border-b border-slate-100 pb-1.5">
                                    <div>
                                      <span className="font-bold text-slate-700 block">Missing Checkout Penalty</span>
                                      <span className="text-[10px] text-slate-400">Missing Checkout: {b.missingCheckoutCount}</span>
                                    </div>
                                    <span className={`font-mono font-extrabold ${b.missingCheckoutPenalty < 0 ? 'text-rose-600' : 'text-slate-400'}`}>
                                      {b.missingCheckoutPenalty < 0 ? `${b.missingCheckoutPenalty}` : '0'}
                                    </span>
                                  </div>

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
                                  <div className="flex justify-between items-center border-b border-slate-100 pb-1.5">
                                    <div>
                                      <span className="font-bold text-emerald-800 block">Sunday Worked Bonus</span>
                                      <span className="text-[10px] text-slate-400">Sunday Worked: {b.sundayWorkedCount}</span>
                                    </div>
                                    <span className={`font-mono font-extrabold ${b.sundayWorkedBonus > 0 ? 'text-emerald-600' : 'text-slate-400'}`}>
                                      {b.sundayWorkedBonus > 0 ? `+${b.sundayWorkedBonus}` : '0'}
                                    </span>
                                  </div>

                                  <div className="flex justify-between items-center border-b border-slate-100 pb-1.5">
                                    <div>
                                      <span className="font-bold text-emerald-800 block">Perfect Attendance Bonus</span>
                                      <span className="text-[10px] text-slate-400 font-sans">Full Month Pristine</span>
                                    </div>
                                    <span className={`font-mono font-extrabold ${b.perfectBonus > 0 ? 'text-emerald-600' : 'text-slate-400'}`}>
                                      {b.perfectBonus > 0 ? `+${b.perfectBonus}` : '0'}
                                    </span>
                                  </div>

                                  <div className="flex justify-between items-center border-b border-slate-100 pb-1.5">
                                    <div>
                                      <span className="font-bold text-emerald-700 block">Excellent Attendance Bonus</span>
                                      <span className="text-[10px] text-slate-400">Max 2 Lates Only</span>
                                    </div>
                                    <span className={`font-mono font-extrabold ${b.excellentBonus > 0 ? 'text-emerald-600' : 'text-slate-400'}`}>
                                      {b.excellentBonus > 0 ? `+${b.excellentBonus}` : '0'}
                                    </span>
                                  </div>

                                  <div className="pt-2 flex justify-between items-center">
                                    <span className="font-extrabold text-slate-800 uppercase text-[10px]">Final Net Impact</span>
                                    <span className={`font-mono font-extrabold text-xs ${netImpact < 0 ? 'text-rose-600 font-extrabold' : netImpact > 0 ? 'text-emerald-600 font-black' : 'text-slate-500'}`}>
                                      {netImpact > 0 ? `+${netImpact}` : netImpact}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            </div>

                            {/* Employee Explanation Card */}
                            <div id="employee-explanation-report" className="bg-white border-2 border-slate-200 rounded-xl p-5 shadow-xs space-y-4 font-sans print:break-inside-avoid">
                              <div className="border-b pb-2.5 border-slate-250">
                                <h5 className="font-extrabold text-slate-900 text-xs tracking-tight flex items-center gap-1.5 uppercase">
                                  🏆 Why is my score {b.finalScore}?
                                </h5>
                                <span className="text-[9px] text-slate-400 mt-0.5 block">Audit log breakdown formula verification</span>
                              </div>

                              <div className="space-y-3 text-xs text-slate-705 text-slate-700">
                                <div className="flex justify-between items-center border-b border-dashed border-slate-100 pb-1.5">
                                  <span className="font-medium text-slate-600">Perfect Rating Benchmark</span>
                                  <span className="font-mono font-bold text-slate-800">100 pts</span>
                                </div>

                                {b.absentCount > 0 && (
                                  <div className="flex justify-between items-center border-b border-dashed border-slate-100 pb-1.5 text-rose-650">
                                    <div>
                                      <span className="font-bold">Absent Deductions</span>
                                      <span className="block text-[9px] text-slate-405 font-sans italic">{b.absentCount} day{b.absentCount > 1 ? 's' : ''} × -15</span>
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
                                  <div className="flex justify-between items-center border-b border-dashed border-slate-100 pb-1.5 text-orange-705 text-orange-750">
                                    <div>
                                      <span className="font-bold">Short Working Hours Penalties</span>
                                      <span className="block text-[9px] text-slate-405 font-sans italic">{b.shortCount} shift{b.shortCount > 1 ? 's' : ''} × -1</span>
                                    </div>
                                    <span className="font-mono font-extrabold">{b.shortHoursPenalty} pts</span>
                                  </div>
                                )}

                                {b.sundayWorkedCount > 0 && (
                                  <div className="flex justify-between items-center border-b border-dashed border-slate-100 pb-1.5 text-emerald-700 font-bold">
                                    <div>
                                      <span>Sunday Duty Incentives</span>
                                      <span className="block text-[9px] text-slate-405 font-sans font-normal italic">{b.sundayWorkedCount} Sunday{b.sundayWorkedCount > 1 ? 's' : ''} (max +8)</span>
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
                                  <span className="font-mono text-xs text-indigo-805 bg-indigo-50 px-2 py-0.5 rounded text-indigo-800">
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
                          </div>
                        </div>
                      );
                    })()}


                   {(!activeStaffSummary || activeStaffSummary.logs.length === 0) ? (
                     <div className="text-center py-10 text-slate-400 text-xs italic bg-white pb-12">
                       No calendar clockings logged for this worker in {filterMonth}/{filterYear}.
                     </div>
                   ) : (
                     <div className="overflow-x-auto max-h-96 print:max-h-none print:overflow-visible">
                       <table className="w-full text-left border-collapse text-xs">
                         <thead>
                           <tr className="bg-slate-100 font-bold border-b border-slate-200 text-slate-600 sticky top-0 z-10">
                             <th className="p-3">Logged Date</th>
                             <th className="p-3 text-center">Check-In</th>
                             <th className="p-3 text-center">Check-Out</th>
                             <th className="p-3 text-center">Net Hours</th>
                             <th className="p-3 text-center">Late Minutes</th>
                             <th className="p-3 text-center">Overtime Hours</th>
                             <th className="p-3 text-center font-bold">Workday Status</th>
                             <th className="p-3">Supervisor Notes</th>
                           </tr>
                         </thead>
                         <tbody className="divide-y divide-slate-100 font-mono text-[11px] text-slate-600 bg-white">
                           {activeStaffSummary.logs.map((log, lIdx) => {
                             const isLate = log.late_minutes > 0;
                             const hasOvertime = log.overtime_hours > 0;
                             return (
                               <tr key={log.date || lIdx} className="hover:bg-slate-50/50">
                                 <td className="p-3 text-slate-700 font-bold">{log.date}</td>
                                 <td className="p-3 text-center text-slate-600">{formatTime(log.check_in || null)}</td>
                                 <td className="p-3 text-center text-slate-600">{formatTime(log.check_out || null)}</td>
                                 <td className="p-3 text-center font-bold text-slate-800">{log.net_hours} hrs</td>
                                 <td className={`p-3 text-center font-medium ${isLate ? 'text-amber-600 bg-amber-500/10 font-bold' : 'text-slate-400'}`}>
                                   {isLate ? `${log.late_minutes} min` : '-'}
                                 </td>
                                 <td className={`p-3 text-center ${hasOvertime ? 'text-violet-650 bg-violet-50/10 font-bold' : 'text-slate-400'}`}>
                                   {isLate ? '-' : (hasOvertime ? `+${log.overtime_hours} hrs` : '-')}
                                 </td>
                                 <td className="p-3 text-center font-sans">
                                   <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                     log.status === 'Present' ? 'bg-emerald-100 text-emerald-800' :
                                     log.status === 'Half-Day' ? 'bg-sky-100 text-sky-800' :
                                     log.status === 'Absent' ? 'bg-rose-100 text-rose-800' :
                                     log.status === 'Leave' ? 'bg-violet-100 text-violet-800' :
                                     log.status === 'Off' ? 'bg-slate-100 text-slate-650' :
                                     log.status === 'Missing Checkout' ? 'bg-amber-100 text-amber-850' :
                                     'bg-slate-100 text-slate-600'
                                   }`}>
                                     {log.status}
                                   </span>
                                 </td>
                                 <td className="p-3 font-sans italic text-slate-450 truncate max-w-xs" title={log.notes}>
                                   {log.notes || '-'}
                                 </td>
                               </tr>
                             );
                           })}
                         </tbody>
                       </table>
                     </div>
                   )}
                 </div>
               </div>
             )}
          </div>
        )}

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
            {rankedEmployeesList.length === 0 ? (
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
                      <th className="p-2 border-r border-slate-205 text-center text-amber-700">Short Hours</th>
                      <th className="p-2 border-r border-slate-200 text-center text-violet-600">Overtime</th>
                      <th className="p-2 border-r border-slate-200 text-center">Avg Hrs/Day</th>
                      <th className="p-3 border-r border-slate-200 text-center font-bold text-violet-750">Score</th>
                      <th className="p-3">Automated Remarks Summary</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                    {rankedEmployeesList.map((s) => {
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

        {/* Tab 3: Individual Employee General Ledger Sheet */}
        {activeSubTab === 'ledger' && (
          <EmployeeLedger 
            employees={employees}
            attendance={attendance}
            commissions={commissions}
            allowances={allowances}
            salaryReviews={salaryReviews}
            ownerAdjustments={ownerAdjustments}
            auditLogs={auditLogs}
          />
        )}

        {/* Tab 5: Month-to-Month Performance Comparison */}
        {activeSubTab === 'comparison' && (
          <div className="space-y-6">
            
            {/* Local Comparison Action Controls */}
            <div className="bg-white rounded-xl shadow-md border border-slate-200 p-5 space-y-4 no-print">
              <div className="flex items-center justify-between border-b pb-2.5 border-slate-100">
                <h4 className="font-bold text-slate-800 text-sm flex items-center gap-1.5">
                  <TrendingUp className="h-4.5 w-4.5 text-violet-600" />
                  Staff Month-to-Month Performance Comparison Panel
                </h4>
                <span className="text-[10px] text-slate-450 font-black uppercase tracking-wider font-mono bg-violet-50 text-violet-750 px-2.5 py-1 rounded">Delta Mode active</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-4">
                
                {/* Employee selection */}
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-600 mb-1.5">Select Employee to Audit</label>
                  <select
                    value={compareEmpId}
                    onChange={(e) => setCompareEmpId(e.target.value)}
                    className="w-full text-xs border border-slate-350 rounded-lg p-2.5 bg-slate-50 font-semibold text-slate-850 outline-none focus:ring-1 focus:ring-violet-500"
                  >
                    {employees.filter(e => !e.is_deleted).map(emp => (
                      <option key={emp.id} value={emp.id}>
                        {emp.name} ({emp.id}) — {emp.department || 'Stitching'}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Previous Month selection */}
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1.5">Previous Month</label>
                  <div className="flex gap-1.5">
                    <select
                      value={comparePrevMonth}
                      onChange={(e) => setComparePrevMonth(e.target.value)}
                      className="w-full text-xs border border-slate-300 rounded-lg p-2 bg-slate-50 text-slate-800"
                    >
                      <option value="01">01 - Jan</option>
                      <option value="02">02 - Feb</option>
                      <option value="03">03 - Mar</option>
                      <option value="04">04 - Apr</option>
                      <option value="05">05 - May</option>
                      <option value="06">06 - Jun</option>
                      <option value="07">07 - Jul</option>
                      <option value="08">08 - Aug</option>
                      <option value="09">09 - Sep</option>
                      <option value="10">10 - Oct</option>
                      <option value="11">11 - Nov</option>
                      <option value="12">12 - Dec</option>
                    </select>
                    <select
                      value={comparePrevYear}
                      onChange={(e) => setComparePrevYear(e.target.value)}
                      className="text-xs border border-slate-300 rounded-lg p-2 bg-slate-50 text-slate-800"
                    >
                      <option value="2025">2025</option>
                      <option value="2026">2026</option>
                      <option value="2027">2027</option>
                    </select>
                  </div>
                </div>

                {/* Visual arrow spacer */}
                <div className="hidden md:flex flex-col items-center justify-center p-1 text-slate-300">
                  <span className="text-xs font-bold text-slate-450">compare to</span>
                  <span className="text-xl font-black">⇄</span>
                </div>

                {/* Current Month selection */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">Current Month</label>
                  <div className="flex gap-1.5">
                    <select
                      value={compareCurrentMonth}
                      onChange={(e) => setCompareCurrentMonth(e.target.value)}
                      className="w-full text-xs border border-slate-350 rounded-lg p-2 bg-slate-50 text-slate-800 font-semibold"
                    >
                      <option value="01">01 - Jan</option>
                      <option value="02">02 - Feb</option>
                      <option value="03">03 - Mar</option>
                      <option value="04">04 - Apr</option>
                      <option value="05">05 - May</option>
                      <option value="06">06 - Jun</option>
                      <option value="07">07 - Jul</option>
                      <option value="08">08 - Aug</option>
                      <option value="09">09 - Sep</option>
                      <option value="10">10 - Oct</option>
                      <option value="11">11 - Nov</option>
                      <option value="12">12 - Dec</option>
                    </select>
                    <select
                      value={compareCurrentYear}
                      onChange={(e) => setCompareCurrentYear(e.target.value)}
                      className="text-xs border border-slate-350 rounded-lg p-2 bg-slate-50 text-slate-800 font-semibold"
                    >
                      <option value="2025">2025</option>
                      <option value="2026">2026</option>
                      <option value="2027">2027</option>
                    </select>
                  </div>
                </div>

              </div>
            </div>

            {/* Metrics display grid */}
            {!comparisonResults || !comparisonResults.current || !comparisonResults.previous ? (
              <div className="py-12 bg-white border border-dashed rounded-xl border-slate-300 text-center text-slate-400 text-xs">
                No logs or metrics found to generate comparison data inside this scope.
              </div>
            ) : (
              <div className="space-y-4">
                
                {/* Employee badge summary row */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-violet-900 border border-violet-850 p-4 rounded-xl text-white">
                  <div>
                    <h5 className="font-extrabold text-[12px] uppercase text-violet-200 tracking-wider">Active Comparison Target</h5>
                    <h3 className="text-lg font-black mt-0.5">{comparisonResults.employee.name}</h3>
                    <p className="text-xs text-violet-300 mt-0.5">{comparisonResults.employee.designation} | {comparisonResults.employee.department || 'Stitching'} Department Division</p>
                  </div>
                  <div className="flex gap-4 text-xs font-mono font-bold bg-violet-950/45 p-3 rounded-lg border border-violet-800/50">
                    <div>
                      <span className="text-[10px] text-violet-400 block uppercase">Prev Month Logs</span>
                      <span>{comparisonResults.previous.logsCount} matching logs</span>
                    </div>
                    <div className="border-l border-violet-800/50 pl-4">
                      <span className="text-[10px] text-violet-400 block uppercase">Current Month Logs</span>
                      <span>{comparisonResults.current.logsCount} matching logs</span>
                    </div>
                  </div>
                </div>

                {/* 7 Core requirements cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                  
                  {/* Card 1: Performance Score */}
                  {(() => {
                    const currentVal = comparisonResults.current.performanceScore;
                    const prevVal = comparisonResults.previous.performanceScore;
                    const diff = currentVal - prevVal;
                    const improved = diff >= 0;
                    return (
                      <div className="bg-white border border-slate-200 hover:border-violet-300 rounded-xl p-5 shadow-sm space-y-3 transition-all duration-150">
                        <div className="flex items-center justify-between">
                          <span className="text-[10pt] uppercase font-black tracking-wider text-slate-400 flex items-center gap-1.5">
                            <Award className="h-4.5 w-4.5 text-violet-650 text-violet-600" />
                            Performance Score
                          </span>
                          <span className={`text-[10px] font-extrabold px-2.5 py-1 rounded-full uppercase tracking-wider font-mono flex items-center gap-1 ${
                            improved ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                          }`}>
                            {improved ? '▲' : '▼'} {diff >= 0 ? '+' : ''}{diff.toFixed(0)} pts
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-4 border-t pt-2 border-slate-100">
                          <div>
                            <span className="text-[10px] text-slate-400 block font-semibold">Current Month</span>
                            <strong className="text-xl text-slate-800 font-mono font-extrabold">{currentVal} <span className="text-xs text-slate-400 font-normal">/ 100</span></strong>
                          </div>
                          <div>
                            <span className="text-[10px] text-slate-400 block">Previous Month</span>
                            <strong className="text-xl text-slate-500 font-mono font-bold">{prevVal} <span className="text-xs text-slate-400 font-normal">/ 100</span></strong>
                          </div>
                        </div>
                        <p className="text-[11px] text-slate-550 leading-normal pt-1 text-slate-500 font-medium">
                          Calculated based on daily punctuality metrics, short hours compliance, and supervisors' manual adjustments.
                        </p>
                      </div>
                    );
                  })()}

                  {/* Card 2: Attendance % */}
                  {(() => {
                    const currentVal = comparisonResults.current.attendancePercentage;
                    const prevVal = comparisonResults.previous.attendancePercentage;
                    const diff = currentVal - prevVal;
                    const improved = diff >= 0;
                    return (
                      <div className="bg-white border border-slate-200 hover:border-violet-300 rounded-xl p-5 shadow-sm space-y-3 transition-all duration-150">
                        <div className="flex items-center justify-between">
                          <span className="text-[10pt] uppercase font-black tracking-wider text-slate-400 flex items-center gap-1.5">
                            <Layers className="h-4.5 w-4.5 text-indigo-600" />
                            Attendance Rate
                          </span>
                          <span className={`text-[10px] font-extrabold px-2.5 py-1 rounded-full uppercase tracking-wider font-mono flex items-center gap-1 ${
                            improved ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                          }`}>
                            {improved ? '▲' : '▼'} {diff >= 0 ? '+' : ''}{diff.toFixed(1)}%
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-4 border-t pt-2 border-slate-100">
                          <div>
                            <span className="text-[10px] text-slate-400 block font-semibold font-medium">Current Month</span>
                            <strong className="text-xl text-slate-800 font-mono font-extrabold">{currentVal}%</strong>
                          </div>
                          <div>
                            <span className="text-[10px] text-slate-400 block">Previous Month</span>
                            <strong className="text-xl text-slate-500 font-mono font-bold">{prevVal}%</strong>
                          </div>
                        </div>
                        <p className="text-[11px] text-slate-550 leading-normal pt-1 text-slate-500 font-medium font-semibold">
                          Attendance count is computed using presents, approved leaves, weekly offs, and half-days.
                        </p>
                      </div>
                    );
                  })()}

                  {/* Card 3: Late Days */}
                  {(() => {
                    const currentVal = comparisonResults.current.lateDays;
                    const prevVal = comparisonResults.previous.lateDays;
                    const diff = currentVal - prevVal;
                    // For late days, fewer is better!
                    const improved = diff <= 0;
                    return (
                      <div className="bg-white border border-slate-200 hover:border-violet-300 rounded-xl p-5 shadow-sm space-y-3 transition-all duration-150">
                        <div className="flex items-center justify-between">
                          <span className="text-[10pt] uppercase font-black tracking-wider text-slate-400 flex items-center gap-1.5">
                            <Clock className="h-4.5 w-4.5 text-amber-600" />
                            Late Arrivals Count
                          </span>
                          <span className={`text-[10px] font-extrabold px-2.5 py-1 rounded-full uppercase tracking-wider font-mono flex items-center gap-1 ${
                            improved ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                          }`}>
                            {improved ? '▲ Better' : '▼ Worse'} {diff > 0 ? '+' : ''}{diff} d
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-4 border-t pt-2 border-slate-100">
                          <div>
                            <span className="text-[10px] text-slate-400 block font-semibold">Current Month</span>
                            <strong className="text-xl text-slate-800 font-mono font-extrabold">{currentVal} days</strong>
                          </div>
                          <div>
                            <span className="text-[10px] text-slate-400 block">Previous Month</span>
                            <strong className="text-xl text-slate-500 font-mono font-bold">{prevVal} days</strong>
                          </div>
                        </div>
                        <p className="text-[11px] text-slate-550 leading-normal pt-1 text-slate-500 font-medium">
                          Any arrival logged after the company's designated grace period limit.
                        </p>
                      </div>
                    );
                  })()}

                  {/* Card 4: Short Hour Days */}
                  {(() => {
                    const currentVal = comparisonResults.current.shortHourDays;
                    const prevVal = comparisonResults.previous.shortHourDays;
                    const diff = currentVal - prevVal;
                    // Fewer is better!
                    const improved = diff <= 0;
                    return (
                      <div className="bg-white border border-slate-200 hover:border-violet-300 rounded-xl p-5 shadow-sm space-y-3 transition-all duration-150">
                        <div className="flex items-center justify-between">
                          <span className="text-[10pt] uppercase font-black tracking-wider text-slate-400 flex items-center gap-1.5">
                            <AlertTriangle className="h-4.5 w-4.5 text-amber-500" />
                            Short Hour Days
                          </span>
                          <span className={`text-[10px] font-extrabold px-2.5 py-1 rounded-full uppercase tracking-wider font-mono flex items-center gap-1 ${
                            improved ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                          }`}>
                            {improved ? '▲ Better' : '▼ Worse'} {diff > 0 ? '+' : ''}{diff} d
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-4 border-t pt-2 border-slate-100">
                          <div>
                            <span className="text-[10px] text-slate-400 block font-semibold">Current Month</span>
                            <strong className="text-xl text-slate-800 font-mono font-extrabold">{currentVal} days</strong>
                          </div>
                          <div>
                            <span className="text-[10px] text-slate-400 block">Previous Month</span>
                            <strong className="text-xl text-slate-500 font-mono font-bold">{prevVal} days</strong>
                          </div>
                        </div>
                        <p className="text-[11px] text-slate-555 leading-normal pt-1 text-slate-500 font-medium">
                          Duty shifts registered with less than the expected 10-hour standard threshold.
                        </p>
                      </div>
                    );
                  })()}

                  {/* Card 5: Missing Checkouts */}
                  {(() => {
                    const currentVal = comparisonResults.current.missingCheckouts;
                    const prevVal = comparisonResults.previous.missingCheckouts;
                    const diff = currentVal - prevVal;
                    // Fewer is better!
                    const improved = diff <= 0;
                    return (
                      <div className="bg-white border border-slate-200 hover:border-violet-300 rounded-xl p-5 shadow-sm space-y-3 transition-all duration-150">
                        <div className="flex items-center justify-between">
                          <span className="text-[10pt] uppercase font-black tracking-wider text-slate-400 flex items-center gap-1.5">
                            <AlertCircle className="h-4.5 w-4.5 text-rose-500" />
                            Missing Checkouts
                          </span>
                          <span className={`text-[10px] font-extrabold px-2.5 py-1 rounded-full uppercase tracking-wider font-mono flex items-center gap-1 ${
                            improved ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                          }`}>
                            {improved ? '▲ Better' : '▼ Worse'} {diff > 0 ? '+' : ''}{diff} d
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-4 border-t pt-2 border-slate-100">
                          <div>
                            <span className="text-[10px] text-slate-400 block font-semibold font-medium">Current Month</span>
                            <strong className="text-xl text-slate-800 font-mono font-extrabold">{currentVal} days</strong>
                          </div>
                          <div>
                            <span className="text-[10px] text-slate-400 block">Previous Month</span>
                            <strong className="text-xl text-slate-500 font-mono font-bold">{prevVal} days</strong>
                          </div>
                        </div>
                        <p className="text-[11px] text-slate-555 leading-normal pt-1 text-slate-500 font-medium">
                          Working days where a check-in exists but no check-out log was registered.
                        </p>
                      </div>
                    );
                  })()}

                  {/* Card 6: Sunday Worked Days */}
                  {(() => {
                    const currentVal = comparisonResults.current.sundayWorkedDays;
                    const prevVal = comparisonResults.previous.sundayWorkedDays;
                    const diff = currentVal - prevVal;
                    const improved = diff >= 0;
                    return (
                      <div className="bg-white border border-slate-200 hover:border-violet-300 rounded-xl p-5 shadow-sm space-y-3 transition-all duration-150">
                        <div className="flex items-center justify-between">
                          <span className="text-[10pt] uppercase font-black tracking-wider text-slate-400 flex items-center gap-1.5">
                            <Calendar className="h-4.5 w-4.5 text-emerald-600" />
                            Sundays Worked Days
                          </span>
                          <span className={`text-[10px] font-extrabold px-2.5 py-1 rounded-full uppercase tracking-wider font-mono flex items-center gap-1 ${
                            improved ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                          }`}>
                            {improved ? '▲' : '▼'} {diff >= 0 ? '+' : ''}{diff} d
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-4 border-t pt-2 border-slate-100">
                          <div>
                            <span className="text-[10px] text-slate-400 block font-semibold">Current Month</span>
                            <strong className="text-xl text-slate-800 font-mono font-extrabold">{currentVal} days</strong>
                          </div>
                          <div>
                            <span className="text-[10px] text-slate-400 block">Previous Month</span>
                            <strong className="text-xl text-slate-500 font-mono font-bold">{prevVal} days</strong>
                          </div>
                        </div>
                        <p className="text-[11px] text-slate-555 leading-normal pt-1 text-slate-500 font-medium">
                          Sunday status logs do NOT trigger normal overtime salary, but award performance credit.
                        </p>
                      </div>
                    );
                  })()}

                  {/* Card 7: Commission Count */}
                  {(() => {
                    const currentVal = comparisonResults.current.commissionCount;
                    const prevVal = comparisonResults.previous.commissionCount;
                    const diff = currentVal - prevVal;
                    const improved = diff >= 0;
                    return (
                      <div className="bg-white border border-slate-200 hover:border-violet-300 rounded-xl p-5 shadow-sm space-y-3 transition-all duration-150">
                        <div className="flex items-center justify-between">
                          <span className="text-[10pt] uppercase font-black tracking-wider text-slate-400 flex items-center gap-1.5">
                            <TrendingUp className="h-4.5 w-4.5 text-violet-600" />
                            Approved Commissions Block
                          </span>
                          <span className={`text-[10px] font-extrabold px-2.5 py-1 rounded-full uppercase tracking-wider font-mono flex items-center gap-1 ${
                            improved ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                          }`}>
                            {improved ? '▲' : '▼'} {diff >= 0 ? '+' : ''}{diff} units
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-4 border-t pt-2 border-slate-100">
                          <div>
                            <span className="text-[10px] text-slate-400 block font-semibold font-medium">Current Month</span>
                            <strong className="text-xl text-slate-800 font-mono font-extrabold">{currentVal} items</strong>
                          </div>
                          <div>
                            <span className="text-[10px] text-slate-400 block">Previous Month</span>
                            <strong className="text-xl text-slate-500 font-mono font-bold">{prevVal} items</strong>
                          </div>
                        </div>
                        <p className="text-[11px] text-slate-555 leading-normal pt-1 text-slate-500 font-medium">
                          Commissions approved by supervisors for payment credits in each respective month.
                        </p>
                      </div>
                    );
                  })()}

                </div>

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

            <div className="flex items-center gap-2 no-print">
              <button 
                onClick={() => window.print()}
                className="bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 cursor-pointer transition-colors"
                title="Print standard A4 report sheet"
              >
                <Printer className="h-4 w-4" />
                Print A4 Certified Docket
              </button>
              
              <button 
                onClick={() => setSelectedMonthlyEmpId(null)}
                className="text-slate-400 hover:text-white hover:bg-slate-800 p-1.5 rounded transition-colors"
                title="Close scorecard panel"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
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

          {/* Calculate on-the-fly breakdown to avoid mismatch and have accurate penalty/bonus items */}
          {(() => {
            const scoreResult = calculatePerformanceScore((activeMonthlyEmpDetail.logs || []).map(l => ({
              status: l.status || '',
              late_minutes: l.late_minutes || 0,
              net_hours: l.net_hours || 0,
              overtime_hours: l.overtime_hours || 0,
              short_hours: l.short_hours || 0,
              manual_status: l.manual_status || 'Auto',
              date: l.date
            })));
            const b = scoreResult.breakdown;
            const netImpact = (b.absentPenalty || 0) + 
                              (b.latePenalty || 0) + 
                              (b.missingCheckoutPenalty || 0) + 
                              (b.shortHoursPenalty || 0) + 
                              (b.sundayWorkedBonus || 0) + 
                              (b.perfectBonus || 0) + 
                              (b.excellentBonus || 0);

            const isLateMismatch = (b.lateCount || 0) !== lateDetails.length;
            const isAbsentMismatch = (b.absentCount || 0) !== absentDetails.length;
            const isMissingCheckoutMismatch = (b.missingCheckoutCount || 0) !== missingCheckoutDetails.length;
            const isShortHoursMismatch = (b.shortCount || 0) !== shortHoursDetails.length;
            const hasValidationMismatch = isLateMismatch || isAbsentMismatch || isMissingCheckoutMismatch || isShortHoursMismatch;
            const finalScore = b.finalScore;
            const grade = b.grade;

            return (
              <>
                {/* 
                  SPECIAL Certified A4 Printable Docket Sheet for Browser Print 
                  Takes over print entirely when docket is open
                */}
                <div className="hidden print:block bg-white text-slate-900 absolute inset-0 z-50 p-12 min-h-[297mm] h-auto flex flex-col justify-between border-none">
                  <div>
                    {/* Invoice-like Header block */}
                    <div className="flex justify-between items-start border-b-2 border-slate-800 pb-4">
                      <div>
                        <div className="text-2xl font-black tracking-widest text-slate-900 font-sans">KAPRAYOFFICIAL</div>
                        <div className="text-[10px] text-slate-500 uppercase font-mono tracking-wider mt-0.5">Corporate HQ &amp; HR Audit Registry</div>
                        <div className="text-xs text-slate-600 font-medium mt-2 leading-relaxed text-left">
                          Main Branch Division Office<br />
                          Lahore, Punjab, Pakistan<br />
                          Email: hr-audit@kaprayofficial.com
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="inline-block text-[10px] font-black border-2 border-slate-900 rounded bg-stone-50 text-slate-900 px-3 py-1 font-mono leading-none tracking-widest uppercase mb-2">
                          HR Certified Audit
                        </span>
                        <div className="text-xs space-y-0.5 font-mono text-slate-705">
                          <div><strong>Report Date:</strong> {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
                          <div><strong>Registry ID:</strong> KO-HR-{activeMonthlyEmpDetail.code}-{filterMonth}{filterYear}</div>
                        </div>
                      </div>
                    </div>

                    {/* Report Focus and Meta Data */}
                    <div className="my-6 text-center">
                      <h4 className="text-lg font-black tracking-tight uppercase border-b border-dashed border-slate-300 pb-2 mb-1">
                        OFFICIAL EMPLOYEE PERFORMANCE CARD
                      </h4>
                      <div className="text-xs font-mono text-slate-500">
                        Monthly Period Scope: <strong>{filterMonth}/{filterYear}</strong> | Registry Evaluation Audit
                      </div>
                    </div>

                    {/* Employee profile segment */}
                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-5 grid grid-cols-2 gap-4 mb-6">
                      <div className="space-y-1.5 text-xs text-left">
                        <div><strong className="text-slate-500 font-mono uppercase text-[9px]">Employee Name:</strong> <span className="font-bold text-slate-900 text-sm">{activeMonthlyEmpDetail.name}</span></div>
                        <div><strong className="text-slate-500 font-mono uppercase text-[9px]">Staff Code / ID:</strong> <span className="font-mono font-bold">{activeMonthlyEmpDetail.code}</span></div>
                        <div><strong className="text-slate-500 font-mono uppercase text-[9px]">Job Title Designation:</strong> <span>{activeMonthlyEmpDetail.designation}</span></div>
                      </div>
                      <div className="space-y-1.5 text-xs border-l border-slate-200 pl-4 text-left">
                        <div><strong className="text-slate-500 font-mono uppercase text-[9px]">Department Roster:</strong> <span>{activeMonthlyEmpDetail.department}</span></div>
                        <div><strong className="text-slate-500 font-mono uppercase text-[9px]">Performance Grade:</strong> <span className="font-mono font-bold text-sm bg-slate-950 text-white px-2 py-0.5 rounded ml-1">{grade}</span></div>
                        <div><strong className="text-slate-500 font-mono uppercase text-[9px]">Rostered Base Salary:</strong> <span className="font-bold">{formatPKR(activeMonthlyEmpDetail.salary || 0)}</span></div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-6 items-start">
                      {/* Left: Attendance Summary table */}
                      <div className="space-y-3">
                        <h5 className="text-[10px] font-black uppercase tracking-wider text-slate-800 border-b pb-1 font-sans text-left">
                          1. Attendance Record Summary
                        </h5>
                        <table className="w-full text-xs text-left border-collapse">
                          <tbody>
                            <tr className="border-b border-slate-200 py-1 flex justify-between items-center">
                              <td className="font-semibold text-slate-600">Present Days (incl. halfdays)</td>
                              <td className="font-mono font-bold text-slate-900 text-right">{activeMonthlyEmpDetail.present_days} days</td>
                            </tr>
                            <tr className="border-b border-slate-200 py-1 flex justify-between items-center">
                              <td className="font-semibold text-slate-600">Absent Days</td>
                              <td className={`font-mono font-bold text-right ${activeMonthlyEmpDetail.absent_days > 0 ? 'text-rose-600' : 'text-slate-705'}`}>{activeMonthlyEmpDetail.absent_days} days</td>
                            </tr>
                            <tr className="border-b border-slate-200 py-1 flex justify-between items-center">
                              <td className="font-semibold text-slate-600">Late Days (After limit)</td>
                              <td className={`font-mono font-bold text-right ${activeMonthlyEmpDetail.late_days_count > 0 ? 'text-amber-600' : 'text-slate-705'}`}>{activeMonthlyEmpDetail.late_days_count} days</td>
                            </tr>
                            <tr className="border-b border-slate-200 py-1 flex justify-between items-center">
                              <td className="font-semibold text-slate-600">Missing Checkout Days</td>
                              <td className={`font-mono font-bold text-right ${activeMonthlyEmpDetail.missing_checkout_count > 0 ? 'text-orange-600' : 'text-slate-705'}`}>{activeMonthlyEmpDetail.missing_checkout_count} days</td>
                            </tr>
                            <tr className="border-b border-slate-200 py-1 flex justify-between items-center">
                              <td className="font-semibold text-slate-600">Approved Leave Days</td>
                              <td className="font-mono font-bold text-slate-700 text-right">{activeMonthlyEmpDetail.leave_days} days</td>
                            </tr>
                            <tr className="border-b border-slate-200 py-1 flex justify-between items-center">
                              <td className="font-semibold text-slate-600">Standard Scheduled Off Days</td>
                              <td className="font-mono font-bold text-slate-700 text-right">{activeMonthlyEmpDetail.off_days} days</td>
                            </tr>
                            <tr className="border-b border-slate-200 py-1 flex justify-between items-center">
                              <td className="font-semibold text-slate-600">Sunday Overtime Duties</td>
                              <td className="font-mono font-bold text-emerald-600 text-right">+{b.sundayWorkedCount || 0} days</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>

                      {/* Right: Performance Impact Summary */}
                      <div className="space-y-3">
                        <h5 className="text-[10px] font-black uppercase tracking-wider text-slate-800 border-b pb-1 font-sans text-left">
                          2. Scorecard Impact Statement
                        </h5>
                        <table className="w-full text-xs text-left border-collapse">
                          <tbody>
                            <tr className="border-b border-slate-100 py-1 flex justify-between items-center">
                              <td className="font-semibold text-slate-600">Absent Days Penalization</td>
                              <td className={`font-mono font-bold text-right ${b.absentPenalty < 0 ? 'text-rose-600' : 'text-slate-500'}`}>{b.absentPenalty < 0 ? `${b.absentPenalty}` : '0'}</td>
                            </tr>
                            <tr className="border-b border-slate-100 py-1 flex justify-between items-center">
                              <td className="font-semibold text-slate-600">Late Arrival Penalization</td>
                              <td className={`font-mono font-bold text-right ${b.latePenalty < 0 ? 'text-rose-600' : 'text-slate-500'}`}>{b.latePenalty < 0 ? `${b.latePenalty}` : '0'}</td>
                            </tr>
                            <tr className="border-b border-slate-100 py-1 flex justify-between items-center">
                              <td className="font-semibold text-slate-600">Missing Checkout Penalization</td>
                              <td className={`font-mono font-bold text-right ${b.missingCheckoutPenalty < 0 ? 'text-rose-600' : 'text-slate-500'}`}>{b.missingCheckoutPenalty < 0 ? `${b.missingCheckoutPenalty}` : '0'}</td>
                            </tr>
                            <tr className="border-b border-slate-100 py-1 flex justify-between items-center">
                              <td className="font-semibold text-slate-600">Short Hours Penalization</td>
                              <td className={`font-mono font-bold text-right ${b.shortHoursPenalty < 0 ? 'text-rose-600' : 'text-slate-500'}`}>{b.shortHoursPenalty < 0 ? `${b.shortHoursPenalty}` : '0'}</td>
                            </tr>
                            <tr className="border-b border-slate-100 py-1 flex justify-between items-center">
                              <td className="font-semibold text-emerald-700">Sunday Worked Incentive</td>
                              <td className={`font-mono font-bold text-right ${b.sundayWorkedBonus > 0 ? 'text-emerald-600' : 'text-slate-500'}`}>{b.sundayWorkedBonus > 0 ? `+${b.sundayWorkedBonus}` : '0'}</td>
                            </tr>
                            <tr className="border-b border-slate-100 py-1 flex justify-between items-center">
                              <td className="font-semibold text-emerald-700">Perfect Attendance Incentive (Pristine)</td>
                              <td className={`font-mono font-bold text-right ${b.perfectBonus > 0 ? 'text-emerald-600' : 'text-slate-500'}`}>{b.perfectBonus > 0 ? `+${b.perfectBonus}` : '0'}</td>
                            </tr>
                            <tr className="border-b border-slate-100 py-1 flex justify-between items-center">
                              <td className="font-semibold text-emerald-700">Excellent Attendance Incentive</td>
                              <td className={`font-mono font-bold text-right ${b.excellentBonus > 0 ? 'text-emerald-600' : 'text-slate-500'}`}>{b.excellentBonus > 0 ? `+${b.excellentBonus}` : '0'}</td>
                            </tr>
                            <tr className="py-2.5 flex justify-between items-center border-t-2 border-slate-800 mt-2">
                              <td className="font-black text-slate-900 uppercase">Final Net Score Output</td>
                              <td className="font-mono font-black text-sm text-slate-900 text-right">{finalScore} / 100</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Manager/Auditor assessment notes */}
                    <div className="mt-8 space-y-2 text-xs text-left">
                      <h5 className="text-[10px] font-black uppercase tracking-wider text-slate-800 border-b pb-1 font-sans">
                        3. Audit Compliance Narrative &amp; Comments
                      </h5>
                      <div className="p-3 bg-stone-50 border border-slate-200 rounded text-slate-650 leading-relaxed italic text-left">
                        "The employee has been evaluated under the standard roster compliance specifications. {activeMonthlyEmpDetail.remarks || 'Demonstrated overall alignment with the specified operational grade guidelines.'} The ledger record remains archived under official HR policies."
                      </div>
                    </div>

                    {/* Performance Rules & Score Guide in Print PDF */}
                    <div className="mt-6 border border-slate-300 rounded-lg p-3.5 bg-slate-50 text-left">
                      <h5 className="text-[9px] font-black uppercase tracking-wider text-slate-900 border-b border-slate-350 pb-1 font-sans">
                        4. Certified Performance Rules &amp; Score Guide (Regulatory References Reference)
                      </h5>
                      <div className="grid grid-cols-2 gap-4 text-[10px] font-mono text-slate-700 mt-2">
                        <div>
                          <strong>Deduction Weights:</strong>
                          <ul className="mt-1 space-y-0.5">
                            <li>• Unapproved Absence Penalty: <strong>-15 pts / day</strong></li>
                            <li>• Unapproved Missing Checkout Penalty: <strong>-5 pts / day</strong></li>
                            <li>• Unapproved Late Arrival Penalty: <strong>-2 pts / day</strong></li>
                            <li>• Unapproved Short Hours Penalty: <strong>-1 pts / day</strong></li>
                          </ul>
                        </div>
                        <div>
                          <strong>Incentives &amp; Alignment Bonuses:</strong>
                          <ul className="mt-1 space-y-0.5">
                            <li>• Sunday Worked Bonus: <strong>+2 pts / day (max +8)</strong></li>
                            <li>• Perfect Month Attendance: <strong>+5 pts</strong></li>
                            <li>• Excellent Attendance Bonus: <strong>+2 pts</strong></li>
                          </ul>
                        </div>
                      </div>
                      <p className="text-[9px] text-slate-500 mt-2 font-sans leading-relaxed">
                        * Note: Approved exceptions including Approved Leave, Medical Leave, Official Duty, Approved Late, Approved Short Hours, Official Early Release, and Management Approved Exceptions have a certified penalty of 0. Performance Scores are strictly bounded: Minimum = 0, Maximum = 100.
                      </p>
                    </div>
                  </div>

                  {/* Cert signatures & Verification */}
                  <div className="border-t border-slate-300 pt-8 mt-12">
                    <div className="grid grid-cols-3 gap-4 text-xs">
                      <div className="text-center pt-8 border-t border-slate-300">
                        <span className="font-bold text-slate-800 block">HR Directorate Auditor</span>
                        <span className="text-[10px] text-slate-500 block font-mono mt-0.5">Central Central HR Registry</span>
                      </div>
                      <div className="text-center pt-8 flex flex-col items-center justify-end">
                        <div className="border-2 border-slate-900 rounded bg-stone-50 px-3 py-1 text-center font-mono text-[9px] leading-tight text-slate-900 uppercase tracking-widest font-black">
                          SECURE VERIFIED AUDIT MAP<br />
                          <span className="text-[8px] font-bold text-slate-500 font-sans tracking-normal capitalize">Certified by KaprayOfficial HR Audit System</span>
                        </div>
                      </div>
                      <div className="text-center pt-8 border-t border-slate-300">
                        <span className="font-bold text-slate-800 block">Managing Director Approval</span>
                        <span className="text-[10px] text-slate-500 block font-mono mt-0.5">Corporate Executive Board</span>
                      </div>
                    </div>
                    
                    <div className="text-center text-[9px] text-slate-400 font-mono mt-8 border-t border-slate-100 pt-3">
                      This has been executed on a secure system. Certified verification details KO-HR-{activeMonthlyEmpDetail.code}-{filterMonth}{filterYear}. All standards conform with official ERP guidelines.
                    </div>
                  </div>
                </div>

                {/* Integrity Warning */}
                {hasValidationMismatch && (
                  <div id="integrity-warning-docket" className="bg-amber-500/10 border-l-4 border-amber-500 p-4 rounded-r-xl text-amber-305 font-sans text-xs">
                    <div className="flex gap-2 items-center">
                      <AlertCircle className="h-5 w-5 text-amber-400 shrink-0" />
                      <div>
                        <h6 className="font-extrabold uppercase tracking-wide text-amber-250">Performance Report Integrity Warning</h6>
                        <p className="text-amber-300 mt-0.5 font-semibold">
                          Summary counts do not match detailed records.
                        </p>
                        <div className="text-[10px] text-amber-400 font-mono mt-1 grid grid-cols-2 md:grid-cols-4 gap-2 border-t border-amber-500/20 pt-1.5">
                          <span>Late Days: Summary {b.lateCount} vs Section {lateDetails.length}</span>
                          <span>Absent Days: Summary {b.absentCount} vs Section {absentDetails.length}</span>
                          <span>Missing Checkouts: Summary {b.missingCheckoutCount} vs Section {missingCheckoutDetails.length}</span>
                          <span>Short Hours: Summary {b.shortCount} vs Section {shortHoursDetails.length}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {/* Performance Impact Summary */}
                  <div id="performance-impact-summary-docket" className="bg-slate-850 border border-slate-800 rounded-xl p-5 space-y-4 font-sans">
                    <div className="flex justify-between items-center border-b pb-2 border-slate-800">
                      <h5 className="font-extrabold text-white text-xs uppercase tracking-wider flex items-center gap-1.5">
                        <Award className="h-4.5 w-4.5 text-indigo-400" />
                        Performance Impact Summary
                      </h5>
                      <span className="text-[9px] font-bold text-indigo-305 bg-indigo-500/10 border border-indigo-500/20 rounded px-2 py-0.5 uppercase">Audit Verification</span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-slate-300 border-none b-0">
                      <div className="space-y-3">
                        <div className="flex justify-between items-center border-b border-slate-800 pb-1.5">
                          <div>
                            <span className="font-bold text-slate-200 block">Absent Penalty</span>
                            <span className="text-[10px] text-slate-500">Absent Days: {b.absentCount}</span>
                          </div>
                          <span className={`font-mono font-extrabold ${b.absentPenalty < 0 ? 'text-rose-400' : 'text-slate-500'}`}>
                            {b.absentPenalty < 0 ? `${b.absentPenalty}` : '0'}
                          </span>
                        </div>

                        <div className="flex justify-between items-center border-b border-slate-800 pb-1.5">
                          <div>
                            <span className="font-bold text-slate-200 block">Late Penalty</span>
                            <span className="text-[10px] text-slate-500">Late Days: {b.lateCount}</span>
                          </div>
                          <span className={`font-mono font-extrabold ${b.latePenalty < 0 ? 'text-rose-400' : 'text-slate-500'}`}>
                            {b.latePenalty < 0 ? `${b.latePenalty}` : '0'}
                          </span>
                        </div>

                        <div className="flex justify-between items-center border-b border-slate-800 pb-1.5">
                          <div>
                            <span className="font-bold text-slate-200 block">Missing Checkout Penalty</span>
                            <span className="text-[10px] text-slate-500">Missing Checkout: {b.missingCheckoutCount}</span>
                          </div>
                          <span className={`font-mono font-extrabold ${b.missingCheckoutPenalty < 0 ? 'text-rose-400' : 'text-slate-500'}`}>
                            {b.missingCheckoutPenalty < 0 ? `${b.missingCheckoutPenalty}` : '0'}
                          </span>
                        </div>

                        <div className="flex justify-between items-center border-b border-slate-800 pb-1.5">
                          <div>
                            <span className="font-bold text-slate-200 block">Short Hours Penalty</span>
                            <span className="text-[10px] text-slate-500">Short Hours Days: {b.shortCount}</span>
                          </div>
                          <span className={`font-mono font-extrabold ${b.shortHoursPenalty < 0 ? 'text-rose-400' : 'text-slate-500'}`}>
                            {b.shortHoursPenalty < 0 ? `${b.shortHoursPenalty}` : '0'}
                          </span>
                        </div>
                      </div>

                      <div className="space-y-3">
                        <div className="flex justify-between items-center border-b border-slate-800 pb-1.5">
                          <div>
                            <span className="font-bold text-emerald-400 block border-b-none p-0 inline">Sunday Worked Bonus</span>
                            <span className="text-[10px] text-slate-500 block">Sunday Worked: {b.sundayWorkedCount}</span>
                          </div>
                          <span className={`font-mono font-extrabold ${b.sundayWorkedBonus > 0 ? 'text-emerald-400' : 'text-slate-500'}`}>
                            {b.sundayWorkedBonus > 0 ? `+${b.sundayWorkedBonus}` : '0'}
                          </span>
                        </div>

                        <div className="flex justify-between items-center border-b border-slate-800 pb-1.5">
                          <div>
                            <span className="font-bold text-emerald-400 block border-b-none p-0 inline">Perfect Attendance Bonus</span>
                            <span className="text-[10px] text-slate-500 block">Full Month Pristine</span>
                          </div>
                          <span className={`font-mono font-extrabold ${b.perfectBonus > 0 ? 'text-emerald-400' : 'text-slate-500'}`}>
                            {b.perfectBonus > 0 ? `+${b.perfectBonus}` : '0'}
                          </span>
                        </div>

                        <div className="flex justify-between items-center border-b border-slate-800 pb-1.5">
                          <div>
                            <span className="font-bold text-emerald-400 block border-b-none p-0 inline">Excellent Attendance Bonus</span>
                            <span className="text-[10px] text-slate-500 block">Max 2 Lates Only</span>
                          </div>
                          <span className={`font-mono font-extrabold ${b.excellentBonus > 0 ? 'text-emerald-400' : 'text-slate-500'}`}>
                            {b.excellentBonus > 0 ? `+${b.excellentBonus}` : '0'}
                          </span>
                        </div>

                        <div className="pt-2 flex justify-between items-center">
                          <span className="font-extrabold text-slate-350 uppercase text-[10px]">Final Net Impact</span>
                          <span className={`font-mono font-extrabold text-xs ${netImpact < 0 ? 'text-rose-400' : netImpact > 0 ? 'text-emerald-400 font-extrabold' : 'text-slate-450'}`}>
                            {netImpact > 0 ? `+${netImpact}` : netImpact}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Employee Explanation Card */}
                  <div id="employee-explanation-docket" className="bg-slate-850 border border-slate-800 rounded-xl p-5 space-y-4 font-sans">
                    <div className="border-b pb-2.5 border-slate-800">
                      <h5 className="font-extrabold text-white text-xs tracking-tight flex items-center gap-1.5 uppercase text-left">
                        🏆 Why Is My Score This Month?
                      </h5>
                      <span className="text-[9px] text-slate-450 mt-0.5 block text-left">Starting Score = 100 ... Final Score: {b.finalScore} / 100</span>
                    </div>

                    <div className="space-y-3 text-xs text-slate-300">
                      <div className="flex justify-between items-center border-b border-dashed border-slate-800 pb-1.5">
                        <span className="font-medium text-slate-450">Perfect Rating Benchmark</span>
                        <span className="font-mono font-bold text-white">100 pts</span>
                      </div>

                      {b.absentCount > 0 && (
                        <div className="flex justify-between items-center border-b border-dashed border-slate-800 pb-1.5 text-rose-350">
                          <div className="text-left">
                            <span className="font-bold">Absent Deductions</span>
                            <span className="block text-[9px] text-slate-500 font-sans italic">{b.absentCount} day{b.absentCount > 1 ? 's' : ''} × -15</span>
                          </div>
                          <span className="font-mono font-extrabold">{b.absentPenalty} pts</span>
                        </div>
                      )}

                      {b.lateCount > 0 && (
                        <div className="flex justify-between items-center border-b border-dashed border-slate-800 pb-1.5 text-amber-305">
                          <div className="text-left">
                            <span className="font-bold">Late Arrival Penalties</span>
                            <span className="block text-[9px] text-slate-500 font-sans italic">{b.lateCount} shift{b.lateCount > 1 ? 's' : ''} × -2</span>
                          </div>
                          <span className="font-mono font-extrabold">{b.latePenalty} pts</span>
                        </div>
                      )}

                      {b.missingCheckoutCount > 0 && (
                        <div className="flex justify-between items-center border-b border-dashed border-slate-800 pb-1.5 text-rose-350">
                          <div className="text-left">
                            <span className="font-bold">Missing Check-outs Penalties</span>
                            <span className="block text-[9px] text-slate-500 font-sans italic">{b.missingCheckoutCount} date{b.missingCheckoutCount > 1 ? 's' : ''} × -5</span>
                          </div>
                          <span className="font-mono font-extrabold">{b.missingCheckoutPenalty} pts</span>
                        </div>
                      )}

                      {b.shortCount > 0 && (
                        <div className="flex justify-between items-center border-b border-dashed border-slate-800 pb-1.5 text-orange-355 text-orange-300">
                          <div className="text-left">
                            <span className="font-bold">Short Working Hours Penalties</span>
                            <span className="block text-[9px] text-slate-500 font-sans italic">{b.shortCount} shift{b.shortCount > 1 ? 's' : ''} × -1</span>
                          </div>
                          <span className="font-mono font-extrabold">{b.shortHoursPenalty} pts</span>
                        </div>
                      )}

                      {b.sundayWorkedCount > 0 && (
                        <div className="flex justify-between items-center border-b border-dashed border-slate-800 pb-1.5 text-emerald-450 text-emerald-400">
                          <div className="text-left">
                            <span className="font-bold">Sunday Duty Incentives</span>
                            <span className="block text-[9px] text-slate-500 font-sans italic">{b.sundayWorkedCount} Sunday{b.sundayWorkedCount > 1 ? 's' : ''} (max +8)</span>
                          </div>
                          <span className="font-mono font-extrabold">+{b.sundayWorkedBonus} pts</span>
                        </div>
                      )}

                      {b.perfectBonus > 0 && (
                        <div className="flex justify-between items-center border-b border-dashed border-slate-800 pb-1.5 text-emerald-400 font-bold">
                          <div className="text-left">
                            <span>Perfect Month Attendance</span>
                            <span className="block text-[9px] text-slate-500 font-sans font-normal italic">Pristine work roster bonus</span>
                          </div>
                          <span className="font-mono font-black">+{b.perfectBonus} pts</span>
                        </div>
                      )}

                      {b.excellentBonus > 0 && (
                        <div className="flex justify-between items-center border-b border-dashed border-slate-800 pb-1.5 text-emerald-400">
                          <div className="text-left">
                            <span>Excellent Month Attendance</span>
                            <span className="block text-[9px] text-slate-500 font-sans font-normal italic">Minimal tardiness recorded</span>
                          </div>
                          <span className="font-mono font-extrabold">+{b.excellentBonus} pts</span>
                        </div>
                      )}

                      <div className="pt-1 flex justify-between items-center text-slate-200 font-bold">
                        <span className="font-extrabold uppercase tracking-wide text-[9px] text-slate-500">Audit Equation:</span>
                        <span className="font-mono text-xs text-indigo-305 bg-indigo-500/10 px-2 py-0.5 rounded">
                          100
                          {b.absentPenalty < 0 ? ` - ${Math.abs(b.absentPenalty)}` : ''}
                          {b.latePenalty < 0 ? ` - ${Math.abs(b.latePenalty)}` : ''}
                          {b.missingCheckoutPenalty < 0 ? ` - ${Math.abs(b.missingCheckoutPenalty)}` : ''}
                          {b.shortHoursPenalty < 0 ? ` - ${Math.abs(b.shortHoursPenalty)}` : ''}
                          {b.sundayWorkedBonus > 0 ? ` + ${b.sundayWorkedBonus}` : ''}
                          {b.perfectBonus > 0 ? ` + 5` : ''}
                          {b.excellentBonus > 0 ? ` + 2` : ''}
                          {' = '}
                          <span className="font-black text-xs text-indigo-450 font-mono tracking-tight">{b.finalScore} pts</span>
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Recommendations and Rules Guide Panel Row */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {/* Manager Action Recommendation Panel */}
                  {(() => {
                    const recObj = getManagerActionRecommendation(b.finalScore);
                    return (
                      <div className="bg-slate-850 border border-slate-800 rounded-xl p-5 shadow-xs flex flex-col justify-between font-sans text-left">
                        <div>
                          <h5 className="font-extrabold text-white text-xs uppercase tracking-wider mb-2.5 border-b border-slate-800 pb-2">
                            Incentive Action Recommendation
                          </h5>
                          <div className="mt-3">
                            <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black border uppercase tracking-wider ${recObj.color}`}>
                              💡 {recObj.recommendation}
                            </span>
                            <p className="text-slate-350 text-[11px] leading-relaxed mt-2.5 font-medium">
                              {recObj.description}
                            </p>
                          </div>
                        </div>
                        <div className="text-[9px] text-slate-500 mt-4 leading-normal pt-2 border-t border-slate-800">
                          Calculated dynamically from KaprayOfficial ERP scorecards to support continuous manufacturing/sales staff discipline. Overrides require super-admin credentials.
                        </div>
                      </div>
                    );
                  })()}

                  {/* Performance Rules & Score Guide Panel */}
                  <div className="bg-slate-900 border border-slate-800 text-white rounded-xl p-5 shadow-lg space-y-3 font-sans text-left">
                    <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
                      <Award className="h-4.5 w-4.5 text-emerald-400" />
                      <h5 className="font-extrabold text-xs uppercase tracking-wider text-slate-100">
                        Performance Rules &amp; Score Guide
                      </h5>
                    </div>
                    <div className="grid grid-cols-2 gap-4 text-[10px] text-slate-300">
                      <div>
                        <h6 className="font-bold text-slate-205 mb-1.5 uppercase font-mono tracking-wide text-white/95">Deductions:</h6>
                        <ul className="space-y-1 font-mono">
                          <li className="flex justify-between border-b border-slate-850 pb-1">
                            <span>Unapproved Absent</span>
                            <span className="text-rose-400 font-bold">-15 pts/d</span>
                          </li>
                          <li className="flex justify-between border-b border-slate-850 pb-1">
                            <span>Missing Checkout</span>
                            <span className="text-rose-400 font-bold">-5 pts/d</span>
                          </li>
                          <li className="flex justify-between border-b border-slate-850 pb-1">
                            <span>Unapproved Late</span>
                            <span className="text-amber-400 font-bold">-2 pts/d</span>
                          </li>
                          <li className="flex justify-between border-b border-slate-850 pb-1">
                            <span>Short Hours</span>
                            <span className="text-amber-500 font-bold">-1 pts/d</span>
                          </li>
                        </ul>
                      </div>
                      
                      <div>
                        <h6 className="font-bold text-slate-205 mb-1.5 uppercase font-mono tracking-wide text-white/95">Attendance Bonuses:</h6>
                        <ul className="space-y-1 font-mono">
                          <li className="flex justify-between border-b border-slate-850 pb-1">
                            <span>Sunday Worked</span>
                            <span className="text-emerald-400 font-bold">+2 pts (max 8)</span>
                          </li>
                          <li className="flex justify-between border-b border-slate-850 pb-1">
                            <span>Perfect Month</span>
                            <span className="text-emerald-400 font-bold">+5 pts</span>
                          </li>
                          <li className="flex justify-between border-b border-slate-850 pb-1">
                            <span>Excellent Month</span>
                            <span className="text-teal-400 font-bold">+2 pts</span>
                          </li>
                        </ul>
                      </div>
                    </div>
                    <p className="text-[9px] text-slate-400 leading-relaxed border-t border-slate-800 pt-2 font-sans">
                      * Approved exceptions count as 0 penalty. Active score bounded at Min 0, Max 100.
                    </p>
                  </div>
                </div>
              </>
            );
          })()}

          {/* 1. Late Detail Table Section */}
          <div className="space-y-3">
            <div className="flex items-center gap-1.5 border-b border-slate-800 pb-2">
              <Clock className="h-4.5 w-4.5 text-amber-400" />
              <h5 className="font-bold text-xs uppercase tracking-wider text-slate-300">
                Late Arrival Logs ({activeMonthlyEmpDetail.late_days_count} late arrivals recorded)
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
                      <th className="p-2.5 text-center text-amber-400 font-bold">Late minutes</th>
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
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                            l.status.startsWith('Approved') || l.status.includes('Official') || l.status.includes('Emergency')
                              ? 'bg-sky-400/20 text-sky-305 text-sky-300'
                              : 'bg-amber-400/20 text-amber-300'
                          }`}>
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

          {/* 2. Absent Days Section */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center gap-1.5 border-b border-slate-800 pb-2">
              <AlertCircle className="h-4.5 w-4.5 text-rose-500" />
              <h5 className="font-bold text-xs uppercase tracking-wider text-rose-400">
                Absent Days ({absentDetails.length} unapproved absences recorded)
              </h5>
            </div>

            {absentDetails.length === 0 ? (
              <p className="text-xs text-slate-500 italic py-4 bg-slate-850 p-4 rounded text-center border border-dashed border-slate-800">
                ⭐ Zero unapproved absences recorded for this worker in the selected calendar period!
              </p>
            ) : (
              <div className="border border-slate-800 rounded-lg overflow-hidden bg-slate-850">
                <table className="w-full text-left border-collapse text-xs font-mono">
                  <thead>
                    <tr className="bg-slate-800 font-bold text-slate-350 border-b border-slate-750">
                      <th className="p-2.5">Date</th>
                      <th className="p-2.5">Day</th>
                      <th className="p-2.5 text-center">Status</th>
                      <th className="p-2.5 text-center text-rose-400 font-bold">Penalty Impact</th>
                      <th className="p-2.5 text-center">Approval Status</th>
                      <th className="p-2.5">Reason / Remarks</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 text-slate-300 text-[11px]">
                    {absentDetails.map((a) => (
                      <tr key={a.date} className="hover:bg-slate-800/65">
                        <td className="p-2.5 font-bold text-slate-200">{a.date}</td>
                        <td className="p-2.5 font-sans">{a.dayName}</td>
                        <td className="p-2.5 text-center text-rose-400 font-bold">{a.status}</td>
                        <td className="p-2.5 text-center font-bold text-rose-400 bg-rose-500/10">
                          {a.penaltyImpact} pts
                        </td>
                        <td className="p-2.5 text-center font-sans">
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                            a.approvalStatus === 'Unapproved' ? 'bg-rose-400/20 text-rose-300 font-bold' : 'bg-sky-400/20 text-sky-305 text-sky-300 font-bold'
                          }`}>
                            {a.approvalStatus === 'Unapproved' ? 'Unapproved Absent' : a.approvalStatus}
                          </span>
                        </td>
                        <td className="p-2.5 font-sans italic text-slate-400 text-[10px] truncate max-w-xs">{a.remarks || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* 3. Missing Checkout Days Section */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center gap-1.5 border-b border-slate-800 pb-2">
              <AlertTriangle className="h-4.5 w-4.5 text-amber-500" />
              <h5 className="font-bold text-xs uppercase tracking-wider text-amber-400">
                Missing Checkout Days ({missingCheckoutDetails.length} missing checkouts recorded)
              </h5>
            </div>

            {missingCheckoutDetails.length === 0 ? (
              <p className="text-xs text-slate-500 italic py-4 bg-slate-850 p-4 rounded text-center border border-dashed border-slate-800">
                ⭐ Zero missing checkouts recorded for this worker in the selected calendar period!
              </p>
            ) : (
              <div className="border border-slate-800 rounded-lg overflow-hidden bg-slate-850">
                <table className="w-full text-left border-collapse text-xs font-mono">
                  <thead>
                    <tr className="bg-slate-800 font-bold text-slate-350 border-b border-slate-750">
                      <th className="p-2.5">Date</th>
                      <th className="p-2.5">Day</th>
                      <th className="p-2.5 text-center">Check-In</th>
                      <th className="p-2.5 text-center">Check-Out</th>
                      <th className="p-2.5 text-center">Status</th>
                      <th className="p-2.5 text-center">Admin Review Status</th>
                      <th className="p-2.5">Remarks</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 text-slate-300 text-[11px]">
                    {missingCheckoutDetails.map((m) => (
                      <tr key={m.date} className="hover:bg-slate-800/65">
                        <td className="p-2.5 font-bold text-slate-200">{m.date}</td>
                        <td className="p-2.5 font-sans">{m.dayName}</td>
                        <td className="p-2.5 text-center text-slate-200">{formatTime(m.checkIn)}</td>
                        <td className="p-2.5 text-center text-rose-400 font-bold">Missing</td>
                        <td className="p-2.5 text-center font-sans text-[10px]">
                          <span className="bg-amber-400/20 text-amber-300 px-1.5 py-0.5 rounded text-[9px] font-bold">
                            {m.status}
                          </span>
                        </td>
                        <td className="p-2.5 text-center font-sans">
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                            m.adminReviewStatus === 'Pending Review' ? 'bg-amber-400/20 text-amber-300 font-bold' : 'bg-sky-400/20 text-sky-300 font-bold'
                          }`}>
                            {m.adminReviewStatus}
                          </span>
                        </td>
                        <td className="p-2.5 font-sans italic text-slate-400 text-[10px] truncate max-w-xs">{m.remarks || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* 4. Short Hours Days Section */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center gap-1.5 border-b border-slate-800 pb-2">
              <Clock className="h-4.5 w-4.5 text-orange-500" />
              <h5 className="font-bold text-xs uppercase tracking-wider text-orange-400">
                Short Hours Days ({shortHoursDetails.length} short hours shifts recorded)
              </h5>
            </div>

            {shortHoursDetails.length === 0 ? (
              <p className="text-xs text-slate-500 italic py-4 bg-slate-850 p-4 rounded text-center border border-dashed border-slate-800">
                ⭐ Zero hours shortfall violations recorded for this worker in the selected calendar period!
              </p>
            ) : (
              <div className="border border-slate-800 rounded-lg overflow-hidden bg-slate-850">
                <table className="w-full text-left border-collapse text-xs font-mono">
                  <thead>
                    <tr className="bg-slate-800 font-bold text-slate-350 border-b border-slate-750">
                      <th className="p-2.5">Date</th>
                      <th className="p-2.5">Day</th>
                      <th className="p-2.5 text-center">Check-In</th>
                      <th className="p-2.5 text-center">Check-Out</th>
                      <th className="p-2.5 text-center">Worked Hours</th>
                      <th className="p-2.5 text-center">Required Hours</th>
                      <th className="p-2.5 text-center text-orange-400 font-bold font-extrabold">Short Hours</th>
                      <th className="p-2.5 text-center">Approval Status</th>
                      <th className="p-2.5">Remarks</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 text-slate-300 text-[11px]">
                    {shortHoursDetails.map((s) => (
                      <tr key={s.date} className="hover:bg-slate-800/65">
                        <td className="p-2.5 font-bold text-slate-200">{s.date}</td>
                        <td className="p-2.5 font-sans">{s.dayName}</td>
                        <td className="p-2.5 text-center text-slate-300">{formatTime(s.checkIn)}</td>
                        <td className="p-2.5 text-center text-slate-300">{formatTime(s.checkout)}</td>
                        <td className="p-2.5 text-center text-slate-200">{s.workedHours} hrs</td>
                        <td className="p-2.5 text-center text-slate-400">{s.requiredHours} hrs</td>
                        <td className="p-2.5 text-center font-bold text-orange-400 bg-orange-500/10">
                          {s.shortHours} hrs
                        </td>
                        <td className="p-2.5 text-center font-sans">
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                            s.approvalStatus === 'Pending Review' ? 'bg-orange-400/20 text-orange-350 text-orange-300' : 'bg-sky-400/20 text-sky-305 text-sky-300'
                          }`}>
                            {s.approvalStatus}
                          </span>
                        </td>
                        <td className="p-2.5 font-sans italic text-slate-400 text-[10px] truncate max-w-xs">{s.remarks || '-'}</td>
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
