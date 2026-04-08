#!/usr/bin/env npx tsx
// ============================================================
// Seed Company Script — Creates test companies via the onboard API
// and optionally seeds employees with full master-data linking.
//
// Mirrors the full 17-step Tenant Onboarding Wizard payload
// exactly as defined in tenant.validators.ts / tenant.types.ts.
//
// Usage:
//   npx tsx scripts/seed-company.ts
//   npx tsx scripts/seed-company.ts --count 3
//   npx tsx scripts/seed-company.ts --multi-location
//   npx tsx scripts/seed-company.ts --employees 20
//   npx tsx scripts/seed-company.ts --count 2 --multi-location --employees 10
//
// Environment variables (or use flags):
//   API_URL          — default http://localhost:3030/api/v1
//   ADMIN_EMAIL      — super admin email
//   ADMIN_PASSWORD   — super admin password
// ============================================================

// ── CLI Argument Parsing ──────────────────────────────────────

const args = process.argv.slice(2);

function getArg(name: string, fallback: string): string {
  const idx = args.indexOf(`--${name}`);
  if (idx !== -1 && args[idx + 1]) return args[idx + 1];
  return fallback;
}

function hasFlag(name: string): boolean {
  return args.includes(`--${name}`);
}

if (hasFlag('help') || hasFlag('h')) {
  console.log(`
  Seed Company — Create test companies via the onboard API

  Usage:
    npx tsx scripts/seed-company.ts [options]

  Options:
    --count N          Number of companies to create (default: 1)
    --multi-location   Create 3 locations per company instead of 1
    --employees N      Create N employees per company (default: 0)
    --api-url URL      API base URL (default: http://localhost:3030/api/v1)
    --email EMAIL      Super admin email (or set ADMIN_EMAIL env var)
    --password PASS    Super admin password (or set ADMIN_PASSWORD env var)
    --help, -h         Show this help

  Examples:
    npx tsx scripts/seed-company.ts --count 2 --multi-location --employees 15
    npx tsx scripts/seed-company.ts --employees 5 --email superadmin@avyrentechnologies.com --password Avyren#Nexus47!Q
  `);
  process.exit(0);
}

const API_URL = getArg('api-url', process.env.API_URL || 'http://localhost:3030/api/v1');
const ADMIN_EMAIL = getArg('email', process.env.ADMIN_EMAIL || 'superadmin@avyrentechnologies.com');
const ADMIN_PASSWORD = getArg('password', process.env.ADMIN_PASSWORD || 'Avyren#Nexus47!Q');
const COUNT = parseInt(getArg('count', '1'), 10);
const MULTI_LOCATION = hasFlag('multi-location');
const EMPLOYEE_COUNT = parseInt(getArg('employees', '0'), 10);

// ── Unique ID & Fake Data Generators ──────────────────────────

let counter = 0;

function uid(): string {
  counter++;
  const ts = Date.now().toString(36);
  const rnd = Math.random().toString(36).slice(2, 5);
  return `${ts}${rnd}${counter}`;
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomDigits(len: number): string {
  let s = '';
  for (let i = 0; i < len; i++) s += Math.floor(Math.random() * 10);
  return s;
}

function randomLetter(): string {
  return 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[Math.floor(Math.random() * 26)];
}

function randomPhone(): string {
  return `98${randomDigits(8)}`;
}

function randomPin(): string {
  return `${Math.floor(100000 + Math.random() * 899999)}`;
}

function randomInt(min: number, max: number): number {
  return Math.floor(min + Math.random() * (max - min + 1));
}

function randomDate(startYear: number, endYear: number): string {
  const y = randomInt(startYear, endYear);
  const m = String(randomInt(1, 12)).padStart(2, '0');
  const d = String(randomInt(1, 28)).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Indian PAN format: AAAPX9999X */
function fakePAN(): string {
  return `${randomLetter()}${randomLetter()}${randomLetter()}P${randomLetter()}${randomDigits(4)}${randomLetter()}`;
}

/** Indian TAN format: AAAA99999A */
function fakeTAN(): string {
  return `${randomLetter()}${randomLetter()}${randomLetter()}${randomLetter()}${randomDigits(5)}${randomLetter()}`;
}

/** Indian GSTIN format: 2-digit state code + PAN + 1Z + digit */
function fakeGSTIN(pan: string, stateCode: string): string {
  return `${stateCode.padStart(2, '0')}${pan}1Z${randomDigits(1)}`;
}

/** Fake CIN: U99999MH2020PTC999999 */
function fakeCIN(): string {
  return `U${randomDigits(5)}MH${2015 + Math.floor(Math.random() * 10)}PTC${randomDigits(6)}`;
}

function fakePFReg(): string { return `MH/PNE/${randomDigits(5)}/${randomDigits(3)}`; }
function fakeESI(): string { return `31-00-${randomDigits(6)}-${randomDigits(3)}-${randomDigits(4)}`; }
function fakePTReg(): string { return `PTEC/${randomDigits(8)}`; }
function fakeLWFR(): string { return `LWF/${randomDigits(6)}`; }
function fakeAadhaar(): string { return `${randomDigits(4)} ${randomDigits(4)} ${randomDigits(4)}`; }
function fakeUAN(): string { return `1001${randomDigits(8)}`; }
function fakeBankAccount(): string { return randomDigits(randomInt(11, 16)); }
function fakeIFSC(): string { return `${randomLetter()}${randomLetter()}${randomLetter()}${randomLetter()}0${randomDigits(6)}`; }

// ── API Helpers ───────────────────────────────────────────────

async function loginAs(email: string, password: string): Promise<string> {
  const res = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Login failed (${res.status}): ${body}`);
  }

  const json = await res.json() as any;
  const token =
    json.data?.tokens?.accessToken ||
    json.data?.accessToken ||
    json.data?.token ||
    json.accessToken ||
    json.token;
  if (!token) throw new Error(`No token in login response: ${JSON.stringify(json)}`);
  return token;
}

async function apiPost(token: string, path: string, payload: any): Promise<any> {
  const res = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
  const json = await res.json() as any;
  if (!res.ok) {
    throw new Error(`POST ${path} failed (${res.status}): ${json.error || json.message || JSON.stringify(json)}`);
  }
  return json;
}

async function apiGet(token: string, path: string): Promise<any> {
  const res = await fetch(`${API_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = await res.json() as any;
  if (!res.ok) {
    throw new Error(`GET ${path} failed (${res.status}): ${json.error || json.message || JSON.stringify(json)}`);
  }
  return json;
}

// ── Reference Data ────────────────────────────────────────────

const INDIAN_STATES_WITH_CODES = [
  { name: 'Maharashtra', code: '27', stdCode: '022' },
  { name: 'Karnataka', code: '29', stdCode: '080' },
  { name: 'Tamil Nadu', code: '33', stdCode: '044' },
  { name: 'Gujarat', code: '24', stdCode: '079' },
  { name: 'Delhi', code: '07', stdCode: '011' },
  { name: 'Uttar Pradesh', code: '09', stdCode: '0522' },
  { name: 'Rajasthan', code: '08', stdCode: '0141' },
  { name: 'West Bengal', code: '19', stdCode: '033' },
];

const CITIES: Record<string, { city: string; district: string }[]> = {
  Maharashtra: [
    { city: 'Mumbai', district: 'Mumbai Suburban' }, { city: 'Pune', district: 'Pune' },
    { city: 'Nagpur', district: 'Nagpur' }, { city: 'Nashik', district: 'Nashik' },
  ],
  Karnataka: [
    { city: 'Bengaluru', district: 'Bengaluru Urban' }, { city: 'Mysuru', district: 'Mysuru' },
    { city: 'Hubli', district: 'Dharwad' }, { city: 'Mangaluru', district: 'Dakshina Kannada' },
  ],
  'Tamil Nadu': [
    { city: 'Chennai', district: 'Chennai' }, { city: 'Coimbatore', district: 'Coimbatore' },
    { city: 'Madurai', district: 'Madurai' }, { city: 'Salem', district: 'Salem' },
  ],
  Gujarat: [
    { city: 'Ahmedabad', district: 'Ahmedabad' }, { city: 'Surat', district: 'Surat' },
    { city: 'Vadodara', district: 'Vadodara' }, { city: 'Rajkot', district: 'Rajkot' },
  ],
  Delhi: [
    { city: 'New Delhi', district: 'New Delhi' }, { city: 'Dwarka', district: 'South West Delhi' },
    { city: 'Rohini', district: 'North West Delhi' }, { city: 'Saket', district: 'South Delhi' },
  ],
  'Uttar Pradesh': [
    { city: 'Noida', district: 'Gautam Buddh Nagar' }, { city: 'Lucknow', district: 'Lucknow' },
    { city: 'Agra', district: 'Agra' }, { city: 'Varanasi', district: 'Varanasi' },
  ],
  Rajasthan: [
    { city: 'Jaipur', district: 'Jaipur' }, { city: 'Jodhpur', district: 'Jodhpur' },
    { city: 'Udaipur', district: 'Udaipur' }, { city: 'Kota', district: 'Kota' },
  ],
  'West Bengal': [
    { city: 'Kolkata', district: 'Kolkata' }, { city: 'Howrah', district: 'Howrah' },
    { city: 'Durgapur', district: 'Paschim Bardhaman' }, { city: 'Siliguri', district: 'Darjeeling' },
  ],
};

const INDUSTRIES = [
  'Manufacturing', 'IT', 'Automotive', 'Pharma', 'Textiles',
  'Electronics', 'Food Processing', 'Heavy Engineering', 'Steel & Metal',
  'Chemicals', 'CNC Machining', 'Plastics', 'Logistics',
];

const FACILITY_TYPES = [
  'Manufacturing Plant', 'Assembly Unit', 'Warehouse / Distribution',
  'R&D Centre', 'Factory', 'Service Centre',
];

const DESIGNATIONS_LABELS = [
  'Plant Head', 'Production Manager', 'Quality Manager',
  'Maintenance Head', 'HR Manager', 'Shift Supervisor',
];

// Employee name pools
const FIRST_NAMES_MALE = [
  'Rajesh', 'Amit', 'Suresh', 'Vikram', 'Anil', 'Rahul', 'Sanjay', 'Deepak',
  'Manoj', 'Ajay', 'Kiran', 'Ravi', 'Arun', 'Nikhil', 'Vivek', 'Gaurav',
  'Rohit', 'Sachin', 'Vishal', 'Pankaj', 'Ashok', 'Naveen', 'Sunil', 'Dinesh',
  'Arjun', 'Krishna', 'Ramesh', 'Pramod', 'Hemant', 'Sandeep',
];
const FIRST_NAMES_FEMALE = [
  'Priya', 'Meera', 'Anjali', 'Kavitha', 'Sunita', 'Deepa', 'Lakshmi', 'Radha',
  'Pooja', 'Neha', 'Swati', 'Rekha', 'Anita', 'Divya', 'Nandini', 'Shruti',
  'Pallavi', 'Archana', 'Sonal', 'Manisha', 'Aarti', 'Geeta', 'Rashmi', 'Bhavna',
  'Jyoti', 'Smita', 'Komal', 'Renu', 'Sapna', 'Tina',
];
const LAST_NAMES = [
  'Sharma', 'Patel', 'Singh', 'Reddy', 'Nair', 'Gupta', 'Kumar', 'Verma',
  'Yadav', 'Chauhan', 'Joshi', 'Desai', 'Kulkarni', 'Mehta', 'Pillai', 'Rao',
  'Iyer', 'Thakur', 'Mishra', 'Banerjee', 'Das', 'Bhat', 'Pandey', 'Saxena',
  'Agarwal', 'Tiwari', 'Dubey', 'Goswami', 'Patil', 'Shukla',
];

const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'];
const RELIGIONS = ['Hindu', 'Muslim', 'Christian', 'Sikh', 'Buddhist', 'Jain'];
const CATEGORIES = ['General', 'OBC', 'SC', 'ST'];
const BANK_NAMES = ['State Bank of India', 'HDFC Bank', 'ICICI Bank', 'Axis Bank', 'Bank of Baroda', 'Punjab National Bank', 'Kotak Mahindra Bank', 'Union Bank of India'];
const BANK_BRANCHES = ['Main Branch', 'MIDC Branch', 'Industrial Area Branch', 'City Centre Branch'];

// ── Location Builder ──────────────────────────────────────────

function buildLocation(index: number, isHQ: boolean, pan: string, companyUid: string) {
  const stateInfo = INDIAN_STATES_WITH_CODES[index % INDIAN_STATES_WITH_CODES.length];
  const cityInfo = pickRandom(CITIES[stateInfo.name] || CITIES['Maharashtra']);
  const gstin = fakeGSTIN(pan, stateInfo.code);

  return {
    name: isHQ ? 'Head Office' : `Plant ${index} — ${cityInfo.city}`,
    code: isHQ ? 'HQ' : `PLT-${index}`,
    facilityType: isHQ ? 'Head Office' : pickRandom(FACILITY_TYPES),
    status: 'Active',
    isHQ,
    addressLine1: `${randomInt(100, 999)} Industrial Area, Sector ${randomInt(1, 50)}`,
    addressLine2: `Near ${pickRandom(['NH Highway', 'Railway Station', 'MIDC', 'SEZ Gate', 'IT Park'])}`,
    city: cityInfo.city,
    district: cityInfo.district,
    state: stateInfo.name,
    pin: randomPin(),
    country: 'India',
    stdCode: stateInfo.stdCode,
    gstin,
    stateGST: stateInfo.code,
    contactName: isHQ ? 'Rajesh Kumar' : `${pickRandom(FIRST_NAMES_MALE)} ${pickRandom(LAST_NAMES)}`,
    contactDesignation: isHQ ? 'Operations Head' : pickRandom(DESIGNATIONS_LABELS),
    contactEmail: `loc-${index}-${companyUid}@test.local`,
    contactCountryCode: '+91',
    contactPhone: randomPhone(),
    geoEnabled: index === 0,
    geoLocationName: index === 0 ? `${cityInfo.city} HQ Campus` : undefined,
    geoLat: index === 0 ? `${18 + Math.random() * 10}` : undefined,
    geoLng: index === 0 ? `${72 + Math.random() * 8}` : undefined,
    geoRadius: 200,
    geoShape: 'circle',
  };
}

// ── Company Payload Builder (all 17 wizard steps) ─────────────

function buildPayload(multiLocation: boolean) {
  const id = uid();
  const companyCode = `TEST-${id}`.toUpperCase();
  const displayName = `Test Corp ${id}`;
  const industry = pickRandom(INDUSTRIES);
  const pan = fakePAN();
  const tan = fakeTAN();
  const companyStateInfo = pickRandom(INDIAN_STATES_WITH_CODES);
  const companyCityInfo = pickRandom(CITIES[companyStateInfo.name] || CITIES['Maharashtra']);
  const gstin = fakeGSTIN(pan, companyStateInfo.code);
  const adminEmail = `admin-${id}@test.local`;
  const adminUsername = `admin_${id}`;

  const locations = multiLocation
    ? [buildLocation(0, true, pan, id), buildLocation(1, false, pan, id), buildLocation(2, false, pan, id)]
    : [buildLocation(0, true, pan, id)];

  const payload = {
    identity: {
      displayName, legalName: `${displayName} Private Limited`,
      slug: `test-${id.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`,
      businessType: 'Private Limited (Pvt. Ltd.)', industry, companyCode,
      shortName: `TC${id.slice(-6).toUpperCase()}`,
      incorporationDate: randomDate(2015, 2023), employeeCount: pickRandom(['1-50', '50-100', '100-200', '200-500']),
      cin: fakeCIN(), website: `https://www.${companyCode.toLowerCase().replace(/[^a-z0-9]/g, '')}.test`,
      emailDomain: `${companyCode.toLowerCase().replace(/[^a-z0-9]/g, '')}.test`,
      logoUrl: '', wizardStatus: 'Active',
    },
    statutory: { pan, tan, gstin, pfRegNo: fakePFReg(), esiCode: fakeESI(), ptReg: fakePTReg(), lwfrNo: fakeLWFR(), rocState: companyStateInfo.name },
    address: {
      registered: {
        line1: `${randomInt(100, 999)}, ${pickRandom(['MG Road', 'Station Road', 'Industrial Lane', 'Commerce Avenue', 'Corporate Park'])}`,
        line2: `${pickRandom(['Sector', 'Block', 'Wing', 'Tower'])} ${randomInt(1, 20)}`,
        city: companyCityInfo.city, district: companyCityInfo.district, state: companyStateInfo.name,
        pin: randomPin(), country: 'India', stdCode: companyStateInfo.stdCode,
      },
      sameAsRegistered: !multiLocation,
      corporate: multiLocation ? {
        line1: `${randomInt(100, 999)}, Corporate Hub`, line2: `Floor ${randomInt(1, 20)}, Tower ${pickRandom(['A', 'B', 'C'])}`,
        city: companyCityInfo.city, district: companyCityInfo.district, state: companyStateInfo.name,
        pin: randomPin(), country: 'India', stdCode: companyStateInfo.stdCode,
      } : undefined,
    },
    fiscal: {
      fyType: 'apr-mar', fyCustomStartMonth: '', fyCustomEndMonth: '',
      payrollFreq: 'Monthly', cutoffDay: 'Last Working Day', disbursementDay: '1st',
      weekStart: 'Monday', timezone: 'IST UTC+5:30',
      workingDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
    },
    preferences: {
      currency: 'INR — ₹', language: 'English', dateFormat: 'DD/MM/YYYY',
      numberFormat: 'Indian (2,00,000)', timeFormat: '12-hour (AM/PM)',
      indiaCompliance: true, multiCurrency: false, ess: true, mobileApp: true, webApp: true,
      systemApp: false, aiChatbot: false, eSign: false, biometric: false, bankIntegration: false,
      razorpayEnabled: false, razorpayKeyId: '', razorpayKeySecret: '',
      razorpayWebhookSecret: '', razorpayAccountNumber: '',
      razorpayAutoDisbursement: false, razorpayTestMode: true, emailNotif: true, whatsapp: false,
    },
    endpoint: { endpointType: 'default' as const, customBaseUrl: '' },
    strategy: { multiLocationMode: multiLocation, locationConfig: 'common' as const },
    locations,
    commercial: {
      selectedModuleIds: ['hr', 'security', 'masters'],
      customModulePricing: {} as Record<string, number>,
      userTier: 'starter', customUserLimit: '', customTierPrice: '',
      billingType: 'monthly', trialDays: 14,
    },
    contacts: [
      { name: 'Anand Verma', designation: 'HR Director', department: 'Human Resources', type: 'Primary', email: `hr-${id}@test.local`, countryCode: '+91', mobile: randomPhone(), linkedin: `https://linkedin.com/in/anand-verma-${id}` },
      { name: 'Priya Mehta', designation: 'Finance Controller', department: 'Finance', type: 'Finance Contact', email: `finance-${id}@test.local`, countryCode: '+91', mobile: randomPhone(), linkedin: '' },
      { name: 'Ravi Shankar', designation: 'IT Manager', department: 'IT', type: 'IT Contact', email: `it-${id}@test.local`, countryCode: '+91', mobile: randomPhone(), linkedin: '' },
    ],
    shifts: {
      dayStartTime: '06:00', dayEndTime: '22:00', weeklyOffs: ['Sunday'],
      items: [
        { name: 'General Shift', fromTime: '09:00', toTime: '18:00', noShuffle: true, downtimeSlots: [{ type: 'Lunch Break', duration: '60' }, { type: 'Tea Break', duration: '15' }] },
        { name: 'Morning Shift', fromTime: '06:00', toTime: '14:00', noShuffle: false, downtimeSlots: [{ type: 'Lunch Break', duration: '30' }, { type: 'Tea Break', duration: '15' }] },
        { name: 'Afternoon Shift', fromTime: '14:00', toTime: '22:00', noShuffle: false, downtimeSlots: [{ type: 'Lunch Break', duration: '30' }, { type: 'Tea Break', duration: '15' }] },
      ],
    },
    noSeries: [
      { code: 'EMP', linkedScreen: 'Employee Onboarding', description: 'Employee ID sequence', prefix: 'EMP-', suffix: '', numberCount: 6, startNumber: 1 },
      { code: 'ATT', linkedScreen: 'Attendance', description: 'Attendance record numbering', prefix: 'ATT-', suffix: '', numberCount: 6, startNumber: 1 },
      { code: 'LV', linkedScreen: 'Leave Management', description: 'Leave request numbering', prefix: 'LV-', suffix: '', numberCount: 6, startNumber: 1 },
      { code: 'PAY', linkedScreen: 'Payroll', description: 'Payroll run numbering', prefix: 'PAY-', suffix: '', numberCount: 6, startNumber: 1 },
      { code: 'WO', linkedScreen: 'Work Order', description: 'Work order numbering', prefix: 'WO-', suffix: '', numberCount: 6, startNumber: 1 },
      { code: 'MR', linkedScreen: 'Material Request', description: 'Material request numbering', prefix: 'MR-', suffix: '', numberCount: 6, startNumber: 1 },
      { code: 'GRN', linkedScreen: 'GRN', description: 'Goods receipt note numbering', prefix: 'GRN-', suffix: '', numberCount: 6, startNumber: 1 },
      { code: 'NC', linkedScreen: 'Non-Conformance', description: 'Non-conformance numbering', prefix: 'NC-', suffix: '', numberCount: 6, startNumber: 1 },
      { code: 'MT', linkedScreen: 'Maintenance Ticket', description: 'Maintenance ticket numbering', prefix: 'MT-', suffix: '', numberCount: 6, startNumber: 1 },
      { code: 'GP', linkedScreen: 'Gate Pass', description: 'Gate pass numbering', prefix: 'GP-', suffix: '', numberCount: 6, startNumber: 1 },
    ],
    iotReasons: [
      { reasonType: 'Machine Idle', reason: 'No Operator', description: 'Operator not available at station', department: 'Production', planned: false, duration: '' },
      { reasonType: 'Machine Idle', reason: 'Material Shortage', description: 'Raw material not available', department: 'Logistics', planned: false, duration: '' },
      { reasonType: 'Machine Idle', reason: 'Power Failure', description: 'Unplanned power outage', department: 'Maintenance', planned: false, duration: '' },
      { reasonType: 'Machine Idle', reason: 'Tool Change', description: 'Scheduled tool change', department: 'Production', planned: true, duration: '30' },
      { reasonType: 'Machine Alarm', reason: 'Scheduled Maintenance', description: 'Preventive maintenance activity', department: 'Maintenance', planned: true, duration: '120' },
      { reasonType: 'Machine Alarm', reason: 'Breakdown', description: 'Unexpected machine failure', department: 'Maintenance', planned: false, duration: '' },
      { reasonType: 'Machine Idle', reason: 'Quality Hold', description: 'Quality issue, awaiting inspection', department: 'Quality', planned: false, duration: '' },
      { reasonType: 'Machine Idle', reason: 'Changeover', description: 'Product or mould changeover', department: 'Production', planned: true, duration: '45' },
    ],
    controls: { ncEditMode: false, loadUnload: true, cycleTime: true, payrollLock: true, leaveCarryForward: true, overtimeApproval: true, mfa: false },
    users: [{
      fullName: `Admin ${id}`, username: adminUsername, password: 'Test@12345',
      role: 'Company Admin', email: adminEmail, mobile: randomPhone(), department: 'Management',
    }],
  };

  return { payload, meta: { companyCode, displayName, adminEmail, adminUsername, password: 'Test@12345' } };
}

// ── Master Data Fetcher ───────────────────────────────────────

interface MasterData {
  departments: { id: string; name: string; code: string }[];
  designations: { id: string; name: string; code: string }[];
  grades: { id: string; name: string; code: string }[];
  employeeTypes: { id: string; name: string; code: string }[];
  locations: { id: string; name: string; code: string }[];
  shifts: { id: string; name: string }[];
  costCentres: { id: string; name: string; code: string }[];
  roles: { id: string; name: string; isSystem: boolean }[];
}

async function fetchMasterData(adminToken: string): Promise<MasterData> {
  // Fetch all master lists + RBAC roles in parallel
  const [deptRes, desigRes, gradeRes, etRes, locRes, shiftRes, ccRes, rolesRes] = await Promise.all([
    apiGet(adminToken, '/hr/departments'),
    apiGet(adminToken, '/hr/designations'),
    apiGet(adminToken, '/hr/grades'),
    apiGet(adminToken, '/hr/employee-types'),
    apiGet(adminToken, '/company/locations'),
    apiGet(adminToken, '/company/shifts'),
    apiGet(adminToken, '/hr/cost-centres'),
    apiGet(adminToken, '/rbac/roles'),
  ]);

  // Extract data arrays (handle paginated or direct array responses)
  const extract = (res: any) => res.data?.data || res.data || [];

  return {
    departments: extract(deptRes),
    designations: extract(desigRes),
    grades: extract(gradeRes),
    employeeTypes: extract(etRes),
    locations: extract(locRes),
    shifts: extract(shiftRes),
    costCentres: extract(ccRes),
    roles: extract(rolesRes),
  };
}

// ── Employee Payload Builder ──────────────────────────────────

interface EmployeeBuildResult {
  payload: any;
  credentials: { name: string; officialEmail: string; role: string };
}

function buildEmployeePayload(index: number, companyUid: string, masters: MasterData, isManager: boolean): EmployeeBuildResult {
  const isMale = Math.random() > 0.4; // 60/40 split
  const gender = isMale ? 'MALE' : 'FEMALE';
  const firstName = pickRandom(isMale ? FIRST_NAMES_MALE : FIRST_NAMES_FEMALE);
  const lastName = pickRandom(LAST_NAMES);
  const empUid = `${companyUid}-${index}`;

  // Link to random master records
  const department = pickRandom(masters.departments);
  const designation = pickRandom(masters.designations);
  const grade = pickRandom(masters.grades);
  const employeeType = pickRandom(masters.employeeTypes);
  const location = masters.locations.length > 0 ? pickRandom(masters.locations) : null;
  const shift = masters.shifts.length > 0 ? pickRandom(masters.shifts) : null;
  const costCentre = masters.costCentres.length > 0
    ? masters.costCentres.find(cc => cc.code === `CC-${department.code}`) || pickRandom(masters.costCentres)
    : null;

  // Resolve RBAC role — Manager role for managers, Employee role for others
  const managerRole = masters.roles.find(r => r.name === 'Manager');
  const employeeRole = masters.roles.find(r => r.name === 'Employee');
  const assignedRole = isManager ? managerRole : employeeRole;
  const roleName = isManager ? 'Manager' : 'Employee';

  // Salary based on grade CTC range (approximation from defaults)
  const gradeCtcMap: Record<string, { min: number; max: number }> = {
    G1: { min: 300000, max: 600000 },
    G2: { min: 600000, max: 1200000 },
    G3: { min: 1200000, max: 2500000 },
    G4: { min: 2500000, max: 5000000 },
    G5: { min: 5000000, max: 10000000 },
  };
  const ctcRange = gradeCtcMap[grade.code] || { min: 400000, max: 800000 };
  const annualCtc = randomInt(ctcRange.min, ctcRange.max);

  const stateInfo = pickRandom(INDIAN_STATES_WITH_CODES);
  const cityInfo = pickRandom(CITIES[stateInfo.name] || CITIES['Maharashtra']);

  const officialEmail = `${firstName.toLowerCase()}.${lastName.toLowerCase()}.${empUid.toLowerCase()}@official.test`;

  const payload = {
    // Tab 1: Personal
    firstName,
    middleName: Math.random() > 0.7 ? pickRandom(['Kumar', 'Devi', 'Bai', 'Lal', 'Prasad']) : undefined,
    lastName,
    dateOfBirth: randomDate(1975, 2002),
    gender,
    maritalStatus: pickRandom(['SINGLE', 'MARRIED', 'SINGLE', 'MARRIED'] as const),
    bloodGroup: pickRandom(BLOOD_GROUPS),
    fatherMotherName: `${pickRandom(FIRST_NAMES_MALE)} ${lastName}`,
    nationality: 'Indian',
    religion: pickRandom(RELIGIONS),
    category: pickRandom(CATEGORIES),
    differentlyAbled: false,
    profilePhotoUrl: null,

    // Contact
    personalMobile: randomPhone(),
    alternativeMobile: Math.random() > 0.5 ? randomPhone() : undefined,
    personalEmail: `${firstName.toLowerCase()}.${lastName.toLowerCase()}.${empUid.toLowerCase()}@test.local`,
    officialEmail,
    currentAddress: {
      line1: `${randomInt(1, 999)}, ${pickRandom(['MG Road', 'Station Road', 'Gandhi Nagar', 'Nehru Colony', 'Laxmi Nagar'])}`,
      line2: `${pickRandom(['Near', 'Opp.', 'Behind'])} ${pickRandom(['Bus Stand', 'Temple', 'School', 'Hospital', 'Market'])}`,
      city: cityInfo.city,
      state: stateInfo.name,
      pin: randomPin(),
      country: 'India',
    },
    permanentAddress: {
      line1: `${randomInt(1, 999)}, ${pickRandom(['Main Road', 'Market Road', 'Village Road', 'Colony Lane'])}`,
      line2: pickRandom(['Ward No. 5', 'Block A', 'Sector 12', '']),
      city: pickRandom(['Nagpur', 'Indore', 'Jaipur', 'Patna', 'Bhopal', 'Ranchi', 'Dehradun']),
      state: pickRandom(INDIAN_STATES_WITH_CODES).name,
      pin: randomPin(),
      country: 'India',
    },
    emergencyContactName: `${pickRandom(FIRST_NAMES_MALE)} ${lastName}`,
    emergencyContactRelation: pickRandom(['Father', 'Mother', 'Spouse', 'Brother', 'Sister']),
    emergencyContactMobile: randomPhone(),

    // Tab 2: Professional
    joiningDate: randomDate(2023, 2026),
    employeeTypeId: employeeType.id,
    departmentId: department.id,
    designationId: designation.id,
    gradeId: grade.id,
    workType: pickRandom(['ON_SITE', 'ON_SITE', 'ON_SITE', 'HYBRID', 'REMOTE'] as const),
    shiftId: shift?.id,
    costCentreId: costCentre?.id,
    locationId: location?.id,
    noticePeriodDays: pickRandom([30, 60, 90]),

    // Tab 3: Salary
    annualCtc,
    paymentMode: pickRandom(['NEFT', 'IMPS'] as const),

    // Tab 4: Bank
    bankAccountNumber: fakeBankAccount(),
    bankIfscCode: fakeIFSC(),
    bankName: pickRandom(BANK_NAMES),
    bankBranch: pickRandom(BANK_BRANCHES),
    accountType: pickRandom(['SAVINGS', 'CURRENT'] as const),

    // Statutory IDs
    panNumber: fakePAN(),
    aadhaarNumber: fakeAadhaar(),
    uan: fakeUAN(),
    esiIpNumber: Math.random() > 0.5 ? `IP/${randomDigits(10)}` : undefined,
    passportNumber: Math.random() > 0.8 ? `${randomLetter()}${randomDigits(7)}` : undefined,
    drivingLicence: Math.random() > 0.6 ? `MH${randomDigits(13)}` : undefined,
    voterId: Math.random() > 0.7 ? `${randomLetter()}${randomLetter()}${randomLetter()}${randomDigits(7)}` : undefined,

    // Status
    initialStatus: isManager ? 'CONFIRMED' as const : pickRandom(['PROBATION', 'ACTIVE', 'CONFIRMED', 'ACTIVE'] as const),

    // User account creation — officialEmail is login email, userRole links RBAC
    createUserAccount: true,
    userPassword: 'Test@12345',
    userRole: assignedRole?.id,
    userLocationId: location?.id,
  };

  return {
    payload,
    credentials: { name: `${firstName} ${lastName}`, officialEmail, role: roleName },
  };
}

// ── Main ──────────────────────────────────────────────────────

async function main() {
  console.log('\n=== Seed Company Script ===');
  console.log(`  API:            ${API_URL}`);
  console.log(`  Admin:          ${ADMIN_EMAIL}`);
  console.log(`  Count:          ${COUNT}`);
  console.log(`  Multi-location: ${MULTI_LOCATION}`);
  console.log(`  Employees:      ${EMPLOYEE_COUNT}\n`);

  // 1. Login as super admin
  console.log('Logging in as super admin...');
  const saToken = await loginAs(ADMIN_EMAIL, ADMIN_PASSWORD);
  console.log('Authenticated.\n');

  // 2. Create companies
  interface CompanyResult {
    companyCode: string; displayName: string; adminEmail: string; password: string;
    employeesCreated: number;
    employeeCredentials: { empId: string; name: string; officialEmail: string; role: string; password: string }[];
  }
  const results: CompanyResult[] = [];

  for (let i = 0; i < COUNT; i++) {
    const { payload, meta } = buildPayload(MULTI_LOCATION);
    const label = `[${i + 1}/${COUNT}]`;

    try {
      console.log(`${label} Creating "${meta.displayName}" (${meta.companyCode})...`);
      const res = await apiPost(saToken, '/platform/tenants/onboard', payload);
      const companyId = res.data?.id || res.data?.company?.id || '—';
      console.log(`${label} Created! ID: ${companyId}`);

      let employeesCreated = 0;
      const employeeCredentials: CompanyResult['employeeCredentials'] = [];

      // 3. Seed employees if --employees flag is set
      if (EMPLOYEE_COUNT > 0) {
        console.log(`${label} Logging in as company admin (${meta.adminEmail})...`);
        const adminToken = await loginAs(meta.adminEmail, meta.password);

        console.log(`${label} Fetching master data + RBAC roles...`);
        const masters = await fetchMasterData(adminToken);
        console.log(`${label} Masters: ${masters.departments.length} depts, ${masters.designations.length} desigs, ${masters.grades.length} grades, ${masters.employeeTypes.length} types, ${masters.locations.length} locs, ${masters.shifts.length} shifts, ${masters.costCentres.length} CCs, ${masters.roles.length} roles`);

        if (masters.departments.length === 0 || masters.designations.length === 0 || masters.employeeTypes.length === 0) {
          console.warn(`${label} WARNING: Missing master data, skipping employee creation`);
        } else {
          // First employee is a manager; subsequent employees report to them
          let managerEmployeeId: string | undefined;

          for (let e = 0; e < EMPLOYEE_COUNT; e++) {
            const isManager = e === 0;
            const { payload: empPayload, credentials } = buildEmployeePayload(e, meta.companyCode, masters, isManager);

            // Manager gets a senior designation + grade override
            if (isManager) {
              const mgrDesig = masters.designations.find(d => ['MGR', 'SM', 'TL'].includes(d.code)) || masters.designations[0];
              const seniorGrade = masters.grades.find(g => ['G3', 'G4'].includes(g.code)) || masters.grades[0];
              empPayload.designationId = mgrDesig.id;
              empPayload.gradeId = seniorGrade.id;
            } else if (managerEmployeeId) {
              empPayload.reportingManagerId = managerEmployeeId;
              empPayload.functionalManagerId = managerEmployeeId;
            }

            try {
              const empRes = await apiPost(adminToken, '/hr/employees', empPayload);
              const empData = empRes.data;
              const empId = empData?.id || '—';
              const empNum = empData?.employeeId || '—';

              if (isManager) managerEmployeeId = empId;

              employeesCreated++;
              employeeCredentials.push({
                empId: empNum,
                name: credentials.name,
                officialEmail: credentials.officialEmail,
                role: credentials.role,
                password: 'Test@12345',
              });

              if ((e + 1) % 5 === 0 || e === EMPLOYEE_COUNT - 1) {
                console.log(`${label}   Employees: ${e + 1}/${EMPLOYEE_COUNT} created (latest: ${empNum})`);
              }
            } catch (empErr: any) {
              console.error(`${label}   Employee ${e + 1} FAILED: ${empErr.message}`);
            }
          }
          console.log(`${label} Employees seeded: ${employeesCreated}/${EMPLOYEE_COUNT}`);
        }
      }

      results.push({ ...meta, employeesCreated, employeeCredentials });
    } catch (err: any) {
      console.error(`${label} FAILED: ${err.message}`);
    }
  }

  // 4. Summary — Companies
  if (results.length > 0) {
    console.log('\n' + '='.repeat(120));
    console.log('  COMPANY SUMMARY');
    console.log('='.repeat(120) + '\n');
    const header =
      'Company Code'.padEnd(24) + '| ' +
      'Display Name'.padEnd(31) + '| ' +
      'Admin Email (login)'.padEnd(40) + '| ' +
      'Password'.padEnd(14) + '| ' +
      'Employees';
    console.log(header);
    console.log('-'.repeat(header.length + 5));
    for (const r of results) {
      console.log(
        `${r.companyCode.padEnd(24)}| ${r.displayName.padEnd(31)}| ${r.adminEmail.padEnd(40)}| ${r.password.padEnd(14)}| ${r.employeesCreated}`
      );
    }
    console.log(`\nTotal companies: ${results.length}/${COUNT}`);

    // 5. Summary — Employee Credentials
    const allEmpCreds = results.flatMap(r => r.employeeCredentials.map(ec => ({ ...ec, company: r.companyCode })));
    if (allEmpCreds.length > 0) {
      console.log('\n' + '='.repeat(120));
      console.log('  EMPLOYEE CREDENTIALS  (all passwords: Test@12345)');
      console.log('='.repeat(120) + '\n');

      const empHeader =
        'Company'.padEnd(24) + '| ' +
        'Emp ID'.padEnd(14) + '| ' +
        'Name'.padEnd(24) + '| ' +
        'Login Email (officialEmail)'.padEnd(50) + '| ' +
        'Role';
      console.log(empHeader);
      console.log('-'.repeat(empHeader.length + 5));
      for (const ec of allEmpCreds) {
        console.log(
          `${ec.company.padEnd(24)}| ${ec.empId.padEnd(14)}| ${ec.name.padEnd(24)}| ${ec.officialEmail.padEnd(50)}| ${ec.role}`
        );
      }
      console.log(`\nTotal employees: ${allEmpCreds.length}/${COUNT * EMPLOYEE_COUNT}`);
      console.log(`All employee password: Test@12345`);
    }
  }
}

main().catch((err) => {
  console.error('\nFatal error:', err.message);
  process.exit(1);
});
