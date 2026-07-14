import { describe, expect, it } from 'vitest';
import {
  getLandingIndex,
  getSecureRandomIndex,
  getTargetRotation,
  parseQuestionBank,
  parseRoster,
  shuffleIds,
} from './roulette';

describe('parseRoster', () => {
  it('兼容多种分隔符并保留重名', () => {
    let index = 0;
    const result = parseRoster(
      '\uFEFF  林晓  \r\nMaya Chen，林晓;Amara\tLeo',
      () => `id-${index += 1}`,
    );

    expect(result.map((participant) => participant.name)).toEqual([
      '林晓',
      'Maya Chen',
      '林晓',
      'Amara',
      'Leo',
    ]);
    expect(new Set(result.map((participant) => participant.id)).size).toBe(5);
  });

  it('把输入当作纯文本并限制条目数量', () => {
    const names = Array.from({ length: 240 }, (_, index) => (
      index === 0 ? '<script>alert(1)</script>' : `Name ${index}`
    )).join('\n');
    const result = parseRoster(names, () => 'safe-id');

    expect(result).toHaveLength(200);
    expect(result[0].name).toBe('<script>alert(1)</script>');
  });
});

describe('parseQuestionBank', () => {
  it('解析双语问题并为单语问题提供安全回退', () => {
    let index = 0;
    const result = parseQuestionBank(
      '为什么？ | Why?\nSingle language question\n | English only',
      () => `question-${index += 1}`,
    );

    expect(result).toEqual([
      { id: 'question-1', zh: '为什么？', en: 'Why?' },
      { id: 'question-2', zh: 'Single language question', en: 'Single language question' },
      { id: 'question-3', zh: 'English only', en: 'English only' },
    ]);
  });
});

describe('shuffleIds', () => {
  it('不修改原数组并保留完整牌组', () => {
    const source = ['a', 'b', 'c', 'd'];
    const shuffled = shuffleIds(source, () => 0);

    expect(source).toEqual(['a', 'b', 'c', 'd']);
    expect([...shuffled].sort()).toEqual(source);
    expect(shuffled).not.toEqual(source);
  });
});

describe('getSecureRandomIndex', () => {
  it('单一候选始终返回零', () => {
    expect(getSecureRandomIndex(1)).toBe(0);
  });

  it('拒绝无效候选范围', () => {
    expect(() => getSecureRandomIndex(0)).toThrow(RangeError);
    expect(() => getSecureRandomIndex(1.5)).toThrow(RangeError);
  });
});

describe('wheel geometry', () => {
  it.each([2, 3, 8, 30, 80])('让 %i 个扇区准确落到预选索引', (itemCount) => {
    for (let selectedIndex = 0; selectedIndex < itemCount; selectedIndex += 1) {
      const target = getTargetRotation(137.25, selectedIndex, itemCount);
      expect(getLandingIndex(target, itemCount)).toBe(selectedIndex);
    }
  });

  it('空轮盘保持当前角度', () => {
    expect(getTargetRotation(42, 0, 0)).toBe(42);
    expect(getLandingIndex(42, 0)).toBe(-1);
  });
});
