#!/bin/bash
# =============================================================================
# Agent Zero SwarmOS - Stop Development Swarm
# =============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="$SCRIPT_DIR/docker-compose.swarm.yml"
ENV_FILE="$SCRIPT_DIR/.env.swarm"

# Colors for output
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  Agent Zero SwarmOS - Stopping        ${NC}"
echo -e "${BLUE}========================================${NC}"

# Check for --clean flag to remove volumes
CLEAN_VOLUMES=""
if [ "$1" == "--clean" ] || [ "$1" == "-c" ]; then
    CLEAN_VOLUMES="-v"
    echo -e "${YELLOW}Will remove volumes (--clean flag set)${NC}"
fi

# Stop and optionally remove volumes
if [ -f "$ENV_FILE" ]; then
    docker-compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" down $CLEAN_VOLUMES
else
    docker-compose -f "$COMPOSE_FILE" down $CLEAN_VOLUMES
fi

echo -e "\n${BLUE}Swarm stopped.${NC}"

if [ -n "$CLEAN_VOLUMES" ]; then
    echo -e "${RED}Volumes have been removed.${NC}"
else
    echo -e "${YELLOW}Volumes preserved. Use --clean to remove data.${NC}"
fi
