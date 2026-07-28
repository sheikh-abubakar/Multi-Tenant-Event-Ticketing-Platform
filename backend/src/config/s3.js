const { S3Client } = require("@aws-sdk/client-s3");

// Credentials are deliberately not passed here. AWS SDK v3 uses its default
// credential provider chain: local AWS_* environment variables during
// development, and an IAM role when the backend is deployed on AWS.
const s3 = new S3Client({ region: process.env.AWS_REGION });

module.exports = s3;
