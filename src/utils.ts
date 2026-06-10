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
 * Checks if a date string falls on a Sunday.
 * @param dateStr Format: YYYY-MM-DD
 */
export function isSunday(dateStr: string): boolean {
  if (!dateStr) return false;
  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const y = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  const d = parseInt(match[3], 10);
  const dt = new Date(y, m - 1, d);
  return dt.getDay() === 0; // 0 = Sunday
}

/**
 * Excel-like attendance calculations.
 * Returns: { netHours, lateMinutes, status, shortHours, overtimeHours }
 */
export function calculateAttendanceRecord(
  checkIn: string | null,
  checkOut: string | null,
  dateStr: string,
  manualStatus: string = 'Auto'
): { netHours: number; lateMinutes: number; status: string; shortHours: number; overtimeHours: number } {
  const isFri = isFriday(dateStr);
  const isSun = isSunday(dateStr);
  
  // Rules definitions
  const requiredHours = isSun ? 0 : (isFri ? 7.0 : 10.0);
  const toleranceLimit = isSun ? 0 : (isFri ? 6.50 : 9.50);
  
  let graceMins = 0;
  if (!isSun) {
    graceMins = isFri ? (15 * 60 + 15) : (13 * 60 + 45); // Grace period: 15 min
  }

  let netHours = 0;
  let lateMinutes = 0;

  // Calculate late minutes if check-in exists (Sundays are exempted)
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

  // Calculate Overtime (Sunday is NOT overtime)
  let overtimeHours = 0;
  if (netHours > 0 && !isSun) {
    const overtimeThreshold = isFri ? 10.0 : requiredHours;
    overtimeHours = Math.max(0, netHours - overtimeThreshold);
  }
  overtimeHours = parseFloat(overtimeHours.toFixed(2));

  // Calculate Short Hours (Sunday is exempted)
  let shortHours = 0;
  if (netHours > 0 && !isSun) {
    if (netHours < toleranceLimit) {
      shortHours = Math.max(0, requiredHours - netHours);
    }
  }
  shortHours = parseFloat(shortHours.toFixed(2));

  // Determine attendance status
  let status = 'Absent';
  const isWaiver = [
    'Approved Late',
    'Approved Short Hours',
    'Approved Late + Short Hours',
    'Official Early Release',
    'Medical Emergency',
    'System / Machine Error',
    'Official Duty'
  ].includes(manualStatus);

  if (manualStatus && manualStatus !== 'Auto' && !isWaiver) {
    if (manualStatus === 'Approved Leave' || manualStatus === 'Paid Leave' || manualStatus === 'Unpaid Leave') {
      status = 'Leave';
    } else {
      status = manualStatus;
    }
  } else {
    if (!checkIn) {
      status = isSun ? 'Off' : 'Absent';
    } else if (!checkOut) {
      status = 'Missing Checkout';
    } else {
      if (isSun) {
        status = 'Sunday Worked'; // Any check-in on Sunday counts as Sunday Worked
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
 * Rules in KaprayOfficial HRMS update:
 * Deductions:
 * - Absent Day = -15 (unapproved)
 * - Missing Checkout = -5 (unapproved)
 * - Late Day = -2 (unapproved)
 * - Short Hours Day = -1 (unapproved)
 * Bonuses:
 * - Sunday Worked Day = +2 (max +8 per month)
 * - Perfect Month Bonus = +5 (no unapproved absences, lates, short hours, or missing checkouts, min 5 working logs)
 * - Excellent Attendance Bonus = +2 (no unapproved absences, missing checkouts, max 2 unapproved lates, min 5 logs)
 * Score bounds:
 * - Min: 0, Max: 100
 */
export function calculatePerformanceScore(records: {
  status: string;
  late_minutes: number;
  net_hours: number;
  overtime_hours: number;
  short_hours?: number;
  manual_status?: string | null;
  date?: string;
}[]): {
  score: number;
  remarks: string;
  breakdown: {
    baseScore: number;
    lateCount: number;
    latePenalty: number;
    shortCount: number;
    shortHoursPenalty: number;
    absentCount: number;
    absentPenalty: number;
    missingCheckoutCount: number;
    missingCheckoutPenalty: number;
    sundayWorkedCount: number;
    sundayWorkedBonus: number;
    perfectBonus: number;
    excellentBonus: number;
    finalScore: number;
    grade: string;
    description: string;
    // Compatibility properties
    absent_days: number;
    late_days: number;
    short_days: number;
    missing_checkout: number;
    sunday_bonus: number;
    perfect_attendance: boolean;
    excellent_attendance: boolean;
  };
} {
  let score = 100;
  
  let absentCount = 0;
  let missingCheckoutCount = 0;
  let lateCount = 0;
  let shortCount = 0;
  let sundayWorkedCount = 0;

  records.forEach(r => {
    const stat = (r.status || '').trim();
    const isSun = r.date ? isSunday(r.date) : (stat === 'Sunday Worked' || stat === 'Sunday Present');
    const manual = r.manual_status || 'Auto';

    if (isSun) {
      if (stat === 'Sunday Worked' || stat === 'Sunday Present' || (stat && stat !== 'Off' && stat !== 'Absent' && stat !== 'Leave')) {
        sundayWorkedCount++;
      }
      return; // Skip standard daily work penalties on Sundays
    }

    const isAbs = stat === 'Absent';
    const isMc = stat === 'Missing Checkout';

    // Phase 3 - Approved exceptions that result in Penalty = 0
    const isApprovedLeave = [
      'Approved Leave',
      'Medical Leave',
      'Paid Leave',
      'Unpaid Leave',
      'Official Duty',
      'Management Approved Exception'
    ].includes(manual);
    
    if (isAbs) {
      if (!isApprovedLeave) {
        absentCount++;
      }
    } else if (isMc) {
      const isWaivedMc = [
        'System / Machine Error',
        'Official Duty',
        'Management Approved Exception'
      ].includes(manual);
      if (!isWaivedMc) {
        missingCheckoutCount++;
      }
    }

    // Late counting (only if not off/absent/leave)
    const isLate = r.late_minutes > 0 && stat !== 'Absent' && stat !== 'Leave' && stat !== 'Off';
    if (isLate) {
      const isWaivedLate = [
        'Approved Late',
        'Approved Late + Short Hours',
        'Medical Emergency',
        'System / Machine Error',
        'Official Duty',
        'Management Approved Exception',
        'Medical Leave'
      ].includes(manual);
      
      if (!isWaivedLate) {
        lateCount++;
      }
    }

    // Short working hours counting (only if not off/absent/leave)
    const shortVal = r.short_hours !== undefined ? r.short_hours : 0;
    const isShort = shortVal > 0 && stat !== 'Absent' && stat !== 'Leave' && stat !== 'Off';
    if (isShort) {
      const isWaivedShort = [
        'Approved Short Hours',
        'Approved Late + Short Hours',
        'Official Early Release',
        'Medical Emergency',
        'System / Machine Error',
        'Official Duty',
        'Management Approved Exception',
        'Medical Leave'
      ].includes(manual);

      if (!isWaivedShort) {
        shortCount++;
      }
    }
  });

  // Score Deductions (Phase 2 - unapproved absent penalty calibrated to -15)
  const absentPenalty = absentCount * -15;
  const missingCheckoutPenalty = missingCheckoutCount * -5;
  const latePenalty = lateCount * -2;
  const shortHoursPenalty = shortCount * -1;
  
  score += (absentPenalty + missingCheckoutPenalty + latePenalty + shortHoursPenalty);

  // Sunday Worked Bonus (+2 pts, cap at 8 pts max)
  const sundayWorkedBonus = Math.min(8, sundayWorkedCount * 2);
  score += sundayWorkedBonus;

  // Perfect/Excellent Attendance logic
  let perfectBonus = 0;
  let excellentBonus = 0;
  
  // Need at least some attendance recordings to earn alignment bonuses
  const totalLogsCount = records.filter(r => r.status && r.status !== 'Off').length;
  if (totalLogsCount >= 5) {
    if (absentCount === 0 && lateCount === 0 && missingCheckoutCount === 0 && shortCount === 0) {
      perfectBonus = 5;
      score += 5;
    } else if (absentCount === 0 && lateCount <= 2 && missingCheckoutCount === 0 && shortCount === 0) {
      excellentBonus = 2;
      score += 2;
    }
  }

  // Phase 2 - Score bounds strictly enforced
  score = Math.max(0, Math.min(100, score));

  // Phase 5 - Performance Grading Scale
  let grade = 'F';
  let remarks = '';
  if (score >= 95) {
    grade = 'A+';
    remarks = 'Excellent. Exceptional punctuality, diligence, and highly reliable.';
  } else if (score >= 90) {
    grade = 'A';
    remarks = 'Superb performance. Highly consistent and dedicated candidate.';
  } else if (score >= 80) {
    grade = 'B';
    remarks = 'Good performance. Highly consistent attendance with minor areas to monitor.';
  } else if (score >= 70) {
    grade = 'C';
    remarks = 'Average. Needs to reduce late arrivals and monitor active hours output.';
  } else if (score >= 55) {
    grade = 'D';
    remarks = 'Needs Improvement. Below average performance. Immediate supervisor counseling required.';
  } else {
    grade = 'F';
    remarks = 'Unsatisfactory. Immediate performance coaching and warning recommended.';
  }

  // Construct change description details
  const details: string[] = [];
  if (absentCount > 0) details.push(`${absentCount} absent day${absentCount > 1 ? 's' : ''}`);
  if (lateCount > 0) details.push(`${lateCount} late day${lateCount > 1 ? 's' : ''}`);
  if (shortCount > 0) details.push(`${shortCount} short hour day${shortCount > 1 ? 's' : ''}`);
  if (missingCheckoutCount > 0) details.push(`${missingCheckoutCount} missing checkout${missingCheckoutCount > 1 ? 's' : ''}`);
  if (sundayWorkedCount > 0) details.push(`${sundayWorkedCount} Sunday${sundayWorkedCount > 1 ? 's' : ''} worked`);

  let description = details.length > 0 ? details.join(', ') : 'Pristine perfect month attendance record!';

  return {
    score,
    remarks,
    breakdown: {
      baseScore: 100,
      lateCount,
      latePenalty,
      shortCount,
      shortHoursPenalty,
      absentCount,
      absentPenalty,
      missingCheckoutCount,
      missingCheckoutPenalty,
      sundayWorkedCount,
      sundayWorkedBonus,
      perfectBonus,
      excellentBonus,
      finalScore: score,
      grade,
      description,
      // Compatibility keys
      absent_days: absentCount,
      late_days: lateCount,
      short_days: shortCount,
      missing_checkout: missingCheckoutCount,
      sunday_bonus: sundayWorkedBonus,
      perfect_attendance: perfectBonus > 0,
      excellent_attendance: excellentBonus > 0
    }
  };
}

/**
 * Phase 7 - Manager Action Recommendations
 */
export function getManagerActionRecommendation(score: number): {
  recommendation: string;
  color: string;
  badgeColor: string;
  description: string;
} {
  if (score >= 95) {
    return {
      recommendation: 'Appreciation Letter',
      color: 'bg-emerald-50 text-emerald-800 border-emerald-200',
      badgeColor: 'bg-emerald-500 text-white',
      description: 'Excellent score of 95+. Automatically recommended for an official Appreciation Letter.'
    };
  } else if (score >= 90) {
    return {
      recommendation: 'Performance Bonus Candidate',
      color: 'bg-teal-50 text-teal-800 border-teal-200',
      badgeColor: 'bg-teal-500 text-white',
      description: 'Superb score of 90+. Recommended as a corporate Performance Bonus Candidate.'
    };
  } else if (score >= 70) {
    return {
      recommendation: 'Normal Monitoring',
      color: 'bg-slate-50 text-slate-700 border-slate-200',
      badgeColor: 'bg-slate-400 text-white',
      description: 'Standard safe bracket of 70-89. Placed under standard Normal Monitoring roster.'
    };
  } else if (score >= 55) {
    return {
      recommendation: 'Performance Discussion Required',
      color: 'bg-amber-50 text-amber-800 border-amber-200',
      badgeColor: 'bg-amber-500 text-slate-900',
      description: 'Score in warning bracket of 55-69. Formal physical Performance Discussion Required.'
    };
  } else {
    return {
      recommendation: 'Warning Recommended',
      color: 'bg-rose-50 text-rose-800 border-rose-200',
      badgeColor: 'bg-rose-600 text-white',
      description: 'Severe performance shortfall below 55. Formal disciplinary Warning Recommended.'
    };
  }
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
): { eligible: boolean; status: string; overtimeHours: number; workedHours: number } {
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
  let workedHours = 0;
  let overtimeHours = 0; // Sundays never count as overtime
  
  if (worked) {
    workedHours = netHours;
    finalStatus = 'Sunday Worked';
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
    overtimeHours,
    workedHours
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

interface RecommendationInput {
  score: number;
  attendancePercentage: number;
  absentsCount: number;
  lateCount?: number;
}

export function getSmartBonusRecommendation(input: RecommendationInput): {
  recommendation: 'Hazri Bonus Eligible' | 'Performance Bonus Eligible' | 'Performance Review Required' | 'Warning Recommended' | 'Standard Performance' | 'Punctuality Bonus Eligible' | string;
  color: string;
  badgeColor: string;
  description: string;
  recommendedBonuses: string[];
} {
  const { score, attendancePercentage, absentsCount, lateCount } = input;
  const recommendedBonuses: string[] = [];

  if (score >= 95 && attendancePercentage >= 95) {
    recommendedBonuses.push('Hazri Bonus');
  }
  if (score >= 90 && absentsCount === 0) {
    recommendedBonuses.push('Performance Bonus');
  }
  if (lateCount !== undefined && lateCount === 0) {
    recommendedBonuses.push('Punctuality Bonus');
  }

  let recType = 'Standard Performance';
  let color = 'bg-slate-50 text-slate-700 border-slate-200';
  let badgeColor = 'bg-slate-400 text-white';
  let description = 'Roster score meets standard operational benchmarks safely.';

  if (score >= 95 && attendancePercentage >= 95) {
    recType = 'Hazri Bonus Eligible';
    color = 'bg-emerald-50 text-emerald-800 border-emerald-200';
    badgeColor = 'bg-emerald-500 text-white';
    description = 'Outstanding attendance (>=95%) & score (>=95). Qualified for company attendance hazri bonus incentives.';
  } else if (score >= 90 && absentsCount === 0) {
    recType = 'Performance Bonus Eligible';
    color = 'bg-teal-50 text-teal-800 border-teal-200';
    badgeColor = 'bg-teal-500 text-white';
    description = 'Zero absents logged & outstanding compliance score (>=90). Recommended for high performance bonuses.';
  } else if (lateCount !== undefined && lateCount === 0) {
    recType = 'Punctuality Bonus Eligible';
    color = 'bg-indigo-50 text-indigo-800 border-indigo-200';
    badgeColor = 'bg-indigo-500 text-white';
    description = 'Zero tardiness recorded throughout the billing month. Recommended for punctuality bonus.';
  } else if (score < 55) {
    recType = 'Warning Recommended';
    color = 'bg-rose-50 text-rose-800 border-rose-200';
    badgeColor = 'bg-rose-600 text-white';
    description = 'Severe performance rating shortfall (<55). Admin warning letter issue and counseling review proposed.';
  } else if (score < 70) {
    recType = 'Performance Review Required';
    color = 'bg-amber-50 text-amber-800 border-amber-200';
    badgeColor = 'bg-amber-500 text-slate-900';
    description = 'Compliance score below safety threshold (<70). Formal performance review & corrective feedback cycle required.';
  }

  return {
    recommendation: recType,
    color,
    badgeColor,
    description: description + (recommendedBonuses.length > 0 ? ` Recommended: ${recommendedBonuses.join(', ')}.` : ''),
    recommendedBonuses
  };
}


