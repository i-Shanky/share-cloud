const { BlobServiceClient } = require('@azure/storage-blob');
const { DefaultAzureCredential } = require('@azure/identity');

// Get Azure Storage account name from environment variables
const accountName = process.env.AZURE_STORAGE_ACCOUNT_NAME;
const containerName = process.env.AZURE_STORAGE_CONTAINER_NAME || 'files';
const trashContainerName = process.env.AZURE_STORAGE_TRASH_CONTAINER_NAME || 'trash';

// Trash retention period in days
const TRASH_RETENTION_DAYS = 30;

if (!accountName) {
  console.warn('Azure Storage account name not configured. Please set AZURE_STORAGE_ACCOUNT_NAME in .env.local');
}

// Create the BlobServiceClient using Managed Identity
function getBlobServiceClient() {
  if (!accountName) {
    throw new Error('Azure Storage account name not configured');
  }

  // Use DefaultAzureCredential which supports:
  // - Managed Identity (in Azure)
  // - Azure CLI (local development)
  // - Environment variables
  // - Visual Studio Code
  const credential = new DefaultAzureCredential();

  const blobServiceClient = new BlobServiceClient(
    `https://${accountName}.blob.core.windows.net`,
    credential
  );

  return blobServiceClient;
}

// Get the container client
function getContainerClient(container = containerName) {
  const blobServiceClient = getBlobServiceClient();
  return blobServiceClient.getContainerClient(container);
}

// Ensure the container exists
async function ensureContainerExists(container = containerName, publicAccess = false) {
  const containerClient = getContainerClient(container);
  await containerClient.createIfNotExists({
    access: publicAccess ? 'blob' : 'private',
  });
  return containerClient;
}

// Generate user-specific path
function getUserPath(userId, fileName) {
  return `users/${userId}/${fileName}`;
}

// Get trash path with deletion timestamp
function getTrashPath(userId, fileName) {
  const timestamp = Date.now();
  return `users/${userId}/${timestamp}_${fileName}`;
}

// Upload a file to Azure Blob Storage
async function uploadFile(userId, fileName, fileBuffer, contentType) {
  const containerClient = await ensureContainerExists();
  const blobPath = getUserPath(userId, fileName);
  const blockBlobClient = containerClient.getBlockBlobClient(blobPath);

  const uploadOptions = {
    blobHTTPHeaders: {
      blobContentType: contentType,
    },
    metadata: {
      userId: userId,
      originalName: fileName,
      uploadedAt: new Date().toISOString(),
    },
  };

  await blockBlobClient.upload(fileBuffer, fileBuffer.length, uploadOptions);

  return {
    name: fileName,
    path: blobPath,
    size: fileBuffer.length,
    contentType: contentType,
    uploadedAt: new Date().toISOString(),
  };
}

// List all files for a user in the container
async function listFiles(userId) {
  const containerClient = await ensureContainerExists();
  const files = [];
  const prefix = `users/${userId}/`;

  for await (const blob of containerClient.listBlobsFlat({ prefix })) {
    const blockBlobClient = containerClient.getBlockBlobClient(blob.name);
    const metadata = blob.metadata || {};

    files.push({
      name: metadata.originalName || blob.name.split('/').pop(),
      path: blob.name,
      size: blob.properties.contentLength,
      contentType: blob.properties.contentType,
      lastModified: blob.properties.lastModified,
      uploadedAt: metadata.uploadedAt,
    });
  }

  return files;
}

// List all files in trash for a user
async function listTrash(userId) {
  const containerClient = await ensureContainerExists(trashContainerName);
  const files = [];
  const prefix = `users/${userId}/`;

  for await (const blob of containerClient.listBlobsFlat({ prefix })) {
    const metadata = blob.metadata || {};
    const blobName = blob.name.split('/').pop();
    const [timestamp, ...nameParts] = blobName.split('_');
    const originalName = nameParts.join('_');

    const deletedAt = new Date(parseInt(timestamp));
    const expiresAt = new Date(deletedAt.getTime() + TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const daysRemaining = Math.ceil((expiresAt - new Date()) / (1000 * 60 * 60 * 24));

    files.push({
      name: originalName,
      path: blob.name,
      size: blob.properties.contentLength,
      contentType: blob.properties.contentType,
      deletedAt: deletedAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
      daysRemaining: daysRemaining > 0 ? daysRemaining : 0,
    });
  }

  return files;
}

// Download a file from Azure Blob Storage
async function downloadFile(userId, fileName) {
  const containerClient = await ensureContainerExists();
  const blobPath = getUserPath(userId, fileName);
  const blockBlobClient = containerClient.getBlockBlobClient(blobPath);

  const downloadResponse = await blockBlobClient.download(0);
  const properties = await blockBlobClient.getProperties();

  return {
    stream: downloadResponse.readableStreamBody,
    contentType: properties.contentType,
    contentLength: properties.contentLength,
  };
}

// Move a file to trash (soft delete)
async function moveToTrash(userId, fileName) {
  const sourceContainerClient = await ensureContainerExists();
  const trashContainerClient = await ensureContainerExists(trashContainerName);

  const sourcePath = getUserPath(userId, fileName);
  const trashPath = getTrashPath(userId, fileName);

  const sourceBlob = sourceContainerClient.getBlockBlobClient(sourcePath);
  const trashBlob = trashContainerClient.getBlockBlobClient(trashPath);

  // Check if source file exists
  const exists = await sourceBlob.exists();
  if (!exists) {
    throw new Error('File not found');
  }

  // Copy to trash
  await trashBlob.beginCopyFromURL(sourceBlob.url);

  // Set metadata for trash item
  const properties = await sourceBlob.getProperties();
  await trashBlob.setMetadata({
    userId: userId,
    originalName: fileName,
    deletedAt: new Date().toISOString(),
    originalContentType: properties.contentType,
  });

  // Delete original
  await sourceBlob.delete();

  return {
    success: true,
    name: fileName,
    message: `File moved to trash. Will be permanently deleted after ${TRASH_RETENTION_DAYS} days.`
  };
}

// Restore a file from trash
async function restoreFromTrash(userId, trashPath) {
  const trashContainerClient = await ensureContainerExists(trashContainerName);
  const containerClient = await ensureContainerExists();

  const trashBlob = trashContainerClient.getBlockBlobClient(trashPath);

  // Check if trash file exists
  const exists = await trashBlob.exists();
  if (!exists) {
    throw new Error('File not found in trash');
  }

  // Get metadata to restore original name
  const properties = await trashBlob.getProperties();
  const metadata = properties.metadata || {};
  const originalName = metadata.originalName;

  if (!originalName) {
    throw new Error('Could not determine original file name');
  }

  const restorePath = getUserPath(userId, originalName);
  const restoreBlob = containerClient.getBlockBlobClient(restorePath);

  // Copy back to original location
  await restoreBlob.beginCopyFromURL(trashBlob.url);

  // Set original metadata
  await restoreBlob.setMetadata({
    userId: userId,
    originalName: originalName,
    restoredAt: new Date().toISOString(),
  });

  // Delete from trash
  await trashBlob.delete();

  return {
    success: true,
    name: originalName,
    message: 'File restored successfully'
  };
}

// Permanently delete a file from trash
async function permanentDelete(userId, trashPath) {
  const trashContainerClient = await ensureContainerExists(trashContainerName);
  const trashBlob = trashContainerClient.getBlockBlobClient(trashPath);

  // Check if trash file exists
  const exists = await trashBlob.exists();
  if (!exists) {
    throw new Error('File not found in trash');
  }

  // Verify the file belongs to the user
  const properties = await trashBlob.getProperties();
  const metadata = properties.metadata || {};

  if (metadata.userId !== userId) {
    throw new Error('Unauthorized: File does not belong to user');
  }

  await trashBlob.delete();

  return {
    success: true,
    message: 'File permanently deleted'
  };
}

// Clean up expired trash items (should be run as a scheduled task)
async function cleanupExpiredTrash() {
  const trashContainerClient = await ensureContainerExists(trashContainerName);
  const now = Date.now();
  const expirationTime = TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  let deletedCount = 0;

  for await (const blob of trashContainerClient.listBlobsFlat()) {
    const blobName = blob.name.split('/').pop();
    const [timestamp] = blobName.split('_');
    const deletedAt = parseInt(timestamp);

    if (now - deletedAt > expirationTime) {
      const blockBlobClient = trashContainerClient.getBlockBlobClient(blob.name);
      await blockBlobClient.delete();
      deletedCount++;
    }
  }

  return {
    success: true,
    deletedCount,
    message: `Cleaned up ${deletedCount} expired files from trash`
  };
}

module.exports = {
  uploadFile,
  listFiles,
  downloadFile,
  moveToTrash,
  restoreFromTrash,
  permanentDelete,
  listTrash,
  cleanupExpiredTrash,
  getUserPath,
};
