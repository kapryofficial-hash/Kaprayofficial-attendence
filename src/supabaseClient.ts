import { createClient } from '@supabase/supabase-js';

const LS_URL_KEY = 'custom_supabase_url';
const LS_KEY_KEY = 'custom_supabase_anon_key';

export function getSupabaseCredentials() {
  const meta = import.meta as any;
  const envUrl = meta.env?.VITE_SUPABASE_URL;
  const envKey = meta.env?.VITE_SUPABASE_ANON_KEY;
  
  const customUrl = localStorage.getItem(LS_URL_KEY);
  const customKey = localStorage.getItem(LS_KEY_KEY);
  
  return {
    url: customUrl || envUrl || '',
    key: customKey || envKey || '',
    isEnv: !customUrl && !!envUrl
  };
}

export function saveSupabaseCredentials(url: string, key: string) {
  if (!url || !key) {
    localStorage.removeItem(LS_URL_KEY);
    localStorage.removeItem(LS_KEY_KEY);
  } else {
    localStorage.setItem(LS_URL_KEY, url.trim());
    localStorage.setItem(LS_KEY_KEY, key.trim());
  }
}

export function getSupabaseClient() {
  const { url, key } = getSupabaseCredentials();
  if (!url || !key) {
    (globalThis as any)._supabaseClient = null;
    (globalThis as any)._supabaseUrl = '';
    (globalThis as any)._supabaseKey = '';
    return null;
  }
  
  const cachedClient = (globalThis as any)._supabaseClient;
  const cachedUrl = (globalThis as any)._supabaseUrl;
  const cachedKey = (globalThis as any)._supabaseKey;

  if (cachedClient && cachedUrl === url && cachedKey === key) {
    return cachedClient;
  }

  try {
    const client = createClient(url, key, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    });
    (globalThis as any)._supabaseClient = client;
    (globalThis as any)._supabaseUrl = url;
    (globalThis as any)._supabaseKey = key;
    return client;
  } catch (err) {
    console.error('Failed to initialize Supabase client:', err);
    (globalThis as any)._supabaseClient = null;
    (globalThis as any)._supabaseUrl = '';
    (globalThis as any)._supabaseKey = '';
    return null;
  }
}

// SQL Script generator with the complete schema matching user specifications
export const SQL_SCHEMA_SCRIPT = `-- AL-KALI MAKERS ATTENDANCE SYSTEM - UPGRADED PROFESSIONAL SQL DATABASE SCHEMA
-- RUN THIS IN YOUR SUPABASE SQL EDITOR TO SETUP CENTRAL SYNCHRONIZED TABLES

-- 1. DEPARTMENTS TABLE WITH CODES, NAMES, AND ENABLE STATES
CREATE TABLE IF NOT EXISTS public.departments (
  id TEXT PRIMARY KEY, -- UUID or custom unique key
  department_code TEXT UNIQUE NOT NULL,
  department_name TEXT UNIQUE NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'active', -- 'active', 'disabled'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- 2. EMPLOYEES TABLE WITH SOFT-DELETE AND DISABLE ACTIONS
CREATE TABLE IF NOT EXISTS public.employees (
  id TEXT PRIMARY KEY, -- employee_code or UUID
  employee_code TEXT UNIQUE NOT NULL,
  employee_name TEXT NOT NULL,
  email TEXT,
  department_id TEXT REFERENCES public.departments(id) ON DELETE SET NULL,
  department_name TEXT, -- cache layer for speed
  designation TEXT,
  phone TEXT,
  joining_date TEXT,
  salary NUMERIC DEFAULT 0, -- base_salary compatible field
  base_salary NUMERIC DEFAULT 0, -- legacy compatibility field
  status TEXT DEFAULT 'active', -- 'active', 'disabled'
  remarks TEXT,
  is_deleted BOOLEAN DEFAULT false, -- Soft delete flag
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. ATTENDANCE RECORDS TABLE WITH AUDIT & PERFORMANCE METRICS
CREATE TABLE IF NOT EXISTS public.attendance_records (
  id TEXT PRIMARY KEY, -- Composition: employee_id + '_' + date
  employee_id TEXT REFERENCES public.employees(id) ON DELETE CASCADE,
  attendance_date TEXT NOT NULL, -- Format: YYYY-MM-DD
  checkin_time TEXT, -- Format: HH:MM (24h)
  checkout_time TEXT, -- Format: HH:MM (24h)
  net_hours NUMERIC DEFAULT 0,
  late_minutes NUMERIC DEFAULT 0,
  overtime_hours NUMERIC DEFAULT 0,
  short_hours NUMERIC DEFAULT 0,
  attendance_status TEXT DEFAULT 'Absent', -- Computed: 'Present', 'Absent', 'Half-Day', 'Leave', 'Off', 'Missing Checkout'
  manual_status TEXT DEFAULT 'Auto', -- 'Auto', 'Present', 'Absent', 'Leave', 'Off'
  remarks TEXT, -- remarks
  performance_score NUMERIC DEFAULT 100,
  is_deleted BOOLEAN DEFAULT false, -- Soft delete flag
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- 4. EDIT HISTORY FOR ATTENDANCE CHANGES
CREATE TABLE IF NOT EXISTS public.attendance_edit_history (
  id TEXT PRIMARY KEY,
  attendance_id TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  old_data JSONB,
  new_data JSONB,
  edited_by TEXT,
  edit_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. DELETED RECORDS (PRO RECYCLE BIN TRAIL WITH RESTORE_UNTIL TIMELINE)
CREATE TABLE IF NOT EXISTS public.deleted_records (
  id TEXT PRIMARY KEY,
  table_name TEXT NOT NULL,
  record_id TEXT NOT NULL,
  record_data JSONB,
  deleted_by TEXT,
  deleted_at TIMESTAMPTZ DEFAULT NOW(),
  restore_until TIMESTAMPTZ NOT NULL,
  delete_reason TEXT,
  restored_at TIMESTAMPTZ,
  permanently_deleted_at TIMESTAMPTZ
);

-- 6. UPGRADED IMPORT LOGS
CREATE TABLE IF NOT EXISTS public.import_logs (
  id TEXT PRIMARY KEY,
  file_name TEXT,
  import_type TEXT,
  total_rows INTEGER DEFAULT 0,
  success_rows INTEGER DEFAULT 0,
  failed_rows INTEGER DEFAULT 0,
  duplicate_rows INTEGER DEFAULT 0,
  imported_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. MONTHLY REPORTS COMPILATION PER EMPLOYEE
CREATE TABLE IF NOT EXISTS public.monthly_reports (
  id TEXT PRIMARY KEY, -- Format: employee_id_YYYY-MM
  employee_id TEXT REFERENCES public.employees(id) ON DELETE CASCADE,
  month TEXT NOT NULL, -- MM
  year TEXT NOT NULL, -- YYYY
  present_days INTEGER DEFAULT 0,
  absent_days INTEGER DEFAULT 0,
  leave_days INTEGER DEFAULT 0,
  off_days INTEGER DEFAULT 0,
  late_count INTEGER DEFAULT 0,
  missing_checkout_count INTEGER DEFAULT 0,
  total_hours NUMERIC DEFAULT 0,
  overtime_hours NUMERIC DEFAULT 0,
  short_hours NUMERIC DEFAULT 0,
  performance_score NUMERIC DEFAULT 100,
  remarks TEXT,
  archived BOOLEAN DEFAULT false, -- Archived or locked state
  locked BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. EMPLOYEE COMMISSIONS TABLE
CREATE TABLE IF NOT EXISTS public.employee_commissions (
  id TEXT PRIMARY KEY,
  employee_id TEXT REFERENCES public.employees(id) ON DELETE CASCADE,
  month TEXT NOT NULL,
  year TEXT NOT NULL,
  commission_amount NUMERIC DEFAULT 0,
  commission_reason TEXT,
  added_by TEXT,
  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. EMPLOYEE ALLOWANCES TABLE
CREATE TABLE IF NOT EXISTS public.employee_allowances (
  id TEXT PRIMARY KEY,
  employee_id TEXT REFERENCES public.employees(id) ON DELETE CASCADE,
  month TEXT NOT NULL,
  year TEXT NOT NULL,
  allowance_amount NUMERIC DEFAULT 0,
  allowance_type TEXT NOT NULL,
  reason TEXT,
  approved_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 10. USER ROLES TABLE (Authorized Roles)
CREATE TABLE IF NOT EXISTS public.user_roles (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL, -- references auth.users(id) on delete cascade
  role TEXT NOT NULL, -- 'super_admin' | 'admin' | 'manager' | 'staff_viewer'
  employee_id TEXT NULL, -- connected employee code for staff_viewer role
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 11. AUDIT LOGS TABLE
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id TEXT PRIMARY KEY,
  user_id UUID,
  user_email TEXT NOT NULL,
  role TEXT NOT NULL,
  action TEXT NOT NULL,
  table_name TEXT,
  record_id TEXT,
  old_data JSONB,
  new_data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 12. INDEXES FOR SPEEDY LOADS
CREATE INDEX IF NOT EXISTS idx_attendance_date ON public.attendance_records(attendance_date);
CREATE INDEX IF NOT EXISTS idx_attendance_employee ON public.attendance_records(employee_id);
CREATE INDEX IF NOT EXISTS idx_employees_status ON public.employees(status);
CREATE INDEX IF NOT EXISTS idx_user_roles_uid ON public.user_roles(user_id);

-- 13. ENABLE ROW LEVEL SECURITY
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_edit_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deleted_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.import_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monthly_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_commissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_allowances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- 14. SECURITY HELPER FUNCTIONS
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS text SECURITY DEFINER AS $$
BEGIN
  RETURN (SELECT role FROM public.user_roles WHERE user_id = auth.uid() LIMIT 1);
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.get_user_employee_id()
RETURNS text SECURITY DEFINER AS $$
BEGIN
  RETURN (SELECT employee_id FROM public.user_roles WHERE user_id = auth.uid() LIMIT 1);
END;
$$ LANGUAGE plpgsql;

-- 15. SECURE ROLE-BASED ACCESS POLICIES (ANONYMOUS BLOCKED)

-- DEPARTMENTS POLICIES
DROP POLICY IF EXISTS "Allow anon select departments" ON public.departments;
DROP POLICY IF EXISTS "Allow anon insert departments" ON public.departments;
DROP POLICY IF EXISTS "Allow anon update departments" ON public.departments;
DROP POLICY IF EXISTS "Allow anon delete departments" ON public.departments;

CREATE POLICY "super_admin_manage_departments" ON public.departments FOR ALL
  USING (public.get_user_role() = 'super_admin') WITH CHECK (public.get_user_role() = 'super_admin');
CREATE POLICY "admin_manager_select_departments" ON public.departments FOR SELECT
  USING (public.get_user_role() IN ('super_admin', 'admin', 'manager'));

-- EMPLOYEES POLICIES
DROP POLICY IF EXISTS "Allow anon select employees" ON public.employees;
DROP POLICY IF EXISTS "Allow anon insert employees" ON public.employees;
DROP POLICY IF EXISTS "Allow anon update employees" ON public.employees;
DROP POLICY IF EXISTS "Allow anon delete employees" ON public.employees;

CREATE POLICY "super_admin_all_employees" ON public.employees FOR ALL
  USING (public.get_user_role() = 'super_admin') WITH CHECK (public.get_user_role() = 'super_admin');
CREATE POLICY "admin_insert_update_employees" ON public.employees FOR ALL
  USING (public.get_user_role() = 'admin') WITH CHECK (public.get_user_role() = 'admin');
CREATE POLICY "manager_select_employees" ON public.employees FOR SELECT
  USING (public.get_user_role() = 'manager');
CREATE POLICY "staff_viewer_select_own_employee" ON public.employees FOR SELECT
  USING (public.get_user_role() = 'staff_viewer' AND id = public.get_user_employee_id());

-- ATTENDANCE RECORDS POLICIES
DROP POLICY IF EXISTS "Allow anon select attendance" ON public.attendance_records;
DROP POLICY IF EXISTS "Allow anon insert attendance" ON public.attendance_records;
DROP POLICY IF EXISTS "Allow anon update attendance" ON public.attendance_records;
DROP POLICY IF EXISTS "Allow anon delete attendance" ON public.attendance_records;

CREATE POLICY "super_admin_all_attendance" ON public.attendance_records FOR ALL
  USING (public.get_user_role() = 'super_admin') WITH CHECK (public.get_user_role() = 'super_admin');
CREATE POLICY "admin_manager_insert_update_attendance" ON public.attendance_records FOR ALL
  USING (public.get_user_role() IN ('admin', 'manager')) WITH CHECK (public.get_user_role() IN ('admin', 'manager'));
CREATE POLICY "staff_viewer_select_own_attendance" ON public.attendance_records FOR SELECT
  USING (public.get_user_role() = 'staff_viewer' AND employee_id = public.get_user_employee_id());

-- ATTENDANCE EDIT HISTORY POLICIES
DROP POLICY IF EXISTS "Allow anon select edit_history" ON public.attendance_edit_history;
DROP POLICY IF EXISTS "Allow anon insert edit_history" ON public.attendance_edit_history;
DROP POLICY IF EXISTS "Allow anon update edit_history" ON public.attendance_edit_history;
DROP POLICY IF EXISTS "Allow anon delete edit_history" ON public.attendance_edit_history;

CREATE POLICY "super_admin_all_edit_history" ON public.attendance_edit_history FOR ALL
  USING (public.get_user_role() = 'super_admin') WITH CHECK (public.get_user_role() = 'super_admin');
CREATE POLICY "admin_manager_insert_select_edit_history" ON public.attendance_edit_history FOR ALL
  USING (public.get_user_role() IN ('admin', 'manager')) WITH CHECK (public.get_user_role() IN ('admin', 'manager'));

-- DELETED RECORDS POLICIES (RECYCLE BIN)
DROP POLICY IF EXISTS "Allow anon select deleted" ON public.deleted_records;
DROP POLICY IF EXISTS "Allow anon insert deleted" ON public.deleted_records;
DROP POLICY IF EXISTS "Allow anon update deleted" ON public.deleted_records;
DROP POLICY IF EXISTS "Allow anon delete deleted" ON public.deleted_records;

CREATE POLICY "super_admin_all_deleted" ON public.deleted_records FOR ALL
  USING (public.get_user_role() = 'super_admin') WITH CHECK (public.get_user_role() = 'super_admin');
CREATE POLICY "admin_insert_select_deleted" ON public.deleted_records FOR ALL
  USING (public.get_user_role() = 'admin') WITH CHECK (public.get_user_role() = 'admin');

-- IMPORT LOGS POLICIES
DROP POLICY IF EXISTS "Allow anon select imports" ON public.import_logs;
DROP POLICY IF EXISTS "Allow anon insert imports" ON public.import_logs;
DROP POLICY IF EXISTS "Allow anon update imports" ON public.import_logs;
DROP POLICY IF EXISTS "Allow anon delete imports" ON public.import_logs;

CREATE POLICY "super_admin_all_imports" ON public.import_logs FOR ALL
  USING (public.get_user_role() = 'super_admin') WITH CHECK (public.get_user_role() = 'super_admin');
CREATE POLICY "admin_insert_select_imports" ON public.import_logs FOR ALL
  USING (public.get_user_role() = 'admin') WITH CHECK (public.get_user_role() = 'admin');

-- MONTHLY REPORTS POLICIES
DROP POLICY IF EXISTS "Allow anon select monthly" ON public.monthly_reports;
DROP POLICY IF EXISTS "Allow anon insert monthly" ON public.monthly_reports;
DROP POLICY IF EXISTS "Allow anon update monthly" ON public.monthly_reports;
DROP POLICY IF EXISTS "Allow anon delete monthly" ON public.monthly_reports;

CREATE POLICY "super_admin_all_monthly" ON public.monthly_reports FOR ALL
  USING (public.get_user_role() = 'super_admin') WITH CHECK (public.get_user_role() = 'super_admin');
CREATE POLICY "admin_insert_update_monthly" ON public.monthly_reports FOR ALL
  USING (public.get_user_role() = 'admin') WITH CHECK (public.get_user_role() = 'admin');
CREATE POLICY "manager_select_monthly" ON public.monthly_reports FOR SELECT
  USING (public.get_user_role() = 'manager');
CREATE POLICY "staff_viewer_select_own_monthly" ON public.monthly_reports FOR SELECT
  USING (public.get_user_role() = 'staff_viewer' AND employee_id = public.get_user_employee_id());

-- EMPLOYEE COMMISSIONS POLICIES
DROP POLICY IF EXISTS "Allow anon select commissions" ON public.employee_commissions;
DROP POLICY IF EXISTS "Allow anon insert commissions" ON public.employee_commissions;
DROP POLICY IF EXISTS "Allow anon update commissions" ON public.employee_commissions;
DROP POLICY IF EXISTS "Allow anon delete commissions" ON public.employee_commissions;

CREATE POLICY "super_admin_all_commissions" ON public.employee_commissions FOR ALL
  USING (public.get_user_role() = 'super_admin') WITH CHECK (public.get_user_role() = 'super_admin');
CREATE POLICY "admin_insert_update_commissions" ON public.employee_commissions FOR ALL
  USING (public.get_user_role() = 'admin') WITH CHECK (public.get_user_role() = 'admin');
CREATE POLICY "staff_viewer_select_own_commissions" ON public.employee_commissions FOR SELECT
  USING (public.get_user_role() = 'staff_viewer' AND employee_id = public.get_user_employee_id());

-- EMPLOYEE ALLOWANCES POLICIES
DROP POLICY IF EXISTS "Allow anon select allowances" ON public.employee_allowances;
DROP POLICY IF EXISTS "Allow anon insert allowances" ON public.employee_allowances;
DROP POLICY IF EXISTS "Allow anon update allowances" ON public.employee_allowances;
DROP POLICY IF EXISTS "Allow anon delete allowances" ON public.employee_allowances;

CREATE POLICY "super_admin_all_allowances" ON public.employee_allowances FOR ALL
  USING (public.get_user_role() = 'super_admin') WITH CHECK (public.get_user_role() = 'super_admin');
CREATE POLICY "admin_insert_update_allowances" ON public.employee_allowances FOR ALL
  USING (public.get_user_role() = 'admin') WITH CHECK (public.get_user_role() = 'admin');
CREATE POLICY "staff_viewer_select_own_allowances" ON public.employee_allowances FOR SELECT
  USING (public.get_user_role() = 'staff_viewer' AND employee_id = public.get_user_employee_id());

-- USER ROLES POLICIES
DROP POLICY IF EXISTS "super_admin_all_user_roles" ON public.user_roles;
DROP POLICY IF EXISTS "all_select_own_user_roles" ON public.user_roles;

CREATE POLICY "super_admin_all_user_roles" ON public.user_roles FOR ALL
  USING (public.get_user_role() = 'super_admin') WITH CHECK (public.get_user_role() = 'super_admin');
CREATE POLICY "all_select_own_user_roles" ON public.user_roles FOR SELECT
  USING (user_id = auth.uid());

-- AUDIT LOGS POLICIES
DROP POLICY IF EXISTS "super_admin_select_audit_logs" ON public.audit_logs;
DROP POLICY IF EXISTS "authenticated_insert_audit_logs" ON public.audit_logs;

CREATE POLICY "super_admin_select_audit_logs" ON public.audit_logs FOR SELECT
  USING (public.get_user_role() = 'super_admin');
CREATE POLICY "authenticated_insert_audit_logs" ON public.audit_logs FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);
  
-- DONE! SECURED SYSTEM MIGRATION SUCCESSFULLY COMPLETED!

`;

export const SQL_MIGRATION_SCRIPT = `-- KAPRAYOFFICIAL ATTENDANCE SYSTEM - SAFE UPGRADE MIGRATION SCRIPT
-- RUN THIS IN YOUR SUPABASE SQL EDITOR TO PATCH MISSING COLUMNS SECURELY WITHOUT DATA LOSS AND ENABLE COMPLETE AUTH/ROLE SECURITY!

-- 1. UPGRADE Departments
ALTER TABLE public.departments ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT false;
ALTER TABLE public.departments ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE public.departments ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.departments ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- 2. UPGRADE Employees
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS joining_date TEXT;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS shift_start_time TEXT DEFAULT '13:30';
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS shift_end_time TEXT DEFAULT '23:30';
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT false;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- 3. UPGRADE Attendance Records
ALTER TABLE public.attendance_records ADD COLUMN IF NOT EXISTS short_hours NUMERIC DEFAULT 0;
ALTER TABLE public.attendance_records ADD COLUMN IF NOT EXISTS performance_score NUMERIC DEFAULT 100;
ALTER TABLE public.attendance_records ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT false;
ALTER TABLE public.attendance_records ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE public.attendance_records ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.attendance_records ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- 4. CREATE Attendance Edit History Table if missing
CREATE TABLE IF NOT EXISTS public.attendance_edit_history (
  id TEXT PRIMARY KEY,
  attendance_id TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  old_data JSONB,
  new_data JSONB,
  edited_by TEXT,
  edit_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. CREATE Deleted Records Table if missing (for Recycle Bin)
CREATE TABLE IF NOT EXISTS public.deleted_records (
  id TEXT PRIMARY KEY,
  table_name TEXT NOT NULL,
  record_id TEXT NOT NULL,
  record_data JSONB,
  deleted_by TEXT,
  deleted_at TIMESTAMPTZ DEFAULT NOW(),
  restore_until TIMESTAMPTZ NOT NULL,
  delete_reason TEXT,
  restored_at TIMESTAMPTZ,
  permanently_deleted_at TIMESTAMPTZ
);

-- 6. CREATE Import Logs Table if missing
CREATE TABLE IF NOT EXISTS public.import_logs (
  id TEXT PRIMARY KEY,
  file_name TEXT,
  import_type TEXT,
  total_rows INTEGER DEFAULT 0,
  success_rows INTEGER DEFAULT 0,
  failed_rows INTEGER DEFAULT 0,
  duplicate_rows INTEGER DEFAULT 0,
  imported_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. CREATE Monthly Reports Table if missing
CREATE TABLE IF NOT EXISTS public.monthly_reports (
  id TEXT PRIMARY KEY,
  employee_id TEXT REFERENCES public.employees(id) ON DELETE CASCADE,
  month TEXT NOT NULL,
  year TEXT NOT NULL,
  present_days INTEGER DEFAULT 0,
  absent_days INTEGER DEFAULT 0,
  leave_days INTEGER DEFAULT 0,
  off_days INTEGER DEFAULT 0,
  late_count INTEGER DEFAULT 0,
  missing_checkout_count INTEGER DEFAULT 0,
  total_hours NUMERIC DEFAULT 0,
  overtime_hours NUMERIC DEFAULT 0,
  short_hours NUMERIC DEFAULT 0,
  performance_score NUMERIC DEFAULT 100,
  remarks TEXT,
  archived BOOLEAN DEFAULT false,
  locked BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. CREATE User Roles and Audit Logs Tables if missing
CREATE TABLE IF NOT EXISTS public.user_roles (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL, -- references auth.users(id) on delete cascade
  role TEXT NOT NULL, -- 'super_admin' | 'admin' | 'manager' | 'staff_viewer'
  employee_id TEXT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id TEXT PRIMARY KEY,
  user_id UUID,
  user_email TEXT NOT NULL,
  role TEXT NOT NULL,
  action TEXT NOT NULL,
  table_name TEXT,
  record_id TEXT,
  old_data JSONB,
  new_data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. RE-APPLY RLS, SECURITY HELPERS, AND SECURE ROLE POLICIES
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_edit_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deleted_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.import_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monthly_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_commissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_allowances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS text SECURITY DEFINER AS $$
BEGIN
  RETURN (SELECT role FROM public.user_roles WHERE user_id = auth.uid() LIMIT 1);
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.get_user_employee_id()
RETURNS text SECURITY DEFINER AS $$
BEGIN
  RETURN (SELECT employee_id FROM public.user_roles WHERE user_id = auth.uid() LIMIT 1);
END;
$$ LANGUAGE plpgsql;

-- CLEAN AND RE-APPLY POLICIES
-- DEPARTMENTS
DROP POLICY IF EXISTS "Allow anon select departments" ON public.departments;
DROP POLICY IF EXISTS "Allow anon insert departments" ON public.departments;
DROP POLICY IF EXISTS "Allow anon update departments" ON public.departments;
DROP POLICY IF EXISTS "Allow anon delete departments" ON public.departments;
DROP POLICY IF EXISTS "super_admin_manage_departments" ON public.departments;
DROP POLICY IF EXISTS "admin_manager_select_departments" ON public.departments;

CREATE POLICY "super_admin_manage_departments" ON public.departments FOR ALL
  USING (public.get_user_role() = 'super_admin') WITH CHECK (public.get_user_role() = 'super_admin');
CREATE POLICY "admin_manager_select_departments" ON public.departments FOR SELECT
  USING (public.get_user_role() IN ('super_admin', 'admin', 'manager'));

-- EMPLOYEES
DROP POLICY IF EXISTS "Allow anon select employees" ON public.employees;
DROP POLICY IF EXISTS "Allow anon insert employees" ON public.employees;
DROP POLICY IF EXISTS "Allow anon update employees" ON public.employees;
DROP POLICY IF EXISTS "Allow anon delete employees" ON public.employees;
DROP POLICY IF EXISTS "super_admin_all_employees" ON public.employees;
DROP POLICY IF EXISTS "admin_insert_update_employees" ON public.employees;
DROP POLICY IF EXISTS "manager_select_employees" ON public.employees;
DROP POLICY IF EXISTS "staff_viewer_select_own_employee" ON public.employees;

CREATE POLICY "super_admin_all_employees" ON public.employees FOR ALL
  USING (public.get_user_role() = 'super_admin') WITH CHECK (public.get_user_role() = 'super_admin');
CREATE POLICY "admin_insert_update_employees" ON public.employees FOR ALL
  USING (public.get_user_role() = 'admin') WITH CHECK (public.get_user_role() = 'admin');
CREATE POLICY "manager_select_employees" ON public.employees FOR SELECT
  USING (public.get_user_role() = 'manager');
CREATE POLICY "staff_viewer_select_own_employee" ON public.employees FOR SELECT
  USING (public.get_user_role() = 'staff_viewer' AND id = public.get_user_employee_id());

-- ATTENDANCE RECORDS
DROP POLICY IF EXISTS "Allow anon select attendance" ON public.attendance_records;
DROP POLICY IF EXISTS "Allow anon insert attendance" ON public.attendance_records;
DROP POLICY IF EXISTS "Allow anon update attendance" ON public.attendance_records;
DROP POLICY IF EXISTS "Allow anon delete attendance" ON public.attendance_records;
DROP POLICY IF EXISTS "super_admin_all_attendance" ON public.attendance_records;
DROP POLICY IF EXISTS "admin_manager_insert_update_attendance" ON public.attendance_records;
DROP POLICY IF EXISTS "staff_viewer_select_own_attendance" ON public.attendance_records;

CREATE POLICY "super_admin_all_attendance" ON public.attendance_records FOR ALL
  USING (public.get_user_role() = 'super_admin') WITH CHECK (public.get_user_role() = 'super_admin');
CREATE POLICY "admin_manager_insert_update_attendance" ON public.attendance_records FOR ALL
  USING (public.get_user_role() IN ('admin', 'manager')) WITH CHECK (public.get_user_role() IN ('admin', 'manager'));
CREATE POLICY "staff_viewer_select_own_attendance" ON public.attendance_records FOR SELECT
  USING (public.get_user_role() = 'staff_viewer' AND employee_id = public.get_user_employee_id());

-- ATTENDANCE EDIT HISTORY
DROP POLICY IF EXISTS "Allow anon select edit_history" ON public.attendance_edit_history;
DROP POLICY IF EXISTS "Allow anon insert edit_history" ON public.attendance_edit_history;
DROP POLICY IF EXISTS "Allow anon update edit_history" ON public.attendance_edit_history;
DROP POLICY IF EXISTS "Allow anon delete edit_history" ON public.attendance_edit_history;
DROP POLICY IF EXISTS "super_admin_all_edit_history" ON public.attendance_edit_history;
DROP POLICY IF EXISTS "admin_manager_insert_select_edit_history" ON public.attendance_edit_history;

CREATE POLICY "super_admin_all_edit_history" ON public.attendance_edit_history FOR ALL
  USING (public.get_user_role() = 'super_admin') WITH CHECK (public.get_user_role() = 'super_admin');
CREATE POLICY "admin_manager_insert_select_edit_history" ON public.attendance_edit_history FOR ALL
  USING (public.get_user_role() IN ('admin', 'manager')) WITH CHECK (public.get_user_role() IN ('admin', 'manager'));

-- DELETED RECORDS
DROP POLICY IF EXISTS "Allow anon select deleted" ON public.deleted_records;
DROP POLICY IF EXISTS "Allow anon insert deleted" ON public.deleted_records;
DROP POLICY IF EXISTS "Allow anon update deleted" ON public.deleted_records;
DROP POLICY IF EXISTS "Allow anon delete deleted" ON public.deleted_records;
DROP POLICY IF EXISTS "super_admin_all_deleted" ON public.deleted_records;
DROP POLICY IF EXISTS "admin_insert_select_deleted" ON public.deleted_records;

CREATE POLICY "super_admin_all_deleted" ON public.deleted_records FOR ALL
  USING (public.get_user_role() = 'super_admin') WITH CHECK (public.get_user_role() = 'super_admin');
CREATE POLICY "admin_insert_select_deleted" ON public.deleted_records FOR ALL
  USING (public.get_user_role() = 'admin') WITH CHECK (public.get_user_role() = 'admin');

-- IMPORT LOGS
DROP POLICY IF EXISTS "Allow anon select imports" ON public.import_logs;
DROP POLICY IF EXISTS "Allow anon insert imports" ON public.import_logs;
DROP POLICY IF EXISTS "Allow anon update imports" ON public.import_logs;
DROP POLICY IF EXISTS "Allow anon delete imports" ON public.import_logs;
DROP POLICY IF EXISTS "super_admin_all_imports" ON public.import_logs;
DROP POLICY IF EXISTS "admin_insert_select_imports" ON public.import_logs;

CREATE POLICY "super_admin_all_imports" ON public.import_logs FOR ALL
  USING (public.get_user_role() = 'super_admin') WITH CHECK (public.get_user_role() = 'super_admin');
CREATE POLICY "admin_insert_select_imports" ON public.import_logs FOR ALL
  USING (public.get_user_role() = 'admin') WITH CHECK (public.get_user_role() = 'admin');

-- MONTHLY REPORTS
DROP POLICY IF EXISTS "Allow anon select monthly" ON public.monthly_reports;
DROP POLICY IF EXISTS "Allow anon insert monthly" ON public.monthly_reports;
DROP POLICY IF EXISTS "Allow anon update monthly" ON public.monthly_reports;
DROP POLICY IF EXISTS "Allow anon delete monthly" ON public.monthly_reports;
DROP POLICY IF EXISTS "super_admin_all_monthly" ON public.monthly_reports;
DROP POLICY IF EXISTS "admin_insert_update_monthly" ON public.monthly_reports;
DROP POLICY IF EXISTS "manager_select_monthly" ON public.monthly_reports;
DROP POLICY IF EXISTS "staff_viewer_select_own_monthly" ON public.monthly_reports;

CREATE POLICY "super_admin_all_monthly" ON public.monthly_reports FOR ALL
  USING (public.get_user_role() = 'super_admin') WITH CHECK (public.get_user_role() = 'super_admin');
CREATE POLICY "admin_insert_update_monthly" ON public.monthly_reports FOR ALL
  USING (public.get_user_role() = 'admin') WITH CHECK (public.get_user_role() = 'admin');
CREATE POLICY "manager_select_monthly" ON public.monthly_reports FOR SELECT
  USING (public.get_user_role() = 'manager');
CREATE POLICY "staff_viewer_select_own_monthly" ON public.monthly_reports FOR SELECT
  USING (public.get_user_role() = 'staff_viewer' AND employee_id = public.get_user_employee_id());

-- COMMISSIONS & ALLOWANCES
DROP POLICY IF EXISTS "super_admin_all_commissions" ON public.employee_commissions;
DROP POLICY IF EXISTS "admin_insert_update_commissions" ON public.employee_commissions;
DROP POLICY IF EXISTS "staff_viewer_select_own_commissions" ON public.employee_commissions;
DROP POLICY IF EXISTS "super_admin_all_allowances" ON public.employee_allowances;
DROP POLICY IF EXISTS "admin_insert_update_allowances" ON public.employee_allowances;
DROP POLICY IF EXISTS "staff_viewer_select_own_allowances" ON public.employee_allowances;

CREATE POLICY "super_admin_all_commissions" ON public.employee_commissions FOR ALL
  USING (public.get_user_role() = 'super_admin') WITH CHECK (public.get_user_role() = 'super_admin');
CREATE POLICY "admin_insert_update_commissions" ON public.employee_commissions FOR ALL
  USING (public.get_user_role() = 'admin') WITH CHECK (public.get_user_role() = 'admin');
CREATE POLICY "staff_viewer_select_own_commissions" ON public.employee_commissions FOR SELECT
  USING (public.get_user_role() = 'staff_viewer' AND employee_id = public.get_user_employee_id());

CREATE POLICY "super_admin_all_allowances" ON public.employee_allowances FOR ALL
  USING (public.get_user_role() = 'super_admin') WITH CHECK (public.get_user_role() = 'super_admin');
CREATE POLICY "admin_insert_update_allowances" ON public.employee_allowances FOR ALL
  USING (public.get_user_role() = 'admin') WITH CHECK (public.get_user_role() = 'admin');
CREATE POLICY "staff_viewer_select_own_allowances" ON public.employee_allowances FOR SELECT
  USING (public.get_user_role() = 'staff_viewer' AND employee_id = public.get_user_employee_id());

-- USER ROLES POLICIES
DROP POLICY IF EXISTS "super_admin_all_user_roles" ON public.user_roles;
DROP POLICY IF EXISTS "all_select_own_user_roles" ON public.user_roles;

CREATE POLICY "super_admin_all_user_roles" ON public.user_roles FOR ALL
  USING (public.get_user_role() = 'super_admin') WITH CHECK (public.get_user_role() = 'super_admin');
CREATE POLICY "all_select_own_user_roles" ON public.user_roles FOR SELECT
  USING (user_id = auth.uid());

-- AUDIT LOGS POLICIES
DROP POLICY IF EXISTS "super_admin_select_audit_logs" ON public.audit_logs;
DROP POLICY IF EXISTS "authenticated_insert_audit_logs" ON public.audit_logs;

CREATE POLICY "super_admin_select_audit_logs" ON public.audit_logs FOR SELECT
  USING (public.get_user_role() = 'super_admin');
CREATE POLICY "authenticated_insert_audit_logs" ON public.audit_logs FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

`;

export interface DbDepartment {
  id: string; // uuid
  department_code: string;
  department_name: string;
  description?: string | null;
  status?: string; // 'active', 'disabled'
  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null;
}

export interface DbEmployee {
  id: string; // Will act as employee_code or uuid (EMP-XX)
  employee_code?: string;
  employee_name?: string;
  name: string; // Comp layer for legacy references to name
  email?: string | null;
  designation: string;
  department: string; // fallback department name
  department_id?: string | null; // UUID references departments
  department_name?: string | null; // text cached
  base_salary: number; // base_salary compat parameter
  salary?: number; // salary parameter
  phone?: string | null;
  joining_date?: string | null;
  shift_start_time?: string;
  shift_end_time?: string;
  status?: string; // 'active', 'disabled' (compatibility layer maps lowercase/uppercase)
  active: boolean; // Comp layer for legacy false/true active
  remarks?: string;
  is_deleted: boolean;
  deleted_at?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface DbAttendance {
  id: string; // composite employee_id + "_" + attendance_date
  employee_id: string;
  attendance_date?: string; // Format: YYYY-MM-DD
  date: string; // Comp layer to map attendance_date
  checkin_time?: string | null; // HH:MM
  check_in: string | null; // Comp layer to checkin_time
  checkout_time?: string | null; // HH:MM
  check_out: string | null; // Comp layer to checkout_time
  net_hours: number;
  late_minutes: number;
  overtime_hours: number;
  short_hours?: number;
  attendance_status?: string; // Present, Absent, Half-Day, Leave, Off, Missing Checkout
  status: string; // Comp layer to attendance_status
  manual_status: string; // Auto, Present, Absent, Leave, Off
  remarks: string | null;
  performance_score?: number;
  is_deleted: boolean;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null;
  edit_history?: string | null; // Keep for fallback compatibility
}

export interface DbAttendanceEditHistory {
  id: string;
  attendance_id: string;
  employee_id: string;
  old_data: any;
  new_data: any;
  edited_by: string;
  edit_reason: string;
  created_at?: string;
}

export interface DbDeletedRecord {
  id: string;
  table_name: string;
  record_id: string;
  record_data: any;
  deleted_by: string;
  deleted_at: string;
  restore_until: string;
  delete_reason: string;
  restored_at?: string | null;
  permanently_deleted_at?: string | null;
  
  // Compatibility layer aliases for RecycleBin.tsx UI representation
  entity_type?: string;
  entity_id?: string;
  original_data?: any;
}

export interface DbImportLog {
  id: string; // UUID or custom sequential id
  file_name: string;
  import_type: string;
  total_rows: number;
  success_rows: number;
  failed_rows: number;
  duplicate_rows: number;
  imported_by: string;
  created_at?: string;
}

export interface DbMonthlyReport {
  id: string; // employee_id_YYYY-MM
  employee_id?: string;
  month: string; // MM (01-12)
  year: string; // YYYY
  present_days?: number;
  absent_days?: number;
  leave_days?: number;
  off_days?: number;
  late_count?: number;
  missing_checkout_count?: number;
  total_hours?: number;
  overtime_hours?: number;
  short_hours?: number;
  performance_score?: number;
  remarks?: string;
  archived: boolean; // Map archived flag
  locked: boolean; // Map locked flag
  created_at?: string;
  updated_at?: string;
}
