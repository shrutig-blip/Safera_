import { StoredAccount, UserProfile, EmergencyContact } from '../types';

// ---- Storage keys ----
const ACCOUNTS_KEY = 'safera_accounts'; // email -> StoredAccount
const SESSION_KEY = 'safera_session'; // currently logged-in email

// Fixed account used by "Try Demo Login" — lets anyone explore the full
// dashboard (with the same sample contacts already used across the app's
// mock data) without filling in the signup form.
const DEMO_EMAIL = 'demo@safera.app';

export interface SignUpInput {
  name: string;
  age: number;
  email: string;
  phone: string;
  password: string;
  gender?: UserProfile['gender'];
  city: string;
  bloodGroup?: string;
  locationAccessGranted: boolean;
  lastKnownLocation?: { lat: number; lng: number } | null;
  emergencyContacts: EmergencyContact[];
}

// SHA-256 hash via the browser's built-in Web Crypto API. See the
// StoredAccount comment in types/index.ts — this is only meant to avoid
// plaintext passwords in localStorage for a demo, not real security. Also
// reused for the Evidence Vault PIN below, since the same "don't store it
// in plaintext" reasoning applies there too.
async function hashSecret(secret: string): Promise<string> {
  const bytes = new TextEncoder().encode(secret);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
const hashPassword = hashSecret;

function readAccounts(): Record<string, StoredAccount> {
  try {
    const raw = localStorage.getItem(ACCOUNTS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeAccounts(accounts: Record<string, StoredAccount>) {
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function getCurrentUser(): UserProfile | null {
  const email = localStorage.getItem(SESSION_KEY);
  if (!email) return null;
  const account = readAccounts()[email];
  return account ? account.profile : null;
}

export async function signUp(input: SignUpInput): Promise<UserProfile> {
  const email = normalizeEmail(input.email);
  const accounts = readAccounts();

  if (accounts[email]) {
    throw new Error('An account with this email already exists. Try logging in instead.');
  }

  const profile: UserProfile = {
    id: `user-${Date.now()}`,
    name: input.name.trim(),
    age: input.age,
    email,
    phone: input.phone.trim(),
    gender: input.gender,
    city: input.city.trim(),
    bloodGroup: input.bloodGroup,
    locationAccessGranted: input.locationAccessGranted,
    lastKnownLocation: input.lastKnownLocation ?? null,
    emergencyContacts: input.emergencyContacts,
    createdAt: new Date().toISOString(),
  };

  accounts[email] = {
    profile,
    passwordHash: await hashPassword(input.password),
  };
  writeAccounts(accounts);
  localStorage.setItem(SESSION_KEY, email);

  return profile;
}

export async function logIn(email: string, password: string): Promise<UserProfile> {
  const normalized = normalizeEmail(email);
  const accounts = readAccounts();
  const account = accounts[normalized];

  if (!account) {
    throw new Error('No account found with this email. Please sign up first.');
  }

  const hash = await hashPassword(password);
  if (hash !== account.passwordHash) {
    throw new Error('Incorrect password. Please try again.');
  }

  localStorage.setItem(SESSION_KEY, normalized);
  return account.profile;
}

// Instantly logs in (creating it on first use) a ready-made demo account,
// so anyone can explore the full dashboard without signing up.
export async function demoLogin(): Promise<UserProfile> {
  const accounts = readAccounts();

  if (!accounts[DEMO_EMAIL]) {
    const demoProfile: UserProfile = {
      id: 'user-demo',
      name: 'Shreya',
      age: 22,
      email: DEMO_EMAIL,
      phone: '+91 98765 43210',
      gender: 'Female',
      city: 'Delhi NCR',
      bloodGroup: 'O+',
      locationAccessGranted: true,
      lastKnownLocation: { lat: 28.6139, lng: 77.209 },
      emergencyContacts: [
        { id: 'demo-c1', name: 'Ananya Sharma', relation: 'Sister', phone: '+91 98765 11111', isPrimary: true, sendSms: true },
        { id: 'demo-c2', name: 'Rohan Verma', relation: 'Friend', phone: '+91 98765 22222', isPrimary: false, sendSms: true },
      ],
      createdAt: new Date().toISOString(),
      isDemo: true,
    };
    accounts[DEMO_EMAIL] = {
      profile: demoProfile,
      passwordHash: await hashPassword('demo-safera'),
    };
    writeAccounts(accounts);
  }

  localStorage.setItem(SESSION_KEY, DEMO_EMAIL);
  return accounts[DEMO_EMAIL].profile;
}

export function logOut(): void {
  localStorage.removeItem(SESSION_KEY);
}

export function updateCurrentUser(updates: Partial<UserProfile>): UserProfile | null {
  const email = localStorage.getItem(SESSION_KEY);
  if (!email) return null;

  const accounts = readAccounts();
  const account = accounts[email];
  if (!account) return null;

  account.profile = { ...account.profile, ...updates };
  accounts[email] = account;
  writeAccounts(accounts);
  return account.profile;
}

// Wraps the browser geolocation permission prompt in a promise so a signup
// form (or "Enable Location" button anywhere) can `await` a yes/no answer
// instead of juggling callbacks.
export function requestLocationAccess(): Promise<{ lat: number; lng: number } | null> {
  return new Promise((resolve) => {
    if (!('geolocation' in navigator)) {
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { timeout: 8000 }
    );
  });
}

// ---- Evidence Vault PIN ----
// Replaces the old EvidenceVault.tsx logic, which accepted the hardcoded
// string '1234' OR a completely BLANK input as a valid unlock — meaning
// anyone with an unlocked phone could open the vault with zero effort. A
// real per-account PIN, hashed the same way the login password is, closes
// that gap: there's no default and no blank-input bypass.

function currentSessionEmail(): string | null {
  return localStorage.getItem(SESSION_KEY);
}

/** Whether the currently logged-in account has ever set a vault PIN. */
export function hasVaultPin(): boolean {
  const email = currentSessionEmail();
  if (!email) return false;
  const account = readAccounts()[email];
  return !!account?.vaultPinHash;
}

/** Sets (or replaces) the current account's vault PIN. Requires at least 4 digits — no blank PIN is ever accepted. */
export async function setVaultPin(pin: string): Promise<void> {
  const email = currentSessionEmail();
  if (!email) throw new Error('You must be logged in to set a vault PIN.');
  if (!/^\d{4,8}$/.test(pin)) {
    throw new Error('PIN must be 4-8 digits.');
  }

  const accounts = readAccounts();
  const account = accounts[email];
  if (!account) throw new Error('Account not found.');

  account.vaultPinHash = await hashSecret(pin);
  accounts[email] = account;
  writeAccounts(accounts);
}

/** Verifies a PIN attempt against the current account's stored hash. Always false if no PIN has been set yet (call hasVaultPin() first to route to setup instead). */
export async function verifyVaultPin(pin: string): Promise<boolean> {
  const email = currentSessionEmail();
  if (!email) return false;
  const account = readAccounts()[email];
  if (!account?.vaultPinHash) return false;
  if (!pin) return false; // explicit: a blank attempt is never treated as valid

  const attemptHash = await hashSecret(pin);
  return attemptHash === account.vaultPinHash;
}