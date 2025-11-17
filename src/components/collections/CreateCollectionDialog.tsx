'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Plus, Loader2 } from 'lucide-react';
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
import { useCreateCollection } from '@/hooks/useCreateCollection';
import {
  createCollectionSchema,
  type CreateCollectionSchema,
} from '@/lib/validations/collections';

export function CreateCollectionDialog() {
  const [open, setOpen] = useState(false);
  const { mutate: createCollection, isPending } = useCreateCollection();

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<CreateCollectionSchema>({
    resolver: zodResolver(createCollectionSchema),
    defaultValues: {
      name: '',
      keywords: '',
      filters: {
        yearFrom: undefined,
        yearTo: undefined,
        minCitations: undefined,
        openAccessOnly: false,
      },
    },
  });

  const onSubmit = (data: CreateCollectionSchema) => {
    createCollection(data, {
      onSuccess: () => {
        setOpen(false);
        reset();
      },
    });
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
              disabled={isPending}
            />
            {errors.name && (
              <p className="text-sm text-destructive">{errors.name.message}</p>
            )}
          </div>

          {/* Keywords */}
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
              disabled={isPending}
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
                  disabled={isPending}
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
                  disabled={isPending}
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
                disabled={isPending}
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
                disabled={isPending}
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
              }}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                'Create Collection'
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
