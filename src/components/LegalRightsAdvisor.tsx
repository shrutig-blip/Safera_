import React, { useState } from 'react';
import { LegalRightsArticle } from '../types';
import { GuardIaLogo } from './GuardIaLogo';
import { EMERGENCY_HOTLINES } from '../data/mockData';
import {
  Sparkles,
  Scale,
  Search,
  CheckCircle2,
  FileText,
  HelpCircle,
  Link as LinkIcon,
  ShieldAlert,
  Phone,
} from 'lucide-react';

interface LegalRightsAdvisorProps {
  articles: LegalRightsArticle[];
}

interface AiSource {
  label: string;
  url?: string;
}

export const LegalRightsAdvisor: React.FC<LegalRightsAdvisorProps> = ({ articles }) => {
  const [userQuery, setUserQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [articleSearch, setArticleSearch] = useState('');
  const [isLoadingAi, setIsLoadingAi] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiLegalAdvice, setAiLegalAdvice] = useState<{
    topic: string;
    summary: string;
    keyRights: string[];
    actionSteps: string[];
    legalStatutes: string[];
    sources?: AiSource[];
  } | null>(null);

  const handleConsultAiLegalRights = async () => {
    if (!userQuery.trim()) return;
    setIsLoadingAi(true);
    setAiError(null);
    try {
      const res = await fetch('/api/ai/legal-rights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: userQuery,
          category: selectedCategory !== 'All' ? selectedCategory : 'Emergency Safety Rights',
        }),
      });
      if (!res.ok) throw new Error(`Server responded ${res.status}`);
      const data = await res.json();
      setAiLegalAdvice(data);
    } catch (err) {
      console.error(err);
      setAiError('Could not reach the AI legal advisor right now. Please check your connection and try again.');
    } finally {
      setIsLoadingAi(false);
    }
  };

  const categories = [
    'All',
    'Zero FIR & Emergency',
    'Women Safety',
    'Senior Citizens & Disability',
    'Bystander Protection',
  ];

  const filteredArticles = articles.filter((a) => {
    const matchesCategory = selectedCategory === 'All' || a.category === selectedCategory;
    if (!matchesCategory) return false;

    const q = articleSearch.trim().toLowerCase();
    if (!q) return true;
    return (
      a.title.toLowerCase().includes(q) ||
      a.summary.toLowerCase().includes(q) ||
      a.keyRights.some((kr) => kr.toLowerCase().includes(q)) ||
      a.statutes.some((st) => st.toLowerCase().includes(q))
    );
  });

  return (
    <div className="space-y-5">
      {/* Header Banner */}
      <div className="bg-white border border-[#E9D8DE] rounded-2xl p-4 sm:p-5 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center space-x-3">
            <GuardIaLogo size="sm" />
            <div>
              <div className="inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full bg-[#FFF0F3] text-[#A70F43] border border-[#E9D8DE] text-[10px] font-semibold mb-1">
                <Scale className="w-3 h-3 text-[#A70F43]" />
                <span>Instant AI Legal Protection Assistant</span>
              </div>
              <h2 className="text-base font-bold text-[#2F2B2D]">AI Legal Rights Advisor</h2>
              <p className="text-xs text-[#7B7280] mt-0.5">
                Know constitutional rights, Zero FIR rules, night detention procedures & disability protections.
              </p>
            </div>
          </div>
        </div>

        {/* Gemini AI Query Input Bar */}
        <div className="bg-[#FFF8F9] p-2.5 rounded-2xl border border-[#E9D8DE] space-y-2">
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Ask any legal rights question (e.g., 'What are my rights if police stop me at night?')..."
              value={userQuery}
              onChange={(e) => setUserQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleConsultAiLegalRights()}
              className="flex-1 bg-white border border-[#E9D8DE] rounded-xl px-3 py-2 text-xs text-[#2F2B2D] placeholder-[#7B7280]/60 focus:outline-none focus:border-[#A70F43]"
            />
            <button
              onClick={handleConsultAiLegalRights}
              disabled={isLoadingAi}
              className="px-4 py-2 rounded-xl bg-[#A70F43] hover:bg-[#8D0D39] text-white font-bold text-xs shadow-sm flex items-center gap-1.5 transition-all disabled:opacity-50 shrink-0 border border-[#8D0D39]"
            >
              <Sparkles className="w-4 h-4" />
              <span>{isLoadingAi ? 'Consulting AI...' : 'Ask AI'}</span>
            </button>
          </div>

          <div className="flex items-center space-x-2 text-[10px] text-[#7B7280] px-1 overflow-x-auto no-scrollbar">
            <span className="font-semibold text-[#2F2B2D] whitespace-nowrap">Suggested:</span>
            <button
              onClick={() => {
                setUserQuery('How to file a Zero FIR if police station refuses jurisdiction?');
              }}
              className="px-2 py-0.5 rounded bg-white hover:bg-[#FFF0F3] text-[#A70F43] whitespace-nowrap border border-[#E9D8DE] font-medium"
            >
              Zero FIR Rules
            </button>
            <button
              onClick={() => {
                setUserQuery('What are women rights during night police questioning?');
              }}
              className="px-2 py-0.5 rounded bg-white hover:bg-[#FFF0F3] text-[#A70F43] whitespace-nowrap border border-[#E9D8DE] font-medium"
            >
              Women Night Arrest Rights
            </button>
            <button
              onClick={() => {
                setUserQuery('What protections exist for senior citizens & wheelchair users in emergencies?');
              }}
              className="px-2 py-0.5 rounded bg-white hover:bg-[#FFF0F3] text-[#A70F43] whitespace-nowrap border border-[#E9D8DE] font-medium"
            >
              Elderly & Disability Rights
            </button>
          </div>
        </div>
      </div>

      {/* AI Advice Output Card */}
      {aiError && (
        <div className="bg-white border-2 border-amber-400 rounded-2xl p-4 shadow-md text-xs text-amber-800 flex items-center gap-2">
          <HelpCircle className="w-4 h-4 shrink-0" />
          <span>{aiError}</span>
        </div>
      )}
      {aiLegalAdvice && (
        <div className="bg-white border-2 border-[#A70F43] rounded-2xl p-4 shadow-md space-y-3">
          <div className="flex items-center justify-between border-b border-[#E9D8DE] pb-2">
            <h3 className="text-sm font-bold text-[#A70F43] flex items-center gap-2">
              <Sparkles className="w-4 h-4" />
              AI Legal Opinion: {aiLegalAdvice.topic}
            </h3>
          </div>

          {/* Disclaimer — an AI-generated legal summary is informational,
              not a substitute for a lawyer or official authority, and the
              old "Verified Legal Statutes Included" label overstated that.
              This replaces it with an accurate, always-visible caveat. */}
          <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl p-2.5 text-[10px] text-amber-800">
            <ShieldAlert className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>
              This is general legal information generated by AI, not legal advice from a lawyer. Laws and procedures
              can change — verify anything critical with an advocate, the sources below, or an official helpline.
            </span>
          </div>

          <p className="text-xs text-[#2F2B2D] leading-relaxed bg-[#FFF8F9] p-3 rounded-xl border border-[#E9D8DE]">
            {aiLegalAdvice.summary}
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            {/* Key Rights */}
            <div className="bg-[#FFF8F9] p-3 rounded-xl border border-[#E9D8DE] space-y-1.5">
              <span className="font-bold text-[#2F2B2D] flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-[#A70F43]" />
                Fundamental Legal Rights:
              </span>
              <ul className="space-y-1 text-[#2F2B2D]">
                {aiLegalAdvice.keyRights?.map((r, idx) => (
                  <li key={idx} className="flex items-start gap-1.5">
                    <span className="text-[#A70F43]">•</span>
                    <span>{r}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Action Steps */}
            <div className="bg-[#FFF8F9] p-3 rounded-xl border border-[#E9D8DE] space-y-1.5">
              <span className="font-bold text-[#2F2B2D] flex items-center gap-1.5">
                <FileText className="w-4 h-4 text-[#F2C94C]" />
                Immediate Action Steps:
              </span>
              <ul className="space-y-1 text-[#2F2B2D]">
                {aiLegalAdvice.actionSteps?.map((s, idx) => (
                  <li key={idx} className="flex items-start gap-1.5">
                    <span className="text-[#A70F43]">•</span>
                    <span>{s}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="flex items-center flex-wrap gap-2 text-[10px] text-[#7B7280] font-mono pt-1 border-t border-[#E9D8DE]">
            <span>Relevant Statutes:</span>
            {aiLegalAdvice.legalStatutes?.map((st, i) => (
              <span key={i} className="px-2 py-0.5 rounded bg-[#FFF8F9] text-[#A70F43] border border-[#E9D8DE] font-bold">
                {st}
              </span>
            ))}
          </div>

          {/* Sources — every answer should point back to a verifiable
              official document rather than asking the user to just trust
              the AI's summary. */}
          {aiLegalAdvice.sources && aiLegalAdvice.sources.length > 0 && (
            <div className="pt-1 border-t border-[#E9D8DE] space-y-1">
              <span className="text-[10px] font-bold text-[#7B7280] uppercase tracking-wider flex items-center gap-1">
                <LinkIcon className="w-3 h-3" />
                Sources
              </span>
              <ul className="space-y-1">
                {aiLegalAdvice.sources.map((src, i) => (
                  <li key={i} className="text-[10px] text-[#2F2B2D]">
                    {src.url ? (
                      <a
                        href={src.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[#A70F43] hover:underline font-medium"
                      >
                        {src.label}
                      </a>
                    ) : (
                      <span className="text-[#7B7280]">{src.label}</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Emergency Helplines — always visible, not just reachable via the
          Toolkit tab, since someone reading legal rights info may need a
          number immediately. Reuses the same EMERGENCY_HOTLINES data the
          Offline Toolkit already uses, so there's one source of truth
          instead of a second hardcoded list. */}
      <div className="bg-white border border-[#E9D8DE] rounded-2xl p-4 shadow-sm">
        <div className="flex items-center gap-2 border-b border-[#E9D8DE] pb-2 mb-2">
          <Phone className="w-4 h-4 text-[#A70F43]" />
          <span className="text-xs font-bold text-[#2F2B2D]">Emergency Helplines</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {EMERGENCY_HOTLINES.map((h) => (
            <a
              key={h.number}
              href={`tel:${h.number.split(' / ')[0]}`}
              className="flex items-center justify-between text-xs bg-[#FFF8F9] border border-[#E9D8DE] rounded-xl px-3 py-2 hover:border-[#A70F43] transition-colors"
            >
              <span className="text-[#2F2B2D] font-medium">{h.name}</span>
              <span className="font-mono font-bold text-[#A70F43]">{h.number}</span>
            </a>
          ))}
        </div>
      </div>

      {/* Category Tabs + Article Search */}
      <div className="space-y-2">
        <div className="flex space-x-1.5 overflow-x-auto no-scrollbar">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                selectedCategory === cat
                  ? 'bg-[#A70F43] text-white font-bold border border-[#8D0D39]'
                  : 'bg-white text-[#7B7280] border border-[#E9D8DE] hover:text-[#2F2B2D]'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        <div className="relative">
          <Search className="w-3.5 h-3.5 text-[#7B7280] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={articleSearch}
            onChange={(e) => setArticleSearch(e.target.value)}
            placeholder="Search saved rights articles by keyword or statute..."
            className="w-full bg-white border border-[#E9D8DE] rounded-xl pl-9 pr-3 py-2 text-xs text-[#2F2B2D] placeholder-[#7B7280]/60 focus:outline-none focus:border-[#A70F43]"
          />
        </div>
      </div>

      {/* Legal Articles Cards Directory */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filteredArticles.map((article) => (
          <div
            key={article.id}
            className="bg-white border border-[#E9D8DE] rounded-2xl p-4 shadow-sm space-y-3 hover:border-[#A70F43] transition-colors"
          >
            <div className="border-b border-[#E9D8DE] pb-2">
              <span className="text-[10px] uppercase font-mono font-bold text-[#A70F43] tracking-wider">
                {article.category}
              </span>
              <h3 className="text-sm font-bold text-[#2F2B2D] mt-0.5">{article.title}</h3>
            </div>

            <p className="text-xs text-[#7B7280] leading-relaxed">{article.summary}</p>

            <div className="space-y-1.5 text-xs">
              <span className="font-bold text-[#7B7280] uppercase text-[9px] tracking-wider">
                Key Protections:
              </span>
              {article.keyRights.map((kr, idx) => (
                <div key={idx} className="flex items-start gap-1.5 text-[#2F2B2D]">
                  <CheckCircle2 className="w-3.5 h-3.5 text-[#A70F43] shrink-0 mt-0.5" />
                  <span>{kr}</span>
                </div>
              ))}
            </div>

            <div className="pt-2 border-t border-[#E9D8DE] flex flex-wrap gap-1">
              {article.statutes.map((st, i) => (
                <span key={i} className="text-[9px] font-mono px-2 py-0.5 rounded bg-[#FFF8F9] text-[#A70F43] border border-[#E9D8DE] font-bold">
                  {st}
                </span>
              ))}
            </div>
          </div>
        ))}

        {filteredArticles.length === 0 && (
          <div className="md:col-span-2 text-center text-xs text-[#7B7280] py-6">
            No saved articles match "{articleSearch}" in this category.
          </div>
        )}
      </div>
    </div>
  );
};
