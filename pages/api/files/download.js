import { downloadFile } from '../../../lib/azureStorage';
import { requireAuth, getUserId } from '../../../lib/auth';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Check authentication
  const session = await requireAuth(req, res);
  if (!session) return;

  const userId = getUserId(session);
  const { name } = req.query;

  if (!name) {
    return res.status(400).json({ error: 'File name is required' });
  }

  try {
    const { stream, contentType, contentLength } = await downloadFile(userId, name);

    res.setHeader('Content-Type', contentType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
    res.setHeader('Content-Length', contentLength);

    // Pipe the stream to the response
    stream.pipe(res);
  } catch (error) {
    console.error('Download error:', error);
    res.status(500).json({
      error: 'Failed to download file from Azure Storage',
      details: error.message
    });
  }
}
