import { normalizeText } from './keywords';

/** Canonical skill id → accepted spellings found in JDs and resumes. */
export const SKILL_EQUIVALENCE_GROUPS: readonly (readonly string[])[] = [
  ['kubernetes', 'k8s'],
  ['react', 'react.js', 'reactjs'],
  ['vue', 'vue.js', 'vuejs'],
  ['angular', 'angularjs'],
  ['node', 'node.js', 'nodejs'],
  ['next.js', 'nextjs'],
  ['ci/cd', 'cicd', 'ci cd'],
  ['postgresql', 'postgres'],
  ['google cloud', 'gcp'],
  ['golang', 'go'],
  ['amazon web services', 'aws'],
  ['machine learning', 'ml'],
  ['artificial intelligence', 'ai'],
  ['user experience', 'ux'],
  ['user interface', 'ui'],
  ['javascript', 'js'],
  ['typescript', 'ts'],
  ['continuous integration', 'ci'],
  ['continuous delivery', 'cd'],
  ['scikit-learn', 'sklearn'],
  ['power bi', 'powerbi'],
  ['devops', 'dev ops'],
  ['rest', 'restful', 'rest api', 'rest apis'],
  ['graphql', 'graph ql'],
  ['spring boot', 'springboot'],
  ['react native', 'react-native'],
  ['c#', 'csharp', 'c sharp'],
  ['c++', 'cpp'],
];

const canonicalByNormalized = new Map<string, string>();
const aliasesByCanonical = new Map<string, string[]>();

for (const group of SKILL_EQUIVALENCE_GROUPS) {
  const canonical = normalizeText(group[0]);
  const aliases = group.map((t) => normalizeText(t));
  aliasesByCanonical.set(canonical, aliases);
  for (const alias of aliases) {
    canonicalByNormalized.set(alias, canonical);
  }
}

export function getCanonicalTerm(term: string): string {
  return canonicalByNormalized.get(normalizeText(term)) ?? normalizeText(term);
}

export function getTermAliases(term: string): string[] {
  const canonical = getCanonicalTerm(term);
  const group = aliasesByCanonical.get(canonical);
  if (!group) return [term];
  return [...new Set(group)];
}
