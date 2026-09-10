import crypto from 'node:crypto';
import fs from 'node:fs';
import { config } from '../config.js';
import { HttpError, badRequest } from '../lib/errors.js';

export const FOLDER_MIME = 'application/vnd.google-apps.folder';
const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPE = 'https://www.googleapis.com/auth/drive.readonly';

export const isVideo = (mimeType = '') =>
  mimeType.startsWith('video/') || mimeType === 'application/vnd.google-apps.video';

export const previewUrl = (fileId) => `https://drive.google.com/file/d/${fileId}/preview`;

/* ------------------------------------------------------------------ *
 * Google provider — service-account auth, no SDK dependency.
 * ------------------------------------------------------------------ */

function serviceAccountCredentials() {
  if (config.drive.clientEmail && config.drive.privateKey) {
    return { client_email: config.drive.clientEmail, private_key: config.drive.privateKey };
  }
  const file = config.drive.serviceAccountFile;
  if (file && fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  throw new HttpError(
    503,
    'Google Drive is not configured. Set GOOGLE_SERVICE_ACCOUNT_FILE (or GOOGLE_CLIENT_EMAIL + GOOGLE_PRIVATE_KEY), or run with DRIVE_PROVIDER=mock.',
  );
}

let cachedToken = null;

async function getAccessToken() {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;

  const creds = serviceAccountCredentials();
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const claims = Buffer.from(
    JSON.stringify({
      iss: creds.client_email,
      scope: SCOPE,
      aud: TOKEN_URL,
      iat: now,
      exp: now + 3600,
      ...(config.drive.impersonateSubject ? { sub: config.drive.impersonateSubject } : {}),
    }),
  ).toString('base64url');
  const signature = crypto
    .createSign('RSA-SHA256')
    .update(`${header}.${claims}`)
    .sign(creds.private_key)
    .toString('base64url');

  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${header}.${claims}.${signature}`,
    }),
  });
  if (!response.ok) {
    throw new HttpError(502, `Google Drive authentication failed: ${await response.text()}`);
  }
  const json = await response.json();
  cachedToken = { value: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 };
  return cachedToken.value;
}

async function driveFetch(pathname, params = {}) {
  const token = await getAccessToken();
  const url = new URL(`${DRIVE_API}${pathname}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
  }
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) {
    const status = response.status === 404 ? 404 : 502;
    throw new HttpError(status, `Google Drive request failed (${response.status}): ${await response.text()}`);
  }
  return response.json();
}

const FILE_FIELDS = 'id,name,mimeType,iconLink,thumbnailLink,webViewLink,videoMediaMetadata,size,modifiedTime';

const normalize = (file) => ({
  id: file.id,
  name: file.name,
  mimeType: file.mimeType,
  isFolder: file.mimeType === FOLDER_MIME,
  isVideo: isVideo(file.mimeType),
  webViewLink: file.webViewLink || previewUrl(file.id),
  thumbnailLink: file.thumbnailLink || null,
  durationSeconds: file.videoMediaMetadata?.durationMillis
    ? Math.round(Number(file.videoMediaMetadata.durationMillis) / 1000)
    : 0,
  modifiedTime: file.modifiedTime || null,
});

const googleProvider = {
  name: 'google',
  async listChildren(folderId = 'root') {
    const json = await driveFetch('/files', {
      q: `'${folderId}' in parents and trashed = false`,
      fields: `files(${FILE_FIELDS}),nextPageToken`,
      orderBy: 'folder,name',
      pageSize: 200,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });
    return (json.files || []).map(normalize);
  },
  async getFile(fileId) {
    const json = await driveFetch(`/files/${encodeURIComponent(fileId)}`, {
      fields: FILE_FIELDS,
      supportsAllDrives: true,
    });
    return normalize(json);
  },
  async streamUrl(fileId) {
    const token = await getAccessToken();
    return {
      url: `${DRIVE_API}/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`,
      headers: { Authorization: `Bearer ${token}` },
    };
  },
};

/* ------------------------------------------------------------------ *
 * Mock provider — a small sample Drive tree so the whole flow can be
 * demoed and tested without Google credentials.
 * ------------------------------------------------------------------ */

const MOCK_FILES = [
  { id: 'root', name: 'Guardians Training Drive', mimeType: FOLDER_MIME, parent: null },
  { id: 'fold-onboarding', name: '01 — New Rep Onboarding', mimeType: FOLDER_MIME, parent: 'root' },
  { id: 'fold-product', name: '02 — Product Knowledge', mimeType: FOLDER_MIME, parent: 'root' },
  { id: 'fold-compliance', name: '03 — Compliance & Ethics', mimeType: FOLDER_MIME, parent: 'root' },
  { id: 'vid-welcome', name: 'Welcome to Guardians.mp4', mimeType: 'video/mp4', parent: 'fold-onboarding', duration: 480 },
  { id: 'vid-crm', name: 'Using the CRM.mp4', mimeType: 'video/mp4', parent: 'fold-onboarding', duration: 720 },
  { id: 'vid-pitch', name: 'The Guardians Pitch.mp4', mimeType: 'video/mp4', parent: 'fold-onboarding', duration: 900 },
  { id: 'doc-handbook', name: 'Rep Handbook.pdf', mimeType: 'application/pdf', parent: 'fold-onboarding' },
  { id: 'vid-catalogue', name: 'Product Catalogue Walkthrough.mp4', mimeType: 'video/mp4', parent: 'fold-product', duration: 1080 },
  { id: 'vid-objections', name: 'Handling Objections.mp4', mimeType: 'video/mp4', parent: 'fold-product', duration: 840 },
  { id: 'vid-privacy', name: 'Data Privacy Essentials.mp4', mimeType: 'video/mp4', parent: 'fold-compliance', duration: 600 },
  { id: 'vid-conduct', name: 'Code of Conduct.mp4', mimeType: 'video/mp4', parent: 'fold-compliance', duration: 540 },
];

const mockNormalize = (file) => ({
  id: file.id,
  name: file.name,
  mimeType: file.mimeType,
  isFolder: file.mimeType === FOLDER_MIME,
  isVideo: isVideo(file.mimeType),
  webViewLink: previewUrl(file.id),
  thumbnailLink: null,
  durationSeconds: file.duration || 0,
  modifiedTime: null,
});

const mockProvider = {
  name: 'mock',
  async listChildren(folderId = 'root') {
    return MOCK_FILES.filter((f) => f.parent === folderId).map(mockNormalize);
  },
  async getFile(fileId) {
    const file = MOCK_FILES.find((f) => f.id === fileId);
    if (!file) throw new HttpError(404, `Drive item "${fileId}" not found`);
    return mockNormalize(file);
  },
  async streamUrl() {
    // No real bytes to serve in mock mode; clients fall back to the preview embed.
    return null;
  },
};

export function getDriveProvider() {
  return config.drive.provider === 'google' ? googleProvider : mockProvider;
}

/**
 * Resolve what an HR BP selected in the Drive browser into lesson material.
 * A folder is expanded into every playable file it contains — that is the
 * "assign an entire folder in one action" requirement.
 */
export async function resolveDriveSelection(driveId) {
  if (!driveId) throw badRequest('A Google Drive file or folder id is required');
  const provider = getDriveProvider();
  const item = await provider.getFile(driveId);

  if (!item.isFolder) {
    return { root: item, kind: 'drive_file', items: [item] };
  }
  const children = await provider.listChildren(item.id);
  const items = children.filter((child) => !child.isFolder);
  if (!items.length) {
    throw badRequest(`Folder "${item.name}" has no files to assign`);
  }
  return { root: item, kind: 'drive_folder', items };
}
