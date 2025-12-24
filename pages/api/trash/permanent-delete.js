import { permanentDelete } from '../../../lib/azureStorage';
import { requireAuth, getUserId } from '../../../lib/auth';

export default async function handler(req, res) {
  if (req.method !== 'DELETE') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Check authentication
  const session = await requireAuth(req, res);
  if (!session) return;

  const userId = getUserId(session);
  const { path } = req.query;

  if (!path) {
    return res.status(400).json({ error: 'File path is required' });
  }

  try {
    const result = await permanentDelete(userId, path);
    res.status(200).json({ success: true, ...result });
  } catch (error) {
    console.error('Permanent delete error:', error);
    res.status(500).json({
      error: 'Failed to permanently delete file',
      details: error.message
    });
  }
}
