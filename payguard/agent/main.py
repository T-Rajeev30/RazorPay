"""
main.py

FastAPI entrypoint for the PayGuard AI buyer agent. Exposes a single
endpoint that takes a natural-language purchase request, asks the LLM
to interpret it into a structured proposal, and forwards that proposal
to the PayGuard backend's /api/authorize endpoint — the ONLY place a
financial decision is actually made. This service never talks to
Razorpay and never makes an authorization decision itself.
"""
import os
import requests
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from llm_client import LLMClient
from agent_logic import parse_purchase_request

load_dotenv()

BACKEND_URL = os.environ.get("PAYGUARD_BACKEND_URL", "http://localhost:4000/api")
GROQ_API_KEY = os.environ.get("GROQ_API_KEY")
AGENT_ID = os.environ.get("AGENT_ID", "shopping-agent-01")
MERCHANT_ID = os.environ.get("MERCHANT_ID", "merchant_123")

app = FastAPI(title="PayGuard AI Buyer Agent")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

llm_client = LLMClient(api_key=GROQ_API_KEY)


class BuyRequest(BaseModel):
    message: str


@app.post("/agent/buy")
def buy(req: BuyRequest):
    try:
        catalog_response = requests.get(f"{BACKEND_URL}/products", timeout=10)
        catalog_response.raise_for_status()
        catalog = catalog_response.json()

        proposal = parse_purchase_request(llm_client, req.message, catalog)

        authorize_body = {
            "agentId": AGENT_ID,
            "merchantId": MERCHANT_ID,
            "productId": proposal["productId"],
            "proposedPrice": proposal["proposedPrice"],
            "quantity": proposal["quantity"],
            "currency": proposal["currency"],
        }

        policy_response = requests.post(f"{BACKEND_URL}/authorize", json=authorize_body, timeout=10)
        policy_response.raise_for_status()
        policy_result = policy_response.json()

        return {"agentProposal": proposal, "policyDecision": policy_result}

    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc))


@app.get("/health")
def health():
    return {"status": "ok"}