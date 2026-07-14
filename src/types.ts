export type Language = 'zh' | 'en';
export type Theme = 'dark' | 'light';

export interface Participant {
  id: string;
  name: string;
}

export interface Question {
  id: string;
  zh: string;
  en: string;
}

export interface DrawRecord {
  id: string;
  participantId: string;
  participantName: string;
  questionId: string;
  questionZh: string;
  questionEn: string;
  createdAt: number;
}

export interface PendingDraw {
  participant: Participant;
  question: Question;
}
