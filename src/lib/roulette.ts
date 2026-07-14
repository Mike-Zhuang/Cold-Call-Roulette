import type { Participant, Question } from '../types';

const ITEM_LIMIT = 200;
const TEXT_LIMIT = 180;

export function createId(prefix: string): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function cleanText(value: string): string {
  return value
    .replace(/^\uFEFF/u, '')
    // NFC 合并等价 Unicode 序列，同时保留中文全角标点的原始呈现。
    .normalize('NFC')
    .trim()
    .slice(0, TEXT_LIMIT);
}

export function parseRoster(
  value: string,
  idFactory: () => string = () => createId('participant'),
): Participant[] {
  return value
    .split(/[\n\r,，;；\t]+/u)
    .map(cleanText)
    .filter(Boolean)
    .slice(0, ITEM_LIMIT)
    .map((name) => ({ id: idFactory(), name }));
}

export function parseQuestionBank(
  value: string,
  idFactory: () => string = () => createId('question'),
): Question[] {
  return value
    .split(/\r?\n/u)
    .map(cleanText)
    .filter(Boolean)
    .slice(0, ITEM_LIMIT)
    .map((line) => {
      const dividerIndex = line.indexOf('|');
      const zh = cleanText(dividerIndex >= 0 ? line.slice(0, dividerIndex) : line);
      const en = cleanText(dividerIndex >= 0 ? line.slice(dividerIndex + 1) : line);
      const fallback = zh || en;

      return {
        id: idFactory(),
        zh: zh || fallback,
        en: en || fallback,
      };
    });
}

export function getSecureRandomIndex(maximumExclusive: number): number {
  if (!Number.isInteger(maximumExclusive) || maximumExclusive <= 0) {
    throw new RangeError('maximumExclusive must be a positive integer');
  }

  if (typeof crypto === 'undefined' || !('getRandomValues' in crypto)) {
    return Math.floor(Math.random() * maximumExclusive);
  }

  // 拒绝采样消除 2^32 不能整除候选数量时产生的模偏差。
  const range = 0x1_0000_0000;
  const acceptanceLimit = Math.floor(range / maximumExclusive) * maximumExclusive;
  const buffer = new Uint32Array(1);
  let value: number;
  do {
    crypto.getRandomValues(buffer);
    value = buffer[0];
  } while (value >= acceptanceLimit);

  return value % maximumExclusive;
}

export function shuffleIds(
  ids: string[],
  random?: () => number,
): string[] {
  const result = [...ids];

  for (let index = result.length - 1; index > 0; index -= 1) {
    const targetIndex = random
      ? Math.floor(random() * (index + 1))
      : getSecureRandomIndex(index + 1);
    [result[index], result[targetIndex]] = [result[targetIndex], result[index]];
  }

  return result;
}

export function getTargetRotation(
  currentRotation: number,
  selectedIndex: number,
  itemCount: number,
  turns = 6,
): number {
  if (itemCount <= 0) {
    return currentRotation;
  }

  const segmentAngle = 360 / itemCount;
  const desiredModulo = -((selectedIndex + 0.5) * segmentAngle);
  const currentModulo = ((currentRotation % 360) + 360) % 360;
  const normalizedDesired = ((desiredModulo % 360) + 360) % 360;
  const forwardDelta = (normalizedDesired - currentModulo + 360) % 360;

  return currentRotation + turns * 360 + forwardDelta;
}

export function getLandingIndex(rotation: number, itemCount: number): number {
  if (itemCount <= 0) {
    return -1;
  }

  const segmentAngle = 360 / itemCount;
  const normalized = ((-rotation % 360) + 360) % 360;
  return Math.floor(normalized / segmentAngle) % itemCount;
}
