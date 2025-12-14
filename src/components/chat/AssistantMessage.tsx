'use client';

import { useState } from 'react';
import { Bot, FileText } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { CitationCard, CitedPaper } from './CitationCard';
import { CitedText } from './CitedText';
import { SourceDetailDialog, PaperInfo } from './SourceDetailDialog';
import { GroundingChunk } from '@/lib/db/messages';

interface AssistantMessageProps {
  content: string;
  timestamp: string | null;
  citedPapers?: CitedPaper[];
  collectionId: string;
  /** Map of paper_id to paper metadata for displaying paper info in source dialog */
  paperMap?: Map<string, PaperInfo>;
}

export function AssistantMessage({
  content,
  timestamp,
  citedPapers = [],
  collectionId,
  paperMap,
}: AssistantMessageProps) {
  const [selectedChunk, setSelectedChunk] = useState<GroundingChunk | null>(
    null
  );
  const [selectedChunkIndex, setSelectedChunkIndex] = useState<number>(0);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const timeAgo = timestamp
    ? formatDistanceToNow(new Date(timestamp), { addSuffix: true })
    : null;

  // Extract grounding data from citedPapers (new format)
  const groundingData = citedPapers[0];
  const groundingChunks = groundingData?.chunks as GroundingChunk[] | undefined;
  // Check if this is new grounding-based citation format
  const hasGroundingData = groundingChunks && groundingChunks.length > 0;

  // Filter for legacy paper citations (paperId-based)
  const legacyPaperCitations = citedPapers.filter(p => p.paperId);

  const handleSourceClick = (chunk: GroundingChunk, index: number) => {
    setSelectedChunk(chunk);
    setSelectedChunkIndex(index);
    setIsDialogOpen(true);
  };

  return (
    <div className="flex gap-3">
      <div className="h-8 w-8 rounded-full bg-purple-100 flex items-center justify-center shrink-0">
        <Bot className="h-4 w-4 text-purple-600" />
      </div>
      <div className="flex flex-col max-w-[80%]">
        <div className="bg-gray-100 rounded-2xl rounded-tl-sm px-4 py-2.5">
          <div className="prose prose-sm max-w-none prose-p:my-1.5 prose-p:leading-relaxed prose-headings:my-2 prose-headings:font-semibold prose-ul:my-1.5 prose-ol:my-1.5 prose-li:my-0.5 prose-pre:my-2">
            {hasGroundingData ? (
              <CitedText
                content={content}
                groundingChunks={groundingChunks}
                paperMap={paperMap}
                collectionId={collectionId}
              />
            ) : (
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  code(props) {
                    const { children, className } = props;
                    const match = /language-(\w+)/.exec(className || '');
                    const isInline = !match;

                    if (isInline) {
                      return (
                        <code className="bg-gray-200 text-red-600 px-1.5 py-0.5 rounded text-xs font-mono">
                          {children}
                        </code>
                      );
                    }

                    return (
                      <SyntaxHighlighter
                        style={vscDarkPlus}
                        language={match[1]}
                        PreTag="div"
                        className="rounded-md !my-2"
                      >
                        {String(children).replace(/\n$/, '')}
                      </SyntaxHighlighter>
                    );
                  },
                  a(props) {
                    return (
                      <a
                        {...props}
                        className="text-blue-600 hover:text-blue-800 hover:underline"
                        target="_blank"
                        rel="noopener noreferrer"
                      />
                    );
                  },
                }}
              >
                {content}
              </ReactMarkdown>
            )}
          </div>
        </div>
        {timeAgo && (
          <span className="text-xs text-muted-foreground mt-1">{timeAgo}</span>
        )}

        {/* Show unified sources list */}
        {hasGroundingData && groundingChunks && (
          <div className="mt-3 space-y-2">
            <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <FileText className="h-3.5 w-3.5" />
              Sources ({groundingChunks.length})
            </p>
            <div className="flex flex-wrap gap-2">
              {groundingChunks.map((chunk, index) => (
                <button
                  key={`source-${index}`}
                  className="px-3 py-1.5 text-xs bg-blue-50 text-blue-700 border border-blue-200 rounded-md hover:bg-blue-100 transition-colors"
                  onClick={() => handleSourceClick(chunk, index)}
                >
                  Source {index + 1}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Show legacy paper citations (for backward compatibility) */}
        {legacyPaperCitations.length > 0 && (
          <div className="mt-3 space-y-2">
            <p className="text-xs font-medium text-muted-foreground">
              Citations ({legacyPaperCitations.length})
            </p>
            {legacyPaperCitations.map(paper => (
              <CitationCard
                key={paper.paperId}
                paper={paper}
                collectionId={collectionId}
              />
            ))}
          </div>
        )}
      </div>

      {/* Source Detail Dialog (handles both text and figure chunks) */}
      <SourceDetailDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        chunk={selectedChunk}
        sourceIndex={selectedChunkIndex}
        paperMap={paperMap}
        collectionId={collectionId}
      />
    </div>
  );
}
