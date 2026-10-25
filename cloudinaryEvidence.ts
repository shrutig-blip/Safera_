/**
 * cloudinaryEvidence.ts
 *
 * Moves Safera's Evidence Vault from local disk (evidence-storage/, which is
 * wiped on every Render redeploy/restart) to Cloudinary, and adds a
 * privacy-safe "share copy" pipeline built on Cloudinary transformations.
 *
 * Two tracks, because the vault is end-to-end encrypted in the browser:
 *
 *  1. VAULT (private, unchanged client flow)
 *     POST /api/evidence/upload   same body as the old route -> stored in
 *     Cloudinary as an `authenticated` RAW asset (ciphertext only). IV, hash,
 *     GPS and timestamp live in Cloudinary context metadata, so the index also
 *     survives restarts. Cloudinary never sees plaintext.
 *
 *  2. SHARE COPY (opt-in, user consents per item)
 *     POST /api/evidence/share    plaintext photo/video/audio -> stored as an
 *     `authenticated` asset. Delivered through GET /e/:token, which verifies a
 *     signed, expiring token and redirects to a signed Cloudinary URL with:
 *       - timestamp + GPS burned into the frame (l_text overlay)
 *       - optional bystander face blur (e_blur_faces, images)
 *       - f_auto / q_auto optimisation, width cap for slow networks
 *
 * Register BEFORE the old /api/evidence/upload route in server.ts so this one
 * wins when Cloudinary is configured, and the old disk route still works as a
 * fallback when it is not.
 */
import crypto from 'crypto';
import type { Express, Request } from 'express';
import { v2 as cloudinary } from 'cloudinary';
import type { UploadApiOptions, UploadApiResponse } from 'cloudinary';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEFAULT_TTL_MIN = 60 * 24; // 24 h
const MAX_TTL_MIN = 60 * 24 * 7; // 7 d

type Kind = 'image' | 'video' | 'audio';

interface ShareToken {
  id: string;
  k: Kind;
  exp: number; // epoch ms
  blur: boolean;
  stamp: string;
}

export function isCloudinaryConfigured(): boolean {
  return Boolean(
    process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET,
  );
}

function uploadBuffer(buf: Buffer, opts: UploadApiOptions): Promise<UploadApiResponse> {
  return new Promise((resolve, reject) => {
    cloudinary.uploader
      .upload_stream(opts, (err, result) => {
        if (err || !result) return reject(err ?? new Error('Cloudinary upload failed'));
        resolve(result);
      })
      .end(buf);
  });
}

function buildStamp(capturedAt: unknown, lat: number | null, lng: number | null): string {
  const parsed = typeof capturedAt === 'string' ? new Date(capturedAt) : new Date();
  const when = (isNaN(parsed.getTime()) ? new Date() : parsed)
    .toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
    .replace(/,/g, ''); // commas break overlay text
  const where = lat !== null && lng !== null ? ` - ${lat.toFixed(5)} ${lng.toFixed(5)}` : '';
  return `Safera ${when} IST${where}`;
}

function baseUrl(req: Request): string {
  if (process.env.PUBLIC_BASE_URL) return process.env.PUBLIC_BASE_URL.replace(/\/$/, '');
  const proto = (req.headers['x-forwarded-proto'] as string | undefined)?.split(',')[0] || req.protocol;
  return `${proto}://${req.get('host')}`;
}

export function registerCloudinaryEvidenceRoutes(app: Express): boolean {
  if (!isCloudinaryConfigured()) {
    console.warn('[cloudinary] CLOUDINARY_* env vars missing - evidence stays on local disk.');
    return false;
  }

  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true,
  });

  const secret = process.env.SHARE_LINK_SECRET || (process.env.CLOUDINARY_API_SECRET as string);

  const signToken = (payload: ShareToken): string => {
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const sig = crypto.createHmac('sha256', secret).update(body).digest('base64url');
    return `${body}.${sig}`;
  };

  const verifyToken = (token: string): ShareToken | null => {
    const [body, sig] = token.split('.');
    if (!body || !sig) return null;
    const expected = crypto.createHmac('sha256', secret).update(body).digest('base64url');
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    try {
      const payload = JSON.parse(Buffer.from(body, 'base64url').toString()) as ShareToken;
      if (!UUID_RE.test(payload.id) || Date.now() > payload.exp) return null;
      return payload;
    } catch {
      return null;
    }
  };

  // ---------------------------------------------------------------- VAULT --
  // Drop-in replacement for the old disk-based /api/evidence/upload.
  app.post('/api/evidence/upload', async (req, res) => {
    try {
      const { fileName, mimeType, encryptedBase64, ivBase64, sha256Hash, capturedAt, lat, lng } = req.body || {};
      if (typeof encryptedBase64 !== 'string' || typeof ivBase64 !== 'string' || typeof sha256Hash !== 'string') {
        return res.status(400).json({ error: 'encryptedBase64, ivBase64 and sha256Hash (strings) are required' });
      }
      const id = crypto.randomUUID();
      const buf = Buffer.from(encryptedBase64, 'base64');
      const storedAt = new Date().toISOString();

      await uploadBuffer(buf, {
        resource_type: 'raw',
        type: 'authenticated',
        public_id: `safera/vault/${id}.enc`,
        overwrite: false,
        tags: ['safera', 'vault'],
        context: {
          iv: ivBase64,
          sha256: sha256Hash,
          mime: typeof mimeType === 'string' ? mimeType : 'video/webm',
          file: typeof fileName === 'string' ? fileName : `evidence-${id}.enc`,
          captured: typeof capturedAt === 'string' ? capturedAt : storedAt,
          lat: typeof lat === 'number' ? String(lat) : '',
          lng: typeof lng === 'number' ? String(lng) : '',
          stored: storedAt,
        },
      });

      return res.status(201).json({ id, sizeBytes: buf.length, storedAt, storage: 'cloudinary' });
    } catch (error: any) {
      console.error('Error in cloudinary vault upload:', error);
      return res.status(500).json({ error: error?.message || 'Evidence upload failed' });
    }
  });

  const toRecord = (r: any) => {
    const c = (r.context?.custom ?? {}) as Record<string, string>;
    const id = String(r.public_id).replace(/^safera\/vault\//, '').replace(/\.enc$/, '');
    return {
      id,
      fileName: c.file,
      mimeType: c.mime,
      sha256Hash: c.sha256,
      ivBase64: c.iv,
      capturedAt: c.captured,
      storedAt: c.stored,
      lat: c.lat ? Number(c.lat) : null,
      lng: c.lng ? Number(c.lng) : null,
      sizeBytes: r.bytes as number,
    };
  };

  // List vault items (replaces the in-memory index that reset on every restart).
  app.get('/api/evidence/vault', async (_req, res) => {
    try {
      const r: any = await cloudinary.api.resources({
        resource_type: 'raw',
        type: 'authenticated',
        prefix: 'safera/vault/',
        context: true,
        max_results: 100,
      });
      return res.json({ items: (r.resources ?? []).map(toRecord) });
    } catch (error: any) {
      console.error('Error listing vault:', error);
      return res.status(500).json({ error: error?.message || 'Could not list evidence' });
    }
  });

  // One item: metadata + a signed URL for the ciphertext. Client decrypts locally.
  app.get('/api/evidence/vault/:id', async (req, res) => {
    try {
      if (!UUID_RE.test(req.params.id)) return res.status(400).json({ error: 'Invalid id' });
      const publicId = `safera/vault/${req.params.id}.enc`;
      const r: any = await cloudinary.api.resource(publicId, {
        resource_type: 'raw',
        type: 'authenticated',
        context: true,
      });
      const downloadUrl = cloudinary.url(publicId, {
        resource_type: 'raw',
        type: 'authenticated',
        sign_url: true,
        secure: true,
      });
      return res.json({ ...toRecord(r), downloadUrl });
    } catch (error: any) {
      const notFound = error?.http_code === 404;
      return res.status(notFound ? 404 : 500).json({ error: notFound ? 'Not found' : error?.message || 'Failed' });
    }
  });

  // ---------------------------------------------------------- SHARE COPY --
  app.post('/api/evidence/share', async (req, res) => {
    try {
      const { fileName, mimeType, base64, capturedAt, lat, lng, blurFaces, ttlMinutes } = req.body || {};
      if (typeof base64 !== 'string' || typeof mimeType !== 'string') {
        return res.status(400).json({ error: 'base64 and mimeType (strings) are required' });
      }
      const kind: Kind | null = mimeType.startsWith('image/')
        ? 'image'
        : mimeType.startsWith('video/')
          ? 'video'
          : mimeType.startsWith('audio/')
            ? 'audio'
            : null;
      if (!kind) return res.status(400).json({ error: 'Only image, video or audio can be shared' });

      const latN = typeof lat === 'number' ? lat : null;
      const lngN = typeof lng === 'number' ? lng : null;
      const id = crypto.randomUUID();
      const ttl = Math.min(Math.max(Number(ttlMinutes) || DEFAULT_TTL_MIN, 5), MAX_TTL_MIN);
      const exp = Date.now() + ttl * 60 * 1000;
      const stamp = buildStamp(capturedAt, latN, lngN);

      await uploadBuffer(Buffer.from(base64, 'base64'), {
        // Cloudinary stores audio under the "video" resource type.
        resource_type: kind === 'image' ? 'image' : 'video',
        type: 'authenticated',
        public_id: `safera/shared/${id}`,
        tags: ['safera', 'shared'],
        context: { file: typeof fileName === 'string' ? fileName : id, stamp },
      });

      const token = signToken({ id, k: kind, exp, blur: kind === 'image' && blurFaces === true, stamp });
      const link = `${baseUrl(req)}/e/${token}`;
      return res.status(201).json({
        id,
        kind,
        link,
        thumbnailLink: kind === 'video' ? `${link}?thumb=1` : undefined,
        expiresAt: new Date(exp).toISOString(),
        facesBlurred: kind === 'image' && blurFaces === true,
      });
    } catch (error: any) {
      console.error('Error in evidence share:', error);
      return res.status(500).json({ error: error?.message || 'Share copy failed' });
    }
  });

  // Token-gated delivery: verify, then redirect to a freshly signed Cloudinary URL.
  app.get('/e/:token', (req, res) => {
    const p = verifyToken(req.params.token);
    if (!p) return res.status(410).send('This evidence link is invalid or has expired.');

    const publicId = `safera/shared/${p.id}`;
    const rt = p.k === 'image' ? 'image' : 'video';
    const wantThumb = req.query.thumb === '1' && p.k === 'video';

    const transformation: any[] = [];
    if (p.k === 'image' && p.blur) transformation.push({ effect: 'blur_faces:800' });
    if (p.k !== 'audio') {
      transformation.push({ width: wantThumb ? 480 : 1280, crop: 'limit' });
      if (!wantThumb) {
        transformation.push({
          overlay: { font_family: 'Arial', font_size: 24, font_weight: 'bold', text: p.stamp },
          color: 'white',
          background: 'rgb:000000b3',
          gravity: 'south_west',
          x: 12,
          y: 12,
        });
      }
      transformation.push({ quality: 'auto' });
    }

    const url = cloudinary.url(publicId, {
      resource_type: rt,
      type: 'authenticated',
      sign_url: true,
      secure: true,
      transformation,
      ...(p.k === 'image' ? { fetch_format: 'auto' } : {}),
      ...(wantThumb ? { format: 'jpg', start_offset: '0' } : p.k === 'video' ? { format: 'mp4' } : {}),
    });

    res.set('Cache-Control', 'no-store');
    return res.redirect(302, url);
  });

  console.log('[cloudinary] Evidence vault + share-copy routes registered.');
  return true;
}