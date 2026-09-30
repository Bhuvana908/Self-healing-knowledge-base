import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  Network, Share2, Layers, AlertCircle, ArrowRight, ShieldCheck,
  Search, Filter, ZoomIn, ZoomOut, Maximize2, Sparkles, BookOpen, FileCheck
} from "lucide-react";

import { apiGet } from "@/lib/api";
import type { KnowledgeGraphData, GraphNode, MultiHopPath } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export default function KnowledgeGraphPage() {
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [selectedPath, setSelectedPath] = useState<MultiHopPath | null>(null);
  const [filterType, setFilterType] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [zoom, setZoom] = useState(1);

  const graphQuery = useQuery({
    queryKey: ["knowledge-graph"],
    queryFn: () => apiGet<KnowledgeGraphData>("/graph"),
  });

  const graph = graphQuery.data;

  // Filtered nodes
  const filteredNodes = useMemo(() => {
    if (!graph) return [];
    return graph.nodes.filter((n) => {
      const matchType = filterType === "all" || n.type === filterType;
      const matchSearch =
        n.label.toLowerCase().includes(search.toLowerCase()) ||
        n.id.toLowerCase().includes(search.toLowerCase());
      return matchType && matchSearch;
    });
  }, [graph, filterType, search]);

  // Node position map for SVG graph rendering
  const nodePositions = useMemo(() => {
    if (!graph) return new Map<string, { x: number; y: number }>();
    const positions = new Map<string, { x: number; y: number }>();
    const width = 900;
    const height = 540;
    const centerX = width / 2;
    const centerY = height / 2;

    // Arrange nodes in concentric rings by type for clear hierarchy
    const policies = graph.nodes.filter((n) => n.type === "policy");
    const requirements = graph.nodes.filter((n) => n.type === "requirement");
    const docs = graph.nodes.filter((n) => n.type === "document");
    const conflicts = graph.nodes.filter((n) => n.type === "conflict");

    // Center: Policies (radius 110)
    policies.forEach((node, i) => {
      const angle = (i / Math.max(1, policies.length)) * 2 * Math.PI;
      positions.set(node.id, {
        x: centerX + Math.cos(angle) * 110,
        y: centerY + Math.sin(angle) * 100,
      });
    });

    // Middle ring: Requirements (radius 200)
    requirements.forEach((node, i) => {
      const angle = (i / Math.max(1, requirements.length)) * 2 * Math.PI + 0.3;
      positions.set(node.id, {
        x: centerX + Math.cos(angle) * 210,
        y: centerY + Math.sin(angle) * 180,
      });
    });

    // Outer ring: Documents (radius 310)
    docs.forEach((node, i) => {
      const angle = (i / Math.max(1, docs.length)) * 2 * Math.PI + 0.6;
      positions.set(node.id, {
        x: centerX + Math.cos(angle) * 330,
        y: centerY + Math.sin(angle) * 230,
      });
    });

    // Conflict nodes placed adjacent to affected entities
    conflicts.forEach((node, i) => {
      const angle = (i / Math.max(1, conflicts.length)) * Math.PI * 0.9 + 1.2;
      positions.set(node.id, {
        x: centerX + Math.cos(angle) * 260,
        y: centerY + Math.sin(angle) * 210,
      });
    });

    return positions;
  }, [graph]);

  const activePathNodeIds = useMemo(() => {
    if (!selectedPath) return new Set<string>();
    const set = new Set<string>();
    selectedPath.hops.forEach((h) => {
      // Find matching node id
      graph?.nodes.forEach((n) => {
        if (h.from.includes(n.id) || n.label.includes(h.from) || h.to.includes(n.id) || n.label.includes(h.to)) {
          set.add(n.id);
        }
      });
    });
    return set;
  }, [selectedPath, graph]);

  const getNodeColor = (type: GraphNode["type"]) => {
    switch (type) {
      case "policy":
        return { bg: "#818CF8", stroke: "#4F46E5", text: "#312E81", label: "Policy" };
      case "requirement":
        return { bg: "#2DD4BF", stroke: "#0D9488", text: "#134E4A", label: "Requirement" };
      case "document":
        return { bg: "#60A5FA", stroke: "#2563EB", text: "#1E3A8A", label: "Document" };
      case "conflict":
        return { bg: "#F87171", stroke: "#DC2626", text: "#7F1D1D", label: "Conflict" };
      default:
        return { bg: "#94A3B8", stroke: "#475569", text: "#0F172A", label: "Entity" };
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex p-1.5 rounded-lg bg-indigo-100 text-indigo-700">
              <Network className="h-5 w-5" />
            </span>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Knowledge Graph & Multi-Hop Detection
            </h1>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Explores topological relationships between documents, executive policies, operational requirements, and reveals multi-hop dependency conflicts.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Badge variant="outline" className="border-indigo-300 bg-indigo-50 text-indigo-700 gap-1.5 text-xs py-1">
            <Share2 className="h-3.5 w-3.5" />
            {graph?.stats.multiHopChainsDetected || 2} Multi-Hop Chains Detected
          </Badge>
        </div>
      </div>

      {/* Main Grid: Visual Graph + Multi-Hop Inspector */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Interactive Graph Canvas */}
        <div className="lg:col-span-2 space-y-4">
          <Card className="border-slate-200 overflow-hidden shadow-sm">
            <CardHeader className="bg-slate-50/70 border-b py-3 px-4 flex flex-row items-center justify-between">
              <div className="flex items-center gap-2">
                <Layers className="h-4 w-4 text-indigo-600" />
                <CardTitle className="text-sm font-semibold">Graph Topology Map</CardTitle>
              </div>

              {/* Controls */}
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 w-7 p-0"
                  onClick={() => setZoom((z) => Math.max(0.6, z - 0.1))}
                >
                  <ZoomOut className="h-3.5 w-3.5" />
                </Button>
                <span className="text-xs font-mono text-slate-500">{(zoom * 100).toFixed(0)}%</span>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 w-7 p-0"
                  onClick={() => setZoom((z) => Math.min(1.5, z + 0.1))}
                >
                  <ZoomIn className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 w-7 p-0"
                  onClick={() => setZoom(1)}
                >
                  <Maximize2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </CardHeader>

            {/* Filter and Legend Bar */}
            <div className="bg-white border-b px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-slate-500 font-medium">Filter:</span>
                {["all", "policy", "requirement", "document", "conflict"].map((type) => (
                  <Button
                    key={type}
                    size="sm"
                    variant={filterType === type ? "default" : "outline"}
                    className={`h-6 text-[11px] capitalize px-2.5 ${
                      filterType === type ? "bg-indigo-600 text-white" : ""
                    }`}
                    onClick={() => setFilterType(type)}
                  >
                    {type}
                  </Button>
                ))}
              </div>

              {/* Node Legend */}
              <div className="flex items-center gap-3 text-[11px] text-slate-600">
                <span className="flex items-center gap-1">
                  <span className="h-2.5 w-2.5 rounded-full bg-indigo-500" /> Policy
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-2.5 w-2.5 rounded-full bg-teal-500" /> Requirement
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-2.5 w-2.5 rounded-full bg-blue-500" /> Document
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-2.5 w-2.5 rounded-full bg-rose-500" /> Conflict
                </span>
              </div>
            </div>

            {/* SVG Visual Graph Canvas */}
            <CardContent className="p-0 bg-slate-900/95 relative overflow-hidden h-[540px]">
              <div className="w-full h-full flex items-center justify-center">
                <svg
                  viewBox="0 0 900 540"
                  className="w-full h-full transition-transform duration-200"
                  style={{ transform: `scale(${zoom})` }}
                >
                  <defs>
                    <marker
                      id="arrow"
                      viewBox="0 0 10 10"
                      refX="18"
                      refY="5"
                      markerWidth="6"
                      markerHeight="6"
                      orient="auto-start-reverse"
                    >
                      <path d="M 0 0 L 10 5 L 0 10 z" fill="#64748B" />
                    </marker>
                    <marker
                      id="arrow-conflict"
                      viewBox="0 0 10 10"
                      refX="18"
                      refY="5"
                      markerWidth="6"
                      markerHeight="6"
                      orient="auto-start-reverse"
                    >
                      <path d="M 0 0 L 10 5 L 0 10 z" fill="#EF4444" />
                    </marker>
                    <marker
                      id="arrow-active"
                      viewBox="0 0 10 10"
                      refX="18"
                      refY="5"
                      markerWidth="6"
                      markerHeight="6"
                      orient="auto-start-reverse"
                    >
                      <path d="M 0 0 L 10 5 L 0 10 z" fill="#38BDF8" />
                    </marker>
                  </defs>

                  {/* Graph Edges */}
                  {(graph?.edges || []).map((edge) => {
                    const src = nodePositions.get(edge.source);
                    const tgt = nodePositions.get(edge.target);
                    if (!src || !tgt) return null;

                    const isConflict = edge.type === "conflicts_with";
                    const isMultiHopEdge = edge.isMultiHop;
                    const isActivePath =
                      activePathNodeIds.has(edge.source) && activePathNodeIds.has(edge.target);

                    let strokeColor = "#334155";
                    let strokeWidth = 1.5;
                    let strokeDash = undefined;

                    if (isActivePath) {
                      strokeColor = "#38BDF8";
                      strokeWidth = 3;
                    } else if (isConflict) {
                      strokeColor = "#EF4444";
                      strokeWidth = 2.5;
                      strokeDash = "4 4";
                    } else if (isMultiHopEdge) {
                      strokeColor = "#F59E0B";
                      strokeWidth = 2;
                    }

                    return (
                      <g key={edge.id}>
                        <line
                          x1={src.x}
                          y1={src.y}
                          x2={tgt.x}
                          y2={tgt.y}
                          stroke={strokeColor}
                          strokeWidth={strokeWidth}
                          strokeDasharray={strokeDash}
                          markerEnd={
                            isActivePath
                              ? "url(#arrow-active)"
                              : isConflict
                              ? "url(#arrow-conflict)"
                              : "url(#arrow)"
                          }
                        />
                        {/* Edge Label on hover / highlight */}
                        {(isActivePath || isConflict) && (
                          <text
                            x={(src.x + tgt.x) / 2}
                            y={(src.y + tgt.y) / 2 - 5}
                            fill={isConflict ? "#FCA5A5" : "#BAE6FD"}
                            fontSize="9"
                            fontFamily="monospace"
                            textAnchor="middle"
                            className="bg-slate-900"
                          >
                            {edge.label}
                          </text>
                        )}
                      </g>
                    );
                  })}

                  {/* Graph Nodes */}
                  {(graph?.nodes || []).map((node) => {
                    const pos = nodePositions.get(node.id);
                    if (!pos) return null;

                    const color = getNodeColor(node.type);
                    const isSelected = selectedNode?.id === node.id;
                    const isInActivePath = activePathNodeIds.has(node.id);

                    const radius = node.type === "policy" ? 24 : node.type === "requirement" ? 20 : 18;

                    return (
                      <g
                        key={node.id}
                        transform={`translate(${pos.x}, ${pos.y})`}
                        className="cursor-pointer transition-transform hover:scale-110"
                        onClick={() => setSelectedNode(node)}
                      >
                        {/* Outer pulse for active path */}
                        {(isSelected || isInActivePath) && (
                          <circle
                            r={radius + 8}
                            fill="none"
                            stroke={isInActivePath ? "#38BDF8" : "#818CF8"}
                            strokeWidth="2"
                            className="animate-pulse"
                          />
                        )}

                        <circle
                          r={radius}
                          fill={color.bg}
                          stroke={isSelected ? "#FFFFFF" : color.stroke}
                          strokeWidth={isSelected ? "3" : "2"}
                          filter="drop-shadow(0 4px 6px rgba(0,0,0,0.4))"
                        />

                        {/* Node Icon/Glyph */}
                        <text
                          textAnchor="middle"
                          dy=".3em"
                          fill={color.text}
                          fontSize={radius > 20 ? "11" : "9"}
                          fontWeight="bold"
                        >
                          {node.type.slice(0, 3).toUpperCase()}
                        </text>

                        {/* Node Label Below */}
                        <text
                          y={radius + 14}
                          textAnchor="middle"
                          fill="#E2E8F0"
                          fontSize="10"
                          fontWeight="500"
                          className="pointer-events-none drop-shadow"
                        >
                          {node.label.length > 22 ? `${node.label.slice(0, 20)}…` : node.label}
                        </text>
                      </g>
                    );
                  })}
                </svg>
              </div>

              {/* Node Inspector Floating Drawer */}
              {selectedNode && (
                <div className="absolute bottom-3 left-3 right-3 bg-slate-900/90 backdrop-blur-md border border-slate-700 text-white rounded-lg p-3.5 flex items-center justify-between text-xs shadow-xl">
                  <div className="space-y-1 max-w-lg">
                    <div className="flex items-center gap-2">
                      <span
                        className="px-2 py-0.5 rounded text-[10px] font-bold uppercase"
                        style={{ backgroundColor: getNodeColor(selectedNode.type).stroke }}
                      >
                        {selectedNode.type}
                      </span>
                      <span className="font-semibold text-sm">{selectedNode.label}</span>
                    </div>
                    <p className="text-slate-300 font-mono text-[11px]">ID: {selectedNode.id} · Group: {selectedNode.group}</p>
                    {selectedNode.trust !== undefined && (
                      <p className="text-emerald-400">Trust Coefficient: {(selectedNode.trust * 100).toFixed(0)}%</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {selectedNode.type === "conflict" && (
                      <Link to="/self-healing">
                        <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700 text-white gap-1 text-xs">
                          <Sparkles className="h-3.5 w-3.5" /> Resolve in Self-Healing
                        </Button>
                      </Link>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-slate-400 hover:text-white"
                      onClick={() => setSelectedNode(null)}
                    >
                      Dismiss
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Col: MULTI-HOP DETECTION PANEL */}
        <div className="space-y-4">
          <Card className="border-indigo-200 bg-indigo-50/30">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Share2 className="h-5 w-5 text-indigo-600" />
                  Multi-Hop Detection
                </CardTitle>
                <Badge className="bg-indigo-600 text-white text-[11px]">
                  Impact Analysis
                </Badge>
              </div>
              <CardDescription className="text-xs text-slate-600">
                Reveals indirect contradiction paths across 3+ relationship hops:
                <br />
                <code className="text-indigo-800 font-mono text-[11px]">
                  Doc A → Policy B → Requirement C → Conflict with Doc D
                </code>
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 pt-0">
              {(graph?.multiHopPaths || []).map((path) => {
                const isSelected = selectedPath?.id === path.id;
                return (
                  <div
                    key={path.id}
                    className={`rounded-lg border p-4 text-xs transition-all cursor-pointer ${
                      isSelected
                        ? "border-indigo-500 bg-white ring-2 ring-indigo-200 shadow-md"
                        : "border-slate-200 bg-white hover:border-indigo-300"
                    }`}
                    onClick={() => setSelectedPath(isSelected ? null : path)}
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <h4 className="font-bold text-slate-900 text-sm">{path.title}</h4>
                      <Badge
                        variant="outline"
                        className={
                          path.status === "ACTIVE_CONFLICT"
                            ? "border-rose-300 bg-rose-50 text-rose-700 shrink-0 font-mono text-[10px]"
                            : "border-emerald-300 bg-emerald-50 text-emerald-700 shrink-0 font-mono text-[10px]"
                        }
                      >
                        {path.status}
                      </Badge>
                    </div>

                    <p className="text-slate-600 leading-relaxed mb-3">{path.summary}</p>

                    {/* Step-by-Step Hop Trail */}
                    <div className="space-y-2 border-t pt-2.5">
                      <p className="text-[11px] font-semibold text-slate-700">Multi-Hop Traversal Chain:</p>
                      {path.hops.map((hop) => (
                        <div key={hop.step} className="rounded bg-slate-50 p-2 border border-slate-200 space-y-1">
                          <div className="flex items-center gap-1.5 font-semibold text-indigo-900 text-[11px]">
                            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-indigo-200 text-indigo-800 text-[10px]">
                              {hop.step}
                            </span>
                            <span>{hop.relation.replace(/_/g, " ")}</span>
                          </div>
                          <p className="text-slate-600 text-[11px] pl-5">{hop.explanation}</p>
                        </div>
                      ))}
                    </div>

                    <div className="mt-3 pt-2.5 border-t flex items-center justify-between">
                      <span className="text-[11px] text-slate-500 font-mono">
                        Impact Score: <strong className="text-rose-600">{path.impactScore}/100</strong>
                      </span>
                      <Link to="/self-healing">
                        <Button size="sm" variant="outline" className="h-7 text-xs border-indigo-200 text-indigo-700 hover:bg-indigo-50 gap-1">
                          Reconcile in RAG <ArrowRight className="h-3 w-3" />
                        </Button>
                      </Link>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {/* Graph Statistics Card */}
          <Card className="border-slate-200">
            <CardHeader className="py-3 px-4">
              <CardTitle className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                Graph Topology Metrics
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 pt-0 text-xs space-y-2">
              <div className="flex justify-between py-1 border-b text-slate-600">
                <span>Total Nodes in Knowledge Base</span>
                <strong className="font-mono text-slate-800">{graph?.stats.totalNodes || 0}</strong>
              </div>
              <div className="flex justify-between py-1 border-b text-slate-600">
                <span>Direct & Indirect Relationship Edges</span>
                <strong className="font-mono text-slate-800">{graph?.stats.totalEdges || 0}</strong>
              </div>
              <div className="flex justify-between py-1 border-b text-slate-600">
                <span>Authoritative Policies Linked</span>
                <strong className="font-mono text-indigo-600">{graph?.stats.policyNodes || 0}</strong>
              </div>
              <div className="flex justify-between py-1 text-slate-600">
                <span>Multi-Hop Conflicts Identified</span>
                <strong className="font-mono text-rose-600">{graph?.stats.multiHopChainsDetected || 0}</strong>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
