"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { VegaChart } from "@/components/vega-chart"
import { Badge } from "@/components/ui/badge"
import type { VisSpec, Clause } from "@/lib/types"

interface ChartInspectorProps {
  chart: VisSpec
  datasetId: string
  onApplyAction?: (intentPatch: Clause[]) => void
}

export function ChartInspector({ chart, datasetId, onApplyAction }: ChartInspectorProps) {
  return (
    <Card className="h-full border-green-500/20 bg-black/40">
      <CardHeader className="pb-3 border-b border-green-500/10">
        <CardTitle className="text-base text-green-500 uppercase tracking-widest">{chart.title}</CardTitle>
        <Badge variant="outline" className="w-fit border-green-500/30 text-green-500/70 rounded-none">
          {chart.chartType}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-4 pt-4">
        <div className="rounded-none border border-green-500/10 p-4 bg-black/20">
          <VegaChart spec={chart.vegaLite} className="w-full" />
        </div>

        <div className="space-y-2">
          <h4 className="text-xs font-bold text-green-500/50 uppercase tracking-widest">Dataset Reference</h4>
          <p className="text-sm text-green-500/70 font-mono">
            {datasetId}
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
