'use client';

import React, { useState, useMemo, Fragment } from 'react';
import ReactMarkdown, { Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { GroundingChunk, GroundingSupport } from '@/lib/db/messages';
import { SourceDetailDialog } from './SourceDetailDialog';

interface CitedTextProps {
  content: string;
  groundingChunks?: GroundingChunk[];
  groundingSupports?: GroundingSupport[];
  /** Map of paper_id to paper metadata for displaying paper info in source dialog */
  paperMap?: Map<
    string,
    {
      paper_id: string;
      title: string;
      year: number | null;
      authors: { name: string }[] | null;
    }
  >;
  /** Collection ID for linking to paper detail */
  collectionId?: string;
}

/**
 * Segment types for parsed text
 */
type TextSegment =
  | { type: 'text'; content: string }
  | { type: 'cite'; indices: number[] };

/**
 * Parse [CITE:N] markers from text and split into segments
 * Returns array of text or citation references
 */
function parseTextWithCitations(text: string): Array<TextSegment> {
  const segments: Array<TextSegment> = [];
  // Regex for [CITE:N] patterns (supports multiple like [CITE:1,2,3])
  const markerRegex = /\[CITE:(\d+(?:,\s*\d+)*)\]/g;

  let lastIndex = 0;
  let match;

  while ((match = markerRegex.exec(text)) !== null) {
    // Add text before this marker
    if (match.index > lastIndex) {
      segments.push({
        type: 'text',
        content: text.slice(lastIndex, match.index),
      });
    }

    // Parse citation indices - convert 1-indexed [CITE:N] to 0-indexed array access
    // [CITE:1] → index 0, [CITE:2] → index 1, etc.
    const indices = match[1]
      .split(',')
      .map(n => parseInt(n.trim(), 10) - 1) // Convert to 0-indexed
      .filter(n => !isNaN(n) && n >= 0);

    if (indices.length > 0) {
      segments.push({
        type: 'cite',
        indices,
      });
    }

    lastIndex = match.index + match[0].length;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    segments.push({
      type: 'text',
      content: text.slice(lastIndex),
    });
  }

  return segments;
}

/**
 * Clickable citation number component
 */
function CitationNumber({
  indices,
  onCitationClick,
}: {
  indices: number[];
  onCitationClick: (index: number) => void;
}) {
  return (
    <span className="inline-flex gap-0.5">
      {indices.map((idx, i) => (
        <button
          key={i}
          onClick={() => onCitationClick(idx)}
          className="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded transition-colors cursor-pointer align-super"
          title={`View source ${idx + 1}`}
        >
          {idx + 1}
        </button>
      ))}
    </span>
  );
}

/**
 * Context for passing citation click handlers through markdown components
 */
interface CitationContextValue {
  chunks: GroundingChunk[];
  onCitationClick: (index: number) => void;
}

const CitationContext = React.createContext<CitationContextValue | null>(null);

/**
 * Text node renderer that handles [CITE:N] markers
 */
function CitedTextNode({ children }: { children: string }) {
  const ctx = React.useContext(CitationContext);
  if (!ctx) return <>{children}</>;

  const segments = parseTextWithCitations(children);

  return (
    <>
      {segments.map((segment, idx) => {
        if (segment.type === 'text') {
          return <Fragment key={idx}>{segment.content}</Fragment>;
        }

        if (segment.type === 'cite') {
          // Filter to valid indices
          const validIndices = segment.indices.filter(
            i => i < ctx.chunks.length
          );
          if (validIndices.length === 0) return null;

          return (
            <CitationNumber
              key={idx}
              indices={validIndices}
              onCitationClick={ctx.onCitationClick}
            />
          );
        }

        return null;
      })}
    </>
  );
}

/**
 * Recursively process React children to handle citation markers in text
 */
function processChildren(children: React.ReactNode): React.ReactNode {
  return React.Children.map(children, child => {
    if (typeof child === 'string') {
      return <CitedTextNode>{child}</CitedTextNode>;
    }
    if (React.isValidElement(child) && child.props.children) {
      return React.cloneElement(child, {
        ...child.props,
        children: processChildren(child.props.children),
      });
    }
    return child;
  });
}

/**
 * Create markdown components that process citation markers
 */
function createMarkdownComponents(): Components {
  return {
    // Block elements
    p: ({ children }) => (
      <p className="my-2 leading-relaxed">{processChildren(children)}</p>
    ),

    h1: ({ children }) => (
      <h1 className="text-xl font-bold my-3">{processChildren(children)}</h1>
    ),
    h2: ({ children }) => (
      <h2 className="text-lg font-bold my-2.5">{processChildren(children)}</h2>
    ),
    h3: ({ children }) => (
      <h3 className="text-base font-semibold my-2">
        {processChildren(children)}
      </h3>
    ),
    h4: ({ children }) => (
      <h4 className="text-sm font-semibold my-1.5">
        {processChildren(children)}
      </h4>
    ),

    // Lists
    ul: ({ children }) => (
      <ul className="my-2 ml-4 list-disc space-y-1">{children}</ul>
    ),
    ol: ({ children }) => (
      <ol className="my-2 ml-4 list-decimal space-y-1">{children}</ol>
    ),
    li: ({ children }) => (
      <li className="leading-relaxed">{processChildren(children)}</li>
    ),

    // Blockquote
    blockquote: ({ children }) => (
      <blockquote className="my-2 pl-4 border-l-4 border-gray-300 italic text-gray-600">
        {children}
      </blockquote>
    ),

    // Horizontal rule
    hr: () => <hr className="my-4 border-gray-200" />,

    // Code blocks
    code: props => {
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

    // Pre blocks
    pre: ({ children }) => <>{children}</>,

    // Links
    a: props => (
      <a
        {...props}
        className="text-blue-600 hover:text-blue-800 hover:underline"
        target="_blank"
        rel="noopener noreferrer"
      />
    ),

    // Inline formatting
    strong: ({ children }) => (
      <strong className="font-semibold">{processChildren(children)}</strong>
    ),
    em: ({ children }) => <em>{processChildren(children)}</em>,
    del: ({ children }) => <del>{processChildren(children)}</del>,

    // Tables
    table: ({ children }) => (
      <div className="my-2 overflow-x-auto">
        <table className="min-w-full border-collapse border border-gray-300">
          {children}
        </table>
      </div>
    ),
    thead: ({ children }) => <thead className="bg-gray-100">{children}</thead>,
    tbody: ({ children }) => <tbody>{children}</tbody>,
    tr: ({ children }) => (
      <tr className="border-b border-gray-300">{children}</tr>
    ),
    th: ({ children }) => (
      <th className="px-3 py-2 text-left font-semibold border border-gray-300">
        {processChildren(children)}
      </th>
    ),
    td: ({ children }) => (
      <td className="px-3 py-2 border border-gray-300">
        {processChildren(children)}
      </td>
    ),
  };
}

/**
 * CitedText component renders markdown with clickable citation markers
 *
 * Parses [CITE:N] markers in the text and renders them as clickable
 * buttons that open SourceDetailDialog showing the source content.
 * Works for both text and figure chunks - the dialog handles display.
 */
export function CitedText({
  content,
  groundingChunks = [],
  paperMap,
  collectionId,
}: CitedTextProps) {
  // State for source dialog
  const [selectedChunk, setSelectedChunk] = useState<GroundingChunk | null>(
    null
  );
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  // Create markdown components
  const components = useMemo(() => createMarkdownComponents(), []);

  const handleCitationClick = (index: number) => {
    if (index >= 0 && index < groundingChunks.length) {
      setSelectedChunk(groundingChunks[index]);
      setSelectedIndex(index);
      setIsDialogOpen(true);
    }
  };

  // If no grounding chunks, render plain markdown
  if (groundingChunks.length === 0) {
    return (
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    );
  }

  // Context value for citation handling
  const contextValue: CitationContextValue = {
    chunks: groundingChunks,
    onCitationClick: handleCitationClick,
  };

  return (
    <>
      <CitationContext.Provider value={contextValue}>
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
          {content}
        </ReactMarkdown>
      </CitationContext.Provider>

      {/* Source Detail Dialog (handles both text and figure chunks) */}
      <SourceDetailDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        chunk={selectedChunk}
        sourceIndex={selectedIndex}
        paperMap={paperMap}
        collectionId={collectionId}
      />
    </>
  );
}
