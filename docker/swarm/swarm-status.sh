#!/bin/bash
# =============================================================================
# Agent Zero SwarmOS - Check Status
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="$SCRIPT_DIR/docker-compose.swarm.yml"
ENV_FILE="$SCRIPT_DIR/.env.swarm"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  Agent Zero SwarmOS - Status          ${NC}"
echo -e "${BLUE}========================================${NC}"

# Container status
echo -e "\n${BLUE}Container Status:${NC}"
if [ -f "$ENV_FILE" ]; then
    docker-compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" ps
else
    docker-compose -f "$COMPOSE_FILE" ps
fi

# Health checks
echo -e "\n${BLUE}Health Checks:${NC}"

check_health() {
    local name=$1
    local url=$2
    local response=$(curl -s -o /dev/null -w "%{http_code}" "$url" 2>/dev/null || echo "000")

    if [ "$response" == "200" ]; then
        echo -e "  $name: ${GREEN}HEALTHY${NC} ($url)"
    elif [ "$response" == "503" ]; then
        echo -e "  $name: ${YELLOW}DEGRADED${NC} ($url)"
    else
        echo -e "  $name: ${RED}UNREACHABLE${NC} ($url)"
    fi
}

check_health "Bridge A" "http://localhost:3000/health"
check_health "Bridge B" "http://localhost:3001/health"
check_health "Agent A " "http://localhost:50080/health"
check_health "Agent B " "http://localhost:50081/health"

# Peer Discovery
echo -e "\n${BLUE}Peer Discovery:${NC}"

get_peers() {
    local name=$1
    local url=$2
    local peers=$(curl -s "$url" 2>/dev/null | grep -o '"count":[0-9]*' | head -1 | cut -d':' -f2)

    if [ -n "$peers" ]; then
        if [ "$peers" -gt 0 ]; then
            echo -e "  $name: ${GREEN}$peers peer(s) connected${NC}"
        else
            echo -e "  $name: ${YELLOW}0 peers (discovering...)${NC}"
        fi
    else
        echo -e "  $name: ${RED}unavailable${NC}"
    fi
}

get_peers "Bridge A" "http://localhost:3000/peers"
get_peers "Bridge B" "http://localhost:3001/peers"

echo -e "\n${BLUE}========================================${NC}"
