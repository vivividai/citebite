'use client';

import { useCallback, useRef, useState, useEffect, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { useCollectionGraph } from '@/hooks/useCollectionGraph';
import { NodeTooltip } from './NodeTooltip';
import { PaperDetailPanel } from './PaperDetailPanel';
import { ExpandCollectionDialog } from '@/components/collections/ExpandCollectionDialog';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, ZoomIn, ZoomOut, Maximize2, Info } from 'lucide-react';
import type { GraphNode, PositionedNode } from '@/types/graph';
import type { ForceGraphMethods } from 'react-force-graph-2d';

// Dynamic import for react-force-graph-2d (SSR not supported)
const ForceGraph2D = dynamic(() => import('react-force-graph-2d'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  ),
});

interface PaperGraphProps {
  collectionId: string;
}

// Node size constants
const NODE_SIZE = 8;
const X_SIZE = 6;

/**
 * Get node color based on similarity score
 * Higher similarity = darker/more saturated color
 */
function getNodeColor(
  similarity: number | null,
  relationshipType: string
): string {
  // Base colors by relationship type
  if (relationshipType === 'search') {
    return 'hsl(221, 83%, 53%)'; // Blue for search results
  }

  if (similarity === null) {
    return 'hsl(var(--muted-foreground))';
  }

  // For expanded papers: gradient from light to dark based on similarity
  // Using chart-1 color (orange/coral theme)
  const lightness = 70 - similarity * 40; // 70% (low sim) to 30% (high sim)
  return `hsl(12, 76%, ${lightness}%)`;
}

/**
 * Main paper relationship graph component
 */
export function PaperGraph({ collectionId }: PaperGraphProps) {
  const graphRef = useRef<ForceGraphMethods | undefined>();
  const containerRef = useRef<HTMLDivElement>(null);

  // Data fetching
  const {
    data: graphData,
    isLoading,
    error,
  } = useCollectionGraph(collectionId);

  // UI state
  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [expandDialogOpen, setExpandDialogOpen] = useState(false);
  const [expandPaperId, setExpandPaperId] = useState<string | null>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });

  // Update dimensions on resize
  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setDimensions({
          width: rect.width,
          height: Math.max(500, rect.height),
        });
      }
    };

    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, []);

  // Position nodes radially - search nodes in center, expanded nodes outside
  const positionedData = useMemo(() => {
    if (!graphData) return { nodes: [], links: [] };

    const nodes = graphData.nodes.map(node => ({
      ...node,
    })) as PositionedNode[];
    const searchNodes = nodes.filter(n => n.relationshipType === 'search');
    const expandedNodes = nodes.filter(n => n.relationshipType !== 'search');

    // Position search nodes in center cluster
    const centerRadius = Math.min(100, searchNodes.length * 15);
    searchNodes.forEach((node, i) => {
      if (searchNodes.length === 1) {
        node.fx = 0;
        node.fy = 0;
      } else {
        const angle = (2 * Math.PI * i) / searchNodes.length;
        node.fx = Math.cos(angle) * centerRadius;
        node.fy = Math.sin(angle) * centerRadius;
      }
    });

    // Group expanded nodes by source
    const nodesBySource = new Map<string, PositionedNode[]>();
    expandedNodes.forEach(node => {
      const sourceId = node.sourcePaperId || 'unknown';
      if (!nodesBySource.has(sourceId)) {
        nodesBySource.set(sourceId, []);
      }
      nodesBySource.get(sourceId)!.push(node);
    });

    // Position expanded nodes around their source
    nodesBySource.forEach((sourceNodes, sourceId) => {
      const sourceNode = nodes.find(n => n.id === sourceId);
      const sourceX = sourceNode?.fx ?? sourceNode?.x ?? 0;
      const sourceY = sourceNode?.fy ?? sourceNode?.y ?? 0;

      const outerRadius = 150 + Math.random() * 50;
      sourceNodes.forEach((node, i) => {
        const angle =
          (2 * Math.PI * i) / sourceNodes.length + Math.random() * 0.3;
        node.x = sourceX + Math.cos(angle) * outerRadius;
        node.y = sourceY + Math.sin(angle) * outerRadius;
      });
    });

    // Convert edges to links format for react-force-graph
    const links = graphData.edges.map(edge => ({
      source: edge.source,
      target: edge.target,
      relationshipType: edge.relationshipType,
    }));

    return { nodes, links };
  }, [graphData]);

  // Draw node with appropriate shape
  const drawNode = useCallback(
    (node: PositionedNode, ctx: CanvasRenderingContext2D) => {
      const color = getNodeColor(node.similarity, node.relationshipType);
      const isHovered = hoveredNode?.id === node.id;
      const isSelected = selectedNode?.id === node.id;
      const scale = isHovered || isSelected ? 1.3 : 1;

      ctx.save();

      if (node.vectorStatus === 'completed') {
        // Circle for indexed papers
        ctx.beginPath();
        ctx.arc(node.x!, node.y!, NODE_SIZE * scale, 0, 2 * Math.PI);
        ctx.fillStyle = color;
        ctx.fill();

        // Border
        if (isHovered || isSelected) {
          ctx.strokeStyle = 'hsl(var(--foreground))';
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      } else {
        // X mark for non-indexed papers
        const size = X_SIZE * scale;
        ctx.strokeStyle = color;
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';

        ctx.beginPath();
        ctx.moveTo(node.x! - size, node.y! - size);
        ctx.lineTo(node.x! + size, node.y! + size);
        ctx.moveTo(node.x! + size, node.y! - size);
        ctx.lineTo(node.x! - size, node.y! + size);
        ctx.stroke();

        // Outer circle for hover/selection
        if (isHovered || isSelected) {
          ctx.beginPath();
          ctx.arc(node.x!, node.y!, NODE_SIZE * 1.5, 0, 2 * Math.PI);
          ctx.strokeStyle = 'hsl(var(--foreground))';
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
      }

      ctx.restore();
    },
    [hoveredNode, selectedNode]
  );

  // Draw link with appropriate style
  const drawLink = useCallback(
    (
      link: {
        source: PositionedNode;
        target: PositionedNode;
        relationshipType: string;
      },
      ctx: CanvasRenderingContext2D
    ) => {
      ctx.save();

      const isReference = link.relationshipType === 'reference';
      ctx.strokeStyle = isReference
        ? 'hsla(142, 71%, 45%, 0.4)' // Green for references
        : 'hsla(270, 71%, 65%, 0.4)'; // Purple for citations
      ctx.lineWidth = 1.5;

      ctx.beginPath();
      ctx.moveTo(link.source.x!, link.source.y!);
      ctx.lineTo(link.target.x!, link.target.y!);
      ctx.stroke();

      ctx.restore();
    },
    []
  );

  // Handle node hover
  const handleNodeHover = useCallback(
    (node: PositionedNode | null, event?: MouseEvent) => {
      setHoveredNode(node);
      if (event && node) {
        setTooltipPosition({ x: event.clientX, y: event.clientY });
      }
    },
    []
  );

  // Handle node click
  const handleNodeClick = useCallback((node: PositionedNode) => {
    setSelectedNode(node);
  }, []);

  // Handle double-click to expand
  const handleNodeDoubleClick = useCallback((node: PositionedNode) => {
    setExpandPaperId(node.id);
    setExpandDialogOpen(true);
  }, []);

  // Handle expand from detail panel
  const handleExpand = useCallback((paperId: string) => {
    setExpandPaperId(paperId);
    setExpandDialogOpen(true);
    setSelectedNode(null);
  }, []);

  // Zoom controls
  const handleZoomIn = () => graphRef.current?.zoom(1.5, 400);
  const handleZoomOut = () => graphRef.current?.zoom(0.67, 400);
  const handleFitView = () => graphRef.current?.zoomToFit(400, 50);

  // Loading state
  if (isLoading) {
    return (
      <Card className="h-[600px]">
        <CardContent className="flex items-center justify-center h-full">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  // Error state
  if (error) {
    return (
      <Card className="h-[600px]">
        <CardContent className="flex flex-col items-center justify-center h-full gap-4">
          <p className="text-destructive">Failed to load graph data</p>
          <p className="text-sm text-muted-foreground">
            {error instanceof Error ? error.message : 'Unknown error'}
          </p>
        </CardContent>
      </Card>
    );
  }

  // Empty state
  if (!graphData || graphData.nodes.length === 0) {
    return (
      <Card className="h-[600px]">
        <CardContent className="flex flex-col items-center justify-center h-full gap-4">
          <Info className="h-12 w-12 text-muted-foreground" />
          <p className="text-muted-foreground">No papers to display</p>
        </CardContent>
      </Card>
    );
  }

  const expandPaper = graphData.nodes.find(n => n.id === expandPaperId);

  return (
    <Card className="relative">
      {/* Legend */}
      <div className="absolute top-4 left-4 z-10 bg-background/90 backdrop-blur-sm rounded-lg p-3 border shadow-sm">
        <h4 className="text-xs font-medium mb-2">Legend</h4>
        <div className="space-y-1.5 text-xs">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-blue-500" />
            <span>Initial search</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-[hsl(12,76%,50%)]" />
            <span>Expanded (by similarity)</span>
          </div>
          <div className="flex items-center gap-2 pt-1 border-t">
            <div className="w-3 h-3 rounded-full border-2 border-current" />
            <span>PDF indexed</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-lg leading-none">×</span>
            <span>No PDF</span>
          </div>
        </div>
      </div>

      {/* Zoom controls */}
      <div className="absolute top-4 right-4 z-10 flex flex-col gap-1">
        <Button variant="outline" size="icon" onClick={handleZoomIn}>
          <ZoomIn className="h-4 w-4" />
        </Button>
        <Button variant="outline" size="icon" onClick={handleZoomOut}>
          <ZoomOut className="h-4 w-4" />
        </Button>
        <Button variant="outline" size="icon" onClick={handleFitView}>
          <Maximize2 className="h-4 w-4" />
        </Button>
      </div>

      {/* Graph container */}
      <CardContent ref={containerRef} className="p-0 h-[600px]">
        <ForceGraph2D
          ref={graphRef}
          graphData={positionedData}
          width={dimensions.width}
          height={dimensions.height}
          nodeCanvasObject={drawNode as never}
          linkCanvasObject={drawLink as never}
          onNodeHover={handleNodeHover as never}
          onNodeClick={handleNodeClick as never}
          onNodeRightClick={handleNodeDoubleClick as never}
          nodePointerAreaPaint={
            ((
              node: PositionedNode,
              color: string,
              ctx: CanvasRenderingContext2D
            ) => {
              ctx.fillStyle = color;
              ctx.beginPath();
              ctx.arc(node.x!, node.y!, NODE_SIZE * 1.5, 0, 2 * Math.PI);
              ctx.fill();
            }) as never
          }
          enableNodeDrag={false}
          cooldownTicks={100}
          d3AlphaDecay={0.02}
          d3VelocityDecay={0.3}
        />
      </CardContent>

      {/* Tooltip */}
      {hoveredNode && !selectedNode && (
        <NodeTooltip node={hoveredNode} position={tooltipPosition} />
      )}

      {/* Detail panel */}
      <PaperDetailPanel
        node={selectedNode}
        onClose={() => setSelectedNode(null)}
        onExpand={handleExpand}
      />

      {/* Expand dialog */}
      {expandPaper && (
        <ExpandCollectionDialog
          open={expandDialogOpen}
          onOpenChange={setExpandDialogOpen}
          collectionId={collectionId}
          paperId={expandPaper.id}
          paperTitle={expandPaper.title}
        />
      )}
    </Card>
  );
}
