import { QUICK_PROMPTS, templateVisual } from '@/lib/ai-studio-templates';
import type { AiStudioCatalogItem } from '@/lib/ai-studio-types';

function item(id: string): AiStudioCatalogItem {
  return {
    id,
    label: id,
    description: 'CRB',
    mode: 'compliance',
    presentation: 'report',
    example_prompts: ['Generate a CRB snapshot for my book'],
  };
}

describe('AI Studio CRB template visuals', () => {
  it('tags CRB catalog cards', () => {
    expect(templateVisual(item('crb-officer-book')).tag).toBe('CRB');
    expect(templateVisual(item('crb-supervised-portfolio')).tag).toBe('CRB');
    expect(templateVisual(item('crb-generate')).tag).toBe('CRB');
  });

  it('includes bureau-scoped quick prompts', () => {
    expect(QUICK_PROMPTS.some((p) => /CRB|Credit Data|TransUnion/i.test(p))).toBe(true);
  });
});
