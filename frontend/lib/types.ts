// Column types
export type ColumnType = "number" | "category" | "date" | "unknown"

// Column profile
export interface ColumnProfile {
  name: string
  type: ColumnType
  missingPct: number
  cardinality: number
  min?: number
  max?: number
  mean?: number
  std?: number
  topValues?: Array<{ value: string; count: number }>
}

// Dataset profile
export interface DatasetProfile {
  datasetId: string
  rowCount: number
  colCount: number
  columns: ColumnProfile[]
}

// Intent clause for chart exploration
export interface Clause {
  field: string
  role: "x" | "y" | "color" | "filter" | "group"
  op?: "=" | "!=" | "<" | "<=" | ">" | ">=" | "in"
  value?: string | number | Array<string | number>
}

// Intent (collection of clauses)
export interface Intent {
  clauses: Clause[]
}

// Chart type
export type ChartType = "histogram" | "bar" | "scatter" | "line"

// Vega-Lite spec (simplified)
export interface VisSpec {
  id: string
  title: string
  chartType: ChartType
  intent: Intent
  vegaLite: object
  score: number
  data?: Record<string, unknown>[]
}

// Stored dataset (in-memory)
export interface StoredDataset {
  datasetId: string
  profile: DatasetProfile
  rows: Record<string, unknown>[]
  sampleRows: Record<string, unknown>[]
}

// API response types
export interface UploadResponse {
  datasetId: string
  profile: DatasetProfile
  storedDataset?: StoredDataset
}

export interface RecommendResponse {
  charts: VisSpec[]
}
