#!/bin/bash
# =============================================================================
# Agent Zero SwarmOS - View Logs
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="$SCRIPT_DIR/docker-compose.swarm.yml"
ENV_FILE="$SCRIPT_DIR/.env.swarm"

# Default to following all logs
SERVICE="${1:-}"
FOLLOW="${2:--f}"

echo "=========================================="
echo "  Agent Zero SwarmOS - Logs"
echo "=========================================="
echo ""
echo "  Services: bridge-a, bridge-b, agent-a, agent-b"
echo "  Usage: swarm-logs.sh [service] [flags]"
echo ""
echo "  Examples:"
echo "    swarm-logs.sh              # Follow all logs"
echo "    swarm-logs.sh bridge-a     # Follow bridge-a only"
echo "    swarm-logs.sh agent-a -n50 # Last 50 lines of agent-a"
echo ""
echo "==========================================="
echo ""

if [ -f "$ENV_FILE" ]; then
    if [ -n "$SERVICE" ]; then
        docker-compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" logs $FOLLOW $SERVICE
    else
        docker-compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" logs $FOLLOW
    fi
else
    if [ -n "$SERVICE" ]; then
        docker-compose -f "$COMPOSE_FILE" logs $FOLLOW $SERVICE
    else
        docker-compose -f "$COMPOSE_FILE" logs $FOLLOW
    fi
fi
