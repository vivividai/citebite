'use client';

import { useState, useCallback } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { SeedPaperSearchPanel } from './SeedPaperSearchPanel';
import { SeedPaperSelectionPanel } from './SeedPaperSelectionPanel';
import { useCreateCollection } from '@/hooks/useCreateCollection';
import { seedPaperCollectionSchema } from '@/lib/validations/collections';
import type { PaperSearchResult } from '@/hooks/usePaperSearch';

export function CreateCollectionDialog() {
  const [open, setOpen] = useState(false);

  // Form state
  const [name, setName] = useState('');
  const [researchQuestion, setResearchQuestion] = useState('');
  const [selectedPapers, setSelectedPapers] = useState<PaperSearchResult[]>([]);

  // Validation errors
  const [nameError, setNameError] = useState<string>();
  const [researchQuestionError, setResearchQuestionError] = useState<string>();
  const [papersError, setPapersError] = useState<string>();

  const { mutate: createCollection, isPending: isCreating } =
    useCreateCollection();

  // Reset form state
  const resetForm = useCallback(() => {
    setName('');
    setResearchQuestion('');
    setSelectedPapers([]);
    setNameError(undefined);
    setResearchQuestionError(undefined);
    setPapersError(undefined);
  }, []);

  // Handle dialog close
  const handleOpenChange = useCallback(
    (newOpen: boolean) => {
      setOpen(newOpen);
      if (!newOpen) {
        resetForm();
      }
    },
    [resetForm]
  );

  // Add paper to selection
  const handleAddPaper = useCallback((paper: PaperSearchResult) => {
    setSelectedPapers(prev => {
      if (prev.length >= 10) return prev;
      if (prev.some(p => p.paperId === paper.paperId)) return prev;
      return [...prev, paper];
    });
    setPapersError(undefined);
  }, []);

  // Remove paper from selection
  const handleRemovePaper = useCallback((paperId: string) => {
    setSelectedPapers(prev => prev.filter(p => p.paperId !== paperId));
  }, []);

  // Validate form
  const validateForm = useCallback(() => {
    let isValid = true;

    // Reset errors
    setNameError(undefined);
    setResearchQuestionError(undefined);
    setPapersError(undefined);

    // Validate using Zod schema
    const result = seedPaperCollectionSchema.safeParse({
      name,
      researchQuestion,
      seedPaperIds: selectedPapers.map(p => p.paperId),
    });

    if (!result.success) {
      const errors = result.error.flatten().fieldErrors;

      if (errors.name?.[0]) {
        setNameError(errors.name[0]);
        isValid = false;
      }
      if (errors.researchQuestion?.[0]) {
        setResearchQuestionError(errors.researchQuestion[0]);
        isValid = false;
      }
      if (errors.seedPaperIds?.[0]) {
        setPapersError(errors.seedPaperIds[0]);
        isValid = false;
      }
    }

    return isValid;
  }, [name, researchQuestion, selectedPapers]);

  // Handle form submission
  const handleSubmit = useCallback(() => {
    if (!validateForm()) return;

    createCollection(
      {
        name: name.trim(),
        researchQuestion: researchQuestion.trim(),
        selectedPaperIds: selectedPapers.map(p => p.paperId),
      },
      {
        onSuccess: () => {
          handleOpenChange(false);
        },
      }
    );
  }, [
    name,
    researchQuestion,
    selectedPapers,
    validateForm,
    createCollection,
    handleOpenChange,
  ]);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button size="lg">
          <Plus className="mr-2 h-5 w-5" />
          Create Collection
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-5xl max-h-[85vh] overflow-hidden p-0">
        <DialogHeader className="px-6 pt-6 pb-0">
          <DialogTitle>Create New Collection</DialogTitle>
          <DialogDescription>
            Search for seed papers to start your research collection. You can
            add up to 10 papers.
          </DialogDescription>
        </DialogHeader>

        {/* 2-column layout */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 h-[600px] p-6 pt-4">
          {/* Left: Search Panel */}
          <SeedPaperSearchPanel
            selectedPapers={selectedPapers}
            onAddPaper={handleAddPaper}
            onRemovePaper={handleRemovePaper}
          />

          {/* Right: Selection Panel */}
          <SeedPaperSelectionPanel
            name={name}
            onNameChange={setName}
            researchQuestion={researchQuestion}
            onResearchQuestionChange={setResearchQuestion}
            selectedPapers={selectedPapers}
            onRemovePaper={handleRemovePaper}
            onSubmit={handleSubmit}
            isSubmitting={isCreating}
            nameError={nameError}
            researchQuestionError={researchQuestionError}
            papersError={papersError}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
