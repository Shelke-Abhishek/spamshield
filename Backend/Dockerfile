# FILE: backend/Dockerfile
# PURPOSE: Tells Render exactly how to build and run your API.
# Using a Dockerfile gives us full control over the Python version
# and startup command — more reliable than Render auto-detection.

# Start from an official Python image (slim = smaller download)
FROM python:3.10-slim

# Set the working directory inside the container
WORKDIR /app

# Copy requirements first (Docker caches this layer — speeds up rebuilds)
COPY requirements.txt .

# Install Python dependencies
# --no-cache-dir keeps the image smaller
# The torch CPU wheel URL is included in requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the backend files
COPY . .

# Tell Docker which port the app listens on
EXPOSE 8000

# ⚠️  IMPORTANT: Replace "your-hf-username/spamshield-xlmr" with your
# actual HuggingFace repo name in the Render dashboard environment variables.
# Do NOT hardcode tokens here — use Render's environment variable settings.

# Start the FastAPI server
# --host 0.0.0.0 makes it accessible from outside the container
# --workers 1 is important: loading a 1.1 GB model with multiple workers
#   would use 2.2+ GB RAM and crash on Render's free tier (512 MB limit)
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
