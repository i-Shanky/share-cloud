import { listFiles } from '../../../lib/azureStorage';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const files = await listFiles();
    res.status(200).json({ success: true, files });
  } catch (error) {
    console.error('List files error:', error);
    res.status(500).json({ error: 'Failed to list files from Azure Storage' });
  }
}
