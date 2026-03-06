"use client"

import { useEffect } from "react"
import { X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { VegaChart } from "@/components/vega-chart"
import type { VisSpec, DatasetProfile } from "@/lib/types"

interface ChartExpandedModalProps {
  chart: VisSpec
  profile: DatasetProfile
  datasetId: string
  onClose: () => void
  onNavigateToChart: (chart: VisSpec) => void
}

export function ChartExpandedModal({
  chart,
  datasetId,
  onClose,
}: ChartExpandedModalProps) {
  
  // Disable body scroll when modal is open
  useEffect(() => {
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = ""
    }
  }, [])

  return (
    <div className="fixed inset-0 z-50 bg-[#020202] text-green-500 font-mono">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-green-500/30 bg-black/80 backdrop-blur-md px-6 py-4">
        <div className="flex items-center gap-4">
          <div className="flex items-center justify-center h-8 w-8 bg-green-500/10 border border-green-500/30 rounded text-green-500">
            <span className="font-bold text-xs">EXP</span>
          </div>
          <h2 className="text-lg font-bold uppercase tracking-widest">{chart.title}</h2>
        </div>
        
        <div className="flex items-center gap-4">
          <Badge variant="outline" className="border-green-500/30 text-green-500/70 rounded-none uppercase text-[10px]">
            ID: {datasetId}
          </Badge>
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={onClose} 
            className="hover:bg-green-500/10 hover:text-green-500 border border-transparent hover:border-green-500/30 rounded-none"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <div className="h-[calc(100vh-65px)] overflow-y-auto p-8 flex flex-col items-center">
        {/* Cyber Grid Background Effect */}
        <div 
          className="absolute inset-0 pointer-events-none opacity-5"
          style={{
            backgroundImage: `linear-gradient(rgba(0, 255, 0, 0.2) 1px, transparent 1px), linear-gradient(90deg, rgba(0, 255, 0, 0.2) 1px, transparent 1px)`,
            backgroundSize: '30px 30px',
          }}
        />

        <div className="relative z-10 w-full max-w-5xl space-y-8">
          {/* Chart Section */}
          <div className="border border-green-500/30 bg-black/60 p-8 shadow-[0_0_30px_rgba(0,255,0,0.05)] relative">
            <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-green-500" />
            <div className="absolute top-0 right-0 w-2 h-2 border-t border-r border-green-500" />
            <div className="absolute bottom-0 left-0 w-2 h-2 border-b border-l border-green-500" />
            <div className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-green-500" />
            
            <div className="flex justify-center bg-black/20 p-6">
               <VegaChart spec={chart.vegaLite} className="w-full" />
            </div>
          </div>

          {/* Metadata Section */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="border border-green-500/20 p-4 bg-green-500/5">
              <h3 className="text-xs font-bold text-green-500/50 uppercase tracking-widest mb-2">Technical Specifications</h3>
              <ul className="space-y-1 text-sm">
                <li className="flex justify-between border-b border-green-500/10 pb-1">
                  <span className="text-green-500/40">Chart Type</span>
                  <span className="text-green-500">{chart.chartType}</span>
                </li>
                <li className="flex justify-between border-b border-green-500/10 pb-1">
                  <span className="text-green-500/40">Library</span>
                  <span className="text-green-500">Vega-Lite v5</span>
                </li>
                <li className="flex justify-between border-b border-green-500/10 pb-1">
                  <span className="text-green-500/40">Renderer</span>
                  <span className="text-green-500">Canvas/SVG</span>
                </li>
              </ul>
            </div>
            
            <div className="border border-green-500/20 p-4 bg-green-500/5">
              <h3 className="text-xs font-bold text-green-500/50 uppercase tracking-widest mb-2">Engine Context</h3>
              <p className="text-sm leading-relaxed text-green-500/80">
                Data visualization generated via deterministic AegisAI pipeline. 
                Values represent structural relationships within the transaction graph.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
