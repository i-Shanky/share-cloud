#!/bin/bash

# ShareCloud - Azure Container Apps Deployment Script
# This script deploys the ShareCloud application to Azure Container Apps

set -e

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}ShareCloud - Azure Container Apps Deployment${NC}"
echo "============================================="

# Check if Azure CLI is installed
if ! command -v az &> /dev/null; then
    echo -e "${RED}Error: Azure CLI is not installed.${NC}"
    echo "Please install it from: https://docs.microsoft.com/en-us/cli/azure/install-azure-cli"
    exit 1
fi

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo -e "${RED}Error: Docker is not installed.${NC}"
    echo "Please install it from: https://docs.docker.com/get-docker/"
    exit 1
fi

# Configuration
RESOURCE_GROUP=${RESOURCE_GROUP:-"sharecloud-rg"}
LOCATION=${LOCATION:-"eastus"}
ACR_NAME=${ACR_NAME:-"sharecloud$(openssl rand -hex 4)"}
CONTAINER_APP_NAME=${CONTAINER_APP_NAME:-"sharecloud-container"}
CONTAINER_APP_ENV=${CONTAINER_APP_ENV:-"$CONTAINER_APP_NAME-env"}
IMAGE_NAME="sharecloud-app"
IMAGE_TAG="latest"

echo ""
echo "Deployment Configuration:"
echo "  Resource Group: $RESOURCE_GROUP"
echo "  Location: $LOCATION"
echo "  Container Registry: $ACR_NAME"
echo "  Container App Name: $CONTAINER_APP_NAME"
echo "  Environment: $CONTAINER_APP_ENV"
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

echo -e "${YELLOW}Installing/Updating Container Apps extension...${NC}"
az extension add --name containerapp --upgrade --yes

echo -e "${YELLOW}Registering required providers...${NC}"
az provider register --namespace Microsoft.App
az provider register --namespace Microsoft.OperationalInsights

echo -e "${YELLOW}Creating resource group...${NC}"
az group create --name $RESOURCE_GROUP --location $LOCATION

echo -e "${YELLOW}Creating Azure Container Registry...${NC}"
az acr create \
  --name $ACR_NAME \
  --resource-group $RESOURCE_GROUP \
  --location $LOCATION \
  --sku Basic \
  --admin-enabled true

echo -e "${YELLOW}Getting ACR credentials...${NC}"
ACR_USERNAME=$(az acr credential show --name $ACR_NAME --query username -o tsv)
ACR_PASSWORD=$(az acr credential show --name $ACR_NAME --query passwords[0].value -o tsv)
ACR_LOGIN_SERVER=$(az acr show --name $ACR_NAME --query loginServer -o tsv)

echo -e "${YELLOW}Building Docker image...${NC}"
docker build -t $IMAGE_NAME:$IMAGE_TAG .

echo -e "${YELLOW}Logging in to ACR...${NC}"
echo $ACR_PASSWORD | docker login $ACR_LOGIN_SERVER --username $ACR_USERNAME --password-stdin

echo -e "${YELLOW}Tagging and pushing image to ACR...${NC}"
docker tag $IMAGE_NAME:$IMAGE_TAG $ACR_LOGIN_SERVER/$IMAGE_NAME:$IMAGE_TAG
docker push $ACR_LOGIN_SERVER/$IMAGE_NAME:$IMAGE_TAG

echo -e "${YELLOW}Creating Container Apps environment...${NC}"
az containerapp env create \
  --name $CONTAINER_APP_ENV \
  --resource-group $RESOURCE_GROUP \
  --location $LOCATION

echo -e "${YELLOW}Deploying Container App...${NC}"
az containerapp create \
  --name $CONTAINER_APP_NAME \
  --resource-group $RESOURCE_GROUP \
  --environment $CONTAINER_APP_ENV \
  --image $ACR_LOGIN_SERVER/$IMAGE_NAME:$IMAGE_TAG \
  --registry-server $ACR_LOGIN_SERVER \
  --registry-username $ACR_USERNAME \
  --registry-password $ACR_PASSWORD \
  --target-port 3000 \
  --ingress external \
  --cpu 0.5 \
  --memory 1.0Gi \
  --min-replicas 1 \
  --max-replicas 3 \
  --secrets \
    azure-storage-account-name="$STORAGE_ACCOUNT_NAME" \
    azure-storage-account-key="$STORAGE_ACCOUNT_KEY" \
    azure-storage-container-name="$STORAGE_CONTAINER_NAME" \
  --env-vars \
    AZURE_STORAGE_ACCOUNT_NAME=secretref:azure-storage-account-name \
    AZURE_STORAGE_ACCOUNT_KEY=secretref:azure-storage-account-key \
    AZURE_STORAGE_CONTAINER_NAME=secretref:azure-storage-container-name

# Get the URL
CONTAINER_APP_URL=$(az containerapp show \
  --name $CONTAINER_APP_NAME \
  --resource-group $RESOURCE_GROUP \
  --query properties.configuration.ingress.fqdn -o tsv)

echo ""
echo -e "${GREEN}=============================================${NC}"
echo -e "${GREEN}Deployment Complete!${NC}"
echo -e "${GREEN}=============================================${NC}"
echo ""
echo "Your ShareCloud application is now deployed!"
echo ""
echo "  App URL: https://$CONTAINER_APP_URL"
echo "  Resource Group: $RESOURCE_GROUP"
echo "  Container App Name: $CONTAINER_APP_NAME"
echo "  Container Registry: $ACR_LOGIN_SERVER"
echo ""
echo "To view logs, run:"
echo "  az containerapp logs show --name $CONTAINER_APP_NAME --resource-group $RESOURCE_GROUP --follow"
echo ""
echo -e "${GREEN}Done!${NC}"
