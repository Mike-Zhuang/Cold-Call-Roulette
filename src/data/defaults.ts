import type { Participant, Question } from '../types';

export const DEFAULT_PARTICIPANTS: Participant[] = [
  { id: 'participant-01', name: 'Maya Chen' },
  { id: 'participant-02', name: 'Lucas Reed' },
  { id: 'participant-03', name: 'Amara Okafor' },
  { id: 'participant-04', name: 'Sofia Kim' },
  { id: 'participant-05', name: 'Noah Williams' },
  { id: 'participant-06', name: 'Leo García' },
  { id: 'participant-07', name: 'Priya Nair' },
  { id: 'participant-08', name: 'Jordan Lee' },
];

export const DEFAULT_QUESTIONS: Question[] = [
  {
    id: 'question-01',
    zh: '用一句话概括今天最重要的观点。',
    en: 'Summarize today’s most important idea in one sentence.',
  },
  {
    id: 'question-02',
    zh: '哪个假设最值得我们质疑？为什么？',
    en: 'Which assumption deserves the most scrutiny, and why?',
  },
  {
    id: 'question-03',
    zh: '你会如何向一个完全不了解这个主题的人解释它？',
    en: 'How would you explain this topic to someone entirely new to it?',
  },
  {
    id: 'question-04',
    zh: '给出一个支持当前结论的真实例子。',
    en: 'Give a real example that supports the current conclusion.',
  },
  {
    id: 'question-05',
    zh: '如果条件改变，结论会在哪一点失效？',
    en: 'Where would the conclusion fail if the conditions changed?',
  },
  {
    id: 'question-06',
    zh: '刚才的两个观点有什么关键差异？',
    en: 'What is the key difference between the two ideas we just discussed?',
  },
  {
    id: 'question-07',
    zh: '如果只能保留一个证据，你会选哪一个？',
    en: 'If you could keep only one piece of evidence, which would you choose?',
  },
  {
    id: 'question-08',
    zh: '把这个概念应用到一个新的场景中。',
    en: 'Apply this concept to a new situation.',
  },
  {
    id: 'question-09',
    zh: '你最不同意哪一点？请给出理由。',
    en: 'Which point do you disagree with most? Give your reasoning.',
  },
  {
    id: 'question-10',
    zh: '下一步最值得验证的问题是什么？',
    en: 'What is the most valuable question to test next?',
  },
];
