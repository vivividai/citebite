/**
 * Types for paper relationship graph visualization
 */

export type RelationshipType = 'search' | 'reference' | 'citation';

export interface GraphNode {
  id: string; // paper_id
  title: string;
  authors: string; // comma-separated
  year: number | null;
  citationCount: number | null;
  venue: string | null;
  vectorStatus: 'pending' | 'completed' | 'failed' | null;
  relationshipType: RelationshipType;
  similarity: number | null; // 0-1 cosine similarity for coloring
  abstract: string | null;
  sourcePaperId: string | null; // which paper was expanded to find this one
  degree: number; // 0=search, 1-3=expansion levels
}

export interface GraphEdge {
  source: string; // paper_id
  target: string; // paper_id
  relationshipType: 'reference' | 'citation';
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

// For react-force-graph-2d node positioning
export interface PositionedNode extends GraphNode {
  x?: number;
  y?: number;
  fx?: number; // fixed x position
  fy?: number; // fixed y position
  vx?: number; // velocity x
  vy?: number; // velocity y
}

// Graph API response
export interface GraphApiResponse {
  success: boolean;
  data: GraphData;
}
