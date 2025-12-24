# GitHub Actions Setup Guide

This guide walks you through setting up automated deployments for ShareCloud using GitHub Actions.

## Overview

ShareCloud includes three GitHub Actions workflows:

1. **azure-app-service.yml**: Deploys to Azure App Service (PaaS)
2. **azure-container-apps.yml**: Deploys to Azure Container Apps (Containers)
3. **ci.yml**: Continuous Integration - builds and tests on PRs

## Prerequisites

- GitHub repository with ShareCloud code
- Azure subscription
- Azure CLI installed locally
- Basic knowledge of GitHub Actions

## Step 1: Create Azure Service Principal

A service principal allows GitHub Actions to authenticate with Azure.

```bash
# Login to Azure
az login

# Get your subscription ID
az account show --query id -o tsv

# Create service principal (replace {subscription-id} with your actual subscription ID)
az ad sp create-for-rbac \
  --name "sharecloud-github-actions" \
  --role contributor \
  --scopes /subscriptions/{subscription-id}/resourceGroups/sharecloud-rg \
  --sdk-auth
```

**Important**: Save the JSON output - you'll need it in the next step.

Example output:
```json
{
  "clientId": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "clientSecret": "xxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  "subscriptionId": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "tenantId": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "activeDirectoryEndpointUrl": "https://login.microsoftonline.com",
  "resourceManagerEndpointUrl": "https://management.azure.com/",
  "activeDirectoryGraphResourceId": "https://graph.windows.net/",
  "sqlManagementEndpointUrl": "https://management.core.windows.net:8443/",
  "galleryEndpointUrl": "https://gallery.azure.com/",
  "managementEndpointUrl": "https://management.core.windows.net/"
}
```

## Step 2: Add Secrets to GitHub Repository

Go to your GitHub repository:

1. Click **Settings** → **Secrets and variables** → **Actions**
2. Click **New repository secret**
3. Add the following secrets:

### Required Secrets for All Deployments

| Secret Name | Value | Where to Find |
|------------|-------|---------------|
| `AZURE_CREDENTIALS` | The entire JSON output from Step 1 | Service principal creation |
| `AZURE_STORAGE_ACCOUNT_NAME` | Your storage account name | Azure Portal → Storage Account |
| `AZURE_STORAGE_ACCOUNT_KEY` | Your storage account key | Azure Portal → Storage Account → Access keys |
| `AZURE_STORAGE_CONTAINER_NAME` | `files` (or your custom name) | Your choice |

### Additional Secrets for Container Apps

| Secret Name | Value | Where to Find |
|------------|-------|---------------|
| `ACR_USERNAME` | Container registry username | Azure Portal → Container Registry → Access keys |
| `ACR_PASSWORD` | Container registry password | Azure Portal → Container Registry → Access keys |

### How to Get Storage Account Credentials

```bash
# Get storage account name (you chose this when creating the account)
az storage account list --query "[].name" -o table

# Get storage account key
az storage account keys list \
  --account-name YOUR_STORAGE_ACCOUNT_NAME \
  --resource-group sharecloud-rg \
  --query '[0].value' -o tsv
```

### How to Get Container Registry Credentials (for Container Apps)

```bash
# Get ACR username
az acr credential show \
  --name YOUR_ACR_NAME \
  --query username -o tsv

# Get ACR password
az acr credential show \
  --name YOUR_ACR_NAME \
  --query passwords[0].value -o tsv
```

## Step 3: Configure Workflow Files

### For Azure App Service

Edit `.github/workflows/azure-app-service.yml`:

```yaml
env:
  AZURE_WEBAPP_NAME: sharecloud-app-unique  # Change to your web app name
  NODE_VERSION: '18.x'
```

### For Azure Container Apps

Edit `.github/workflows/azure-container-apps.yml`:

```yaml
env:
  AZURE_CONTAINER_APP_NAME: sharecloud-container  # Change to your container app name
  AZURE_CONTAINER_REGISTRY: yourregistryname      # Change to your ACR name (without .azurecr.io)
  AZURE_RESOURCE_GROUP: sharecloud-rg             # Change if using different resource group
  IMAGE_NAME: sharecloud-app
```

## Step 4: Create Azure Resources

Before the workflows can deploy, you need to create the Azure resources:

### Option A: Using Automated Scripts

```bash
# For App Service
./azure/scripts/deploy-app-service.sh

# OR for Container Apps
./azure/scripts/deploy-container-apps.sh
```

### Option B: Using ARM Templates

```bash
# For App Service
az group create --name sharecloud-rg --location eastus

az deployment group create \
  --resource-group sharecloud-rg \
  --template-file azure/arm-templates/app-service.json \
  --parameters azure/arm-templates/app-service.parameters.json

# OR for Container Apps
az deployment group create \
  --resource-group sharecloud-rg \
  --template-file azure/arm-templates/container-apps.json \
  --parameters azure/arm-templates/container-apps.parameters.json
```

## Step 5: Test the Workflow

### Trigger Deployment

**Automatic**: Push to the main branch
```bash
git checkout main
git add .
git commit -m "Add deployment pipelines"
git push origin main
```

**Manual**: Use GitHub UI
1. Go to **Actions** tab
2. Select the workflow (e.g., "Deploy to Azure App Service")
3. Click **Run workflow**
4. Click the green **Run workflow** button

### Monitor Deployment

1. Go to the **Actions** tab in your repository
2. Click on the running workflow
3. Watch the deployment progress in real-time
4. Check for any errors in the logs

## Step 6: Verify Deployment

After the workflow completes:

1. Go to Azure Portal
2. Navigate to your App Service or Container App
3. Click the URL to open your deployed application
4. Test file upload/download functionality

### Get Application URL

**App Service:**
```bash
az webapp show \
  --name sharecloud-app \
  --resource-group sharecloud-rg \
  --query defaultHostName -o tsv
```

**Container Apps:**
```bash
az containerapp show \
  --name sharecloud-container \
  --resource-group sharecloud-rg \
  --query properties.configuration.ingress.fqdn -o tsv
```

## Troubleshooting

### "Azure credentials are not valid" Error

- Verify `AZURE_CREDENTIALS` secret is the complete JSON from service principal creation
- Ensure the service principal has contributor role
- Check that the subscription ID is correct

### "Resource not found" Error

- Ensure the Azure resources (App Service or Container App) exist
- Verify the names in the workflow match the actual resource names
- Check that the resource group name is correct

### "Storage account not accessible" Error

- Verify `AZURE_STORAGE_ACCOUNT_NAME` and `AZURE_STORAGE_ACCOUNT_KEY` secrets
- Ensure the storage account exists and is accessible
- Check storage account firewall settings

### Build Failures

- Check the build logs in GitHub Actions
- Verify all dependencies are listed in package.json
- Ensure the Next.js build succeeds locally

### Container Registry Issues (Container Apps only)

- Verify ACR credentials are correct
- Ensure ACR admin user is enabled
- Check that the image name and tag are correct

## Advanced Configuration

### Environment-Specific Deployments

Create separate workflows for staging and production:

```yaml
# .github/workflows/deploy-staging.yml
on:
  push:
    branches:
      - develop

# .github/workflows/deploy-production.yml
on:
  push:
    branches:
      - main
```

### Deployment Slots (App Service)

Add staging slot support:

```bash
# Create staging slot
az webapp deployment slot create \
  --name sharecloud-app \
  --resource-group sharecloud-rg \
  --slot staging

# Update workflow to deploy to staging first
# Then swap to production after validation
```

### Custom Domain

After deployment, add a custom domain:

```bash
# App Service
az webapp config hostname add \
  --webapp-name sharecloud-app \
  --resource-group sharecloud-rg \
  --hostname www.yourdomain.com

# Container Apps
az containerapp hostname add \
  --name sharecloud-container \
  --resource-group sharecloud-rg \
  --hostname www.yourdomain.com
```

## Security Best Practices

1. **Rotate Secrets Regularly**: Update service principal credentials periodically
2. **Use Environment Protection Rules**: Require manual approval for production deployments
3. **Limit Service Principal Scope**: Only grant access to specific resource groups
4. **Enable Dependabot**: Keep dependencies updated automatically
5. **Use Branch Protection**: Require PR reviews before merging to main
6. **Scan for Secrets**: Enable GitHub secret scanning

## CI/CD Best Practices

1. **Run Tests**: Add test step before deployment
2. **Lint Code**: Ensure code quality with linters
3. **Staging Environment**: Test in staging before production
4. **Rollback Plan**: Keep previous versions for quick rollback
5. **Monitor Deployments**: Set up alerts for failed deployments
6. **Build Cache**: Use cache to speed up builds

## Cost Optimization

1. **Only deploy on main branch**: Don't deploy every PR
2. **Use deployment slots**: Test in staging to avoid production issues
3. **Auto-shutdown dev environments**: Stop resources when not in use
4. **Monitor usage**: Set up cost alerts

## Next Steps

- Set up Application Insights for monitoring
- Configure autoscaling based on metrics
- Add integration tests to CI pipeline
- Set up deployment notifications (Slack, email)
- Implement blue-green deployments

## Resources

- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Azure App Service GitHub Actions](https://docs.microsoft.com/en-us/azure/app-service/deploy-github-actions)
- [Azure Container Apps GitHub Actions](https://docs.microsoft.com/en-us/azure/container-apps/github-actions)
- [Azure Service Principal](https://docs.microsoft.com/en-us/azure/active-directory/develop/app-objects-and-service-principals)

## Support

If you encounter issues:
1. Check the GitHub Actions logs
2. Review Azure resource logs
3. Verify all secrets are configured correctly
4. Open an issue in the repository
