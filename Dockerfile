# ============================================================
# Stage 1 — Build the React frontend
# ============================================================
FROM node:20-alpine AS frontend-builder

WORKDIR /build
COPY FrontEnd/dashinterface/package.json FrontEnd/dashinterface/package-lock.json ./
RUN npm ci

COPY FrontEnd/dashinterface/ ./
# Build without VITE_API_BASE so the app defaults to relative /api paths
RUN npm run build


# ============================================================
# Stage 2 — Python backend + built frontend
# ============================================================
FROM python:3.12-slim

WORKDIR /app

# Install Python dependencies first (layer cache)
COPY BackEnd/requirments.txt ./
RUN pip install --no-cache-dir -r requirments.txt

# Copy backend source
COPY BackEnd/ ./

# Copy the built frontend into /app/static so FastAPI can serve it
COPY --from=frontend-builder /build/dist ./static

EXPOSE 5000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "5000"]

