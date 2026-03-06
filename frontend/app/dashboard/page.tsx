"use client"

import { useEffect, useState, Suspense } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import dynamic from "next/dynamic"
import Link from "next/link"
import { AlertCircle, Download, Shield, Users, Activity, Clock, ChevronDown, ChevronUp } from "lucide-react"
import { Button } from "@/components/ui/button"
import { FinancialLoading } from "@/components/financial-loading"
import { getBackendUrl } from "@/lib/api"

// Dynamically import GraphVisualizer (uses d3, no SSR)
const GraphVisualizer = dynamic(
  () => import("@/components/GraphVisualizer"),
  { ssr: false, loading: () => <div className="w-full h-[600px] bg-[#080f1a] rounded-xl animate-pulse" /> }
)

interface SuspiciousAccount {
  account_id: string
  suspicion_score: number
  detected_patterns: string[]
  ring_id: string
}

interface FraudRing {
  ring_id: string
  member_accounts: string[]
  pattern_type: string
  risk_score: number
  risk_level: string
}

interface AnalysisResult {
  result_id: string
  suspicious_accounts: SuspiciousAccount[]
  fraud_rings: FraudRing[]
  summary: {
    total_accounts_analyzed: number
    suspicious_accounts_flagged: number
    fraud_rings_detected: number
    processing_time_seconds: number
  }
  graph_data: {
    nodes: any[]
    edges: any[]
    fraud_edge_pairs: any[]
  }
  accuracy_metrics?: {
    accuracy: number
    confusion_matrix: {
      tn: number; fp: number; fn: number; tp: number;
    }
    total_actual_fraud: number
    total_predicted_fraud: number
  }
}

function AccuracyMetrics({ metrics }: { metrics: AnalysisResult["accuracy_metrics"] }) {
  if (!metrics) return null;

  const { tn, fp, fn, tp } = metrics.confusion_matrix;
  const precision = tp + fp > 0 ? (tp / (tp + fp)) : 0;
  const recall = tp + fn > 0 ? (tp / (tp + fn)) : 0;
  const f1 = precision + recall > 0 ? (2 * precision * recall / (precision + recall)) : 0;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
      {/* Accuracy & F1 Card */}
      <div className="md:col-span-1 rounded-xl p-6 border border-green-500/20 bg-[#0b1928]">
        <h3 className="text-sm font-bold text-green-500/60 uppercase tracking-widest mb-4">Model Reliability</h3>
        <div className="flex flex-col items-center justify-center space-y-4">
          <div className="relative h-32 w-32 flex items-center justify-center">
            <svg className="h-full w-full transform -rotate-90">
              <circle cx="64" cy="64" r="58" stroke="currentColor" strokeWidth="8" fill="transparent" className="text-white/5" />
              <circle cx="64" cy="64" r="58" stroke="currentColor" strokeWidth="8" fill="transparent" strokeDasharray={364} strokeDashoffset={364 - (364 * metrics.accuracy)} className="text-green-500 transition-all duration-1000" />
            </svg>
            <div className="absolute flex flex-col items-center">
              <span className="text-3xl font-black text-white">{(metrics.accuracy * 100).toFixed(0)}%</span>
              <span className="text-[10px] text-green-500/50 uppercase">Accuracy</span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 w-full pt-4 border-t border-white/5">
             <div className="text-center">
               <div className="text-lg font-bold text-white">{(precision * 100).toFixed(1)}%</div>
               <div className="text-[9px] text-green-500/40 uppercase font-bold">Precision</div>
             </div>
             <div className="text-center">
               <div className="text-lg font-bold text-white">{(recall * 100).toFixed(1)}%</div>
               <div className="text-[9px] text-green-500/40 uppercase font-bold">Recall</div>
             </div>
          </div>
        </div>
      </div>

      {/* Confusion Matrix Card */}
      <div className="md:col-span-2 rounded-xl p-6 border border-green-500/20 bg-[#0b1928] overflow-hidden relative">
        <h3 className="text-sm font-bold text-green-500/60 uppercase tracking-widest mb-4">Confusion Matrix (Transaction Level)</h3>
        <div className="grid grid-cols-2 gap-4 h-[180px]">
          <MatrixBox label="True Negative" sub="Correctly Flagged OK" value={tn} color="rgba(255,255,255,0.05)" />
          <MatrixBox label="False Positive" sub="Type I Error" value={fp} color="rgba(255,140,0,0.1)" border="rgba(255,140,0,0.3)" />
          <MatrixBox label="False Negative" sub="Type II Error (Missed)" value={fn} color="rgba(255,58,92,0.1)" border="rgba(255,58,92,0.3)" />
          <MatrixBox label="True Positive" sub="Correctly Flagged Fraud" value={tp} color="rgba(34,197,94,0.1)" border="rgba(34,197,94,0.3)" />
        </div>
      </div>
    </div>
  )
}

function MatrixBox({ label, sub, value, color, border }: { label: string; sub: string; value: number; color: string; border?: string }) {
  return (
    <div className="rounded-lg p-3 flex flex-col justify-center border" style={{ background: color, borderColor: border || "rgba(255,255,255,0.05)" }}>
      <div className="text-[10px] font-bold text-white/40 uppercase tracking-tighter">{label}</div>
      <div className="text-2xl font-black text-white my-1">{value.toLocaleString()}</div>
      <div className="text-[9px] font-medium text-white/20 italic">{sub}</div>
    </div>
  )
}

function DashboardContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const resultId = searchParams.get("resultId")

  const [data, setData] = useState<AnalysisResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [accountsExpanded, setAccountsExpanded] = useState(false)

  useEffect(() => {
    if (!resultId) {
      router.push("/")
      return
    }

    const fetchResults = async () => {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(getBackendUrl(`/api/results/${resultId}`))
        if (!res.ok) {
          if (res.status === 404) throw new Error("Analysis result not found. Please run a new analysis.")
          throw new Error("Failed to fetch results")
        }
        const json = await res.json()
        setData(json)
      } catch (err) {
        setError(err instanceof Error ? err.message : "An error occurred")
      } finally {
        setLoading(false)
      }
    }

    fetchResults()
  }, [resultId, router])

  const handleDownload = async () => {
    if (!resultId) return

    try {
      const res = await fetch(getBackendUrl(`/api/download/${resultId}`))
      if (!res.ok) throw new Error("Download failed")

      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `aegis_report_${resultId}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error("Download failed:", err)
    }
  }

  if (loading) return <FinancialLoading />

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center pt-20" style={{ background: "#050505" }}>
        <div className="flex flex-col items-center gap-4 text-center max-w-md">
          <AlertCircle className="h-12 w-12" style={{ color: "#ff3a5c" }} />
          <h2 className="text-xl font-semibold" style={{ color: "#f0f0f0" }}>Something went wrong</h2>
          <p style={{ color: "rgba(255,255,255,0.5)" }}>{error || "Result not found"}</p>
          <Button asChild>
            <Link href="/">Upload a new file</Link>
          </Button>
        </div>
      </div>
    )
  }

  const { suspicious_accounts, fraud_rings, summary, graph_data, accuracy_metrics } = data
  const displayedAccounts = accountsExpanded ? suspicious_accounts : suspicious_accounts.slice(0, 10)

  return (
    <div className="min-h-screen pt-20" style={{ background: "#050505" }}>
      {/* Top bar */}
      <div className="sticky top-[72px] z-30 border-b" style={{ borderColor: "rgba(255,255,255,0.08)", background: "rgba(8,15,26,0.85)", backdropFilter: "blur(20px)" }}>
        <div className="container mx-auto flex items-center justify-between h-14 px-4 pt-1">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="h-2.5 w-2.5 rounded-full" style={{ background: "#22c55e", boxShadow: "0 0 8px #22c55e" }} />
              <span className="text-sm font-medium" style={{ color: "#e0f0ff" }}>Analysis Complete</span>
            </div>
            <div className="h-4 w-px" style={{ background: "rgba(255,255,255,0.12)" }} />
            <span className="text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>
              ID: {data.result_id}
            </span>
          </div>
          <Button
            onClick={handleDownload}
            className="gap-2 text-sm font-medium"
            style={{ background: "#22c55e",cursor: "pointer", color: "#fff" }}
            id="download-report-btn"
          >
            <Download className="h-4 w-4" />
            Download Report
          </Button>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6 space-y-6" style={{ paddingTop: "24px" }}>

        {/* ── Summary Stats ── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            icon={<Users className="h-5 w-5" />}
            label="Accounts Analyzed"
            value={summary.total_accounts_analyzed.toLocaleString()}
            color="#4f9cff"
          />
          <StatCard
            icon={<Shield className="h-5 w-5" />}
            label="Suspicious Flagged"
            value={summary.suspicious_accounts_flagged.toLocaleString()}
            color="#ff3a5c"
          />
          <StatCard
            icon={<Activity className="h-5 w-5" />}
            label="Fraud Rings"
            value={summary.fraud_rings_detected.toLocaleString()}
            color="#ff8c00"
          />
          <StatCard
            icon={<Clock className="h-5 w-5" />}
            label="Processing Time"
            value={`${summary.processing_time_seconds}s`}
            color="#22c55e"
          />
        </div>

        {/* ── Accuracy & Performance ── */}
        {accuracy_metrics && (
           <>
             <h2 className="text-lg font-semibold mb-3 flex items-center gap-2" style={{ color: "#e0f0ff" }}>
               <Shield className="w-5 h-5 text-green-500" />
               Heuristic Performance Verification
             </h2>
             <AccuracyMetrics metrics={accuracy_metrics} />
           </>
        )}

        {/* ── Interactive Graph ── */}
        <div>
          <h2 className="text-lg font-semibold mb-3" style={{ color: "#e0f0ff" }}>
            Interactive Transaction Graph
          </h2>
          <div className="rounded-xl overflow-hidden" style={{ height: "600px", border: "1px solid rgba(255,255,255,0.08)" }}>
            <GraphVisualizer
              graphData={graph_data}
              flaggedData={{
                suspicious_accounts,
                fraud_rings,
              }}
            />
          </div>
        </div>

        {/* ── Fraud Rings Table ── */}
        <div>
          <h2 className="text-lg font-semibold mb-3" style={{ color: "#e0f0ff" }}>
            Detected Fraud Rings ({fraud_rings.length})
          </h2>
          <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm" style={{ fontFamily: "'Courier New', monospace" }}>
                <thead>
                  <tr style={{ background: "#0b1928", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                    <th className="text-left px-4 py-3 font-semibold" style={{ color: "#4a7a9a" }}>Ring ID</th>
                    <th className="text-left px-4 py-3 font-semibold" style={{ color: "#4a7a9a" }}>Pattern Type</th>
                    <th className="text-center px-4 py-3 font-semibold" style={{ color: "#4a7a9a" }}>Member Count</th>
                    <th className="text-center px-4 py-3 font-semibold" style={{ color: "#4a7a9a" }}>Risk Score</th>
                    <th className="text-left px-4 py-3 font-semibold" style={{ color: "#4a7a9a" }}>Member Account IDs</th>
                  </tr>
                </thead>
                <tbody>
                  {fraud_rings.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="text-center px-4 py-8" style={{ color: "#4a7a9a" }}>
                        No fraud rings detected
                      </td>
                    </tr>
                  ) : (
                    fraud_rings.map((ring, i) => {
                      const riskColor = ring.risk_score >= 80 ? "#ff3a5c" : ring.risk_score >= 60 ? "#ff8c00" : ring.risk_score >= 36 ? "#ffe600" : "#22c55e"
                      return (
                        <tr
                          key={ring.ring_id}
                          style={{
                            background: i % 2 === 0 ? "#080f1a" : "#0a1525",
                            borderBottom: "1px solid rgba(255,255,255,0.04)",
                          }}
                        >
                          <td className="px-4 py-3 font-bold" style={{ color: "#00e5ff" }}>
                            {ring.ring_id}
                          </td>
                          <td className="px-4 py-3" style={{ color: "#c0d8f0" }}>
                            <span className="inline-block px-2 py-0.5 rounded text-xs font-medium"
                              style={{ background: "rgba(255,138,0,0.15)", color: "#ff8c00", border: "1px solid rgba(255,138,0,0.25)" }}>
                              {ring.pattern_type.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center" style={{ color: "#c0d8f0" }}>
                            {ring.member_accounts.length}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className="inline-block px-2 py-0.5 rounded text-xs font-bold"
                              style={{ background: `${riskColor}22`, color: riskColor, border: `1px solid ${riskColor}44` }}>
                              {ring.risk_score.toFixed(1)}
                            </span>
                          </td>
                          <td className="px-4 py-3" style={{ color: "#7a9ab0" }}>
                            <span className="text-xs">{ring.member_accounts.join(", ")}</span>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* ── Suspicious Accounts Table ── */}
        <div>
          <h2 className="text-lg font-semibold mb-3" style={{ color: "#e0f0ff" }}>
            Suspicious Accounts ({suspicious_accounts.length})
          </h2>
          <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm" style={{ fontFamily: "'Courier New', monospace" }}>
                <thead>
                  <tr style={{ background: "#0b1928", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                    <th className="text-left px-4 py-3 font-semibold" style={{ color: "#4a7a9a" }}>Account ID</th>
                    <th className="text-center px-4 py-3 font-semibold" style={{ color: "#4a7a9a" }}>Suspicion Score</th>
                    <th className="text-left px-4 py-3 font-semibold" style={{ color: "#4a7a9a" }}>Detected Patterns</th>
                    <th className="text-left px-4 py-3 font-semibold" style={{ color: "#4a7a9a" }}>Ring ID</th>
                  </tr>
                </thead>
                <tbody>
                  {displayedAccounts.map((acct, i) => {
                    const scoreColor = acct.suspicion_score >= 80 ? "#ff3a5c" : acct.suspicion_score >= 60 ? "#ff8c00" : acct.suspicion_score >= 36 ? "#ffe600" : "#22c55e"
                    return (
                      <tr
                        key={acct.account_id}
                        style={{
                          background: i % 2 === 0 ? "#080f1a" : "#0a1525",
                          borderBottom: "1px solid rgba(255,255,255,0.04)",
                        }}
                      >
                        <td className="px-4 py-3 font-bold" style={{ color: "#e0f0ff" }}>
                          {acct.account_id}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="inline-block px-2 py-0.5 rounded text-xs font-bold"
                            style={{ background: `${scoreColor}22`, color: scoreColor, border: `1px solid ${scoreColor}44` }}>
                            {acct.suspicion_score.toFixed(1)}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1">
                            {acct.detected_patterns.map(p => (
                              <span key={p} className="inline-block text-xs px-2 py-0.5 rounded"
                                style={{ background: "rgba(255,58,92,0.1)", color: "#ff8899", border: "1px solid rgba(255,58,92,0.2)" }}>
                                {p.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="px-4 py-3" style={{ color: "#00e5ff" }}>
                          {acct.ring_id}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {suspicious_accounts.length > 10 && (
              <div className="flex justify-center py-3" style={{ background: "#0b1928", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                <button
                  onClick={() => setAccountsExpanded(!accountsExpanded)}
                  className="flex items-center gap-1 text-xs font-medium transition-colors"
                  style={{ color: "#4f9cff" }}
                >
                  {accountsExpanded ? (
                    <>Show Less <ChevronUp className="h-3 w-3" /></>
                  ) : (
                    <>Show All {suspicious_accounts.length} Accounts <ChevronDown className="h-3 w-3" /></>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Bottom spacer */}
        <div className="h-8" />
      </div>
    </div>
  )
}

function StatCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color: string }) {
  return (
    <div className="rounded-xl p-4" style={{ background: "#0b1928", border: "1px solid rgba(255,255,255,0.08)" }}>
      <div className="flex items-center gap-3">
        <div className="rounded-lg p-2" style={{ background: `${color}18` }}>
          <div style={{ color }}>{icon}</div>
        </div>
        <div>
          <p className="text-xs font-medium" style={{ color: "#4a7a9a" }}>{label}</p>
          <p className="text-xl font-bold" style={{ color: "#e0f0ff" }}>{value}</p>
        </div>
      </div>
    </div>
  )
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<FinancialLoading />}>
      <DashboardContent />
    </Suspense>
  )
}
