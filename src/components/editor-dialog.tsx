import { ArrowCounterClockwise, FloppyDisk, X } from '@phosphor-icons/react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { DEFAULT_PARTICIPANTS, DEFAULT_QUESTIONS } from '../data/defaults';
import { parseQuestionBank, parseRoster } from '../lib/roulette';
import type { TranslationSet } from '../i18n/translations';
import type { Participant, Question } from '../types';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

interface EditorDialogProps {
  open: boolean;
  participants: Participant[];
  questions: Question[];
  copy: TranslationSet;
  onClose: () => void;
  onSave: (participants: Participant[], questions: Question[]) => void;
}

function questionsToText(questions: Question[]): string {
  return questions
    .map((question) => question.zh === question.en
      ? question.zh
      : `${question.zh} | ${question.en}`)
    .join('\n');
}

export function EditorDialog({
  open,
  participants,
  questions,
  copy,
  onClose,
  onSave,
}: EditorDialogProps) {
  const reduceMotion = useReducedMotion();
  const backdropRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const rosterInputRef = useRef<HTMLTextAreaElement>(null);
  const [rosterText, setRosterText] = useState('');
  const [questionText, setQuestionText] = useState('');

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    setRosterText(participants.map((participant) => participant.name).join('\n'));
    setQuestionText(questionsToText(questions));
    document.body.classList.add('dialog-open');
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const backdrop = backdropRef.current;
    const backgroundElements = backdrop?.parentElement
      ? Array.from(backdrop.parentElement.children)
        .filter((element): element is HTMLElement => element instanceof HTMLElement && element !== backdrop)
        .map((element) => ({ element, wasInert: element.inert }))
      : [];

    // aria-modal 负责向读屏器表达模态语义，inert 则从键盘与指针层面隔离背景。
    backgroundElements.forEach(({ element }) => {
      element.inert = true;
    });

    const focusFrame = window.requestAnimationFrame(() => {
      rosterInputRef.current?.focus({ preventScroll: true });
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onClose();
        return;
      }

      if (event.key !== 'Tab') {
        return;
      }

      const dialog = dialogRef.current;
      if (!dialog) {
        return;
      }

      const focusableElements = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
        .filter((element) => element.getClientRects().length > 0 && !element.hidden);
      if (focusableElements.length === 0) {
        event.preventDefault();
        dialog.focus({ preventScroll: true });
        return;
      }

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];
      const activeElement = document.activeElement;
      const movingBeforeStart = event.shiftKey
        && (activeElement === firstElement || !dialog.contains(activeElement));
      const movingPastEnd = !event.shiftKey
        && (activeElement === lastElement || !dialog.contains(activeElement));

      if (movingBeforeStart || movingPastEnd) {
        event.preventDefault();
        (movingBeforeStart ? lastElement : firstElement).focus({ preventScroll: true });
      }
    };
    document.addEventListener('keydown', handleKeyDown, true);

    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener('keydown', handleKeyDown, true);
      backgroundElements.forEach(({ element, wasInert }) => {
        element.inert = wasInert;
      });
      document.body.classList.remove('dialog-open');
      window.requestAnimationFrame(() => {
        if (opener?.isConnected) {
          opener.focus({ preventScroll: true });
        }
      });
    };
  }, [onClose, open, participants, questions]);

  const participantCount = useMemo(() => parseRoster(rosterText).length, [rosterText]);
  const questionCount = useMemo(() => parseQuestionBank(questionText).length, [questionText]);

  const restoreDemoData = () => {
    setRosterText(DEFAULT_PARTICIPANTS.map((participant) => participant.name).join('\n'));
    setQuestionText(questionsToText(DEFAULT_QUESTIONS));
  };

  const saveChanges = () => {
    onSave(parseRoster(rosterText), parseQuestionBank(questionText));
  };

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          ref={backdropRef}
          className="dialog-backdrop"
          initial={reduceMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              onClose();
            }
          }}
        >
          <motion.section
            ref={dialogRef}
            className="editor-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="editor-title"
            tabIndex={-1}
            initial={reduceMotion ? false : { opacity: 0, x: 38 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 38 }}
            transition={{ duration: reduceMotion ? 0 : 0.28, ease: [0.16, 1, 0.3, 1] }}
          >
            <header className="editor-header">
              <div>
                <h2 id="editor-title">{copy.editorTitle}</h2>
                <p>{copy.editorIntro}</p>
              </div>
              <button type="button" className="icon-button" onClick={onClose} aria-label={copy.closeEditor}>
                <X size={20} />
              </button>
            </header>

            <div className="editor-grid">
              <div className="field-group">
                <div className="field-heading">
                  <label htmlFor="roster-input">{copy.roster}</label>
                  <span>{participantCount} {copy.namesCount}</span>
                </div>
                <p id="roster-help">{copy.rosterHelp}</p>
                <textarea
                  ref={rosterInputRef}
                  id="roster-input"
                  value={rosterText}
                  onChange={(event) => setRosterText(event.target.value)}
                  aria-describedby="roster-help"
                  spellCheck="false"
                />
              </div>

              <div className="field-group">
                <div className="field-heading">
                  <label htmlFor="question-input">{copy.questionBank}</label>
                  <span>{questionCount} {copy.questionCount}</span>
                </div>
                <p id="question-help">{copy.questionHelp}</p>
                <textarea
                  id="question-input"
                  value={questionText}
                  onChange={(event) => setQuestionText(event.target.value)}
                  aria-describedby="question-help"
                  spellCheck="false"
                />
              </div>
            </div>

            <div className="privacy-note">
              <span>{copy.localOnly}</span>
              <p>{copy.privacy}</p>
            </div>

            <footer className="editor-actions">
              <button type="button" className="text-button" onClick={restoreDemoData} aria-label={copy.resetDemo}>
                <ArrowCounterClockwise size={18} />
                {copy.resetDemo}
              </button>
              <div>
                <button type="button" className="text-button" onClick={onClose} aria-label={copy.cancel}>
                  {copy.cancel}
                </button>
                <button type="button" className="primary-button" onClick={saveChanges} aria-label={copy.save}>
                  <FloppyDisk size={18} weight="bold" />
                  {copy.save}
                </button>
              </div>
            </footer>
          </motion.section>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
