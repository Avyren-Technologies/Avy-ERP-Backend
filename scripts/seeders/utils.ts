export let counter = 0;

export function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function pickRandomN<T>(arr: T[], n: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(n, arr.length));
}

export function randomInt(min: number, max: number): number {
  return Math.floor(min + Math.random() * (max - min + 1));
}

export function randomDigits(len: number): string {
  let s = '';
  for (let i = 0; i < len; i++) s += Math.floor(Math.random() * 10);
  return s;
}

export function randomLetter(): string {
  return 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[Math.floor(Math.random() * 26)];
}

export function randomPhone(): string {
  return `98${randomDigits(8)}`;
}

export function randomDate(startYear: number, endYear: number): string {
  const y = randomInt(startYear, endYear);
  const m = String(randomInt(1, 12)).padStart(2, '0');
  const d = String(randomInt(1, 28)).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function randomPastDate(monthsBack: number): string {
  const now = new Date();
  const past = new Date(now.getFullYear(), now.getMonth() - monthsBack, randomInt(1, 28));
  return past.toISOString().split('T')[0];
}

export function todayISO(): string {
  return new Date().toISOString().split('T')[0];
}

export function randomDecimal(min: number, max: number, decimals = 2): number {
  return parseFloat((min + Math.random() * (max - min)).toFixed(decimals));
}

// -- Indian Document Fakers --
export function fakePAN(): string {
  return `${randomLetter()}${randomLetter()}${randomLetter()}P${randomLetter()}${randomDigits(4)}${randomLetter()}`;
}
export function fakeAadhaar(): string {
  return `${randomDigits(4)}${randomDigits(4)}${randomDigits(4)}`;
}
export function fakeUAN(): string {
  return `1001${randomDigits(8)}`;
}
export function fakeBankAccount(): string {
  return randomDigits(randomInt(11, 16));
}
export function fakeIFSC(): string {
  return `${randomLetter()}${randomLetter()}${randomLetter()}${randomLetter()}0${randomDigits(6)}`;
}

// -- Name Pools --
const FIRST_NAMES_MALE = [
  'Aarav', 'Vivaan', 'Aditya', 'Vihaan', 'Arjun', 'Sai', 'Reyansh', 'Ayaan',
  'Krishna', 'Ishaan', 'Shaurya', 'Atharva', 'Advait', 'Dhruv', 'Kabir',
  'Ritvik', 'Aaryan', 'Rohan', 'Karthik', 'Pranav', 'Nikhil', 'Rahul',
  'Suresh', 'Manoj', 'Vijay', 'Rajesh', 'Amit', 'Deepak', 'Sanjay', 'Ravi',
];

const FIRST_NAMES_FEMALE = [
  'Aanya', 'Diya', 'Saanvi', 'Ananya', 'Aadhya', 'Isha', 'Kavya', 'Myra',
  'Prisha', 'Sara', 'Anika', 'Navya', 'Riya', 'Nisha', 'Pooja', 'Sneha',
  'Meera', 'Divya', 'Neha', 'Shruti', 'Pallavi', 'Anjali', 'Swati', 'Rashmi',
];

const LAST_NAMES = [
  'Sharma', 'Patel', 'Singh', 'Kumar', 'Gupta', 'Reddy', 'Nair', 'Joshi',
  'Mehta', 'Verma', 'Iyer', 'Rao', 'Das', 'Pillai', 'Menon', 'Mishra',
  'Choudhary', 'Yadav', 'Bhat', 'Kulkarni', 'Desai', 'Naik', 'Hegde', 'Shetty',
  'Patil', 'Kamath', 'Mukherjee', 'Banerjee', 'Chakraborty', 'Ghosh',
];

export function generateName(gender: 'MALE' | 'FEMALE'): { firstName: string; lastName: string } {
  const pool = gender === 'MALE' ? FIRST_NAMES_MALE : FIRST_NAMES_FEMALE;
  return { firstName: pickRandom(pool), lastName: pickRandom(LAST_NAMES) };
}

export function generateEmail(firstName: string, lastName: string, domain: string): string {
  const suffix = randomDigits(2);
  return `${firstName.toLowerCase()}.${lastName.toLowerCase()}${suffix}@${domain}`;
}

// -- Date Utilities --
export function getMonthDates(year: number, month: number): string[] {
  const dates: string[] = [];
  const daysInMonth = new Date(year, month, 0).getDate();
  for (let d = 1; d <= daysInMonth; d++) {
    dates.push(`${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
  }
  return dates;
}

export function isWeekend(dateStr: string, weeklyOffs: string[]): boolean {
  const date = new Date(dateStr + 'T00:00:00');
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return weeklyOffs.includes(dayNames[date.getDay()]);
}

export function isHoliday(dateStr: string, holidays: { date: string }[]): boolean {
  return holidays.some(h => h.date === dateStr);
}

export function getWorkingDays(year: number, month: number, weeklyOffs: string[], holidays: { date: string }[]): string[] {
  return getMonthDates(year, month).filter(d => !isWeekend(d, weeklyOffs) && !isHoliday(d, holidays));
}

export function shiftTime(baseHour: number, baseMin: number, varianceMin: number): string {
  const totalMin = baseHour * 60 + baseMin + randomInt(-varianceMin, varianceMin);
  const h = Math.max(0, Math.min(23, Math.floor(totalMin / 60)));
  const m = Math.abs(totalMin % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function buildDateTime(dateStr: string, timeStr: string): string {
  return `${dateStr}T${timeStr}:00.000Z`;
}

export function getPastMonths(count: number): { year: number; month: number }[] {
  const result: { year: number; month: number }[] = [];
  const now = new Date();
  for (let i = count; i >= 1; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    result.push({ year: d.getFullYear(), month: d.getMonth() + 1 });
  }
  return result;
}

// -- Salary Helpers --
export function ctcForGrade(gradeCode: string): number {
  const ranges: Record<string, [number, number]> = {
    G1: [300000, 500000],
    G2: [500000, 800000],
    G3: [800000, 1200000],
    G4: [1200000, 1800000],
    G5: [1800000, 2500000],
  };
  const [min, max] = ranges[gradeCode] || [400000, 600000];
  return Math.round(randomInt(min, max) / 1000) * 1000;
}

export function weightedPick<T>(items: { value: T; weight: number }[]): T {
  const total = items.reduce((s, i) => s + i.weight, 0);
  let r = Math.random() * total;
  for (const item of items) {
    r -= item.weight;
    if (r <= 0) return item.value;
  }
  return items[items.length - 1].value;
}

export const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'];
export const MARITAL_STATUSES = ['SINGLE', 'MARRIED', 'DIVORCED', 'WIDOWED'];
export const QUALIFICATIONS = ['B.Tech', 'M.Tech', 'BBA', 'MBA', 'B.Com', 'M.Com', 'B.Sc', 'M.Sc', 'BCA', 'MCA', 'PhD', 'Diploma'];
export const UNIVERSITIES = ['IIT Bombay', 'IIT Delhi', 'NIT Surathkal', 'BITS Pilani', 'VTU Belgaum', 'Anna University', 'Mumbai University', 'Delhi University', 'Pune University', 'Bangalore University'];
