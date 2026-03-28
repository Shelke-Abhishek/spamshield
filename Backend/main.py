# FILE: backend/main.py
# PURPOSE: Production FastAPI backend for SpamShield.
#          Loads XLM-RoBERTa from HuggingFace Hub on startup.
#
# HOW TO RUN LOCALLY:
#   uvicorn main:app --host 0.0.0.0 --port 8000 --reload
#
# ENVIRONMENT VARIABLES (set these in Render dashboard):
#   MODEL_REPO   — your HuggingFace model repo name (e.g. "yourname/spamshield-xlmr")
#   HF_TOKEN     — your HuggingFace token (only needed if repo is private)

import os
import json
import time
import torch
import logging
from contextlib import asynccontextmanager
from langdetect import detect, DetectorFactory
from transformers import XLMRobertaTokenizerFast, XLMRobertaForSequenceClassification
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Optional

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)s  %(message)s",
    datefmt="%H:%M:%S"
)
log = logging.getLogger(__name__)
DetectorFactory.seed = 0

# ─────────────────────────────────────────────
# CONFIGURATION
# MODEL_REPO: set this to your HuggingFace repo after uploading your model.
# Format: "your-huggingface-username/your-model-name"
# Example: "rahul123/spamshield-xlmr"
# ─────────────────────────────────────────────
MODEL_REPO      = os.getenv("MODEL_REPO", "your-hf-username/spamshield-xlmr")
HF_TOKEN        = os.getenv("HF_TOKEN", None)   # Leave None if repo is public
MAX_LENGTH      = 128
THRESHOLD       = 0.5
TRAINED_LANGS   = {"en", "hi"}

LANGUAGE_NAMES = {
    "en": "English", "hi": "Hindi",   "fr": "French",  "de": "German",
    "es": "Spanish", "ar": "Arabic",  "mr": "Marathi", "it": "Italian",
    "pt": "Portuguese", "nl": "Dutch", "ru": "Russian", "tr": "Turkish",
}

# ─────────────────────────────────────────────
# GLOBAL MODEL STATE
# We store the model in a dict so it loads once at startup
# and is shared across all incoming requests.
# This is critical for performance — loading takes 15–30 seconds.
# ─────────────────────────────────────────────
state = {"model": None, "tokenizer": None, "device": None, "metrics": {}}


def load_everything():
    """
    Downloads and loads the model from HuggingFace Hub.
    Called once at server startup via the lifespan hook below.
    """
    log.info(f"Loading model from HuggingFace Hub: '{MODEL_REPO}'")
    log.info("This takes 15–30 seconds on first startup (model is ~1.1 GB).")
    start = time.time()

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    log.info(f"Device: {device}")

    # Download tokenizer and model from HuggingFace Hub
    # use_auth_token is only needed if your repo is private
    tokenizer = XLMRobertaTokenizerFast.from_pretrained(
        MODEL_REPO,
        use_auth_token=HF_TOKEN
    )
    model = XLMRobertaForSequenceClassification.from_pretrained(
        MODEL_REPO,
        use_auth_token=HF_TOKEN
    )
    model.to(device)
    model.eval()

    state["model"]     = model
    state["tokenizer"] = tokenizer
    state["device"]    = device

    log.info(f"Model loaded in {time.time() - start:.1f}s")

    # Load pre-computed metrics if they exist locally
    # (We'll bundle model_metrics.json with the repo)
    if os.path.exists("model_metrics.json"):
        with open("model_metrics.json") as f:
            state["metrics"] = json.load(f)
        log.info("Metrics loaded.")


# ─────────────────────────────────────────────
# LIFESPAN — runs load_everything() at startup
# This is the modern FastAPI way (replaces @app.on_event("startup"))
# ─────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    load_everything()
    yield  # Server runs here
    # (cleanup code would go here if needed)


# ─────────────────────────────────────────────
# APP SETUP
# ─────────────────────────────────────────────
app = FastAPI(
    title="SpamShield API",
    description="Multilingual spam classifier powered by XLM-RoBERTa",
    version="2.0.0",
    lifespan=lifespan
)

# CORS — allows your Vercel frontend to call this API
# Replace "https://your-vercel-app.vercel.app" with your actual Vercel URL
# after deploying the frontend. For now "*" works for testing.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "*",                                     # Allow all during development
        "https://your-app.vercel.app",           # Replace with your Vercel URL
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─────────────────────────────────────────────
# SCHEMAS
# ─────────────────────────────────────────────
class PredictRequest(BaseModel):
    text: str = Field(
        ...,
        min_length=1,
        max_length=5000,
        example="Congratulations! You've won a free iPhone. Click here to claim!"
    )

class ModelMetrics(BaseModel):
    accuracy:  Optional[float] = None
    f1:        Optional[float] = None
    precision: Optional[float] = None
    recall:    Optional[float] = None
    auc_roc:   Optional[float] = None
    test_set_size: Optional[int] = None

class PredictResponse(BaseModel):
    label:                   str
    confidence:              float
    spam_prob:               float
    detected_language:       str
    detected_language_code:  str
    language_supported:      bool
    model_metrics:           ModelMetrics
    processing_time_ms:      float
    model_version:           str = "xlm-roberta-base-finetuned-v1"


# ─────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────
def detect_language(text: str):
    try:
        code = detect(text.strip())
        return code, LANGUAGE_NAMES.get(code, code.upper())
    except Exception:
        return "unknown", "Unknown"


def run_inference(text: str):
    tokenizer = state["tokenizer"]
    model     = state["model"]
    device    = state["device"]

    inputs = tokenizer(
        text,
        max_length=MAX_LENGTH,
        padding="max_length",
        truncation=True,
        return_tensors="pt"
    )
    inputs = {k: v.to(device) for k, v in inputs.items()}

    with torch.no_grad():
        outputs = model(**inputs)

    probs     = torch.softmax(outputs.logits, dim=1)[0]
    spam_prob = float(probs[1].cpu())

    if spam_prob >= THRESHOLD:
        return "spam", spam_prob, spam_prob
    return "ham", 1.0 - spam_prob, spam_prob


# ─────────────────────────────────────────────
# ENDPOINTS
# ─────────────────────────────────────────────
@app.get("/", tags=["Health"])
def root():
    return {
        "status": "online",
        "model": MODEL_REPO,
        "version": "2.0.0",
        "docs": "/docs"
    }


@app.get("/health", tags=["Health"])
def health():
    return {
        "status": "ok",
        "model_loaded": state["model"] is not None,
        "device": str(state["device"]),
        "metrics_available": bool(state["metrics"]),
    }


@app.get("/metrics", tags=["Metrics"])
def get_metrics():
    if not state["metrics"]:
        raise HTTPException(status_code=404, detail="Metrics not available.")
    return state["metrics"]


@app.post("/predict", response_model=PredictResponse, tags=["Prediction"])
def predict(request: PredictRequest):
    if state["model"] is None:
        raise HTTPException(status_code=503, detail="Model not loaded yet. Try again in 30 seconds.")

    start = time.time()
    text  = request.text.strip()

    lang_code, lang_name   = detect_language(text)
    lang_supported         = lang_code in TRAINED_LANGS
    label, confidence, spam_prob = run_inference(text)
    elapsed_ms             = (time.time() - start) * 1000

    log.info(f"{label.upper()} conf={confidence:.3f} lang={lang_code} {elapsed_ms:.0f}ms")

    m = state["metrics"]
    return PredictResponse(
        label                  = label,
        confidence             = round(confidence, 4),
        spam_prob              = round(spam_prob, 4),
        detected_language      = lang_name,
        detected_language_code = lang_code,
        language_supported     = lang_supported,
        processing_time_ms     = round(elapsed_ms, 1),
        model_metrics          = ModelMetrics(
            accuracy       = m.get("accuracy"),
            f1             = m.get("f1"),
            precision      = m.get("precision"),
            recall         = m.get("recall"),
            auc_roc        = m.get("auc_roc"),
            test_set_size  = m.get("test_set_size"),
        )
    )
