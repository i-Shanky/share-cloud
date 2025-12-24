#!/bin/bash

# ShareCloud - Azure App Service Deployment Script
# This script deploys the ShareCloud application to Azure App Service

set -e

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}ShareCloud - Azure App Service Deployment${NC}"
echo "=========================================="

# Check if Azure CLI is installed
if ! command -v az &> /dev/null; then
    echo -e "${RED}Error: Azure CLI is not installed.${NC}"
    echo "Please install it from: https://docs.microsoft.com/en-us/cli/azure/install-azure-cli"
    exit 1
fi

# Configuration
RESOURCE_GROUP=${RESOURCE_GROUP:-"sharecloud-rg"}
LOCATION=${LOCATION:-"eastus"}
WEBAPP_NAME=${WEBAPP_NAME:-"sharecloud-app-$(openssl rand -hex 4)"}
APP_SERVICE_PLAN=${APP_SERVICE_PLAN:-"$WEBAPP_NAME-plan"}
SKU=${SKU:-"B1"}

echo ""
echo "Deployment Configuration:"
echo "  Resource Group: $RESOURCE_GROUP"
echo "  Location: $LOCATION"
echo "  Web App Name: $WEBAPP_NAME"
echo "  App Service Plan: $APP_SERVICE_PLAN"
echo "  SKU: $SKU"
echo ""

# Prompt for Azure Storage credentials
read -p "Enter Azure Storage Account Name: " STORAGE_ACCOUNT_NAME
read -sp "Enter Azure Storage Account Key: " STORAGE_ACCOUNT_KEY
echo ""
read -p "Enter Azure Storage Container Name [files]: " STORAGE_CONTAINER_NAME
STORAGE_CONTAINER_NAME=${STORAGE_CONTAINER_NAME:-files}

echo ""
echo -e "${YELLOW}Logging in to Azure...${NC}"
az login

echo -e "${YELLOW}Creating resource group...${NC}"
az group create --name $RESOURCE_GROUP --location $LOCATION

echo -e "${YELLOW}Creating App Service Plan...${NC}"
az appservice plan create \
  --name $APP_SERVICE_PLAN \
  --resource-group $RESOURCE_GROUP \
  --location $LOCATION \
  --is-linux \
  --sku $SKU

echo -e "${YELLOW}Creating Web App...${NC}"
az webapp create \
  --name $WEBAPP_NAME \
  --resource-group $RESOURCE_GROUP \
  --plan $APP_SERVICE_PLAN \
  --runtime "NODE:18-lts"

echo -e "${YELLOW}Configuring environment variables...${NC}"
az webapp config appsettings set \
  --name $WEBAPP_NAME \
  --resource-group $RESOURCE_GROUP \
  --settings \
    AZURE_STORAGE_ACCOUNT_NAME="$STORAGE_ACCOUNT_NAME" \
    AZURE_STORAGE_ACCOUNT_KEY="$STORAGE_ACCOUNT_KEY" \
    AZURE_STORAGE_CONTAINER_NAME="$STORAGE_CONTAINER_NAME" \
    SCM_DO_BUILD_DURING_DEPLOYMENT=true \
    WEBSITE_NODE_DEFAULT_VERSION="~18"

echo -e "${YELLOW}Configuring deployment source...${NC}"
az webapp config appsettings set \
  --name $WEBAPP_NAME \
  --resource-group $RESOURCE_GROUP \
  --settings \
    WEBSITE_RUN_FROM_PACKAGE=1

echo -e "${YELLOW}Building application...${NC}"
npm ci
npm run build

echo -e "${YELLOW}Creating deployment package...${NC}"
zip -r deployment.zip .next public pages lib styles package.json package-lock.json next.config.js

echo -e "${YELLOW}Deploying to Azure...${NC}"
az webapp deployment source config-zip \
  --name $WEBAPP_NAME \
  --resource-group $RESOURCE_GROUP \
  --src deployment.zip

# Clean up
rm deployment.zip

# Get the URL
WEBAPP_URL=$(az webapp show --name $WEBAPP_NAME --resource-group $RESOURCE_GROUP --query defaultHostName -o tsv)

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Deployment Complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "Your ShareCloud application is now deployed!"
echo ""
echo "  App URL: https://$WEBAPP_URL"
echo "  Resource Group: $RESOURCE_GROUP"
echo "  Web App Name: $WEBAPP_NAME"
echo ""
echo "To view logs, run:"
echo "  az webapp log tail --name $WEBAPP_NAME --resource-group $RESOURCE_GROUP"
echo ""
echo -e "${GREEN}Done!${NC}"
