#!/bin/bash

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo -e "${CYAN}========================================${NC}"
echo -e "${CYAN}🔧 Full System Database Test${NC}"
echo -e "${CYAN}========================================${NC}"
echo ""

# Test Discord Bot Database
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}📱 Discord Bot Database Test${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

cd /Users/adnan/Downloads/exe-vouchs
if npm run test:db; then
    echo -e "${GREEN}✅ Discord Bot database test passed${NC}"
    BOT_STATUS="PASSED"
else
    echo -e "${RED}❌ Discord Bot database test failed${NC}"
    BOT_STATUS="FAILED"
fi

echo ""
echo ""

# Test Website Database
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}🌐 Website Database Test${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

cd /Users/adnan/Downloads/exe-vouchs/exe-website
if npm run test:db; then
    echo -e "${GREEN}✅ Website database test passed${NC}"
    WEBSITE_STATUS="PASSED"
else
    echo -e "${RED}❌ Website database test failed${NC}"
    WEBSITE_STATUS="FAILED"
fi

echo ""
echo ""

# Final Summary
echo -e "${CYAN}========================================${NC}"
echo -e "${CYAN}📊 Test Summary${NC}"
echo -e "${CYAN}========================================${NC}"
echo ""

if [ "$BOT_STATUS" = "PASSED" ]; then
    echo -e "${GREEN}✓ Discord Bot:${NC} Connected & Working"
else
    echo -e "${RED}✗ Discord Bot:${NC} Failed"
fi

if [ "$WEBSITE_STATUS" = "PASSED" ]; then
    echo -e "${GREEN}✓ Website:${NC} Connected & Working"
else
    echo -e "${RED}✗ Website:${NC} Failed"
fi

echo ""
echo -e "${BLUE}Database:${NC} postgresql://postgres:****@136.112.235.116:5432/exe-vouch"
echo ""

if [ "$BOT_STATUS" = "PASSED" ] && [ "$WEBSITE_STATUS" = "PASSED" ]; then
    echo -e "${GREEN}========================================${NC}"
    echo -e "${GREEN}✅ All Systems Operational${NC}"
    echo -e "${GREEN}========================================${NC}"
    exit 0
else
    echo -e "${RED}========================================${NC}"
    echo -e "${RED}⚠️  Some Tests Failed${NC}"
    echo -e "${RED}========================================${NC}"
    exit 1
fi
