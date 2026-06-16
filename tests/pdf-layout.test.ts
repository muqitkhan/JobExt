import { describe, expect, it } from 'vitest';
import { layoutPdfItems, detectMultiColumnLayout } from '@/lib/parsers/pdf-layout';
import { containsTerm } from '@/lib/ats/keywords';
import { detectStandardSections } from '@/lib/parsers/sections';

describe('layoutPdfItems', () => {
  it('groups items by y position and joins lines with newlines', () => {
    const { text } = layoutPdfItems([
      { str: 'EXPERIENCE', x: 72, y: 700, width: 80, height: 12 },
      { str: 'Built', x: 72, y: 680, width: 30, height: 10 },
      { str: 'apps', x: 110, y: 680, width: 28, height: 10 },
      { str: 'SKILLS', x: 72, y: 640, width: 50, height: 12 },
      { str: 'React', x: 72, y: 620, width: 35, height: 10 },
    ]);

    expect(text).toBe('EXPERIENCE\nBuilt apps\nSKILLS\nReact');
  });

  it('sorts items left-to-right within a line', () => {
    const { text } = layoutPdfItems([
      { str: 'World', x: 120, y: 500, width: 40, height: 10 },
      { str: 'Hello', x: 72, y: 500, width: 40, height: 10 },
    ]);
    expect(text).toBe('Hello World');
  });
});

describe('detectMultiColumnLayout', () => {
  it('flags wide x spread with large gaps', () => {
    const lines = [
      [
        { str: 'Left', x: 50, y: 500, width: 40, height: 10 },
        { str: 'Right', x: 320, y: 500, width: 50, height: 10 },
      ],
    ];
    expect(detectMultiColumnLayout(lines)).toBe(true);
  });

  it('does not flag a normal single-column line', () => {
    const lines = [
      [
        { str: 'Hello', x: 72, y: 500, width: 40, height: 10 },
        { str: 'World', x: 120, y: 500, width: 40, height: 10 },
      ],
    ];
    expect(detectMultiColumnLayout(lines)).toBe(false);
  });
});

describe('containsTerm', () => {
  it('matches short taxonomy terms via word boundaries', () => {
    expect(containsTerm('Proficient in Go and Python', 'go')).toBe(true);
    expect(containsTerm('BS in Computer Science', 'bs')).toBe(true);
    expect(containsTerm('UX design and UI work', 'ux')).toBe(true);
    expect(containsTerm('Strong communication skills', 'r')).toBe(false);
  });

  it('matches skill synonyms', () => {
    expect(containsTerm('Deployed on K8s clusters', 'kubernetes')).toBe(true);
    expect(containsTerm('Experience with Kubernetes', 'k8s')).toBe(true);
    expect(containsTerm('Built with React.js', 'react')).toBe(true);
    expect(containsTerm('Node.js backend', 'node')).toBe(true);
  });
});

describe('detectStandardSections', () => {
  it('detects sections from headers, not body mentions', () => {
    const resume = `
John Doe
john@email.com

SUMMARY
Developer with strong communication skills.

EXPERIENCE
Built apps for 3 years.
`;
    const found = detectStandardSections(resume);
    expect(found).toContain('experience');
    expect(found).toContain('summary');
    expect(found).not.toContain('skills');
  });

  it('detects a real Skills section header', () => {
    const resume = 'SKILLS\nReact, TypeScript\n\nEXPERIENCE\nBuilt apps';
    expect(detectStandardSections(resume)).toContain('skills');
  });
});
