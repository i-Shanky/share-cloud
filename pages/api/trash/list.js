import { listTrash } from '../../../lib/azureStorage';
import { requireAuth, getUserId } from '../../../lib/auth';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Check authentication
  const session = await requireAuth(req, res);
  if (!session) return;

  const userId = getUserId(session);

  try {
    const files = await listTrash(userId);
    res.status(200).json({ success: true, files });
  } catch (error) {
    console.error('List trash error:', error);
    res.status(500).json({
      error: 'Failed to list trash from Azure Storage',
      details: error.message
    });
  }
}
