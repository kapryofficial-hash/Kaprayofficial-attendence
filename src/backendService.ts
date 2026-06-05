import { 
  getSupabaseClient, 
  DbEmployee, 
  DbAttendance, 
  DbMonthlyReport, 
  DbImportLog, 
  DbDeletedRecord,
  DbAttendanceEditHistory,
  DbDepartment
} from './supabaseClient';
import { calculateAttendanceRecord } from './utils';
import { EmployeeCommission, EmployeeAllowance } from './types';

const EMPLOYEES_LS_KEY = 'excel_erp_employees';
const ATTENDANCE_LS_KEY = 'excel_erp_attendance_records';
const MONTHS_LS_KEY = 'excel_erp_monthly_reports';
const IMPORTS_LS_KEY = 'excel_erp_import_logs';
const DELETED_LS_KEY = 'excel_erp_deleted_records';
const EDIT_HISTORY_LS_KEY = 'excel_erp_edit_history';
const DEPARTMENTS_LS_KEY = 'excel_erp_departments';
const COMMISSIONS_LS_KEY = 'excel_erp_employee_commissions';
const ALLOWANCES_LS_KEY = 'excel_erp_employee_allowances';

// Professional Default departments for immediate onboarding
const DEFAULT_DEPARTMENTS: DbDepartment[] = [
  { id: 'dept-stitching', department_code: 'DEPT-01', department_name: 'Stitching', description: 'Stitching production line', status: 'active', created_at: new Date('2026-06-01').toISOString() },
  { id: 'dept-cutting', department_code: 'DEPT-02', department_name: 'Cutting', description: 'Fabric cutting pattern master division', status: 'active', created_at: new Date('2026-06-01').toISOString() },
  { id: 'dept-finishing', department_code: 'DEPT-03', department_name: 'Finishing', description: 'Final packaging and quality audits', status: 'active', created_at: new Date('2026-06-01').toISOString() },
  { id: 'dept-operations', department_code: 'DEPT-04', department_name: 'Operations', description: 'Plant administration and machinery logistics', status: 'active', created_at: new Date('2026-06-01').toISOString() },
  { id: 'dept-sales', department_code: 'DEPT-05', department_name: 'Sales', description: 'Distributor outreach and order fulfillment', status: 'active', created_at: new Date('2026-06-01').toISOString() },
  { id: 'dept-admin', department_code: 'DEPT-06', department_name: 'Admin', description: 'Central administrative human resources unit', status: 'active', created_at: new Date('2026-06-01').toISOString() },
];

// Professional Default staff for immediate visual onboarding
const DEFAULT_STAFF: DbEmployee[] = [
  { id: 'EMP-01', employee_code: 'EMP-01', employee_name: 'Zeeshan Ali', name: 'Zeeshan Ali', email: 'zeeshan@alkali.pk', designation: 'General Master Stitcher', department: 'Stitching', department_id: 'dept-stitching', department_name: 'Stitching', base_salary: 45000, active: true, status: 'Active', is_deleted: false, created_at: new Date().toISOString() },
  { id: 'EMP-02', employee_code: 'EMP-02', employee_name: 'Muhammad Ahsan', name: 'Muhammad Ahsan', email: 'ahsan@alkali.pk', designation: 'Senior Master Cutting', department: 'Cutting', department_id: 'dept-cutting', department_name: 'Cutting', base_salary: 50000, active: true, status: 'Active', is_deleted: false, created_at: new Date().toISOString() },
  { id: 'EMP-03', employee_code: 'EMP-03', employee_name: 'Bilal Khan', name: 'Bilal Khan', email: 'bilal@alkali.pk', designation: 'Finishing Supervisor', department: 'Finishing', department_id: 'dept-finishing', department_name: 'Finishing', base_salary: 32000, active: true, status: 'Active', is_deleted: false, created_at: new Date().toISOString() },
  { id: 'EMP-04', employee_code: 'EMP-04', employee_name: 'Kamran Shah', name: 'Kamran Shah', email: 'kamran@alkali.pk', designation: 'Helper Stitching', department: 'Stitching', department_id: 'dept-stitching', department_name: 'Stitching', base_salary: 26050, active: true, status: 'Active', is_deleted: false, created_at: new Date().toISOString() },
];

export function formatSupabaseError(err: any, tableName: string): string {
  if (!err) return 'Unknown error';
  const code = err.code || '';
  const msg = err.message || '';
  const details = err.details || '';
  
  if (code === 'PGRST204' || msg.includes('schema cache') || (msg.includes('column') && msg.includes('schema cache'))) {
    const colMatch = msg.match(/Could not find the '([^']+)' column/i) || msg.match(/column '([^']+)'/i);
    const colName = colMatch ? colMatch[1] : 'created_at';
    return `Database schema mismatch: missing column ${colName} in ${tableName}.`;
  }
  
  if (code === '42703' || (msg.includes('column') && (msg.includes('exist') || msg.includes('does not exist')))) {
    const colMatch = msg.match(/column "([^"]+)" of/i) || msg.match(/column "([^"]+)" does/i) || msg.match(/column '([^']+)'/i);
    const colName = colMatch ? colMatch[1] : 'created_at';
    return `Database schema mismatch: missing column ${colName} in ${tableName}.`;
  }

  return `${msg} [Code: ${code}${details ? ' | Detail: ' + details : ''}]`;
}

// Helper: Safely decode JSON or return draft
function getSafeLocal<T>(key: string, fallback: T): T {
  try {
    const val = localStorage.getItem(key);
    return val ? JSON.parse(val) : fallback;
  } catch {
    return fallback;
  }
}

function setSafeLocal(key: string, data: any) {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (err) {
    console.warn('localStorage write failed:', err);
  }
}

/**
 * Loads list of employees. Merges any local temporary cache.
 */
export async function loadEmployees(includeDeleted: boolean = false): Promise<{ data: DbEmployee[]; source: 'supabase' | 'local'; error?: string }> {
  const supabase = getSupabaseClient();
  const deptsLocal = getSafeLocal<DbDepartment[]>(DEPARTMENTS_LS_KEY, DEFAULT_DEPARTMENTS);

  if (!supabase) {
    const local = getSafeLocal<DbEmployee[]>(EMPLOYEES_LS_KEY, DEFAULT_STAFF);
    const mapped = local.map(row => {
      let deptName = row.department_name || row.department || '';
      if (row.department_id) {
        const found = deptsLocal.find(d => d.id === row.department_id);
        if (found) {
          deptName = found.department_name;
        }
      }
      const activeStatus = row.status ? row.status.toLowerCase() : (row.active ? 'active' : 'disabled');
      return {
        ...row,
        id: row.id || row.employee_code || '',
        employee_code: row.employee_code || row.id || '',
        employee_name: row.employee_name || row.name || '',
        name: row.employee_name || row.name || '',
        department: deptName,
        department_name: deptName,
        status: activeStatus,
        active: activeStatus === 'active',
        salary: row.salary || row.base_salary || 0,
        base_salary: row.base_salary || row.salary || 0,
      };
    });
    const filtered = includeDeleted ? mapped : mapped.filter(e => !e.is_deleted);
    return { data: filtered, source: 'local' };
  }

  try {
    let query = supabase.from('employees').select('*').order('id', { ascending: true });
    if (!includeDeleted) {
      query = query.eq('is_deleted', false);
    }
    let { data: rawData, error } = await query;
    if (error) {
      if (error.code === '42P01') {
        const local = getSafeLocal<DbEmployee[]>(EMPLOYEES_LS_KEY, DEFAULT_STAFF);
        const mappedSub = local.map(row => {
          let deptName = row.department_name || row.department || '';
          if (row.department_id) {
            const found = deptsLocal.find(d => d.id === row.department_id);
            if (found) deptName = found.department_name;
          }
          const activeStatus = row.status ? row.status.toLowerCase() : (row.active ? 'active' : 'disabled');
          return {
            ...row,
            id: row.id || row.employee_code || '',
            employee_code: row.employee_code || row.id || '',
            employee_name: row.employee_name || row.name || '',
            name: row.employee_name || row.name || '',
            department: deptName,
            department_name: deptName,
            status: activeStatus,
            active: activeStatus === 'active',
            salary: row.salary || row.base_salary || 0,
            base_salary: row.base_salary || row.salary || 0,
          };
        });
        const filtered = includeDeleted ? mappedSub : mappedSub.filter(e => !e.is_deleted);
        return { data: filtered, source: 'local', error: 'Table employees does not exist yet. Please write/apply the SQL script.' };
      }
      throw error;
    }

    // Auto-seed default staff if successfully fetched but table is completely empty
    if (rawData && rawData.length === 0) {
      const dbCreds = getSupabaseClient() ? (window as any).localStorage?.getItem('custom_supabase_url') || 'default' : 'default';
      const seedLockKey = `seeded_employees_${dbCreds}`;
      const alreadySeeded = (window as any).localStorage?.getItem(seedLockKey);

      if (!alreadySeeded && !(globalThis as any).isSeedingEmployees) {
        (globalThis as any).isSeedingEmployees = true;
        (window as any).localStorage?.setItem(seedLockKey, 'true');
        console.log('Seeding employees to newly connected database...');
        try {
          for (const emp of DEFAULT_STAFF) {
            await supabase.from('employees').upsert({
              id: emp.id,
              employee_code: emp.employee_code || emp.id,
              employee_name: emp.name || emp.employee_name || '',
              email: emp.email || null,
              designation: emp.designation,
              department_id: emp.department_id || null,
              department_name: emp.department || '',
              phone: emp.phone || null,
              joining_date: emp.joining_date || null,
              salary: emp.base_salary || 0,
              base_salary: emp.base_salary || 0,
              status: emp.status || 'Active',
              remarks: emp.remarks || null,
              shift_start_time: emp.shift_start_time || '13:30',
              shift_end_time: emp.shift_end_time || '23:30',
              is_deleted: emp.is_deleted || false
            });
          }
          const reFetch = await query;
          if (reFetch.data && reFetch.data.length > 0) {
            rawData = reFetch.data;
          }
        } catch (e) {
          console.error('Failed to auto-seed default employees:', e);
          (window as any).localStorage?.removeItem(seedLockKey);
        } finally {
          (globalThis as any).isSeedingEmployees = false;
        }
      }
    }
    
    const data: DbEmployee[] = (rawData || []).map(row => {
      let deptName = row.department_name || row.department || '';
      if (row.department_id) {
        const found = deptsLocal.find(d => d.id === row.department_id);
        if (found) deptName = found.department_name;
      }
      const activeStatus = row.status ? row.status.toLowerCase() : (row.active ? 'active' : 'disabled');
      return {
        ...row,
        id: row.id || row.employee_code,
        employee_code: row.employee_code || row.id,
        employee_name: row.employee_name || row.name || '',
        name: row.employee_name || row.name || '',
        department: deptName,
        department_name: deptName,
        status: activeStatus,
        active: activeStatus === 'active',
        salary: row.salary || row.base_salary || 0,
        base_salary: row.base_salary || row.salary || 0,
      };
    });
    
    setSafeLocal(EMPLOYEES_LS_KEY, data);
    return { data, source: 'supabase' };
  } catch (err: any) {
    console.warn('Fallback on employees loading:', err);
    const local = getSafeLocal<DbEmployee[]>(EMPLOYEES_LS_KEY, DEFAULT_STAFF);
    const filtered = includeDeleted ? local : local.filter(e => !e.is_deleted);
    return { data: filtered, source: 'local', error: formatSupabaseError(err, 'employees') };
  }
}

/**
 * Saves/updates active employee
 */
export async function saveEmployee(emp: DbEmployee): Promise<{ success: boolean; error?: string }> {
  const local = getSafeLocal<DbEmployee[]>(EMPLOYEES_LS_KEY, DEFAULT_STAFF);
  const deptsLocal = getSafeLocal<DbDepartment[]>(DEPARTMENTS_LS_KEY, DEFAULT_DEPARTMENTS);
  
  let deptName = emp.department_name || emp.department || '';
  if (emp.department_id) {
    const found = deptsLocal.find(d => d.id === emp.department_id);
    if (found) {
      deptName = found.department_name;
    }
  }

  const updatedStatus = emp.status ? emp.status.toLowerCase() : (emp.active ? 'active' : 'disabled');

  const supabase = getSupabaseClient();
  let verifiedId = emp.id;

  // Auto-align id with the database if it already exists under the given employee_code,
  // or simply preserve the custom literal code input (e.g. EMP-01)
  if (supabase) {
    try {
      const searchCode = emp.employee_code || emp.id;
      const { data: existing } = await supabase
        .from('employees')
        .select('id')
        .eq('employee_code', searchCode)
        .maybeSingle();

      if (existing && existing.id) {
        verifiedId = existing.id;
      }
    } catch (e: any) {
      console.warn('Supabase code check error, deriving fallback:', e);
    }
  }

  const updatedEmp = {
    ...emp,
    id: verifiedId,
    employee_code: emp.employee_code || emp.id || verifiedId,
    employee_name: emp.name || emp.employee_name || '',
    name: emp.name || emp.employee_name || '',
    department: deptName,
    department_name: deptName,
    status: updatedStatus,
    active: updatedStatus === 'active',
    salary: emp.salary || emp.base_salary || 0,
    base_salary: emp.base_salary || emp.salary || 0,
    updated_at: new Date().toISOString()
  };

  // Update local cache
  const originalId = emp.id;
  const index = local.findIndex(e => e.id === originalId || e.id === verifiedId || e.employee_code === updatedEmp.employee_code);
  if (index >= 0) {
    local[index] = updatedEmp;
  } else {
    local.push(updatedEmp);
  }
  setSafeLocal(EMPLOYEES_LS_KEY, local);

  if (!supabase) return { success: true };

  try {
    const payload: any = {
      id: verifiedId,
      employee_code: updatedEmp.employee_code,
      employee_name: updatedEmp.employee_name,
      email: updatedEmp.email || null,
      designation: updatedEmp.designation,
      department_id: updatedEmp.department_id || null,
      department_name: updatedEmp.department_name,
      phone: updatedEmp.phone || null,
      joining_date: updatedEmp.joining_date || null,
      salary: updatedEmp.salary,
      base_salary: updatedEmp.base_salary,
      status: updatedEmp.status,
      remarks: updatedEmp.remarks || null,
      shift_start_time: updatedEmp.shift_start_time || '13:30',
      shift_end_time: updatedEmp.shift_end_time || '23:30',
      deleted_at: updatedEmp.deleted_at || null,
      created_at: updatedEmp.created_at || new Date().toISOString(),
      updated_at: updatedEmp.updated_at
    };

    // Include is_deleted if desired, but handle fallback
    payload.is_deleted = updatedEmp.is_deleted || false;

    const { error } = await supabase.from('employees').upsert(payload);
    if (error) {
      if (error.message?.includes('is_deleted') || error.code === '42703' || error.code === 'PGRST204') {
        const { is_deleted, created_at, updated_at, ...safePayload } = payload;
        const { error: retryError } = await supabase.from('employees').upsert(safePayload);
        if (retryError) {
          return { success: false, error: formatSupabaseError(retryError, 'employees') };
        }
        return { success: true };
      }
      return { success: false, error: formatSupabaseError(error, 'employees') };
    }
    return { success: true };
  } catch (err: any) {
    return { 
      success: false, 
      error: formatSupabaseError(err, 'employees')
    };
  }
}

/**
 * Loads list of departments.
 */
export async function loadDepartments(includeDeleted: boolean = false): Promise<{ data: DbDepartment[]; source: 'supabase' | 'local'; error?: string }> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    const local = getSafeLocal<DbDepartment[]>(DEPARTMENTS_LS_KEY, DEFAULT_DEPARTMENTS);
    const filtered = includeDeleted ? local : local.filter(d => !d.deleted_at);
    return { data: filtered, source: 'local' };
  }
  try {
    let query = supabase.from('departments').select('*').order('department_code', { ascending: true });
    if (!includeDeleted) {
      query = query.is('deleted_at', null);
    }
    let { data, error } = await query;
    if (error) {
      if (error.code === '42P01') {
        const local = getSafeLocal<DbDepartment[]>(DEPARTMENTS_LS_KEY, DEFAULT_DEPARTMENTS);
        const filtered = includeDeleted ? local : local.filter(d => !d.deleted_at);
        return { data: filtered, source: 'local', error: 'Table departments does not exist yet.' };
      }
      throw error;
    }

    // Auto-seed default departments if successfully fetched but table is completely empty
    if (data && data.length === 0) {
      const dbCreds = getSupabaseClient() ? (window as any).localStorage?.getItem('custom_supabase_url') || 'default' : 'default';
      const seedLockKey = `seeded_departments_${dbCreds}`;
      const alreadySeeded = (window as any).localStorage?.getItem(seedLockKey);

      if (!alreadySeeded && !(globalThis as any).isSeedingDepartments) {
        (globalThis as any).isSeedingDepartments = true;
        (window as any).localStorage?.setItem(seedLockKey, 'true');
        console.log('Seeding departments to newly connected database...');
        try {
          for (const dept of DEFAULT_DEPARTMENTS) {
            await supabase.from('departments').upsert({
              id: dept.id,
              department_code: dept.department_code,
              department_name: dept.department_name,
              description: dept.description || '',
              status: dept.status || 'active'
            });
          }
          const reFetch = await query;
          if (reFetch.data && reFetch.data.length > 0) {
            data = reFetch.data;
          }
        } catch (e) {
          console.error('Failed to auto-seed default departments:', e);
          (window as any).localStorage?.removeItem(seedLockKey);
        } finally {
          (globalThis as any).isSeedingDepartments = false;
        }
      }
    }

    setSafeLocal(DEPARTMENTS_LS_KEY, data || []);
    return { data: data || [], source: 'supabase' };
  } catch (err: any) {
    const local = getSafeLocal<DbDepartment[]>(DEPARTMENTS_LS_KEY, DEFAULT_DEPARTMENTS);
    const filtered = includeDeleted ? local : local.filter(d => !d.deleted_at);
    return { data: filtered, source: 'local', error: formatSupabaseError(err, 'departments') };
  }
}

/**
 * Save / Update department
 */
export async function saveDepartment(dept: DbDepartment): Promise<{ success: boolean; error?: string }> {
  const local = getSafeLocal<DbDepartment[]>(DEPARTMENTS_LS_KEY, DEFAULT_DEPARTMENTS);
  const index = local.findIndex(d => d.id === dept.id);
  const updatedDept = {
    ...dept,
    description: dept.description || '',
    status: dept.status || 'active',
    updated_at: new Date().toISOString()
  };
  if (index >= 0) {
    local[index] = updatedDept;
  } else {
    local.push(updatedDept);
  }
  setSafeLocal(DEPARTMENTS_LS_KEY, local);

  const supabase = getSupabaseClient();
  if (!supabase) return { success: true };

  try {
    const payload: any = {
      id: updatedDept.id,
      department_code: updatedDept.department_code,
      department_name: updatedDept.department_name,
      description: updatedDept.description || null,
      status: updatedDept.status,
      created_at: updatedDept.created_at || new Date().toISOString(),
      updated_at: updatedDept.updated_at,
      deleted_at: updatedDept.deleted_at || null
    };

    const { error } = await supabase.from('departments').upsert(payload);
    if (error) {
      if (error.code === '42703' || error.code === 'PGRST204' || error.message?.includes('deleted_at') || error.message?.includes('created_at')) {
        const { created_at, updated_at, deleted_at, ...safePayload } = payload;
        const { error: retryError } = await supabase.from('departments').upsert(safePayload);
        if (retryError) return { success: false, error: formatSupabaseError(retryError, 'departments') };
        return { success: true };
      }
      return { success: false, error: formatSupabaseError(error, 'departments') };
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: formatSupabaseError(err, 'departments') };
  }
}

/**
 * Handles department deletion options
 */
export async function deleteDepartmentAndRecords(
  id: string, 
  option: 'disable_only' | 'delete_keep_history' | 'delete_permanent'
): Promise<{ success: boolean; error?: string }> {
  const depts = getSafeLocal<DbDepartment[]>(DEPARTMENTS_LS_KEY, DEFAULT_DEPARTMENTS);
  const deptIdx = depts.findIndex(d => d.id === id);
  if (deptIdx === -1) {
    return { success: false, error: 'Department not found.' };
  }
  const dept = depts[deptIdx];
  const nowStr = new Date().toISOString();

  const supabase = getSupabaseClient();

  if (option === 'disable_only') {
    dept.status = 'disabled';
    dept.updated_at = nowStr;
    depts[deptIdx] = dept;
    setSafeLocal(DEPARTMENTS_LS_KEY, depts);
    
    if (supabase) {
      try {
        const { error } = await supabase.from('departments').update({ status: 'disabled', updated_at: nowStr }).eq('id', id);
        if (error) throw error;
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    }
    return { success: true };
  }

  if (option === 'delete_keep_history') {
    dept.deleted_at = nowStr;
    dept.status = 'disabled';
    depts[deptIdx] = dept;
    setSafeLocal(DEPARTMENTS_LS_KEY, depts);

    if (supabase) {
      try {
        const { error } = await supabase.from('departments').update({ deleted_at: nowStr, status: 'disabled' }).eq('id', id);
        if (error) throw error;
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    }
    return { success: true };
  }

  if (option === 'delete_permanent') {
    const filteredDepts = depts.filter(d => d.id !== id);
    setSafeLocal(DEPARTMENTS_LS_KEY, filteredDepts);

    // Also update local employees: set department_id = null
    const employees = getSafeLocal<DbEmployee[]>(EMPLOYEES_LS_KEY, DEFAULT_STAFF);
    const updatedEmployees = employees.map(emp => {
      if (emp.department_id === id) {
        return { ...emp, department_id: null };
      }
      return emp;
    });
    setSafeLocal(EMPLOYEES_LS_KEY, updatedEmployees);

    if (supabase) {
      try {
        await supabase.from('employees').update({ department_id: null }).eq('department_id', id);
        const { error } = await supabase.from('departments').delete().eq('id', id);
        if (error) throw error;
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    }
    return { success: true };
  }

  return { success: false, error: 'Invalid operation option.' };
}

/**
 * Performs a deep system table purge (Hard Wipe)
 */
export async function hardWipeTable(
  tableKeys: ('departments' | 'employees' | 'attendance_records' | 'monthly_reports' | 'attendance_edit_history' | 'deleted_records' | 'import_logs')[]
): Promise<{ success: boolean; counts: Record<string, number>; error?: string }> {
  const counts: Record<string, number> = {};
  
  tableKeys.forEach(k => {
    if (k === 'departments') {
      const current = getSafeLocal<any[]>(DEPARTMENTS_LS_KEY, []);
      counts['departments'] = current.length;
      setSafeLocal(DEPARTMENTS_LS_KEY, []);
    } else if (k === 'employees') {
      const current = getSafeLocal<any[]>(EMPLOYEES_LS_KEY, []);
      counts['employees'] = current.length;
      setSafeLocal(EMPLOYEES_LS_KEY, []);
    } else if (k === 'attendance_records') {
      const current = getSafeLocal<any[]>(ATTENDANCE_LS_KEY, []);
      counts['attendance_records'] = current.length;
      setSafeLocal(ATTENDANCE_LS_KEY, []);
    } else if (k === 'monthly_reports') {
      const current = getSafeLocal<any[]>(MONTHS_LS_KEY, []);
      counts['monthly_reports'] = current.length;
      setSafeLocal(MONTHS_LS_KEY, []);
    } else if (k === 'attendance_edit_history') {
      const current = getSafeLocal<any[]>(EDIT_HISTORY_LS_KEY, []);
      counts['attendance_edit_history'] = current.length;
      setSafeLocal(EDIT_HISTORY_LS_KEY, []);
    } else if (k === 'deleted_records') {
      const current = getSafeLocal<any[]>(DELETED_LS_KEY, []);
      counts['deleted_records'] = current.length;
      setSafeLocal(DELETED_LS_KEY, []);
    } else if (k === 'import_logs') {
      const current = getSafeLocal<any[]>(IMPORTS_LS_KEY, []);
      counts['import_logs'] = current.length;
      setSafeLocal(IMPORTS_LS_KEY, []);
    }
  });

  const supabase = getSupabaseClient();
  if (!supabase) {
    return { success: true, counts };
  }

  try {
    for (const key of tableKeys) {
      if (key === 'attendance_records') {
        const { error } = await supabase.from('attendance_records').delete().neq('id', 'WIPE_DUMMY_ALL');
        if (error) throw error;
      } else if (key === 'employees') {
        const { error } = await supabase.from('employees').delete().neq('id', 'WIPE_DUMMY_ALL');
        if (error) throw error;
      } else if (key === 'departments') {
        const { error } = await supabase.from('departments').delete().neq('id', 'WIPE_DUMMY_ALL');
        if (error) throw error;
      } else if (key === 'monthly_reports') {
        const { error } = await supabase.from('monthly_reports').delete().neq('id', 'WIPE_DUMMY_ALL');
        if (error) throw error;
      } else if (key === 'attendance_edit_history') {
        const { error } = await supabase.from('attendance_edit_history').delete().neq('id', 'WIPE_DUMMY_ALL');
        if (error) throw error;
      } else if (key === 'deleted_records') {
        const { error } = await supabase.from('deleted_records').delete().neq('id', 'WIPE_DUMMY_ALL');
        if (error) throw error;
      } else if (key === 'import_logs') {
        const { error } = await supabase.from('import_logs').delete().neq('id', 'WIPE_DUMMY_ALL');
        if (error) throw error;
      }
    }
    return { success: true, counts };
  } catch (err: any) {
    return { success: false, counts, error: err.message };
  }
}

/**
 * Loads attendance records
 */
export async function loadAttendance(includeDeleted: boolean = false): Promise<{ data: DbAttendance[]; source: 'supabase' | 'local'; error?: string }> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    const local = getSafeLocal<DbAttendance[]>(ATTENDANCE_LS_KEY, []);
    const filtered = includeDeleted ? local : local.filter(a => !a.is_deleted);
    return { data: filtered, source: 'local' };
  }

  try {
    let query = supabase.from('attendance_records').select('*');
    if (!includeDeleted) {
      query = query.eq('is_deleted', false);
    }
    const { data: rawData, error } = await query.order('attendance_date', { ascending: false });
    if (error) {
      if (error.code === '42P01') {
        const local = getSafeLocal<DbAttendance[]>(ATTENDANCE_LS_KEY, []);
        const filtered = includeDeleted ? local : local.filter(a => !a.is_deleted);
        return { data: filtered, source: 'local', error: 'Table "attendance_records" not found.' };
      }
      throw error;
    }

    const data: DbAttendance[] = (rawData || []).map(row => ({
      ...row,
      attendance_date: row.attendance_date || row.date,
      date: row.attendance_date || row.date,
      checkin_time: row.checkin_time || row.check_in,
      check_in: row.checkin_time || row.check_in,
      checkout_time: row.checkout_time || row.check_out,
      check_out: row.checkout_time || row.check_out,
      attendance_status: row.attendance_status || row.status,
      status: row.attendance_status || row.status,
    }));

    setSafeLocal(ATTENDANCE_LS_KEY, data);
    return { data, source: 'supabase' };
  } catch (err: any) {
    console.warn('Fallback on loading attendance records:', err);
    const local = getSafeLocal<DbAttendance[]>(ATTENDANCE_LS_KEY, []);
    const filtered = includeDeleted ? local : local.filter(a => !a.is_deleted);
    return { data: filtered, source: 'local', error: formatSupabaseError(err, 'attendance_records') };
  }
}

/**
 * Saves/updates raw attendance record
 */
export async function saveAttendanceRecord(record: DbAttendance): Promise<{ success: boolean; error?: string }> {
  const dateVal = record.attendance_date || record.date;
  const inVal = record.checkin_time || record.check_in;
  const outVal = record.checkout_time || record.check_out;
  const statusVal = record.attendance_status || record.status;

  const calc = calculateAttendanceRecord(inVal || null, outVal || null, dateVal, record.manual_status || 'Auto');
  const calculatedShortHours = record.short_hours !== undefined
    ? record.short_hours
    : calc.shortHours;

  const local = getSafeLocal<DbAttendance[]>(ATTENDANCE_LS_KEY, []);
  const index = local.findIndex(a => a.id === record.id);
  const updatedRecord = {
    ...record,
    attendance_date: dateVal,
    date: dateVal,
    checkin_time: inVal,
    check_in: inVal,
    checkout_time: outVal,
    check_out: outVal,
    attendance_status: statusVal,
    status: statusVal,
    short_hours: calculatedShortHours,
    updated_at: new Date().toISOString()
  };

  if (index >= 0) {
    local[index] = updatedRecord;
  } else {
    local.push(updatedRecord);
  }
  setSafeLocal(ATTENDANCE_LS_KEY, local);

  const supabase = getSupabaseClient();
  if (!supabase) return { success: true };

  try {
    const payload: any = {
      id: updatedRecord.id,
      employee_id: updatedRecord.employee_id,
      attendance_date: updatedRecord.attendance_date,
      checkin_time: updatedRecord.checkin_time || null,
      checkout_time: updatedRecord.checkout_time || null,
      net_hours: updatedRecord.net_hours,
      late_minutes: updatedRecord.late_minutes,
      overtime_hours: updatedRecord.overtime_hours,
      short_hours: updatedRecord.short_hours,
      attendance_status: updatedRecord.attendance_status,
      manual_status: updatedRecord.manual_status,
      remarks: updatedRecord.remarks || null,
      performance_score: updatedRecord.performance_score || 100,
      is_deleted: updatedRecord.is_deleted || false,
      created_at: updatedRecord.created_at || new Date().toISOString(),
      updated_at: updatedRecord.updated_at,
      deleted_at: updatedRecord.deleted_at || null
    };

    const { error } = await supabase.from('attendance_records').upsert(payload);
    if (error) {
      if (error.code === '42703' || error.code === 'PGRST204' || error.message?.includes('short_hours') || error.message?.includes('created_at')) {
        const { short_hours, performance_score, is_deleted, created_at, updated_at, deleted_at, ...safePayload } = payload;
        const { error: retryError } = await supabase.from('attendance_records').upsert(safePayload);
        if (retryError) return { success: false, error: formatSupabaseError(retryError, 'attendance_records') };
        return { success: true };
      }
      return { success: false, error: formatSupabaseError(error, 'attendance_records') };
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: formatSupabaseError(err, 'attendance_records') };
  }
}

/**
 * Saves multiple attendance records in a highly optimized single database pipeline
 */
export async function saveAttendanceRecordsBulk(records: DbAttendance[]): Promise<{ success: boolean; error?: string }> {
  if (records.length === 0) return { success: true };

  const local = getSafeLocal<DbAttendance[]>(ATTENDANCE_LS_KEY, []);
  const updatedRecords = records.map(record => {
    const dateVal = record.attendance_date || record.date;
    const inVal = record.checkin_time || record.check_in;
    const outVal = record.checkout_time || record.check_out;
    const statusVal = record.attendance_status || record.status;

    const calc = calculateAttendanceRecord(inVal || null, outVal || null, dateVal, record.manual_status || 'Auto');
    const calculatedShortHours = record.short_hours !== undefined
      ? record.short_hours
      : calc.shortHours;

    return {
      ...record,
      attendance_date: dateVal,
      date: dateVal,
      checkin_time: inVal,
      check_in: inVal,
      checkout_time: outVal,
      check_out: outVal,
      attendance_status: statusVal,
      status: statusVal,
      short_hours: calculatedShortHours,
      updated_at: new Date().toISOString()
    };
  });

  // Bulk update local storage
  updatedRecords.forEach(updatedRecord => {
    const idx = local.findIndex(a => a.id === updatedRecord.id);
    if (idx >= 0) {
      local[idx] = updatedRecord;
    } else {
      local.push(updatedRecord);
    }
  });
  setSafeLocal(ATTENDANCE_LS_KEY, local);

  const supabase = getSupabaseClient();
  if (!supabase) return { success: true };

  try {
    const payload = updatedRecords.map(rec => ({
      id: rec.id,
      employee_id: rec.employee_id,
      attendance_date: rec.attendance_date,
      checkin_time: rec.checkin_time || null,
      checkout_time: rec.checkout_time || null,
      net_hours: rec.net_hours,
      late_minutes: rec.late_minutes,
      overtime_hours: rec.overtime_hours,
      short_hours: rec.short_hours,
      attendance_status: rec.attendance_status,
      manual_status: rec.manual_status,
      remarks: rec.remarks || null,
      performance_score: rec.performance_score || 100,
      is_deleted: rec.is_deleted || false,
      created_at: rec.created_at || new Date().toISOString(),
      updated_at: rec.updated_at,
      deleted_at: rec.deleted_at || null
    }));

    const { error } = await supabase.from('attendance_records').upsert(payload);
    if (error) throw error;
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * Loads edit history for attendance records
 */
export async function loadEditHistories(): Promise<{ data: DbAttendanceEditHistory[] }> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { data: getSafeLocal<DbAttendanceEditHistory[]>(EDIT_HISTORY_LS_KEY, []) };
  }
  try {
    const { data, error } = await supabase.from('attendance_edit_history').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    return { data: data || [] };
  } catch {
    return { data: getSafeLocal<DbAttendanceEditHistory[]>(EDIT_HISTORY_LS_KEY, []) };
  }
}

/**
 * Saves a row change history entry
 */
export async function saveEditHistory(history: DbAttendanceEditHistory): Promise<{ success: boolean; error?: string }> {
  const local = getSafeLocal<DbAttendanceEditHistory[]>(EDIT_HISTORY_LS_KEY, []);
  local.unshift(history);
  setSafeLocal(EDIT_HISTORY_LS_KEY, local);

  const supabase = getSupabaseClient();
  if (!supabase) return { success: true };

  try {
    const { error } = await supabase.from('attendance_edit_history').insert({
      id: history.id,
      attendance_id: history.attendance_id,
      employee_id: history.employee_id,
      old_data: history.old_data,
      new_data: history.new_data,
      edited_by: history.edited_by,
      edit_reason: history.edit_reason,
      created_at: history.created_at || new Date().toISOString()
    });
    if (error) throw error;
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * Loads per employee monthly compiled payroll/performance reports
 */
export async function loadMonthlyReports(): Promise<{ data: DbMonthlyReport[]; error?: string }> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { data: getSafeLocal<DbMonthlyReport[]>(MONTHS_LS_KEY, []) };
  }
  try {
    const { data, error } = await supabase.from('monthly_reports').select('*').order('id', { ascending: false });
    if (error) throw error;
    return { data: data || [] };
  } catch (err: any) {
    return { data: getSafeLocal<DbMonthlyReport[]>(MONTHS_LS_KEY, []), error: formatSupabaseError(err, 'monthly_reports') };
  }
}

/**
 * Save monthly compiled reports
 */
export async function saveMonthlyReport(report: DbMonthlyReport): Promise<{ success: boolean; error?: string }> {
  const local = getSafeLocal<DbMonthlyReport[]>(MONTHS_LS_KEY, []);
  const idx = local.findIndex(m => m.id === report.id);
  
  if (idx >= 0) {
    local[idx] = report;
  } else {
    local.push(report);
  }
  setSafeLocal(MONTHS_LS_KEY, local);

  const supabase = getSupabaseClient();
  if (!supabase) return { success: true };

  try {
    const payload = {
      id: report.id,
      employee_id: report.employee_id,
      month: report.month,
      year: report.year,
      present_days: report.present_days,
      absent_days: report.absent_days,
      leave_days: report.leave_days,
      off_days: report.off_days,
      late_count: report.late_count,
      missing_checkout_count: report.missing_checkout_count,
      total_hours: report.total_hours,
      overtime_hours: report.overtime_hours,
      short_hours: report.short_hours,
      performance_score: report.performance_score,
      remarks: report.remarks || '',
      archived: report.archived || false,
      locked: report.locked || false,
      updated_at: new Date().toISOString()
    };

    const { error } = await supabase.from('monthly_reports').upsert(payload);
    if (error) {
      if (error.code === '42703' || error.code === 'PGRST204') {
        const { updated_at, ...safePayload } = payload;
        const { error: retryError } = await supabase.from('monthly_reports').upsert(safePayload);
        if (retryError) return { success: false, error: formatSupabaseError(retryError, 'monthly_reports') };
        return { success: true };
      }
      return { success: false, error: formatSupabaseError(error, 'monthly_reports') };
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: formatSupabaseError(err, 'monthly_reports') };
  }
}

/**
 * Loads CSV logs
 */
export async function loadImportLogs(): Promise<{ data: DbImportLog[] }> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { data: getSafeLocal<DbImportLog[]>(IMPORTS_LS_KEY, []) };
  }
  try {
    const { data, error } = await supabase.from('import_logs').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    return { data: data || [] };
  } catch {
    return { data: getSafeLocal<DbImportLog[]>(IMPORTS_LS_KEY, []) };
  }
}

/**
 * Registers an upgraded CSV log entry
 */
export async function saveImportLog(log: DbImportLog): Promise<void> {
  const local = getSafeLocal<DbImportLog[]>(IMPORTS_LS_KEY, []);
  local.unshift(log);
  setSafeLocal(IMPORTS_LS_KEY, local);

  const supabase = getSupabaseClient();
  if (!supabase) return;
  try {
    await supabase.from('import_logs').insert({
      id: log.id,
      file_name: log.file_name,
      import_type: log.import_type,
      total_rows: log.total_rows,
      success_rows: log.success_rows,
      failed_rows: log.failed_rows,
      duplicate_rows: log.duplicate_rows,
      imported_by: log.imported_by,
      created_at: log.created_at || new Date().toISOString()
    });
  } catch (err) {
    console.error('Failed to log import event:', err);
  }
}

/**
 * Loads deleted records (trash logs) for potential restoring
 */
export async function loadDeletedRecords(): Promise<{ data: DbDeletedRecord[] }> {
  const supabase = getSupabaseClient();
  let rawList: DbDeletedRecord[] = [];
  
  try {
    if (supabase) {
      const { data, error } = await supabase.from('deleted_records').select('*').order('deleted_at', { ascending: false });
      if (error) throw error;
      rawList = data || [];
    } else {
      rawList = getSafeLocal<DbDeletedRecord[]>(DELETED_LS_KEY, []);
    }
  } catch (err) {
    console.warn('Failed to load deleted records from Supabase, loading from localStorage fallback:', err);
    rawList = getSafeLocal<DbDeletedRecord[]>(DELETED_LS_KEY, []);
  }

  // Ensure compatibility layers are populated
  const mapped = rawList.map(row => ({
    ...row,
    entity_type: row.table_name || row.entity_type || '',
    entity_id: row.record_id || row.entity_id || '',
    original_data: row.record_data || row.original_data || null,
  }));

  return { data: mapped };
}

/**
 * Soft delete generic record with reason and 24-hour restore deadline
 */
export async function softDeleteRecord(
  type: 'employee' | 'attendance_record' | 'monthly_report' | 'import_log',
  id: string,
  originalData: any,
  deletedBy: string = 'Admin',
  reason: string = 'Administrative request'
): Promise<{ success: boolean; error?: string }> {
  const restoreUntil = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // exactly 24 hours
  const trashItem: DbDeletedRecord = {
    id: `del_${type}_${id}_${Date.now()}`,
    table_name: type,
    record_id: id,
    record_data: originalData,
    deleted_by: deletedBy,
    deleted_at: new Date().toISOString(),
    restore_until: restoreUntil,
    delete_reason: reason
  };

  const deletedLocal = getSafeLocal<DbDeletedRecord[]>(DELETED_LS_KEY, []);
  deletedLocal.unshift(trashItem);
  setSafeLocal(DELETED_LS_KEY, deletedLocal);

  // Mark in local sets
  if (type === 'employee') {
    const list = getSafeLocal<DbEmployee[]>(EMPLOYEES_LS_KEY, DEFAULT_STAFF);
    setSafeLocal(EMPLOYEES_LS_KEY, list.map(e => e.id === id ? { ...e, is_deleted: true, deleted_at: trashItem.deleted_at } : e));
  } else if (type === 'attendance_record') {
    const list = getSafeLocal<DbAttendance[]>(ATTENDANCE_LS_KEY, []);
    setSafeLocal(ATTENDANCE_LS_KEY, list.map(a => a.id === id ? { ...a, is_deleted: true, deleted_at: trashItem.deleted_at } : a));
  } else if (type === 'monthly_report') {
    const list = getSafeLocal<DbMonthlyReport[]>(MONTHS_LS_KEY, []);
    setSafeLocal(MONTHS_LS_KEY, list.filter(m => m.id !== id));
  } else if (type === 'import_log') {
    const list = getSafeLocal<DbImportLog[]>(IMPORTS_LS_KEY, []);
    setSafeLocal(IMPORTS_LS_KEY, list.filter(l => l.id !== id));
  }

  const supabase = getSupabaseClient();
  if (!supabase) return { success: true };

  try {
    const { error: trashError } = await supabase.from('deleted_records').insert({
      id: trashItem.id,
      table_name: trashItem.table_name,
      record_id: trashItem.record_id,
      record_data: trashItem.record_data,
      deleted_by: trashItem.deleted_by,
      deleted_at: trashItem.deleted_at,
      restore_until: trashItem.restore_until,
      delete_reason: trashItem.delete_reason
    });
    if (trashError) throw trashError;

    if (type === 'employee') {
      await supabase.from('employees').update({
        is_deleted: true,
        deleted_at: trashItem.deleted_at,
        status: 'Disabled'
      }).eq('id', id);
    } else if (type === 'attendance_record') {
      await supabase.from('attendance_records').update({
        is_deleted: true,
        deleted_at: trashItem.deleted_at
      }).eq('id', id);
    } else if (type === 'monthly_report') {
      await supabase.from('monthly_reports').delete().eq('id', id);
    } else if (type === 'import_log') {
      await supabase.from('import_logs').delete().eq('id', id);
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * Restores a soft-deleted record within its 24-hr timeframe
 */
export async function restoreRecord(item: DbDeletedRecord): Promise<{ success: boolean; error?: string }> {
  // Remove from local trash queue
  const deletedLocal = getSafeLocal<DbDeletedRecord[]>(DELETED_LS_KEY, []);
  setSafeLocal(DELETED_LS_KEY, deletedLocal.filter(d => d.id !== item.id));

  // Undelete in local tables
  if (item.table_name === 'employee') {
    const list = getSafeLocal<DbEmployee[]>(EMPLOYEES_LS_KEY, DEFAULT_STAFF);
    setSafeLocal(EMPLOYEES_LS_KEY, list.map(e => e.id === item.record_id ? { ...e, is_deleted: false, deleted_at: null, status: 'Active' } : e));
  } else if (item.table_name === 'attendance_record') {
    const list = getSafeLocal<DbAttendance[]>(ATTENDANCE_LS_KEY, []);
    setSafeLocal(ATTENDANCE_LS_KEY, list.map(a => a.id === item.record_id ? { ...a, is_deleted: false, deleted_at: null } : a));
  } else if (item.table_name === 'monthly_report') {
    const list = getSafeLocal<DbMonthlyReport[]>(MONTHS_LS_KEY, []);
    list.push(item.record_data);
    setSafeLocal(MONTHS_LS_KEY, list);
  } else if (item.table_name === 'import_log') {
    const list = getSafeLocal<DbImportLog[]>(IMPORTS_LS_KEY, []);
    list.push(item.record_data);
    setSafeLocal(IMPORTS_LS_KEY, list);
  }

  const supabase = getSupabaseClient();
  if (!supabase) return { success: true };

  try {
    await supabase.from('deleted_records').delete().eq('id', item.id);

    if (item.table_name === 'employee') {
      await supabase.from('employees').update({
        is_deleted: false,
        deleted_at: null,
        status: 'Active'
      }).eq('id', item.record_id);
    } else if (item.table_name === 'attendance_record') {
      await supabase.from('attendance_records').update({
        is_deleted: false,
        deleted_at: null
      }).eq('id', item.record_id);
    } else if (item.table_name === 'monthly_report') {
      await supabase.from('monthly_reports').upsert(item.record_data);
    } else if (item.table_name === 'import_log') {
      await supabase.from('import_logs').upsert(item.record_data);
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * Permanently purges soft deleted record after 24 hrs
 */
export async function permanentDeleteRecord(item: DbDeletedRecord): Promise<{ success: boolean; error?: string }> {
  // Purge from local trash queue
  const deletedLocal = getSafeLocal<DbDeletedRecord[]>(DELETED_LS_KEY, []);
  setSafeLocal(DELETED_LS_KEY, deletedLocal.filter(d => d.id !== item.id));

  // Purge from local tables permanently
  if (item.table_name === 'employee') {
    const list = getSafeLocal<DbEmployee[]>(EMPLOYEES_LS_KEY, DEFAULT_STAFF);
    setSafeLocal(EMPLOYEES_LS_KEY, list.filter(e => e.id !== item.record_id));
  } else if (item.table_name === 'attendance_record') {
    const list = getSafeLocal<DbAttendance[]>(ATTENDANCE_LS_KEY, []);
    setSafeLocal(ATTENDANCE_LS_KEY, list.filter(a => a.id !== item.record_id));
  }

  const supabase = getSupabaseClient();
  if (!supabase) return { success: true };

  try {
    await supabase.from('deleted_records').delete().eq('id', item.id);

    if (item.table_name === 'employee') {
      await supabase.from('employees').delete().eq('id', item.record_id);
      await supabase.from('attendance_records').delete().eq('employee_id', item.record_id);
    } else if (item.table_name === 'attendance_record') {
      await supabase.from('attendance_records').delete().eq('id', item.record_id);
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

// BACKWARD PORTABLE HELPERS FOR ADAPTER SCRIPTS
export async function softDeleteEmployee(id: string, originalData: DbEmployee): Promise<{ success: boolean; error?: string }> {
  return softDeleteRecord('employee', id, originalData, 'Admin', 'Staff manual soft delete');
}
export async function permanentDeleteEmployee(id: string): Promise<{ success: boolean; error?: string }> {
  return { success: true }; // Managed by permanentDeleteRecord now
}
export async function restoreEmployee(id: string): Promise<{ success: boolean; error?: string }> {
  const localTrash = getSafeLocal<DbDeletedRecord[]>(DELETED_LS_KEY, []);
  const trashItem = localTrash.find(t => t.table_name === 'employee' && t.record_id === id);
  if (trashItem) {
    return restoreRecord(trashItem);
  }
  return { success: false, error: 'Deleted trash index record not found.' };
}
export async function softDeleteAttendance(id: string, originalData: DbAttendance): Promise<{ success: boolean; error?: string }> {
  return softDeleteRecord('attendance_record', id, originalData, 'Admin', 'Attendance sheet row manual soft delete');
}
export async function permanentDeleteAttendance(id: string): Promise<{ success: boolean; error?: string }> {
  return { success: true }; // Managed by permanentDeleteRecord now
}
export async function restoreAttendance(id: string): Promise<{ success: boolean; error?: string }> {
  const localTrash = getSafeLocal<DbDeletedRecord[]>(DELETED_LS_KEY, []);
  const trashItem = localTrash.find(t => t.table_name === 'attendance_record' && t.record_id === id);
  if (trashItem) {
    return restoreRecord(trashItem);
  }
  return { success: false, error: 'Deleted attendance row trash index not found.' };
}

export interface DiagnosticResult {
  tableName: string;
  status: 'PASS' | 'FAIL' | 'MISSING_TABLE';
  columns: { columnName: string; status: 'PASS' | 'FAIL' }[];
  errorMessage?: string;
}

export async function runDatabaseDiagnostic(): Promise<DiagnosticResult[]> {
  const supabase = getSupabaseClient();
  const results: DiagnosticResult[] = [];
  
  if (!supabase) {
    return [];
  }

  const tableDefinitions = [
    {
      tableName: 'departments',
      columns: ['id', 'department_code', 'department_name', 'description', 'status', 'is_deleted', 'deleted_at', 'created_at', 'updated_at']
    },
    {
      tableName: 'employees',
      columns: ['id', 'employee_code', 'employee_name', 'email', 'department_id', 'department_name', 'designation', 'phone', 'joining_date', 'salary', 'base_salary', 'status', 'remarks', 'shift_start_time', 'shift_end_time', 'is_deleted', 'deleted_at', 'created_at', 'updated_at']
    },
    {
      tableName: 'attendance_records',
      columns: ['id', 'employee_id', 'attendance_date', 'checkin_time', 'checkout_time', 'net_hours', 'late_minutes', 'overtime_hours', 'short_hours', 'attendance_status', 'manual_status', 'remarks', 'performance_score', 'is_deleted', 'deleted_at', 'created_at', 'updated_at']
    },
    {
      tableName: 'deleted_records',
      columns: ['id', 'table_name', 'record_id', 'record_data', 'deleted_by', 'deleted_at', 'restore_until', 'delete_reason', 'restored_at', 'permanently_deleted_at']
    },
    {
      tableName: 'monthly_reports',
      columns: ['id', 'employee_id', 'month', 'year', 'present_days', 'absent_days', 'leave_days', 'off_days', 'late_count', 'missing_checkout_count', 'total_hours', 'overtime_hours', 'short_hours', 'performance_score', 'remarks', 'archived', 'locked', 'created_at', 'updated_at']
    },
    {
      tableName: 'attendance_edit_history',
      columns: ['id', 'attendance_id', 'employee_id', 'old_data', 'new_data', 'edited_by', 'edit_reason', 'created_at']
    },
    {
      tableName: 'monthly_reports',
      columns: ['id', 'employee_id', 'month', 'year', 'present_days', 'absent_days', 'leave_days', 'off_days', 'late_count', 'missing_checkout_count', 'total_hours', 'overtime_hours', 'short_hours', 'performance_score', 'remarks', 'archived', 'locked', 'created_at', 'updated_at']
    },
    {
      tableName: 'attendance_edit_history',
      columns: ['id', 'attendance_id', 'employee_id', 'old_data', 'new_data', 'edited_by', 'edit_reason', 'created_at']
    },
    {
      tableName: 'import_logs',
      columns: ['id', 'file_name', 'import_type', 'total_rows', 'success_rows', 'failed_rows', 'duplicate_rows', 'imported_by', 'created_at']
    },
    {
      tableName: 'employee_commissions',
      columns: ['id', 'employee_id', 'month', 'year', 'commission_amount', 'commission_reason', 'added_by', 'approved_by', 'approved_at', 'created_at', 'updated_at']
    },
    {
      tableName: 'employee_allowances',
      columns: ['id', 'employee_id', 'month', 'year', 'allowance_amount', 'allowance_type', 'reason', 'approved_by', 'created_at', 'updated_at']
    }
  ];

  for (const tableDef of tableDefinitions) {
    const tableResult: DiagnosticResult = {
      tableName: tableDef.tableName,
      status: 'PASS',
      columns: []
    };

    try {
      // First check if table exists by selecting id with limit 0
      const { error: tableError } = await supabase.from(tableDef.tableName).select('id').limit(0);
      
      if (tableError && (tableError.code === '42P01' || tableError.message?.toLowerCase().includes('does not exist'))) {
        tableResult.status = 'MISSING_TABLE';
        tableResult.errorMessage = `Table '${tableDef.tableName}' does not exist in the database.`;
        tableResult.columns = tableDef.columns.map(c => ({ columnName: c, status: 'FAIL' }));
        results.push(tableResult);
        continue;
      }

      // Test columns one by one
      let overallPass = true;
      for (const columnName of tableDef.columns) {
        const { error: colError } = await supabase.from(tableDef.tableName).select(columnName).limit(0);
        if (colError && (colError.code === '42703' || colError.code === 'PGRST204' || colError.message?.toLowerCase().includes('column'))) {
          tableResult.columns.push({ columnName, status: 'FAIL' });
          overallPass = false;
        } else {
          tableResult.columns.push({ columnName, status: 'PASS' });
        }
      }

      tableResult.status = overallPass ? 'PASS' : 'FAIL';
      if (!overallPass) {
        const missingCols = tableResult.columns.filter(c => c.status === 'FAIL').map(c => c.columnName);
        tableResult.errorMessage = `Database schema mismatch: missing column ${missingCols.join(', ')} in ${tableDef.tableName}.`;
      }
    } catch (e: any) {
      tableResult.status = 'FAIL';
      tableResult.errorMessage = e.message || 'Inspection query failed';
      tableResult.columns = tableDef.columns.map(c => ({ columnName: c, status: 'FAIL' }));
    }
    
    results.push(tableResult);
  }

  return results;
}

/**
 * Loads list of employee commissions.
 */
export async function loadCommissions(): Promise<{ data: EmployeeCommission[]; error?: string }> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { data: getSafeLocal<EmployeeCommission[]>(COMMISSIONS_LS_KEY, []) };
  }
  try {
    const { data, error } = await supabase.from('employee_commissions').select('*').order('id', { ascending: false });
    if (error) throw error;
    return { data: data || [] };
  } catch (err: any) {
    return { data: getSafeLocal<EmployeeCommission[]>(COMMISSIONS_LS_KEY, []), error: formatSupabaseError(err, 'employee_commissions') };
  }
}

/**
 * Saves or updates employee commission.
 */
export async function saveCommission(comm: EmployeeCommission): Promise<{ success: boolean; error?: string }> {
  const local = getSafeLocal<EmployeeCommission[]>(COMMISSIONS_LS_KEY, []);
  const idx = local.findIndex(c => c.id === comm.id);
  if (idx >= 0) {
    local[idx] = comm;
  } else {
    local.push(comm);
  }
  setSafeLocal(COMMISSIONS_LS_KEY, local);

  const supabase = getSupabaseClient();
  if (!supabase) return { success: true };

  try {
    const { error } = await supabase.from('employee_commissions').upsert(comm);
    if (error) throw error;
    return { success: true };
  } catch (err: any) {
    return { success: false, error: formatSupabaseError(err, 'employee_commissions') };
  }
}

/**
 * Deletes employee commission.
 */
export async function deleteCommission(id: string): Promise<{ success: boolean; error?: string }> {
  const local = getSafeLocal<EmployeeCommission[]>(COMMISSIONS_LS_KEY, []);
  const filtered = local.filter(c => c.id !== id);
  setSafeLocal(COMMISSIONS_LS_KEY, filtered);

  const supabase = getSupabaseClient();
  if (!supabase) return { success: true };

  try {
    const { error } = await supabase.from('employee_commissions').delete().eq('id', id);
    if (error) throw error;
    return { success: true };
  } catch (err: any) {
    return { success: false, error: formatSupabaseError(err, 'employee_commissions') };
  }
}

/**
 * Loads list of employee allowances.
 */
export async function loadAllowances(): Promise<{ data: EmployeeAllowance[]; error?: string }> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { data: getSafeLocal<EmployeeAllowance[]>(ALLOWANCES_LS_KEY, []) };
  }
  try {
    const { data, error } = await supabase.from('employee_allowances').select('*').order('id', { ascending: false });
    if (error) throw error;
    return { data: data || [] };
  } catch (err: any) {
    return { data: getSafeLocal<EmployeeAllowance[]>(ALLOWANCES_LS_KEY, []), error: formatSupabaseError(err, 'employee_allowances') };
  }
}

/**
 * Saves or updates employee allowance.
 */
export async function saveAllowance(allw: EmployeeAllowance): Promise<{ success: boolean; error?: string }> {
  const local = getSafeLocal<EmployeeAllowance[]>(ALLOWANCES_LS_KEY, []);
  const idx = local.findIndex(a => a.id === allw.id);
  if (idx >= 0) {
    local[idx] = allw;
  } else {
    local.push(allw);
  }
  setSafeLocal(ALLOWANCES_LS_KEY, local);

  const supabase = getSupabaseClient();
  if (!supabase) return { success: true };

  try {
    const { error } = await supabase.from('employee_allowances').upsert(allw);
    if (error) throw error;
    return { success: true };
  } catch (err: any) {
    return { success: false, error: formatSupabaseError(err, 'employee_allowances') };
  }
}

/**
 * Deletes employee allowance.
 */
export async function deleteAllowance(id: string): Promise<{ success: boolean; error?: string }> {
  const local = getSafeLocal<EmployeeAllowance[]>(ALLOWANCES_LS_KEY, []);
  const filtered = local.filter(a => a.id !== id);
  setSafeLocal(ALLOWANCES_LS_KEY, filtered);

  const supabase = getSupabaseClient();
  if (!supabase) return { success: true };

  try {
    const { error } = await supabase.from('employee_allowances').delete().eq('id', id);
    if (error) throw error;
    return { success: true };
  } catch (err: any) {
    return { success: false, error: formatSupabaseError(err, 'employee_allowances') };
  }
}

