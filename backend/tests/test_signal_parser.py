import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch, AsyncMock
from main import app

client = TestClient(app)

def test_parse_missing_text():
    response = client.post("/api/signal-parser/parse", json={"missing": "text"})
    assert response.status_code == 422 # Unprocessable Entity

@patch('routes.signal_parser.parse_signal', new_callable=AsyncMock)
def test_parse_valid_signal(mock_parse):
    mock_parse.return_value = {
        "is_signal": True,
        "symbol": "XAUUSD",
        "action": "BUY",
        "entry": 2400.0,
        "sl": 2390.0,
        "tp": [2410.0]
    }
    response = client.post("/api/signal-parser/parse", json={"text": "BUY GOLD NOW AT 2400"})
    assert response.status_code == 200
    data = response.json()
    assert data["is_signal"] is True
    assert data["symbol"] == "XAUUSD"
    mock_parse.assert_called_once()
