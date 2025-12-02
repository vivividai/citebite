'use client';

import { Check, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export type GeminiModel =
  | 'gemini-2.5-flash'
  | 'gemini-2.5-pro-preview-05-06'
  | 'gemini-3-pro-preview';

interface ModelOption {
  id: GeminiModel;
  name: string;
  description: string;
}

const MODEL_OPTIONS: ModelOption[] = [
  {
    id: 'gemini-2.5-flash',
    name: '빠른 모드',
    description: '빠르게 답변',
  },
  {
    id: 'gemini-3-pro-preview',
    name: '사고 모드(3 Pro 사용)',
    description: '복잡한 주제 사고 모드',
  },
  {
    id: 'gemini-2.5-pro-preview-05-06',
    name: '2.5 Pro',
    description: '정교한 답변',
  },
];

interface ModelSelectorProps {
  selectedModel: GeminiModel;
  onModelChange: (model: GeminiModel) => void;
  disabled?: boolean;
}

export function ModelSelector({
  selectedModel,
  onModelChange,
  disabled = false,
}: ModelSelectorProps) {
  const currentModel = MODEL_OPTIONS.find(m => m.id === selectedModel);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          disabled={disabled}
          className="h-8 gap-1 px-3 text-sm font-medium bg-zinc-800 border-zinc-700 text-zinc-100 hover:bg-zinc-700 hover:text-zinc-100"
        >
          {currentModel?.name || '모델 선택'}
          <ChevronDown className="h-4 w-4 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-64 bg-zinc-900 border-zinc-700"
      >
        <DropdownMenuLabel className="text-zinc-400 text-xs font-normal">
          모델을 선택하세요
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="bg-zinc-700" />
        {MODEL_OPTIONS.map(option => (
          <DropdownMenuItem
            key={option.id}
            onClick={() => onModelChange(option.id)}
            className="flex items-center justify-between py-3 px-3 cursor-pointer hover:bg-zinc-800 focus:bg-zinc-800 text-zinc-100"
          >
            <div className="flex flex-col gap-0.5">
              <span className="font-medium">{option.name}</span>
              <span className="text-xs text-zinc-400">
                {option.description}
              </span>
            </div>
            {selectedModel === option.id && (
              <Check className="h-4 w-4 text-blue-500" />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
