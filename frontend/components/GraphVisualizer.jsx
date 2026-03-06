/**
 * GraphVisualizer.jsx
 * 
 * Interactive graph visualization component for Money Muling Detection.
 * UPDATED: Red Theme, Square Nodes, ID labels inside squares.
 */

import React, { useEffect, useRef, useState, useCallback } from "react";
import * as d3 from "d3";

// ─── Colour / Style constants ─────────────────────────────────────────────────
const RING_PALETTE = [
  "#ff3a5c", "#ff8c00", "#ff4500", "#ff1493",
  "#c71585", "#dc143c", "#ff0000", "#ff6347",
];

const NODE_NORMAL      = { fill: "#0a1a0a", stroke: "#22c55e", size: 36 }; // Green for OK
const NODE_SUSPICIOUS  = { fill: "#1a0000", stroke: "#ef4444", size: 44 }; // Red for Flagged
const EDGE_NORMAL      = { stroke: "#2a0a0a", opacity: 0.45 };
const EDGE_SUSPICIOUS  = { stroke: "#ef4444", opacity: 0.85 };
const BG               = "#0a0000"; // Very dark red/black
const PANEL_BG         = "rgba(15,0,0,0.95)";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getRingColor(ringId, fraudRings) {
  if (!ringId) return null;
  const idx = fraudRings.findIndex((r) => r.ring_id === ringId);
  return RING_PALETTE[idx % RING_PALETTE.length] ?? RING_PALETTE[0];
}

function patternLabel(p) {
  return p.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function GraphVisualizer({ graphData, flaggedData }) {
  const svgRef        = useRef(null);
  const simRef        = useRef(null);
  const [tooltip, setTooltip]       = useState(null);   // { x, y, node }
  const [selected, setSelected]     = useState(null);   // node id
  const [dimensions, setDimensions] = useState({ w: 900, h: 600 });
  const containerRef  = useRef(null);

  // ── Resize observer ────────────────────────────────────────────────────────
  useEffect(() => {
    const obs = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setDimensions({ w: Math.max(400, width), h: Math.max(320, height) });
    });
    if (containerRef.current) obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  // ── D3 simulation ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!graphData || !flaggedData || !svgRef.current) return;

    const { nodes: rawNodes, edges: rawEdges } = graphData;
    const { suspicious_accounts, fraud_rings } = flaggedData;

    const suspMap = new Map(suspicious_accounts.map((a) => [a.account_id, a]));

    // Clone so d3 can mutate
    const nodes = rawNodes.map((n) => ({ ...n }));
    const edges = rawEdges.map((e) => ({ ...e }));

    const { w, h } = dimensions;

    // Arrowhead markers for rings + normal
    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();
    svg.attr("viewBox", `0 0 ${w} ${h}`).attr("width", w).attr("height", h);

    // ── Defs: markers + filters ──────────────────────────────────────────────
    const defs = svg.append("defs");

    // Normal arrow (reddish)
    defs.append("marker")
      .attr("id", "arrow-normal")
      .attr("viewBox", "0 -5 10 10").attr("refX", 28).attr("refY", 0)
      .attr("markerWidth", 6).attr("markerHeight", 6).attr("orient", "auto")
      .append("path").attr("d", "M0,-5L10,0L0,5").attr("fill", "#440000");

    // Ring arrows (one per ring colour)
    fraud_rings.forEach((ring, i) => {
      const col = RING_PALETTE[i % RING_PALETTE.length];
      defs.append("marker")
        .attr("id", `arrow-ring-${i}`)
        .attr("viewBox", "0 -5 10 10").attr("refX", 30).attr("refY", 0)
        .attr("markerWidth", 6).attr("markerHeight", 6).attr("orient", "auto")
        .append("path").attr("d", "M0,-5L10,0L0,5").attr("fill", col);
    });

    // Glow filter (Red)
    const filter = defs.append("filter").attr("id", "glow").attr("x", "-40%").attr("y", "-40%").attr("width", "180%").attr("height", "180%");
    filter.append("feGaussianBlur").attr("stdDeviation", "4").attr("result", "coloredBlur");
    const feMerge = filter.append("feMerge");
    feMerge.append("feMergeNode").attr("in", "coloredBlur");
    feMerge.append("feMergeNode").attr("in", "SourceGraphic");

    // ── Background ──────────────────────────────────────────────────────────
    svg.append("rect").attr("width", w).attr("height", h).attr("fill", BG);

    // Subtle grid (Red tint)
    const gridG = svg.append("g").attr("class", "grid");
    for (let x = 0; x < w; x += 50)
      gridG.append("line").attr("x1", x).attr("y1", 0).attr("x2", x).attr("y2", h)
        .attr("stroke", "#ff000008").attr("stroke-width", 1);
    for (let y = 0; y < h; y += 50)
      gridG.append("line").attr("x1", 0).attr("y1", y).attr("x2", w).attr("y2", y)
        .attr("stroke", "#ff000008").attr("stroke-width", 1);

    // ── Zoom container ──────────────────────────────────────────────────────
    const g = svg.append("g").attr("class", "zoom-root");
    const zoom = d3.zoom().scaleExtent([0.1, 4])
      .on("zoom", (event) => g.attr("transform", event.transform));
    svg.call(zoom);

    // ── Compute edge suspicion ───────────────────────────────────────────────
    function isEdgeSuspicious(e) {
      return suspMap.has(e.source?.id ?? e.source) || suspMap.has(e.target?.id ?? e.target);
    }
    function edgeRingIdx(e) {
      const srcAcc = suspMap.get(e.source?.id ?? e.source);
      const tgtAcc = suspMap.get(e.target?.id ?? e.target);
      const ringId = srcAcc?.ring_id ?? tgtAcc?.ring_id;
      if (!ringId) return -1;
      return fraud_rings.findIndex((r) => r.ring_id === ringId);
    }

    // ── Links ────────────────────────────────────────────────────────────────
    const linkG = g.append("g").attr("class", "links");
    const link = linkG.selectAll("line")
      .data(edges).enter().append("line")
      .attr("stroke", (e) => {
        const ri = edgeRingIdx(e);
        return ri >= 0 ? RING_PALETTE[ri % RING_PALETTE.length] : "#440000";
      })
      .attr("stroke-opacity", (e) => isEdgeSuspicious(e) ? EDGE_SUSPICIOUS.opacity : EDGE_NORMAL.opacity)
      .attr("stroke-width", (e) => isEdgeSuspicious(e) ? 2.5 : 1.5)
      .attr("marker-end", (e) => {
        const ri = edgeRingIdx(e);
        return ri >= 0 ? `url(#arrow-ring-${ri})` : "url(#arrow-normal)";
      });

    // ── Nodes (SQUARES) ──────────────────────────────────────────────────────
    const nodeG = g.append("g").attr("class", "nodes");
    const nodeEl = nodeG.selectAll("g")
      .data(nodes).enter().append("g")
      .attr("class", "node-group")
      .style("cursor", "pointer");

    // Main rect
    nodeEl.append("rect")
      .attr("width", (d) => {
        const isSusp = suspMap.has(d.id);
        const size = isSusp ? NODE_SUSPICIOUS.size : NODE_NORMAL.size;
        return size;
      })
      .attr("height", (d) => {
        const isSusp = suspMap.has(d.id);
        const size = isSusp ? NODE_SUSPICIOUS.size : NODE_NORMAL.size;
        return size;
      })
      .attr("x", (d) => {
        const isSusp = suspMap.has(d.id);
        const size = isSusp ? NODE_SUSPICIOUS.size : NODE_NORMAL.size;
        return -size / 2;
      })
      .attr("y", (d) => {
        const isSusp = suspMap.has(d.id);
        const size = isSusp ? NODE_SUSPICIOUS.size : NODE_NORMAL.size;
        return -size / 2;
      })
      .attr("fill", (d) => suspMap.has(d.id) ? NODE_SUSPICIOUS.fill : NODE_NORMAL.fill)
      .attr("stroke", (d) => {
        if (!suspMap.has(d.id)) return NODE_NORMAL.stroke;
        const a = suspMap.get(d.id);
        return getRingColor(a.ring_id, fraud_rings) ?? "#ef4444";
      })
      .attr("stroke-width", (d) => suspMap.has(d.id) ? 3 : 2)
      .attr("filter", (d) => suspMap.has(d.id) ? "url(#glow)" : null);

    // Node ID Label (INSIDE SQUUARE)
    nodeEl.append("text")
      .text((d) => d.id.split('_').pop()) // Just show the numerical part if possible, or short id
      .attr("text-anchor", "middle")
      .attr("dominant-baseline", "central")
      .attr("font-size", (d) => suspMap.has(d.id) ? "11px" : "10px")
      .attr("font-weight", "bold")
      .attr("font-family", "'Courier New', monospace")
      .attr("fill", "#ffffff")
      .attr("pointer-events", "none");

    // External Label (Full ID)
    nodeEl.append("text")
      .text((d) => d.id)
      .attr("dy", (d) => (suspMap.has(d.id) ? NODE_SUSPICIOUS.size : NODE_NORMAL.size) / 2 + 14)
      .attr("text-anchor", "middle")
      .attr("font-size", "9px")
      .attr("font-family", "'Courier New', monospace")
      .attr("fill", (d) => suspMap.has(d.id) ? "#ff4444" : "#22c55e")
      .attr("pointer-events", "none");

    // ── Interaction ──────────────────────────────────────────────────────────
    nodeEl
      .on("mouseenter", function (event, d) {
        d3.select(this).select("rect").attr("stroke-width", 5);
        const acct = suspMap.get(d.id);
        const svgRect = svgRef.current.getBoundingClientRect();
        setTooltip({
          x: event.clientX - svgRect.left + 12,
          y: event.clientY - svgRect.top - 10,
          node: d,
          acct,
        });
      })
      .on("mousemove", function (event) {
        const svgRect = svgRef.current.getBoundingClientRect();
        setTooltip((prev) => prev ? { ...prev, x: event.clientX - svgRect.left + 12, y: event.clientY - svgRect.top - 10 } : null);
      })
      .on("mouseleave", function (event, d) {
        d3.select(this).select("rect").attr("stroke-width", suspMap.has(d.id) ? 3 : 2);
        setTooltip(null);
      })
      .on("click", function (event, d) {
        event.stopPropagation();
        setSelected((prev) => prev === d.id ? null : d.id);
      });

    // Click away to deselect
    svg.on("click", () => setSelected(null));

    // ── Drag ────────────────────────────────────────────────────────────────
    const drag = d3.drag()
      .on("start", (event, d) => {
        if (!event.active) simRef.current.alphaTarget(0.3).restart();
        d.fx = d.x; d.fy = d.y;
      })
      .on("drag", (event, d) => { d.fx = event.x; d.fy = event.y; })
      .on("end", (event, d) => {
        if (!event.active) simRef.current.alphaTarget(0);
        d.fx = null; d.fy = null;
      });
    nodeEl.call(drag);

    // ── Force Simulation ─────────────────────────────────────────────────────
    const sim = d3.forceSimulation(nodes)
      .force("link", d3.forceLink(edges).id((d) => d.id).distance(100).strength(0.4))
      .force("charge", d3.forceManyBody().strength(-300))
      .force("center", d3.forceCenter(w / 2, h / 2))
      .force("collision", d3.forceCollide().radius(40));

    simRef.current = sim;

    sim.on("tick", () => {
      link
        .attr("x1", (d) => d.source.x).attr("y1", (d) => d.source.y)
        .attr("x2", (d) => d.target.x).attr("y2", (d) => d.target.y);
      nodeEl.attr("transform", (d) => `translate(${d.x},${d.y})`);
    });

    return () => sim.stop();
  }, [graphData, flaggedData, dimensions]);

  // ── Selected node highlight ────────────────────────────────────────────────
  const selectedAcct = selected && flaggedData
    ? flaggedData.suspicious_accounts.find((a) => a.account_id === selected)
    : null;

  const selectedNode = selected && graphData
    ? graphData.nodes.find((n) => n.id === selected)
    : null;

  // ── Legend ────────────────────────────────────────────────────────────────
  const fraudRings = flaggedData?.fraud_rings ?? [];

  return (
    <div
      style={{
        width: "100%", height: "100%", display: "flex", flexDirection: "column",
        background: BG, fontFamily: "'Courier New', monospace", color: "#ffcccc",
        borderRadius: 0, overflow: "hidden", border: "1px solid #330000",
        boxShadow: "0 0 40px rgba(255,0,0,0.1)",
      }}
    >
      {/* ── Header ── */}
      <div style={{
        padding: "12px 20px", background: "#1a0000",
        borderBottom: "1px solid #330000", display: "flex",
        alignItems: "center", justifyContent: "space-between", flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 10, height: 10, background: "#ff0000", boxShadow: "0 0 8px #ff0000" }} />
          <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: "0.12em", color: "#ff4444", textTransform: "uppercase" }}>
            AEGIS ENGINE — GRAPH MONITOR
          </span>
        </div>
        <div style={{ display: "flex", gap: 16, fontSize: 11, color: "#880000" }}>
          <span>NODES <span style={{ color: "#ffffff" }}>{graphData?.nodes?.length ?? 0}</span></span>
          <span>EDGES <span style={{ color: "#ffffff" }}>{graphData?.edges?.length ?? 0}</span></span>
          <span>RINGS <span style={{ color: "#ff0000" }}>{fraudRings.length}</span></span>
        </div>
      </div>

      {/* ── Main area ── */}
      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        {/* Graph */}
        <div ref={containerRef} style={{ flex: 1, position: "relative", minWidth: 0 }}>
          <svg ref={svgRef} style={{ display: "block", width: "100%", height: "100%" }} />

          {/* Tooltip */}
          {tooltip && (
            <div style={{
              position: "absolute", left: tooltip.x, top: tooltip.y,
              background: "#1a0000", border: `1px solid ${tooltip.acct ? (getRingColor(tooltip.acct.ring_id, fraudRings) ?? "#ff0000") : "#440000"}`,
              borderRadius: 0, padding: "10px 14px", pointerEvents: "none",
              fontSize: 11, lineHeight: 1.7, zIndex: 50,
              boxShadow: "0 4px 20px rgba(0,0,0,0.8)",
              maxWidth: 240,
            }}>
              <div style={{ color: "#ffffff", fontWeight: 700, marginBottom: 4 }}>{tooltip.node.id}</div>
              <div>Sent: <span style={{ color: "#ff4444" }}>
                {typeof tooltip.node.totalSent === "number" ? tooltip.node.totalSent.toLocaleString(undefined, { maximumFractionDigits: 2 }) : "—"}
              </span></div>
              <div>Received: <span style={{ color: "#ff4444" }}>
                {typeof tooltip.node.totalReceived === "number" ? tooltip.node.totalReceived.toLocaleString(undefined, { maximumFractionDigits: 2 }) : "—"}
              </span></div>
              <div>Tx Count: <span style={{ color: "#ff4444" }}>{tooltip.node.txCount ?? "—"}</span></div>
              {tooltip.acct && (
                <>
                  <hr style={{ border: "none", borderTop: "1px solid #330000", margin: "6px 0" }} />
                  <div style={{ color: "#ff0000", fontWeight: 700 }}>⚠ CRITICAL ANOMALY</div>
                  <div>Score: <span style={{ color: "#ffcc00" }}>{tooltip.acct.suspicion_score.toFixed(1)}</span></div>
                  <div>Ring: <span style={{ color: getRingColor(tooltip.acct.ring_id, fraudRings) ?? "#ff0000" }}>{tooltip.acct.ring_id}</span></div>
                </>
              )}
            </div>
          )}
        </div>

        {/* ── Side panel ── */}
        <div style={{
          width: 260, background: "#1a0000", borderLeft: "1px solid #330000",
          display: "flex", flexDirection: "column", flexShrink: 0, overflowY: "auto",
        }}>

          {/* Selected node detail */}
          {selected ? (
            <div style={{ padding: "14px 16px", borderBottom: "1px solid #330000" }}>
              <div style={{ fontSize: 10, color: "#880000", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>
                Selected Account
              </div>
              <div style={{ color: "#ffffff", fontWeight: 700, fontSize: 13, wordBreak: "break-all", marginBottom: 8 }}>
                {selected}
              </div>
              {selectedNode && (
                <div style={{ fontSize: 11, lineHeight: 1.8 }}>
                  <Row label="Total Sent" value={selectedNode.totalSent?.toLocaleString(undefined, { maximumFractionDigits: 2 }) ?? "—"} />
                  <Row label="Total Recv" value={selectedNode.totalReceived?.toLocaleString(undefined, { maximumFractionDigits: 2 }) ?? "—"} />
                  <Row label="Tx Count" value={selectedNode.txCount ?? "—"} />
                </div>
              )}
              {selectedAcct && (
                <div style={{ marginTop: 10 }}>
                  <div style={{
                    background: "#2a0000", border: "1px solid #ff000044",
                    borderRadius: 0, padding: "8px 10px",
                  }}>
                    <div style={{ color: "#ff0000", fontSize: 11, fontWeight: 700, marginBottom: 4 }}>⚠ FLAGGED</div>
                    <Row label="Score" value={selectedAcct.suspicion_score.toFixed(1)} accent="#ffcc00" />
                    <Row
                      label="Ring"
                      value={selectedAcct.ring_id}
                      accent={getRingColor(selectedAcct.ring_id, fraudRings) ?? "#ff0000"}
                    />
                  </div>
                </div>
              )}
              <button
                onClick={() => setSelected(null)}
                style={{
                  marginTop: 10, width: "100%", padding: "6px 0",
                  background: "transparent", border: "1px solid #440000",
                  borderRadius: 0, color: "#880000", cursor: "pointer",
                  fontSize: 11, fontFamily: "'Courier New', monospace",
                }}
              >
                Clear Selection
              </button>
            </div>
          ) : (
            <div style={{ padding: "14px 16px", borderBottom: "1px solid #330000", color: "#440000", fontSize: 11 }}>
              Select a node to inspect...
            </div>
          )}

          {/* Legend */}
          <div style={{ padding: "14px 16px", borderBottom: "1px solid #330000" }}>
            <div style={{ fontSize: 10, color: "#880000", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10 }}>
              Legend
            </div>
            <LegendItem color={NODE_NORMAL.stroke} label="Account [OK]" isSquare />
            <LegendItem color="#ef4444" label="Account [FLAG]" isSquare glow />
            <LegendItem color="#440000" label="Transaction" line />
            <LegendItem color="#ef4444" label="Anomalous Flow" line />
          </div>

          {/* Fraud rings */}
          <div style={{ padding: "14px 16px", flex: 1 }}>
            <div style={{ fontSize: 10, color: "#880000", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10 }}>
              Fraud Rings ({fraudRings.length})
            </div>
            {fraudRings.map((ring, i) => {
              const col = RING_PALETTE[i % RING_PALETTE.length];
              return (
                <div key={ring.ring_id} style={{
                  marginBottom: 10, background: "#1a0000",
                  border: `1px solid ${col}44`, borderLeft: `3px solid ${col}`,
                  borderRadius: 0, padding: "8px 10px",
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <span style={{ color: col, fontWeight: 700, fontSize: 12 }}>{ring.ring_id}</span>
                    <span style={{
                      background: "#000000", border: `1px solid ${col}55`,
                      padding: "1px 7px", fontSize: 10, color: col,
                    }}>
                      {ring.risk_score.toFixed(1)}
                    </span>
                  </div>
                  <div style={{ fontSize: 10, color: "#660000" }}>
                    {patternLabel(ring.pattern_type)} · {ring.member_accounts.length} nodes
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Small UI helpers ──────────────────────────────────────────────────────────
function Row({ label, value, accent }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between" }}>
      <span style={{ color: "#880000" }}>{label}</span>
      <span style={{ color: accent ?? "#ff4444" }}>{value}</span>
    </div>
  );
}

function LegendItem({ color, label, isSquare, line, glow }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7, fontSize: 11 }}>
      {line ? (
        <svg width="24" height="10">
          <line x1="0" y1="5" x2="24" y2="5" stroke={color} strokeWidth="2" />
        </svg>
      ) : (
        <svg width="18" height="18">
          <rect x="2" y="2" width="14" height="14" fill={isSquare ? "#0a0a0a" : "none"}
            stroke={color} strokeWidth="2" filter={glow ? "url(#glow)" : null} />
        </svg>
      )}
      <span style={{ color: "#aa0000" }}>{label}</span>
    </div>
  );
}
