#!/bin/bash
# ShareCloud - Azure Container Apps Deployment Script
# Uses Managed Identity for both storage access and ACR pull — no keys needed.
set -e

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'

echo -e "${GREEN}ShareCloud - Azure Container Apps Deployment${NC}"
echo "============================================="

command -v az     &>/dev/null || { echo -e "${RED}Azure CLI not installed.${NC}"; exit 1; }
command -v docker &>/dev/null || { echo -e "${RED}Docker not installed.${NC}"; exit 1; }

# --- Configuration ---
RESOURCE_GROUP=${RESOURCE_GROUP:-"sharecloud-rg"}
LOCATION=${LOCATION:-"eastus"}
ACR_NAME=${ACR_NAME:-"sharecloud$(openssl rand -hex 4)"}
CONTAINER_APP_NAME=${CONTAINER_APP_NAME:-"sharecloud-container"}
CONTAINER_APP_ENV="${CONTAINER_APP_NAME}-env"
IMAGE_NAME="sharecloud-app"
IMAGE_TAG="latest"

echo ""
echo "Deployment Configuration:"
echo "  Resource Group     : $RESOURCE_GROUP"
echo "  Location           : $LOCATION"
echo "  Container Registry : $ACR_NAME"
echo "  Container App      : $CONTAINER_APP_NAME"
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
NEXTAUTH_SECRET=$(openssl rand -base64 32)
echo "Generated NEXTAUTH_SECRET automatically."
read -p "App public URL (fill after deployment if unknown): " NEXTAUTH_URL
NEXTAUTH_URL=${NEXTAUTH_URL:-"https://placeholder.update-after-deploy.example.com"}

# --- Cleanup API key ---
CLEANUP_API_KEY=$(openssl rand -base64 32)
echo "Generated CLEANUP_API_KEY automatically."

# --- Login & provision ---
echo -e "\n${YELLOW}Logging in to Azure...${NC}"
az login

echo -e "${YELLOW}Installing Container Apps extension...${NC}"
az extension add --name containerapp --upgrade --yes

echo -e "${YELLOW}Registering providers...${NC}"
az provider register --namespace Microsoft.App
az provider register --namespace Microsoft.OperationalInsights

echo -e "${YELLOW}Creating resource group...${NC}"
az group create --name "$RESOURCE_GROUP" --location "$LOCATION"

echo -e "${YELLOW}Creating Azure Container Registry (admin disabled — will use Managed Identity)...${NC}"
az acr create \
  --name "$ACR_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --location "$LOCATION" \
  --sku Basic \
  --admin-enabled false

echo -e "${YELLOW}Building and pushing Docker image via ACR Tasks (uses service principal)...${NC}"
az acr build \
  --registry "$ACR_NAME" \
  --image "$IMAGE_NAME:$IMAGE_TAG" \
  --file Dockerfile .

ACR_LOGIN_SERVER=$(az acr show --name "$ACR_NAME" --query loginServer -o tsv)

echo -e "${YELLOW}Creating Container Apps environment...${NC}"
az containerapp env create \
  --name "$CONTAINER_APP_ENV" \
  --resource-group "$RESOURCE_GROUP" \
  --location "$LOCATION"

echo -e "${YELLOW}Deploying Container App...${NC}"
az containerapp create \
  --name "$CONTAINER_APP_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --environment "$CONTAINER_APP_ENV" \
  --image "$ACR_LOGIN_SERVER/$IMAGE_NAME:$IMAGE_TAG" \
  --registry-server "$ACR_LOGIN_SERVER" \
  --registry-identity system \
  --target-port 3000 \
  --ingress external \
  --cpu 0.5 \
  --memory 1.0Gi \
  --min-replicas 1 \
  --max-replicas 3 \
  --system-assigned \
  --secrets \
    azure-storage-account-name="$STORAGE_ACCOUNT_NAME" \
    azure-storage-container-name="$STORAGE_CONTAINER_NAME" \
    azure-storage-trash-container-name="$STORAGE_TRASH_CONTAINER_NAME" \
    azure-ad-client-id="$AZURE_AD_CLIENT_ID" \
    azure-ad-client-secret="$AZURE_AD_CLIENT_SECRET" \
    azure-ad-tenant-id="$AZURE_AD_TENANT_ID" \
    nextauth-secret="$NEXTAUTH_SECRET" \
    nextauth-url="$NEXTAUTH_URL" \
    cleanup-api-key="$CLEANUP_API_KEY" \
  --env-vars \
    AZURE_STORAGE_ACCOUNT_NAME=secretref:azure-storage-account-name \
    AZURE_STORAGE_CONTAINER_NAME=secretref:azure-storage-container-name \
    AZURE_STORAGE_TRASH_CONTAINER_NAME=secretref:azure-storage-trash-container-name \
    AZURE_AD_CLIENT_ID=secretref:azure-ad-client-id \
    AZURE_AD_CLIENT_SECRET=secretref:azure-ad-client-secret \
    AZURE_AD_TENANT_ID=secretref:azure-ad-tenant-id \
    NEXTAUTH_SECRET=secretref:nextauth-secret \
    NEXTAUTH_URL=secretref:nextauth-url \
    CLEANUP_API_KEY=secretref:cleanup-api-key

echo -e "${YELLOW}Granting Managed Identity 'Storage Blob Data Contributor' on storage account...${NC}"
PRINCIPAL_ID=$(az containerapp identity show \
  --name "$CONTAINER_APP_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --query principalId -o tsv)

STORAGE_SCOPE=$(az storage account show \
  --name "$STORAGE_ACCOUNT_NAME" \
  --query id -o tsv)

az role assignment create \
  --assignee "$PRINCIPAL_ID" \
  --role "Storage Blob Data Contributor" \
  --scope "$STORAGE_SCOPE"

echo -e "${YELLOW}Granting Managed Identity 'AcrPull' on container registry...${NC}"
ACR_SCOPE=$(az acr show --name "$ACR_NAME" --query id -o tsv)
az role assignment create \
  --assignee "$PRINCIPAL_ID" \
  --role "AcrPull" \
  --scope "$ACR_SCOPE"

CONTAINER_APP_FQDN=$(az containerapp show \
  --name "$CONTAINER_APP_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --query properties.configuration.ingress.fqdn -o tsv)

# Update NEXTAUTH_URL now that we know the real FQDN
az containerapp secret set \
  --name "$CONTAINER_APP_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --secrets nextauth-url="https://$CONTAINER_APP_FQDN"

echo ""
echo -e "${GREEN}=============================================${NC}"
echo -e "${GREEN}Deployment Complete!${NC}"
echo -e "${GREEN}=============================================${NC}"
echo ""
echo "  App URL        : https://$CONTAINER_APP_FQDN"
echo "  Resource Group : $RESOURCE_GROUP"
echo "  Container App  : $CONTAINER_APP_NAME"
echo "  ACR            : $ACR_LOGIN_SERVER"
echo ""
echo -e "${YELLOW}Important — update your Azure AD App Registration:${NC}"
echo "  Redirect URI: https://$CONTAINER_APP_FQDN/api/auth/callback/azure-ad"
echo ""
echo "  NEXTAUTH_SECRET (save this): $NEXTAUTH_SECRET"
echo "  CLEANUP_API_KEY (save this): $CLEANUP_API_KEY"
echo ""
echo -e "${GREEN}Done!${NC}"
