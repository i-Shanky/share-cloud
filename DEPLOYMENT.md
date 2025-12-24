# ShareCloud - Azure Deployment Guide

This guide covers deploying ShareCloud to Azure using multiple deployment methods.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Deployment Options](#deployment-options)
  - [Option 1: Azure App Service](#option-1-azure-app-service)
  - [Option 2: Azure Container Apps](#option-2-azure-container-apps)
- [GitHub Actions CI/CD](#github-actions-cicd)
- [Manual Deployment](#manual-deployment)
- [Configuration](#configuration)
- [Monitoring and Troubleshooting](#monitoring-and-troubleshooting)

## Prerequisites

Before deploying, ensure you have:

1. **Azure Account**: Active Azure subscription ([Create free account](https://azure.microsoft.com/free/))
2. **Azure CLI**: Installed and configured ([Install Guide](https://docs.microsoft.com/en-us/cli/azure/install-azure-cli))
3. **Git**: For cloning and version control
4. **Node.js 18+**: For local testing
5. **Docker**: For container-based deployments

### Azure Storage Setup

1. Create an Azure Storage Account:
   ```bash
   az storage account create \
     --name yourstorageaccount \
     --resource-group sharecloud-rg \
     --location eastus \
     --sku Standard_LRS
   ```

2. Get your storage credentials:
   ```bash
   # Get account key
   az storage account keys list \
     --account-name yourstorageaccount \
     --resource-group sharecloud-rg \
     --query '[0].value' -o tsv
   ```

## Deployment Options

### Option 1: Azure App Service

Best for: Simple deployments, PaaS approach, quick setup

#### Using Automated Script

```bash
# Run the deployment script
./azure/scripts/deploy-app-service.sh
```

The script will:
- Create a resource group
- Create an App Service Plan
- Deploy your application
- Configure environment variables
- Provide the deployment URL

#### Using ARM Template

```bash
# Create resource group
az group create --name sharecloud-rg --location eastus

# Deploy using ARM template
az deployment group create \
  --resource-group sharecloud-rg \
  --template-file azure/arm-templates/app-service.json \
  --parameters azure/arm-templates/app-service.parameters.json
```

#### Manual Deployment

```bash
# 1. Create App Service Plan
az appservice plan create \
  --name sharecloud-plan \
  --resource-group sharecloud-rg \
  --is-linux \
  --sku B1

# 2. Create Web App
az webapp create \
  --name sharecloud-app-unique \
  --resource-group sharecloud-rg \
  --plan sharecloud-plan \
  --runtime "NODE:18-lts"

# 3. Configure environment variables
az webapp config appsettings set \
  --name sharecloud-app-unique \
  --resource-group sharecloud-rg \
  --settings \
    AZURE_STORAGE_ACCOUNT_NAME=your-account \
    AZURE_STORAGE_ACCOUNT_KEY=your-key \
    AZURE_STORAGE_CONTAINER_NAME=files

# 4. Build and deploy
npm ci && npm run build
zip -r deployment.zip .next public pages lib styles package.json package-lock.json next.config.js

az webapp deployment source config-zip \
  --name sharecloud-app-unique \
  --resource-group sharecloud-rg \
  --src deployment.zip
```

### Option 2: Azure Container Apps

Best for: Microservices, scalability, container-based workflows

#### Using Automated Script

```bash
# Run the deployment script
./azure/scripts/deploy-container-apps.sh
```

The script will:
- Create a Container Registry
- Build and push Docker image
- Create Container Apps environment
- Deploy your containerized application
- Configure auto-scaling

#### Using ARM Template

```bash
# Create resource group
az group create --name sharecloud-rg --location eastus

# Deploy using ARM template
az deployment group create \
  --resource-group sharecloud-rg \
  --template-file azure/arm-templates/container-apps.json \
  --parameters azure/arm-templates/container-apps.parameters.json
```

#### Manual Deployment

```bash
# 1. Install Container Apps extension
az extension add --name containerapp --upgrade

# 2. Register providers
az provider register --namespace Microsoft.App
az provider register --namespace Microsoft.OperationalInsights

# 3. Create Container Registry
az acr create \
  --name sharecloudacr \
  --resource-group sharecloud-rg \
  --sku Basic \
  --admin-enabled true

# 4. Build and push image
az acr build \
  --registry sharecloudacr \
  --image sharecloud-app:latest \
  --file Dockerfile .

# 5. Create Container Apps environment
az containerapp env create \
  --name sharecloud-env \
  --resource-group sharecloud-rg \
  --location eastus

# 6. Get ACR credentials
ACR_USERNAME=$(az acr credential show --name sharecloudacr --query username -o tsv)
ACR_PASSWORD=$(az acr credential show --name sharecloudacr --query passwords[0].value -o tsv)

# 7. Deploy Container App
az containerapp create \
  --name sharecloud-container \
  --resource-group sharecloud-rg \
  --environment sharecloud-env \
  --image sharecloudacr.azurecr.io/sharecloud-app:latest \
  --registry-server sharecloudacr.azurecr.io \
  --registry-username $ACR_USERNAME \
  --registry-password $ACR_PASSWORD \
  --target-port 3000 \
  --ingress external \
  --cpu 0.5 \
  --memory 1.0Gi \
  --min-replicas 1 \
  --max-replicas 3 \
  --secrets \
    azure-storage-account-name=your-account \
    azure-storage-account-key=your-key \
    azure-storage-container-name=files \
  --env-vars \
    AZURE_STORAGE_ACCOUNT_NAME=secretref:azure-storage-account-name \
    AZURE_STORAGE_ACCOUNT_KEY=secretref:azure-storage-account-key \
    AZURE_STORAGE_CONTAINER_NAME=secretref:azure-storage-container-name
```

## GitHub Actions CI/CD

### Setup GitHub Actions

1. **Configure GitHub Secrets**

   Go to your repository → Settings → Secrets and variables → Actions

   Add the following secrets:

   - `AZURE_CREDENTIALS`: Azure service principal credentials
   - `AZURE_STORAGE_ACCOUNT_NAME`: Your storage account name
   - `AZURE_STORAGE_ACCOUNT_KEY`: Your storage account key
   - `AZURE_STORAGE_CONTAINER_NAME`: Container name (default: files)

   For Container Apps, also add:
   - `ACR_USERNAME`: Container registry username
   - `ACR_PASSWORD`: Container registry password

2. **Create Azure Service Principal**

   ```bash
   az ad sp create-for-rbac \
     --name "sharecloud-github-actions" \
     --role contributor \
     --scopes /subscriptions/{subscription-id}/resourceGroups/sharecloud-rg \
     --sdk-auth
   ```

   Copy the JSON output and save it as `AZURE_CREDENTIALS` secret.

3. **Update Workflow Variables**

   Edit `.github/workflows/azure-app-service.yml` or `.github/workflows/azure-container-apps.yml`:

   ```yaml
   env:
     AZURE_WEBAPP_NAME: your-webapp-name  # For App Service
     AZURE_CONTAINER_APP_NAME: your-container-app-name  # For Container Apps
     AZURE_CONTAINER_REGISTRY: your-acr-name  # For Container Apps
     AZURE_RESOURCE_GROUP: sharecloud-rg
   ```

4. **Trigger Deployment**

   - Push to main branch to trigger automatic deployment
   - Or manually trigger via GitHub Actions UI

### Available Workflows

1. **azure-app-service.yml**: Deploys to Azure App Service
2. **azure-container-apps.yml**: Deploys to Azure Container Apps
3. **ci.yml**: Runs on PRs for testing and validation

## Configuration

### Environment Variables

Required environment variables:

```bash
AZURE_STORAGE_ACCOUNT_NAME=your-storage-account
AZURE_STORAGE_ACCOUNT_KEY=your-storage-key
AZURE_STORAGE_CONTAINER_NAME=files
```

### Scaling Configuration

#### App Service Scaling

```bash
# Scale up (change instance size)
az appservice plan update \
  --name sharecloud-plan \
  --resource-group sharecloud-rg \
  --sku P1V2

# Scale out (more instances)
az appservice plan update \
  --name sharecloud-plan \
  --resource-group sharecloud-rg \
  --number-of-workers 3
```

#### Container Apps Scaling

```bash
# Update scaling rules
az containerapp update \
  --name sharecloud-container \
  --resource-group sharecloud-rg \
  --min-replicas 2 \
  --max-replicas 5
```

### Custom Domain and SSL

#### App Service

```bash
# Add custom domain
az webapp config hostname add \
  --webapp-name sharecloud-app \
  --resource-group sharecloud-rg \
  --hostname www.yourdomain.com

# Bind SSL certificate
az webapp config ssl bind \
  --certificate-thumbprint {thumbprint} \
  --ssl-type SNI \
  --name sharecloud-app \
  --resource-group sharecloud-rg
```

#### Container Apps

```bash
# Add custom domain
az containerapp hostname add \
  --name sharecloud-container \
  --resource-group sharecloud-rg \
  --hostname www.yourdomain.com

# Bind certificate
az containerapp hostname bind \
  --name sharecloud-container \
  --resource-group sharecloud-rg \
  --hostname www.yourdomain.com \
  --certificate {certificate-name}
```

## Monitoring and Troubleshooting

### View Logs

#### App Service

```bash
# Stream logs
az webapp log tail \
  --name sharecloud-app \
  --resource-group sharecloud-rg

# Download logs
az webapp log download \
  --name sharecloud-app \
  --resource-group sharecloud-rg
```

#### Container Apps

```bash
# View logs
az containerapp logs show \
  --name sharecloud-container \
  --resource-group sharecloud-rg \
  --follow

# View specific replica logs
az containerapp replica list \
  --name sharecloud-container \
  --resource-group sharecloud-rg

az containerapp logs show \
  --name sharecloud-container \
  --resource-group sharecloud-rg \
  --replica {replica-name}
```

### Application Insights

Enable Application Insights for detailed monitoring:

```bash
# Create Application Insights
az monitor app-insights component create \
  --app sharecloud-insights \
  --location eastus \
  --resource-group sharecloud-rg

# Get instrumentation key
INSTRUMENTATION_KEY=$(az monitor app-insights component show \
  --app sharecloud-insights \
  --resource-group sharecloud-rg \
  --query instrumentationKey -o tsv)

# Configure App Service
az webapp config appsettings set \
  --name sharecloud-app \
  --resource-group sharecloud-rg \
  --settings APPINSIGHTS_INSTRUMENTATIONKEY=$INSTRUMENTATION_KEY
```

### Common Issues

#### Issue: "Storage credentials not configured"

**Solution**: Verify environment variables are set correctly:

```bash
az webapp config appsettings list \
  --name sharecloud-app \
  --resource-group sharecloud-rg
```

#### Issue: "Container fails to start"

**Solution**: Check container logs and verify the image was built correctly:

```bash
# Check container logs
az containerapp logs show \
  --name sharecloud-container \
  --resource-group sharecloud-rg \
  --follow

# Verify image exists
az acr repository show \
  --name sharecloudacr \
  --image sharecloud-app:latest
```

#### Issue: "File upload fails"

**Solution**:
1. Verify storage account key is correct
2. Check storage account firewall settings
3. Ensure container exists or can be created

## Cost Optimization

### App Service

- Use **Free (F1)** or **Basic (B1)** tier for development/testing
- Use **Standard (S1)** or higher for production
- Enable auto-scaling based on metrics
- Stop instances when not in use (dev environments)

### Container Apps

- Set appropriate min/max replicas
- Use consumption-based pricing
- Monitor CPU/memory usage and adjust resources
- Use Azure Reserved Instances for production

### General Tips

- Use Azure Cost Management to monitor spending
- Set up budget alerts
- Delete unused resources
- Use the same resource group for easier management

## Cleanup

To remove all deployed resources:

```bash
# Delete entire resource group (caution: deletes everything)
az group delete --name sharecloud-rg --yes --no-wait

# Delete specific resources
az webapp delete --name sharecloud-app --resource-group sharecloud-rg
az containerapp delete --name sharecloud-container --resource-group sharecloud-rg
```

## Security Best Practices

1. **Use Managed Identities**: Avoid storing storage keys in environment variables
2. **Enable HTTPS Only**: Force HTTPS for all traffic
3. **Network Isolation**: Use VNets for production
4. **Key Vault**: Store secrets in Azure Key Vault
5. **Authentication**: Add Azure AD authentication for production
6. **CORS**: Configure CORS policies appropriately
7. **Regular Updates**: Keep dependencies updated

## Next Steps

- Set up continuous deployment with GitHub Actions
- Configure custom domain and SSL
- Enable Application Insights monitoring
- Implement authentication with Azure AD
- Set up staging slots for zero-downtime deployments
- Configure CDN for static assets

## Support

For issues and questions:
- [Azure App Service Documentation](https://docs.microsoft.com/en-us/azure/app-service/)
- [Azure Container Apps Documentation](https://docs.microsoft.com/en-us/azure/container-apps/)
- [GitHub Actions for Azure](https://github.com/Azure/actions)
- [ShareCloud GitHub Issues](https://github.com/yourusername/share-cloud/issues)

## License

This deployment guide is part of the ShareCloud project, licensed under MIT License.
