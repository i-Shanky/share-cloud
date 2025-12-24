import { useState, useEffect, useCallback } from 'react';
import Head from 'next/head';
import styles from '../styles/Home.module.css';

export default function Home() {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState('');

  // Load files on component mount
  useEffect(() => {
    loadFiles();
  }, []);

  // Load files from Azure Storage
  const loadFiles = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/files/list');
      const data = await response.json();
      if (data.success) {
        setFiles(data.files);
      } else {
        setError('Failed to load files');
      }
    } catch (err) {
      console.error('Error loading files:', err);
      setError('Failed to load files. Please check your Azure Storage configuration.');
    } finally {
      setLoading(false);
    }
  };

  // Handle file upload
  const handleUpload = async (fileList) => {
    if (!fileList || fileList.length === 0) return;

    setUploading(true);
    setError('');

    const formData = new FormData();
    Array.from(fileList).forEach((file) => {
      formData.append('file', file);
    });

    try {
      const response = await fetch('/api/files/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (data.success) {
        await loadFiles(); // Reload the file list
      } else {
        setError('Failed to upload files');
      }
    } catch (err) {
      console.error('Error uploading files:', err);
      setError('Failed to upload files');
    } finally {
      setUploading(false);
    }
  };

  // Handle file delete
  const handleDelete = async (fileName) => {
    if (!confirm(`Are you sure you want to delete "${fileName}"?`)) {
      return;
    }

    setError('');
    try {
      const response = await fetch(`/api/files/delete?name=${encodeURIComponent(fileName)}`, {
        method: 'DELETE',
      });

      const data = await response.json();

      if (data.success) {
        await loadFiles(); // Reload the file list
      } else {
        setError('Failed to delete file');
      }
    } catch (err) {
      console.error('Error deleting file:', err);
      setError('Failed to delete file');
    }
  };

  // Handle file download
  const handleDownload = (fileName) => {
    window.open(`/api/files/download?name=${encodeURIComponent(fileName)}`, '_blank');
  };

  // Handle drag events
  const handleDrag = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleUpload(e.dataTransfer.files);
    }
  }, []);

  // Format file size
  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  // Format date
  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  // Get file icon based on type
  const getFileIcon = (contentType) => {
    if (!contentType) return '📄';
    if (contentType.startsWith('image/')) return '🖼️';
    if (contentType.startsWith('video/')) return '🎬';
    if (contentType.startsWith('audio/')) return '🎵';
    if (contentType.includes('pdf')) return '📕';
    if (contentType.includes('zip') || contentType.includes('compressed')) return '📦';
    if (contentType.includes('text')) return '📝';
    return '📄';
  };

  return (
    <div className={styles.container}>
      <Head>
        <title>ShareCloud - Azure File Storage</title>
        <meta name="description" content="File storage powered by Azure Blob Storage" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <main className={styles.main}>
        <div className={styles.header}>
          <h1 className={styles.title}>ShareCloud</h1>
          <p className={styles.subtitle}>Your files, powered by Azure</p>
        </div>

        {error && (
          <div className={styles.error}>
            {error}
          </div>
        )}

        <div
          className={`${styles.uploadArea} ${dragActive ? styles.dragActive : ''}`}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
        >
          <div className={styles.uploadContent}>
            <div className={styles.uploadIcon}>☁️</div>
            <p className={styles.uploadText}>
              {uploading ? 'Uploading...' : 'Drag and drop files here'}
            </p>
            <p className={styles.uploadSubtext}>or</p>
            <label className={styles.uploadButton}>
              <input
                type="file"
                multiple
                onChange={(e) => handleUpload(e.target.files)}
                disabled={uploading}
                style={{ display: 'none' }}
              />
              Choose Files
            </label>
          </div>
        </div>

        <div className={styles.filesSection}>
          <div className={styles.filesSectionHeader}>
            <h2>Your Files</h2>
            <button
              className={styles.refreshButton}
              onClick={loadFiles}
              disabled={loading}
            >
              {loading ? '↻' : '🔄'} Refresh
            </button>
          </div>

          {loading ? (
            <div className={styles.loading}>Loading files...</div>
          ) : files.length === 0 ? (
            <div className={styles.emptyState}>
              <div className={styles.emptyIcon}>📂</div>
              <p>No files yet. Upload some files to get started!</p>
            </div>
          ) : (
            <div className={styles.fileGrid}>
              {files.map((file) => (
                <div key={file.name} className={styles.fileCard}>
                  <div className={styles.fileIcon}>
                    {getFileIcon(file.contentType)}
                  </div>
                  <div className={styles.fileInfo}>
                    <div className={styles.fileName} title={file.name}>
                      {file.name}
                    </div>
                    <div className={styles.fileDetails}>
                      {formatFileSize(file.size)} • {formatDate(file.lastModified)}
                    </div>
                  </div>
                  <div className={styles.fileActions}>
                    <button
                      className={styles.actionButton}
                      onClick={() => handleDownload(file.name)}
                      title="Download"
                    >
                      ⬇️
                    </button>
                    <button
                      className={styles.actionButton}
                      onClick={() => handleDelete(file.name)}
                      title="Delete"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      <footer className={styles.footer}>
        <p>Powered by Azure Blob Storage</p>
      </footer>
    </div>
  );
}
