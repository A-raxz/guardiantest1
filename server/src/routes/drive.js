import { Router } from 'express';
import { config } from '../config.js';
import { getDriveProvider, resolveDriveSelection } from '../services/drive.js';
import { requireAdmin, requireAuth } from '../middleware/auth.js';

export const driveRouter = Router();
driveRouter.use(requireAuth, requireAdmin);

/** Folder browser used by the HR BP when picking content to assign. */
driveRouter.get('/files', async (req, res, next) => {
  try {
    const folderId = req.query.folderId ? String(req.query.folderId) : 'root';
    const files = await getDriveProvider().listChildren(folderId);
    res.json({ provider: config.drive.provider, folderId, files });
  } catch (error) {
    next(error);
  }
});

/** Preview what assigning a given file or folder would produce. */
driveRouter.get('/resolve', async (req, res, next) => {
  try {
    const selection = await resolveDriveSelection(req.query.driveId ? String(req.query.driveId) : null);
    res.json({
      root: selection.root,
      kind: selection.kind,
      items: selection.items,
      videoCount: selection.items.filter((item) => item.isVideo).length,
    });
  } catch (error) {
    next(error);
  }
});
