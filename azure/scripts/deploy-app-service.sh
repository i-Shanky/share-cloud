#!/bin/bash
# ShareCloud - Azure App Service Deployment Script
# Uses Managed Identity for storage access — no storage keys needed.
set -e

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'

echo -e "${GREEN}ShareCloud - Azure App Service Deployment${NC}"
echo "=========================================="

command -v az &>/dev/null || { echo -e "${RED}Azure CLI not installed.${NC}"; exit 1; }

# --- Configuration ---
RESOURCE_GROUP=${RESOURCE_GROUP:-"sharecloud-rg"}
LOCATION=${LOCATION:-"eastus"}
WEBAPP_NAME=${WEBAPP_NAME:-"sharecloud-app-$(openssl rand -hex 4)"}
APP_SERVICE_PLAN="${WEBAPP_NAME}-plan"
SKU=${SKU:-"B1"}

echo ""
echo "Deployment Configuration:"
echo "  Resource Group : $RESOURCE_GROUP"
echo "  Location       : $LOCATION"
echo "  Web App Name   : $WEBAPP_NAME"
echo "  SKU            : $SKU"
echo ""

# --- Azure Storage (account name only — no key) ---
read -p "Azure Storage Account Name: " STORAGE_ACCOUNT_NAME
read -p "Files container name [files]: " STORAGE_CONTAINER_NAME
STORAGE_CONTAINER_NAME=${STORAGE_CONTAINER_NAME:-files}
read -p "Trash container name [trash]: " STORAGE_TRASH_CONTAINER_NAME
STORAGE_TRASH_CONTAINER_NAME=${STORAGE_TRASH_CONTAINER_NAME:-trash}

# --- Azure AD ---
echo ""
echo "Azure AD App Registration (see FEATURES.md for setup steps):"
read -p "Azure AD Client ID     : " AZURE_AD_CLIENT_ID
read -sp "Azure AD Client Secret : " AZURE_AD_CLIENT_SECRET; echo ""
read -p "Azure AD Tenant ID     : " AZURE_AD_TENANT_ID

# --- NextAuth ---
echo ""
echo "NextAuth Configuration:"
NEXTAUTH_SECRET=$(openssl rand -base64 32)
echo "  Generated NEXTAUTH_SECRET automatically."
read -p "App public URL (e.g. https://$WEBAPP_NAME.azurewebsites.net): " NEXTAUTH_URL
NEXTAUTH_URL=${NEXTAUTH_URL:-"https://$WEBAPP_NAME.azurewebsites.net"}

# --- Cleanup API key ---
CLEANUP_API_KEY=$(openssl rand -base64 32)
echo "  Generated CLEANUP_API_KEY automatically."

# --- Login & provision ---
echo -e "\n${YELLOW}Logging in to Azure...${NC}"
az login

echo -e "${YELLOW}Creating resource group...${NC}"
az group create --name "$RESOURCE_GROUP" --location "$LOCATION"

echo -e "${YELLOW}Creating App Service Plan...${NC}"
az appservice plan create \
  --name "$APP_SERVICE_PLAN" \
  --resource-group "$RESOURCE_GROUP" \
  --location "$LOCATION" \
  --is-linux \
  --sku "$SKU"

echo -e "${YELLOW}Creating Web App...${NC}"
az webapp create \
  --name "$WEBAPP_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --plan "$APP_SERVICE_PLAN" \
  --runtime "NODE:18-lts"

echo -e "${YELLOW}Enabling system-assigned Managed Identity...${NC}"
az webapp identity assign \
  --name "$WEBAPP_NAME" \
  --resource-group "$RESOURCE_GROUP"

echo -e "${YELLOW}Granting 'Storage Blob Data Contributor' to the Managed Identity...${NC}"
PRINCIPAL_ID=$(az webapp identity show \
  --name "$WEBAPP_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --query principalId -o tsv)

STORAGE_SCOPE=$(az storage account show \
  --name "$STORAGE_ACCOUNT_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --query id -o tsv 2>/dev/null || \
  az storage account show \
    --name "$STORAGE_ACCOUNT_NAME" \
    --query id -o tsv)

az role assignment create \
  --assignee "$PRINCIPAL_ID" \
  --role "Storage Blob Data Contributor" \
  --scope "$STORAGE_SCOPE"

echo -e "${YELLOW}Configuring environment variables...${NC}"
az webapp config appsettings set \
  --name "$WEBAPP_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --settings \
    AZURE_STORAGE_ACCOUNT_NAME="$STORAGE_ACCOUNT_NAME" \
    AZURE_STORAGE_CONTAINER_NAME="$STORAGE_CONTAINER_NAME" \
    AZURE_STORAGE_TRASH_CONTAINER_NAME="$STORAGE_TRASH_CONTAINER_NAME" \
    AZURE_AD_CLIENT_ID="$AZURE_AD_CLIENT_ID" \
    AZURE_AD_CLIENT_SECRET="$AZURE_AD_CLIENT_SECRET" \
    AZURE_AD_TENANT_ID="$AZURE_AD_TENANT_ID" \
    NEXTAUTH_SECRET="$NEXTAUTH_SECRET" \
    NEXTAUTH_URL="$NEXTAUTH_URL" \
    CLEANUP_API_KEY="$CLEANUP_API_KEY" \
    SCM_DO_BUILD_DURING_DEPLOYMENT=true \
    WEBSITE_NODE_DEFAULT_VERSION="~18"

echo -e "${YELLOW}Building and deploying application...${NC}"
npm ci
npm run build
zip -r deployment.zip .next public pages lib styles package.json package-lock.json next.config.js

az webapp deployment source config-zip \
  --name "$WEBAPP_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --src deployment.zip

rm deployment.zip

WEBAPP_URL=$(az webapp show --name "$WEBAPP_NAME" --resource-group "$RESOURCE_GROUP" --query defaultHostName -o tsv)

echo ""
echo -e "${GREEN}====================================================${NC}"
echo -e "${GREEN}Deployment Complete!${NC}"
echo -e "${GREEN}====================================================${NC}"
echo ""
echo "  App URL        : https://$WEBAPP_URL"
echo "  Resource Group : $RESOURCE_GROUP"
echo "  Web App Name   : $WEBAPP_NAME"
echo ""
echo -e "${YELLOW}Important — update your Azure AD App Registration:${NC}"
echo "  Redirect URI: https://$WEBAPP_URL/api/auth/callback/azure-ad"
echo ""
echo "  NEXTAUTH_SECRET (save this): $NEXTAUTH_SECRET"
echo "  CLEANUP_API_KEY (save this): $CLEANUP_API_KEY"
echo ""
echo -e "${GREEN}Done!${NC}"
