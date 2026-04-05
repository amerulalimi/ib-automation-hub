from fastapi.testclient import TestClient

from main import app

client = TestClient(app)


def test_health_returns_200():
    r = client.get("/health")
    assert r.status_code == 200
    data = r.json()
    assert data.get("status") in ("ok", "degraded")
    assert "message" in data
