import { getServerSession } from 'next-auth/next';
import { authOptions } from '../pages/api/auth/[...nextauth]';

// Get the current session
export async function getSession(req, res) {
  return await getServerSession(req, res, authOptions);
}

// Check if user is authenticated
export async function requireAuth(req, res) {
  const session = await getSession(req, res);

  if (!session) {
    res.status(401).json({ error: 'Unauthorized - Please sign in' });
    return null;
  }

  return session;
}

// Get user ID from session
export function getUserId(session) {
  // Use email as user ID (Azure AD provides unique email)
  // In production, you might want to use the Azure AD object ID
  return session.user.email.replace('@', '_at_').replace(/\./g, '_');
}
