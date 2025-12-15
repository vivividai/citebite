'use client';

import { useCallback, useRef, useState, useEffect, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import dynamic from 'next/dynamic';
import * as d3Hierarchy from 'd3-hierarchy';
import { useCollectionGraph } from '@/hooks/useCollectionGraph';
import { useExpandCollection } from '@/hooks/useExpandCollection';
import { useBatchRemovePapers } from '@/hooks/useBatchRemovePapers';
import { NodeTooltip } from './NodeTooltip';
import { PaperDetailPanel } from './PaperDetailPanel';
import { ExpandCollectionDialog } from '@/components/collections/ExpandCollectionDialog';
import { AutoExpandDialog } from '@/components/collections/AutoExpandDialog';
import { PaperPreviewDialog } from '@/components/collections/PaperPreviewDialog';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Loader2, Info, Sparkles, RefreshCw } from 'lucide-react';
import type { GraphNode, PositionedNode } from '@/types/graph';
import type { ForceGraphMethods } from 'react-force-graph-2d';
import type { PaperPreview } from '@/lib/search/types';
import toast from 'react-hot-toast';

// Type for hierarchy node data
interface HierarchyNodeData extends GraphNode {
  children?: HierarchyNodeData[];
  isVirtualRoot?: boolean;
}

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
 * - Blue (50%+): High relevance
 * - Green (40-49%): Good relevance
 * - Yellow (30-39%): Medium relevance
 * - Red (<30%): Low relevance
 */
function getNodeColor(similarity: number | null): string {
  if (similarity === null) {
    return 'hsl(var(--muted-foreground))'; // Gray for no embedding
  }

  if (similarity >= 0.5) return 'hsl(217, 91%, 60%)'; // Blue
  if (similarity >= 0.4) return 'hsl(142, 71%, 45%)'; // Green
  if (similarity >= 0.3) return 'hsl(48, 96%, 53%)'; // Yellow
  return 'hsl(0, 84%, 60%)'; // Red
}

/**
 * Build a hierarchy structure from flat nodes using sourcePaperId as parent reference
 * Creates a virtual root if there are multiple seed papers (degree 0)
 */
function buildHierarchy(
  nodes: GraphNode[]
): d3Hierarchy.HierarchyNode<HierarchyNodeData> {
  // Create a map for quick lookup
  const nodeMap = new Map<string, HierarchyNodeData>();
  nodes.forEach(node => {
    nodeMap.set(node.id, { ...node, children: [] });
  });

  // Find root nodes (degree 0 or no sourcePaperId)
  const rootNodes: HierarchyNodeData[] = [];

  // Build parent-child relationships
  nodes.forEach(node => {
    const hierarchyNode = nodeMap.get(node.id)!;

    if (node.degree === 0 || !node.sourcePaperId) {
      // This is a seed paper (root)
      rootNodes.push(hierarchyNode);
    } else {
      // Find parent and add as child
      const parent = nodeMap.get(node.sourcePaperId);
      if (parent) {
        parent.children!.push(hierarchyNode);
      } else {
        // Orphan node - treat as root
        rootNodes.push(hierarchyNode);
      }
    }
  });

  // If multiple roots, create a virtual root
  if (rootNodes.length === 0) {
    // No nodes at all
    return d3Hierarchy.hierarchy<HierarchyNodeData>({
      id: 'virtual-root',
      title: '',
      authors: '',
      year: null,
      citationCount: null,
      venue: null,
      vectorStatus: null,
      relationshipType: 'search',
      similarity: null,
      abstract: null,
      sourcePaperId: null,
      degree: -1,
      isVirtualRoot: true,
      children: [],
    });
  }

  if (rootNodes.length === 1) {
    // Single root - no virtual root needed
    return d3Hierarchy.hierarchy<HierarchyNodeData>(
      rootNodes[0],
      d => d.children
    );
  }

  // Multiple roots - create virtual root
  const virtualRoot: HierarchyNodeData = {
    id: 'virtual-root',
    title: '',
    authors: '',
    year: null,
    citationCount: null,
    venue: null,
    vectorStatus: null,
    relationshipType: 'search',
    similarity: null,
    abstract: null,
    sourcePaperId: null,
    degree: -1,
    isVirtualRoot: true,
    children: rootNodes,
  };

  return d3Hierarchy.hierarchy<HierarchyNodeData>(virtualRoot, d => d.children);
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
  const queryClient = useQueryClient();

  // UI state
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [expandDialogOpen, setExpandDialogOpen] = useState(false);
  const [expandPaperId, setExpandPaperId] = useState<string | null>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });

  // Auto-expand state
  const [autoExpandDialogOpen, setAutoExpandDialogOpen] = useState(false);
  const [autoExpandPreviewPapers, setAutoExpandPreviewPapers] = useState<
    PaperPreview[]
  >([]);
  const [autoExpandStats, setAutoExpandStats] = useState<{
    degree1Count: number;
    degree2Count: number;
    degree3Count: number;
    totalCount: number;
  } | null>(null);
  const [showAutoExpandPreview, setShowAutoExpandPreview] = useState(false);

  // Calculate search node count from graph data
  const searchNodeCount = useMemo(
    () => graphData?.nodes.filter(n => n.degree === 0).length ?? 0,
    [graphData]
  );

  // Expand collection mutation
  const { mutate: expandCollection, isPending: isExpanding } =
    useExpandCollection();

  // Remove paper mutation (batch for cascading delete)
  const { mutate: batchRemovePapers, isPending: isRemoving } =
    useBatchRemovePapers();

  // Delete confirmation dialog state
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [paperToDelete, setPaperToDelete] = useState<{
    id: string;
    title: string;
    descendantIds: string[];
  } | null>(null);

  // Find all descendant nodes (children, grandchildren, etc.) by following sourcePaperId chain
  const findDescendants = useCallback(
    (paperId: string): string[] => {
      if (!graphData) return [];

      const descendants: string[] = [];
      const visited = new Set<string>();

      const findChildren = (parentId: string) => {
        if (visited.has(parentId)) return;
        visited.add(parentId);

        for (const node of graphData.nodes) {
          if (node.sourcePaperId === parentId && !visited.has(node.id)) {
            descendants.push(node.id);
            findChildren(node.id); // Recursively find grandchildren
          }
        }
      };

      findChildren(paperId);
      return descendants;
    },
    [graphData]
  );

  // Update dimensions on resize using ResizeObserver for accurate sizing
  useEffect(() => {
    if (!containerRef.current) return;

    const updateDimensions = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        // Only update if dimensions actually changed to avoid infinite loops
        setDimensions(prev => {
          if (
            prev.width !== rect.width ||
            prev.height !== Math.max(500, rect.height)
          ) {
            return {
              width: rect.width,
              height: Math.max(500, rect.height),
            };
          }
          return prev;
        });
      }
    };

    // Use ResizeObserver for accurate container size tracking
    const resizeObserver = new ResizeObserver(() => {
      updateDimensions();
    });

    resizeObserver.observe(containerRef.current);

    // Initial update and delayed update to catch dynamic import timing
    updateDimensions();
    const timeoutId = setTimeout(updateDimensions, 100);

    return () => {
      resizeObserver.disconnect();
      clearTimeout(timeoutId);
    };
  }, [graphData]);

  // Disable center force to prevent nodes from being pulled to center
  useEffect(() => {
    if (graphRef.current) {
      graphRef.current.d3Force('center', null);
    }
  }, [graphData]);

  // Auto fit view when graph data changes
  useEffect(() => {
    if (graphRef.current && graphData && graphData.nodes.length > 0) {
      // Wait for layout to settle, then fit to view
      const timeoutId = setTimeout(() => {
        graphRef.current?.zoomToFit(400, 80);
      }, 500);
      return () => clearTimeout(timeoutId);
    }
  }, [graphData]);

  // Position nodes using Reingold-Tilford "tidy" tree algorithm
  // This creates a radial tree layout with optimal spacing and no overlaps
  const positionedData = useMemo(() => {
    if (!graphData || graphData.nodes.length === 0) {
      return { nodes: [], links: [] };
    }

    // Build hierarchy from flat nodes
    const root = buildHierarchy(graphData.nodes);
    const hasVirtualRoot = root.data.isVirtualRoot;

    // Calculate layout radius - 3x larger for better spacing
    const baseRadius = Math.min(dimensions.width, dimensions.height) / 2 - 80;
    const layoutRadius = baseRadius * 3;

    // Ring spacing for each depth level
    const ringSpacing = 150; // Fixed spacing between rings

    // Create Reingold-Tilford tree layout in radial form
    const treeLayout = d3Hierarchy
      .tree<HierarchyNodeData>()
      .size([2 * Math.PI, layoutRadius])
      .separation((a, b) => {
        // Separation function: siblings are closer, non-siblings further apart
        // Divide by depth to make outer rings denser
        const baseSeparation = a.parent === b.parent ? 1 : 2;
        const depth = Math.max(a.depth, 1);
        return baseSeparation / depth;
      });

    // Apply layout
    treeLayout(root);

    // Convert hierarchy nodes to positioned nodes
    const positionedNodes: PositionedNode[] = [];

    root.descendants().forEach(d => {
      // Skip virtual root
      if (d.data.isVirtualRoot) return;

      // For radial layout: d.x is angle (radians), d.y is radius
      // After tree layout, x and y are always defined
      const angle = d.x ?? 0;
      let radius: number;

      if (hasVirtualRoot) {
        // With virtual root: use fixed ring spacing
        // depth 1 = seed papers (degree 0), depth 2 = degree 1, etc.
        const actualDepth = d.depth - 1; // Subtract 1 for virtual root
        if (actualDepth === 0) {
          // Seed papers: center area with small radius
          const seedCount =
            root.children?.filter(c => !c.data.isVirtualRoot).length ?? 1;
          radius = seedCount === 1 ? 0 : 80;
        } else {
          // Expanded papers: fixed spacing per degree
          radius = 80 + actualDepth * ringSpacing;
        }
      } else {
        // Single root: use fixed ring spacing from center
        radius = d.depth * ringSpacing;
      }

      // Convert polar to Cartesian coordinates
      const x = radius * Math.cos(angle - Math.PI / 2); // Rotate -90° so tree starts at top
      const y = radius * Math.sin(angle - Math.PI / 2);

      positionedNodes.push({
        ...d.data,
        fx: x,
        fy: y,
      } as PositionedNode);
    });

    // Convert edges to links format for react-force-graph
    const links = graphData.edges.map(edge => ({
      source: edge.source,
      target: edge.target,
      relationshipType: edge.relationshipType,
    }));

    return { nodes: positionedNodes, links };
  }, [graphData, dimensions]);

  // Draw node with appropriate shape
  const drawNode = useCallback(
    (node: PositionedNode, ctx: CanvasRenderingContext2D) => {
      const color = getNodeColor(node.similarity);
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
  const handleNodeHover = useCallback((node: PositionedNode | null) => {
    setHoveredNode(node);
  }, []);

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

  // Handle remove paper request - shows confirmation dialog
  const handleRemovePaper = useCallback(
    (paperId: string) => {
      const node = graphData?.nodes.find(n => n.id === paperId);
      if (!node) return;

      const descendantIds = findDescendants(paperId);

      setPaperToDelete({
        id: paperId,
        title: node.title,
        descendantIds,
      });
      setDeleteConfirmOpen(true);
    },
    [graphData, findDescendants]
  );

  // Handle confirmed deletion
  const handleConfirmDelete = useCallback(() => {
    if (!paperToDelete) return;

    const paperIds = [paperToDelete.id, ...paperToDelete.descendantIds];

    batchRemovePapers(
      { collectionId, paperIds },
      {
        onSuccess: () => {
          setSelectedNode(null);
          setDeleteConfirmOpen(false);
          setPaperToDelete(null);
        },
        onError: () => {
          setDeleteConfirmOpen(false);
          setPaperToDelete(null);
        },
      }
    );
  }, [paperToDelete, collectionId, batchRemovePapers]);

  // Handle refresh button click
  const handleRefresh = async () => {
    setIsRefreshing(true);
    await queryClient.invalidateQueries({
      queryKey: ['collection-graph', collectionId],
    });
    setIsRefreshing(false);
  };

  // Handle auto-expand preview ready
  const handleAutoExpandPreviewReady = useCallback(
    (
      papers: PaperPreview[],
      stats: {
        degree1Count: number;
        degree2Count: number;
        degree3Count: number;
        totalCount: number;
      }
    ) => {
      setAutoExpandPreviewPapers(papers);
      setAutoExpandStats(stats);
      setAutoExpandDialogOpen(false);
      setShowAutoExpandPreview(true);
    },
    []
  );

  // Handle auto-expand confirm
  const handleAutoExpandConfirm = useCallback(
    (selectedPaperIds: string[]) => {
      // Build sourcePaperIds, sourceTypes, degrees, and similarities maps
      const sourcePaperIds: Record<string, string> = {};
      const sourceTypes: Record<string, 'reference' | 'citation'> = {};
      const degrees: Record<string, number> = {};
      const similarities: Record<string, number> = {};

      for (const paperId of selectedPaperIds) {
        const paper = autoExpandPreviewPapers.find(p => p.paperId === paperId);
        if (paper) {
          sourcePaperIds[paperId] = paper.sourcePaperId || '';
          sourceTypes[paperId] = paper.sourceType || 'reference';
          degrees[paperId] = paper.degree || 1;
          if (paper.similarity !== null) {
            similarities[paperId] = paper.similarity;
          }
        }
      }

      expandCollection(
        {
          collectionId,
          selectedPaperIds,
          sourcePaperIds,
          sourceTypes,
          degrees,
          similarities,
        },
        {
          onSuccess: () => {
            setShowAutoExpandPreview(false);
            setAutoExpandPreviewPapers([]);
            setAutoExpandStats(null);
          },
          onError: error => {
            toast.error(
              error instanceof Error
                ? error.message
                : 'Failed to add papers to collection'
            );
          },
        }
      );
    },
    [autoExpandPreviewPapers, collectionId, expandCollection]
  );

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
        <h4 className="text-xs font-medium mb-2">Similarity</h4>
        <div className="space-y-1.5 text-xs">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-blue-500" />
            <span>≥50%</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-green-500" />
            <span>40-49%</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-yellow-500" />
            <span>30-39%</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-red-500" />
            <span>&lt;30%</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-muted-foreground" />
            <span>N/A</span>
          </div>
          <div className="flex items-center gap-2 pt-1 border-t">
            <div className="w-3 h-3 rounded-full border-2 border-current" />
            <span>PDF indexed</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-lg leading-none">×</span>
            <span>No PDF</span>
          </div>
          <div className="flex items-center gap-2 pt-1 border-t">
            <div className="w-4 h-0.5 bg-[hsla(142,71%,45%,0.8)]" />
            <span>References</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-0.5 bg-[hsla(270,71%,65%,0.8)]" />
            <span>Citations</span>
          </div>
        </div>
        {/* Auto Expand Button */}
        <div className="mt-3 pt-3 border-t">
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => setAutoExpandDialogOpen(true)}
            disabled={searchNodeCount === 0}
          >
            <Sparkles className="h-4 w-4 mr-1" />
            Auto Expand
          </Button>
        </div>
      </div>

      {/* Refresh button */}
      <div className="absolute top-4 right-4 z-10">
        <Button
          variant="outline"
          size="icon"
          onClick={handleRefresh}
          disabled={isRefreshing}
        >
          <RefreshCw
            className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`}
          />
        </Button>
      </div>

      {/* Graph container */}
      <CardContent ref={containerRef} className="p-0 h-[600px] relative">
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

      {/* Tooltip - fixed position next to legend */}
      {hoveredNode && !selectedNode && <NodeTooltip node={hoveredNode} />}

      {/* Detail panel */}
      <PaperDetailPanel
        node={selectedNode}
        onClose={() => setSelectedNode(null)}
        onExpand={handleExpand}
        onRemove={handleRemovePaper}
        isRemoving={isRemoving}
      />

      {/* Expand dialog */}
      {expandPaper && (
        <ExpandCollectionDialog
          open={expandDialogOpen}
          onOpenChange={setExpandDialogOpen}
          collectionId={collectionId}
          paperId={expandPaper.id}
          paperTitle={expandPaper.title}
          sourceDegree={expandPaper.degree}
        />
      )}

      {/* Auto Expand dialog */}
      <AutoExpandDialog
        open={autoExpandDialogOpen}
        onOpenChange={setAutoExpandDialogOpen}
        collectionId={collectionId}
        searchNodeCount={searchNodeCount}
        onPreviewReady={handleAutoExpandPreviewReady}
      />

      {/* Auto Expand Preview dialog */}
      {showAutoExpandPreview && autoExpandStats && (
        <PaperPreviewDialog
          open={showAutoExpandPreview}
          onOpenChange={setShowAutoExpandPreview}
          papers={autoExpandPreviewPapers}
          stats={{
            totalPapers: autoExpandStats.totalCount,
            openAccessPapers: autoExpandPreviewPapers.filter(
              p => p.isOpenAccess
            ).length,
            paywalledPapers: autoExpandPreviewPapers.filter(
              p => !p.isOpenAccess
            ).length,
            papersWithEmbeddings: 0,
            rerankingApplied: false,
          }}
          searchQuery="Auto Expand"
          isCreating={isExpanding}
          onConfirm={handleAutoExpandConfirm}
          onCancel={() => {
            setShowAutoExpandPreview(false);
            setAutoExpandPreviewPapers([]);
            setAutoExpandStats(null);
          }}
          confirmButtonText={`Add to Collection`}
          showDegreeFilter={true}
          degreeStats={{
            degree1: autoExpandStats.degree1Count,
            degree2: autoExpandStats.degree2Count,
            degree3: autoExpandStats.degree3Count,
          }}
        />
      )}

      {/* Delete confirmation dialog */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Paper from Collection</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  Are you sure you want to remove &quot;{paperToDelete?.title}
                  &quot;?
                </p>
                {paperToDelete && paperToDelete.descendantIds.length > 0 && (
                  <div className="p-3 bg-destructive/10 rounded-md border border-destructive/20">
                    <p className="text-destructive font-medium">
                      This will also remove {paperToDelete.descendantIds.length}{' '}
                      connected paper
                      {paperToDelete.descendantIds.length > 1 ? 's' : ''} that
                      were expanded from this paper.
                    </p>
                  </div>
                )}
                <p className="text-sm text-muted-foreground">
                  This action cannot be undone. The paper
                  {paperToDelete && paperToDelete.descendantIds.length > 0
                    ? 's'
                    : ''}{' '}
                  and associated data will be permanently removed from this
                  collection.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                setDeleteConfirmOpen(false);
                setPaperToDelete(null);
              }}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={isRemoving}
            >
              {isRemoving
                ? 'Removing...'
                : `Remove ${paperToDelete ? paperToDelete.descendantIds.length + 1 : 1} Paper${paperToDelete && paperToDelete.descendantIds.length > 0 ? 's' : ''}`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
