'use strict';

const { DynamoDBClient }                        = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand, PutCommand } = require('@aws-sdk/lib-dynamodb');

const ddb   = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TABLE = process.env.IDEMPOTENCY_TABLE;

// ─────────────────────────────────────────────────────────────────────────────
// Handler
// ─────────────────────────────────────────────────────────────────────────────
exports.handler = async (event) => {
    const correlationId = event.headers?.['X-Correlation-Id']
        || event.headers?.['x-correlation-id']
        || generateId();

    const idempotencyKey = event.headers?.['Idempotency-Key']
        || event.headers?.['idempotency-key'];

    log('info', 'received', { correlationId, idempotencyKey });

    // Validate required header
    if (!idempotencyKey) {
        return problem(400, 'missing-idempotency-key',
            'Idempotency-Key header is required', correlationId);
    }

    // Parse and validate body
    let body;
    try {
        body = JSON.parse(event.body || '{}');
    } catch (e) {
        return problem(400, 'invalid-json', 'Body is not valid JSON', correlationId);
    }

    const errors = validate(body);
    if (errors.length) {
        return problem(400, 'validation-failed', errors.join('; '), correlationId);
    }

    // Idempotency check — return cached response if key already exists
    try {
        const existing = await ddb.send(new GetCommand({
            TableName: TABLE,
            Key: { idempotencyKey }
        }));

        if (existing.Item) {
            log('info', 'replay', { correlationId, idempotencyKey });
            return {
                statusCode: existing.Item.statusCode,
                headers: {
                    'Content-Type': 'application/json',
                    'X-Correlation-Id': correlationId
                },
                body: existing.Item.responseBody
            };
        }
    } catch (e) {
        log('error', 'ddb get failed', { correlationId, error: e.message });
        return problem(503, 'storage-unavailable', 'Storage check failed', correlationId);
    }

    // Build enrolment record
    const now = new Date().toISOString();
    const enrolment = {
        id: `enr_${Date.now()}`,
        ...body,
        status:    'pending',
        createdAt: now,
        updatedAt: now
    };

    const responseBody = JSON.stringify(enrolment);

    // Persist to DynamoDB — cache response for 24 h idempotency replay
    try {
        await ddb.send(new PutCommand({
            TableName: TABLE,
            Item: {
                idempotencyKey,
                statusCode:   201,
                responseBody,
                correlationId,
                createdAt:    Date.now(),
                ttl:          Math.floor(Date.now() / 1000) + 86400
            }
        }));
    } catch (e) {
        log('error', 'ddb put failed', { correlationId, error: e.message });
        return problem(503, 'storage-unavailable', 'Failed to persist enrolment', correlationId);
    }

    log('info', 'created', { correlationId, enrolmentId: enrolment.id });

    return {
        statusCode: 201,
        headers: {
            'Content-Type':    'application/json',
            'X-Correlation-Id': correlationId
        },
        body: responseBody
    };
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function validate(body) {
    const errs = [];
    if (!body.firstName)           errs.push('firstName required');
    if (!body.lastName)            errs.push('lastName required');
    if (!body.email)               errs.push('email required');
    if (!body.dateOfBirth)         errs.push('dateOfBirth required');
    if (body.consentGiven !== true) errs.push('consent required');
    return errs;
}

function problem(status, type, detail, correlationId) {
    return {
        statusCode: status,
        headers: {
            'Content-Type':    'application/problem+json',
            'X-Correlation-Id': correlationId
        },
        body: JSON.stringify({
            type:   `https://api.edutechco.com/errors/${type}`,
            title:  type.replace(/-/g, ' '),
            status,
            detail,
            correlationId
        })
    };
}

function log(level, msg, fields) {
    console.log(JSON.stringify({
        level,
        msg,
        ...fields,
        timestamp: new Date().toISOString()
    }));
}

function generateId() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0;
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
}
