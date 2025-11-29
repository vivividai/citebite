'use client';

import React, { useState, useMemo, useCallback } from 'react';
import ReactMarkdown, { Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { GroundingChunk, GroundingSupport } from '@/lib/db/messages';

interface CitedTextProps {
  content: string;
  groundingChunks?: GroundingChunk[];
  groundingSupports?: GroundingSupport[];
}

interface CitationRange {
  startIndex: number;
  endIndex: number;
  chunkIndices: number[];
}

/**
 * Build a lookup structure for citation ranges
 */
function buildCitationRanges(supports: GroundingSupport[]): CitationRange[] {
  return supports
    .map(support => ({
      startIndex: support.segment.startIndex,
      endIndex: support.segment.endIndex,
      chunkIndices: support.groundingChunkIndices,
    }))
    .sort((a, b) => a.startIndex - b.startIndex);
}

/**
 * Find which citation ranges overlap with a given text position
 */
function findOverlappingCitations(
  textStart: number,
  textEnd: number,
  citationRanges: CitationRange[]
): CitationRange[] {
  return citationRanges.filter(
    range => range.startIndex < textEnd && range.endIndex > textStart
  );
}

/**
 * Split text into segments based on citation overlaps
 */
function splitTextWithCitations(
  text: string,
  textStartInContent: number,
  citationRanges: CitationRange[]
): Array<{ text: string; chunkIndices?: number[] }> {
  const textEnd = textStartInContent + text.length;
  const overlapping = findOverlappingCitations(
    textStartInContent,
    textEnd,
    citationRanges
  );

  if (overlapping.length === 0) {
    return [{ text }];
  }

  const segments: Array<{ text: string; chunkIndices?: number[] }> = [];

  // Collect all boundary points within this text
  const boundaries = new Set<number>();
  boundaries.add(0);
  boundaries.add(text.length);

  for (const range of overlapping) {
    const relativeStart = Math.max(0, range.startIndex - textStartInContent);
    const relativeEnd = Math.min(
      text.length,
      range.endIndex - textStartInContent
    );
    if (relativeStart >= 0 && relativeStart <= text.length) {
      boundaries.add(relativeStart);
    }
    if (relativeEnd >= 0 && relativeEnd <= text.length) {
      boundaries.add(relativeEnd);
    }
  }

  const sortedBoundaries = Array.from(boundaries).sort((a, b) => a - b);

  for (let i = 0; i < sortedBoundaries.length - 1; i++) {
    const start = sortedBoundaries[i];
    const end = sortedBoundaries[i + 1];
    const segmentText = text.slice(start, end);

    if (segmentText.length === 0) continue;

    // Find which citations cover this segment
    const segmentStartInContent = textStartInContent + start;
    const segmentEndInContent = textStartInContent + end;

    const coveringCitations = overlapping.filter(
      range =>
        range.startIndex <= segmentStartInContent &&
        range.endIndex >= segmentEndInContent
    );

    if (coveringCitations.length > 0) {
      // Merge all chunk indices
      const allChunkIndices = Array.from(
        new Set(coveringCitations.flatMap(c => c.chunkIndices))
      );
      segments.push({ text: segmentText, chunkIndices: allChunkIndices });
    } else {
      segments.push({ text: segmentText });
    }
  }

  return segments;
}

/**
 * Tooltip component showing chunk preview
 */
function ChunkTooltip({
  chunks,
  chunkIndices,
  isVisible,
}: {
  chunks: GroundingChunk[];
  chunkIndices: number[];
  isVisible: boolean;
}) {
  if (!isVisible) return null;

  return (
    <div className="absolute z-50 bottom-full left-0 mb-2 w-80 max-w-[90vw] bg-gray-900 text-white text-xs rounded-lg shadow-lg p-3 pointer-events-none">
      <div className="space-y-2">
        {chunkIndices.map((index, i) => {
          const chunk = chunks[index];
          if (!chunk?.retrievedContext?.text) return null;

          const preview = chunk.retrievedContext.text.slice(0, 200);
          return (
            <div key={i} className="border-l-2 border-blue-400 pl-2">
              <p className="font-medium text-blue-300 mb-1">
                Source {index + 1}
              </p>
              <p className="text-gray-200 line-clamp-3">
                {preview}
                {chunk.retrievedContext.text.length > 200 && '...'}
              </p>
            </div>
          );
        })}
      </div>
      {/* Tooltip arrow */}
      <div className="absolute top-full left-4 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900" />
    </div>
  );
}

/**
 * Highlighted citation span component
 */
function CitationSpan({
  children,
  chunkIndices,
  chunks,
  segmentKey,
  hoveredSegment,
  setHoveredSegment,
}: {
  children: React.ReactNode;
  chunkIndices: number[];
  chunks: GroundingChunk[];
  segmentKey: string;
  hoveredSegment: string | null;
  setHoveredSegment: (key: string | null) => void;
}) {
  return (
    <span
      className="relative inline bg-blue-50 border-b-2 border-blue-300 cursor-help hover:bg-blue-100 transition-colors"
      onMouseEnter={() => setHoveredSegment(segmentKey)}
      onMouseLeave={() => setHoveredSegment(null)}
    >
      {children}
      <ChunkTooltip
        chunks={chunks}
        chunkIndices={chunkIndices}
        isVisible={hoveredSegment === segmentKey}
      />
    </span>
  );
}

/**
 * Context for passing citation data through the component tree
 */
interface CitationContextValue {
  citationRanges: CitationRange[];
  chunks: GroundingChunk[];
  getTextPosition: () => number;
  advancePosition: (length: number) => void;
  hoveredSegment: string | null;
  setHoveredSegment: (key: string | null) => void;
}

const CitationContext = React.createContext<CitationContextValue | null>(null);

/**
 * Text renderer that applies citation highlighting
 */
function CitedTextNode({ children }: { children: string }) {
  const ctx = React.useContext(CitationContext);
  if (!ctx) return <>{children}</>;

  const {
    citationRanges,
    chunks,
    getTextPosition,
    advancePosition,
    hoveredSegment,
    setHoveredSegment,
  } = ctx;

  const textStart = getTextPosition();
  const segments = splitTextWithCitations(children, textStart, citationRanges);
  advancePosition(children.length);

  return (
    <>
      {segments.map((segment, idx) => {
        const key = `${textStart}-${idx}`;
        if (segment.chunkIndices) {
          return (
            <CitationSpan
              key={key}
              chunkIndices={segment.chunkIndices}
              chunks={chunks}
              segmentKey={key}
              hoveredSegment={hoveredSegment}
              setHoveredSegment={setHoveredSegment}
            >
              {segment.text}
            </CitationSpan>
          );
        }
        return <React.Fragment key={key}>{segment.text}</React.Fragment>;
      })}
    </>
  );
}

/**
 * Recursively process React children to apply citation highlighting to text nodes
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
 * Create markdown components that preserve block structure while applying citations
 */
function createMarkdownComponents(): Components {
  return {
    // Block elements - preserved with proper styling
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

    // Lists - proper block structure
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
 * CitedText component renders markdown with interactive citation markers
 *
 * Text segments that are cited (have groundingSupport) are highlighted and show
 * a tooltip on hover with the source chunk preview. Block structure (paragraphs,
 * lists, headers) is preserved for proper formatting.
 */
export function CitedText({
  content,
  groundingChunks = [],
  groundingSupports = [],
}: CitedTextProps) {
  const [hoveredSegment, setHoveredSegment] = useState<string | null>(null);

  // Build citation ranges once
  const citationRanges = useMemo(
    () => buildCitationRanges(groundingSupports),
    [groundingSupports]
  );

  // Position tracker for mapping markdown text to original content positions
  // We use a ref-like pattern with closure to track position across renders
  const positionRef = React.useRef(0);

  // Reset position on each render
  positionRef.current = 0;

  const getTextPosition = useCallback(() => positionRef.current, []);
  const advancePosition = useCallback((length: number) => {
    positionRef.current += length;
  }, []);

  // Create markdown components
  const components = useMemo(() => createMarkdownComponents(), []);

  // If no grounding data, render plain markdown
  if (groundingSupports.length === 0 || groundingChunks.length === 0) {
    return (
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    );
  }

  // Context value for citation data
  const contextValue: CitationContextValue = {
    citationRanges,
    chunks: groundingChunks,
    getTextPosition,
    advancePosition,
    hoveredSegment,
    setHoveredSegment,
  };

  return (
    <CitationContext.Provider value={contextValue}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </CitationContext.Provider>
  );
}
