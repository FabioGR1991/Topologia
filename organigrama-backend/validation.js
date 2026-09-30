const { z } = require('zod');

const positiveId = z.number().int().positive().safe();
const coordinate = z.number().finite().min(-100000).max(100000);

function isHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

const optionalEmail = z.preprocess(
  (value) => typeof value === 'string' && value.trim() === '' ? null : value,
  z.string().trim().email().max(254).nullable().optional()
).transform((value) => value ?? null);

const optionalPhotoUrl = z.preprocess(
  (value) => typeof value === 'string' && value.trim() === '' ? null : value,
  z.string().trim().max(2048).refine(isHttpUrl, 'Debe ser una URL HTTP(S)').nullable().optional()
).transform((value) => value ?? null);

const stringList = z.array(z.string().trim().min(1).max(200)).max(100).default([]);

const userSchema = z.object({
  name: z.string().trim().min(1).max(160),
  role: z.string().trim().min(1).max(160),
  department: z.string().trim().min(1).max(160),
  photoUrl: optionalPhotoUrl,
  email: optionalEmail,
  functions: stringList,
  permissions: stringList,
  reportsToId: positiveId.nullable().default(null),
  positionX: coordinate.default(100),
  positionY: coordinate.default(100),
}).strict();

const positionBatchSchema = z.object({
  nodes: z.array(z.object({
    id: positiveId,
    x: coordinate,
    y: coordinate,
  }).strict()).min(1).max(500),
}).strict();

const relationshipsSchema = z.object({
  relationships: z.array(z.object({
    userId: positiveId,
    reportsToId: positiveId.nullable(),
  }).strict()).min(1).max(500),
}).strict();

function parse(schema, value) {
  const result = schema.safeParse(value);
  if (result.success) return result.data;

  const error = new Error('Solicitud inválida');
  error.statusCode = 400;
  error.details = result.error.issues.map((issue) => ({
    field: issue.path.join('.'),
    rule: issue.code,
  }));
  throw error;
}

function parseUserId(value) {
  const result = z.coerce.number().int().positive().safe().safeParse(value);
  if (result.success) return result.data;

  const error = new Error('Identificador inválido');
  error.statusCode = 400;
  throw error;
}

module.exports = {
  parse,
  parseUserId,
  positionBatchSchema,
  relationshipsSchema,
  userSchema,
};