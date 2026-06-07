import { DbEmployee, DbAttendance } from './supabaseClient';

// Standard constant rules per user's prompt:
// Duty hours: 10 hours
// Normal late after 1:30 PM (13:30)
// Friday late after 3:00 PM (15:00)

/**
 * Checks if a date string falls on a Friday.
 * @param dateStr Format: YYYY-MM-DD
 */
export function isFriday(dateStr: string): boolean {
  if (!dateStr) return false;
  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const y = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  const d = parseInt(match[3], 10);
  const dt = new Date(y, m - 1, d);
  return dt.getDay() === 5; // 0=Sunday, 5=Friday
}

/**
 * Parses time format HH:MM into minutes total
 */
export function timeToMinutes(timeStr: string): number {
  if (!timeStr || !timeStr.includes(':')) return 0;
  const [h, m] = timeStr.split(':').map(Number);
  if (isNaN(h) || isNaN(m)) return 0;
  return h * 60 + m;
}

/**
 * Formats standard 24-hr layout string 'HH:MM' into 12-hour or keeps 24-hour style
 */
export function formatTime(timeStr: string | null, is12hSetting: boolean = true): string {
  if (!timeStr) return '-';
  if (!timeStr.includes(':')) return timeStr;
  
  if (!is12hSetting) return timeStr;
  
  try {
    const [hStr, mStr] = timeStr.split(':');
    const h = parseInt(hStr, 10);
    const m = parseInt(mStr, 10);
    if (isNaN(h) || isNaN(m)) return timeStr;
    
    const ampm = h >= 12 ? 'PM' : 'AM';
    const displayHour = h % 12 === 0 ? 12 : h % 12;
    const displayMin = m.toString().padStart(2, '0');
    return `${displayHour}:${displayMin} ${ampm}`;
  } catch (e) {
    return timeStr;
  }
}

/**
 * Converts formatted 12h time e.g. "01:30 PM" or "3:30 PM" or raw "13:30" to standard 24h "HH:MM"
 */
export function parseTimeTo24h(timeStr: string): string {
  if (!timeStr) return '';
  const cleaned = timeStr.trim().toUpperCase();
  
  // Handlers for AM/PM layout
  const ampmMatch = cleaned.match(/(AM|PM)$/);
  if (!ampmMatch) {
    // Already in 24h or partial. Ensure HH:MM
    if (cleaned.includes(':')) {
      const parts = cleaned.split(':');
      const h = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10);
      return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
    }
    return cleaned;
  }
  
  const ampm = ampmMatch[0];
  const timePart = cleaned.replace(ampm, '').trim();
  const parts = timePart.split(':');
  if (parts.length < 2) return cleaned;
  
  let h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  
  if (ampm === 'PM' && h < 12) h += 12;
  if (ampm === 'AM' && h === 12) h = 0;
  
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

/**
 * PKR formatting helper
 */
export function formatPKR(amount: number): string {
  return `Rs. ${Math.round(amount).toLocaleString('en-PK')}`;
}

/**
 * Core Excel-like attendance calculations.
 * Returns: { netHours, lateMinutes, status }
 */
export function calculateAttendanceRecord(
  checkIn: string | null,
  checkOut: string | null,
  dateStr: string,
  manualStatus: string = 'Auto'
): { netHours: number; lateMinutes: number; status: string; shortHours: number; overtimeHours: number } {
  const isFri = isFriday(dateStr);
  const isSun = !dateStr ? false : (new Date(dateStr).getDay() === 0);
  
  // Rules definitions
  const requiredHours = isSun ? 0 : (isFri ? 7.0 : 10.0);
  const toleranceLimit = isSun ? 0 : (isFri ? 6.50 : 9.50);
  
  let graceMins = 0;
  if (!isSun) {
    // Normal: check-in 1:30 PM (13:30, 810 mins). Grace period: 15 min. Grace limit: 1:45 PM (13:45, 825 mins)
    // Friday: check-in 3:00 PM (15:00, 900 mins). Grace period: 15 min. Grace limit: 3:15 PM (15:15, 915 mins)
    graceMins = isFri ? (15 * 60 + 15) : (13 * 60 + 45);
  }

  let netHours = 0;
  let lateMinutes = 0;

  // Calculate late minutes if check-in exists
  if (checkIn && !isSun) {
    const inMins = timeToMinutes(checkIn);
    if (inMins > graceMins) {
      lateMinutes = inMins - graceMins;
    }
  }

  // Calculate net hours if check-in and check-out exist
  if (checkIn && checkOut) {
    const inMins = timeToMinutes(checkIn);
    let outMins = timeToMinutes(checkOut);
    if (outMins < inMins) {
      outMins += 24 * 60; // crossover to next day
    }
    netHours = parseFloat(((outMins - inMins) / 60).toFixed(2));
  }

  // Calculate Overtime
  let overtimeHours = 0;
  if (netHours > 0) {
    if (isSun) {
      overtimeHours = netHours; // All worked hours on Sunday are overtime
    } else {
      const overtimeThreshold = isFri ? 10.0 : requiredHours;
      overtimeHours = Math.max(0, netHours - overtimeThreshold);
    }
  }
  overtimeHours = parseFloat(overtimeHours.toFixed(2));

  // Calculate Short Hours
  let shortHours = 0;
  if (netHours > 0 && !isSun) {
    if (netHours < toleranceLimit) {
      shortHours = Math.max(0, requiredHours - netHours);
    }
  }
  shortHours = parseFloat(shortHours.toFixed(2));

  // Determine attendance status
  let status = 'Absent';
  if (manualStatus && manualStatus !== 'Auto') {
    status = manualStatus;
  } else {
    if (!checkIn) {
      status = isSun ? 'Off' : 'Absent';
    } else if (!checkOut) {
      status = 'Missing Checkout';
    } else {
      if (isSun) {
        status = 'Present'; // Any check-in on Sunday with checkout counts as present
      } else {
        const halfLimit = isFri ? 3.5 : 5.0;
        if (netHours >= toleranceLimit) {
          status = 'Present';
        } else if (netHours >= halfLimit) {
          status = 'Half-Day';
        } else {
          status = 'Absent';
        }
      }
    }
  }

  return {
    netHours,
    lateMinutes,
    status,
    shortHours,
    overtimeHours
  };
}

/**
 * Calculates net salary based on simple Excel rules:
 * Net = (BaseSalary / 30) * (Presents_FullDays + (Half-Days * 0.5)) - manual advance/leaves/absents if needed.
 * This function calculates exact payable salary from a monthly attendance summary.
 */
export function calculateExcelSalary(
  baseSalary: number,
  fullDays: number,
  halfDays: number,
  totalDaysInMonth: number = 30
): number {
  const perDayPay = baseSalary / totalDaysInMonth;
  const pay = perDayPay * (fullDays + (halfDays * 0.5));
  return Math.round(pay);
}

/**
 * Calculates a professional Auto Performance Score out of 100
 * Rules:
 * - Deduction: Late (-2 points per incidence)
 * - Deduction: Absent (-10 points per incidence)
 * - Deduction: Missing Checkout (-5 points per incidence)
 * - Deduction: Short working hours < 10 hrs (-3 points per incidence)
 * - Extra Overtime points (+1 point per overtime shift)
 * - Bonus: Perfect attendance (+5 points)
 */
export function calculatePerformanceScore(records: {
  status: string;
  late_minutes: number;
  net_hours: number;
  overtime_hours: number;
}[]): { score: number; remarks: string } {
  if (records.length === 0) return { score: 100, remarks: 'New profile: No records logged in this period.' };

  let score = 100;
  let loggedWorkingDays = 0;
  
  let absentCount = 0;
  let lateCount = 0;
  let missingCheckoutCount = 0;

  records.forEach(r => {
    const isAbs = r.status === 'Absent';
    const isMc = r.status === 'Missing Checkout';
    const isLeave = r.status === 'Leave';
    const isOff = r.status === 'Off';

    if (r.status === 'Present' || r.status === 'Half-Day' || isLeave || isOff) {
      loggedWorkingDays++;
    }

    if (isAbs) {
      score -= 5;
      absentCount++;
    } else if (isMc) {
      score -= 2;
      missingCheckoutCount++;
    }

    if (r.late_minutes > 0 && !isAbs && !isLeave && !isOff) {
      score -= 1;
      lateCount++;
    }
  });

  // Apply bonuses
  if (loggedWorkingDays >= 10) {
    if (absentCount === 0 && lateCount === 0 && missingCheckoutCount === 0) {
      score += 5; // Perfect Attendance
    } else if (absentCount === 0 && lateCount <= 2 && missingCheckoutCount === 0) {
      score += 2; // Excellent Attendance
    }
  }

  // Restrict bounds strictly to [0, 100]
  score = Math.max(0, Math.min(100, score));

  // Determine Auto Remarks
  let remarks = '';
  if (score >= 95) {
    remarks = 'Excellent performance. Exceptional punctuality, diligence, and highly reliable stars.';
  } else if (score >= 85) {
    remarks = 'Good performance. Highly consistent duty attendance with minor remarks.';
  } else if (score >= 70) {
    remarks = 'Average performance. Needs to reduce late arrivals and monitor active hours.';
  } else if (score >= 55) {
    remarks = 'Below average. Needs strict supervision. High frequency of missing checkouts and short hours.';
  } else {
    remarks = 'Unsatisfactory. Immediate performance coaching required. Contact supervisor.';
  }

  return { score, remarks };
}

/**
 * CSV file download trigger
 */
export function downloadCSV(filename: string, headers: string[], rows: any[][]) {
  const csvContent = [
    headers.join(','),
    ...rows.map(row => 
      row.map(val => {
        const str = String(val === null || val === undefined ? '' : val);
        return `"${str.replace(/"/g, '""')}"`;
      }).join(',')
    )
  ].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Professional Excel opening trigger with UTF-8 BOM
 */
export function downloadExcel(filename: string, headers: string[], rows: any[][]) {
  const BOM = '\uFEFF';
  const csvContent = BOM + [
    headers.join(','),
    ...rows.map(row => 
      row.map(val => {
        const str = String(val === null || val === undefined ? '' : val);
        return `"${str.replace(/"/g, '""')}"`;
      }).join(',')
    )
  ].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Calculates Sunday Eligibility for a list of attendance records in a week.
 * Week is defined as Monday to Saturday.
 * Returns true if worked days + count of approved leaves >= 5.
 */
export function getMonToSatDatesForDate(dateStr: string): string[] {
  if (!dateStr) return [];
  const dt = new Date(dateStr);
  const day = dt.getDay(); // 0 (Sunday) to 6 (Saturday)
  // Get offset to Monday of the same week
  const toMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(dt);
  monday.setDate(dt.getDate() + toMonday);
  
  const dates: string[] = [];
  for (let i = 0; i < 6; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const yStr = d.getFullYear();
    const mStr = String(d.getMonth() + 1).padStart(2, '0');
    const dStr = String(d.getDate()).padStart(2, '0');
    dates.push(`${yStr}-${mStr}-${dStr}`);
  }
  return dates;
}

export function getSundayPaidOffStatus(
  sundayDateStr: string,
  allAttendanceRecords: { date: string; status: string; check_in?: string | null; check_out?: string | null; net_hours?: number; overtime_hours?: number }[]
): { eligible: boolean; status: string; overtimeHours: number } {
  const monToSatDates = getMonToSatDatesForDate(sundayDateStr);
  
  const weekRecords = allAttendanceRecords.filter(r => monToSatDates.includes(r.date || ''));
  
  let eligibleCount = 0;
  monToSatDates.forEach(date => {
    const rec = weekRecords.find(r => r.date === date);
    if (rec) {
      const stat = (rec.status || 'Absent').trim();
      const statLower = stat.toLowerCase();
      
      const isEligible = 
        statLower === 'present' || 
        statLower === 'half-day' || 
        statLower === 'leave' || 
        statLower === 'approved leave' || 
        statLower === 'paid leave' || 
        statLower === 'sick leave' || 
        statLower === 'emergency leave' || 
        statLower === 'official approved off' ||
        statLower === 'approved off';
        
      if (isEligible) {
        eligibleCount++;
      }
    }
  });

  const isEligible = eligibleCount >= 5;
  
  const sundayRec = allAttendanceRecords.find(r => r.date === sundayDateStr);
  const worked = !!(sundayRec && (sundayRec.check_in || sundayRec.check_out));
  const netHours = sundayRec && sundayRec.net_hours ? sundayRec.net_hours : 0;
  
  let finalStatus = '';
  let overtimeHours = 0;
  
  if (worked) {
    overtimeHours = netHours; // all Sunday hours worked count as overtime
    if (isEligible) {
      finalStatus = 'Sunday Overtime';
    } else {
      finalStatus = 'Sunday Worked';
    }
  } else {
    if (isEligible) {
      finalStatus = 'Paid Weekly Off';
    } else {
      finalStatus = 'Unpaid Weekly Off';
    }
  }
  
  return {
    eligible: isEligible,
    status: finalStatus,
    overtimeHours
  };
}

export function calculateSundayEligibility(weekRecords: { status: string; date: string }[]): boolean {
  let eligibleCount = 0;
  weekRecords.forEach(rec => {
    if (!rec.date) return;
    const dt = new Date(rec.date);
    const day = dt.getDay();
    if (day === 0) return; // ignore Sunday

    const stat = (rec.status || 'Absent').toLowerCase();
    
    // Eligible days include: Present, Half-Day, Approved Leave, Paid Leave, Official Approved Off
    // NOT eligible: Unauthorized Absent, Missing Checkout, Unapproved Leave
    const isEligible = 
      stat === 'present' || 
      stat === 'half-day' || 
      stat === 'leave' || 
      stat === 'approved leave' || 
      stat === 'paid leave' || 
      stat === 'sick leave' || 
      stat === 'emergency leave' || 
      stat === 'official approved off' ||
      stat === 'approved off';
      
    if (isEligible) {
      eligibleCount++;
    }
  });

  return eligibleCount >= 5;
}

/**
 * Calculates sum of daily required hours for Mon-Sat days in a given year and month (1-indexed month)
 * Normal Mon-Thu,Sat days = 10, Friday = 7, excluding Sunday.
 */
export function getMonthlyRequiredHours(year: number, month: number): number {
  let totalHours = 0;
  // Get number of days in the month
  const daysInMonth = new Date(year, month, 0).getDate();
  for (let d = 1; d <= daysInMonth; d++) {
    const dt = new Date(year, month - 1, d);
    const day = dt.getDay();
    if (day === 0) {
      continue; // Sunday off
    } else if (day === 5) {
      totalHours += 7; // Friday half-day (7 required hours)
    } else {
      totalHours += 10; // Normal working day (10 required hours)
    }
  }
  return totalHours;
}

/**
 * Returns list of Sunday dates as strings ('YYYY-MM-DD') for a given year and month (1-indexed month).
 */
export function getSundaysInMonth(year: number, month: number): string[] {
  const sundays: string[] = [];
  const daysInMonth = new Date(year, month, 0).getDate();
  for (let d = 1; d <= daysInMonth; d++) {
    const dt = new Date(year, month - 1, d);
    if (dt.getDay() === 0) {
      const yStr = dt.getFullYear();
      const mStr = String(dt.getMonth() + 1).padStart(2, '0');
      const dStr = String(dt.getDate()).padStart(2, '0');
      sundays.push(`${yStr}-${mStr}-${dStr}`);
    }
  }
  return sundays;
}


