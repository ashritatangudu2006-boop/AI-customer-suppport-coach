"""
Support Coach — analysis backend

Runs the two models named in the project's tech stack:
  - DistilBERT (SST-2)   -> sentiment: POSITIVE / NEGATIVE
  - BART-Large-MNLI      -> zero-shot intent / key-issue classification

Exposes one endpoint the frontend calls for every new turn:
  POST /analyze   { "text": "...", "speaker": "customer" | "agent" }
  ->   { sentiment, urgencyLevel, score, keyIssue, suggestedReply, coachingTip }

Run:
  pip install -r requirements.txt
  python app.py
Serves on http://127.0.0.1:5000
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
from transformers import pipeline
import db
import kb

app = Flask(__name__)
CORS(app)  # allow the frontend (served from a different port/file) to call this API

db.init_db()

print("Loading models... this can take a minute the first time.")
sentiment_pipe = pipeline(
    "sentiment-analysis",
    model="distilbert-base-uncased-finetuned-sst-2-english",
)
intent_pipe = pipeline(
    "zero-shot-classification",
    model="facebook/bart-large-mnli",
)
print("Models loaded.")

ISSUE_LABELS = [
    "refund not received",
    "internet or network outage",
    "order not delivered",
    "unable to log in",
    "payment or recharge failed",
    "threatening to cancel subscription",
    "general complaint",
]

URGENCY_KEYWORDS_HIGH = ["cancel", "legal", "escalate", "immediately", "right now", "worst"]

COACHING_TIPS = {
    "High": "Acknowledge the frustration in the first sentence before offering any fix — this is an escalation risk.",
    "Medium": "Lead with an apology and a concrete next step, not just an explanation.",
    "Low": "Tone looks steady — reinforce with a specific timeline for resolution.",
}


def score_urgency(label: str, sentiment: str, text: str) -> tuple[str, int]:
    lower = text.lower()
    hard_hit = any(k in lower for k in URGENCY_KEYWORDS_HIGH)
    if hard_hit:
        return "High", 85
    if sentiment == "NEGATIVE":
        return "Medium", 55
    return "Low", 20


@app.route("/analyze", methods=["POST"])
def analyze():
    body = request.get_json(force=True)
    text = (body or {}).get("text", "").strip()
    speaker = (body or {}).get("speaker", "customer")
    case_id = (body or {}).get("caseId", "SC-DEFAULT")

    if not text:
        return jsonify({"error": "text is required"}), 400

    sent_result = sentiment_pipe(text)[0]
    if sent_result["label"] == "NEGATIVE":
        sentiment = "Negative"
    elif sent_result["score"] >= 0.85:
        sentiment = "Positive"
    else:
        sentiment = "Neutral"

    intent_result = intent_pipe(text, candidate_labels=ISSUE_LABELS)
    key_issue = intent_result["labels"][0].capitalize()

    urgency_level, score = score_urgency(key_issue, sent_result["label"], text)

    article, kb_score = kb.search(text)

    suggested_reply = None
    if speaker == "customer":
        opener = "I'm sorry for the trouble" if sentiment == "Negative" else "Thanks for the details"
        if article:
            suggested_reply = f"{opener}. {article['body'].split('. ')[0]}. Let me confirm the details on your account and follow this through."
        else:
            suggested_reply = f"{opener} — regarding \"{key_issue.lower()}\", let me pull up your case and get this sorted right away."

    analysis = {
        "sentiment": sentiment,
        "urgencyLevel": urgency_level,
        "score": score,
        "keyIssue": key_issue,
        "suggestedReply": suggested_reply,
        "coachingTip": COACHING_TIPS[urgency_level],
        "groundedInArticle": article is not None,
        "articleTitle": article["title"] if article else None,
    }

    db.record_turn(case_id, speaker, text, analysis)

    return jsonify(analysis)


@app.route("/cases", methods=["GET"])
def cases():
    return jsonify(db.list_cases())


@app.route("/stats", methods=["GET"])
def stats():
    return jsonify(db.get_stats())


@app.route("/cases/<case_id>/resolve", methods=["POST"])
def resolve_case(case_id):
    db.set_case_status(case_id, "resolved")
    return jsonify({"id": case_id, "status": "resolved"})


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok"})


if __name__ == "__main__":
    app.run(debug=True, port=5000, use_reloader=False)