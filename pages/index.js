import { useState, useEffect, useCallback } from 'react';
import { useSession, signIn, signOut } from 'next-auth/react';
import Head from 'next/head';
import styles from '../styles/Home.module.css';

export default function Home() {
  const { data: session, status } = useSession();
  const [files, setFiles] = useState([]);
  const [trashFiles, setTrashFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('files');
  const [successMessage, setSuccessMessage] = useState('');

  const isAuthenticated = status === 'authenticated';

  useEffect(() => {
    if (isAuthenticated) {
      loadFiles();
      if (activeTab === 'trash') {
        loadTrash();
      }
    }
  }, [isAuthenticated]);

  const loadFiles = async () => {
    if (!isAuthenticated) return;
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
      setError('Failed to load files.');
    } finally {
      setLoading(false);
    }
  };

  const loadTrash = async () => {
    if (!isAuthenticated) return;
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/trash/list');
      const data = await response.json();
      if (data.success) {
        setTrashFiles(data.files);
      } else {
        setError('Failed to load trash');
      }
    } catch (err) {
      console.error('Error loading trash:', err);
      setError('Failed to load trash.');
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async (fileList) => {
    if (!fileList || fileList.length === 0) return;
    if (!isAuthenticated) {
      setError('Please sign in to upload files');
      return;
    }
    setUploading(true);
    setError('');
    setSuccessMessage('');
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
        setSuccessMessage(`Successfully uploaded ${data.files.length} file(s)`);
        await loadFiles();
        setTimeout(() => setSuccessMessage(''), 3000);
      } else {
        setError(data.error || 'Failed to upload files');
      }
    } catch (err) {
      console.error('Error uploading files:', err);
      setError('Failed to upload files');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (fileName) => {
    if (!confirm(`Move "${fileName}" to trash?`)) return;
    setError('');
    setSuccessMessage('');
    try {
      const response = await fetch(`/api/files/delete?name=${encodeURIComponent(fileName)}`, {
        method: 'DELETE',
      });
      const data = await response.json();
      if (data.success) {
        setSuccessMessage(data.message);
        await loadFiles();
        setTimeout(() => setSuccessMessage(''), 3000);
      } else {
        setError(data.error || 'Failed to delete file');
      }
    } catch (err) {
      console.error('Error deleting file:', err);
      setError('Failed to delete file');
    }
  };

  const handleRestore = async (trashPath, fileName) => {
    setError('');
    setSuccessMessage('');
    try {
      const response = await fetch('/api/trash/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: trashPath }),
      });
      const data = await response.json();
      if (data.success) {
        setSuccessMessage(`Restored "${fileName}"`);
        await loadTrash();
        await loadFiles();
        setTimeout(() => setSuccessMessage(''), 3000);
      } else {
        setError(data.error || 'Failed to restore file');
      }
    } catch (err) {
      console.error('Error restoring file:', err);
      setError('Failed to restore file');
    }
  };

  const handlePermanentDelete = async (trashPath, fileName) => {
    if (!confirm(`Permanently delete "${fileName}"? This action cannot be undone.`)) return;
    setError('');
    setSuccessMessage('');
    try {
      const response = await fetch(`/api/trash/permanent-delete?path=${encodeURIComponent(trashPath)}`, {
        method: 'DELETE',
      });
      const data = await response.json();
      if (data.success) {
        setSuccessMessage(`Permanently deleted "${fileName}"`);
        await loadTrash();
        setTimeout(() => setSuccessMessage(''), 3000);
      } else {
        setError(data.error || 'Failed to permanently delete file');
      }
    } catch (err) {
      console.error('Error permanently deleting file:', err);
      setError('Failed to permanently delete file');
    }
  };

  const handleDownload = (fileName) => {
    window.open(`/api/files/download?name=${encodeURIComponent(fileName)}`, '_blank');
  };

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
  }, [isAuthenticated]);

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    if (tab === 'trash' && trashFiles.length === 0) {
      loadTrash();
    }
  };

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleString();
  };

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

  if (status === 'loading') {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>Loading...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className={styles.container}>
        <Head>
          <title>ShareCloud - Azure File Storage</title>
          <meta name="description" content="File storage powered by Azure Blob Storage" />
          <link rel="icon" href="/favicon.ico" />
        </Head>
        <main className={styles.main}>
          <div className={styles.welcomeCard}>
            <h1 className={styles.title}>☁️ ShareCloud</h1>
            <p className={styles.welcomeSubtitle}>Your files, powered by Azure</p>
            <button onClick={() => signIn()} className={styles.signInBtn}>
              Sign in with Microsoft
            </button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <Head>
        <title>ShareCloud - Azure File Storage</title>
        <meta name="description" content="File storage powered by Azure Blob Storage" />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <main className={styles.main}>
        <div className={styles.header}>
          <div>
            <h1 className={styles.title}>ShareCloud</h1>
            <p className={styles.subtitle}>Welcome, {session.user.name || session.user.email}</p>
          </div>
          <button onClick={() => signOut()} className={styles.signOutBtn}>Sign Out</button>
        </div>
        {error && <div className={styles.error}>{error}</div>}
        {successMessage && <div className={styles.success}>{successMessage}</div>}
        {activeTab === 'files' && (
          <div
            className={`${styles.uploadArea} ${dragActive ? styles.dragActive : ''}`}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
          >
            <div className={styles.uploadContent}>
              <div className={styles.uploadIcon}>☁️</div>
              <p className={styles.uploadText}>{uploading ? 'Uploading...' : 'Drag and drop files here'}</p>
              <p className={styles.uploadSubtext}>or</p>
              <label className={styles.uploadButton}>
                <input type="file" multiple onChange={(e) => handleUpload(e.target.files)} disabled={uploading} style={{ display: 'none' }} />
                Choose Files
              </label>
            </div>
          </div>
        )}
        <div className={styles.filesSection}>
          <div className={styles.tabs}>
            <button className={`${styles.tab} ${activeTab === 'files' ? styles.activeTab : ''}`} onClick={() => handleTabChange('files')}>📁 My Files</button>
            <button className={`${styles.tab} ${activeTab === 'trash' ? styles.activeTab : ''}`} onClick={() => handleTabChange('trash')}>🗑️ Trash</button>
          </div>
          <div className={styles.filesSectionHeader}>
            <h2>{activeTab === 'files' ? 'Your Files' : 'Trash'}</h2>
            <button className={styles.refreshButton} onClick={activeTab === 'files' ? loadFiles : loadTrash} disabled={loading}>{loading ? '↻' : '🔄'} Refresh</button>
          </div>
          {loading ? (
            <div className={styles.loading}>Loading {activeTab === 'files' ? 'files' : 'trash'}...</div>
          ) : activeTab === 'files' ? (
            files.length === 0 ? (
              <div className={styles.emptyState}><div className={styles.emptyIcon}>📂</div><p>No files yet. Upload some files to get started!</p></div>
            ) : (
              <div className={styles.fileGrid}>
                {files.map((file) => (
                  <div key={file.path} className={styles.fileCard}>
                    <div className={styles.fileIcon}>{getFileIcon(file.contentType)}</div>
                    <div className={styles.fileInfo}>
                      <div className={styles.fileName} title={file.name}>{file.name}</div>
                      <div className={styles.fileDetails}>{formatFileSize(file.size)} • {formatDate(file.lastModified)}</div>
                    </div>
                    <div className={styles.fileActions}>
                      <button className={styles.actionButton} onClick={() => handleDownload(file.name)} title="Download">⬇️</button>
                      <button className={styles.actionButton} onClick={() => handleDelete(file.name)} title="Move to Trash">🗑️</button>
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : (
            trashFiles.length === 0 ? (
              <div className={styles.emptyState}><div className={styles.emptyIcon}>🗑️</div><p>Trash is empty</p></div>
            ) : (
              <div className={styles.fileGrid}>
                {trashFiles.map((file) => (
                  <div key={file.path} className={`${styles.fileCard} ${styles.trashCard}`}>
                    <div className={styles.fileIcon}>{getFileIcon(file.contentType)}</div>
                    <div className={styles.fileInfo}>
                      <div className={styles.fileName} title={file.name}>{file.name}</div>
                      <div className={styles.fileDetails}>{formatFileSize(file.size)} • Deleted {formatDate(file.deletedAt)}</div>
                      <div className={styles.trashExpiry}>Expires in {file.daysRemaining} day{file.daysRemaining !== 1 ? 's' : ''}</div>
                    </div>
                    <div className={styles.fileActions}>
                      <button className={styles.actionButton} onClick={() => handleRestore(file.path, file.name)} title="Restore">↩️</button>
                      <button className={`${styles.actionButton} ${styles.dangerButton}`} onClick={() => handlePermanentDelete(file.path, file.name)} title="Delete Permanently">❌</button>
                    </div>
                  </div>
                ))}
              </div>
            )
          )}
        </div>
      </main>
      <footer className={styles.footer}><p>Powered by Azure Blob Storage with Managed Identity • Protected with Azure AD</p></footer>
    </div>
  );
}
