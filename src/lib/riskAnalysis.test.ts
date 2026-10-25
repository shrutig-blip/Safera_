import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeRiskAnalysisResponse } from './riskAnalysis.js';

test('normalizes a simple Gemini payload into a structured report', () => {
  const input = {
    safetyScore: 68,
    riskLevel: 'Moderate Caution',
    summary: 'The route is moderately risky after dusk.',
    factors: ['Poor lighting', 'Limited CCTV'],
    safetyTips: ['Stay near the main road']
  };

  const result = normalizeRiskAnalysisResponse(input);

  assert.equal(result.safetyScore, 68);
  assert.equal(result.riskLevel, 'Moderate Caution');
  assert.equal(result.summary, 'The route is moderately risky after dusk.');
  assert.deepEqual(result.factors, ['Poor lighting', 'Limited CCTV']);
  assert.deepEqual(result.safetyTips, ['Stay near the main road']);
  assert.equal(result.reportSections.overview.length > 0, true);
  assert.equal(result.reportSections.keyFindings.length >= 2, true);
  assert.equal(result.reportSections.recommendedActions.length >= 2, true);
  assert.equal(result.reportSections.watchPoints.length >= 2, true);
});

test('uses a richer payload without changing its core details', () => {
  const input = {
    safetyScore: 82,
    riskLevel: 'Safe',
    summary: 'The area looks safe for evening movement.',
    factors: ['Bright lighting', 'High traffic'],
    safetyTips: ['Keep your phone charged'],
    reportSections: {
      overview: 'A calm and visible area with good lighting.',
      keyFindings: [
        { title: 'Lighting', detail: 'Well-lit streets', severity: 'Low' },
      ],
      recommendedActions: ['Continue your normal route'],
      watchPoints: ['Avoid isolated lanes after midnight']
    }
  };

  const result = normalizeRiskAnalysisResponse(input);

  assert.equal(result.reportSections.overview, 'A calm and visible area with good lighting.');
  assert.equal(result.reportSections.keyFindings[0].title, 'Lighting');
  assert.equal(result.reportSections.recommendedActions[0], 'Continue your normal route');
});
