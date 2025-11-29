'use client';

import { useEffect, useState } from 'react';
import { Bot, CheckCircle2, Circle, Loader2 } from 'lucide-react';

const STEPS = [
  { id: 'analyze', label: '질문 분석', activeLabel: '질문 분석 중...' },
  { id: 'search', label: '논문 검색', activeLabel: '논문 검색 중...' },
  { id: 'synthesize', label: '응답 합성', activeLabel: '응답 합성 중...' },
];

// Step durations in ms. null = wait until complete
const STEP_DURATIONS = [2000, 6000, null];

type StepStatus = 'completed' | 'active' | 'pending';

interface StepItemProps {
  label: string;
  status: StepStatus;
}

function StepItem({ label, status }: StepItemProps) {
  return (
    <div className="flex items-center gap-2 py-1">
      {status === 'completed' && (
        <CheckCircle2 className="h-4 w-4 text-green-500" />
      )}
      {status === 'active' && (
        <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />
      )}
      {status === 'pending' && <Circle className="h-4 w-4 text-gray-300" />}
      <span
        className={
          status === 'pending'
            ? 'text-gray-400 text-sm'
            : 'text-gray-700 text-sm'
        }
      >
        {label}
      </span>
    </div>
  );
}

export function PendingSteps() {
  const [currentStep, setCurrentStep] = useState(0);

  useEffect(() => {
    const duration = STEP_DURATIONS[currentStep];
    if (duration === null) return;

    const timer = setTimeout(() => {
      setCurrentStep(prev => Math.min(prev + 1, STEPS.length - 1));
    }, duration);

    return () => clearTimeout(timer);
  }, [currentStep]);

  return (
    <div className="flex gap-3">
      <div className="h-8 w-8 rounded-full bg-purple-100 flex items-center justify-center shrink-0">
        <Bot className="h-4 w-4 text-purple-600" />
      </div>
      <div className="bg-gray-100 rounded-2xl rounded-tl-sm px-4 py-3">
        {STEPS.map((step, idx) => {
          let status: StepStatus;
          if (idx < currentStep) {
            status = 'completed';
          } else if (idx === currentStep) {
            status = 'active';
          } else {
            status = 'pending';
          }

          return (
            <StepItem
              key={step.id}
              label={status === 'active' ? step.activeLabel : step.label}
              status={status}
            />
          );
        })}
      </div>
    </div>
  );
}
