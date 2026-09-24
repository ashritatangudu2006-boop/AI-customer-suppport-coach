"""
Support Coach — knowledge base lookup

A lightweight stand-in for the FAISS / Pinecone / Weaviate line in the
tech stack. Uses TF-IDF + cosine similarity (via scikit-learn) instead
of a vector database, so it installs fast and needs no extra model
download — the search interface (`search(text)`) is the same shape
you'd use with a real vector store, so swapping this out later is a
drop-in change, not a rewrite.

Replace SOP_ARTICLES with your team's real support articles whenever
you have them.
"""

from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

SOP_ARTICLES = [
    {
        "id": "sop-refund-delay",
        "title": "Refund not received",
        "body": "If a customer says their refund has not arrived, confirm the order ID, "
        "check the refund status in the payments dashboard, and share the expected "
        "settlement date. Refunds typically settle within 5-7 business days. "
        "Apologize for the wait and offer to follow up personally if it is not "
        "resolved by the expected date.",
    },
    {
        "id": "sop-recharge-failed",
        "title": "Recharge failed but money deducted",
        "body": "When a recharge fails but the amount was deducted, this is usually a "
        "payment gateway timeout. Ask for the transaction ID, check the payment "
        "gateway logs, and reassure the customer the amount will be auto-reversed "
        "within 24-48 hours if the recharge did not go through.",
    },
    {
        "id": "sop-order-not-arrived",
        "title": "Order has not arrived",
        "body": "Ask for the order ID and check the shipment tracking status. If the "
        "order is delayed past the promised delivery window, apologize, share the "
        "updated estimated delivery date, and offer a discount code or expedited "
        "shipping on the next order as goodwill.",
    },
    {
        "id": "sop-internet-down",
        "title": "Internet or network outage",
        "body": "Ask the customer to restart their router and check for an area-wide "
        "outage on the network status page. If there is a known outage, share the "
        "estimated restoration time. If not, walk through basic troubleshooting: "
        "check cables, reinsert the SIM or modem, and run a line test if the issue "
        "persists.",
    },
    {
        "id": "sop-login-issue",
        "title": "Unable to log in",
        "body": "Confirm the customer is using the correct username or email. Suggest "
        "a password reset via the 'Forgot password' link. If they still cannot log "
        "in, check whether the account is locked due to repeated failed attempts and "
        "unlock it after verifying identity.",
    },
    {
        "id": "sop-cancellation-retention",
        "title": "Customer threatening to cancel",
        "body": "Acknowledge the frustration first, without being defensive. Ask what "
        "specifically is driving the decision to cancel. If it is a fixable issue, "
        "offer a concrete resolution and timeline. If retention offers are available "
        "and appropriate, mention them only after the underlying issue has been "
        "addressed, not as the first response.",
    },
]

_vectorizer = TfidfVectorizer(stop_words="english")
_matrix = _vectorizer.fit_transform([a["title"] + " " + a["body"] for a in SOP_ARTICLES])

GROUNDING_THRESHOLD = 0.12  # below this similarity, treat as "no article"


def search(query: str):
    """Return (article_or_None, similarity_score) for the closest SOP article."""
    query_vec = _vectorizer.transform([query])
    scores = cosine_similarity(query_vec, _matrix)[0]
    best_idx = scores.argmax()
    best_score = float(scores[best_idx])

    if best_score < GROUNDING_THRESHOLD:
        return None, best_score
    return SOP_ARTICLES[best_idx], best_score
