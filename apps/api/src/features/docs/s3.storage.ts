import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export type S3StorageConfig = {
  region: string;
  endpoint?: string;
  forcePathStyle: boolean;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
};

export function createS3Storage(config: S3StorageConfig) {
  const client = new S3Client({
    region: config.region,
    endpoint: config.endpoint,
    forcePathStyle: config.forcePathStyle,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });

  async function ensureBucket(): Promise<void> {
    try {
      await client.send(new HeadBucketCommand({ Bucket: config.bucket }));
    } catch {
      await client.send(new CreateBucketCommand({ Bucket: config.bucket }));
    }
  }

  async function presignPutObject(input: {
    objectKey: string;
    contentType: string;
    expiresSeconds: number;
  }): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: config.bucket,
      Key: input.objectKey,
      ContentType: input.contentType,
    });

    return getSignedUrl(client, command, { expiresIn: input.expiresSeconds });
  }

  async function deleteObject(objectKey: string): Promise<void> {
    await client.send(
      new DeleteObjectCommand({
        Bucket: config.bucket,
        Key: objectKey,
      }),
    );
  }

  async function getObjectBuffer(objectKey: string): Promise<{ buffer: Buffer; contentType: string }> {
    const response = await client.send(
      new GetObjectCommand({
        Bucket: config.bucket,
        Key: objectKey,
      }),
    );

    const body = response.Body;
    if (!body) {
      throw new Error("S3 object body is empty");
    }

    const buffer = Buffer.from(await body.transformToByteArray());
    const contentType = response.ContentType ?? "application/octet-stream";
    return { buffer, contentType };
  }

  return {
    bucket: config.bucket,
    ensureBucket,
    presignPutObject,
    deleteObject,
    getObjectBuffer,
  };
}

export type S3Storage = ReturnType<typeof createS3Storage>;
