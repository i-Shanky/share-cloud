import { deleteFile } from '../../../lib/azureStorage';

export default async function handler(req, res) {
  if (req.method !== 'DELETE') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { name } = req.query;

  if (!name) {
    return res.status(400).json({ error: 'File name is required' });
  }

  try {
    const result = await deleteFile(name);
    res.status(200).json({ success: true, ...result });
  } catch (error) {
    console.error('Delete error:', error);
    res.status(500).json({ error: 'Failed to delete file from Azure Storage' });
  }
}
