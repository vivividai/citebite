'use client';

import { Bot } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { CitationCard, CitedPaper } from './CitationCard';

interface AssistantMessageProps {
  content: string;
  timestamp: string | null;
  citedPapers?: CitedPaper[];
  collectionId: string;
}

export function AssistantMessage({
  content,
  timestamp,
  citedPapers = [],
  collectionId,
}: AssistantMessageProps) {
  const timeAgo = timestamp
    ? formatDistanceToNow(new Date(timestamp), { addSuffix: true })
    : null;

  return (
    <div className="flex gap-3">
      <div className="h-8 w-8 rounded-full bg-purple-100 flex items-center justify-center shrink-0">
        <Bot className="h-4 w-4 text-purple-600" />
      </div>
      <div className="flex flex-col max-w-[80%]">
        <div className="bg-gray-100 rounded-2xl rounded-tl-sm px-4 py-2.5">
          <div className="prose prose-sm max-w-none prose-p:my-2 prose-p:leading-relaxed prose-pre:my-2 prose-headings:my-2">
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
          </div>
        </div>
        {timeAgo && (
          <span className="text-xs text-muted-foreground mt-1">{timeAgo}</span>
        )}
        {citedPapers.length > 0 && (
          <div className="mt-3 space-y-2">
            <p className="text-xs font-medium text-muted-foreground">
              Citations ({citedPapers.length})
            </p>
            {citedPapers.map(paper => (
              <CitationCard
                key={paper.paperId}
                paper={paper}
                collectionId={collectionId}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
