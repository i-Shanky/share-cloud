import { cleanupExpiredTrash } from '../../../lib/azureStorage';

// This endpoint should be protected with an API key or called by a scheduled task
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Simple API key authentication for cleanup task
  const apiKey = req.headers['x-api-key'];
  if (apiKey !== process.env.CLEANUP_API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const result = await cleanupExpiredTrash();
    res.status(200).json({ success: true, ...result });
  } catch (error) {
    console.error('Cleanup error:', error);
    res.status(500).json({
      error: 'Failed to cleanup expired trash',
      details: error.message
    });
  }
}
