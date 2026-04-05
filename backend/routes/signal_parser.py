from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from services.signal_parser import parse_signal

router = APIRouter(prefix="/api/signal-parser", tags=["AI Signal Parser"])

class ParseRequest(BaseModel):
    text: str

@router.post("/parse")
async def api_parse_signal(req: ParseRequest):
    """
    Manually test the signal parser with custom text.
    """
    if not req.text:
        raise HTTPException(status_code=400, detail="Text is required")
    
    try:
        result = await parse_signal(req.text)
        if result:
            return result
        return {"is_signal": False, "message": "No signal detected"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
