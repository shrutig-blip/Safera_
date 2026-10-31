import React, { useState, useEffect, useRef } from 'react';
import { EvidenceItem } from '../types';
import { shareEvidence, ShareEvidenceResult } from '../lib/shareEvidence';
import {
  X,
  Share2,
  ShieldAlert,
  Loader2,
  Copy,
  Check,
  Clock,
  ExternalLink,
  MessageCircle,
} from 'lucide-react';

interface ShareEvidenceModalProps {
  item: EvidenceItem | null;
  onClose: () => void;
}

export const ShareEvidenceModal: React.FC<ShareEvidenceModalProps> = ({ item, onClose }) => {
  const [ttlMinutes, setTtlMinutes] = useState<number>(1440); // 24 hours default
  const [blurFaces, setBlurFaces] = useState<boolean>(false);
  const [consentChecked, setConsentChecked] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ShareEvidenceResult | null>(null);
  const [copied, setCopied] = useState<boolean>(false);

  const linkInputRef = useRef<HTMLInputElement>(null);

  // Reset state whenever the modal opens or item changes
  useEffect(() => {
    setTtlMinutes(1440);
    setBlurFaces(false);
    setConsentChecked(false);
    setIsLoading(false);
    setError(null);
    setResult(null);
    setCopied(false);
  }, [item]);

  if (!item) return null;

  const handleCreateShareLink = async () => {
    if (!consentChecked || isLoading) return;
    setIsLoading(true);
    setError(null);

    try {
      const res = await shareEvidence({
        item,
        ttlMinutes,
        blurFaces,
      });
      setResult(res);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('An unexpected error occurred while creating the share link.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyLink = async () => {
    if (!result?.link) return;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(result.link);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
        return;
      }
    } catch {
      // Fall through to input selection
    }

    try {
      if (linkInputRef.current) {
        linkInputRef.current.select();
        linkInputRef.current.setSelectionRange(0, 99999);
        document.execCommand('copy');
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch {
      // Ignore copy error
    }
  };

  const handleNativeShare = async () => {
    if (!result?.link || typeof navigator === 'undefined' || !navigator.share) return;
    try {
      await navigator.share({
        title: item.title,
        text: `Evidence from Safera: ${item.title}`,
        url: result.link,
      });
    } catch {
      // User cancelled or share dismissed
    }
  };

  const formatExpiry = (isoString: string): string => {
    try {
      const date = new Date(isoString);
      if (isNaN(date.getTime())) return isoString;
      return date.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      });
    } catch {
      return isoString;
    }
  };

  const canNativeShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  const whatsappUrl = result?.link
    ? `https://wa.me/?text=${encodeURIComponent(`Evidence from Safera: ${result.link}`)}`
    : '';

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white border border-[#E9D8DE] rounded-2xl p-5 max-w-lg w-full shadow-2xl space-y-4 text-[#2F2B2D] max-h-[90vh] overflow-y-auto my-auto">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-[#E9D8DE] pb-3">
          <h3 className="text-sm font-bold flex items-center gap-2 text-[#2F2B2D]">
            <Share2 className="w-4 h-4 text-[#A70F43]" />
            Share Evidence Copy
          </h3>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-[#7B7280] hover:text-[#2F2B2D] p-1 rounded-lg hover:bg-[#FFF8F9] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Item Summary Details */}
        <div className="p-3 bg-[#FFF8F9] rounded-xl border border-[#E9D8DE] space-y-1.5 text-xs">
          <div className="flex items-center justify-between gap-2">
            <span className="font-bold text-[#2F2B2D] truncate">{item.title}</span>
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#A70F43] text-white font-mono font-bold shrink-0">
              {item.type.toUpperCase()}
            </span>
          </div>
          <div className="text-[10px] text-[#7B7280]">
            {item.timestamp} • {item.locationName}
          </div>
        </div>

        {/* Privacy Warning */}
        <div className="bg-[#FFF0F3] border border-[#E9D8DE] rounded-xl p-3 flex items-start gap-2.5 text-xs text-[#2F2B2D]">
          <ShieldAlert className="w-4 h-4 text-[#A70F43] shrink-0 mt-0.5" />
          <p className="text-[11px] leading-relaxed">
            A share copy is <strong>NOT encrypted</strong>. Anyone with the link can view it until it expires. Your private vault copy stays encrypted.
          </p>
        </div>

        {/* Form State (Before Link Creation) */}
        {!result ? (
          <div className="space-y-3.5 text-xs">
            {/* Expiry Selector */}
            <div>
              <label className="block text-[#7B7280] mb-1 font-semibold flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-[#A70F43]" />
                Link Expiration
              </label>
              <select
                value={ttlMinutes}
                onChange={(e) => setTtlMinutes(Number(e.target.value))}
                disabled={isLoading}
                className="w-full bg-[#FFF8F9] border border-[#E9D8DE] rounded-xl px-3 py-2 text-[#2F2B2D] focus:outline-none focus:border-[#A70F43] font-medium"
              >
                <option value={60}>1 hour</option>
                <option value={1440}>24 hours (default)</option>
                <option value={4320}>3 days</option>
                <option value={10080}>7 days</option>
              </select>
            </div>

            {/* Bystander Face Blurring (Photos only) */}
            {item.type === 'photo' && (
              <label className="flex items-start gap-2.5 p-2.5 bg-[#FFF8F9] rounded-xl border border-[#E9D8DE] cursor-pointer hover:border-[#A70F43] transition-colors">
                <input
                  type="checkbox"
                  checked={blurFaces}
                  onChange={(e) => setBlurFaces(e.target.checked)}
                  disabled={isLoading}
                  className="mt-0.5 accent-[#A70F43] w-4 h-4 rounded"
                />
                <span className="text-[11px] text-[#2F2B2D] leading-tight">
                  <strong>Blur faces of bystanders</strong> (automatically detects and blurs visible faces in the photo)
                </span>
              </label>
            )}

            {/* Required Consent Checkbox */}
            <label className="flex items-start gap-2.5 p-2.5 bg-[#FFF8F9] rounded-xl border border-[#E9D8DE] cursor-pointer hover:border-[#A70F43] transition-colors">
              <input
                type="checkbox"
                checked={consentChecked}
                onChange={(e) => setConsentChecked(e.target.checked)}
                disabled={isLoading}
                className="mt-0.5 accent-[#A70F43] w-4 h-4 rounded"
              />
              <span className="text-[11px] font-semibold text-[#2F2B2D] leading-tight">
                I understand this copy is shared unencrypted and I choose to share it.
              </span>
            </label>

            {/* Error Message */}
            {error && (
              <div className="p-2.5 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs">
                {error}
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-end items-center gap-2 pt-2 border-t border-[#E9D8DE]">
              <button
                type="button"
                onClick={onClose}
                disabled={isLoading}
                className="px-3.5 py-2 rounded-xl bg-[#FFF8F9] border border-[#E9D8DE] text-[#2F2B2D] font-bold hover:bg-[#FFF0F3] transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreateShareLink}
                disabled={!consentChecked || isLoading}
                className="px-4 py-2 rounded-xl bg-[#A70F43] hover:bg-[#8D0D39] text-white font-bold text-xs shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 transition-colors"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Creating share link…</span>
                  </>
                ) : (
                  <>
                    <Share2 className="w-3.5 h-3.5" />
                    <span>Create share link</span>
                  </>
                )}
              </button>
            </div>
          </div>
        ) : (
          /* Success State (Link Created) */
          <div className="space-y-4 text-xs">
            <div>
              <label className="block text-[#7B7280] mb-1 font-semibold">Shareable Link</label>
              <div className="flex items-center gap-2">
                <input
                  ref={linkInputRef}
                  type="text"
                  readOnly
                  value={result.link}
                  className="w-full bg-[#FFF8F9] border border-[#E9D8DE] rounded-xl px-3 py-2 text-xs font-mono text-[#2F2B2D] focus:outline-none"
                />
                <button
                  type="button"
                  onClick={handleCopyLink}
                  className="px-3 py-2 bg-[#A70F43] hover:bg-[#8D0D39] text-white rounded-xl font-bold flex items-center gap-1 shrink-0 text-xs shadow-sm transition-colors"
                >
                  {copied ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy link</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Video Thumbnail Preview */}
            {result.kind === 'video' && result.thumbnailLink && (
              <div className="space-y-1">
                <span className="text-[10px] text-[#7B7280] font-semibold">Preview Thumbnail</span>
                <div>
                  <img
                    src={result.thumbnailLink}
                    alt="Video thumbnail"
                    className="w-32 h-20 object-cover rounded-xl border border-[#E9D8DE] shadow-sm bg-black"
                  />
                </div>
              </div>
            )}

            {/* Link Expiry & Face Blur Info */}
            <div className="p-3 bg-[#FFF8F9] rounded-xl border border-[#E9D8DE] space-y-1 text-[11px] text-[#7B7280]">
              <div className="flex items-center justify-between">
                <span>Expires on:</span>
                <strong className="text-[#2F2B2D] font-mono">{formatExpiry(result.expiresAt)}</strong>
              </div>
              {result.kind === 'image' && (
                <div className="flex items-center justify-between">
                  <span>Faces blurred:</span>
                  <strong className="text-[#2F2B2D]">{result.facesBlurred ? 'Yes' : 'No'}</strong>
                </div>
              )}
            </div>

            {/* External Quick Sharing Options */}
            <div className="flex items-center gap-2 pt-1 flex-wrap">
              {canNativeShare && (
                <button
                  type="button"
                  onClick={handleNativeShare}
                  className="px-3 py-2 rounded-xl bg-[#FFF8F9] border border-[#E9D8DE] text-[#2F2B2D] font-bold hover:bg-[#FFF0F3] text-xs flex items-center gap-1.5 transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5 text-[#A70F43]" />
                  <span>Share via…</span>
                </button>
              )}

              <a
                href={whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-2 rounded-xl bg-[#FFF8F9] border border-[#E9D8DE] text-[#2F2B2D] font-bold hover:bg-[#FFF0F3] text-xs flex items-center gap-1.5 transition-colors"
              >
                <MessageCircle className="w-3.5 h-3.5 text-[#25D366]" />
                <span>WhatsApp</span>
              </a>
            </div>

            {/* Done Action Button */}
            <div className="flex justify-end pt-2 border-t border-[#E9D8DE]">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl bg-[#A70F43] hover:bg-[#8D0D39] text-white font-bold text-xs shadow-sm transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

