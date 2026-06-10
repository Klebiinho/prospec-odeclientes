# Use official Playwright Python image with all browser dependencies
FROM mcr.microsoft.com/playwright/python:v1.49.1-noble

WORKDIR /app

# Install system dependencies for Kokoro TTS (soundfile)
RUN apt-get update && apt-get install -y libsndfile1 && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Expose FastAPI port
EXPOSE 8000

# Run with Uvicorn
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
