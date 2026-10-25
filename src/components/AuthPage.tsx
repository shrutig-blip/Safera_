import React, { useState } from 'react';
import {
  Mail,
  Lock,
  User,
  Phone,
  MapPin,
  Calendar,
  Plus,
  Trash2,
  Loader2,
  ArrowLeft,
  Eye,
  EyeOff,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { GuardIaLogo } from './GuardIaLogo';
import { EmergencyContact, UserProfile } from '../types';
import { signUp, logIn, demoLogin, requestLocationAccess } from '../lib/auth';

interface AuthPageProps {
  onAuthSuccess: (profile: UserProfile) => void;
  onBackToLanding: () => void;
}

type Mode = 'login' | 'signup';

const emptyContact = (): EmergencyContact => ({
  id: `contact-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  name: '',
  relation: '',
  phone: '',
  isPrimary: false,
  sendSms: true,
});

export const AuthPage: React.FC<AuthPageProps> = ({ onAuthSuccess, onBackToLanding }) => {
  const [mode, setMode] = useState<Mode>('login');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDemoLoading, setIsDemoLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  // Login fields
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Signup fields
  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [gender, setGender] = useState<UserProfile['gender']>('Female');
  const [city, setCity] = useState('');
  const [bloodGroup, setBloodGroup] = useState('');
  const [agreedToTerms, setAgreedToTerms] = useState(false);

  const [locationStatus, setLocationStatus] = useState<'idle' | 'requesting' | 'granted' | 'denied'>('idle');
  const [lastKnownLocation, setLastKnownLocation] = useState<{ lat: number; lng: number } | null>(null);

  const [contacts, setContacts] = useState<EmergencyContact[]>([emptyContact()]);

  const updateContact = (id: string, patch: Partial<EmergencyContact>) => {
    setContacts((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  };

  const addContact = () => {
    if (contacts.length >= 5) return;
    setContacts((prev) => [...prev, emptyContact()]);
  };

  const removeContact = (id: string) => {
    setContacts((prev) => prev.filter((c) => c.id !== id));
  };

  const handleRequestLocation = async () => {
    setLocationStatus('requesting');
    const loc = await requestLocationAccess();
    if (loc) {
      setLastKnownLocation(loc);
      setLocationStatus('granted');
    } else {
      setLocationStatus('denied');
    }
  };

  const handleDemoLogin = async () => {
    setError(null);
    setIsDemoLoading(true);
    try {
      const profile = await demoLogin();
      onAuthSuccess(profile);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start demo. Please try again.');
    } finally {
      setIsDemoLoading(false);
    }
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const profile = await logIn(loginEmail, loginPassword);
      onAuthSuccess(profile);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSignupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanedContacts = contacts.filter((c) => c.name.trim() && c.phone.trim());

    if (!name.trim() || !age || !email.trim() || !phone.trim() || !city.trim()) {
      setError('Please fill in all required details.');
      return;
    }
    if (Number(age) < 13 || Number(age) > 100) {
      setError('Please enter a valid age.');
      return;
    }
    if (password.length < 6) {
      setError('Password should be at least 6 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (cleanedContacts.length === 0) {
      setError('Please add at least one emergency contact — this is who Safera alerts during an SOS.');
      return;
    }
    if (!agreedToTerms) {
      setError('Please agree to the safety terms to continue.');
      return;
    }

    // Ensure exactly one primary contact for the SOS flow.
    if (!cleanedContacts.some((c) => c.isPrimary)) {
      cleanedContacts[0].isPrimary = true;
    }

    setIsSubmitting(true);
    try {
      const profile = await signUp({
        name,
        age: Number(age),
        email,
        phone,
        password,
        gender,
        city,
        bloodGroup: bloodGroup || undefined,
        locationAccessGranted: locationStatus === 'granted',
        lastKnownLocation,
        emergencyContacts: cleanedContacts,
      });
      onAuthSuccess(profile);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign up failed. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const inputBaseClasses =
    'w-full pl-10 pr-4 py-2.5 rounded-xl border border-[#EFE6E1] bg-[#FCF7F1] text-sm text-[#31141E] placeholder:text-[#A99BA1] focus:outline-none focus:ring-2 focus:ring-[#8A1E41]/30 focus:border-[#8A1E41] transition-all';

  return (
    <div className="min-h-screen bg-[#FCF7F1] text-[#221F20] flex flex-col">
      {/* Simple top bar */}
      <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 pt-6 flex items-center justify-between">
        <button
          onClick={onBackToLanding}
          className="flex items-center gap-1.5 text-sm font-semibold text-[#825D6B] hover:text-[#8A1E41] transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Home
        </button>
        <GuardIaLogo size="sm" showText />
      </div>

      <div className="flex-1 flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-md bg-white rounded-[28px] shadow-[0_20px_60px_rgba(138,30,65,0.10)] border border-[#F2E5DE] p-6 sm:p-8">
          {/* Mode toggle */}
          <div className="grid grid-cols-2 gap-1 bg-[#FCF7F1] border border-[#EFE6E1] rounded-full p-1 mb-6">
            <button
              onClick={() => { setMode('login'); setError(null); }}
              className={`py-2 rounded-full text-sm font-semibold transition-all cursor-pointer ${
                mode === 'login' ? 'bg-[#8A1E41] text-white shadow-sm' : 'text-[#825D6B]'
              }`}
            >
              Log In
            </button>
            <button
              onClick={() => { setMode('signup'); setError(null); }}
              className={`py-2 rounded-full text-sm font-semibold transition-all cursor-pointer ${
                mode === 'signup' ? 'bg-[#8A1E41] text-white shadow-sm' : 'text-[#825D6B]'
              }`}
            >
              Sign Up
            </button>
          </div>

          <h2 className="text-2xl font-bold text-[#31141E] tracking-tight">
            {mode === 'login' ? 'Welcome back' : 'Create your Safera account'}
          </h2>
          <p className="text-sm text-[#825D6B] mt-1 mb-6">
            {mode === 'login'
              ? 'Log in to continue to your safety dashboard.'
              : 'Set up your profile and emergency contacts in under a minute.'}
          </p>

          {/* Demo login — always visible so it's a one-click way to explore */}
          <button
            onClick={handleDemoLogin}
            disabled={isDemoLoading}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-[#8A1E41]/30 bg-[#F7E5EC] text-[#8A1E41] font-semibold text-sm hover:bg-[#F2D8E3] transition-all cursor-pointer disabled:opacity-60 mb-5"
          >
            {isDemoLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            Try Demo Login (no signup needed)
          </button>

          <div className="flex items-center gap-3 mb-5">
            <div className="h-px flex-1 bg-[#EFE6E1]" />
            <span className="text-xs text-[#A99BA1] font-medium">
              {mode === 'login' ? 'or log in with email' : 'or create a real account'}
            </span>
            <div className="h-px flex-1 bg-[#EFE6E1]" />
          </div>

          {error && (
            <div className="mb-4 px-4 py-2.5 rounded-xl bg-[#FFF1F1] border border-[#F3C6C6] text-[#A70F43] text-xs font-medium">
              {error}
            </div>
          )}

          {mode === 'login' ? (
            <form onSubmit={handleLoginSubmit} className="space-y-4">
              <div className="relative">
                <Mail className="w-4 h-4 text-[#A99BA1] absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  required
                  placeholder="Email address"
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  className={inputBaseClasses}
                />
              </div>
              <div className="relative">
                <Lock className="w-4 h-4 text-[#A99BA1] absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  placeholder="Password"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  className={inputBaseClasses}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#A99BA1] cursor-pointer"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-3 rounded-xl bg-[#8A1E41] hover:bg-[#6D1533] text-white font-semibold text-sm shadow-sm transition-all cursor-pointer disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                Log In
              </button>

              <p className="text-center text-xs text-[#825D6B]">
                New to Safera?{' '}
                <button type="button" onClick={() => setMode('signup')} className="font-semibold text-[#8A1E41] cursor-pointer">
                  Create an account
                </button>
              </p>
            </form>
          ) : (
            <form onSubmit={handleSignupSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="relative col-span-2">
                  <User className="w-4 h-4 text-[#A99BA1] absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input required placeholder="Full name" value={name} onChange={(e) => setName(e.target.value)} className={inputBaseClasses} />
                </div>
                <div className="relative">
                  <Calendar className="w-4 h-4 text-[#A99BA1] absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input required type="number" min={13} max={100} placeholder="Age" value={age} onChange={(e) => setAge(e.target.value)} className={inputBaseClasses} />
                </div>
                <select
                  value={gender}
                  onChange={(e) => setGender(e.target.value as UserProfile['gender'])}
                  className="w-full px-3 py-2.5 rounded-xl border border-[#EFE6E1] bg-[#FCF7F1] text-sm text-[#31141E] focus:outline-none focus:ring-2 focus:ring-[#8A1E41]/30"
                >
                  <option>Female</option>
                  <option>Male</option>
                  <option>Non-binary</option>
                  <option>Prefer not to say</option>
                </select>
              </div>

              <div className="relative">
                <Mail className="w-4 h-4 text-[#A99BA1] absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input required type="email" placeholder="Email address" value={email} onChange={(e) => setEmail(e.target.value)} className={inputBaseClasses} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="relative">
                  <Phone className="w-4 h-4 text-[#A99BA1] absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input required placeholder="Phone number" value={phone} onChange={(e) => setPhone(e.target.value)} className={inputBaseClasses} />
                </div>
                <div className="relative">
                  <MapPin className="w-4 h-4 text-[#A99BA1] absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input required placeholder="City" value={city} onChange={(e) => setCity(e.target.value)} className={inputBaseClasses} />
                </div>
              </div>

              <input
                placeholder="Blood group (optional, helps in emergencies)"
                value={bloodGroup}
                onChange={(e) => setBloodGroup(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-[#EFE6E1] bg-[#FCF7F1] text-sm text-[#31141E] placeholder:text-[#A99BA1] focus:outline-none focus:ring-2 focus:ring-[#8A1E41]/30"
              />

              <div className="grid grid-cols-2 gap-3">
                <div className="relative">
                  <Lock className="w-4 h-4 text-[#A99BA1] absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input required type={showPassword ? 'text' : 'password'} placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputBaseClasses} />
                </div>
                <div className="relative">
                  <Lock className="w-4 h-4 text-[#A99BA1] absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input required type={showPassword ? 'text' : 'password'} placeholder="Confirm password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className={inputBaseClasses} />
                </div>
              </div>
              <button type="button" onClick={() => setShowPassword((s) => !s)} className="text-xs font-medium text-[#8A1E41] flex items-center gap-1 cursor-pointer -mt-2">
                {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                {showPassword ? 'Hide passwords' : 'Show passwords'}
              </button>

              {/* Location access */}
              <div className="rounded-xl border border-[#EFE6E1] bg-[#FCF7F1] p-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2.5">
                    <MapPin className="w-4 h-4 text-[#8A1E41] mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm font-semibold text-[#31141E]">Enable location access</p>
                      <p className="text-xs text-[#825D6B] mt-0.5">
                        Needed for live safety scores, safe routing and sharing your location during an SOS.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleRequestLocation}
                    disabled={locationStatus === 'requesting' || locationStatus === 'granted'}
                    className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold cursor-pointer transition-all ${
                      locationStatus === 'granted'
                        ? 'bg-green-100 text-green-700'
                        : 'bg-[#8A1E41] text-white hover:bg-[#6D1533]'
                    }`}
                  >
                    {locationStatus === 'requesting' && 'Requesting…'}
                    {locationStatus === 'granted' && 'Enabled ✓'}
                    {locationStatus === 'denied' && 'Retry'}
                    {locationStatus === 'idle' && 'Allow'}
                  </button>
                </div>
                {locationStatus === 'denied' && (
                  <p className="text-[11px] text-[#A70F43] mt-2">
                    Location wasn't granted — you can still sign up and enable it later from your device settings.
                  </p>
                )}
              </div>

              {/* Emergency contacts */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-semibold text-[#31141E] flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-[#8A1E41]" /> Emergency contacts
                  </p>
                  <button
                    type="button"
                    onClick={addContact}
                    disabled={contacts.length >= 5}
                    className="flex items-center gap-1 text-xs font-semibold text-[#8A1E41] disabled:opacity-40 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add contact
                  </button>
                </div>
                <p className="text-xs text-[#825D6B] mb-3">
                  These people will be alerted with your live location when you trigger SOS.
                </p>

                <div className="space-y-3">
                  {contacts.map((c, idx) => (
                    <div key={c.id} className="rounded-xl border border-[#EFE6E1] bg-[#FCF7F1] p-3 space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          placeholder="Name"
                          value={c.name}
                          onChange={(e) => updateContact(c.id, { name: e.target.value })}
                          className="px-3 py-2 rounded-lg border border-[#EFE6E1] bg-white text-xs focus:outline-none focus:ring-2 focus:ring-[#8A1E41]/30"
                        />
                        <input
                          placeholder="Relation (e.g. Mother)"
                          value={c.relation}
                          onChange={(e) => updateContact(c.id, { relation: e.target.value })}
                          className="px-3 py-2 rounded-lg border border-[#EFE6E1] bg-white text-xs focus:outline-none focus:ring-2 focus:ring-[#8A1E41]/30"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          placeholder="Phone number"
                          value={c.phone}
                          onChange={(e) => updateContact(c.id, { phone: e.target.value })}
                          className="flex-1 px-3 py-2 rounded-lg border border-[#EFE6E1] bg-white text-xs focus:outline-none focus:ring-2 focus:ring-[#8A1E41]/30"
                        />
                        <label className="flex items-center gap-1 text-[11px] text-[#825D6B] font-medium whitespace-nowrap cursor-pointer">
                          <input
                            type="radio"
                            name="primary-contact"
                            checked={c.isPrimary}
                            onChange={() =>
                              setContacts((prev) => prev.map((x) => ({ ...x, isPrimary: x.id === c.id })))
                            }
                          />
                          Primary
                        </label>
                        {contacts.length > 1 && (
                          <button type="button" onClick={() => removeContact(c.id)} className="text-[#A70F43] cursor-pointer">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <label className="flex items-start gap-2.5 text-xs text-[#825D6B] cursor-pointer">
                <input
                  type="checkbox"
                  checked={agreedToTerms}
                  onChange={(e) => setAgreedToTerms(e.target.checked)}
                  className="mt-0.5"
                />
                I agree to Safera's safety terms and consent to sharing my location with my emergency contacts during an SOS alert.
              </label>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-3 rounded-xl bg-[#8A1E41] hover:bg-[#6D1533] text-white font-semibold text-sm shadow-sm transition-all cursor-pointer disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                Create Account
              </button>

              <p className="text-center text-xs text-[#825D6B]">
                Already have an account?{' '}
                <button type="button" onClick={() => setMode('login')} className="font-semibold text-[#8A1E41] cursor-pointer">
                  Log in
                </button>
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};