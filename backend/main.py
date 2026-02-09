"""
VND Currency Recognition API
Backend server using FastAPI and YOLOv8 for Vietnamese Dong detection
With Tracking support and higher confidence threshold
"""

from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from ultralytics import YOLO
from PIL import Image
import numpy as np
import io
import os

# Initialize FastAPI app
app = FastAPI(
    title="VND Currency Recognition API",
    description="API for detecting Vietnamese Dong banknotes using YOLOv8 with tracking",
    version="2.0.0"
)

# Configure CORS for frontend access
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Load YOLOv8 model
MODEL_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "best.pt")

# Higher confidence threshold for accuracy
CONFIDENCE_THRESHOLD = 0.7

try:
    model = YOLO(MODEL_PATH)
    print(f"✅ Model loaded successfully from: {MODEL_PATH}")
    print(f"📋 Model classes: {model.names}")
    print(f"🎯 Confidence threshold: {CONFIDENCE_THRESHOLD}")
except Exception as e:
    print(f"❌ Error loading model: {e}")
    model = None

# Mapping class names to VND denominations
DENOMINATION_MAP = {
    "1000": 1000,
    "2000": 2000,
    "5000": 5000,
    "10000": 10000,
    "20000": 20000,
    "50000": 50000,
    "100000": 100000,
    "200000": 200000,
    "500000": 500000,
    "1k": 1000,
    "2k": 2000,
    "5k": 5000,
    "10k": 10000,
    "20k": 20000,
    "50k": 50000,
    "100k": 100000,
    "200k": 200000,
    "500k": 500000,
}


def parse_denomination(class_name: str) -> int:
    """Parse class name to VND denomination value"""
    class_name_lower = class_name.lower().replace(" ", "").replace("vnd", "").replace("dong", "")
    
    if class_name_lower in DENOMINATION_MAP:
        return DENOMINATION_MAP[class_name_lower]
    
    import re
    numbers = re.findall(r'\d+', class_name)
    if numbers:
        value = int(numbers[0])
        if value <= 500 and value >= 1:
            if value in [1, 2, 5, 10, 20, 50, 100, 200, 500]:
                return value * 1000
        return value
    
    return 0


@app.get("/")
async def root():
    """Health check endpoint"""
    return {
        "status": "online",
        "message": "VND Currency Recognition API is running",
        "model_loaded": model is not None,
        "confidence_threshold": CONFIDENCE_THRESHOLD,
        "classes": list(model.names.values()) if model else []
    }


@app.get("/classes")
async def get_classes():
    """Get available model classes"""
    if model is None:
        raise HTTPException(status_code=503, detail="Model not loaded")
    
    return {
        "classes": model.names,
        "total": len(model.names)
    }


@app.post("/track")
async def track_base64(data: dict):
    """
    Track VND banknotes from base64 encoded image using YOLOv8 tracking.
    This endpoint uses model.track() for more stable detection with object persistence.
    
    Args:
        data: JSON with 'image' field containing base64 encoded image
    
    Returns:
        JSON with tracking results including track_id for persistent tracking
    """
    import base64
    
    if model is None:
        raise HTTPException(status_code=503, detail="Model not loaded")
    
    if "image" not in data:
        raise HTTPException(status_code=400, detail="Missing 'image' field in request body")
    
    try:
        # Decode base64 image
        image_data = data["image"]
        
        if "," in image_data:
            image_data = image_data.split(",")[1]
        
        image_bytes = base64.b64decode(image_data)
        image = Image.open(io.BytesIO(image_bytes))
        
        if image.mode != "RGB":
            image = image.convert("RGB")
        
        # Convert to numpy array for tracking
        image_np = np.array(image)
        
        # Use tracking with persistence for stable detection
        results = model.track(
            image_np, 
            conf=CONFIDENCE_THRESHOLD,
            persist=True,  # Enable persistent tracking across frames
            tracker="bytetrack.yaml"  # Use ByteTrack for better tracking
        )
        
        predictions = []
        
        for result in results:
            boxes = result.boxes
            if boxes is not None and len(boxes) > 0:
                for i, box in enumerate(boxes):
                    x1, y1, x2, y2 = box.xyxy[0].tolist()
                    confidence = float(box.conf[0])
                    class_id = int(box.cls[0])
                    class_name = model.names[class_id]
                    
                    # Skip 'Background' class
                    if class_name.lower() == 'background':
                        continue
                    
                    # Get track ID if available
                    track_id = None
                    if box.id is not None:
                        track_id = int(box.id[0])
                    
                    denomination = parse_denomination(class_name)
                    
                    predictions.append({
                        "track_id": track_id,
                        "class_name": class_name,
                        "denomination": denomination,
                        "denomination_formatted": f"{denomination:,} VND",
                        "confidence": round(confidence, 4),
                        "confidence_percent": f"{confidence * 100:.1f}%",
                        "bbox": {
                            "x1": round(x1, 2),
                            "y1": round(y1, 2),
                            "x2": round(x2, 2),
                            "y2": round(y2, 2)
                        }
                    })
        
        # Sort by confidence descending and get the best one
        predictions.sort(key=lambda x: x["confidence"], reverse=True)
        best_prediction = predictions[:1] if predictions else []
        
        return JSONResponse(content={
            "success": True,
            "predictions": best_prediction,
            "count": len(best_prediction),
            "all_detections": len(predictions)
        })
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing image: {str(e)}")


@app.post("/reset-tracker")
async def reset_tracker():
    """Reset the tracker state for new session"""
    try:
        # Reset tracker by doing a dummy track with reset
        if model is not None:
            # Create a small dummy image to reset
            dummy = np.zeros((100, 100, 3), dtype=np.uint8)
            model.track(dummy, persist=False)
        return {"success": True, "message": "Tracker reset"}
    except Exception as e:
        return {"success": False, "message": str(e)}


@app.post("/predict")
async def predict(file: UploadFile = File(...)):
    """
    Predict VND banknotes in an uploaded image (legacy endpoint)
    """
    if model is None:
        raise HTTPException(status_code=503, detail="Model not loaded")
    
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")
    
    try:
        contents = await file.read()
        image = Image.open(io.BytesIO(contents))
        
        if image.mode != "RGB":
            image = image.convert("RGB")
        
        results = model(image, conf=CONFIDENCE_THRESHOLD)
        
        predictions = []
        
        for result in results:
            boxes = result.boxes
            if boxes is not None:
                for box in boxes:
                    x1, y1, x2, y2 = box.xyxy[0].tolist()
                    confidence = float(box.conf[0])
                    class_id = int(box.cls[0])
                    class_name = model.names[class_id]
                    
                    if class_name.lower() == 'background':
                        continue
                    
                    denomination = parse_denomination(class_name)
                    
                    predictions.append({
                        "class_name": class_name,
                        "denomination": denomination,
                        "denomination_formatted": f"{denomination:,} VND",
                        "confidence": round(confidence, 4),
                        "confidence_percent": f"{confidence * 100:.1f}%",
                        "bbox": {
                            "x1": round(x1, 2),
                            "y1": round(y1, 2),
                            "x2": round(x2, 2),
                            "y2": round(y2, 2)
                        }
                    })
        
        predictions.sort(key=lambda x: x["confidence"], reverse=True)
        best_prediction = predictions[:1] if predictions else []
        total_value = best_prediction[0]["denomination"] if best_prediction else 0
        
        return JSONResponse(content={
            "success": True,
            "predictions": best_prediction,
            "count": len(best_prediction),
            "total_value": total_value,
            "total_value_formatted": f"{total_value:,} VND"
        })
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing image: {str(e)}")


@app.post("/predict/base64")
async def predict_base64(data: dict):
    """
    Predict VND banknotes from base64 encoded image (legacy endpoint)
    """
    import base64
    
    if model is None:
        raise HTTPException(status_code=503, detail="Model not loaded")
    
    if "image" not in data:
        raise HTTPException(status_code=400, detail="Missing 'image' field in request body")
    
    try:
        image_data = data["image"]
        
        if "," in image_data:
            image_data = image_data.split(",")[1]
        
        image_bytes = base64.b64decode(image_data)
        image = Image.open(io.BytesIO(image_bytes))
        
        if image.mode != "RGB":
            image = image.convert("RGB")
        
        results = model(image, conf=CONFIDENCE_THRESHOLD)
        
        predictions = []
        
        for result in results:
            boxes = result.boxes
            if boxes is not None:
                for box in boxes:
                    x1, y1, x2, y2 = box.xyxy[0].tolist()
                    confidence = float(box.conf[0])
                    class_id = int(box.cls[0])
                    class_name = model.names[class_id]
                    
                    if class_name.lower() == 'background':
                        continue
                    
                    denomination = parse_denomination(class_name)
                    
                    predictions.append({
                        "class_name": class_name,
                        "denomination": denomination,
                        "denomination_formatted": f"{denomination:,} VND",
                        "confidence": round(confidence, 4),
                        "confidence_percent": f"{confidence * 100:.1f}%",
                        "bbox": {
                            "x1": round(x1, 2),
                            "y1": round(y1, 2),
                            "x2": round(x2, 2),
                            "y2": round(y2, 2)
                        }
                    })
        
        predictions.sort(key=lambda x: x["confidence"], reverse=True)
        best_prediction = predictions[:1] if predictions else []
        total_value = best_prediction[0]["denomination"] if best_prediction else 0
        
        return JSONResponse(content={
            "success": True,
            "predictions": best_prediction,
            "count": len(best_prediction),
            "total_value": total_value,
            "total_value_formatted": f"{total_value:,} VND"
        })
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing image: {str(e)}")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=True)
