'use client';

/**
 * PDF Upload Button Component
 * Provides a button for manually uploading PDFs to papers that failed automatic download.
 */

import { useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Upload, Loader2 } from 'lucide-react';
import { useUploadPdf } from '@/hooks/useUploadPdf';
import toast from 'react-hot-toast';

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB

interface PdfUploadButtonProps {
  paperId: string;
  collectionId: string;
}

export function PdfUploadButton({
  paperId,
  collectionId,
}: PdfUploadButtonProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { mutate: uploadPdf, isPending } = useUploadPdf(collectionId);

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Client-side validation: file type
    if (file.type !== 'application/pdf') {
      toast.error('Please select a PDF file');
      e.target.value = '';
      return;
    }

    // Client-side validation: file size
    if (file.size > MAX_FILE_SIZE) {
      toast.error('File size must be under 100MB');
      e.target.value = '';
      return;
    }

    // Upload the file
    uploadPdf({ paperId, file });

    // Reset input to allow re-uploading the same file
    e.target.value = '';
  };

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf"
        onChange={handleFileChange}
        className="hidden"
        aria-label="Upload PDF file"
      />
      <Button
        variant="outline"
        size="sm"
        onClick={handleClick}
        disabled={isPending}
        className="flex items-center gap-2"
      >
        {isPending ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Uploading...
          </>
        ) : (
          <>
            <Upload className="h-4 w-4" />
            Upload PDF
          </>
        )}
      </Button>
    </>
  );
}
