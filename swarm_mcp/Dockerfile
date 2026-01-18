FROM python:3.12-slim

WORKDIR /app

# Install curl for health check
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy server code
COPY . .

# Environment
ENV BRIDGE_URL=http://bridge:3000
ENV MCP_PORT=8000
ENV MCP_HOST=0.0.0.0
ENV PYTHONUNBUFFERED=1

# Expose MCP HTTP port
EXPOSE 8000

# Health check - verify MCP server is responding
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -sf http://localhost:8000/health || exit 1

# Run MCP server with HTTP transport
CMD ["python", "server.py"]
