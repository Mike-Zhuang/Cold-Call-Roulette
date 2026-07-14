import {
  ArrowsClockwise,
  CornersIn,
  CornersOut,
  GearSix,
  Moon,
  SpeakerHigh,
  SpeakerSlash,
  Sun,
  Translate,
  ArrowUUpLeft,
} from '@phosphor-icons/react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EditorDialog } from './components/editor-dialog';
import { IconButton } from './components/icon-button';
import { RouletteWheel } from './components/roulette-wheel';
import { DEFAULT_PARTICIPANTS, DEFAULT_QUESTIONS } from './data/defaults';
import { usePersistentState } from './hooks/use-persistent-state';
import { translations } from './i18n/translations';
import { createId, getTargetRotation, shuffleIds } from './lib/roulette';
import type {
  DrawRecord,
  Language,
  Participant,
  PendingDraw,
  Question,
  Theme,
} from './types';

const STORAGE_PREFIX = 'cold-call-roulette:v1';

function isLanguage(value: unknown): value is Language {
  return value === 'zh' || value === 'en';
}

function isTheme(value: unknown): value is Theme {
  return value === 'dark' || value === 'light';
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value)
    && value.length <= 200
    && value.every((item) => typeof item === 'string' && item.length <= 220)
    && new Set(value).size === value.length;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isParticipants(value: unknown): value is Participant[] {
  const valid = Array.isArray(value)
    && value.length <= 200
    && value.every((item) => {
      if (!item || typeof item !== 'object') {
        return false;
      }
      const participant = item as Participant;
      return typeof participant.id === 'string'
        && participant.id.length <= 220
        && typeof participant.name === 'string'
        && participant.name.length <= 180;
    });
  return valid && new Set(value.map((item) => (item as Participant).id)).size === value.length;
}

function isQuestions(value: unknown): value is Question[] {
  const valid = Array.isArray(value)
    && value.length <= 200
    && value.every((item) => {
      if (!item || typeof item !== 'object') {
        return false;
      }
      const question = item as Question;
      return typeof question.id === 'string'
        && question.id.length <= 220
        && typeof question.zh === 'string'
        && typeof question.en === 'string'
        && question.zh.length <= 180
        && question.en.length <= 180;
    });
  return valid && new Set(value.map((item) => (item as Question).id)).size === value.length;
}

function isHistory(value: unknown): value is DrawRecord[] {
  const valid = Array.isArray(value)
    && value.length <= 200
    && value.every((item) => {
      if (!item || typeof item !== 'object') {
        return false;
      }
      const record = item as DrawRecord;
      return typeof record.id === 'string'
        && record.id.length <= 220
        && typeof record.participantId === 'string'
        && record.participantId.length <= 220
        && typeof record.participantName === 'string'
        && record.participantName.length <= 180
        && typeof record.questionId === 'string'
        && record.questionId.length <= 220
        && typeof record.questionZh === 'string'
        && record.questionZh.length <= 180
        && typeof record.questionEn === 'string'
        && record.questionEn.length <= 180
        && typeof record.createdAt === 'number'
        && Number.isFinite(record.createdAt)
        && !Number.isNaN(new Date(record.createdAt).getTime());
    });
  return valid && new Set(value.map((item) => (item as DrawRecord).id)).size === value.length;
}

function getSafeDateTime(timestamp: number): { iso: string; date: Date } | null {
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? null : { iso: date.toISOString(), date };
}

function getInitialLanguage(): Language {
  return navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

export function App() {
  const reduceMotion = useReducedMotion() ?? false;
  const audioContextRef = useRef<AudioContext | null>(null);
  const drawSettledRef = useRef(false);
  const spinLockRef = useRef(false);
  const revealResultOnMobileRef = useRef(false);
  const resultBlockRef = useRef<HTMLElement>(null);

  const [language, setLanguage] = usePersistentState<Language>(
    `${STORAGE_PREFIX}:language`,
    getInitialLanguage,
    isLanguage,
  );
  const [theme, setTheme] = usePersistentState<Theme>(
    `${STORAGE_PREFIX}:theme`,
    'dark',
    isTheme,
  );
  const [soundEnabled, setSoundEnabled] = usePersistentState<boolean>(
    `${STORAGE_PREFIX}:sound`,
    false,
    isBoolean,
  );
  const [participants, setParticipants] = usePersistentState<Participant[]>(
    `${STORAGE_PREFIX}:participants`,
    DEFAULT_PARTICIPANTS,
    isParticipants,
  );
  const [questions, setQuestions] = usePersistentState<Question[]>(
    `${STORAGE_PREFIX}:questions`,
    DEFAULT_QUESTIONS,
    isQuestions,
  );
  const [remainingParticipantIds, setRemainingParticipantIds] = usePersistentState<string[]>(
    `${STORAGE_PREFIX}:participant-deck`,
    () => shuffleIds(DEFAULT_PARTICIPANTS.map((participant) => participant.id)),
    isStringArray,
  );
  const [remainingQuestionIds, setRemainingQuestionIds] = usePersistentState<string[]>(
    `${STORAGE_PREFIX}:question-deck`,
    () => shuffleIds(DEFAULT_QUESTIONS.map((question) => question.id)),
    isStringArray,
  );
  const [history, setHistory] = usePersistentState<DrawRecord[]>(
    `${STORAGE_PREFIX}:history`,
    [],
    isHistory,
  );
  const [settledRotation, setSettledRotation] = usePersistentState<number>(
    `${STORAGE_PREFIX}:settled-rotation`,
    0,
    isFiniteNumber,
  );

  const [rotation, setRotation] = useState(settledRotation);
  const targetRotationRef = useRef(settledRotation);
  const [pendingDraw, setPendingDraw] = useState<PendingDraw | null>(null);
  const [isSpinning, setIsSpinning] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(Boolean(document.fullscreenElement));

  const copy = translations[language];
  const participantIdSet = useMemo(
    () => new Set(participants.map((participant) => participant.id)),
    [participants],
  );
  const questionIdSet = useMemo(
    () => new Set(questions.map((question) => question.id)),
    [questions],
  );
  const availableParticipantIds = useMemo(
    () => remainingParticipantIds.filter((id) => participantIdSet.has(id)),
    [participantIdSet, remainingParticipantIds],
  );
  const availableQuestionIds = useMemo(
    () => remainingQuestionIds.filter((id) => questionIdSet.has(id)),
    [questionIdSet, remainingQuestionIds],
  );
  const selectedRecord = history[0] ?? null;
  const roundComplete = participants.length > 0
    && availableParticipantIds.length === 0
    && history.length > 0
    && !isSpinning;
  const questionsComplete = questions.length > 0
    && availableQuestionIds.length === 0
    && history.length > 0
    && !isSpinning;

  useEffect(() => {
    document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en';
    document.documentElement.dataset.theme = theme;
    const themeColor = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    themeColor?.setAttribute('content', theme === 'dark' ? '#090b0a' : '#edf2f4');
  }, [language, theme]);

  useEffect(() => {
    const handleFullscreenChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  useEffect(() => {
    // 存储中的牌组可能来自旧名单，只保留当前仍然存在的 ID。
    setRemainingParticipantIds((current) => {
      const valid = current.filter((id, index) => participantIdSet.has(id) && current.indexOf(id) === index);
      if (valid.length === 0 && participants.length > 0 && history.length === 0) {
        return shuffleIds(participants.map((participant) => participant.id));
      }
      return valid;
    });
  }, [participantIdSet, participants, history.length, setRemainingParticipantIds]);

  useEffect(() => {
    setRemainingQuestionIds((current) => {
      const valid = current.filter((id, index) => questionIdSet.has(id) && current.indexOf(id) === index);
      if (valid.length === 0 && questions.length > 0 && history.length === 0) {
        return shuffleIds(questions.map((question) => question.id));
      }
      return valid;
    });
  }, [questionIdSet, questions, history.length, setRemainingQuestionIds]);

  const playCue = useCallback((kind: 'start' | 'settle') => {
    if (!soundEnabled) {
      return;
    }

    try {
      const context = audioContextRef.current ?? new AudioContext();
      audioContextRef.current = context;
      void context.resume();
      const frequencies = kind === 'start' ? [180] : [523.25, 659.25, 783.99];

      frequencies.forEach((frequency, index) => {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        const startAt = context.currentTime + index * 0.045;
        oscillator.type = kind === 'start' ? 'square' : 'sine';
        oscillator.frequency.setValueAtTime(frequency, startAt);
        gain.gain.setValueAtTime(0.0001, startAt);
        gain.gain.exponentialRampToValueAtTime(kind === 'start' ? 0.025 : 0.055, startAt + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.19);
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start(startAt);
        oscillator.stop(startAt + 0.21);
      });
    } catch {
      // 浏览器拒绝音频时保持静默，不影响抽取主流程。
    }
  }, [soundEnabled]);

  const settleDraw = useCallback(() => {
    if (!pendingDraw || drawSettledRef.current) {
      return;
    }

    drawSettledRef.current = true;
    const record: DrawRecord = {
      id: createId('draw'),
      participantId: pendingDraw.participant.id,
      participantName: pendingDraw.participant.name,
      questionId: pendingDraw.question.id,
      questionZh: pendingDraw.question.zh,
      questionEn: pendingDraw.question.en,
      createdAt: Date.now(),
    };

    // 结算时统一扣除牌组并写入历史，刷新未完成动画时不会静默跳过参与者。
    setRemainingParticipantIds((current) => current.filter((id) => id !== pendingDraw.participant.id));
    setRemainingQuestionIds((current) => current.filter((id) => id !== pendingDraw.question.id));
    setHistory((current) => [record, ...current].slice(0, 200));
    setSettledRotation(targetRotationRef.current);
    revealResultOnMobileRef.current = true;
    setPendingDraw(null);
    setIsSpinning(false);
    spinLockRef.current = false;
    playCue('settle');
  }, [
    pendingDraw,
    playCue,
    setHistory,
    setRemainingParticipantIds,
    setRemainingQuestionIds,
    setSettledRotation,
  ]);

  useEffect(() => {
    if (!isSpinning || !pendingDraw) {
      return undefined;
    }

    const fallbackTimer = window.setTimeout(settleDraw, reduceMotion ? 320 : 4700);
    return () => window.clearTimeout(fallbackTimer);
  }, [isSpinning, pendingDraw, reduceMotion, settleDraw]);

  const startSpin = useCallback(() => {
    if (spinLockRef.current || isSpinning || participants.length === 0 || questions.length === 0) {
      return;
    }

    const participantId = availableParticipantIds[0];
    const questionId = availableQuestionIds[0];
    if (!participantId || !questionId) {
      return;
    }

    const participant = participants.find((item) => item.id === participantId);
    const question = questions.find((item) => item.id === questionId);
    if (!participant || !question) {
      return;
    }

    const selectedIndex = participants.findIndex((item) => item.id === participantId);
    // 同步锁会在 React 提交 disabled 状态前立即生效，防止同一事件循环的重复点击。
    spinLockRef.current = true;
    drawSettledRef.current = false;
    setPendingDraw({ participant, question });
    setRotation((current) => {
      const targetRotation = getTargetRotation(current, selectedIndex, participants.length);
      targetRotationRef.current = targetRotation;
      return targetRotation;
    });
    setIsSpinning(true);
    playCue('start');
  }, [
    availableParticipantIds,
    availableQuestionIds,
    isSpinning,
    participants,
    playCue,
    questions,
  ]);

  const startNewRound = useCallback(() => {
    if (isSpinning) {
      return;
    }
    setRemainingParticipantIds(shuffleIds(participants.map((participant) => participant.id)));
    setRemainingQuestionIds(shuffleIds(questions.map((question) => question.id)));
    setHistory([]);
    setPendingDraw(null);
    setRotation(0);
    setSettledRotation(0);
    targetRotationRef.current = 0;
    spinLockRef.current = false;
  }, [
    isSpinning,
    participants,
    questions,
    setHistory,
    setRemainingParticipantIds,
    setRemainingQuestionIds,
    setSettledRotation,
  ]);

  const resetQuestionDeck = useCallback(() => {
    if (!isSpinning) {
      setRemainingQuestionIds(shuffleIds(questions.map((question) => question.id)));
    }
  }, [isSpinning, questions, setRemainingQuestionIds]);

  const handlePrimaryAction = useCallback(() => {
    if (roundComplete) {
      startNewRound();
      return;
    }
    if (questionsComplete) {
      resetQuestionDeck();
      return;
    }
    startSpin();
  }, [questionsComplete, resetQuestionDeck, roundComplete, startNewRound, startSpin]);

  useEffect(() => {
    const handleKeyboard = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isEditing = target?.matches('input, textarea, select, button, [contenteditable="true"]');
      if (event.code === 'Space' && !isEditing && !editorOpen) {
        event.preventDefault();
        handlePrimaryAction();
      }
    };

    window.addEventListener('keydown', handleKeyboard);
    return () => window.removeEventListener('keydown', handleKeyboard);
  }, [editorOpen, handlePrimaryAction]);

  const undoLastDraw = () => {
    if (isSpinning || history.length === 0) {
      return;
    }

    const [lastRecord, ...rest] = history;
    if (participantIdSet.has(lastRecord.participantId)) {
      setRemainingParticipantIds((current) => [lastRecord.participantId, ...current]);
    }
    if (questionIdSet.has(lastRecord.questionId)) {
      setRemainingQuestionIds((current) => [lastRecord.questionId, ...current]);
    }
    setHistory(rest);
    const previousRecord = rest[0];
    if (previousRecord) {
      const previousIndex = participants.findIndex((participant) => participant.id === previousRecord.participantId);
      if (previousIndex >= 0) {
        const alignedRotation = getTargetRotation(rotation, previousIndex, participants.length, 0);
        setRotation(alignedRotation);
        setSettledRotation(alignedRotation);
        targetRotationRef.current = alignedRotation;
      }
    } else {
      setRotation(0);
      setSettledRotation(0);
      targetRotationRef.current = 0;
    }
  };

  const saveConfiguration = (nextParticipants: Participant[], nextQuestions: Question[]) => {
    setParticipants(nextParticipants);
    setQuestions(nextQuestions);
    setRemainingParticipantIds(shuffleIds(nextParticipants.map((participant) => participant.id)));
    setRemainingQuestionIds(shuffleIds(nextQuestions.map((question) => question.id)));
    setHistory([]);
    setPendingDraw(null);
    setRotation(0);
    setSettledRotation(0);
    targetRotationRef.current = 0;
    spinLockRef.current = false;
    setEditorOpen(false);
  };

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await document.documentElement.requestFullscreen();
      }
    } catch {
      // 不支持全屏的浏览器继续使用普通舞台模式。
    }
  };

  let alertMessage = '';
  if (participants.length === 0) {
    alertMessage = copy.noParticipants;
  } else if (questions.length === 0) {
    alertMessage = copy.noQuestions;
  } else if (roundComplete) {
    alertMessage = copy.roundComplete;
  } else if (questionsComplete) {
    alertMessage = copy.questionsComplete;
  }

  const statusText = isSpinning
    ? copy.spinningStatus
    : selectedRecord
      ? copy.selectedStatus
      : copy.idleStatus;
  const primaryLabel = isSpinning
    ? copy.spinning
    : roundComplete
      ? copy.newRound
      : questionsComplete
        ? copy.resetQuestions
        : copy.spin;
  const selectedQuestion = selectedRecord
    ? language === 'zh' ? selectedRecord.questionZh : selectedRecord.questionEn
    : copy.waitingQuestion;

  useEffect(() => {
    if (!selectedRecord || isSpinning || !revealResultOnMobileRef.current) {
      return undefined;
    }

    revealResultOnMobileRef.current = false;
    if (!window.matchMedia('(max-width: 620px)').matches) {
      return undefined;
    }

    // 移动端完成抽取后直接揭示回答者，避免结果落在长轮盘下方而不可见。
    const revealFrame = window.requestAnimationFrame(() => {
      resultBlockRef.current?.scrollIntoView({
        behavior: reduceMotion ? 'auto' : 'smooth',
        block: 'start',
      });
    });
    return () => window.cancelAnimationFrame(revealFrame);
  }, [isSpinning, reduceMotion, selectedRecord]);

  return (
    <div className="app-shell">
      <header className="console-header">
        <a className="brand" href="#main-stage" aria-label={copy.appName}>
          <span className="brand-mark" aria-hidden="true"><span /></span>
          <span className="brand-copy">
            <strong>{copy.appName}</strong>
            <span>{copy.appPath}</span>
          </span>
        </a>

        <div className="session-metrics" aria-label={copy.round}>
          <div>
            <span>{copy.participants}</span>
            <strong>{participants.length.toString().padStart(2, '0')}</strong>
          </div>
          <div>
            <span>{copy.called}</span>
            <strong>{history.length.toString().padStart(2, '0')}</strong>
          </div>
          <div>
            <span>{copy.questions}</span>
            <strong>{questions.length.toString().padStart(2, '0')}</strong>
          </div>
        </div>

        <nav className="header-controls" aria-label={copy.displayControls}>
          <span className="live-state"><i aria-hidden="true" />{copy.live}</span>
          <IconButton label={copy.switchLanguage} onClick={() => setLanguage(language === 'zh' ? 'en' : 'zh')}>
            <Translate size={20} />
            <span className="control-label">{language === 'zh' ? 'EN' : '中'}</span>
          </IconButton>
          <IconButton label={copy.switchTheme} onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
            {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
          </IconButton>
          <IconButton
            label={soundEnabled ? copy.soundOn : copy.soundOff}
            active={soundEnabled}
            onClick={() => setSoundEnabled(!soundEnabled)}
          >
            {soundEnabled ? <SpeakerHigh size={20} /> : <SpeakerSlash size={20} />}
          </IconButton>
          <IconButton label={isFullscreen ? copy.exitFullscreen : copy.fullscreen} onClick={toggleFullscreen}>
            {isFullscreen ? <CornersIn size={20} /> : <CornersOut size={20} />}
          </IconButton>
          <IconButton label={copy.openEditor} onClick={() => setEditorOpen(true)} disabled={isSpinning}>
            <GearSix size={20} />
          </IconButton>
        </nav>
      </header>

      <main id="main-stage" className="stage" aria-busy={isSpinning}>
        <section className="wheel-zone" aria-labelledby="stage-title">
          <div className="stage-intro">
            <h1 id="stage-title">{copy.ready}</h1>
            <p>{copy.tagline}</p>
          </div>

          <RouletteWheel
            participants={participants}
            rotation={rotation}
            selectedId={selectedRecord?.participantId ?? null}
            isSpinning={isSpinning}
            disabled={isSpinning || participants.length === 0 || questions.length === 0}
            reducedMotion={reduceMotion}
            theme={theme}
            wheelLabel={copy.wheelLabel}
            buttonLabel={primaryLabel}
            remainingLabel={copy.remaining}
            remainingCount={availableParticipantIds.length}
            onSpin={handlePrimaryAction}
            onSettled={settleDraw}
          />

          <div className="stage-status">
            <span>{statusText}</span>
            <span>{copy.shortcut}</span>
          </div>
        </section>

        <aside className="response-console" aria-live="polite" aria-atomic="true">
          <section className="console-block question-block">
            <header>
              <span>{copy.question}</span>
              <b>{availableQuestionIds.length.toString().padStart(2, '0')}</b>
            </header>
            <AnimatePresence mode="wait">
              <motion.p
                key={isSpinning ? 'spinning-question' : selectedRecord?.id ?? 'empty-question'}
                className={isSpinning ? 'is-decoding' : ''}
                initial={reduceMotion ? false : { opacity: 0, x: -18 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                transition={{ duration: reduceMotion ? 0 : 0.3, ease: [0.16, 1, 0.3, 1] }}
              >
                {isSpinning ? copy.spinningStatus : selectedQuestion}
              </motion.p>
            </AnimatePresence>
          </section>

          <section ref={resultBlockRef} className="console-block result-block">
            <header>
              <span>{copy.selected}</span>
              <b>{history.length.toString().padStart(2, '0')}</b>
            </header>
            <AnimatePresence mode="wait">
              <motion.div
                key={isSpinning ? 'spinning-name' : selectedRecord?.id ?? 'empty-name'}
                initial={reduceMotion ? false : { opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: reduceMotion ? 0 : 0.34, ease: [0.16, 1, 0.3, 1] }}
              >
                <strong>{isSpinning ? '••••••' : selectedRecord?.participantName ?? copy.waitingName}</strong>
                <span>{statusText}</span>
              </motion.div>
            </AnimatePresence>
          </section>

          <section className="console-block history-block">
            <header>
              <span>{copy.recent}</span>
              <b>{history.length.toString().padStart(2, '0')}</b>
            </header>
            {history.length === 0 ? (
              <p className="empty-history">{copy.emptyHistory}</p>
            ) : (
              <ol>
                {history.slice(0, 4).map((record, index) => (
                  <li key={record.id}>
                    <span>{String(history.length - index).padStart(2, '0')}</span>
                    <strong>{record.participantName}</strong>
                    <time dateTime={getSafeDateTime(record.createdAt)?.iso}>
                      {getSafeDateTime(record.createdAt)
                        ? new Intl.DateTimeFormat(language === 'zh' ? 'zh-CN' : 'en', {
                            hour: '2-digit',
                            minute: '2-digit',
                          }).format(getSafeDateTime(record.createdAt)!.date)
                        : '--:--'}
                    </time>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </aside>
      </main>

      <footer className="action-rail">
        <div className={`system-message ${alertMessage ? 'has-alert' : ''}`} role="status">
          <span aria-hidden="true">$</span>
          <p>{alertMessage || copy.privacy}</p>
        </div>
        <div className="secondary-actions">
          <button
            type="button"
            className="text-button"
            onClick={undoLastDraw}
            disabled={isSpinning || history.length === 0}
            aria-label={copy.undo}
          >
            <ArrowUUpLeft size={18} />
            <span>{copy.undo}</span>
          </button>
          <button
            type="button"
            className="text-button"
            onClick={startNewRound}
            disabled={isSpinning || participants.length === 0}
            aria-label={copy.reset}
          >
            <ArrowsClockwise size={18} />
            <span>{copy.reset}</span>
          </button>
          <button
            type="button"
            className="text-button"
            onClick={() => setEditorOpen(true)}
            disabled={isSpinning}
            aria-label={copy.edit}
          >
            <GearSix size={18} />
            <span>{copy.edit}</span>
          </button>
        </div>
      </footer>

      <EditorDialog
        open={editorOpen}
        participants={participants}
        questions={questions}
        copy={copy}
        onClose={() => setEditorOpen(false)}
        onSave={saveConfiguration}
      />
    </div>
  );
}
