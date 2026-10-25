export interface RiskAnalysisReportSection {
  title: string;
  detail: string;
  severity: string;
}

export interface RiskAnalysisReportSections {
  overview: string;
  keyFindings: RiskAnalysisReportSection[];
  recommendedActions: string[];
  watchPoints: string[];
}

export interface RiskAnalysisResult {
  safetyScore: number;
  riskLevel: string;
  summary: string;
  factors: string[];
  safetyTips: string[];
  reportSections: RiskAnalysisReportSections;
}

const clampScore = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

const buildDefaultSections = (riskLevel: string, summary: string, factors: string[], safetyTips: string[]) => ({
  overview: `${summary}`.trim() || `Risk assessment indicates ${riskLevel.toLowerCase()}.`,
  keyFindings: factors.length
    ? factors.slice(0, 3).map((factor, index) => ({
        title: `Signal ${index + 1}`,
        detail: factor,
        severity: index === 0 ? 'Medium' : 'Low',
      }))
    : [
        { title: 'Context', detail: 'No specific risk factors were provided.', severity: 'Low' },
      ],
  recommendedActions: safetyTips.length
    ? safetyTips.slice(0, 3)
    : ['Stay alert and keep your emergency contacts informed.'],
  watchPoints: [
    riskLevel.includes('High') || riskLevel.includes('Extreme')
      ? 'Avoid isolated areas and keep emergency contacts notified.'
      : 'Remain near well-lit and populated routes after dark.',
    'If the situation changes rapidly, trigger GuardIA SOS and share your live location.',
  ],
});

export const normalizeRiskAnalysisResponse = (payload: any): RiskAnalysisResult => {
  const safetyScore = typeof payload?.safetyScore === 'number' ? clampScore(payload.safetyScore) : 50;
  const riskLevel = typeof payload?.riskLevel === 'string' && payload.riskLevel.trim()
    ? payload.riskLevel
    : 'Moderate Caution';
  const summary = typeof payload?.summary === 'string' && payload.summary.trim()
    ? payload.summary.trim()
    : 'A safety assessment is available for this location.';
  const factors = Array.isArray(payload?.factors)
    ? payload.factors.filter((item: any) => typeof item === 'string' && item.trim()).map((item: string) => item.trim())
    : [];
  const safetyTips = Array.isArray(payload?.safetyTips)
    ? payload.safetyTips.filter((item: any) => typeof item === 'string' && item.trim()).map((item: string) => item.trim())
    : [];

  if (payload?.reportSections && typeof payload.reportSections === 'object') {
    const sections = payload.reportSections as Partial<RiskAnalysisReportSections>;
    const overview = typeof sections?.overview === 'string' && sections.overview.trim()
      ? sections.overview.trim()
      : summary;
    const keyFindings = Array.isArray(sections?.keyFindings)
      ? sections.keyFindings
          .filter((item): item is RiskAnalysisReportSection => !!item && typeof item === 'object')
          .map((item) => ({
            title: typeof item.title === 'string' && item.title.trim() ? item.title.trim() : 'Finding',
            detail: typeof item.detail === 'string' && item.detail.trim() ? item.detail.trim() : 'No detail provided.',
            severity: typeof item.severity === 'string' && item.severity.trim() ? item.severity.trim() : 'Medium',
          }))
      : [];
    const recommendedActions = Array.isArray(sections?.recommendedActions)
      ? sections.recommendedActions.filter((item): item is string => typeof item === 'string' && item.trim() !== '').map((item) => item.trim())
      : [];
    const watchPoints = Array.isArray(sections?.watchPoints)
      ? sections.watchPoints.filter((item): item is string => typeof item === 'string' && item.trim() !== '').map((item) => item.trim())
      : [];

    return {
      safetyScore,
      riskLevel,
      summary,
      factors,
      safetyTips,
      reportSections: {
        overview,
        keyFindings: keyFindings.length ? keyFindings : buildDefaultSections(riskLevel, summary, factors, safetyTips).keyFindings,
        recommendedActions: recommendedActions.length ? recommendedActions : buildDefaultSections(riskLevel, summary, factors, safetyTips).recommendedActions,
        watchPoints: watchPoints.length ? watchPoints : buildDefaultSections(riskLevel, summary, factors, safetyTips).watchPoints,
      },
    };
  }

  return {
    safetyScore,
    riskLevel,
    summary,
    factors,
    safetyTips,
    reportSections: buildDefaultSections(riskLevel, summary, factors, safetyTips),
  };
};
