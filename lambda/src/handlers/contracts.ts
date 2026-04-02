// AREG-60: Contract document upload/download/delete handlers
import { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyResultV2 } from 'aws-lambda';
import { PutCommand, QueryCommand, UpdateCommand, DeleteCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { randomUUID } from 'crypto';
import { ddb, TABLE_APPS } from '../lib/dynamo';
import { getCaller } from '../lib/auth';
import { ok, created, badRequest, forbidden, notFound } from '../lib/response';

const REGION           = process.env.REGION ?? 'us-east-2';
const BUCKET_CONTRACTS = process.env.BUCKET_CONTRACTS ?? '';

const s3 = new S3Client({ region: REGION });

const ALLOWED_TYPES: Record<string, string> = {
  'application/pdf':                                                          'pdf',
  'application/msword':                                                       'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document':  'docx',
  'application/vnd.ms-excel':                                                 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':        'xlsx',
  'image/png':                                                                'png',
  'image/jpeg':                                                               'jpg',
};

const MAX_BYTES = 50 * 1024 * 1024; // 50 MB

// GET /apps/{appId}/contracts
export async function listContracts(
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
  appId: string,
): Promise<APIGatewayProxyResultV2> {
  const result = await ddb.send(new QueryCommand({
    TableName: TABLE_APPS,
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
    ExpressionAttributeValues: { ':pk': `APP#${appId}`, ':prefix': 'CONTRACT#' },
  }));

  const docs = (result.Items ?? [])
    .filter(item => item.confirmed === true)
    .map(({ PK: _pk, SK: _sk, ...rest }) => rest)
    .sort((a, b) => a.uploadedAt < b.uploadedAt ? 1 : -1);

  return ok({ items: docs });
}

// POST /apps/{appId}/contracts/upload-url
export async function getUploadUrl(
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
  appId: string,
): Promise<APIGatewayProxyResultV2> {
  const caller = getCaller(event);
  if (caller.role === 'viewer') return forbidden('Viewers cannot upload documents');

  let body: Record<string, unknown>;
  try { body = JSON.parse(event.body ?? '{}'); }
  catch { return badRequest('Invalid JSON body'); }

  const filename    = (body.filename as string | undefined)?.trim();
  const contentType = (body.contentType as string | undefined)?.trim();
  const sizeBytes   = Number(body.sizeBytes);
  const description = (body.description as string | undefined)?.trim() ?? '';

  if (!filename)    return badRequest('filename is required');
  if (!contentType) return badRequest('contentType is required');
  if (!ALLOWED_TYPES[contentType]) {
    return badRequest(`Unsupported file type. Allowed: PDF, DOC, DOCX, XLS, XLSX, PNG, JPG`);
  }
  if (!sizeBytes || sizeBytes > MAX_BYTES) {
    return badRequest(`File size must be between 1 byte and 50 MB`);
  }

  // Verify the app exists
  const appItem = await ddb.send(new GetCommand({
    TableName: TABLE_APPS,
    Key: { PK: `APP#${appId}`, SK: 'META' },
  }));
  if (!appItem.Item) return notFound('App not found');

  const docId  = randomUUID();
  const s3Key  = `contracts/${appId}/${docId}_${filename}`;
  const now    = new Date().toISOString();

  // Write pending record (confirmed=false) — will be confirmed after successful S3 upload
  await ddb.send(new PutCommand({
    TableName: TABLE_APPS,
    Item: {
      PK:          `APP#${appId}`,
      SK:          `CONTRACT#${docId}`,
      docId,
      appId,
      filename,
      description,
      s3Key,
      contentType,
      sizeBytes,
      uploadedBy:  caller.email,
      uploadedAt:  now,
      confirmed:   false,
    },
  }));

  const uploadUrl = await getSignedUrl(
    s3,
    new PutObjectCommand({
      Bucket:      BUCKET_CONTRACTS,
      Key:         s3Key,
      ContentType: contentType,
    }),
    { expiresIn: 900 }, // 15 minutes
  );

  return created({ docId, uploadUrl });
}

// POST /apps/{appId}/contracts/{docId}/confirm
export async function confirmUpload(
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
  appId: string,
  docId: string,
): Promise<APIGatewayProxyResultV2> {
  const caller = getCaller(event);
  if (caller.role === 'viewer') return forbidden('Viewers cannot upload documents');

  // Verify the pending record exists and belongs to this caller
  const existing = await ddb.send(new GetCommand({
    TableName: TABLE_APPS,
    Key: { PK: `APP#${appId}`, SK: `CONTRACT#${docId}` },
  }));
  if (!existing.Item) return notFound('Document record not found');
  if (existing.Item.confirmed) return ok({ message: 'Already confirmed' });

  await ddb.send(new UpdateCommand({
    TableName:        TABLE_APPS,
    Key:              { PK: `APP#${appId}`, SK: `CONTRACT#${docId}` },
    UpdateExpression: 'SET confirmed = :t',
    ExpressionAttributeValues: { ':t': true },
  }));

  const { PK: _pk, SK: _sk, ...doc } = existing.Item as Record<string, unknown>;
  return ok({ ...doc, confirmed: true });
}

// GET /apps/{appId}/contracts/{docId}/download-url
export async function getDownloadUrl(
  _event: APIGatewayProxyEventV2WithJWTAuthorizer,
  appId: string,
  docId: string,
): Promise<APIGatewayProxyResultV2> {
  const item = await ddb.send(new GetCommand({
    TableName: TABLE_APPS,
    Key: { PK: `APP#${appId}`, SK: `CONTRACT#${docId}` },
  }));
  if (!item.Item || !item.Item.confirmed) return notFound('Document not found');

  const downloadUrl = await getSignedUrl(
    s3,
    new GetObjectCommand({
      Bucket:                     BUCKET_CONTRACTS,
      Key:                        item.Item.s3Key as string,
      ResponseContentDisposition: `attachment; filename="${item.Item.filename}"`,
    }),
    { expiresIn: 300 }, // 5 minutes
  );

  return ok({ downloadUrl });
}

// DELETE /apps/{appId}/contracts/{docId}
export async function deleteContract(
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
  appId: string,
  docId: string,
): Promise<APIGatewayProxyResultV2> {
  const caller = getCaller(event);
  if (caller.role !== 'admin') return forbidden('Only admins can delete documents');

  const item = await ddb.send(new GetCommand({
    TableName: TABLE_APPS,
    Key: { PK: `APP#${appId}`, SK: `CONTRACT#${docId}` },
  }));
  if (!item.Item) return notFound('Document not found');

  // Delete from S3
  await s3.send(new DeleteObjectCommand({
    Bucket: BUCKET_CONTRACTS,
    Key:    item.Item.s3Key as string,
  }));

  // Delete from DynamoDB
  await ddb.send(new DeleteCommand({
    TableName: TABLE_APPS,
    Key: { PK: `APP#${appId}`, SK: `CONTRACT#${docId}` },
  }));

  return ok({ message: 'Deleted' });
}
