import { useEffect, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';

type Validator<T> = (value: unknown) => value is T;

export function usePersistentState<T>(
  key: string,
  initialValue: T | (() => T),
  validator?: Validator<T>,
): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => {
    const fallback: T = typeof initialValue === 'function'
      ? (initialValue as () => T)()
      : initialValue as T;

    try {
      const stored = window.localStorage.getItem(key);
      if (!stored) {
        return fallback;
      }

      const parsed: unknown = JSON.parse(stored);
      if (validator && !validator(parsed)) {
        return fallback;
      }

      return parsed as T;
    } catch {
      return fallback;
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // 本地存储不可用时，应用仍保持当前会话可用。
    }
  }, [key, value]);

  return [value, setValue];
}
