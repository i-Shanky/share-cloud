# ShareCloud - Azure File Storage App

A modern, Google Drive-like file storage application built with Next.js and Azure Blob Storage. Upload, manage, and share files seamlessly using Microsoft Azure's cloud infrastructure.

## Features

- **Drag & Drop Upload**: Intuitive file upload with drag-and-drop support
- **File Management**: List, download, and delete files easily
- **Modern UI**: Clean, responsive interface inspired by Google Drive
- **Azure-Powered**: Leverages Azure Blob Storage for reliable cloud storage
- **Multiple File Types**: Support for images, videos, documents, and more
- **Dark Mode**: Automatic dark mode based on system preferences

## Prerequisites

Before you begin, ensure you have:

1. **Node.js** (version 14 or higher)
2. **An Azure Account** with an active subscription
3. **Azure Storage Account** created in your Azure Portal

## Azure Setup

### Step 1: Create an Azure Storage Account

1. Go to [Azure Portal](https://portal.azure.com)
2. Click "Create a resource" → Search for "Storage account"
3. Fill in the required details:
   - **Subscription**: Choose your subscription
   - **Resource Group**: Create new or use existing
   - **Storage account name**: Choose a unique name (e.g., `sharecloud123`)
   - **Region**: Select your preferred region
   - **Performance**: Standard
   - **Redundancy**: LRS (Locally-redundant storage) for development
4. Click "Review + Create" → "Create"

### Step 2: Get Your Storage Credentials

1. Navigate to your Storage Account in Azure Portal
2. Go to "Security + networking" → "Access keys"
3. Copy the following values:
   - **Storage account name**: Your account name
   - **Key**: Key1 or Key2 (either will work)

### Step 3: Configure Container (Optional)

The application automatically creates a container named "files" if it doesn't exist. You can customize this in the `.env.local` file.

## Installation

1. **Clone the repository**:
   ```bash
   git clone <your-repo-url>
   cd share-cloud
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Configure environment variables**:

   Copy `.env.example` to `.env.local`:
   ```bash
   cp .env.example .env.local
   ```

   Edit `.env.local` and add your Azure credentials:
   ```env
   AZURE_STORAGE_ACCOUNT_NAME=your-storage-account-name
   AZURE_STORAGE_ACCOUNT_KEY=your-storage-account-key
   AZURE_STORAGE_CONTAINER_NAME=files
   ```

   Replace:
   - `your-storage-account-name` with your Azure Storage account name
   - `your-storage-account-key` with your Azure Storage access key

4. **Run the development server**:
   ```bash
   npm run dev
   ```

5. **Open your browser**:
   Navigate to [http://localhost:3000](http://localhost:3000)

## Usage

### Uploading Files

1. **Drag and Drop**: Drag files from your computer directly into the upload area
2. **Click to Upload**: Click the "Choose Files" button and select files from your computer
3. **Multiple Files**: Upload multiple files at once

### Managing Files

- **Download**: Click the download icon (⬇️) on any file card
- **Delete**: Click the delete icon (🗑️) to remove a file (confirmation required)
- **Refresh**: Click the refresh button to reload the file list

### File Information

Each file displays:
- File name
- File size
- Upload date and time
- File type icon

## Project Structure

```
share-cloud/
├── lib/
│   └── azureStorage.js      # Azure Blob Storage utility functions
├── pages/
│   ├── api/
│   │   └── files/
│   │       ├── upload.js    # File upload API endpoint
│   │       ├── list.js      # List files API endpoint
│   │       ├── download.js  # Download file API endpoint
│   │       └── delete.js    # Delete file API endpoint
│   ├── _app.js              # Next.js App component
│   └── index.js             # Main application page
├── styles/
│   ├── globals.css          # Global styles
│   └── Home.module.css      # Component-specific styles
├── .env.local               # Environment variables (not in git)
├── .env.example             # Environment variables template
└── package.json             # Project dependencies
```

## API Endpoints

### POST `/api/files/upload`
Upload one or more files to Azure Blob Storage.

**Request**: Multipart form data with file(s)
**Response**: `{ success: true, files: [...] }`

### GET `/api/files/list`
List all files in the storage container.

**Response**: `{ success: true, files: [...] }`

### GET `/api/files/download?name=filename`
Download a specific file.

**Parameters**: `name` - The filename to download
**Response**: File download stream

### DELETE `/api/files/delete?name=filename`
Delete a specific file.

**Parameters**: `name` - The filename to delete
**Response**: `{ success: true, name: "filename" }`

## Docker Support

The project includes Docker configuration for containerized deployment.

### Build and Run with Docker

```bash
# Build the image
docker build -t sharecloud .

# Run the container
docker run -p 3000:3000 \
  -e AZURE_STORAGE_ACCOUNT_NAME=your-account-name \
  -e AZURE_STORAGE_ACCOUNT_KEY=your-account-key \
  -e AZURE_STORAGE_CONTAINER_NAME=files \
  sharecloud
```

### Using Docker Compose

```bash
# Update docker-compose.yml with your Azure credentials
# Then run:
docker-compose up
```

## Configuration

### File Size Limits

Default maximum file size is **100MB**. To change this, edit `pages/api/files/upload.js`:

```javascript
const form = formidable({
  maxFiles: 10,
  maxFileSize: 100 * 1024 * 1024, // Change this value
});
```

### Container Access Level

By default, the container is created with public blob access. To change this, edit `lib/azureStorage.js`:

```javascript
await containerClient.createIfNotExists({
  access: 'blob', // Options: 'blob', 'container', or 'private'
});
```

## Security Considerations

1. **Never commit `.env.local`**: Keep your Azure credentials secure
2. **Use environment variables**: Always use environment variables for sensitive data
3. **Access control**: Consider implementing authentication before deploying to production
4. **CORS**: Configure CORS settings in Azure if accessing from different domains
5. **Key rotation**: Regularly rotate your Azure Storage access keys

## Troubleshooting

### "Azure Storage credentials not configured" error

Make sure your `.env.local` file exists and contains the correct credentials.

### Files not uploading

1. Check your Azure Storage account is active
2. Verify your access key is correct
3. Ensure the container exists or can be created
4. Check file size limits

### Connection errors

1. Verify your internet connection
2. Check Azure Storage account is accessible
3. Ensure no firewall is blocking Azure endpoints

## Deployment to Azure

ShareCloud includes comprehensive deployment pipelines for Azure. Multiple deployment options are available:

### Quick Deploy Options

**Option 1: Azure App Service (Recommended for beginners)**
```bash
./azure/scripts/deploy-app-service.sh
```

**Option 2: Azure Container Apps (Recommended for scalability)**
```bash
./azure/scripts/deploy-container-apps.sh
```

### GitHub Actions CI/CD

The project includes automated GitHub Actions workflows:

- **azure-app-service.yml**: Deploys to Azure App Service on push to main
- **azure-container-apps.yml**: Deploys to Azure Container Apps on push to main
- **ci.yml**: Runs tests and builds on pull requests

To set up GitHub Actions:

1. Add the following secrets to your GitHub repository:
   - `AZURE_CREDENTIALS`: Azure service principal credentials
   - `AZURE_STORAGE_ACCOUNT_NAME`: Your storage account name
   - `AZURE_STORAGE_ACCOUNT_KEY`: Your storage account key
   - `AZURE_STORAGE_CONTAINER_NAME`: Container name (default: files)

2. Update workflow environment variables in `.github/workflows/*.yml`

3. Push to main branch to trigger deployment

### Deployment Methods

- **Automated Scripts**: One-command deployment with interactive prompts
- **ARM Templates**: Infrastructure as Code for repeatable deployments
- **Manual CLI**: Step-by-step Azure CLI commands
- **GitHub Actions**: Automated CI/CD pipelines

For detailed deployment instructions, monitoring, troubleshooting, and best practices, see **[DEPLOYMENT.md](DEPLOYMENT.md)**.

## Development

### Build for Production

```bash
npm run build
npm start
```

### Linting

```bash
npm run lint
```

## Technologies Used

- **Next.js 13** - React framework
- **React 18** - UI library
- **Azure Blob Storage** - Cloud file storage
- **Formidable** - File upload handling
- **Docker** - Containerization

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is open source and available under the MIT License.

## Support

For issues and questions:
- Check the [Azure Blob Storage documentation](https://docs.microsoft.com/en-us/azure/storage/blobs/)
- Review the [Next.js documentation](https://nextjs.org/docs)
- Open an issue in this repository

## Acknowledgments

- Built with [Next.js](https://nextjs.org/)
- Powered by [Azure Blob Storage](https://azure.microsoft.com/en-us/services/storage/blobs/)
- Inspired by Google Drive's user interface
