# S3 uploads bucket (Terraform)

Small stack that creates one private S3 bucket for file uploads (encryption at rest, public access blocked, optional versioning).

## Prerequisites

- [Terraform](https://developer.hashicorp.com/terraform/install) >= 1.3
- [AWS CLI](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html) v2 (optional, for manual uploads)
- AWS credentials with permission to create S3 buckets (for example `AdministratorAccess` in a dev account, or a tighter custom policy)

Configure credentials (one of):

- Environment variables: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, optional `AWS_SESSION_TOKEN`
- Or `aws configure` to set a profile, then `export AWS_PROFILE=your-profile` (macOS/Linux) or `set AWS_PROFILE=your-profile` (Windows CMD)

## Commands

From the repository root:

```bash
cd infra
terraform init
terraform plan
terraform apply
```

After apply, note `bucket_name` from the output (or run `terraform output bucket_name`).

### Upload a test file (AWS CLI)

Replace `YOUR_BUCKET` with the output bucket name:

```bash
aws s3 cp ./README.md s3://YOUR_BUCKET/test/README.md
aws s3 ls s3://YOUR_BUCKET/test/
```

### Tear down

```bash
cd infra
terraform destroy
```

## Optional: tfvars

Copy `terraform.tfvars.example` to `terraform.tfvars` and edit (local file; ignored by git). Then `terraform plan` / `apply` pick it up automatically.
