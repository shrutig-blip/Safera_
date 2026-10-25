import React, { useState } from 'react';
import { motion } from 'motion/react';
import {
  Menu,
  X,
  ArrowRight,
  Github,
  PlayCircle,
  Sparkles,
  MapPin,
  Bell,
  ShieldCheck,
  Navigation2,
  Siren,
  Lock,
  Bot,
  Users,
  Scale,
  Accessibility,
  Watch,
  Wifi,
  Clock,
  Zap,
  Star,
} from 'lucide-react';
import { GuardIaLogo } from './GuardIaLogo';

interface LandingPageProps {
  onGetStarted: () => void;
  onWatchDemo: () => void;
}

const navLinks = [
  { id: 'home', label: 'Home' },
  { id: 'features', label: 'Features' },
  { id: 'how-it-works', label: 'How It Works' },
  { id: 'about', label: 'About Us' },
  { id: 'contact', label: 'Contact' },
];

const fadeUp = {
  hidden: { opacity: 0, y: 28 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: 'easeOut' as const } },
};

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.1 } },
};

const stats = [
  { icon: ShieldCheck, value: '95%', label: 'Prediction Accuracy' },
  { icon: Clock, value: '24/7', label: 'AI Monitoring' },
  { icon: Zap, value: '< 2 sec', label: 'SOS Response' },
  { icon: Users, value: '10+', label: 'Integrated Features' },
  { icon: Wifi, value: 'Offline', label: 'Works Anywhere' },
];

const features = [
  {
    icon: MapPin,
    title: 'AI Safety Mapper',
    desc: 'Real-time risk analysis using AI, crime data, weather & crowd density.',
  },
  {
    icon: Navigation2,
    title: 'Smart Navigation',
    desc: 'AI-powered safest routes with live updates and lit, monitored paths.',
  },
  {
    icon: Siren,
    title: 'Emergency Toolkit',
    desc: 'Siren, fake call, flashlight, voice alert & offline SOS fallback.',
  },
  {
    icon: Lock,
    title: 'Evidence Vault',
    desc: 'Securely stores encrypted audio, video & photo evidence in the cloud.',
  },
  {
    icon: Bot,
    title: 'AI Safety Companion',
    desc: 'Voice-guided support and a conversational safety check whenever you need it.',
  },
  {
    icon: Users,
    title: 'Live Location Sharing',
    desc: 'Share your live location and route in real time with trusted contacts.',
  },
  {
    icon: Watch,
    title: 'Vitals & Fall Detection',
    desc: 'Wearable-linked heart rate, stress spikes, shake & fall detection.',
  },
  {
    icon: Scale,
    title: 'Legal Rights Advisor',
    desc: 'Instant guidance on FIRs, police interactions & know-your-rights.',
  },
  {
    icon: Accessibility,
    title: 'Accessibility Mapper',
    desc: 'Ramp access, step-free entries & sidewalk audits for every commuter.',
  },
];

const steps = [
  {
    title: 'Create your safety profile',
    desc: 'Sign up in a minute with your details and add the emergency contacts Safera should alert.',
  },
  {
    title: 'Let Safera learn your surroundings',
    desc: 'Enable location access so the AI Safety Mapper can score routes and areas around you live.',
  },
  {
    title: 'Move with confidence',
    desc: 'Get safe route guidance, and trigger SOS instantly — online or offline — whenever you need it.',
  },
];

export const LandingPage: React.FC<LandingPageProps> = ({ onGetStarted, onWatchDemo }) => {
  const [menuOpen, setMenuOpen] = useState(false);

  const scrollTo = (id: string) => {
    setMenuOpen(false);
    if (id === 'home') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="min-h-screen bg-[#FCF7F1] text-[#221F20] overflow-x-hidden">
      {/* Sticky Nav */}
      <header className="sticky top-0 z-50 bg-[#FCF7F1]/90 backdrop-blur-md border-b border-[#F2E5DE]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <GuardIaLogo size="sm" showText />

          <nav className="hidden lg:flex items-center gap-1">
            {navLinks.map((link) => (
              <button
                key={link.id}
                onClick={() => scrollTo(link.id)}
                className={`px-4 py-2 rounded-full text-sm font-semibold transition-all cursor-pointer ${
                  link.id === 'home' ? 'bg-[#F7E5EC] text-[#8A1E41]' : 'text-[#31141E] hover:text-[#8A1E41]'
                }`}
              >
                {link.label}
              </button>
            ))}
          </nav>

          <div className="hidden sm:flex items-center gap-3">
            <a
              href="https://github.com/shreyabyte/Safera"
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 px-4 py-2 rounded-full border border-[#EFE6E1] bg-white text-sm font-semibold text-[#31141E] hover:border-[#8A1E41]/40 transition-all"
            >
              <Github className="w-4 h-4" /> GitHub
            </a>
            <button
              onClick={onGetStarted}
              className="flex items-center gap-1.5 px-5 py-2 rounded-full bg-[#8A1E41] hover:bg-[#6D1533] text-white text-sm font-semibold shadow-sm transition-all cursor-pointer"
            >
              Get Started <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          <button className="lg:hidden text-[#31141E] cursor-pointer" onClick={() => setMenuOpen((s) => !s)}>
            {menuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>

        {menuOpen && (
          <div className="lg:hidden border-t border-[#F2E5DE] bg-[#FCF7F1] px-4 py-3 space-y-1">
            {navLinks.map((link) => (
              <button
                key={link.id}
                onClick={() => scrollTo(link.id)}
                className="block w-full text-left px-3 py-2.5 rounded-lg text-sm font-semibold text-[#31141E] hover:bg-[#F7E5EC] hover:text-[#8A1E41] cursor-pointer"
              >
                {link.label}
              </button>
            ))}
            <button
              onClick={onGetStarted}
              className="w-full mt-2 py-2.5 rounded-full bg-[#8A1E41] text-white text-sm font-semibold cursor-pointer"
            >
              Get Started
            </button>
          </div>
        )}
      </header>

      {/* Hero */}
      <section id="home" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-14 sm:pt-20 pb-16 grid lg:grid-cols-2 gap-12 items-center">
        <motion.div initial="hidden" animate="show" variants={stagger}>
          <motion.div variants={fadeUp} className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#F7E5EC] text-[#8A1E41] text-xs font-semibold mb-6">
            <Sparkles className="w-3.5 h-3.5" /> AI-Powered • Women Safety • Smart Protection
          </motion.div>

          <motion.h1 variants={fadeUp} className="text-5xl sm:text-6xl font-extrabold tracking-tight leading-[1.05]">
            Your Safety.
            <br />
            Our{' '}
            <span className="text-[#8A1E41] relative">
              Priority.
              <svg className="absolute -bottom-2 left-0 w-full" height="10" viewBox="0 0 200 10" preserveAspectRatio="none">
                <path d="M2 7 Q 50 1, 100 6 T 198 5" stroke="#8A1E41" strokeWidth="4" fill="none" strokeLinecap="round" />
              </svg>
            </span>
          </motion.h1>

          <motion.p variants={fadeUp} className="mt-6 text-base sm:text-lg text-[#6E676A] max-w-lg leading-relaxed">
            Safera is your AI-powered safety companion that predicts risks, guides you with safe routes, and stands by you in every situation — online or offline.
          </motion.p>

          <motion.div variants={fadeUp} className="mt-8 flex flex-wrap items-center gap-3">
            <button
              onClick={onGetStarted}
              className="flex items-center gap-2 px-6 py-3.5 rounded-full bg-[#8A1E41] hover:bg-[#6D1533] text-white font-semibold text-sm shadow-lg shadow-[#8A1E41]/25 active:scale-95 transition-all cursor-pointer"
            >
              Explore Safera <ArrowRight className="w-4 h-4" />
            </button>
            <button
              onClick={onWatchDemo}
              className="flex items-center gap-2 px-6 py-3.5 rounded-full bg-white border border-[#EFE6E1] text-[#31141E] font-semibold text-sm hover:border-[#8A1E41]/30 active:scale-95 transition-all cursor-pointer"
            >
              <PlayCircle className="w-4 h-4" /> Watch Demo
            </button>
          </motion.div>

          <motion.div variants={fadeUp} className="mt-9 flex items-center gap-3">
            <div className="flex -space-x-3">
              {['#F2C5D6', '#E8B4C8', '#D99BB8', '#C982A8'].map((c, i) => (
                <div key={i} className="w-9 h-9 rounded-full border-2 border-[#FCF7F1]" style={{ background: c }} />
              ))}
            </div>
            <p className="text-sm text-[#6E676A]">
              <span className="font-bold text-[#31141E]">Trusted by 10K+ users</span> across India ❤️
            </p>
          </motion.div>
        </motion.div>

        {/* Dashboard preview card */}
        <motion.div
          initial={{ opacity: 0, scale: 0.94, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.7, ease: 'easeOut', delay: 0.15 }}
          className="relative"
        >
          <div className="absolute -inset-6 bg-[radial-gradient(circle_at_top,rgba(138,30,65,0.10),transparent_65%)] -z-10" />
          <div className="bg-white rounded-[28px] shadow-[0_24px_70px_rgba(138,30,65,0.14)] border border-[#F2E5DE] p-5 sm:p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="font-bold text-[#31141E] text-lg flex items-center gap-1.5">Good evening, Shreya 👋</p>
                <p className="text-xs text-[#825D6B]">Stay Safe with Safera</p>
              </div>
              <button
                onClick={onGetStarted}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#8A1E41] text-white text-xs font-semibold"
              >
                <Bell className="w-3.5 h-3.5" /> SOS Alert
              </button>
            </div>

            <div className="rounded-2xl bg-gradient-to-br from-[#FBE1EA] to-[#F7E5EC] p-4 flex items-center justify-between mb-4">
              <div>
                <p className="text-[11px] font-semibold text-[#8A1E41] mb-1">CURRENT SAFETY SCORE</p>
                <p className="text-3xl font-extrabold text-[#31141E]">
                  92<span className="text-sm font-semibold text-[#825D6B]">/100</span>
                </p>
                <span className="inline-block mt-1 px-2 py-0.5 rounded-full bg-white text-[10px] font-semibold text-green-700">
                  Safe Zone
                </span>
              </div>
              <div className="relative w-16 h-16 rounded-full border-[6px] border-[#8A1E41] flex items-center justify-center">
                <ShieldCheck className="w-6 h-6 text-[#8A1E41]" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {[
                { icon: Navigation2, label: 'Safe Navigation' },
                { icon: Users, label: 'Share Location' },
                { icon: Bot, label: 'AI Companion' },
                { icon: Siren, label: 'Emergency Toolkit' },
              ].map((item) => (
                <div key={item.label} className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-[#FCF7F1] border border-[#F2E5DE] text-xs font-semibold text-[#31141E]">
                  <item.icon className="w-4 h-4 text-[#8A1E41]" /> {item.label}
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      </section>

      {/* Stats strip */}
      <motion.section
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, amount: 0.4 }}
        variants={stagger}
        className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-16"
      >
        <div className="bg-white rounded-3xl border border-[#F2E5DE] shadow-[0_10px_40px_rgba(138,30,65,0.06)] px-4 sm:px-8 py-6 grid grid-cols-2 sm:grid-cols-5 gap-6">
          {stats.map((s) => (
            <motion.div key={s.label} variants={fadeUp} className="flex flex-col items-center text-center gap-2">
              <div className="w-11 h-11 rounded-full bg-[#F7E5EC] flex items-center justify-center">
                <s.icon className="w-5 h-5 text-[#8A1E41]" />
              </div>
              <p className="text-lg font-extrabold text-[#31141E]">{s.value}</p>
              <p className="text-[11px] font-medium text-[#825D6B] leading-tight">{s.label}</p>
            </motion.div>
          ))}
        </div>
      </motion.section>

      {/* Features */}
      <section id="features" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-20">
        <motion.div initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.3 }} variants={stagger} className="text-center mb-12">
          <motion.div variants={fadeUp} className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#F7E5EC] text-[#8A1E41] text-xs font-semibold mb-4">
            <Sparkles className="w-3.5 h-3.5" /> Powerful Features
          </motion.div>
          <motion.h2 variants={fadeUp} className="text-3xl sm:text-4xl font-extrabold tracking-tight">
            Everything You Need. <span className="text-[#8A1E41]">One App.</span>
          </motion.h2>
          <motion.p variants={fadeUp} className="mt-3 text-[#6E676A] max-w-2xl mx-auto">
            Safera combines intelligent technology with human-centric design to keep you safe, informed, and empowered.
          </motion.p>
        </motion.div>

        <motion.div
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.15 }}
          variants={stagger}
          className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5"
        >
          {features.map((f) => (
            <motion.div
              key={f.title}
              variants={fadeUp}
              whileHover={{ y: -4 }}
              className="bg-white rounded-2xl border border-[#F2E5DE] p-6 shadow-[0_8px_30px_rgba(138,30,65,0.05)] transition-shadow hover:shadow-[0_16px_40px_rgba(138,30,65,0.12)]"
            >
              <div className="w-11 h-11 rounded-xl bg-[#F7E5EC] flex items-center justify-center mb-4">
                <f.icon className="w-5 h-5 text-[#8A1E41]" />
              </div>
              <h3 className="font-bold text-[#31141E] mb-1.5">{f.title}</h3>
              <p className="text-sm text-[#6E676A] leading-relaxed">{f.desc}</p>
            </motion.div>
          ))}
        </motion.div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="bg-white border-y border-[#F2E5DE] py-20">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.4 }} variants={stagger} className="text-center mb-14">
            <motion.h2 variants={fadeUp} className="text-3xl sm:text-4xl font-extrabold tracking-tight">
              How It <span className="text-[#8A1E41]">Works</span>
            </motion.h2>
            <motion.p variants={fadeUp} className="mt-3 text-[#6E676A]">Three simple steps to a safer everyday.</motion.p>
          </motion.div>

          <motion.div initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.2 }} variants={stagger} className="grid sm:grid-cols-3 gap-8 relative">
            {steps.map((step, i) => (
              <motion.div key={step.title} variants={fadeUp} className="relative text-center sm:text-left">
                <div className="w-12 h-12 rounded-2xl bg-[#8A1E41] text-white font-extrabold flex items-center justify-center mx-auto sm:mx-0 mb-4">
                  {i + 1}
                </div>
                <h3 className="font-bold text-[#31141E] mb-2">{step.title}</h3>
                <p className="text-sm text-[#6E676A] leading-relaxed">{step.desc}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* About */}
      <section id="about" className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-20 text-center">
        <motion.div initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.4 }} variants={stagger}>
          <motion.div variants={fadeUp} className="flex items-center justify-center gap-1 text-[#8A1E41] mb-4">
            {[...Array(5)].map((_, i) => <Star key={i} className="w-4 h-4 fill-[#8A1E41]" />)}
          </motion.div>
          <motion.h2 variants={fadeUp} className="text-3xl sm:text-4xl font-extrabold tracking-tight mb-4">
            Built for real safety, not just an app.
          </motion.h2>
          <motion.p variants={fadeUp} className="text-[#6E676A] leading-relaxed max-w-2xl mx-auto">
            Safera was built with one goal — to give every person, especially women commuting alone, a companion that actively watches out for them: predicting risk before it happens, guiding safer paths, and reaching help in seconds when it matters most.
          </motion.p>
        </motion.div>
      </section>

      {/* CTA Banner */}
      <section id="contact" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-16">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ duration: 0.6 }}
          className="rounded-[28px] bg-gradient-to-r from-[#6D1533] to-[#8A1E41] px-6 sm:px-10 py-8 sm:py-10 flex flex-col sm:flex-row items-center justify-between gap-6 text-white"
        >
          <div className="flex items-center gap-4 text-center sm:text-left">
            <div className="hidden sm:flex w-12 h-12 rounded-2xl bg-white/15 items-center justify-center shrink-0">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <p className="text-lg sm:text-xl font-bold">Every journey matters. Make it a safe one.</p>
              <p className="text-sm text-white/80 mt-1">Join thousands of smart, confident women who choose Safera every day.</p>
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={onGetStarted}
              className="px-5 py-2.5 rounded-full bg-white text-[#8A1E41] font-semibold text-sm hover:bg-[#FCF7F1] transition-all cursor-pointer"
            >
              Create Free Account
            </button>
            <button
              onClick={() => scrollTo('features')}
              className="px-5 py-2.5 rounded-full border border-white/40 text-white font-semibold text-sm hover:bg-white/10 transition-all cursor-pointer flex items-center gap-1.5"
            >
              Explore Features <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </motion.div>
      </section>

      {/* Footer */}
      <footer className="border-t border-[#EFE6E1] bg-white py-8 text-center text-xs text-[#6E676A]">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <GuardIaLogo size="sm" showText={false} />
            <span className="font-semibold text-[#221F20]">Safera Personal Safety & Accessibility System</span>
          </div>
          <div className="text-[#6E676A]">© {new Date().getFullYear()} Safera. Stay Safe, Always.</div>
        </div>
      </footer>
    </div>
  );
};