const { BlobServiceClient, StorageSharedKeyCredential } = require('@azure/storage-blob');

// Get Azure Storage credentials from environment variables
const accountName = process.env.AZURE_STORAGE_ACCOUNT_NAME;
const accountKey = process.env.AZURE_STORAGE_ACCOUNT_KEY;
const containerName = process.env.AZURE_STORAGE_CONTAINER_NAME || 'files';

if (!accountName || !accountKey) {
  console.warn('Azure Storage credentials not configured. Please set AZURE_STORAGE_ACCOUNT_NAME and AZURE_STORAGE_ACCOUNT_KEY in .env.local');
}

// Create the BlobServiceClient
function getBlobServiceClient() {
  if (!accountName || !accountKey) {
    throw new Error('Azure Storage credentials not configured');
  }

  const sharedKeyCredential = new StorageSharedKeyCredential(accountName, accountKey);
  const blobServiceClient = new BlobServiceClient(
    `https://${accountName}.blob.core.windows.net`,
    sharedKeyCredential
  );

  return blobServiceClient;
}

// Get the container client
function getContainerClient() {
  const blobServiceClient = getBlobServiceClient();
  return blobServiceClient.getContainerClient(containerName);
}

// Ensure the container exists
async function ensureContainerExists() {
  const containerClient = getContainerClient();
  await containerClient.createIfNotExists({
    access: 'blob', // Public access to blobs
  });
  return containerClient;
}

// Upload a file to Azure Blob Storage
async function uploadFile(fileName, fileBuffer, contentType) {
  const containerClient = await ensureContainerExists();
  const blockBlobClient = containerClient.getBlockBlobClient(fileName);

  const uploadOptions = {
    blobHTTPHeaders: {
      blobContentType: contentType,
    },
  };

  await blockBlobClient.upload(fileBuffer, fileBuffer.length, uploadOptions);

  return {
    name: fileName,
    url: blockBlobClient.url,
    size: fileBuffer.length,
    contentType: contentType,
  };
}

// List all files in the container
async function listFiles() {
  const containerClient = await ensureContainerExists();
  const files = [];

  for await (const blob of containerClient.listBlobsFlat()) {
    const blockBlobClient = containerClient.getBlockBlobClient(blob.name);
    files.push({
      name: blob.name,
      url: blockBlobClient.url,
      size: blob.properties.contentLength,
      contentType: blob.properties.contentType,
      lastModified: blob.properties.lastModified,
    });
  }

  return files;
}

// Download a file from Azure Blob Storage
async function downloadFile(fileName) {
  const containerClient = await ensureContainerExists();
  const blockBlobClient = containerClient.getBlockBlobClient(fileName);

  const downloadResponse = await blockBlobClient.download(0);
  const properties = await blockBlobClient.getProperties();

  return {
    stream: downloadResponse.readableStreamBody,
    contentType: properties.contentType,
    contentLength: properties.contentLength,
  };
}

// Delete a file from Azure Blob Storage
async function deleteFile(fileName) {
  const containerClient = await ensureContainerExists();
  const blockBlobClient = containerClient.getBlockBlobClient(fileName);

  await blockBlobClient.delete();

  return { success: true, name: fileName };
}

module.exports = {
  uploadFile,
  listFiles,
  downloadFile,
  deleteFile,
};
