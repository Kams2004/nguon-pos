package com.nguonpos.catalog.media;

import io.minio.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.io.InputStream;

/**
 * MinIO (S3-compatible) object storage for uploaded images. The bucket is
 * public-read only: nginx serves its objects under /media/ so tickets,
 * receipts and the login page can show them without a token; writes and
 * deletes only ever happen here, behind SUPER_ADMIN.
 */
@Component
public class MediaStorage {

    private final MinioClient client;
    private final String bucket;
    private volatile boolean bucketReady = false;

    public MediaStorage(
            @Value("${media.minio.endpoint}") String endpoint,
            @Value("${media.minio.access-key}") String accessKey,
            @Value("${media.minio.secret-key}") String secretKey,
            @Value("${media.minio.bucket}") String bucket
    ) {
        this.client = MinioClient.builder().endpoint(endpoint).credentials(accessKey, secretKey).build();
        this.bucket = bucket;
    }

    public String bucket() {
        return bucket;
    }

    public void put(String objectKey, InputStream data, long size, String contentType) throws Exception {
        ensureBucket();
        client.putObject(PutObjectArgs.builder()
                .bucket(bucket).object(objectKey).stream(data, size, -1).contentType(contentType).build());
    }

    public void remove(String objectKey) throws Exception {
        ensureBucket();
        client.removeObject(RemoveObjectArgs.builder().bucket(bucket).object(objectKey).build());
    }

    // Lazily, not at startup: MinIO may still be booting when this service
    // starts, and nothing needs the bucket until the first upload.
    private synchronized void ensureBucket() throws Exception {
        if (bucketReady) return;
        if (!client.bucketExists(BucketExistsArgs.builder().bucket(bucket).build())) {
            client.makeBucket(MakeBucketArgs.builder().bucket(bucket).build());
        }
        String policy = """
                {"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"AWS":["*"]},
                "Action":["s3:GetObject"],"Resource":["arn:aws:s3:::%s/*"]}]}
                """.formatted(bucket);
        client.setBucketPolicy(SetBucketPolicyArgs.builder().bucket(bucket).config(policy).build());
        bucketReady = true;
    }
}
