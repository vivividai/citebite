'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function SemanticScholarTestPage() {
  const [keywords, setKeywords] = useState('attention mechanism');
  const [limit, setLimit] = useState('5');
  const [yearFrom, setYearFrom] = useState('');
  const [yearTo, setYearTo] = useState('');
  const [minCitations, setMinCitations] = useState('');
  const [openAccessOnly, setOpenAccessOnly] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    query: Record<string, unknown>;
    duration: string;
    total?: number;
    offset?: number;
    next?: number;
    count: number;
    papers: Array<{
      paperId: string;
      title: string;
      authors: string;
      year?: number;
      citationCount?: number;
      venue?: string;
      hasOpenAccessPdf: boolean;
      pdfUrl?: string;
      abstract?: string;
    }>;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSearch = async () => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const params = new URLSearchParams({
        keywords,
        limit,
      });

      if (yearFrom) params.append('yearFrom', yearFrom);
      if (yearTo) params.append('yearTo', yearTo);
      if (minCitations) params.append('minCitations', minCitations);
      if (openAccessOnly) params.append('openAccessOnly', 'true');

      const response = await fetch(`/api/test/semantic-scholar?${params}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Search failed');
      }

      setResult(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto p-8 max-w-6xl">
      <h1 className="text-3xl font-bold mb-8">
        Semantic Scholar API Test Page
      </h1>

      {/* Search Form */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Search Parameters</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Keywords *</label>
            <Input
              value={keywords}
              onChange={e => setKeywords(e.target.value)}
              placeholder="e.g., machine learning, attention mechanism"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">Limit</label>
              <Input
                type="number"
                value={limit}
                onChange={e => setLimit(e.target.value)}
                placeholder="10"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">
                Min Citations
              </label>
              <Input
                type="number"
                value={minCitations}
                onChange={e => setMinCitations(e.target.value)}
                placeholder="e.g., 100"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">
                Year From
              </label>
              <Input
                type="number"
                value={yearFrom}
                onChange={e => setYearFrom(e.target.value)}
                placeholder="e.g., 2020"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Year To</label>
              <Input
                type="number"
                value={yearTo}
                onChange={e => setYearTo(e.target.value)}
                placeholder="e.g., 2024"
              />
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="openAccessOnly"
              checked={openAccessOnly}
              onChange={e => setOpenAccessOnly(e.target.checked)}
              className="h-4 w-4"
            />
            <label htmlFor="openAccessOnly" className="text-sm font-medium">
              Open Access Only (Free PDF Available)
            </label>
          </div>

          <Button onClick={handleSearch} disabled={loading} className="w-full">
            {loading ? 'Searching...' : 'Search Papers'}
          </Button>
        </CardContent>
      </Card>

      {/* Error Message */}
      {error && (
        <Card className="mb-8 border-red-500">
          <CardContent className="pt-6">
            <p className="text-red-500">Error: {error}</p>
          </CardContent>
        </Card>
      )}

      {/* Search Results */}
      {result && (
        <>
          {/* Summary */}
          <Card className="mb-8">
            <CardHeader>
              <CardTitle>Search Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <p className="text-gray-500">Duration</p>
                  <p className="font-semibold">{result.duration}</p>
                </div>
                <div>
                  <p className="text-gray-500">Total Results</p>
                  <p className="font-semibold">{result.total || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-gray-500">Returned</p>
                  <p className="font-semibold">{result.count}</p>
                </div>
                <div>
                  <p className="text-gray-500">Offset</p>
                  <p className="font-semibold">{result.offset || 0}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Papers List */}
          <div className="space-y-4">
            <h2 className="text-2xl font-bold">
              Papers ({result.count} results)
            </h2>
            {result.papers.map((paper, index: number) => (
              <Card key={paper.paperId}>
                <CardHeader>
                  <CardTitle className="text-lg">
                    {index + 1}. {paper.title}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                    <div>
                      <p className="text-gray-500">Authors</p>
                      <p>{paper.authors}</p>
                    </div>
                    <div>
                      <p className="text-gray-500">Year</p>
                      <p>{paper.year || 'N/A'}</p>
                    </div>
                    <div>
                      <p className="text-gray-500">Citations</p>
                      <p>{paper.citationCount || 'N/A'}</p>
                    </div>
                    <div>
                      <p className="text-gray-500">Venue</p>
                      <p>{paper.venue || 'N/A'}</p>
                    </div>
                  </div>

                  {paper.abstract && (
                    <div className="mt-2">
                      <p className="text-gray-500 text-sm">Abstract</p>
                      <p className="text-sm">{paper.abstract}</p>
                    </div>
                  )}

                  {paper.hasOpenAccessPdf && (
                    <div className="mt-2">
                      <a
                        href={paper.pdfUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline text-sm"
                      >
                        📄 Download PDF (Open Access)
                      </a>
                    </div>
                  )}

                  <div className="mt-2">
                    <p className="text-xs text-gray-400">
                      Paper ID: {paper.paperId}
                    </p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}

      {/* Example Queries */}
      <Card className="mt-8">
        <CardHeader>
          <CardTitle>예제 검색어</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setKeywords('attention mechanism');
                setLimit('5');
                setYearFrom('2017');
                setYearTo('2020');
                setMinCitations('1000');
                setOpenAccessOnly(true);
              }}
            >
              Attention Mechanism (2017-2020, 1000+ citations, Open Access)
            </Button>
          </div>
          <div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setKeywords('deep learning');
                setLimit('10');
                setYearFrom('2020');
                setYearTo('2024');
                setMinCitations('');
                setOpenAccessOnly(false);
              }}
            >
              Deep Learning (2020-2024)
            </Button>
          </div>
          <div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setKeywords('transformer language model');
                setLimit('5');
                setYearFrom('');
                setYearTo('');
                setMinCitations('500');
                setOpenAccessOnly(true);
              }}
            >
              Transformer Language Models (500+ citations, Open Access)
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
