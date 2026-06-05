import { Employee, Attendance, CorrectionRequest, LockedMonth, SystemNotification } from './types';

export const INITIAL_EMPLOYEES: Employee[] = [
  {
    id: 'EMP-01',
    name: 'Ahzam',
    email: 'ahzam@office.pk',
    role: 'admin',
    designation: 'Owner & Administrator',
    department: 'Admin',
    joiningDate: '2026-06-01',
    baseSalary: 150000,
    active: true
  }
];

export const INITIAL_ATTENDANCE: Attendance[] = [];

export const INITIAL_CORRECTIONS: CorrectionRequest[] = [];

export const INITIAL_LOCKED_MONTHS: LockedMonth[] = [
  {
    month: '2026-05',
    locked: false
  },
  {
    month: '2026-06',
    locked: false
  }
];

export const INITIAL_NOTIFICATIONS: SystemNotification[] = [];
