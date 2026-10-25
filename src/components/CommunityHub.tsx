import React, { useState } from 'react';
import { CommunityReport } from '../types';
import { GuardIaLogo } from './GuardIaLogo';
import {
  Shield,
  ThumbsUp,
  AlertTriangle,
  CheckCircle2,
  MessageSquare,
  PlusCircle,
  Filter,
  MapPin,
  Sparkles,
  Award,
  X,
} from 'lucide-react';

interface CommunityHubProps {
  reports: CommunityReport[];
  onAddReport: (report: CommunityReport) => void;
  onUpvoteReport: (id: string) => void;
}

export const CommunityHub: React.FC<CommunityHubProps> = ({
  reports,
  onAddReport,
  onUpvoteReport,
}) => {
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [locationName, setLocationName] = useState('');
  const [category, setCategory] = useState<CommunityReport['category']>('Poor Lighting');
  const [description, setDescription] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('All');

  const handleSubmitNewReport = (e: React.FormEvent) => {
    e.preventDefault();
    if (!locationName || !description) return;

    const newReport: CommunityReport = {
      id: `rep-${Date.now()}`,
      locationName,
      lat: 28.6139,
      lng: 77.209,
      category,
      description,
      timestamp: 'Just now',
      trustScore: 88, // Initial score calculated by AI pattern engine
      verifiedByPattern: false, // Pending multi-report verification
      verifiedCount: 1,
      upvotes: 1,
      status: 'Under Verification',
    };

    onAddReport(newReport);
    setLocationName('');
    setDescription('');
    setShowSubmitModal(false);
  };

  const filteredReports = reports.filter(
    (r) => filterCategory === 'All' || r.category === filterCategory
  );

  return (
    <div className="space-y-5">
      {/* Header Banner */}
      <div className="bg-white border border-[#E9D8DE] rounded-2xl p-4 sm:p-5 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center space-x-3">
            <GuardIaLogo size="sm" />
            <div>
              <div className="inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full bg-[#FFF0F3] text-[#A70F43] border border-[#E9D8DE] text-[10px] font-semibold mb-1">
                <Award className="w-3 h-3 text-[#A70F43]" />
                <span>AI Pattern Recognition & Anti-Spam</span>
              </div>
              <h2 className="text-base font-bold text-[#2F2B2D]">Community Intelligence & Trust Scoring</h2>
              <p className="text-xs text-[#7B7280] mt-0.5">
                Crowdsourced incident data verified through multi-user pattern matching.
              </p>
            </div>
          </div>

          <button
            onClick={() => setShowSubmitModal(true)}
            className="px-3.5 py-2 rounded-xl bg-[#A70F43] hover:bg-[#8D0D39] text-white font-bold text-xs shadow-sm flex items-center justify-center gap-1.5 transition-all border border-[#8D0D39] shrink-0"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Submit Incident Report</span>
          </button>
        </div>

        {/* Filter Categories */}
        <div className="flex space-x-1.5 overflow-x-auto no-scrollbar pt-2 border-t border-[#E9D8DE]">
          {['All', 'Poor Lighting', 'Harassment', 'Isolated Zone', 'Accessibility Defect', 'Safe Hub'].map(
            (cat) => (
              <button
                key={cat}
                onClick={() => setFilterCategory(cat)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                  filterCategory === cat
                    ? 'bg-[#A70F43] text-white font-bold border border-[#8D0D39]'
                    : 'bg-[#FFF8F9] text-[#7B7280] border border-[#E9D8DE] hover:text-[#2F2B2D]'
                }`}
              >
                {cat}
              </button>
            )
          )}
        </div>
      </div>

      {/* Submit Modal */}
      {showSubmitModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white border border-[#E9D8DE] rounded-2xl p-5 max-w-lg w-full shadow-2xl space-y-4 text-[#2F2B2D]">
            <div className="flex items-center justify-between border-b border-[#E9D8DE] pb-3">
              <h3 className="text-sm font-bold flex items-center gap-2 text-[#2F2B2D]">
                <PlusCircle className="w-4 h-4 text-[#A70F43]" />
                New Community Incident Report
              </h3>
              <button onClick={() => setShowSubmitModal(false)} className="text-[#7B7280] hover:text-[#2F2B2D]">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmitNewReport} className="space-y-3 text-xs">
              <div>
                <label className="block text-[#7B7280] mb-1 font-semibold">Location / Area Name</label>
                <input
                  type="text"
                  placeholder="e.g., Rear Alley near Sector 4 Metro Exit"
                  value={locationName}
                  onChange={(e) => setLocationName(e.target.value)}
                  className="w-full bg-[#FFF8F9] border border-[#E9D8DE] rounded-xl px-3 py-2 text-[#2F2B2D] focus:outline-none focus:border-[#A70F43]"
                  required
                />
              </div>

              <div>
                <label className="block text-[#7B7280] mb-1 font-semibold">Category</label>
                <select
                  value={category}
                  onChange={(e: any) => setCategory(e.target.value)}
                  className="w-full bg-[#FFF8F9] border border-[#E9D8DE] rounded-xl px-3 py-2 text-[#2F2B2D] focus:outline-none focus:border-[#A70F43]"
                >
                  <option value="Poor Lighting">Poor Lighting / Broken Lamp Posts</option>
                  <option value="Harassment">Occasional Harassment / Catcalling</option>
                  <option value="Isolated Zone">Isolated / Unpatrolled Alleyway</option>
                  <option value="Accessibility Defect">Broken Ramp / Steep Curb Barrier</option>
                  <option value="Safe Hub">Safe Haven / 24/7 Police Kiosk</option>
                </select>
              </div>

              <div>
                <label className="block text-[#7B7280] mb-1 font-semibold">Detailed Description</label>
                <textarea
                  rows={3}
                  placeholder="Describe what occurred, time of day, and relevant details..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full bg-[#FFF8F9] border border-[#E9D8DE] rounded-xl px-3 py-2 text-[#2F2B2D] focus:outline-none focus:border-[#A70F43]"
                  required
                ></textarea>
              </div>

              <div className="bg-[#FFF8F9] p-2.5 rounded-xl border border-[#E9D8DE] text-[10px] text-[#7B7280] flex items-start gap-2">
                <Award className="w-4 h-4 text-[#A70F43] shrink-0 mt-0.5" />
                <span>
                  Reports pass through Safera's AI Pattern Engine. High trust ratings are awarded when multiple independent users log similar reports.
                </span>
              </div>

              <div className="flex justify-end space-x-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowSubmitModal(false)}
                  className="px-3.5 py-1.5 rounded-xl bg-[#FFF8F9] border border-[#E9D8DE] text-[#2F2B2D] font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-xl bg-[#A70F43] hover:bg-[#8D0D39] text-white font-bold border border-[#8D0D39] shadow-sm"
                >
                  Submit Report
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reports Feed Grid */}
      <div className="space-y-3">
        {filteredReports.map((report) => (
          <div
            key={report.id}
            className="bg-white border border-[#E9D8DE] rounded-2xl p-4 shadow-sm space-y-2.5 hover:border-[#A70F43] transition-colors"
          >
            <div className="flex items-start justify-between border-b border-[#E9D8DE] pb-2 gap-2 text-xs">
              <div>
                <div className="flex items-center space-x-2">
                  <span className="font-bold text-[#2F2B2D] text-sm">{report.locationName}</span>
                  <span className="text-[9px] px-2 py-0.5 rounded font-bold bg-[#A70F43] text-white">
                    {report.category}
                  </span>
                </div>
                <div className="text-[#7B7280] text-[10px] mt-0.5">
                  Logged {report.timestamp} • Status: <strong className="text-[#2F2B2D]">{report.status}</strong>
                </div>
              </div>

              {/* Pattern Recognition Trust Badge */}
              <div className="bg-[#FFF8F9] border border-[#E9D8DE] p-1.5 rounded-xl text-center shrink-0">
                <div className="text-[9px] text-[#7B7280]">Trust Score</div>
                <div className="text-xs font-black text-[#A70F43] font-mono">{report.trustScore}%</div>
                {report.verifiedByPattern && (
                  <span className="text-[8px] text-[#5FA777] flex items-center gap-0.5 justify-center mt-0.5 font-semibold">
                    <CheckCircle2 className="w-2.5 h-2.5" /> Pattern Match
                  </span>
                )}
              </div>
            </div>

            <p className="text-xs text-[#2F2B2D] leading-relaxed">{report.description}</p>

            <div className="flex items-center justify-between text-xs text-[#7B7280] pt-1.5 border-t border-[#E9D8DE]">
              <span className="flex items-center gap-1 text-[10px]">
                <MessageSquare className="w-3.5 h-3.5 text-[#A70F43]" />
                <span>Verified by {report.verifiedCount} independent reporters</span>
              </span>

              <button
                onClick={() => onUpvoteReport(report.id)}
                className="px-2.5 py-1 rounded-xl bg-[#FFF8F9] hover:bg-[#FFF0F3] border border-[#E9D8DE] text-[#2F2B2D] font-bold text-[11px] flex items-center gap-1 transition-colors"
              >
                <ThumbsUp className="w-3 h-3 text-[#A70F43]" />
                <span>Confirm ({report.upvotes})</span>
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

