# ShareCloud - New Features Guide

This document describes the advanced features implemented in ShareCloud including Managed Identity, Azure AD Authentication, and Trash/Recycle Bin functionality.

## Table of Contents

- [Azure Managed Identity](#azure-managed-identity)
- [Azure AD Authentication](#azure-ad-authentication)
- [Trash & File Recovery](#trash--file-recovery)
- [User-Specific Storage](#user-specific-storage)
- [Setup Instructions](#setup-instructions)

## Azure Managed Identity

### What is Managed Identity?

Managed Identity is Azure's solution for securely authenticating to Azure services without storing credentials in code or environment variables. Instead of using storage account keys, the application uses its Azure identity to access resources.

### Benefits

- **Enhanced Security**: No storage keys in code, config files, or environment variables
- **Automatic Key Rotation**: Azure handles credential rotation automatically
- **Zero Secrets to Manage**: No risk of leaked credentials
- **Simplified Development**: Use Azure CLI for local development (`az login`)
- **Compliance**: Meets enterprise security requirements

### How It Works

1. **In Azure**: The application (App Service or Container App) is assigned a managed identity
2. **Storage Access**: The identity is granted "Storage Blob Data Contributor" role
3. **Authentication**: Application authenticates using `DefaultAzureCredential`
4. **Local Development**: Uses Azure CLI credentials when running locally

### Local Development Setup

```bash
# Login to Azure CLI
az login

# Your application will now use your CLI credentials locally
npm run dev
```

### Production Setup

When deployed to Azure, the Managed Identity is automatically configured. No additional setup needed!

## Azure AD Authentication

### Overview

ShareCloud uses Microsoft Azure Active Directory (Azure AD) for secure user authentication. This provides:

- **Enterprise SSO**: Single sign-on with Microsoft accounts
- **MFA Support**: Multi-factor authentication built-in
- **Conditional Access**: Azure AD security policies apply
- **User Management**: Centralized user administration

### Setup Azure AD App Registration

1. **Create App Registration**:
   ```bash
   # Go to Azure Portal
   # Navigate to: Azure Active Directory → App registrations → New registration

   Name: ShareCloud
   Supported account types: Accounts in this organizational directory only
   Redirect URI: Web → http://localhost:3000/api/auth/callback/azure-ad
   ```

2. **Get Credentials**:
   - **Client ID**: Copy from Overview page
   - **Tenant ID**: Copy from Overview page
   - **Client Secret**: Go to "Certificates & secrets" → New client secret

3. **Configure Redirect URIs**:
   ```
   Local: http://localhost:3000/api/auth/callback/azure-ad
   Production: https://your-app.azurewebsites.net/api/auth/callback/azure-ad
   ```

4. **API Permissions** (Optional):
   - Add Microsoft Graph → User.Read (granted by default)

5. **Update Environment Variables**:
   ```bash
   AZURE_AD_CLIENT_ID=your-client-id
   AZURE_AD_CLIENT_SECRET=your-client-secret
   AZURE_AD_TENANT_ID=your-tenant-id
   NEXTAUTH_SECRET=$(openssl rand -base64 32)
   NEXTAUTH_URL=http://localhost:3000
   ```

### User Experience

1. **Sign In**: Users click "Sign in with Microsoft"
2. **Azure AD**:  Redirects to Microsoft login page
3. **Consent**: User consents to app permissions (first time only)
4. **Authenticated**: User is redirected back to ShareCloud

### Session Management

- **Duration**: 24 hours
- **Strategy**: JWT-based (no database required)
- **Renewal**: Automatic on activity
- **Sign Out**: Ends session and clears cookies

## Trash & File Recovery

### Overview

ShareCloud implements a 30-day trash/recycle bin system for deleted files, providing:

- **Soft Delete**: Files moved to trash instead of permanent deletion
- **30-Day Retention**: Files kept for 30 days before automatic cleanup
- **Easy Recovery**: One-click restore from trash
- **Countdown Display**: Shows days remaining before permanent deletion

### How It Works

1. **Delete File**: User clicks delete → file moves to trash container
2. **Trash View**: Separate tab shows all deleted files
3. **Restore**: User can restore file back to original location
4. **Auto-Cleanup**: After 30 days, files are permanently deleted

### Architecture

```
Storage Account
├── files (container)
│   └── users/
│       └── {userId}/
│           └── document.pdf
└── trash (container)
    └── users/
        └── {userId}/
            └── {timestamp}_document.pdf
```

### API Endpoints

```javascript
// Move to trash (soft delete)
DELETE /api/files/delete?name=filename

// List trash items
GET /api/trash/list

// Restore from trash
POST /api/trash/restore
Body: { path: "trash-file-path" }

// Permanent delete
DELETE /api/trash/permanent-delete?path=trash-file-path

// Cleanup expired (scheduled task)
POST /api/trash/cleanup
Headers: { "x-api-key": "your-api-key" }
```

### Automatic Cleanup

Set up an Azure Logic App or Azure Function to call the cleanup endpoint daily:

```bash
curl -X POST https://your-app.azurewebsites.net/api/trash/cleanup \
  -H "x-api-key: your-cleanup-api-key"
```

Or use a cron job:

```bash
# Add to crontab (runs daily at 2 AM)
0 2 * * * curl -X POST https://your-app.azurewebsites.net/api/trash/cleanup -H "x-api-key: your-key"
```

## User-Specific Storage

### Overview

Files are organized by user ID, ensuring complete data isolation:

```
files/
└── users/
    ├── user1_at_example_com/
    │   ├── report.pdf
    │   └── photo.jpg
    └── user2_at_example_com/
        └── document.docx
```

### User ID Format

User IDs are derived from Azure AD email addresses:

```javascript
// Example transformation
email: "john@example.com"
userId: "john_at_example_com"
```

### Security

- **Isolation**: Users can only access their own files
- **API Protection**: All endpoints require authentication
- **Path Validation**: User ID verified on every request
- **No Cross-User Access**: Enforced at Azure Storage level

## Setup Instructions

### Prerequisites

1. Azure subscription
2. Azure Storage Account
3. Azure AD tenant
4. Node.js 18+

### Step 1: Azure Storage Setup

```bash
# Create storage account
az storage account create \
  --name yourstorageaccount \
  --resource-group sharecloud-rg \
  --location eastus \
  --sku Standard_LRS

# Note: Containers will be created automatically by the application
```

### Step 2: Configure Managed Identity

**For App Service**:

```bash
# Enable system-assigned managed identity
az webapp identity assign \
  --name sharecloud-app \
  --resource-group sharecloud-rg

# Get the identity's principal ID
PRINCIPAL_ID=$(az webapp identity show \
  --name sharecloud-app \
  --resource-group sharecloud-rg \
  --query principalId -o tsv)

# Grant storage access
az role assignment create \
  --role "Storage Blob Data Contributor" \
  --assignee $PRINCIPAL_ID \
  --scope /subscriptions/{subscription-id}/resourceGroups/sharecloud-rg/providers/Microsoft.Storage/storageAccounts/yourstorageaccount
```

**For Container Apps**:

```bash
# Enable managed identity
az containerapp identity assign \
  --name sharecloud-container \
  --resource-group sharecloud-rg

# Get principal ID
PRINCIPAL_ID=$(az containerapp identity show \
  --name sharecloud-container \
  --resource-group sharecloud-rg \
  --query principalId -o tsv)

# Grant storage access
az role assignment create \
  --role "Storage Blob Data Contributor" \
  --assignee $PRINCIPAL_ID \
  --scope /subscriptions/{subscription-id}/resourceGroups/sharecloud-rg/providers/Microsoft.Storage/storageAccounts/yourstorageaccount
```

### Step 3: Azure AD Configuration

1. Create App Registration (see [Azure AD Authentication](#azure-ad-authentication))
2. Configure redirect URIs
3. Create client secret
4. Update environment variables

### Step 4: Environment Variables

Update `.env.local`:

```bash
# Azure Storage (Managed Identity - no keys needed)
AZURE_STORAGE_ACCOUNT_NAME=yourstorageaccount
AZURE_STORAGE_CONTAINER_NAME=files
AZURE_STORAGE_TRASH_CONTAINER_NAME=trash

# Azure AD
AZURE_AD_CLIENT_ID=your-client-id
AZURE_AD_CLIENT_SECRET=your-client-secret
AZURE_AD_TENANT_ID=your-tenant-id

# NextAuth
NEXTAUTH_SECRET=$(openssl rand -base64 32)
NEXTAUTH_URL=http://localhost:3000

# Cleanup API Key
CLEANUP_API_KEY=$(openssl rand -base64 32)
```

### Step 5: Run Application

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Open browser
open http://localhost:3000
```

## Feature Comparison

| Feature | Before | After |
|---------|--------|-------|
| Authentication | None | Azure AD |
| Storage Auth | Account Keys | Managed Identity |
| File Deletion | Permanent | Trash (30-day) |
| User Isolation | Single pool | User-specific paths |
| Security | Basic | Enterprise-grade |
| Recovery | None | 30-day window |

## Best Practices

### Security

1. **Never commit secrets**: Use environment variables
2. **Rotate secrets regularly**: Especially client secrets
3. **Use Managed Identity**: Avoid storage keys
4. **Enable MFA**: For Azure AD accounts
5. **Review permissions**: Follow principle of least privilege

### Development

1. **Use Azure CLI**: For local development (`az login`)
2. **Test authentication**: Ensure AD app is configured correctly
3. **Monitor trash**: Set up cleanup automation
4. **Handle errors**: Gracefully handle auth failures

### Production

1. **Configure redirect URIs**: Match production URL
2. **Set NEXTAUTH_URL**: To production domain
3. **Enable HTTPS**: Required for Azure AD
4. **Monitor costs**: Trash storage incurs charges
5. **Set up alerts**: For authentication failures

## Troubleshooting

### Managed Identity Issues

**Error**: "DefaultAzureCredential failed to retrieve a token"

**Solutions**:
- Local: Run `az login`
- Azure: Verify managed identity is enabled
- Check role assignment: "Storage Blob Data Contributor"

### Authentication Issues

**Error**: "Sign in failed"

**Solutions**:
- Verify Azure AD credentials
- Check redirect URI matches exactly
- Ensure client secret hasn't expired
- Verify NEXTAUTH_SECRET is set

### Trash Issues

**Error**: "Failed to move file to trash"

**Solutions**:
- Verify trash container exists
- Check managed identity permissions
- Ensure file exists in source location

## Additional Resources

- [Azure Managed Identity Docs](https://docs.microsoft.com/en-us/azure/active-directory/managed-identities-azure-resources/)
- [NextAuth.js Documentation](https://next-auth.js.org/)
- [Azure Blob Storage](https://docs.microsoft.com/en-us/azure/storage/blobs/)
- [Azure AD App Registration](https://docs.microsoft.com/en-us/azure/active-directory/develop/quickstart-register-app)

## Support

For issues or questions:
- Check the main [README.md](README.md)
- Review [DEPLOYMENT.md](DEPLOYMENT.md)
- Open an issue on GitHub
