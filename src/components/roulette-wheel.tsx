import { CaretDown } from '@phosphor-icons/react';
import { useEffect, useRef } from 'react';
import type { Participant, Theme } from '../types';

interface RouletteWheelProps {
  participants: Participant[];
  rotation: number;
  selectedId: string | null;
  isSpinning: boolean;
  disabled: boolean;
  reducedMotion: boolean;
  theme: Theme;
  wheelLabel: string;
  buttonLabel: string;
  remainingLabel: string;
  remainingCount: number;
  onSpin: () => void;
  onSettled: () => void;
}

const DARK_SEGMENTS = ['#0d1c2c', '#13283d', '#18334b', '#102235'];
const LIGHT_SEGMENTS = ['#d9e7f4', '#c9dcec', '#b9d1e4', '#d0e1ef'];

function shortenName(name: string, maximum = 14): string {
  return name.length > maximum ? `${name.slice(0, maximum - 1)}…` : name;
}

export function RouletteWheel({
  participants,
  rotation,
  selectedId,
  isSpinning,
  disabled,
  reducedMotion,
  theme,
  wheelLabel,
  buttonLabel,
  remainingLabel,
  remainingCount,
  onSpin,
  onSettled,
}: RouletteWheelProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return undefined;
    }

    const renderWheel = () => {
      const bounds = canvas.getBoundingClientRect();
      const size = Math.max(1, Math.floor(bounds.width));
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = size * ratio;
      canvas.height = size * ratio;

      const context = canvas.getContext('2d');
      if (!context) {
        return;
      }

      context.scale(ratio, ratio);
      context.clearRect(0, 0, size, size);
      const center = size / 2;
      const radius = center - 9;

      if (participants.length === 0) {
        context.beginPath();
        context.arc(center, center, radius, 0, Math.PI * 2);
        context.fillStyle = theme === 'dark' ? '#111a24' : '#dce6ee';
        context.fill();
        return;
      }

      const segmentAngle = (Math.PI * 2) / participants.length;
      const segments = theme === 'dark' ? DARK_SEGMENTS : LIGHT_SEGMENTS;
      const textColor = theme === 'dark' ? '#e8edf2' : '#152638';
      const dividerColor = theme === 'dark' ? 'rgba(232, 237, 242, .16)' : 'rgba(21, 38, 56, .18)';
      const labelStep = Math.max(1, Math.ceil(participants.length / 28));

      participants.forEach((participant, index) => {
        const startAngle = -Math.PI / 2 + index * segmentAngle;
        const endAngle = startAngle + segmentAngle;
        const isSelected = participant.id === selectedId && !isSpinning;

        context.beginPath();
        context.moveTo(center, center);
        context.arc(center, center, radius, startAngle, endAngle);
        context.closePath();
        context.fillStyle = isSelected ? '#fdb515' : segments[index % segments.length];
        context.fill();
        context.strokeStyle = dividerColor;
        context.lineWidth = 1;
        context.stroke();

        if (index % labelStep !== 0) {
          return;
        }

        context.save();
        context.translate(center, center);
        context.rotate(startAngle + segmentAngle / 2);
        context.textAlign = 'right';
        context.textBaseline = 'middle';
        context.fillStyle = isSelected ? '#1a2330' : textColor;
        const fontSize = Math.max(10, Math.min(16, 270 / Math.max(participants.length, 8)));
        context.font = `600 ${fontSize}px "Space Grotesk Variable", sans-serif`;
        context.fillText(shortenName(participant.name), radius - 25, 0, radius * 0.42);
        context.restore();
      });

      context.beginPath();
      context.arc(center, center, radius * 0.72, 0, Math.PI * 2);
      context.strokeStyle = theme === 'dark' ? 'rgba(253, 181, 21, .22)' : 'rgba(0, 50, 98, .22)';
      context.lineWidth = 1;
      context.stroke();
    };

    renderWheel();
    const observer = new ResizeObserver(renderWheel);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [isSpinning, participants, selectedId, theme]);

  return (
    <div className="wheel-assembly" role="group" aria-label={wheelLabel}>
      <div className={`wheel-pointer ${isSpinning ? 'is-spinning' : ''}`} aria-hidden="true">
        <CaretDown weight="fill" size={34} />
      </div>

      <div className="wheel-orbit" aria-hidden="true" />
      <div
        className={`wheel-disc ${isSpinning ? 'is-spinning' : ''}`}
        style={{
          transform: `rotate(${rotation}deg)`,
          transitionDuration: isSpinning ? (reducedMotion ? '140ms' : '4200ms') : '0ms',
        }}
        onTransitionEnd={(event) => {
          if (event.propertyName === 'transform' && isSpinning) {
            onSettled();
          }
        }}
      >
        <canvas ref={canvasRef} aria-hidden="true" />
      </div>

      <button
        type="button"
        className="wheel-hub"
        onClick={onSpin}
        disabled={disabled}
        aria-label={buttonLabel}
      >
        <span className="wheel-hub-label">{buttonLabel}</span>
        <span className="wheel-hub-count">
          {remainingCount} {remainingLabel}
        </span>
      </button>
    </div>
  );
}
