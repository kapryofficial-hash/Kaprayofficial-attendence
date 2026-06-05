import React, { useState, useEffect, useMemo } from 'react';
import { 
  getSupabaseCredentials, 
  getSupabaseClient,
  SQL_SCHEMA_SCRIPT,
  DbEmployee, 
  DbAttendance,
  DbMonthlyReport,
  DbDepartment
} from './supabaseClient';
import { 
  loadEmployees, 
  saveEmployee, 
  loadAttendance, 
  saveAttendanceRecord,
  loadMonthlyReports,
  saveMonthlyReport,
  softDeleteEmployee,
  softDeleteAttendance,
  loadDepartments,
  loadCommissions,
  saveCommission,
  deleteCommission,
  loadAllowances,
  saveAllowance,
  deleteAllowance,
  saveAuditLog
} from './backendService';
import { 
  calculateAttendanceRecord, 
  calculateExcelSalary, 
  calculatePerformanceScore,
  formatPKR, 
  isFriday,
  downloadCSV,
  downloadExcel,
  calculateSundayEligibility,
  getMonthlyRequiredHours
} from './utils';
import { EmployeeCommission, EmployeeAllowance, AllowedUserRole } from './types';
import { SqlConfigModal } from './components/SqlConfigModal';
import { CsvImporter } from './components/CsvImporter';
import { RecycleBin } from './components/RecycleBin';
import { ReportView } from './components/ReportView';
import { AdminDashboard } from './components/AdminDashboard';
import { DepartmentManager } from './components/DepartmentManager';
import { Login } from './components/Login';
import { UserManagement } from './components/UserManagement';

// Lucide icon imports
import { 
  Users, 
  Calendar, 
  TableProperties, 
  Database, 
  Printer, 
  Save, 
  Plus, 
  Edit3, 
  Archive, 
  AlertTriangle, 
  CheckCircle2, 
  Search, 
  RefreshCw,
  Clock,
  Briefcase,
  Layers,
  FileSpreadsheet,
  Lock,
  Unlock,
  Trash2,
  Trash,
  UserCheck,
  ToggleLeft,
  ChevronDown,
  Activity,
  LogOut,
  Shield
} from 'lucide-react';

export default function App() {
  // Navigation
  const [activeTab, setActiveTab] = useState<'dashboard' | 'daily' | 'staff' | 'monthly' | 'reports' | 'recycle'>('dashboard');

  // Supabase state
  const [dbConfig, setDbConfig] = useState(getSupabaseCredentials());
  const [dbConnected, setDbConnected] = useState(false);
  const [isDbSetupOpen, setIsDbSetupOpen] = useState(false);

  // Entities list
  const [employees, setEmployees] = useState<DbEmployee[]>([]);
  const [attendance, setAttendance] = useState<DbAttendance[]>([]);
  const [monthlyReports, setMonthlyReports] = useState<DbMonthlyReport[]>([]);
  const [departments, setDepartments] = useState<DbDepartment[]>([]);
  const [commissions, setCommissions] = useState<EmployeeCommission[]>([]);
  const [allowances, setAllowances] = useState<EmployeeAllowance[]>([]);

  // Staff sub-modules navigation: 'roster' directory vs 'departments' settings manager
  const [staffSubTab, setStaffSubTab] = useState<'roster' | 'departments'>('roster');
  const [monthlySubTab, setMonthlySubTab] = useState<'salary' | 'commissions' | 'allowances'>('salary');

  // Deletion States
  const [deleteTarget, setDeleteTarget] = useState<{
    type: 'employee' | 'attendance_record' | 'monthly_report' | 'import_log';
    id: string;
    data: any;
    label: string;
  } | null>(null);
  const [deleteReason, setDeleteReason] = useState('');
  const [staffDeleteOption, setStaffDeleteOption] = useState<'disable' | 'soft' | 'permanent'>('disable');

  // Page level toggles and filters
  const [isCsvImportOpen, setIsCsvImportOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [dbError, setDbError] = useState<string | null>(null);

  // Authentication & Role session states (Requirement 2 & 3)
  const [sessionChecked, setSessionChecked] = useState(false);
  const [currentUser, setCurrentUser] = useState<any | null>(null);
  const [userRole, setUserRole] = useState<AllowedUserRole | null>(null);
  const [linkedEmployeeId, setLinkedEmployeeId] = useState<string | null>(null);
  const [isAccessRejected, setIsAccessRejected] = useState(false);

  // Derive Admin privilege safely (Requirement 3: Role UI)
  const isAdmin = useMemo(() => {
    return userRole === 'super_admin' || userRole === 'admin' || userRole === 'manager';
  }, [userRole]);

  // Auth synchronization listener
  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      setSessionChecked(true);
      return;
    }

    const checkInitialSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session && session.user) {
          setCurrentUser(session.user);
          const { data: roleData, error } = await supabase
            .from('user_roles')
            .select('role, employee_id')
            .eq('user_id', session.user.id)
            .maybeSingle();

          if (error) {
            console.error('Initial session fetch role error:', error);
          } else if (roleData && roleData.role) {
            setUserRole(roleData.role as AllowedUserRole);
            setLinkedEmployeeId(roleData.employee_id || null);
            setIsAccessRejected(false);
          } else {
            setIsAccessRejected(true);
            await supabase.auth.signOut();
          }
        }
      } catch (e) {
        console.error('Session initial check crash:', e);
      } finally {
        setSessionChecked(true);
      }
    };

    checkInitialSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session && session.user) {
        setCurrentUser(session.user);
        try {
          const { data: roleData } = await supabase
            .from('user_roles')
            .select('role, employee_id')
            .eq('user_id', session.user.id)
            .maybeSingle();

          if (roleData && roleData.role) {
            setUserRole(roleData.role as AllowedUserRole);
            setLinkedEmployeeId(roleData.employee_id || null);
            setIsAccessRejected(false);
          } else {
            setIsAccessRejected(true);
            setUserRole(null);
            setLinkedEmployeeId(null);
          }
        } catch (e) {
          console.error('AuthStateChanged role check failure:', e);
        }
      } else {
        setCurrentUser(null);
        setUserRole(null);
        setLinkedEmployeeId(null);
        if (event === 'SIGNED_OUT') {
          // Clear sensitive cache to block offline bypass (Requirement 4)
          const keysToClear = [
            'excel_erp_employees',
            'excel_erp_attendance_records',
            'excel_erp_monthly_reports',
            'excel_erp_employee_commissions',
            'excel_erp_employee_allowances',
            'excel_erp_edit_history',
            'excel_erp_deleted_records',
            'excel_erp_import_logs',
            'excel_erp_departments',
            'excel_erp_salary_adjustments'
          ];
          keysToClear.forEach(k => localStorage.removeItem(k));
        }
      }
      setSessionChecked(true);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [dbConfig]);

  // Synchronize permitted active tab with roles (Requirement 3: Role UI)
  useEffect(() => {
    if (!userRole) return;
    const permittedTabs = [
      { id: 'dashboard', roles: ['super_admin', 'admin', 'manager'] },
      { id: 'daily', roles: ['super_admin', 'admin', 'manager'] },
      { id: 'staff', roles: ['super_admin', 'admin'] },
      { id: 'monthly', roles: ['super_admin', 'admin', 'manager'] },
      { id: 'reports', roles: ['super_admin', 'admin', 'manager', 'staff_viewer'] },
      { id: 'recycle', roles: ['super_admin', 'admin'] },
      { id: 'users', roles: ['super_admin'] }
    ].filter(t => t.roles.includes(userRole)).map(t => t.id);

    if (!permittedTabs.includes(activeTab)) {
      setActiveTab(permittedTabs[0] as any);
    }
  }, [userRole, activeTab]);

  const handleLoginSuccess = async (user: any, role: AllowedUserRole, employeeId: string | null) => {
    setCurrentUser(user);
    setUserRole(role);
    setLinkedEmployeeId(employeeId);
    setIsAccessRejected(false);

    // Audit Log: User logged in (Requirement 5)
    await saveAuditLog({
      id: `log_${Date.now()}`,
      user_id: user.id,
      user_email: user.email,
      role: role,
      action: 'login',
      table_name: 'auth_users',
      record_id: user.id
    });
  };

  const handleSignOut = async () => {
    try {
      if (currentUser && userRole) {
        // Audit Log: User logging out (Requirement 5)
        await saveAuditLog({
          id: `log_${Date.now()}`,
          user_id: currentUser.id,
          user_email: currentUser.email,
          role: userRole,
          action: 'logout',
          table_name: 'auth_users',
          record_id: currentUser.id
        });
      }
      const supabase = getSupabaseClient();
      if (supabase) {
        await supabase.auth.signOut();
      }
    } catch (e) {
      console.error('Signout error:', e);
    } finally {
      setCurrentUser(null);
      setUserRole(null);
      setLinkedEmployeeId(null);
      localStorage.clear();
      window.location.reload();
    }
  };

  // Active Date workspace filters
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    return new Date().toISOString().split('T')[0]; // Format: YYYY-MM-DD
  });
  const [salaryMonth, setSalaryMonth] = useState<string>(() => {
    return new Date().toISOString().slice(0, 7); // Format: YYYY-MM
  });

  // Employee CRUD states
  const [isAddEmployeeModalOpen, setIsAddEmployeeModalOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<DbEmployee | null>(null);

  // New Employee fields
  const [newId, setNewId] = useState('');
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newDesignation, setNewDesignation] = useState('');
  const [newDept, setNewDept] = useState('Stitching');
  const [newDeptId, setNewDeptId] = useState('');
  const [newSalary, setNewSalary] = useState(25000);

  // Daily Worksheet row draft edits
  const [draftEdits, setDraftEdits] = useState<{[recordId: string]: { checkIn?: string; checkOut?: string; manualStatus?: string; remarks?: string } }>({});
  const [saveStatus, setSaveStatus] = useState<{[recordId: string]: 'idle' | 'saving' | 'saved' | 'failed'}>({});

  // Commissions CRUD States
  const [newCommEmp, setNewCommEmp] = useState('');
  const [newCommAmount, setNewCommAmount] = useState<number>(0);
  const [newCommReason, setNewCommReason] = useState('');
  const [newCommAddedBy, setNewCommAddedBy] = useState('Admin');

  // Allowances CRUD States
  const [newAllowEmp, setNewAllowEmp] = useState('');
  const [newAllowAmount, setNewAllowAmount] = useState<number>(0);
  const [newAllowType, setNewAllowType] = useState<'Attendance Bonus' | 'Punctuality Bonus' | 'Performance Bonus' | 'Manual Bonus'>('Attendance Bonus');
  const [newAllowReason, setNewAllowReason] = useState('');

  const handleAddCommission = async () => {
    if (!newCommEmp || newCommAmount <= 0) {
      alert('Please select an employee and enter a positive commission amount.');
      return;
    }
    const [y, m] = salaryMonth.split('-');
    const newComm: EmployeeCommission = {
      id: `comm_${Date.now()}`,
      employee_id: newCommEmp,
      month: m,
      year: y,
      commission_amount: newCommAmount,
      commission_reason: newCommReason || 'Monthly Sales Commission',
      added_by: currentUser?.email || 'Admin',
      approved_by: currentUser?.email || 'Admin',
      approved_at: new Date().toISOString()
    };
    const res = await saveCommission(newComm);
    if (res.success) {
      // Audit Log: Commission added (Requirement 5)
      if (currentUser) {
        await saveAuditLog({
          id: `log_${Date.now()}`,
          user_id: currentUser.id,
          user_email: currentUser.email,
          role: userRole || 'unassigned',
          action: 'commission_add',
          table_name: 'employee_commissions',
          record_id: newComm.id,
          new_data: JSON.stringify(newComm)
        });
      }

      const commRes = await loadCommissions();
      setCommissions(commRes.data || []);
      setNewCommAmount(0);
      setNewCommReason('');
      alert('Commission added and approved successfully!');
    } else {
      alert(`Error saving commission: ${res.error}`);
    }
  };

  const handleDeleteComm = async (id: string) => {
    if (!confirm('Are you sure you want to delete this commission?')) return;
    const oldComm = commissions.find(c => c.id === id);
    const res = await deleteCommission(id);
    if (res.success) {
      // Audit Log: Commission deleted (Requirement 5)
      if (currentUser) {
        await saveAuditLog({
          id: `log_${Date.now()}`,
          user_id: currentUser.id,
          user_email: currentUser.email,
          role: userRole || 'unassigned',
          action: 'commission_delete', // custom action
          table_name: 'employee_commissions',
          record_id: id,
          old_data: oldComm ? JSON.stringify(oldComm) : null
        });
      }

      const commRes = await loadCommissions();
      setCommissions(commRes.data || []);
    } else {
      alert(`Error deleting commission: ${res.error}`);
    }
  };

  const handleAddAllowance = async () => {
    if (!newAllowEmp || newAllowAmount <= 0) {
      alert('Please select an employee and enter a positive allowance amount.');
      return;
    }
    const [y, m] = salaryMonth.split('-');
    const newAllow: EmployeeAllowance = {
      id: `allow_${Date.now()}`,
      employee_id: newAllowEmp,
      month: m,
      year: y,
      allowance_amount: newAllowAmount,
      allowance_type: newAllowType,
      reason: newAllowReason || `${newAllowType} reward`,
      approved_by: currentUser?.email || 'Admin'
    };
    const res = await saveAllowance(newAllow);
    if (res.success) {
      // Audit Log: Allowance added (Requirement 5)
      if (currentUser) {
        await saveAuditLog({
          id: `log_${Date.now()}`,
          user_id: currentUser.id,
          user_email: currentUser.email,
          role: userRole || 'unassigned',
          action: 'allowance_add',
          table_name: 'employee_allowances',
          record_id: newAllow.id,
          new_data: JSON.stringify(newAllow)
        });
      }

      const allowRes = await loadAllowances();
      setAllowances(allowRes.data || []);
      setNewAllowAmount(0);
      setNewAllowReason('');
      alert('Allowance added and approved successfully!');
    } else {
      alert(`Error saving allowance: ${res.error}`);
    }
  };

  const handleDeleteAllow = async (id: string) => {
    if (!confirm('Are you sure you want to delete this allowance?')) return;
    const oldAllow = allowances.find(a => a.id === id);
    const res = await deleteAllowance(id);
    if (res.success) {
      // Audit Log: Allowance deleted (Requirement 5)
      if (currentUser) {
        await saveAuditLog({
          id: `log_${Date.now()}`,
          user_id: currentUser.id,
          user_email: currentUser.email,
          role: userRole || 'unassigned',
          action: 'allowance_delete', // custom action
          table_name: 'employee_allowances',
          record_id: id,
          old_data: oldAllow ? JSON.stringify(oldAllow) : null
        });
      }

      const allowRes = await loadAllowances();
      setAllowances(allowRes.data || []);
    } else {
      alert(`Error deleting allowance: ${res.error}`);
    }
  };

  // Outer interactive filtering from dashboard card widgets
  const [dashboardFilters, setDashboardFilters] = useState<any | null>(null);

  const [salaryAdjustments, setSalaryAdjustments] = useState<Record<string, { amount: number; approved: boolean; reason: string }>>(() => {
    try {
      const saved = localStorage.getItem('excel_erp_salary_adjustments');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const updateSalaryAdjustment = async (empId: string, month: string, amount: number, approved: boolean, reason: string) => {
    const key = `${empId}_${month}`;
    const oldAdjustment = salaryAdjustments[key];
    const updated = {
      ...salaryAdjustments,
      [key]: { amount, approved, reason }
    };
    setSalaryAdjustments(updated);
    localStorage.setItem('excel_erp_salary_adjustments', JSON.stringify(updated));

    // Audit Log: Monthly salary adjustments & approvals (Requirement 5)
    if (currentUser && (!oldAdjustment || oldAdjustment.amount !== amount || oldAdjustment.approved !== approved || oldAdjustment.reason !== reason)) {
      await saveAuditLog({
        id: `log_${Date.now()}`,
        user_id: currentUser.id,
        user_email: currentUser.email,
        role: userRole || 'unassigned',
        action: 'salary_approval',
        table_name: 'monthly_salary_adjustments',
        record_id: key,
        old_data: oldAdjustment ? JSON.stringify(oldAdjustment) : null,
        new_data: JSON.stringify({ amount, approved, reason })
      });
    }
  };

  const handleDashboardFilterTrigger = (filterName: string, value: any) => {
    if (filterName === 'present_today') {
      setDashboardFilters({ filterDate: value, filterStatus: 'Present', activeTab: 'daily' });
    } else if (filterName === 'absent_today') {
      setDashboardFilters({ filterDate: value, filterStatus: 'Absent', activeTab: 'daily' });
    } else if (filterName === 'late_today') {
      setDashboardFilters({ filterDate: value, onlyLate: true, activeTab: 'daily' });
    } else if (filterName === 'missing_checkout_today') {
      setDashboardFilters({ filterDate: value, onlyMissingCheckout: true, activeTab: 'daily' });
    } else if (filterName === 'overtime_today') {
      setDashboardFilters({ filterDate: value, onlyOvertime: true, activeTab: 'daily' });
    } else if (filterName === 'late_this_month') {
      setDashboardFilters({ onlyLate: true, activeTab: 'monthly-performance' });
    } else if (filterName === 'punctual_this_month') {
      setDashboardFilters({ onlyHighPerformance: true, activeTab: 'monthly-performance' });
    } else if (filterName === 'needs_attention_this_month') {
      setDashboardFilters({ onlyNeedsAttention: true, activeTab: 'monthly-performance' });
    } else if (filterName === 'absent_this_month') {
      setDashboardFilters({ onlyAbsent: true, activeTab: 'monthly-performance' });
    } else if (filterName === 'overtime_this_month') {
      setDashboardFilters({ onlyOvertime: true, activeTab: 'monthly-performance' });
    } else if (filterName === 'best_score_this_month') {
      setDashboardFilters({ onlyHighPerformance: true, activeTab: 'monthly-performance' });
    } else if (filterName === 'staff_report') {
      setDashboardFilters({ filterEmpId: value, activeTab: 'monthly-performance' });
    }
    setActiveTab('reports');
  };

  // Sync / Fetch sequence
  const reloadAllData = async () => {
    setIsLoading(true);
    setDbError(null);
    try {
      const dbUrlSet = !!dbConfig.url && !!dbConfig.key;
      setDbConnected(dbUrlSet);

      const empRes = await loadEmployees(false); // only non-deleted
      const attRes = await loadAttendance(false); // only child records
      const reportsRes = await loadMonthlyReports();
      const deptRes = await loadDepartments(false);
      const commRes = await loadCommissions();
      const allowRes = await loadAllowances();

      setEmployees(empRes.data);
      setAttendance(attRes.data);
      setMonthlyReports(reportsRes.data || []);
      setDepartments(deptRes.data || []);
      setCommissions(commRes.data || []);
      setAllowances(allowRes.data || []);

      if (empRes.error || attRes.error || deptRes.error) {
        setDbError(empRes.error || attRes.error || deptRes.error || 'Check configurations.');
      }
    } catch (e: any) {
      setDbError(e.message || 'System sync failure.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (currentUser && userRole) {
      reloadAllData();
    }
  }, [dbConfig, currentUser, userRole]);

  // Read-only indicator status for archived months (Requirement 3)
  const isMonthArchived = useMemo(() => {
    const record = monthlyReports.find(r => r.id === salaryMonth);
    return record ? record.archived : false;
  }, [monthlyReports, salaryMonth]);

  // Filter attendance items matching active worksheet date
  const activeDateAttendance = useMemo(() => {
    let list = attendance.filter(a => a.date === selectedDate);
    if (userRole === 'staff_viewer' && linkedEmployeeId) {
      list = list.filter(a => a.employee_id === linkedEmployeeId);
    }
    return list;
  }, [attendance, selectedDate, userRole, linkedEmployeeId]);

  // Active staff on workspace (excluding deleted)
  const activeEmployees = useMemo(() => {
    let list = employees.filter(e => !e.is_deleted);
    if (userRole === 'staff_viewer' && linkedEmployeeId) {
      list = list.filter(e => e.id === linkedEmployeeId);
    }
    return list;
  }, [employees, userRole, linkedEmployeeId]);

  // Daily Worksheet employees logic (Requirement 3):
  // Disabled staff should not appear on new spreadsheets (today/future),
  // but if we are loading historic sheets and they had check logs, display they are present.
  const dailyWorksheetEmployees = useMemo(() => {
    let list = employees.filter(emp => {
      if (emp.is_deleted) return false;
      if (emp.status === 'Active' || emp.active) return true;
      // For disabled staff, only show if they had a record on that selected date!
      const hasRecord = attendance.some(a => a.employee_id === emp.id && a.date === selectedDate && !a.is_deleted);
      return hasRecord;
    });
    if (userRole === 'staff_viewer' && linkedEmployeeId) {
      list = list.filter(e => e.id === linkedEmployeeId);
    }
    return list;
  }, [employees, attendance, selectedDate, userRole, linkedEmployeeId]);

  // Save/Update daily record worksheet row
  const handleSaveWorksheetRow = async (empId: string) => {
    const recordId = `${empId}_${selectedDate}`;
    const draft = draftEdits[recordId] || {};
    
    // Find current record matching date/emp
    const current = activeDateAttendance.find(a => a.employee_id === empId);

    const mergedIn = draft.checkIn !== undefined ? draft.checkIn : (current ? current.check_in : '');
    const mergedOut = draft.checkOut !== undefined ? draft.checkOut : (current ? current.check_out : '');
    const mergedManual = draft.manualStatus !== undefined ? draft.manualStatus : (current ? current.manual_status : 'Auto');
    const mergedRemarks = draft.remarks !== undefined ? draft.remarks : (current ? current.remarks : '');

    // Calculate metrics using standard KaprayOfficial formulas
    const calculated = calculateAttendanceRecord(mergedIn || null, mergedOut || null, selectedDate, mergedManual);

    const updatedRecord: DbAttendance = {
      id: recordId,
      employee_id: empId,
      date: selectedDate,
      check_in: mergedIn || null,
      check_out: mergedOut || null,
      net_hours: calculated.netHours,
      late_minutes: calculated.lateMinutes,
      overtime_hours: calculated.overtimeHours,
      short_hours: calculated.shortHours,
      manual_status: mergedManual,
      status: calculated.status,
      remarks: mergedRemarks || '',
      is_deleted: false,
      edit_history: current && current.check_in !== mergedIn 
        ? `In edited to ${mergedIn} at ${new Date().toISOString()}`
        : 'Update'
    };

    setSaveStatus(prev => ({ ...prev, [recordId]: 'saving' }));
    
    const res = await saveAttendanceRecord(updatedRecord);
    if (res.success) {
      setSaveStatus(prev => ({ ...prev, [recordId]: 'saved' }));
      
      // Audit Log: Attendance update (Requirement 5)
      if (currentUser) {
        await saveAuditLog({
          id: `log_${Date.now()}`,
          user_id: currentUser.id,
          user_email: currentUser.email,
          role: userRole || 'unassigned',
          action: 'attendance_edit',
          table_name: 'attendance_records',
          record_id: updatedRecord.id,
          old_data: current ? JSON.stringify(current) : null,
          new_data: JSON.stringify(updatedRecord)
        });
      }

      // Reload matching records only
      const attFetch = await loadAttendance(false);
      setAttendance(attFetch.data);
      setTimeout(() => {
        setSaveStatus(prev => ({ ...prev, [recordId]: 'idle' }));
      }, 1500);
    } else {
      setSaveStatus(prev => ({ ...prev, [recordId]: 'failed' }));
      alert(`Backend operation error: ${res.error}`);
    }
  };

  // Open and auto-generate staff ID
  const handleOpenAddEmployee = () => {
    // Generate next EMP-XX code format based on max numeric employee codes
    const nextEmpNum = Math.max(...employees.map(e => {
      const match = (e.employee_code || e.id)?.match(/\d+/);
      return match ? parseInt(match[0], 10) : 0;
    }), 0) + 1;
    const formattedCode = `EMP-${String(nextEmpNum).padStart(2, '0')}`;
    setNewId(formattedCode);
    
    // Clear rest of fields
    setNewName('');
    setNewEmail('');
    setNewDesignation('');
    setNewSalary(25000);
    
    // Grab first active department if available
    const activeDepts = departments.filter(d => d.status === 'active');
    if (activeDepts.length > 0) {
      setNewDeptId(activeDepts[0].id);
      setNewDept(activeDepts[0].department_name);
    } else {
      setNewDeptId('');
      setNewDept('Stitching');
    }
    
    setIsAddEmployeeModalOpen(true);
  };

  // Staff CRUD: Add new member
  const handleAddEmployeeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newId || !newName) return;

    // Check pre-existence
    if (employees.some(emp => emp.id === newId && !emp.is_deleted)) {
      alert(`Identification code error: Staff ID "${newId}" is already assigned.`);
      return;
    }

    const savedEntity: DbEmployee = {
      id: newId,
      employee_code: newId,
      name: newName.trim(),
      email: newEmail || null,
      designation: newDesignation || 'Master Stitcher',
      department: newDept || 'Stitching',
      department_id: newDeptId || null,
      base_salary: Number(newSalary) || 25000,
      active: true,
      is_deleted: false,
      created_at: new Date().toISOString()
    };

    const res = await saveEmployee(savedEntity);
    if (res.success) {
      // Audit Log: Employee added (Requirement 5)
      if (currentUser) {
        await saveAuditLog({
          id: `log_${Date.now()}`,
          user_id: currentUser.id,
          user_email: currentUser.email,
          role: userRole || 'unassigned',
          action: 'add_staff',
          table_name: 'employees',
          record_id: savedEntity.id,
          new_data: JSON.stringify(savedEntity)
        });
      }

      // Clean form
      setNewId('');
      setNewName('');
      setNewEmail('');
      setNewDept('Stitching');
      setNewDeptId('');
      setNewSalary(25000);
      setIsAddEmployeeModalOpen(false);
      
      // Sync list
      const updated = await loadEmployees(false);
      setEmployees(updated.data);
      alert(`${newName} is now added into active staff rosters.`);
    } else {
      alert(`Storage failure: ${res.error}`);
    }
  };

  // Staff CRUD: Edit existing member
  const handleEditEmployeeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEmployee) return;

    const oldEmp = employees.find(emp => emp.id === editingEmployee.id);
    const res = await saveEmployee(editingEmployee);
    if (res.success) {
      // Audit Log: Employee updated (Requirement 5)
      if (currentUser) {
        await saveAuditLog({
          id: `log_${Date.now()}`,
          user_id: currentUser.id,
          user_email: currentUser.email,
          role: userRole || 'unassigned',
          action: 'edit_staff',
          table_name: 'employees',
          record_id: editingEmployee.id,
          old_data: oldEmp ? JSON.stringify(oldEmp) : null,
          new_data: JSON.stringify(editingEmployee)
        });
      }

      setEditingEmployee(null);
      const updated = await loadEmployees(false);
      setEmployees(updated.data);
    } else {
      alert(`Error updating profile: ${res.error}`);
    }
  };

  // Staff Disable/Enable toggle (Requirement 8 - Disable employee)
  const handleToggleEmployeeActive = async (emp: DbEmployee) => {
    const targetStatus = !emp.active;
    const msg = `Are you sure you want to ${targetStatus ? 'Enable' : 'Disable'} employee "${emp.name}"? Disabled staff remains saved historically but hides from daily worksheets.`;
    if (!window.confirm(msg)) return;

    const updated = { ...emp, active: targetStatus };
    const res = await saveEmployee(updated);
    if (res.success) {
      // Audit Log: Employee status toggle (Requirement 5 & 8)
      if (currentUser) {
        await saveAuditLog({
          id: `log_${Date.now()}`,
          user_id: currentUser.id,
          user_email: currentUser.email,
          role: userRole || 'unassigned',
          action: targetStatus ? 'restore_staff' : 'delete_staff', // Disable status mapped to delete_staff action in requirements
          table_name: 'employees',
          record_id: emp.id,
          old_data: JSON.stringify(emp),
          new_data: JSON.stringify(updated)
        });
      }

      const final = await loadEmployees(false);
      setEmployees(final.data);
    }
  };

  // Trigger modal for soft delete staff roster (Requirement 4)
  const handleDeleteEmployee = (emp: DbEmployee) => {
    setDeleteReason('');
    setStaffDeleteOption('disable');
    setDeleteTarget({
      type: 'employee',
      id: emp.id,
      data: emp,
      label: `Worker Profile: ${emp.name} (${emp.id})`
    });
  };

  // Perform actual execution of database soft or permanent delete (Requirements 2, 3, 4, 8)
  const executeActualDeletion = async () => {
    if (!deleteTarget) return;
    if (!deleteReason.trim()) {
      alert('Auditing Reason is mandatory before initiating resource deletion.');
      return;
    }

    const { type, id, data } = deleteTarget;
    setIsLoading(true);

    try {
      if (type === 'employee') {
        if (staffDeleteOption === 'disable') {
          // Rule 1: Set status to Disabled
          const updated = { ...data, active: false, status: 'Disabled' };
          const res = await saveEmployee(updated);
          if (res.success) {
            // Audit Log: Employee status toggle (Requirement 5)
            if (currentUser) {
              await saveAuditLog({
                id: `log_${Date.now()}`,
                user_id: currentUser.id,
                user_email: currentUser.email,
                role: userRole || 'unassigned',
                action: 'delete_staff', // disable status mapping
                table_name: 'employees',
                record_id: id,
                old_data: JSON.stringify(data),
                new_data: JSON.stringify(updated)
              });
            }
            alert(`Employee "${data.name}" status has been toggled to Disabled successfully.`);
          } else {
            alert(`Operation aborted: ${res.error}`);
          }
        } else if (staffDeleteOption === 'soft') {
          // Rule 2: Soft delete staff, transfer into deleted_records
          const res = await softDeleteEmployee(id, data);
          if (res.success) {
            // Audit Log: Employee soft delete (Requirement 5)
            if (currentUser) {
              await saveAuditLog({
                id: `log_${Date.now()}`,
                user_id: currentUser.id,
                user_email: currentUser.email,
                role: userRole || 'unassigned',
                action: 'delete_staff',
                table_name: 'employees',
                record_id: id,
                old_data: JSON.stringify(data)
              });
            }
            alert(`Employee "${data.name}" profile soft-deleted and transferred into the Recycle Bin successfully.`);
          } else {
            alert(`Failed soft-deletion: ${res.error}`);
          }
        } else if (staffDeleteOption === 'permanent') {
          // Rule 3: Hard wipe of employee and all their associated records
          const { permanentDeleteRecord } = await import('./backendService');
          const trashRecordObject = {
            id: `del_employee_${id}_temp`,
            table_name: 'employees',
            record_id: id,
            record_data: data,
            deleted_by: currentUser?.email || 'Admin',
            deleted_at: new Date().toISOString(),
            restore_until: new Date().toISOString(),
            delete_reason: deleteReason
          };
          const res = await permanentDeleteRecord(trashRecordObject);
          if (res.success) {
            // Audit Log: Employee hard wipe (Requirement 5 & 10)
            if (currentUser) {
              await saveAuditLog({
                id: `log_${Date.now()}`,
                user_id: currentUser.id,
                user_email: currentUser.email,
                role: userRole || 'unassigned',
                action: 'hard_wipe',
                table_name: 'employees',
                record_id: id,
                old_data: JSON.stringify(data)
              });
            }
            alert(`Employee "${data.name}" and all historical records have been permanently purged from database.`);
          } else {
            alert(`Purge failed: ${res.error}`);
          }
        }
      } else if (type === 'attendance_record') {
        const { softDeleteRecord } = await import('./backendService');
        const res = await softDeleteRecord('attendance_record', id, data, currentUser?.email || 'Admin', deleteReason);
        if (res.success) {
          // Audit Log: Attendance soft delete (Requirement 5)
          if (currentUser) {
            await saveAuditLog({
              id: `log_${Date.now()}`,
              user_id: currentUser.id,
              user_email: currentUser.email,
              role: userRole || 'unassigned',
              action: 'attendance_delete',
              table_name: 'attendance_records',
              record_id: id,
              old_data: JSON.stringify(data)
            });
          }
          alert('Attendance log successfully soft-deleted and moved into Recycle Bin.');
        } else {
          alert(`Failed: ${res.error}`);
        }
      }

      setDeleteTarget(null);
      await reloadAllData();
    } catch (err: any) {
      alert(`Deletion process could not build: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Trigger monthly lock / archive logic (Requirement 3)
  const handleArchiveMonthToggle = async () => {
    const isNowArchiving = !isMonthArchived;
    const promptMsg = isNowArchiving
       ? `Archive "${salaryMonth}" data worksheet? This makes all matching records read-only to prevent editing unless unlocked again.`
       : `Unlock archived worksheet for "${salaryMonth}"? This restores standard worksheet editing options.`;

    if (!window.confirm(promptMsg)) return;

    const [y, m] = salaryMonth.split('-');
    const payload: DbMonthlyReport = {
      id: salaryMonth,
      month: m,
      year: y,
      archived: isNowArchiving,
      locked: isNowArchiving
    };

    const res = await saveMonthlyReport(payload);
    if (res.success) {
      // Audit Log: Archive toggle (Requirement 5)
      if (currentUser) {
        await saveAuditLog({
          id: `log_${Date.now()}`,
          user_id: currentUser.id,
          user_email: currentUser.email,
          role: userRole || 'unassigned',
          action: 'hard_wipe', // Archiving/Hard locking fits compliance archives
          table_name: 'monthly_reports',
          record_id: payload.id,
          new_data: JSON.stringify(payload)
        });
      }
      const updatedList = await loadMonthlyReports();
      setMonthlyReports(updatedList.data);
    } else {
      alert(`Operation failed: ${res.error}`);
    }
  };

  // Computed Salary Ledger Summary
  const monthlySalaryData = useMemo(() => {
    const [y, m] = salaryMonth.split('-');
    
    // Calculate values per active employee matching salaryMonth
    return activeEmployees.map(emp => {
      // Select records matching this employee, date month scope, and non-deleted
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
      
      const totalDays = presents + halfDays + leaves + offs + absents;
      const attendancePercentage = totalDays > 0 
        ? parseFloat((((presents + leaves + offs + (halfDays * 0.5)) / totalDays) * 100).toFixed(1)) 
        : 100;

      const scoreObj = calculatePerformanceScore(empMonthAttendance.map(a => ({
        status: a.status || '',
        late_minutes: a.late_minutes || 0,
        net_hours: a.net_hours || 0,
        overtime_hours: a.overtime_hours || 0
      })));
      const performanceScore = scoreObj.score;

      // UPGRADED SALARY CALCULATION RULES PER USER SPECIFICATION:
      const basicSalary = emp.base_salary || emp.salary || 0;
      const reqHours = getMonthlyRequiredHours(parseInt(y, 10), parseInt(m, 10)) || 1; // avoid divide by zero
      const hourlyRate = parseFloat((basicSalary / reqHours).toFixed(4));

      // Sum short & overtime hours for all days in the month
      const totalShortHours = empMonthAttendance.reduce((acc, a) => acc + (a.short_hours || 0), 0);
      const totalOvertime = empMonthAttendance.reduce((acc, a) => acc + (a.overtime_hours || 0), 0);

      const adjustedShortHours = Math.max(0, totalShortHours - totalOvertime);
      const netPayableOvertimeHours = Math.max(0, totalOvertime - totalShortHours);

      const timingBasedSalary = Math.max(0, basicSalary - (adjustedShortHours * hourlyRate));
      const overtimePay = netPayableOvertimeHours * hourlyRate;

      // Approved commissions
      const empComms = commissions.filter(c => c.employee_id === emp.id && c.month === m && c.year === y && c.approved_by);
      const commissionAmount = empComms.reduce((acc, c) => acc + (c.commission_amount || 0), 0);

      // Approved allowances
      const empAllws = allowances.filter(a => a.employee_id === emp.id && a.month === m && a.year === y && a.approved_by);
      const attendanceBonus = empAllws.filter(a => a.allowance_type === 'Attendance Bonus').reduce((acc, a) => acc + (a.allowance_amount || 0), 0);
      const punctualityBonus = empAllws.filter(a => a.allowance_type === 'Punctuality Bonus').reduce((acc, a) => acc + (a.allowance_amount || 0), 0);
      const performanceBonus = empAllws.filter(a => a.allowance_type === 'Performance Bonus').reduce((acc, a) => acc + (a.allowance_amount || 0), 0);
      const manualBonus = empAllws.filter(a => a.allowance_type === 'Manual Bonus').reduce((acc, a) => acc + (a.allowance_amount || 0), 0);

      const totalAllowances = attendanceBonus + punctualityBonus + performanceBonus + manualBonus;

      const suggestedFinalSalary = timingBasedSalary + overtimePay + commissionAmount + totalAllowances;

      const adjustment = salaryAdjustments[`${emp.id}_${salaryMonth}`] || { amount: 0, approved: false, reason: '' };
      const finalSalary = Math.round(suggestedFinalSalary + (adjustment.approved ? Number(adjustment.amount) : 0));

      return {
        employee: emp,
        presents,
        halfDays,
        leaves,
        offs,
        absents,
        requiredHours: reqHours,
        hourlyRate,
        totalShortHours,
        totalOvertimeHours: totalOvertime,
        overtimeHours: totalOvertime,
        shortHours: totalShortHours,
        adjustedShortHours,
        netPayableOvertimeHours,
        timingBasedSalary: parseFloat(timingBasedSalary.toFixed(2)),
        overtimePay: parseFloat(overtimePay.toFixed(2)),
        commissionAmount,
        totalAllowances,
        attendanceBonus,
        punctualityBonus,
        performanceBonus,
        manualBonus,
        suggestedFinalSalary: parseFloat(suggestedFinalSalary.toFixed(2)),
        attendancePercentage,
        performanceScore,
        calculatedSalary: parseFloat(suggestedFinalSalary.toFixed(2)), // compatibility fallback
        adjustment,
        finalSalary
      };
    });
  }, [activeEmployees, attendance, salaryMonth, salaryAdjustments, commissions, allowances]);

  // Bulk worksheet synchronization button helper
  const handleBulkWorksheetSave = async () => {
    if (isMonthArchived) {
      alert('Operation Blocked: Current workspace month is archived as read-only.');
      return;
    }
    const unsavedKeys = Object.keys(draftEdits);
    if (unsavedKeys.length === 0) {
      alert('Excel Worksheet Status: All rows are up to date and synchronized.');
      return;
    }

    setIsLoading(true);
    const recordsToSave: DbAttendance[] = [];
    const statusMapSaving: Record<string, 'saving'> = {};
    
    unsavedKeys.forEach(recordId => {
      const empId = recordId.split('_')[0];
      const draft = draftEdits[recordId] || {};
      const current = attendance.find(a => a.id === recordId && !a.is_deleted);

      const mergedIn = draft.checkIn !== undefined ? draft.checkIn : (current ? current.check_in : '');
      const mergedOut = draft.checkOut !== undefined ? draft.checkOut : (current ? current.check_out : '');
      const mergedManual = draft.manualStatus !== undefined ? draft.manualStatus : (current ? current.manual_status : 'Auto');
      const mergedRemarks = draft.remarks !== undefined ? draft.remarks : (current ? current.remarks : '');

      const calculated = calculateAttendanceRecord(mergedIn || null, mergedOut || null, selectedDate, mergedManual);

      const updatedRecord: DbAttendance = {
        id: recordId,
        employee_id: empId,
        date: selectedDate,
        check_in: mergedIn || null,
        check_out: mergedOut || null,
        net_hours: calculated.netHours,
        late_minutes: calculated.lateMinutes,
        overtime_hours: calculated.overtimeHours,
        short_hours: calculated.shortHours,
        manual_status: mergedManual,
        status: calculated.status,
        remarks: mergedRemarks || '',
        is_deleted: false,
        edit_history: current && current.check_in !== mergedIn 
          ? `In edited to ${mergedIn} at ${new Date().toISOString()}`
          : 'Bulk Update'
      };

      recordsToSave.push(updatedRecord);
      statusMapSaving[recordId] = 'saving';
    });

    setSaveStatus(prev => ({ ...prev, ...statusMapSaving }));

    const { saveAttendanceRecordsBulk, loadAttendance } = await import('./backendService');
    const res = await saveAttendanceRecordsBulk(recordsToSave);

    if (res.success) {
      const statusMapSaved: Record<string, 'saved'> = {};
      unsavedKeys.forEach(k => { statusMapSaved[k] = 'saved'; });
      setSaveStatus(prev => ({ ...prev, ...statusMapSaved }));

      // Reload matching records once
      const attFetch = await loadAttendance(false);
      setAttendance(attFetch.data);
      setDraftEdits({});

      setTimeout(() => {
        const statusMapIdle: Record<string, 'idle'> = {};
        unsavedKeys.forEach(k => { statusMapIdle[k] = 'idle'; });
        setSaveStatus(prev => ({ ...prev, ...statusMapIdle }));
      }, 1500);

      setIsLoading(false);
      alert('Synchronized daily spreadsheet successfully with high integrity!');
    } else {
      const statusMapFailed: Record<string, 'failed'> = {};
      unsavedKeys.forEach(k => { statusMapFailed[k] = 'failed'; });
      setSaveStatus(prev => ({ ...prev, ...statusMapFailed }));
      setIsLoading(false);
      alert(`Bulk Synchronization failed: ${res.error}`);
    }
  };

  // Generate CSV/Excel report of computed Salaries
  const exportSalaries = (isExcel: boolean) => {
    const headers = [
      'Employee Code',
      'Employee Name',
      'Basic Salary',
      'Present Days',
      'Half Days',
      'Absent Days',
      'Leave Days',
      'Overtime Hours',
      'Attendance Percentage',
      'Performance Score',
      'Calculated Salary',
      'Manual Adjustments',
      'Final Salary'
    ];

    const rows = monthlySalaryData.map(row => {
      const adjAmount = row.adjustment.approved ? row.adjustment.amount : 0;
      return [
        row.employee.id,
        row.employee.name,
        row.employee.base_salary,
        row.presents,
        row.halfDays,
        row.absents,
        row.leaves,
        row.overtimeHours,
        `${row.attendancePercentage}%`,
        row.performanceScore,
        row.calculatedSalary,
        adjAmount,
        row.finalSalary
      ];
    });

    const filename = `KAPRAYOFFICIAL_SALARY_SHEET_${salaryMonth}`;
    if (isExcel) {
      downloadExcel(`${filename}.csv`, headers, rows);
    } else {
      downloadCSV(`${filename}.csv`, headers, rows);
    }
  };

  if (!sessionChecked) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6 selection:bg-emerald-500/30 selection:text-white">
        <div className="bg-slate-900/40 rounded-3xl p-8 border border-slate-800/60 max-w-sm w-full text-center space-y-4 shadow-2xl backdrop-blur-xl">
          <RefreshCw className="h-8 w-8 animate-spin mx-auto text-emerald-400" />
          <h2 className="text-sm font-bold text-white tracking-wide uppercase">Securing Workspace...</h2>
          <p className="text-xs text-slate-400 leading-relaxed font-mono">Loading authentication tokens & active credentials from KaprayOfficial Cloud Node...</p>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return <Login onLoginSuccess={handleLoginSuccess} />;
  }

  if (isAccessRejected || !userRole) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6 selection:bg-rose-500/30 selection:text-white">
        <div className="bg-slate-900/40 rounded-3xl p-8 border border-rose-900/40 max-w-sm w-full text-center space-y-5 shadow-2xl backdrop-blur-xl">
          <Shield className="h-10 w-10 mx-auto text-rose-500 animate-pulse" />
          <div className="space-y-1">
            <h2 className="text-base font-bold text-white tracking-tight leading-none">Security Access Rejected</h2>
            <p className="text-xs text-rose-400 font-mono mt-1 uppercase">STATUS: RESTRICTED</p>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            Your login email **{currentUser.email}** is verified, but has not been assigned a workspace role yet. Public view is restricted to maintain system security.
          </p>
          <div className="pt-2">
            <button
              onClick={handleSignOut}
              className="w-full py-2.5 bg-slate-900 hover:bg-slate-850 text-slate-300 rounded-xl text-xs font-extrabold border border-slate-800 tracking-wider uppercase cursor-pointer transition-colors"
            >
              Sign Out & Back to Login
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div id="kaprayofficial-apps-container" className="min-h-screen bg-slate-50 flex flex-col font-sans selection:bg-emerald-100 antialiased">
      
      {/* 1. Header Branded Navigation Area */}
      <header className="bg-slate-900 text-white shadow-lg border-b border-slate-850 no-print sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            
            {/* Branding Logo */}
            <div className="flex items-center gap-2.5">
              <div className="h-9 w-9 bg-emerald-600 rounded-lg flex items-center justify-center text-white font-extrabold text-sm shadow-md">
                KO
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <h1 className="text-sm font-bold tracking-tight">KaprayOfficial Manufacturers</h1>
                  <span className="bg-emerald-500/20 text-emerald-400 text-[9px] font-bold px-1.5 py-0.5 rounded border border-emerald-500/35">
                    MASTER CONTROL
                  </span>
                </div>
                <p className="text-[10px] text-slate-400">Excel ERP Duty Attendance Console</p>
              </div>
            </div>

            {/* Profile Level Info - Security Display */}
            <div className="hidden md:flex items-center gap-4 text-xs font-semibold text-slate-300">
              
              <div className="flex items-center gap-1.5 bg-slate-950/45 px-2.5 py-1.5 rounded-lg border border-slate-800">
                <span className="text-slate-400 font-medium">Session:</span>
                <span className="text-slate-200 truncate max-w-[150px] font-mono font-medium">{currentUser.email}</span>
                <span className="h-1.5 w-1.5 rounded-full bg-slate-700 mx-1"></span>
                <span className="px-1.5 py-0.5 bg-emerald-900/35 text-emerald-400 border border-emerald-900/50 rounded text-[9px] font-extrabold uppercase tracking-wider inline-flex items-center gap-1">
                  <Shield className="h-3 w-3" />
                  {userRole === 'super_admin' ? 'Super Admin' :
                   userRole === 'admin' ? 'Administrator' :
                   userRole === 'manager' ? 'Staff Manager' : 'Staff Viewer'}
                </span>
              </div>

              {/* Connected mode status */}
              <div className="flex items-center gap-1.5 border-l pl-4 border-slate-800">
                <span className={`h-2.5 w-2.5 rounded-full bg-emerald-400`}></span>
                <span className="text-slate-350">Supabase Synchronized</span>
              </div>
            </div>

            {/* Quick Action Button & Sign Out */}
            <div className="flex items-center gap-2">
              {userRole === 'super_admin' && (
                <button
                  type="button"
                  onClick={() => setIsDbSetupOpen(true)}
                  className="bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-700 px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-colors flex items-center gap-1"
                >
                  <Database className="h-3.5 w-3.5 text-emerald-400" />
                  DB Server
                </button>
              )}

              <button
                type="button"
                onClick={handleSignOut}
                className="bg-rose-9550/45 hover:bg-rose-950/70 text-rose-250 border border-rose-900/40 hover:border-rose-900/80 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-colors flex items-center gap-1 select-none active:scale-95"
              >
                <LogOut className="h-3.5 w-3.5 text-rose-400" />
                Sign Out
              </button>
            </div>

          </div>
        </div>
      </header>

      {/* Connection Mode warning banner */}
      {!dbConnected && (
        <div id="credentials-bar" className="bg-amber-50 border-b border-amber-200 text-slate-800 py-2.5 px-4 text-xs font-semibold flex items-center justify-between no-print">
          <div className="flex items-center gap-1.5 mx-auto">
            <AlertTriangle className="h-4.5 w-4.5 text-amber-600 animate-pulse" />
            <span>Working in offline mode fallback. All activities are cached in localStorage, but bind Supabase keys for multi-user security.</span>
            <button 
              onClick={() => setIsDbSetupOpen(true)}
              className="text-emerald-700 underline font-extrabold hover:text-emerald-800 cursor-pointer ml-1"
            >
              Connect live database
            </button>
          </div>
        </div>
      )}

      {/* Main Container Layout */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        
        {/* Navigation Tabs bar - Excel Worksheet tabs */}
        <div id="tabs-navigation" className="flex items-center justify-between border-b border-slate-200 no-print overflow-x-auto gap-2">
          <div className="flex gap-1.5">
            {[
              { id: 'dashboard', label: 'Analytics Dashboard', icon: Activity, roles: ['super_admin', 'admin', 'manager'] },
              { id: 'daily', label: '1. Daily sheet worksheet', icon: TableProperties, roles: ['super_admin', 'admin', 'manager'] },
              { id: 'staff', label: '2. Staff roster manager', icon: Users, roles: ['super_admin', 'admin'] },
              { id: 'monthly', label: '3. Monthly worksheet & Salary', icon: FileSpreadsheet, roles: ['super_admin', 'admin', 'manager'] },
              { id: 'reports', label: '4. Printable reports and statistics', icon: Printer, roles: ['super_admin', 'admin', 'manager', 'staff_viewer'] },
              { id: 'recycle', label: '5. Trash bin & RLS Audits', icon: Trash, roles: ['super_admin', 'admin'] },
              { id: 'users', label: '🔑 User Access Control', icon: UserCheck, roles: ['super_admin'] }
            ].filter(tab => tab.roles.includes(userRole || '')).map(tab => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`py-2 px-3.5 font-bold text-xs rounded-t-lg transition-all duration-100 flex items-center gap-1.5 cursor-pointer whitespace-nowrap border-b-2 hover:bg-slate-100 ${
                    isActive 
                      ? 'border-emerald-600 text-emerald-800 bg-white font-extrabold shadow-sm' 
                      : 'border-transparent text-slate-550'
                  }`}
                >
                  <Icon className={`h-4 w-4 ${isActive ? 'text-emerald-600' : 'text-slate-400'}`} />
                  {tab.label}
                </button>
              );
            })}
          </div>

          <div className="text-slate-400 text-xs italic tracking-tight hidden lg:block pr-1 font-mono">
            Timezone status: {new Date().toLocaleDateString()}
          </div>
        </div>

        {/* --- SYSTEM WORKSPACES SWITCH CASE --- */}
        
        {isLoading ? (
          <div className="text-center py-20 text-slate-400 text-xs">
            <RefreshCw className="h-6 w-6 animate-spin mx-auto text-slate-400 mb-2" />
            Synchronizing live state databases with spreadsheet engine...
          </div>
        ) : (
          <div className="animate-in fade-in duration-100">
            
            {/* WORKSPACE 0: DASHBOARD ANALYTICS */}
            {activeTab === 'dashboard' && (
              <AdminDashboard 
                employees={employees}
                attendance={attendance}
                onFilterTrigger={handleDashboardFilterTrigger}
              />
            )}

            {/* WORKSPACE 1: DAILY SPREADSHEET WORKSHEET */}
            {activeTab === 'daily' && (
              <div className="space-y-4">
                
                {/* worksheet selection control panel */}
                <div className="bg-white rounded-xl shadow border border-slate-200 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
                      <Calendar className="h-4 w-4 text-emerald-600" />
                      Worksheet Entry date:
                    </label>
                    <input 
                      type="date" 
                      value={selectedDate}
                      onChange={(e) => setSelectedDate(e.target.value)}
                      className="text-xs border border-slate-300 rounded-lg p-2 font-mono font-medium focus:ring-1 focus:ring-emerald-500"
                    />
                    
                    {isFriday(selectedDate) && (
                      <span className="bg-violet-100 text-violet-850 text-[10px] font-bold px-2 py-0.5 rounded border border-violet-250 animate-pulse">
                        ⭐ Holy Friday timings apply: Late after 3:00 PM (15:00)
                      </span>
                    )}
                  </div>

                  {/* Actions buttons */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setIsCsvImportOpen(true)}
                      className="bg-slate-700 hover:bg-slate-800 border-b border-slate-850 px-3.5 py-2 rounded-lg text-white font-semibold text-xs transition-colors flex items-center gap-1.5 cursor-pointer"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Import Attendance CSV
                    </button>

                    <button
                      onClick={handleBulkWorksheetSave}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs px-4 py-2 rounded-lg flex items-center gap-1.5 cursor-pointer shadow-sm transition-colors"
                    >
                      <Save className="h-3.5 w-3.5" />
                      Save Active Sheet
                    </button>
                  </div>
                </div>

                {/* Main spreadsheet worksheet grid */}
                <div className="bg-white rounded-xl shadow-md border border-slate-200 overflow-hidden">
                  
                  {isMonthArchived && (
                    <div className="bg-rose-50 border-b border-rose-200 text-rose-800 px-4 py-3 text-xs font-semibold flex items-center gap-2.5">
                      <Lock className="h-4.5 w-4.5 text-rose-700 shrink-0" />
                      <span>Workspace Blocked! This date falls inside an archived month. The worksheet grid is locked as Read-Only.</span>
                    </div>
                  )}

                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead className="bg-slate-100 font-bold text-slate-700 border-b border-slate-200">
                        <tr>
                          <th className="p-3 border-r border-slate-200">Roster ID</th>
                          <th className="p-3 border-r border-slate-200">Staff Name</th>
                          <th className="p-3 border-r border-slate-200">Department</th>
                          <th className="p-3 border-r border-slate-200">Check-In Time (HH:MM)</th>
                          <th className="p-3 border-r border-slate-200">Check-Out Time (HH:MM)</th>
                          <th className="p-3 border-r border-slate-200">Override Manual Status</th>
                          <th className="p-3 border-r border-slate-200 text-center">Duty Status</th>
                          <th className="p-3 border-r border-slate-200 text-center">Net Working hours</th>
                          <th className="p-3 border-r border-slate-200 text-center">Late penalty</th>
                          <th className="p-3 border-r border-slate-200">Line comments & Remarks</th>
                          <th className="p-3 text-center">Sheet Save Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-150 bg-white">
                        {dailyWorksheetEmployees.length === 0 ? (
                          <tr>
                            <td colSpan={11} className="text-center py-12 text-slate-400 font-medium">
                              No staff members registered or active for the selected worksheet date.
                            </td>
                          </tr>
                        ) : (
                          dailyWorksheetEmployees.map((emp) => {
                            const recordId = `${emp.id}_${selectedDate}`;
                            const attObj = activeDateAttendance.find(a => a.employee_id === emp.id);
                            
                            // Resolution logic for draft edits
                            const currentDraft = draftEdits[recordId] || {};
                            const valueIn = currentDraft.checkIn !== undefined ? currentDraft.checkIn : (attObj ? attObj.check_in || '' : '');
                            const valueOut = currentDraft.checkOut !== undefined ? currentDraft.checkOut : (attObj ? attObj.check_out || '' : '');
                            const valueManual = currentDraft.manualStatus !== undefined ? currentDraft.manualStatus : (attObj ? attObj.manual_status || 'Auto' : 'Auto');
                            const valueRemarks = currentDraft.remarks !== undefined ? currentDraft.remarks : (attObj ? attObj.remarks || '' : '');

                            // Calculated parameters locally
                            const calculated = calculateAttendanceRecord(valueIn || null, valueOut || null, selectedDate, valueManual);
                            const rowSaveState = saveStatus[recordId] || 'idle';

                            return (
                              <tr key={emp.id} className="hover:bg-slate-50 border-r border-slate-100">
                                
                                {/* Employee Code */}
                                <td className="p-3 border-r border-slate-200 font-bold text-slate-700 font-mono">
                                  {emp.id}
                                </td>

                                {/* Name Display */}
                                <td className="p-3 border-r border-slate-200 font-medium font-sans text-slate-800">
                                  {emp.name}
                                  {!emp.active && (
                                    <span className="text-[9px] bg-red-105 bg-red-100 text-red-750 px-1.5 py-0.5 rounded font-bold ml-1">Disabled</span>
                                  )}
                                </td>

                                {/* Department */}
                                <td className="p-3 border-r border-slate-200 text-slate-500 font-bold">
                                  {emp.department}
                                </td>

                                {/* Check-In time input field */}
                                <td className="p-2 border-r border-slate-200">
                                  <input 
                                    type="time" 
                                    value={valueIn}
                                    disabled={isMonthArchived || !emp.active}
                                    onChange={(e) => {
                                      setDraftEdits(prev => ({
                                        ...prev,
                                        [recordId]: { ...prev[recordId], checkIn: e.target.value }
                                      }));
                                    }}
                                    className="w-full text-xs font-mono border border-slate-300 rounded-md p-1.5 focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:bg-slate-100 disabled:opacity-50"
                                  />
                                </td>

                                {/* Check-Out time input field */}
                                <td className="p-2 border-r border-slate-200">
                                  <input 
                                    type="time" 
                                    value={valueOut}
                                    disabled={isMonthArchived || !emp.active}
                                    onChange={(e) => {
                                      setDraftEdits(prev => ({
                                        ...prev,
                                        [recordId]: { ...prev[recordId], checkOut: e.target.value }
                                      }));
                                    }}
                                    className="w-full text-xs font-mono border border-slate-300 rounded-md p-1.5 focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:bg-slate-100"
                                  />
                                </td>

                                {/* Override Manual Status selector */}
                                <td className="p-2 border-r border-slate-200">
                                  <select
                                    value={valueManual}
                                    disabled={isMonthArchived || !emp.active}
                                    onChange={(e) => {
                                      setDraftEdits(prev => ({
                                        ...prev,
                                        [recordId]: { ...prev[recordId], manualStatus: e.target.value }
                                      }));
                                    }}
                                    className="w-full text-xs border border-slate-300 rounded-md p-1.5 font-medium cursor-pointer focus:ring-1 focus:ring-emerald-500"
                                  >
                                    <option value="Auto">Auto Calculations</option>
                                    <option value="Present">Present (Full Pay)</option>
                                    <option value="Absent">Absent (Zero Pay)</option>
                                    <option value="Leave">Compensated Leave</option>
                                    <option value="Off">Weekly Rest day</option>
                                  </select>
                                </td>

                                {/* Calculated Status */}
                                <td className="p-2 border-r border-slate-200 text-center font-sans">
                                  <span className={`px-2.5 py-1 rounded text-[10px] font-bold inline-block border ${
                                    calculated.status === 'Present' ? 'bg-green-105 bg-green-100 text-green-750 border-green-200' :
                                    calculated.status === 'Half-Day' ? 'bg-sky-105 bg-sky-100 text-sky-850 border-sky-200' :
                                    calculated.status === 'Absent' ? 'bg-red-105 bg-red-100 text-red-750 border-red-200' :
                                    calculated.status === 'Leave' ? 'bg-violet-105 bg-violet-100 text-violet-850 border-violet-200' :
                                    calculated.status === 'Off' ? 'bg-slate-105 bg-slate-100 text-slate-700 border-slate-200' :
                                    'bg-amber-105 bg-amber-100 text-amber-750 border-amber-200 animate-pulse font-extrabold'
                                  }`}>
                                    {calculated.status}
                                  </span>
                                </td>

                                {/* Net Shift hours and overtime details */}
                                <td className="p-2 border-r border-slate-200 text-center font-bold text-slate-800 font-mono">
                                  {calculated.netHours} hrs
                                  {calculated.netHours > 10 && (
                                    <div className="text-[9px] text-violet-750 text-indigo-650 font-sans">OT: {(calculated.netHours - 10).toFixed(1)}h</div>
                                  )}
                                </td>

                                {/* Late in penalty display */}
                                <td className={`p-2 border-r border-slate-200 text-center font-bold font-mono ${calculated.lateMinutes > 0 ? 'text-amber-600 bg-amber-50/50' : 'text-slate-400'}`}>
                                  {calculated.lateMinutes > 0 ? `${calculated.lateMinutes} min` : '-'}
                                </td>

                                {/* Line Comments */}
                                <td className="p-2 border-r border-slate-200">
                                  <input 
                                    type="text" 
                                    value={valueRemarks}
                                    disabled={isMonthArchived || !emp.active}
                                    placeholder="Enter line remarks..."
                                    onChange={(e) => {
                                      setDraftEdits(prev => ({
                                        ...prev,
                                        [recordId]: { ...prev[recordId], remarks: e.target.value }
                                      }));
                                    }}
                                    className="w-full text-xs font-sans px-2 py-1.5 border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-emerald-500"
                                  />
                                </td>

                                {/* Action Buttons */}
                                <td className="p-2 text-center">
                                  <div className="flex items-center justify-center gap-1.5">
                                    {isMonthArchived ? (
                                      <span className="text-[10px] text-slate-400 font-semibold">Locked</span>
                                    ) : (
                                      <>
                                        <button
                                          type="button"
                                          onClick={() => handleSaveWorksheetRow(emp.id)}
                                          disabled={rowSaveState === 'saving' || !emp.active}
                                          className={`px-3 py-1.5 rounded-lg text-xs font-bold font-sans transition-all cursor-pointer ${
                                            rowSaveState === 'saving' ? 'bg-blue-100 text-blue-750' :
                                            rowSaveState === 'saved' ? 'bg-emerald-500 text-white shadow-sm font-extrabold' :
                                            rowSaveState === 'failed' ? 'bg-red-100 text-red-750 border-red-300' :
                                            'bg-slate-100 hover:bg-slate-200 text-slate-650 border border-slate-300'
                                          }`}
                                        >
                                          {rowSaveState === 'saving' ? 'Saving' :
                                           rowSaveState === 'saved' ? 'Saved ✓' :
                                           rowSaveState === 'failed' ? 'Retry ⚠' :
                                           'Save Row'}
                                        </button>

                                        {attObj && (
                                          <button
                                            type="button"
                                            onClick={() => {
                                              setDeleteReason('');
                                              setDeleteTarget({
                                                type: 'attendance_record',
                                                id: attObj.id,
                                                data: attObj,
                                                label: `Attendance Day Log for ${emp.name} on ${selectedDate}`
                                              });
                                            }}
                                            className="text-slate-400 hover:text-rose-700 border border-slate-300 hover:border-rose-300 hover:bg-rose-50 rounded p-1.5 transition-colors cursor-pointer"
                                            title="Soft delete raw log and move to Recycle bin"
                                          >
                                            <Trash className="h-3.5 w-3.5" />
                                          </button>
                                        )}
                                      </>
                                    )}
                                  </div>
                                </td>

                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Bulk edit notification footer panel */}
                  {Object.keys(draftEdits).length > 0 && (
                    <div className="bg-emerald-50 p-4 border-t border-emerald-100 flex items-center justify-between">
                      <div className="text-xs text-emerald-800 font-bold flex items-center gap-1.5">
                        <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
                        <span>Worksheet Worksheet status: You have modified {Object.keys(draftEdits).length} spreadsheet rows.</span>
                      </div>
                      <button
                        onClick={handleBulkWorksheetSave}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-4 py-2 rounded-lg cursor-pointer"
                      >
                        Synchronize Modifications Now
                      </button>
                    </div>
                  )}

                </div>

              </div>
            )}

            {/* WORKSPACE 2: STAFF LIST ROSTER MANAGEMENT & DEPARTMENTS */}
            {activeTab === 'staff' && (
              <div className="space-y-4">
                
                {/* Sub-navigation tabs */}
                <div className="flex border-b border-slate-200 bg-slate-50 p-1.5 rounded-xl w-fit gap-1 shadow-xs">
                  <button
                    type="button"
                    onClick={() => setStaffSubTab('roster')}
                    className={`px-4 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center gap-2 ${
                      staffSubTab === 'roster' 
                        ? 'bg-white text-emerald-800 shadow-sm font-extrabold border-b-2 border-emerald-600' 
                        : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
                    }`}
                  >
                    <Users className="h-4 w-4 text-slate-500" />
                    Worker Directory
                  </button>
                  <button
                    type="button"
                    onClick={() => setStaffSubTab('departments')}
                    className={`px-4 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center gap-2 ${
                      staffSubTab === 'departments' 
                        ? 'bg-white text-emerald-800 shadow-sm font-extrabold border-b-2 border-emerald-600' 
                        : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
                    }`}
                  >
                    <Layers className="h-4 w-4" />
                    Department Manager
                  </button>
                </div>

                {staffSubTab === 'departments' ? (
                  <DepartmentManager 
                    departments={departments}
                    onReload={reloadAllData}
                  />
                ) : (
                  <>
                    {/* Header operations bar */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 rounded-xl shadow-xs border border-slate-200">
                      <div>
                        <h3 className="font-bold text-slate-800 text-sm">Active Worker Directory</h3>
                        <p className="text-xs text-slate-500">Add, configure, disable, or delete employee profiles permanently</p>
                      </div>
                      
                      <button
                        onClick={handleOpenAddEmployee}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-4 py-2 rounded-lg flex items-center gap-1.5 shadow-sm cursor-pointer transition-colors"
                      >
                        <Plus className="h-4 w-4" />
                        Register New Roster Staff Member
                      </button>
                    </div>

                    {/* Main Staff grid worksheet */}
                    <div className="bg-white rounded-xl shadow-md border border-slate-200 overflow-hidden">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead className="bg-slate-100 font-bold text-slate-700 border-b border-slate-200">
                          <tr>
                            <th className="p-3 border-r border-slate-200">Staff Code ID</th>
                            <th className="p-3 border-r border-slate-200">Employee Name</th>
                            <th className="p-3 border-r border-slate-200">Email Address</th>
                            <th className="p-3 border-r border-slate-200">Designation Role</th>
                            <th className="p-3 border-r border-slate-200">Department Section</th>
                            <th className="p-3 border-r border-slate-200">Base Monthly salary</th>
                            <th className="p-3 border-r border-slate-200 text-center">Roster Status</th>
                            <th className="p-3 text-center">Profile CRUD Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-150">
                          {employees.map((emp) => (
                            <tr key={emp.id} className="hover:bg-slate-50">
                              
                              <td className="p-3 border-r border-slate-200 font-bold font-mono text-slate-700">{emp.id}</td>
                              
                              <td className="p-3 border-r border-slate-200 font-bold text-slate-900">{emp.name}</td>
                              
                              <td className="p-3 border-r border-slate-200 font-mono text-slate-500">{emp.email || '-'}</td>
                              
                              <td className="p-3 border-r border-slate-200 text-slate-600">{emp.designation}</td>
                              
                              <td className="p-3 border-r border-slate-200 font-semibold text-slate-650">{emp.department}</td>
                              
                              <td className="p-3 border-r border-slate-200 font-bold font-mono text-slate-800">{formatPKR(emp.base_salary)}</td>
                              
                              {/* Active State Enable/Disable */}
                              <td className="p-3 border-r border-slate-200 text-center">
                                <button
                                  onClick={() => handleToggleEmployeeActive(emp)}
                                  className={`px-2 py-0.5 rounded text-[10px] font-bold cursor-pointer transition-all ${
                                    emp.active 
                                      ? 'bg-emerald-50 border border-emerald-250 text-emerald-700 hover:bg-emerald-100' 
                                      : 'bg-slate-100 border border-slate-250 text-slate-450 hover:bg-slate-200'
                                  }`}
                                >
                                  {emp.active ? 'Active Roster' : 'Disabled'}
                                </button>
                              </td>

                              {/* Quick Row actions */}
                              <td className="p-3 text-center flex items-center justify-center gap-1.5">
                                <button
                                  onClick={() => setEditingEmployee(emp)}
                                  className="text-slate-600 hover:text-emerald-700 border border-slate-300 rounded p-1 hover:bg-slate-50 transition-colors cursor-pointer"
                                  title="Edit Employee profile specs"
                                >
                                  <Edit3 className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  onClick={() => handleDeleteEmployee(emp)}
                                  className="text-slate-400 hover:text-rose-700 border border-slate-300 rounded p-1 hover:bg-slate-50 transition-colors cursor-pointer"
                                  title="Soft delete and move to Recycle bin queue"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </td>

                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}

              </div>
            )}

            {/* WORKSPACE 3: MONTHLY SALARIES & ARCHIVE MODULE */}
            {activeTab === 'monthly' && (
              <div className="space-y-4">
                
                {/* Control Filters header card */}
                <div className="bg-white rounded-xl shadow border border-slate-200 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <label className="text-xs font-bold text-slate-700">Select Month Sheet:</label>
                    <input 
                      type="month" 
                      value={salaryMonth}
                      onChange={(e) => setSalaryMonth(e.target.value)}
                      className="text-xs border border-slate-300 rounded-lg p-2 font-mono font-medium focus:ring-1 focus:ring-emerald-500"
                    />

                    {/* Lock State Indicators */}
                    <button
                      onClick={handleArchiveMonthToggle}
                      className={`text-xs px-3.5 py-1.5 border font-semibold rounded-lg shrink-0 flex items-center gap-1 transition-all cursor-pointer ${
                        isMonthArchived 
                          ? 'bg-rose-50 border-rose-220 text-rose-700 hover:bg-rose-100' 
                          : 'bg-slate-50 border-slate-250 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      {isMonthArchived ? <Lock className="h-3.5 w-3.5 text-rose-700 animate-pulse" /> : <Unlock className="h-3.5 w-3.5 text-emerald-600" />}
                      {isMonthArchived ? 'Spreadsheet Archived (Archived Month - Click to Unlock)' : 'Archive & Freeze Month (Click to Lock)'}
                    </button>
                  </div>

                  {/* Actions buttons */}
                  <div className="flex gap-2">
                    <button
                      onClick={() => exportSalaries(false)}
                      className="border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-semibold px-3 py-2 rounded-lg cursor-pointer transition-colors"
                    >
                      CSV Salary Export
                    </button>
                    <button
                      onClick={() => exportSalaries(true)}
                      className="bg-emerald-605 border border-emerald-300 bg-emerald-100 text-emerald-820 hover:bg-emerald-200 text-xs font-bold px-3 py-2 rounded-lg cursor-pointer transition-colors"
                    >
                      Excel Salary Sheet
                    </button>
                  </div>
                </div>

                {/* Monthly Sub-navigation tabs selection bar */}
                <div className="flex gap-2 border-b border-slate-200 pb-1">
                  <button
                    onClick={() => setMonthlySubTab('salary')}
                    className={`px-4 py-2 text-xs font-bold rounded-t-lg transition-all border-t-2 cursor-pointer ${
                      monthlySubTab === 'salary'
                        ? 'bg-white border-emerald-600 text-slate-800 shadow-sm font-semibold'
                        : 'bg-slate-100 border-transparent text-slate-500 hover:bg-slate-200'
                    }`}
                  >
                    Salary Sheet & Admin Approval
                  </button>
                  <button
                    onClick={() => setMonthlySubTab('commissions')}
                    className={`px-4 py-2 text-xs font-bold rounded-t-lg transition-all border-t-2 cursor-pointer ${
                      monthlySubTab === 'commissions'
                        ? 'bg-white border-emerald-600 text-slate-800 shadow-sm font-semibold'
                        : 'bg-slate-100 border-transparent text-slate-500 hover:bg-slate-200'
                    }`}
                  >
                    Sales Commissions (Track Commissions)
                  </button>
                  <button
                    onClick={() => setMonthlySubTab('allowances')}
                    className={`px-4 py-2 text-xs font-bold rounded-t-lg transition-all border-t-2 cursor-pointer ${
                      monthlySubTab === 'allowances'
                        ? 'bg-white border-emerald-600 text-slate-800 shadow-sm font-semibold'
                        : 'bg-slate-100 border-transparent text-slate-500 hover:bg-slate-200'
                    }`}
                  >
                    Hazri Bonus & Allowances
                  </button>
                </div>

                {/* Main salary sheets */}
                {monthlySubTab === 'salary' && (
                  <div className="bg-white rounded-xl shadow-md border border-slate-200 overflow-hidden">
                    
                    {isMonthArchived && (
                      <div className="bg-rose-50 border-b border-rose-100 text-rose-800 px-4 py-3.5 text-xs font-semibold">
                        📢 Read-only active month constraint: Calculated statistics cannot be modified because this month is frozen.
                      </div>
                    )}

                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse text-xs">
                      <thead className="bg-slate-100 font-bold text-slate-700 border-b border-slate-200">
                        <tr>
                          <th className="p-3 border-r border-slate-200 text-slate-805">Employee Code</th>
                          <th className="p-3 border-r border-slate-200 text-slate-805">Employee Name</th>
                          <th className="p-3 border-r border-slate-200 text-slate-805">Basic Salary</th>
                          <th className="p-3 border-r border-slate-200 text-center text-slate-805">Present Days</th>
                          <th className="p-3 border-r border-slate-200 text-center text-slate-805">Half Days</th>
                          <th className="p-3 border-r border-slate-200 text-center text-slate-805">Absent Days</th>
                          <th className="p-3 border-r border-slate-200 text-center text-slate-805">Leave Days</th>
                          <th className="p-3 border-r border-slate-200 text-center text-slate-805">Overtime Hours</th>
                          <th className="p-3 border-r border-slate-200 text-center text-slate-805">Attendance %</th>
                          <th className="p-3 border-r border-slate-200 text-center text-slate-805">Perf. Score</th>
                          <th className="p-3 border-r border-slate-200 text-slate-820 bg-slate-50">Calculated Salary</th>
                          <th className="p-3 border-r border-slate-200 text-slate-805 w-64">Manual Adjustments (Bonus/Deduction)</th>
                          <th className="p-3 font-bold text-emerald-820 bg-emerald-50">Final Salary</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-150 bg-white font-mono text-[11px]">
                        {monthlySalaryData.map((row) => {
                          const isSelfApproved = row.adjustment.approved;
                          return (
                            <tr key={row.employee.id} className="hover:bg-slate-50/50">
                              
                              <td className="p-3 border-r border-slate-200 font-bold text-slate-600">{row.employee.id}</td>
                              
                              <td className="p-3 border-r border-slate-200 font-bold font-sans text-slate-800 text-sm">{row.employee.name}</td>
                              
                              <td className="p-3 border-r border-slate-200 font-semi text-slate-700">{formatPKR(row.employee.base_salary)}</td>
                              
                              <td className="p-3 border-r border-slate-200 text-center text-emerald-700 font-bold">{row.presents} days</td>
                              
                              <td className="p-3 border-r border-slate-200 text-center text-sky-700">{row.halfDays} halfs</td>
                              
                              <td className="p-3 border-r border-slate-200 text-center text-rose-600 font-semibold">{row.absents} abs</td>
                              
                              <td className="p-3 border-r border-slate-200 text-center text-violet-750">{row.leaves} leaves</td>
                              
                              <td className="p-3 border-r border-slate-200 text-center font-bold text-indigo-600">{row.overtimeHours.toFixed(1)} hrs</td>
                              
                              <td className="p-3 border-r border-slate-200 text-center font-sans font-semibold">
                                <span className={`px-1.5 py-0.5 rounded text-[10px] ${row.attendancePercentage >= 90 ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-100 text-amber-805'}`}>
                                  {row.attendancePercentage}%
                                </span>
                              </td>
                              
                              <td className="p-3 border-r border-slate-200 text-center font-sans">
                                <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold ${row.performanceScore >= 90 ? 'bg-emerald-100 text-emerald-800' : row.performanceScore >= 75 ? 'bg-blue-100 text-blue-800' : 'bg-rose-100 text-rose-800'}`}>
                                  {row.performanceScore}
                                </span>
                              </td>
                              
                              <td className="p-3 border-r border-slate-200 bg-slate-50/60 font-sans text-left">
                                <div className="flex flex-col gap-1 text-[11px]">
                                  <span className="text-slate-900 font-bold font-mono text-xs">{formatPKR(row.suggestedFinalSalary)}</span>
                                  <span className="text-[10px] text-slate-500">
                                    Base: {formatPKR(row.employee.base_salary)}
                                  </span>
                                  {row.adjustedShortHours > 0 && (
                                    <span className="text-[10px] text-rose-600 font-medium">
                                      Short Deduct: -{formatPKR(row.adjustedShortHours * row.hourlyRate)} ({row.adjustedShortHours.toFixed(1)}h)
                                    </span>
                                  )}
                                  {row.netPayableOvertimeHours > 0 && (
                                    <span className="text-[10px] text-emerald-600 font-medium">
                                      OT Pay: +{formatPKR(row.netPayableOvertimeHours * row.hourlyRate)} ({row.netPayableOvertimeHours.toFixed(1)}h)
                                    </span>
                                  )}
                                  {row.commissionAmount > 0 && (
                                    <span className="text-[10px] text-indigo-600 font-medium">
                                      Commissions: +{formatPKR(row.commissionAmount)}
                                    </span>
                                  )}
                                  {row.totalAllowances > 0 && (
                                    <span className="text-[10px] text-sky-600 font-medium">
                                      Allowances: +{formatPKR(row.totalAllowances)}
                                    </span>
                                  )}
                                </div>
                              </td>

                              {/* Manual adjustments with Approved checkpoint */}
                              <td className="p-3 border-r border-slate-200 font-sans w-64 text-left">
                                <div className="flex flex-col gap-1.5">
                                  <div className="flex items-center gap-1">
                                    <span className="text-[10px] font-bold text-slate-500">PKR:</span>
                                    <input 
                                      type="number" 
                                      value={row.adjustment.amount || ''} 
                                      placeholder="e.g. -2000 or 5000"
                                      disabled={isMonthArchived}
                                      onChange={(e) => updateSalaryAdjustment(row.employee.id, salaryMonth, Number(e.target.value), row.adjustment.approved, row.adjustment.reason)}
                                      className="w-full text-[11px] border border-slate-300 rounded p-1 font-mono focus:ring-1 focus:ring-emerald-500"
                                    />
                                  </div>
                                  <input 
                                    type="text" 
                                    value={row.adjustment.reason || ''} 
                                    placeholder="Deduction or Bonus Reason..."
                                    disabled={isMonthArchived}
                                    onChange={(e) => updateSalaryAdjustment(row.employee.id, salaryMonth, row.adjustment.amount, row.adjustment.approved, e.target.value)}
                                    className="w-full text-[10px] border border-slate-300 rounded p-1 focus:ring-1 focus:ring-emerald-500"
                                  />
                                  <label className="inline-flex items-center gap-1.5 text-[10px] select-none cursor-pointer text-slate-750 bg-slate-50 p-1 rounded border border-slate-250 hover:bg-slate-100 transition-colors">
                                    <input 
                                      type="checkbox" 
                                      checked={isSelfApproved} 
                                      disabled={isMonthArchived}
                                      onChange={(e) => updateSalaryAdjustment(row.employee.id, salaryMonth, row.adjustment.amount, e.target.checked, row.adjustment.reason)}
                                      className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-550 h-3 w-3"
                                    />
                                    <span className="font-bold uppercase tracking-wider text-[8px] text-slate-600">Approve Adjustments</span>
                                  </label>
                                </div>
                              </td>

                              <td className="p-3 font-extrabold text-emerald-800 text-sm font-sans bg-emerald-50/25">
                                <div className="flex flex-col">
                                  <span>{formatPKR(row.finalSalary)}</span>
                                  {isSelfApproved && Number(row.adjustment.amount) !== 0 && (
                                    <span className={`text-[10px] font-sans font-normal ${Number(row.adjustment.amount) > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                      ({Number(row.adjustment.amount) > 0 ? '+' : ''}{formatPKR(row.adjustment.amount)} Authorized)
                                    </span>
                                  )}
                                </div>
                              </td>

                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                </div>
                )}

                {/* Sales Commission Manager Tab */}
                {monthlySubTab === 'commissions' && (
                  <div className="space-y-4">
                    <div className="bg-white rounded-xl shadow border border-slate-200 p-4">
                      <h3 className="text-sm font-bold text-slate-800 mb-3">Add Employee Sales Commission</h3>
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
                        <div>
                          <label className="block text-[10px] font-bold text-slate-500 mb-1">Select Employee</label>
                          <select
                            value={newCommEmp}
                            onChange={(e) => setNewCommEmp(e.target.value)}
                            className="w-full text-xs border border-slate-300 rounded p-2 focus:ring-1 focus:ring-emerald-555"
                          >
                            <option value="">-- Choose Employee --</option>
                            {employees.map(emp => (
                              <option key={emp.id} value={emp.id}>{emp.name} ({emp.employee_code || emp.id})</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-slate-500 mb-1">Commission Amount (PKR)</label>
                          <input
                            type="number"
                            value={newCommAmount || ''}
                            onChange={(e) => setNewCommAmount(Number(e.target.value))}
                            placeholder="e.g. 5000"
                            className="w-full text-xs border border-slate-300 rounded p-2 font-mono focus:ring-1 focus:ring-emerald-555"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-slate-500 mb-1">Reason / Notes</label>
                          <input
                            type="text"
                            value={newCommReason}
                            onChange={(e) => setNewCommReason(e.target.value)}
                            placeholder="e.g. stitcher 50 units speed commission"
                            className="w-full text-xs border border-slate-300 rounded p-2 focus:ring-1 focus:ring-emerald-555"
                          />
                        </div>
                        <button
                          onClick={handleAddCommission}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold py-2 px-4 rounded-lg cursor-pointer transition-colors h-[38px]"
                        >
                          Add & Approve
                        </button>
                      </div>
                    </div>

                    <div className="bg-white rounded-xl shadow border border-slate-200 p-4">
                      <h3 className="text-sm font-bold text-slate-800 mb-3 font-sans">Active Approved Commissions for This Month ({salaryMonth})</h3>
                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse text-xs">
                          <thead>
                            <tr className="bg-slate-100 border-b border-slate-200 text-slate-700 font-bold">
                              <th className="p-3">Employee Code</th>
                              <th className="p-3">Employee Name</th>
                              <th className="p-3 font-mono">Commission</th>
                              <th className="p-3">Reason</th>
                              <th className="p-3">Added By</th>
                              <th className="p-3">Approval Status</th>
                              <th className="p-3 text-center">Action</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-150">
                            {commissions.filter(c => {
                              const [y, m] = salaryMonth.split('-');
                              return c.month === m && c.year === y;
                            }).length === 0 ? (
                              <tr>
                                <td colSpan={7} className="p-4 text-center text-slate-400 font-mono">No approved commissions recorded for this month.</td>
                              </tr>
                            ) : (
                              commissions
                                .filter(c => {
                                  const [y, m] = salaryMonth.split('-');
                                  return c.month === m && c.year === y;
                                })
                                .map(c => {
                                  const emp = employees.find(e => e.id === c.employee_id);
                                  return (
                                    <tr key={c.id} className="hover:bg-slate-50 font-mono text-[11px]">
                                      <td className="p-3 font-bold text-slate-600">{emp ? emp.employee_code || emp.id : c.employee_id}</td>
                                      <td className="p-3 font-bold font-sans text-slate-800">{emp ? emp.name : 'Unknown Employee'}</td>
                                      <td className="p-3 font-mono font-bold text-emerald-700">{formatPKR(c.commission_amount)}</td>
                                      <td className="p-3 text-slate-605 font-sans">{c.commission_reason}</td>
                                      <td className="p-3 text-slate-500 font-sans">{c.added_by}</td>
                                      <td className="p-3 font-bold text-emerald-800 font-sans">Approved (by {c.approved_by || 'Admin'})</td>
                                      <td className="p-3 text-center">
                                        <button
                                          onClick={() => handleDeleteComm(c.id)}
                                          className="text-rose-600 hover:text-rose-800 border border-rose-200 hover:bg-rose-50 px-2 py-1 rounded text-[10px] transition-colors cursor-pointer"
                                        >
                                          Delete
                                        </button>
                                      </td>
                                    </tr>
                                  );
                                })
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}

                {/* Allowances Manager Tab */}
                {monthlySubTab === 'allowances' && (
                  <div className="space-y-4">
                    <div className="bg-white rounded-xl shadow border border-slate-200 p-4">
                      <h3 className="text-sm font-bold text-slate-800 mb-3">Add Employee Allowance / Attendance Bonus</h3>
                      <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
                        <div>
                          <label className="block text-[10px] font-bold text-slate-500 mb-1">Select Employee</label>
                          <select
                            value={newAllowEmp}
                            onChange={(e) => setNewAllowEmp(e.target.value)}
                            className="w-full text-xs border border-slate-300 rounded p-2 focus:ring-1 focus:ring-emerald-555"
                          >
                            <option value="">-- Choose Employee --</option>
                            {employees.map(emp => (
                              <option key={emp.id} value={emp.id}>{emp.name} ({emp.employee_code || emp.id})</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-slate-500 mb-1">Allowance Type</label>
                          <select
                            value={newAllowType}
                            onChange={(e) => setNewAllowType(e.target.value as any)}
                            className="w-full text-xs border border-slate-300 rounded p-2 focus:ring-1 focus:ring-emerald-555"
                          >
                            <option value="Attendance Bonus">Attendance Bonus</option>
                            <option value="Punctuality Bonus">Punctuality Bonus</option>
                            <option value="Performance Bonus">Performance Bonus</option>
                            <option value="Manual Bonus">Manual Bonus</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-slate-500 mb-1">Amount (PKR)</label>
                          <input
                            type="number"
                            value={newAllowAmount || ''}
                            onChange={(e) => setNewAllowAmount(Number(e.target.value))}
                            placeholder="e.g. 1500"
                            className="w-full text-xs border border-slate-300 rounded p-2 font-mono focus:ring-1 focus:ring-emerald-555"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-slate-500 mb-1">Reason / Notes</label>
                          <input
                            type="text"
                            value={newAllowReason}
                            onChange={(e) => setNewAllowReason(e.target.value)}
                            placeholder="e.g. 100% attendance hazri reward"
                            className="w-full text-xs border border-slate-300 rounded p-2 focus:ring-1 focus:ring-emerald-555"
                          />
                        </div>
                        <button
                          onClick={handleAddAllowance}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold py-2 px-4 rounded-lg cursor-pointer transition-colors h-[38px]"
                        >
                          Add & Approve
                        </button>
                      </div>
                    </div>

                    <div className="bg-white rounded-xl shadow border border-slate-200 p-4">
                      <h3 className="text-sm font-bold text-slate-800 mb-3 font-sans">Active Approved Allowances & Hazri Bonuses for This Month ({salaryMonth})</h3>
                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse text-xs">
                          <thead>
                            <tr className="bg-slate-100 border-b border-slate-200 text-slate-700 font-bold">
                              <th className="p-3">Employee Code</th>
                              <th className="p-3">Employee Name</th>
                              <th className="p-3">Allowance Type</th>
                              <th className="p-3 font-mono">Amount</th>
                              <th className="p-3">Reason</th>
                              <th className="p-3">Approval Status</th>
                              <th className="p-3 text-center">Action</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-150">
                            {allowances.filter(a => {
                              const [y, m] = salaryMonth.split('-');
                              return a.month === m && a.year === y;
                            }).length === 0 ? (
                              <tr>
                                <td colSpan={7} className="p-4 text-center text-slate-400 font-mono">No approved allowances recorded for this month.</td>
                              </tr>
                            ) : (
                              allowances
                                .filter(a => {
                                  const [y, m] = salaryMonth.split('-');
                                  return a.month === m && a.year === y;
                                })
                                .map(a => {
                                  const emp = employees.find(e => e.id === a.employee_id);
                                  return (
                                    <tr key={a.id} className="hover:bg-slate-50 font-mono text-[11px]">
                                      <td className="p-3 font-bold text-slate-600">{emp ? emp.employee_code || emp.id : a.employee_id}</td>
                                      <td className="p-3 font-bold font-sans text-slate-800">{emp ? emp.name : 'Unknown Employee'}</td>
                                      <td className="p-3">
                                        <span className="bg-sky-50 text-sky-800 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded font-sans">
                                          {a.allowance_type}
                                        </span>
                                      </td>
                                      <td className="p-3 font-mono font-bold text-emerald-700">{formatPKR(a.allowance_amount)}</td>
                                      <td className="p-3 text-slate-605 font-sans">{a.reason}</td>
                                      <td className="p-3 font-bold text-emerald-800 font-sans">Approved (by {a.approved_by || 'Admin'})</td>
                                      <td className="p-3 text-center">
                                        <button
                                          onClick={() => handleDeleteAllow(a.id)}
                                          className="text-rose-600 hover:text-rose-800 border border-rose-200 hover:bg-rose-50 px-2 py-1 rounded text-[10px] transition-colors cursor-pointer"
                                        >
                                          Delete
                                        </button>
                                      </td>
                                    </tr>
                                  );
                                })
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}

              </div>
            )}

            {/* WORKSPACE 4: REPORT DRAWER (ALL FILTERS AND PHYSICAL PRINTS) */}
            {activeTab === 'reports' && (
              <ReportView 
                employees={employees} 
                attendance={attendance} 
                initialFilters={dashboardFilters}
                onClearInitialFilters={() => setDashboardFilters(null)}
              />
            )}

            {/* WORKSPACE 5: RECYCLE BIN & COMPLIANCE TRAIL */}
            {activeTab === 'recycle' && (
              <RecycleBin 
                isAdmin={isAdmin}
                onRestoreHappened={reloadAllData}
              />
            )}

            {/* WORKSPACE 6: USER ACCOUNTS ACCESS CONTROL PANEL (Requirement 7) */}
            {activeTab === 'users' && userRole === 'super_admin' && currentUser && (
              <UserManagement employees={employees} currentUserId={currentUser.id} />
            )}

          </div>
        )}

      </main>

      {/* --- FLOATING MODALS & SUB DIALOG PANELS --- */}

      {/* Styled Deletion and Soft-Delete Custom Configuration Modal (Requirements 2, 4, 8) */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            
            {/* Header */}
            <div className="bg-rose-950 bg-rose-900 text-white px-5 py-4 flex items-center justify-between">
              <h3 className="font-bold text-sm flex items-center gap-1.5">
                <AlertTriangle className="h-4.5 w-4.5 text-rose-300 shrink-0" />
                Confirm Administrative Deletion
              </h3>
              <button onClick={() => setDeleteTarget(null)} className="text-rose-200 hover:text-white text-xs cursor-pointer font-bold">Close [X]</button>
            </div>

            <div className="p-5 space-y-4">
              <p className="text-xs text-slate-600 leading-normal">
                You are initiating deletion of a <strong className="text-slate-800">{deleteTarget.type.replace('_', ' ')}</strong> resource: 
                <span className="text-slate-950 block font-medium mt-1 text-[13px] bg-slate-50 px-2 py-1.5 rounded border border-slate-150 font-mono">{deleteTarget.label}</span>
              </p>

              {/* Reason field */}
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Deducted Auditing Reason *</label>
                <textarea
                  rows={2}
                  value={deleteReason}
                  onChange={(e) => setDeleteReason(e.target.value)}
                  placeholder="Provide a mandatory reason for this deletion (Required)..."
                  className="w-full text-xs p-2 border border-slate-300 rounded focus:ring-1 focus:ring-rose-500 outline-none"
                  required
                />
              </div>

              {/* Conditional staff delete options (Requirement 8) */}
              {deleteTarget.type === 'employee' && (
                <div className="space-y-2.5 bg-slate-50 p-3 rounded-lg border border-slate-205 text-xs text-slate-650">
                  <span className="block font-bold text-slate-850">Choose staff disposal scenario:</span>
                  
                  <label className="flex items-start gap-2 cursor-pointer font-medium hover:bg-slate-100 p-1 rounded transition-colors">
                    <input 
                      type="radio" 
                      name="staff_option" 
                      value="disable" 
                      checked={staffDeleteOption === 'disable'}
                      onChange={() => setStaffDeleteOption('disable')}
                      className="mt-0.5 text-rose-600 focus:ring-rose-500"
                    />
                    <div>
                      <strong className="text-slate-900 block font-bold">1. Disable employee only (Recommended default)</strong>
                      <span className="text-[10px] text-slate-400 block text-slate-400 font-normal">Removes from daily worksheets but fully preserves all calculated payroll history.</span>
                    </div>
                  </label>

                  <label className="flex items-start gap-2 cursor-pointer font-medium hover:bg-slate-100 p-1 rounded transition-colors">
                    <input 
                      type="radio" 
                      name="staff_option" 
                      value="soft" 
                      checked={staffDeleteOption === 'soft'}
                      onChange={() => setStaffDeleteOption('soft')}
                      className="mt-0.5 text-rose-600 focus:ring-rose-500"
                    />
                    <div>
                      <strong className="text-slate-900 block font-bold">2. Soft-delete staff but keep history</strong>
                      <span className="text-[10px] text-slate-400 block text-slate-400 font-normal font-normal">Moves profile to Recycle Bin. Preserves historical attendance reports.</span>
                    </div>
                  </label>

                  <label className="flex items-start gap-2 cursor-pointer font-medium hover:bg-rose-50 p-1 rounded transition-colors">
                    <input 
                      type="radio" 
                      name="staff_option" 
                      value="permanent" 
                      checked={staffDeleteOption === 'permanent'}
                      onChange={() => setStaffDeleteOption('permanent')}
                      className="mt-0.5 text-rose-600 focus:ring-rose-500"
                    />
                    <div>
                      <strong className="text-rose-800 block font-bold">3. Permanent delete profile & stats (No undo)</strong>
                      <span className="text-[10px] text-rose-500 block font-normal">Completely cleans staff and metadata history from cloud.</span>
                    </div>
                  </label>
                </div>
              )}

              {/* Action triggers */}
              <div className="pt-2 flex gap-2">
                <button
                  type="button"
                  onClick={executeActualDeletion}
                  disabled={!deleteReason.trim()}
                  className="bg-rose-700 hover:bg-rose-800 text-white text-xs font-bold px-4 py-2 rounded flex-1 disabled:opacity-40 cursor-pointer transition-colors"
                >
                  Apply Deletion Action
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteTarget(null)}
                  className="border border-slate-300 hover:bg-slate-100 text-slate-700 text-xs font-semibold px-4 py-2 rounded-lg"
                >
                  Cancel
                </button>
              </div>

            </div>
          </div>
        </div>
      )}

      {/* Database connection Modal config */}
      {isDbSetupOpen && (
        <SqlConfigModal 
          onClose={() => setIsDbSetupOpen(false)}
          onSaved={() => setDbConfig(getSupabaseCredentials())}
        />
      )}

      {/* CSV importer Mapping Wizard */}
      {isCsvImportOpen && (
        <CsvImporter 
          employees={employees}
          existingAttendance={attendance}
          onImportComplete={reloadAllData}
          onClose={() => setIsCsvImportOpen(false)}
        />
      )}

      {/* Sliding Form Dialog: Add New Employee Staff */}
      {isAddEmployeeModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-100">
            
            <div className="bg-slate-900 px-5 py-4 text-white flex items-center justify-between">
              <h3 className="font-bold text-sm">Register new KaprayOfficial member</h3>
              <button onClick={() => setIsAddEmployeeModalOpen(false)} className="text-slate-400 hover:text-white text-xs">Close [X]</button>
            </div>

            <form onSubmit={handleAddEmployeeSubmit} className="p-5 space-y-4">
              
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Roster Code Identifier (Unique) *</label>
                <input 
                  type="text" 
                  value={newId}
                  onChange={(e) => setNewId(e.target.value.toUpperCase().replace(/\s/g, ''))}
                  placeholder="e.g. EMP-05" 
                  className="w-full text-xs px-3 py-2 border border-slate-300 rounded focus:ring-1 focus:ring-emerald-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Full Employee Name *</label>
                <input 
                  type="text" 
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Adeel Farooq" 
                  className="w-full text-xs px-3 py-2 border border-slate-300 rounded focus:ring-1 focus:ring-emerald-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Email Address</label>
                <input 
                  type="email" 
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="e.g. adeel@kaprayofficial.com" 
                  className="w-full text-xs px-3 py-2 border border-slate-300 rounded focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">Department Section *</label>
                  <select
                    value={newDeptId}
                    onChange={(e) => {
                      const selId = e.target.value;
                      setNewDeptId(selId);
                      const found = departments.find(d => d.id === selId);
                      if (found) {
                        setNewDept(found.department_name);
                      }
                    }}
                    className="w-full text-xs px-3 py-2 border border-slate-300 rounded focus:ring-1 focus:ring-emerald-500 font-bold"
                    required
                  >
                    <option value="">-- Choose Dept --</option>
                    {departments.filter(d => d.status === 'active').map(d => (
                      <option key={d.id} value={d.id}>
                        {d.department_name} ({d.department_code})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">Standard Base Salary</label>
                  <input 
                    type="number" 
                    value={newSalary}
                    onChange={(e) => setNewSalary(Number(e.target.value))}
                    className="w-full text-xs px-3 py-2 border border-slate-300 rounded focus:ring-1 focus:ring-emerald-500 font-mono"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Standard Designation Role</label>
                <input 
                  type="text" 
                  value={newDesignation}
                  onChange={(e) => setNewDesignation(e.target.value)}
                  placeholder="e.g. Senior Master Stitcher" 
                  className="w-full text-xs px-3 py-2 border border-slate-300 rounded focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <div className="pt-2 flex gap-2">
                <button 
                  type="submit"
                  className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-4 py-2 rounded flex-1 cursor-pointer"
                >
                  Confirm registration
                </button>
                <button 
                  type="button" 
                  onClick={() => setIsAddEmployeeModalOpen(false)}
                  className="border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-semibold px-4 py-2 rounded"
                >
                  Cancel
                </button>
              </div>

            </form>

          </div>
        </div>
      )}

      {/* Sliding Form Dialog: edit employee */}
      {editingEmployee && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-100">
            
            <div className="bg-slate-900 px-5 py-4 text-white flex items-center justify-between">
              <h3 className="font-bold text-sm">Configure worker info: {editingEmployee.id}</h3>
              <button onClick={() => setEditingEmployee(null)} className="text-slate-400 hover:text-white text-xs">Close [X]</button>
            </div>

            <form onSubmit={handleEditEmployeeSubmit} className="p-5 space-y-4">
              
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Employee Name</label>
                <input 
                  type="text" 
                  value={editingEmployee.name}
                  onChange={(e) => setEditingEmployee({ ...editingEmployee, name: e.target.value })}
                  className="w-full text-xs px-3 py-2 border border-slate-300 rounded focus:ring-1 focus:ring-emerald-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Email Address</label>
                <input 
                  type="email" 
                  value={editingEmployee.email || ''}
                  onChange={(e) => setEditingEmployee({ ...editingEmployee, email: e.target.value })}
                  className="w-full text-xs px-3 py-2 border border-slate-300 rounded focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">Department Section *</label>
                  <select
                    value={editingEmployee.department_id || ''}
                    onChange={(e) => {
                      const selId = e.target.value;
                      const found = departments.find(d => d.id === selId);
                      setEditingEmployee({
                        ...editingEmployee,
                        department_id: selId || null,
                        department: found ? found.department_name : editingEmployee.department
                      });
                    }}
                    className="w-full text-xs px-3 py-2 border border-slate-300 rounded focus:ring-1 focus:ring-emerald-500 font-bold"
                    required
                  >
                    <option value="">-- Choose Dept --</option>
                    {departments.map(d => (
                      <option key={d.id} value={d.id}>
                        {d.department_name} ({d.department_code}) {d.status === 'disabled' ? '(Disabled)' : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">Roster Base Salary</label>
                  <input 
                    type="number" 
                    value={editingEmployee.base_salary}
                    onChange={(e) => setEditingEmployee({ ...editingEmployee, base_salary: Number(e.target.value) })}
                    className="w-full text-xs px-3 py-2 border border-slate-300 rounded focus:ring-1 focus:ring-emerald-500 font-mono"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Designation</label>
                <input 
                  type="text" 
                  value={editingEmployee.designation}
                  onChange={(e) => setEditingEmployee({ ...editingEmployee, designation: e.target.value })}
                  className="w-full text-xs px-3 py-2 border border-slate-300 rounded focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <div className="pt-2 flex gap-2">
                <button 
                  type="submit"
                  className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-4 py-2 rounded flex-1"
                >
                  Save settings
                </button>
                <button 
                  type="button" 
                  onClick={() => setEditingEmployee(null)}
                  className="border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-semibold px-4 py-2 rounded"
                >
                  Cancel
                </button>
              </div>

            </form>

          </div>
        </div>
      )}

      {/* Sticky footer info */}
      <footer className="bg-white border-t border-slate-200 mt-auto py-3 text-center text-[11px] text-slate-400 font-medium tracking-tight">
         © {new Date().getFullYear()} KaprayOfficial Enterprises Ltd. High-Performance ERP Worksheets. Synchronized.
      </footer>

    </div>
  );
}
