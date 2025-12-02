'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Plus, Loader2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { PaperPreviewDialog } from './PaperPreviewDialog';
import { useCreateCollection } from '@/hooks/useCreateCollection';
import {
  usePreviewCollection,
  type PreviewStats,
} from '@/hooks/usePreviewCollection';
import {
  createCollectionSchema,
  type CreateCollectionSchema,
} from '@/lib/validations/collections';
import type { PaperPreview } from '@/lib/search/types';
import toast from 'react-hot-toast';

export function CreateCollectionDialog() {
  const [open, setOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewData, setPreviewData] = useState<{
    papers: PaperPreview[];
    stats: PreviewStats;
    searchQuery: string;
  } | null>(null);
  const [pendingFormData, setPendingFormData] =
    useState<CreateCollectionSchema | null>(null);

  // AI-Assisted mode state
  const [useAiAssistant, setUseAiAssistant] = useState(false);
  const [naturalLanguageQuery, setNaturalLanguageQuery] = useState('');
  const [suggestedKeywords, setSuggestedKeywords] = useState('');
  const [isGeneratingKeywords, setIsGeneratingKeywords] = useState(false);

  const { mutate: createCollection, isPending: isCreating } =
    useCreateCollection();
  const { mutate: previewCollection, isPending: isPreviewing } =
    usePreviewCollection();

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    setValue,
  } = useForm<CreateCollectionSchema>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(createCollectionSchema) as any,
    defaultValues: {
      name: '',
      keywords: '',
      useAiAssistant: false,
      naturalLanguageQuery: '',
      filters: {
        yearFrom: undefined,
        yearTo: undefined,
        minCitations: undefined,
        openAccessOnly: false,
      },
    },
  });

  const handleGenerateKeywords = async () => {
    if (!naturalLanguageQuery.trim()) {
      toast.error('Please enter your research interest');
      return;
    }

    setIsGeneratingKeywords(true);
    try {
      const response = await fetch('/api/collections/ai/suggest-keywords', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ naturalLanguageQuery }),
      });

      if (!response.ok) {
        throw new Error('Failed to generate keywords');
      }

      const data = await response.json();
      setSuggestedKeywords(data.keywords);
      setValue('keywords', data.keywords);

      toast.success('Keywords generated! You can edit them if needed.');
    } catch (error) {
      console.error('Keyword generation error:', error);
      toast.error('Failed to generate keywords. Please try again.');
    } finally {
      setIsGeneratingKeywords(false);
    }
  };

  const onSubmit = (data: CreateCollectionSchema) => {
    // Prepare data for submission
    const submissionData = {
      ...data,
      useAiAssistant,
      naturalLanguageQuery: useAiAssistant ? naturalLanguageQuery : undefined,
      keywords: data.keywords,
    };

    // First, preview the collection
    previewCollection(submissionData, {
      onSuccess: response => {
        // Store form data and preview stats
        setPendingFormData(submissionData);
        setPreviewData({
          papers: response.data.papers,
          stats: response.data.stats,
          searchQuery: response.data.searchQuery,
        });
        // Show preview dialog
        setPreviewOpen(true);
      },
      onError: (error: Error) => {
        toast.error(error.message || 'Failed to preview collection');
      },
    });
  };

  const handleConfirmCreate = (selectedPaperIds: string[]) => {
    if (!pendingFormData) return;

    // Create collection with selected papers
    createCollection(
      {
        ...pendingFormData,
        selectedPaperIds,
      },
      {
        onSuccess: () => {
          setPreviewOpen(false);
          setOpen(false);
          reset();
          setPendingFormData(null);
          setPreviewData(null);
          setUseAiAssistant(false);
          setNaturalLanguageQuery('');
          setSuggestedKeywords('');
        },
      }
    );
  };

  const handleCancelCreate = () => {
    setPreviewOpen(false);
    setPendingFormData(null);
    setPreviewData(null);
  };

  const handleToggleAiAssistant = (checked: boolean) => {
    setUseAiAssistant(checked);
    setValue('useAiAssistant', checked);
    if (!checked) {
      setNaturalLanguageQuery('');
      setSuggestedKeywords('');
      setValue('keywords', '');
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="lg">
          <Plus className="mr-2 h-5 w-5" />
          Create Collection
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create New Collection</DialogTitle>
          <DialogDescription>
            Search for research papers and create a new collection. You can
            filter by year, citations, and Open Access availability.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {/* Collection Name */}
          <div className="space-y-2">
            <label
              htmlFor="name"
              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
            >
              Collection Name <span className="text-destructive">*</span>
            </label>
            <Input
              id="name"
              placeholder="e.g., Quantum Computing Papers"
              {...register('name')}
              disabled={isPreviewing || isCreating}
            />
            {errors.name && (
              <p className="text-sm text-destructive">{errors.name.message}</p>
            )}
          </div>

          {/* AI Assistant Toggle */}
          <div className="flex items-center justify-between space-x-4 rounded-lg border p-4 bg-muted/50">
            <div className="flex-1 space-y-1">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-purple-600" />
                <Label htmlFor="ai-assistant" className="font-medium">
                  Use AI Assistant
                </Label>
              </div>
              <p className="text-xs text-muted-foreground">
                Describe your research interest in natural language and let AI
                suggest keywords
              </p>
            </div>
            <Switch
              id="ai-assistant"
              checked={useAiAssistant}
              onCheckedChange={handleToggleAiAssistant}
              disabled={isPreviewing || isCreating}
            />
          </div>

          {/* Conditional Input: AI-Assisted or Manual */}
          {useAiAssistant ? (
            <>
              {/* Natural Language Query */}
              <div className="space-y-2">
                <Label htmlFor="nlQuery">
                  Describe Your Research Interest{' '}
                  <span className="text-destructive">*</span>
                </Label>
                <Textarea
                  id="nlQuery"
                  placeholder="e.g., I want to research about transformer architectures in natural language processing..."
                  value={naturalLanguageQuery}
                  onChange={e => {
                    setNaturalLanguageQuery(e.target.value);
                    setValue('naturalLanguageQuery', e.target.value);
                  }}
                  disabled={isPreviewing || isCreating || isGeneratingKeywords}
                  rows={3}
                  className="resize-none"
                />
                <p className="text-xs text-muted-foreground">
                  Be as specific as possible about what you want to research
                </p>
              </div>

              {/* Generate Keywords Button */}
              <Button
                type="button"
                onClick={handleGenerateKeywords}
                disabled={
                  !naturalLanguageQuery.trim() ||
                  isGeneratingKeywords ||
                  isPreviewing ||
                  isCreating
                }
                variant="secondary"
                className="w-full"
              >
                {isGeneratingKeywords ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Generating Keywords...
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-2 h-4 w-4" />
                    Generate Search Keywords
                  </>
                )}
              </Button>

              {/* Suggested Keywords (Editable) */}
              {suggestedKeywords && (
                <div className="space-y-2">
                  <Label htmlFor="suggestedKeywords">
                    Suggested Keywords (you can edit){' '}
                    <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="suggestedKeywords"
                    value={suggestedKeywords}
                    onChange={e => {
                      setSuggestedKeywords(e.target.value);
                      setValue('keywords', e.target.value);
                    }}
                    disabled={isPreviewing || isCreating}
                  />
                  {errors.keywords && (
                    <p className="text-sm text-destructive">
                      {errors.keywords.message}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Feel free to modify the keywords to better match your needs
                  </p>
                </div>
              )}
            </>
          ) : (
            <>
              {/* Manual Keywords Input */}
              <div className="space-y-2">
                <label
                  htmlFor="keywords"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  Search Keywords <span className="text-destructive">*</span>
                </label>
                <Input
                  id="keywords"
                  placeholder="e.g., quantum computing, deep learning"
                  {...register('keywords')}
                  disabled={isPreviewing || isCreating}
                />
                {errors.keywords && (
                  <p className="text-sm text-destructive">
                    {errors.keywords.message}
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  Use commas to separate multiple keywords
                </p>
              </div>
            </>
          )}

          {/* Filters Section */}
          <div className="space-y-4">
            <h4 className="text-sm font-medium">Filters (Optional)</h4>

            {/* Year Range */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label
                  htmlFor="yearFrom"
                  className="text-sm font-medium leading-none"
                >
                  From Year
                </label>
                <Input
                  id="yearFrom"
                  type="number"
                  placeholder="e.g., 2020"
                  {...register('filters.yearFrom', { valueAsNumber: true })}
                  disabled={isPreviewing || isCreating}
                />
                {errors.filters?.yearFrom && (
                  <p className="text-sm text-destructive">
                    {errors.filters.yearFrom.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <label
                  htmlFor="yearTo"
                  className="text-sm font-medium leading-none"
                >
                  To Year
                </label>
                <Input
                  id="yearTo"
                  type="number"
                  placeholder="e.g., 2024"
                  {...register('filters.yearTo', { valueAsNumber: true })}
                  disabled={isPreviewing || isCreating}
                />
                {errors.filters?.yearTo && (
                  <p className="text-sm text-destructive">
                    {errors.filters.yearTo.message}
                  </p>
                )}
              </div>
            </div>

            {/* Minimum Citations */}
            <div className="space-y-2">
              <label
                htmlFor="minCitations"
                className="text-sm font-medium leading-none"
              >
                Minimum Citations
              </label>
              <Input
                id="minCitations"
                type="number"
                placeholder="e.g., 10"
                {...register('filters.minCitations', { valueAsNumber: true })}
                disabled={isPreviewing || isCreating}
              />
              {errors.filters?.minCitations && (
                <p className="text-sm text-destructive">
                  {errors.filters.minCitations.message}
                </p>
              )}
            </div>

            {/* Open Access Only */}
            <div className="flex items-center space-x-2">
              <input
                id="openAccessOnly"
                type="checkbox"
                className="h-4 w-4 rounded border-gray-300"
                {...register('filters.openAccessOnly')}
                disabled={isPreviewing || isCreating}
              />
              <label
                htmlFor="openAccessOnly"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >
                Open Access Only (PDFs auto-download)
              </label>
            </div>
          </div>

          {/* Submit Button */}
          <div className="flex justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setOpen(false);
                reset();
                setUseAiAssistant(false);
                setNaturalLanguageQuery('');
                setSuggestedKeywords('');
              }}
              disabled={isPreviewing || isCreating}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={
                isPreviewing ||
                isCreating ||
                (useAiAssistant && !suggestedKeywords)
              }
            >
              {isPreviewing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Checking papers...
                </>
              ) : (
                'Create Collection'
              )}
            </Button>
          </div>
        </form>
      </DialogContent>

      {/* Paper Preview Dialog */}
      {previewData && (
        <PaperPreviewDialog
          open={previewOpen}
          onOpenChange={setPreviewOpen}
          papers={previewData.papers}
          stats={previewData.stats}
          searchQuery={previewData.searchQuery}
          isCreating={isCreating}
          onConfirm={handleConfirmCreate}
          onCancel={handleCancelCreate}
        />
      )}
    </Dialog>
  );
}
