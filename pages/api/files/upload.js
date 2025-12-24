import formidable from 'formidable';
import fs from 'fs';
import { uploadFile } from '../../../lib/azureStorage';
import { requireAuth, getUserId } from '../../../lib/auth';

// Disable Next.js body parser to handle file uploads
export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Check authentication
  const session = await requireAuth(req, res);
  if (!session) return;

  const userId = getUserId(session);

  try {
    const form = formidable({
      maxFiles: 10,
      maxFileSize: 100 * 1024 * 1024, // 100MB max file size
    });

    form.parse(req, async (err, fields, files) => {
      if (err) {
        console.error('Form parsing error:', err);
        return res.status(500).json({ error: 'Failed to parse form data' });
      }

      try {
        const uploadedFiles = [];
        const fileArray = Array.isArray(files.file) ? files.file : [files.file];

        for (const file of fileArray) {
          if (!file) continue;

          // Read file buffer
          const fileBuffer = fs.readFileSync(file.filepath);

          // Upload to Azure with userId
          const result = await uploadFile(
            userId,
            file.originalFilename || file.newFilename,
            fileBuffer,
            file.mimetype || 'application/octet-stream'
          );

          uploadedFiles.push(result);

          // Clean up temp file
          fs.unlinkSync(file.filepath);
        }

        res.status(200).json({
          success: true,
          files: uploadedFiles,
        });
      } catch (uploadError) {
        console.error('Upload error:', uploadError);
        res.status(500).json({
          error: 'Failed to upload files to Azure Storage',
          details: uploadError.message
        });
      }
    });
  } catch (error) {
    console.error('Server error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}
