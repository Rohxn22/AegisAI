"""
FastAPI Backend — FinGraphix Mule Detection Engine
Endpoints:
  POST /api/analyze     — Upload CSV, run engine, return result ID
  GET  /api/results/{id} — Fetch detection results
  GET  /api/download/{id} — Download output JSON file
"""

import json
import os
import sys
import uuid
import time
import pandas as pd
import io
import networkx as nx
from pathlib import Path
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from sklearn.metrics import confusion_matrix, accuracy_score, classification_report

# Add project root so engine + togh imports work
PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from aegis_engine.pipeline import DetectionPipeline
from aegis_engine.togh import csv_to_graph, save_graph_json
from aegis_engine.ingest import ingest_from_graph_json

app = FastAPI(title="AegisAI API", version="1.0.0")

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Paths
if os.getenv("RENDER") or os.getenv("CLOUD_DEPLOY"):
    DATA_DIR = Path("/tmp/aegis")
else:
    DATA_DIR = Path(os.getenv("DATA_DIR", PROJECT_ROOT / "data"))

OUTPUT_DIR = DATA_DIR / "output"
UPLOAD_DIR = DATA_DIR / "uploads"

OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

result_cache: dict[str, dict] = {}

def _find_sample_csv() -> Path | None:
    candidates = [
        PROJECT_ROOT / "AegisAI" / "pattern_transactions.csv",
        PROJECT_ROOT / "AegisAI" / "new_transactions.csv",
        PROJECT_ROOT / "pattern_transactions.csv",
        PROJECT_ROOT / "new_transactions.csv",
        PROJECT_ROOT / "data" / "transactions.csv",
    ]
    for p in candidates:
        if p.exists():
            return p
    return None

SAMPLE_CSV = _find_sample_csv()

def calculate_metrics(df, result):
    # Map suspicious accounts
    flagged_accounts = {a.account_id for a in result.suspicious_accounts}
    
    # Standardize column names for comparison
    fieldnames_lower = [f.lower().strip() for f in df.columns]
    
    # Find is_flag
    flag_col = next((c for c in df.columns if c.lower().strip() == 'is_flag'), None)
    if not flag_col:
        return None

    # Find sender/receiver columns using same synonyms as togh.py
    sender_synonyms = ["sender_id", "send_id", "from_id", "sender", "send_account", "source"]
    receiver_synonyms = ["receiver_id", "recv_id", "to_id", "receiver", "receiver_account", "target"]
    
    sender_col = next((c for c in df.columns if c.lower().strip() in sender_synonyms), None)
    receiver_col = next((c for c in df.columns if c.lower().strip() in receiver_synonyms), None)

    if not sender_col or not receiver_col:
        return None

    # Calculate actual vs predicted
    # We use .astype(str) to handle potential mixed types in IDs
    df['actual_bool'] = df[flag_col].map(lambda x: 1 if str(x).lower() == 'true' else 0)
    df['predicted_bool'] = df.apply(
        lambda row: 1 if (str(row[sender_col]).strip() in flagged_accounts or 
                          str(row[receiver_col]).strip() in flagged_accounts) else 0, 
        axis=1
    )

    y_true = df['actual_bool']
    y_pred = df['predicted_bool']

    cm = confusion_matrix(y_true, y_pred)
    acc = accuracy_score(y_true, y_pred)
    
    # Flatten confusion matrix for JSON: [tn, fp, fn, tp]
    if cm.size == 4:
        tn, fp, fn, tp = cm.ravel()
    elif cm.size == 1:
        # Handle case where only one class is present in y_true
        val = int(cm[0][0])
        if (y_true == 0).all(): # All negative
            tn, fp, fn, tp = val, 0, 0, 0
        else: # All positive
            tn, fp, fn, tp = 0, 0, 0, val
    else:
        tn, fp, fn, tp = 0, 0, 0, 0

    return {
        "accuracy": round(float(acc), 4),
        "confusion_matrix": {
            "tn": int(tn), "fp": int(fp),
            "fn": int(fn), "tp": int(tp)
        },
        "total_actual_fraud": int(y_true.sum()),
        "total_predicted_fraud": int(y_pred.sum())
    }

@app.get("/api/health")
async def health():
    return {"status": "healthy", "uptime": time.time()}

@app.post("/api/analyze")
async def analyze(file: UploadFile = File(...)):
    if not file.filename or not file.filename.endswith(".csv"):
        raise HTTPException(status_code=400, detail="Only CSV files are supported")

    result_id = str(uuid.uuid4())[:8]
    try:
        contents = await file.read()
        csv_path = UPLOAD_DIR / f"{result_id}.csv"
        with open(csv_path, "wb") as f:
            f.write(contents)

        # Step 1: Use togh.py's robust conversion (handles synonyms)
        G = csv_to_graph(str(csv_path))
        graph_data = nx.node_link_data(G)

        # Step 2: Use ingest_from_graph_json to map back to pipeline format
        raw_rows = ingest_from_graph_json(graph_data)

        # Step 3: Run pipeline
        pipeline = DetectionPipeline()
        result = pipeline.run(raw_rows)

        # Step 4: Calculate metrics (if is_flag exists)
        df = pd.read_csv(io.BytesIO(contents))
        metrics = calculate_metrics(df, result)

        # Build output
        output = {
            "result_id": result_id,
            "suspicious_accounts": [{"account_id": a.account_id, "suspicion_score": a.suspicion_score, "detected_patterns": a.detected_patterns, "ring_id": a.ring_id} for a in result.suspicious_accounts],
            "fraud_rings": [{"ring_id": r.ring_id, "member_accounts": r.member_accounts, "pattern_type": r.pattern_type, "risk_score": r.risk_score, "risk_level": r.risk_level} for r in result.fraud_rings],
            "summary": result.summary,
            "graph_data": result.graph_data,
            "accuracy_metrics": metrics
        }

        with open(OUTPUT_DIR / f"{result_id}.json", "w") as f:
            json.dump(output, f, indent=2)
        result_cache[result_id] = output
        return {"result_id": result_id, "status": "complete"}
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/analyze/sample")
async def analyze_sample():
    if not SAMPLE_CSV:
        raise HTTPException(status_code=404, detail="Sample CSV not found")
    
    result_id = f"sample_{str(uuid.uuid4())[:6]}"
    try:
        # Same robust flow as /analyze
        G = csv_to_graph(str(SAMPLE_CSV))
        graph_data = nx.node_link_data(G)
        raw_rows = ingest_from_graph_json(graph_data)

        pipeline = DetectionPipeline()
        result = pipeline.run(raw_rows)

        df = pd.read_csv(SAMPLE_CSV)
        metrics = calculate_metrics(df, result)

        output = {
            "result_id": result_id,
            "suspicious_accounts": [{"account_id": a.account_id, "suspicion_score": a.suspicion_score, "detected_patterns": a.detected_patterns, "ring_id": a.ring_id} for a in result.suspicious_accounts],
            "fraud_rings": [{"ring_id": r.ring_id, "member_accounts": r.member_accounts, "pattern_type": r.pattern_type, "risk_score": r.risk_score, "risk_level": r.risk_level} for r in result.fraud_rings],
            "summary": result.summary,
            "graph_data": result.graph_data,
            "accuracy_metrics": metrics
        }

        with open(OUTPUT_DIR / f"{result_id}.json", "w") as f:
            json.dump(output, f, indent=2)
        result_cache[result_id] = output
        return output
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/results/{result_id}")
async def get_results(result_id: str):
    if result_id in result_cache:
        return result_cache[result_id]
    output_path = OUTPUT_DIR / f"{result_id}.json"
    if not output_path.exists():
        raise HTTPException(status_code=404, detail="Result not found")
    with open(output_path, "r") as f:
        return json.load(f)

@app.get("/api/download/{result_id}")
async def download_results(result_id: str):
    output_path = OUTPUT_DIR / f"{result_id}.json"
    if not output_path.exists():
        raise HTTPException(status_code=404, detail="Result not found")
    return FileResponse(path=str(output_path), filename=f"aegis_report_{result_id}.json")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
