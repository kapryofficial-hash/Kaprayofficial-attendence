export interface Employee {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'employee';
  designation: string;
  department: string;
  joiningDate: string;
  baseSalary: number;
  active: boolean;
}

export interface Attendance {
  id: string;
  employeeId: string;
  date: string; // YYYY-MM-DD
  checkIn: string | null; // HH:MM
  checkOut: string | null; // HH:MM
  netHours: number; // calculated hours
  lateMinutes: number; // checkIn minutes past 09:00
  overtimeHours: number; // hours past 8 hours
  status: 'Present' | 'Absent' | 'Half-Day';
  isHoliday?: boolean;
  reason?: string; // custom reason entered manually by Admin/Owner
}

export interface CorrectionRequest {
  id: string;
  employeeId: string;
  employeeName: string;
  date: string; // YYYY-MM-DD
  requestedCheckIn: string | null;
  requestedCheckOut: string | null;
  reason: string;
  status: 'Pending' | 'Approved' | 'Rejected';
  submittedAt: string;
  adminComment: string | null;
}

export interface SalaryRecord {
  id: string;
  employeeId: string;
  month: string; // YYYY-MM
  baseSalary: number;
  calculatedPerDaySalary: number;
  presentDays: number;
  absentDays: number;
  halfDays: number;
  overtimeHours: number;
  overtimePay: number;
  advanceDeduction: number;
  absentDeduction: number;
  halfDayDeduction: number;
  commissionAmount: number; // custom monthly commissions
  isPardoned: boolean; // if Ahzam waived the calculations (adjusted to full salary)
  pardonedDeductionAmount: number; // the amount of deduction waived
  finalPayable: number;
  status: 'Draft' | 'Generated' | 'Paid';
}

export interface AdvanceRecord {
  id: string;
  employeeId: string;
  date: string; // YYYY-MM-DD
  amount: number;
  reason: string;
}

export interface CommissionRecord {
  id: string;
  employeeId: string;
  month: string; // YYYY-MM
  amount: number;
  reason: string;
}

export interface LockedMonth {
  month: string; // YYYY-MM
  locked: boolean;
  lockedAt?: string;
  lockedBy?: string;
}

export interface SystemNotification {
  id: string;
  type: 'late' | 'missing_checkout' | 'absent' | 'overtime';
  message: string;
  employeeName: string;
  date: string;
  seen: boolean;
}

export interface TrashRecord {
  id: string;
  deletedAt: string; // ISO String
  type: 'employee' | 'attendance' | 'advance' | 'commission' | 'reason' | 'employee_commission' | 'employee_allowance';
  originalData: any; // original object body
  label: string; // descriptive string, e.g., "Advance of Rs. 1,500 for EMP-04"
}

export interface EmployeeCommission {
  id: string;
  employee_id: string;
  month: string; // MM
  year: string;  // YYYY
  commission_amount: number;
  commission_reason: string;
  added_by: string;
  approved_by: string | null;
  approved_at: string | null;
}

export interface EmployeeAllowance {
  id: string;
  employee_id: string;
  month: string; // MM
  year: string;  // YYYY
  allowance_amount: number;
  allowance_type: 'Attendance Bonus' | 'Punctuality Bonus' | 'Performance Bonus' | 'Manual Bonus';
  reason: string;
  approved_by: string;
}

export type AllowedUserRole = 'super_admin' | 'admin' | 'manager' | 'staff_viewer';

export interface UserProfileRole {
  id: string;
  user_id: string; // UUID from auth.users
  email?: string;  // helper client field
  role: AllowedUserRole;
  employee_id: string | null; // connected employee ID for staff_viewer
  created_at?: string;
  updated_at?: string;
}

export interface UserProfile {
  user_id: string; // UUID from auth.users
  username: string; // unique
  display_name: string | null;
  role: AllowedUserRole;
  email: string;
  created_at?: string;
  updated_at?: string;
}

export interface AuditLog {
  id: string;
  user_id: string | null;
  user_email: string;
  role: string;
  action: string;
  table_name: string;
  record_id: string;
  old_data?: any;
  new_data?: any;
  created_at?: string;
}

export interface SalaryReview {
  id: string;
  employee_id: string;
  month: string;
  year: string;
  amount: number;
  reason: string;
  status: 'Draft' | 'Reviewed' | 'Approved' | 'Locked' | 'Paid';
  approved_by?: string | null;
  approved_at?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface OwnerAdjustment {
  id: string;
  employee_id: string;
  employee_name: string;
  month: string; // MM
  year: string;  // YYYY
  adjustment_type: 'Bonus' | 'Attendance Bonus' | 'Performance Bonus' | 'Festival Bonus' | 'Special Allowance' | 'Salary Correction' | 'Advance Recovery' | 'Fine' | 'Manual Deduction';
  amount: number;
  reason: string;
  created_by: string;
  approved_by: string | null;
  created_at: string;
  approved_at: string | null;
}

export interface EmployeeDocument {
  id: string;
  employee_id: string;
  document_type: 'CNIC Front' | 'CNIC Back' | 'CV' | 'Appointment Letter' | 'Salary Agreement' | 'Warning Letters' | 'Resignation Letter' | 'Misc Documents';
  file_name: string;
  file_type: string;
  file_size: number;
  file_data: string; // base64 payload
  uploaded_by: string;
  uploaded_at: string;
}

export interface EmployeeAdvance {
  id: string;
  employee_id: string;
  date: string; // YYYY-MM-DD
  amount: number;
  reason: string;
  approved_by: string;
  remaining_balance: number;
  created_at: string;
}

export interface AdvanceRecovery {
  id: string;
  advance_id: string;
  employee_id: string;
  date: string; // YYYY-MM-DD
  recovered_amount: number;
  recovery_month: string; // YYYY-MM
  recovery_type: 'Salary Deduction' | 'Manual Payment';
  recovered_by: string;
  created_at: string;
}

export interface EmployeeWarning {
  id: string;
  employee_id: string;
  date: string; // YYYY-MM-DD
  warning_type: 'Verbal Warning' | 'Written Warning' | 'Final Warning';
  reason: string;
  issued_by: string;
  attachment_name?: string | null;
  attachment_data?: string | null; // base64
  status: 'Active' | 'Resolved' | 'Expired';
  created_at: string;
}



