export interface WeightedTerm {
  term: string;
  weight: number;
  source: 'skill' | 'title' | 'requirement' | 'frequency';
}

export interface ATSCategoryScore {
  id: string;
  label: string;
  score: number;
  weight: number;
  weighted: number;
  detail: string;
}

export type ATSGrade = 'Poor' | 'Fair' | 'Good' | 'Strong' | 'Excellent';

export interface ATSScoreResult {
  overall: number;
  grade: ATSGrade;
  categories: ATSCategoryScore[];
  matchedKeywords: string[];
  missingKeywords: string[];
  warnings: string[];
  keywordMatchRate: number;
}

export function gradeFromScore(score: number): ATSGrade {
  if (score >= 90) return 'Excellent';
  if (score >= 75) return 'Strong';
  if (score >= 60) return 'Good';
  if (score >= 40) return 'Fair';
  return 'Poor';
}
