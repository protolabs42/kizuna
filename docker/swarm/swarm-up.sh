#!/bin/bash
# =============================================================================
# Agent Zero SwarmOS - Start Development Swarm
# =============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
COMPOSE_FILE="$SCRIPT_DIR/docker-compose.swarm.yml"
ENV_FILE="$SCRIPT_DIR/.env.swarm"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  Agent Zero SwarmOS - Starting        ${NC}"
echo -e "${BLUE}========================================${NC}"

# Check for .env.swarm file
if [ ! -f "$ENV_FILE" ]; then
    echo -e "${YELLOW}No .env.swarm found. Creating from template...${NC}"
    cp "$SCRIPT_DIR/.env.swarm.example" "$ENV_FILE"
    echo -e "${GREEN}Created $ENV_FILE${NC}"
    echo -e "${YELLOW}Edit this file to customize your swarm configuration.${NC}"
fi

# Navigate to project root for proper context resolution
cd "$PROJECT_ROOT"

# Build and start services
echo -e "\n${BLUE}Building and starting containers...${NC}"
docker-compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d --build "$@"

# Wait for health checks
echo -e "\n${BLUE}Waiting for services to become healthy...${NC}"
sleep 5

# Check status
echo -e "\n${BLUE}Service Status:${NC}"
docker-compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" ps

# Display endpoints
echo -e "\n${GREEN}========================================${NC}"
echo -e "${GREEN}  Swarm is ready!                      ${NC}"
echo -e "${GREEN}========================================${NC}"
echo -e ""
echo -e "  Bridge A:  http://localhost:3000/health"
echo -e "  Bridge B:  http://localhost:3001/health"
echo -e "  Agent A:   http://localhost:50080"
echo -e "  Agent B:   http://localhost:50081"
echo -e ""
echo -e "  ${YELLOW}Run integration tests:${NC}"
echo -e "  python tests/test_multinode_integration.py"
echo -e ""
echo -e "  ${YELLOW}View logs:${NC}"
echo -e "  $SCRIPT_DIR/swarm-logs.sh"
echo -e ""
echo -e "  ${YELLOW}Stop swarm:${NC}"
echo -e "  $SCRIPT_DIR/swarm-down.sh"
