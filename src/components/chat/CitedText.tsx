'use client';

import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { GroundingChunk, GroundingSupport } from '@/lib/db/messages';

interface CitedTextProps {
  content: string;
  groundingChunks?: GroundingChunk[];
  groundingSupports?: GroundingSupport[];
}

interface TextSegment {
  text: string;
  chunkIndices?: number[]; // If present, this segment is cited
  startIndex: number;
  endIndex: number;
}

/**
 * Parse text into segments with citation information
 * Based on groundingSupports from Gemini File Search API
 */
function parseTextSegments(
  content: string,
  supports: GroundingSupport[]
): TextSegment[] {
  if (supports.length === 0) {
    return [{ text: content, startIndex: 0, endIndex: content.length }];
  }

  // Sort supports by startIndex
  const sortedSupports = [...supports].sort(
    (a, b) => a.segment.startIndex - b.segment.startIndex
  );

  const segments: TextSegment[] = [];
  let lastIndex = 0;

  for (const support of sortedSupports) {
    const { startIndex, endIndex } = support.segment;

    // Add uncited text before this segment
    if (startIndex > lastIndex) {
      segments.push({
        text: content.slice(lastIndex, startIndex),
        startIndex: lastIndex,
        endIndex: startIndex,
      });
    }

    // Add cited segment
    segments.push({
      text: content.slice(startIndex, endIndex),
      chunkIndices: support.groundingChunkIndices,
      startIndex,
      endIndex,
    });

    lastIndex = endIndex;
  }

  // Add remaining uncited text
  if (lastIndex < content.length) {
    segments.push({
      text: content.slice(lastIndex),
      startIndex: lastIndex,
      endIndex: content.length,
    });
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
 * CitedText component renders text with interactive citation markers
 *
 * Segments that are cited (have groundingSupport) are highlighted and show
 * a tooltip on hover with the source chunk preview.
 */
export function CitedText({
  content,
  groundingChunks = [],
  groundingSupports = [],
}: CitedTextProps) {
  const [hoveredSegment, setHoveredSegment] = useState<number | null>(null);

  // If no grounding data, render plain markdown
  if (groundingSupports.length === 0 || groundingChunks.length === 0) {
    return (
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
    );
  }

  // Parse text into segments with citation info
  const segments = parseTextSegments(content, groundingSupports);

  return (
    <div className="space-y-2">
      {segments.map((segment, index) => {
        const isCited = !!segment.chunkIndices;

        if (isCited) {
          return (
            <span
              key={index}
              className="relative inline bg-blue-50 border-b-2 border-blue-300 cursor-help hover:bg-blue-100 transition-colors"
              onMouseEnter={() => setHoveredSegment(index)}
              onMouseLeave={() => setHoveredSegment(null)}
            >
              {segment.text}
              <ChunkTooltip
                chunks={groundingChunks}
                chunkIndices={segment.chunkIndices!}
                isVisible={hoveredSegment === index}
              />
            </span>
          );
        }

        // Uncited segment - render as plain text
        return <span key={index}>{segment.text}</span>;
      })}
    </div>
  );
}
